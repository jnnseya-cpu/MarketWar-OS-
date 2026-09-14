// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// A MINIMAL IMAP READER — just enough to collect delivery failures.
//
// WHY THIS EXISTS. Every part of receiving mail was built except the part that
// receives: classification, brand routing, the suppression ledger and the Inbox
// all hang off `/api/inbound/email`, an HTTP webhook that a mail node has to POST
// to. No such node exists on this deployment, so nothing ever arrived, and the
// only way to find out why a message failed was to open the mailbox by hand.
//
// That is not a platform. A customer with a thousand senders is not opening a
// mailbox, and the owner said so. The bounce mailbox ALREADY receives every
// failure notice — the envelope sender points at it — so the missing piece is not
// infrastructure, it is a reader. This is the reader.
//
// WHY HAND-ROLLED. This repository has no mail dependency; SMTP is a raw socket
// state machine in `backend/email.ts` and adding an IMAP package for one job
// would put a second style beside it. The subset needed here is small: log in,
// select a folder, find what has not been read, fetch it, mark it read.
//
// WHAT IT DELIBERATELY DOES NOT DO. No IDLE, no partial fetch, no folder
// management, no MIME tree walking beyond the first text part. A delivery status
// notification is a small message and the parts of it that matter — the failed
// recipient and the server's reason — are in the headers and the first text
// section. Anything more elaborate is a second implementation of a mail client,
// which is not what this platform is for.

import tls from "tls";

export type ImapConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  /** Which folder to read. Almost always INBOX. */
  mailbox?: string;
};

export type ImapMessage = {
  uid: string;
  /** Raw RFC 822 source, headers and body together. */
  raw: string;
};

/** Is a mailbox collector configured at all? */
export const imapConfigured = (): boolean =>
  Boolean((process.env.MW_BOUNCE_IMAP_HOST || "").trim() && imapCredentials().user && imapCredentials().pass);

/**
 * The mailbox to read, and the credentials for it.
 *
 * FALLS BACK TO THE SENDING ACCOUNT ON PURPOSE. The envelope sender defaults to
 * the authenticated account (see `resolveSender`), so unless a separate bounce
 * address is configured, the failure notices are already arriving in the SMTP
 * mailbox — the same user and password this deployment already has. Requiring a
 * second set of credentials to read a mailbox we already sign into would be
 * asking for configuration that buys nothing.
 */
export function imapCredentials(): { host: string; port: number; user: string; pass: string; mailbox: string } {
  const host = (process.env.MW_BOUNCE_IMAP_HOST || "").trim();
  const port = Number((process.env.MW_BOUNCE_IMAP_PORT || "993").trim()) || 993;
  const user = (process.env.MW_BOUNCE_IMAP_USER || process.env.SMTP_USER || "").trim();
  const pass = (process.env.MW_BOUNCE_IMAP_PASS || process.env.SMTP_PASS || "").trim();
  const mailbox = (process.env.MW_BOUNCE_IMAP_MAILBOX || "INBOX").trim();
  return { host, port, user, pass, mailbox };
}

/** An IMAP string literal, quoted and escaped. A password may contain either. */
const quoted = (s: string): string => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/**
 * Fetch unread messages, newest last, and mark them read.
 *
 * `limit` bounds a single run: a mailbox with a year of notices in it must not
 * turn one scheduled call into a timeout, and what is left is simply collected on
 * the next run — the messages stay unread until they are actually processed.
 */
export async function fetchUnread(cfg: ImapConfig, limit = 50, timeoutMs = 20_000): Promise<ImapMessage[]> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host });
    let buffer = "";
    let tag = 0;
    let stage: "greet" | "login" | "select" | "search" | "fetch" | "store" | "done" = "greet";
    let uids: string[] = [];
    let fetching = 0;
    const out: ImapMessage[] = [];
    let settled = false;

    const finish = (err: Error | null, msgs: ImapMessage[] = []) => {
      if (settled) return;
      settled = true;
      try { socket.end(); } catch { /* already gone */ }
      if (err) reject(err); else resolve(msgs);
    };

    const send = (cmd: string): string => {
      const t = `a${++tag}`;
      socket.write(`${t} ${cmd}\r\n`);
      return t;
    };

    socket.setTimeout(timeoutMs, () => finish(new Error(`imap: no response within ${timeoutMs}ms`)));
    socket.on("error", (e) => finish(e instanceof Error ? e : new Error(String(e))));

    socket.on("data", (chunk) => {
      buffer += chunk.toString("binary");

      // A tagged completion line ends every command. Untagged `*` lines are data.
      const done = (t: string): "ok" | "no" | null => {
        const m = new RegExp(`^${t} (OK|NO|BAD)([^\\r\\n]*)`, "m").exec(buffer);
        if (!m) return null;
        return m[1] === "OK" ? "ok" : "no";
      };

      if (stage === "greet") {
        if (!/^\* (OK|PREAUTH)/m.test(buffer)) return;
        buffer = "";
        stage = "login";
        loginTag = send(`LOGIN ${quoted(cfg.user)} ${quoted(cfg.pass)}`);
        return;
      }

      if (stage === "login") {
        const r = done(loginTag);
        if (!r) return;
        if (r === "no") return finish(new Error("imap: the server refused the login for this mailbox"));
        buffer = "";
        stage = "select";
        selectTag = send(`SELECT ${quoted(cfg.mailbox || "INBOX")}`);
        return;
      }

      if (stage === "select") {
        const r = done(selectTag);
        if (!r) return;
        if (r === "no") return finish(new Error(`imap: cannot open the mailbox "${cfg.mailbox || "INBOX"}"`));
        buffer = "";
        stage = "search";
        searchTag = send("UID SEARCH UNSEEN");
        return;
      }

      if (stage === "search") {
        const r = done(searchTag);
        if (!r) return;
        const line = /^\* SEARCH([^\r\n]*)/m.exec(buffer);
        uids = (line?.[1] || "").trim().split(/\s+/).filter(Boolean).slice(0, limit);
        buffer = "";
        if (!uids.length) { stage = "done"; return finish(null, []); }
        stage = "fetch";
        fetching = 0;
        fetchTag = send(`UID FETCH ${uids[fetching]} (BODY.PEEK[])`);
        return;
      }

      if (stage === "fetch") {
        // A literal is announced as `{nnn}` and followed by exactly nnn bytes.
        // Waiting for the tagged OK is not enough on its own — the octet count is
        // what says the body is complete, and a message containing the tag text
        // would otherwise cut it short.
        const lit = /\{(\d+)\}\r\n/.exec(buffer);
        if (lit) {
          const start = lit.index + lit[0].length;
          const need = Number(lit[1]);
          if (buffer.length - start < need) return; // more to come
          const raw = Buffer.from(buffer.slice(start, start + need), "binary").toString("utf8");
          out.push({ uid: uids[fetching], raw });
        }
        const r = done(fetchTag);
        if (!r) return;
        buffer = "";
        fetching += 1;
        if (fetching < uids.length) {
          fetchTag = send(`UID FETCH ${uids[fetching]} (BODY.PEEK[])`);
          return;
        }
        stage = "store";
        // MARKED READ ONLY AFTER EVERY MESSAGE IS IN HAND. Marking as we went
        // would lose a notice for good if the connection died half way, and a
        // delivery failure nobody ever sees is the defect this whole file exists
        // to fix.
        storeTag = send(`UID STORE ${uids.join(",")} +FLAGS (\\Seen)`);
        return;
      }

      if (stage === "store") {
        const r = done(storeTag);
        if (!r) return;
        stage = "done";
        finish(null, out);
      }
    });

    let loginTag = "", selectTag = "", searchTag = "", fetchTag = "", storeTag = "";
  });
}

/**
 * The fields the router needs, out of a raw RFC 822 message.
 *
 * Deliberately shallow: headers, then the first text section. A DSN carries the
 * failed recipient and the remote server's own sentence in that text, which is
 * everything the suppression rule reads.
 */
export function parseRawMessage(raw: string): {
  from: string; to: string; subject: string; text: string; headers: Record<string, string>; date: string;
} {
  const split = raw.indexOf("\r\n\r\n") >= 0 ? raw.indexOf("\r\n\r\n") : raw.indexOf("\n\n");
  const headerBlock = split > 0 ? raw.slice(0, split) : raw;
  const body = split > 0 ? raw.slice(split).replace(/^[\r\n]+/, "") : "";

  const headers: Record<string, string> = {};
  // Unfold continuation lines first — a header may legally wrap, and reading only
  // the first line of a wrapped Return-Path loses the address.
  for (const line of headerBlock.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at > 0) headers[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim();
  }

  return {
    from: headers["from"] || "",
    // `Delivered-To` / `X-Original-To` name the mailbox that actually received
    // it, which for a VERP bounce is the address carrying the brand — `To:` on a
    // failure notice is often the envelope sender rewritten by the reporting
    // server, so the original is preferred where it exists.
    to: headers["x-original-to"] || headers["delivered-to"] || headers["to"] || "",
    subject: headers["subject"] || "",
    text: body.slice(0, 20_000),
    headers,
    date: headers["date"] || "",
  };
}

// ---------------------------------------------------------------------------
// A SESSION RUNNER, FOR THE QUESTION `fetchUnread` CANNOT ASK.
// ---------------------------------------------------------------------------
//
// Placement measurement (shared/placement.ts) needs something the collector
// above deliberately does not do: look for ONE known message across SEVERAL
// folders, read Gmail's category labels, and touch nothing — a seed mailbox that
// gets marked read by the act of measuring it is a mailbox whose next
// measurement is different because we looked.
//
// `fetchUnread` is working code with one job, and its job is not this one.
// Rather than teach it a mode — which is how a function ends up with two
// behaviours and one set of tests — this adds the primitive both could have been
// written on: run tagged IMAP commands over one authenticated connection and
// hand back what the server said.
//
// THE LITERAL IS THE WHOLE DIFFICULTY. IMAP announces a payload as `{123}` and
// then sends exactly 123 bytes, which may contain anything at all — including
// text that looks exactly like a tagged completion line. So completion is
// decided by WALKING the buffer and skipping every announced literal, never by
// searching for the tag. Getting this wrong truncates a message body at whatever
// point it happens to mention the tag, which is the kind of bug that only shows
// up on somebody else's mail.

export type ImapReply = { ok: boolean; text: string };

/** Has the reply to `tag` fully arrived, literals and all? Returns its length, or -1. */
function completeAt(buffer: string, tag: string): number {
  let i = 0;
  const done = new RegExp(`^${tag} (OK|NO|BAD)`, "i");
  while (i < buffer.length) {
    const nl = buffer.indexOf("\r\n", i);
    if (nl === -1) return -1;
    const line = buffer.slice(i, nl);
    const lit = /\{(\d+)\}$/.exec(line);
    if (lit) {
      const start = nl + 2;
      const need = Number(lit[1]);
      if (buffer.length < start + need) return -1; // the payload is still arriving
      i = start + need;
      continue;
    }
    if (done.test(line)) return nl + 2;
    i = nl + 2;
  }
  return -1;
}

export async function imapSession<T>(
  cfg: ImapConfig,
  run: (exec: (cmd: string) => Promise<ImapReply>) => Promise<T>,
  timeoutMs = 25_000,
): Promise<T> {
  const socket = tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host });
  let buffer = "";
  let tagN = 0;
  let waiter: ((r: ImapReply) => void) | null = null;
  let waitTag = "";
  let failed: Error | null = null;

  const fail = (e: Error) => {
    failed = e;
    if (waiter) { const w = waiter; waiter = null; w({ ok: false, text: e.message }); }
  };

  socket.setTimeout(timeoutMs, () => fail(new Error(`imap: no response within ${timeoutMs}ms`)));
  socket.on("error", (e) => fail(e instanceof Error ? e : new Error(String(e))));
  socket.on("data", (chunk) => {
    buffer += chunk.toString("binary");
    if (!waiter) return;
    const end = completeAt(buffer, waitTag);
    if (end === -1) return;
    const text = Buffer.from(buffer.slice(0, end), "binary").toString("utf8");
    buffer = buffer.slice(end);
    const w = waiter; waiter = null;
    w({ ok: new RegExp(`^${waitTag} OK`, "im").test(text), text });
  });

  const exec = (cmd: string): Promise<ImapReply> => new Promise((resolve) => {
    if (failed) return resolve({ ok: false, text: failed.message });
    waitTag = `m${++tagN}`;
    waiter = resolve;
    socket.write(`${waitTag} ${cmd}\r\n`);
  });

  try {
    // The greeting arrives unsolicited, before any tag.
    await new Promise<void>((resolve) => {
      if (/^\* (OK|PREAUTH)/m.test(buffer)) return resolve();
      const onData = () => { if (/^\* (OK|PREAUTH)/m.test(buffer)) { socket.off("data", onData); buffer = ""; resolve(); } };
      socket.on("data", onData);
      setTimeout(() => { socket.off("data", onData); resolve(); }, timeoutMs);
    });
    const login = await exec(`LOGIN ${quoted(cfg.user)} ${quoted(cfg.pass)}`);
    if (!login.ok) throw new Error("imap: the server refused the login for this mailbox");
    return await run(exec);
  } finally {
    try { await exec("LOGOUT"); } catch { /* closing anyway */ }
    try { socket.end(); } catch { /* already gone */ }
  }
}

export type Sighting = { mailbox: string; labels: string[]; uid: string };

/**
 * Find a message by a token that appears in its SUBJECT, across several folders,
 * reading Gmail's labels and leaving every flag exactly as it was.
 *
 * BODY.PEEK, never BODY — the difference is whether measuring a mailbox changes
 * it. Searching HEADER SUBJECT rather than TEXT because the token is put in the
 * subject on purpose: a body search on a large mailbox is slow and can match a
 * quoted copy in a reply.
 */
export async function findByToken(
  cfg: ImapConfig,
  token: string,
  mailboxes: string[] = ["INBOX", "[Gmail]/Spam", "Junk", "Junk E-mail", "Spam", "Bulk Mail"],
): Promise<Sighting | null> {
  if (!token) return null;
  return imapSession(cfg, async (exec) => {
    for (const mailbox of mailboxes) {
      const sel = await exec(`SELECT ${quoted(mailbox)}`);
      if (!sel.ok) continue; // a folder this server does not have — not an error
      const search = await exec(`UID SEARCH HEADER SUBJECT ${quoted(token)}`);
      if (!search.ok) continue;
      const uids = (/^\* SEARCH([^\r\n]*)/m.exec(search.text)?.[1] || "").trim().split(/\s+/).filter(Boolean);
      if (!uids.length) continue;
      const uid = uids[uids.length - 1];
      // X-GM-LABELS is a Gmail extension. Asking a server that does not have it
      // returns BAD, so it is asked for separately and its absence is not a
      // failure — it is simply a receiver with no tabs.
      let labels: string[] = [];
      const withLabels = await exec(`UID FETCH ${uid} (X-GM-LABELS)`);
      if (withLabels.ok) {
        const m = /X-GM-LABELS \(([^)]*)\)/.exec(withLabels.text);
        labels = (m?.[1] || "").split(/\s+(?=(?:[^"]*"[^"]*")*[^"]*$)/).filter(Boolean);
      }
      return { mailbox, labels, uid };
    }
    return null;
  });
}
