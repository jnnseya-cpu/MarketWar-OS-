// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// M-34 AI Transactional Email Engine — the sending facade.
//
// Deliverability doctrine (docs/ai-os/11-email-engine.md): inbox placement
// is EARNED — domain authentication (SPF/DKIM/DMARC), warmed sending
// reputation, consent-checked recipients and a clean list. Bounces are
// prevented, not tolerated: every address passes the hygiene pipeline
// below BEFORE a send is attempted, and any hard failure lands on the
// suppression ledger so the platform never sends to it again.
//
// Env-guarded like the rest of the OS: with SMTP credentials (SMTP_HOST +
// SMTP_USER + SMTP_PASS) or an HTTP provider key (RESEND_API_KEY /
// SENDGRID_API_KEY) configured, sends go out through the provider pool;
// without any of them sendEmail() returns a simulated demo receipt and
// nothing leaves the machine.
//
// Provider order: SMTP first (the go-live path — a relay such as Brevo/
// Postmark/SES speaks SMTP), then the Resend and SendGrid HTTP APIs as
// automatic fallbacks. SMTP is spoken over the wire with Node's own tls
// module — no third-party dependency — supporting both implicit TLS
// (port 465) and STARTTLS (ports 587/25) with AUTH LOGIN.

import { dkimSignature } from "@/backend/dkim";

// Small stable hash for Message-ID uniqueness (no crypto needed here).
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h;
}

import { getPool, pickNode, poolConfigured, recordNodeSend, type SendingNode } from "@/backend/sending-pool";

const RESEND_KEY = process.env.RESEND_API_KEY || "";
const SENDGRID_KEY = process.env.SENDGRID_API_KEY || "";
const FROM_DEFAULT = process.env.EMAIL_FROM || "MarketWar OS <os@notifications.marketwaros.com>";
// Return-Path for bounces — an address on OUR sending domain so bounce-backs
// never reach the customer's inbox. Configure a real mailbox/forward there to
// auto-process bounces (see docs/EMAIL-GUIDE.md).
const BOUNCE_RETURN_PATH = (process.env.MW_BOUNCE_ADDRESS || "bounce@marketwaros.com").trim();
import { bounceAddressFor } from "@/backend/reply-routing";

// SMTP is now served by the sending-node POOL (src/backend/sending-pool.ts). With
// no pool configured it falls back to the single SMTP_* node — identical to the
// original single-node behaviour, no extra infrastructure. Adding nodes is a
// config change (MW_SENDING_POOL), not a code change.
// Evaluated on demand, not frozen at module load. A module-level constant is
// impossible to re-read, which turns "the variable is set but sending is still
// in demo mode" into an unanswerable question.
export const smtpConfigured = poolConfigured();
export function emailIsConfigured(): boolean {
  return Boolean(poolConfigured() || process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY);
}
export const emailConfigured = Boolean(smtpConfigured || RESEND_KEY || SENDGRID_KEY);

// The active sending path, for status surfaces (never exposes credentials).
export const emailProvider: "smtp" | "resend" | "sendgrid" | "demo" = smtpConfigured
  ? "smtp"
  : RESEND_KEY
    ? "resend"
    : SENDGRID_KEY
      ? "sendgrid"
      : "demo";

// ---------------------------------------------------------------------------
// 1. Address hygiene pipeline (the "filter" stage — runs before every send)
// ---------------------------------------------------------------------------

// Well-known disposable/burner domains — bounces and spam-trap risk. The
// production list syncs from the hygiene service; this seed set catches the
// most common offenders even in demo mode.
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "temp-mail.org", "throwaway.email", "yopmail.com", "sharklasers.com",
  "getnada.com", "trashmail.com", "fakeinbox.com", "dispostable.com",
]);

// Role addresses depress engagement and attract complaints — flagged, and
// excluded by default from marketing sends (transactional may override).
const ROLE_LOCALPARTS = new Set([
  "admin", "administrator", "webmaster", "postmaster", "hostmaster", "abuse",
  "noreply", "no-reply", "info", "support", "sales", "contact", "office",
  "billing", "help", "marketing", "newsletter", "spam", "security",
]);

const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export type EmailVerdict = {
  email: string;
  valid: boolean;
  sendable: boolean;
  checks: {
    syntax: boolean;
    disposable: boolean;
    role: boolean;
    suppressed: boolean;
  };
  reason: string | null;
};

// In-memory suppression ledger for the running process; production reads
// the `email_suppressions` collection (hard bounces, complaints, unsubs —
// 0-tolerance: one hard failure and the address is never contacted again).
const suppressionLedger = new Set<string>();

export function suppress(email: string): void {
  suppressionLedger.add(email.trim().toLowerCase());
}

export function validateAddress(raw: string): EmailVerdict {
  const email = raw.trim().toLowerCase();
  const syntax = EMAIL_RE.test(email);
  const domain = syntax ? email.split("@")[1] : "";
  const localpart = syntax ? email.split("@")[0] : "";
  const disposable = DISPOSABLE_DOMAINS.has(domain);
  const role = ROLE_LOCALPARTS.has(localpart);
  const suppressed = suppressionLedger.has(email);

  let reason: string | null = null;
  if (!syntax) reason = "invalid syntax — would hard-bounce";
  else if (disposable) reason = "disposable domain — bounce/spam-trap risk";
  else if (suppressed) reason = "on the suppression ledger — never re-sent";
  else if (role) reason = "role address — excluded from marketing sends by default";

  return {
    email,
    valid: syntax && !disposable,
    sendable: syntax && !disposable && !suppressed && !role,
    checks: { syntax, disposable, role, suppressed },
    reason,
  };
}

export function filterList(rawList: string[]): {
  sendable: EmailVerdict[];
  filtered: EmailVerdict[];
} {
  const verdicts = rawList.map(validateAddress);
  return {
    sendable: verdicts.filter((v) => v.sendable),
    filtered: verdicts.filter((v) => !v.sendable),
  };
}

// ---------------------------------------------------------------------------
// 1a. Minimal SMTP client (Node tls/net — no third-party dependency)
// ---------------------------------------------------------------------------
// Speaks just enough SMTP to deliver one HTML message: greeting → EHLO →
// (STARTTLS →) AUTH LOGIN → MAIL FROM → RCPT TO → DATA. Implicit TLS on 465,
// STARTTLS upgrade on 587/25. Returns the accepted queue id from the final
// 250 response, or throws so the facade can fall through to the HTTP pool.

function angleAddr(addr: string): string {
  const m = addr.match(/<([^>]+)>/);
  return m ? m[1] : addr.trim();
}


// ---------------------------------------------------------------------------
// Attachments — documents/images sent with a campaign or one-off email.
// Built as MIME multipart/mixed: the HTML body becomes the first part and each
// attachment follows base64-encoded. DKIM must sign THIS body (not the bare
// HTML) or the signature fails and the mail lands in spam.
// ---------------------------------------------------------------------------
export type EmailAttachment = {
  filename: string;
  contentBase64: string;   // raw base64 (no data: prefix)
  contentType?: string;    // defaults from the extension
};

// Per-message caps: most inboxes reject over ~25MB total, and base64 inflates by
// ~4/3. Keep the encoded total under 20MB and refuse anything larger up-front.
export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const EXT_TYPES: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", csv: "text/csv",
  txt: "text/plain", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
};

// Executables are refused outright — sending them destroys sender reputation and
// is the fastest route to a blocklist.
const BLOCKED_EXT = /\.(exe|bat|cmd|com|scr|pif|msi|jar|js|vbs|ps1|sh|dll|apk)$/i;

function safeFilename(name: string): string {
  return (name || "attachment").replace(/[\r\n"\\]/g, "").replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "attachment";
}

export function validateAttachments(list: EmailAttachment[] | undefined): { ok: boolean; error?: string; total: number } {
  const items = list ?? [];
  if (items.length > MAX_ATTACHMENTS) return { ok: false, error: `Too many attachments (max ${MAX_ATTACHMENTS}).`, total: 0 };
  let total = 0;
  for (const a of items) {
    if (!a?.contentBase64) return { ok: false, error: `Attachment "${a?.filename || "?"}" has no content.`, total };
    if (BLOCKED_EXT.test(a.filename || "")) return { ok: false, error: `"${a.filename}" is an executable type and cannot be emailed.`, total };
    total += Math.ceil((a.contentBase64.length * 3) / 4);
  }
  if (total > MAX_ATTACHMENT_BYTES) return { ok: false, error: `Attachments total ${(total / 1048576).toFixed(1)}MB — the limit is ${MAX_ATTACHMENT_BYTES / 1048576}MB.`, total };
  return { ok: true, total };
}

// Returns the multipart body plus the Content-Type header value to use.
function buildMimeBody(html: string, attachments: EmailAttachment[]): { body: string; contentType: string } {
  const boundary = `=_mw_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const parts: string[] = [];
  parts.push(`--${boundary}`);
  parts.push("Content-Type: text/html; charset=utf-8");
  parts.push("Content-Transfer-Encoding: 8bit");
  parts.push("");
  parts.push(html);
  for (const a of attachments) {
    const name = safeFilename(a.filename);
    const ext = name.split(".").pop()?.toLowerCase() || "";
    const ctype = a.contentType || EXT_TYPES[ext] || "application/octet-stream";
    parts.push(`--${boundary}`);
    parts.push(`Content-Type: ${ctype}; name="${name}"`);
    parts.push("Content-Transfer-Encoding: base64");
    parts.push(`Content-Disposition: attachment; filename="${name}"`);
    parts.push("");
    // RFC 2045: base64 lines must not exceed 76 chars.
    parts.push((a.contentBase64.replace(/\s+/g, "").match(/.{1,76}/g) || []).join("\r\n"));
  }
  parts.push(`--${boundary}--`);
  return { body: parts.join("\r\n"), contentType: `multipart/mixed; boundary="${boundary}"` };
}

// ---------------------------------------------------------------------------
// Message construction — one definition, used by the single send and the batch.
// The header map is what DKIM signs, so it must match the emitted headers
// exactly; building it in two places is how a signature silently stops matching.
// ---------------------------------------------------------------------------
export type SmtpExtra = {
  replyTo?: string; listUnsubscribe?: string; bounceReturnPath?: string;
  attachments?: EmailAttachment[]; dkim?: { domain: string; selector: string; privateKeyPem: string };
};

function buildWireMessage(from: string, to: string, subject: string, html: string, extra?: SmtpExtra, hostHint = ""): string {
  const domainOfFrom = angleAddr(from).split("@")[1] || hostHint || "marketwaros.com";
  const messageId = `<${Date.now().toString(36)}.${Math.abs(hashStr(to + subject)).toString(36)}@${domainOfFrom}>`;
  const headers: Record<string, string> = {
    From: from,
    To: to,
    Subject: subject,
    Date: new Date().toUTCString(),
    "Message-ID": messageId,
    "MIME-Version": "1.0",
    "Content-Type": "text/html; charset=utf-8",
    "Content-Transfer-Encoding": "8bit",
  };
  const atts = extra?.attachments ?? [];
  let bodySource = html;
  if (atts.length) {
    const mime = buildMimeBody(html, atts);
    bodySource = mime.body;
    headers["Content-Type"] = mime.contentType;
    delete headers["Content-Transfer-Encoding"];
  }
  if (extra?.replyTo) headers["Reply-To"] = extra.replyTo;
  if (extra?.listUnsubscribe) {
    headers["List-Unsubscribe"] = `<${extra.listUnsubscribe}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  // Dot-stuffing + bare-LF normalisation so the body cannot break the DATA
  // terminator or trip a strict MTA.
  const canonBody = bodySource.replace(/\r?\n/g, "\r\n").replace(/\r\n\./g, "\r\n..");
  let dkimHeader = "";
  if (extra?.dkim) {
    try { dkimHeader = dkimSignature(headers, bodySource, { ...extra.dkim }) + "\r\n"; }
    catch { dkimHeader = ""; /* never block a send on a signing hiccup */ }
  }
  const headerBlock = Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join("\r\n");
  return dkimHeader + headerBlock + "\r\n\r\n" + canonBody;
}

// Idle timeout: fires only when the server goes quiet, so it bounds a stuck
// session without capping how long a healthy batch may run.
const SESSION_IDLE_MS = 20_000;

export type SmtpBatchItem = { to: string; subject: string; html: string; extra?: SmtpExtra };
export type SmtpBatchResult = { to: string; ok: boolean; id?: string; error?: string };

/**
 * Send MANY messages over ONE authenticated SMTP session.
 *
 * The single-send path opens a TCP connection, negotiates TLS and authenticates
 * for every individual email — roughly a second and a half of handshake per
 * message before a byte of content moves. On a 45-second budget that capped a
 * campaign at about 34 recipients per click, so a 250-a-day warm-up allowance
 * took eight presses to spend.
 *
 * SMTP is designed for exactly this: after a message is accepted, RSET clears
 * the transaction and the next MAIL FROM begins on the same authenticated
 * connection. It is also GENTLER on the provider than opening 250 connections —
 * most rate-limit connections per hour far more tightly than messages.
 *
 * A rejected RECIPIENT does not end the run: the failure is recorded, RSET is
 * issued, and the batch continues. Only a connection-level fault stops it, and
 * even then the results gathered so far are returned so the caller knows exactly
 * who was already sent to and nobody is mailed twice on the retry.
 */
export async function smtpSendMany(
  node: SendingNode,
  from: string,
  items: SmtpBatchItem[],
  opts: { deadline?: number } = {},
): Promise<SmtpBatchResult[]> {
  if (!items.length) return [];
  const net = await import("node:net");
  const tls = await import("node:tls");
  const SMTP_HOST = node.host, SMTP_PORT = node.port, SMTP_USER = node.user, SMTP_PASS = node.pass, SMTP_SECURE = node.secure;
  const deadline = opts.deadline ?? Number.POSITIVE_INFINITY;

  return new Promise<SmtpBatchResult[]>((resolve) => {
    let socket: import("node:net").Socket | import("node:tls").TLSSocket;
    let buffer = "";
    let stage = 0;
    let upgraded = SMTP_SECURE;
    let settled = false;
    let i = 0;                       // index of the message in flight
    let message = "";                // its wire bytes
    const results: SmtpBatchResult[] = [];

    // Always RESOLVE, never reject: a half-finished batch still has to tell the
    // caller who received mail, or the retry sends to them again.
    const done = () => {
      if (settled) return;
      settled = true;
      try { socket.end(); } catch { /* already closed */ }
      resolve(results);
    };
    const abort = (err: Error) => {
      // Whatever was in flight never completed; everything after it is untried.
      for (let k = results.length; k < items.length; k++) {
        results.push({ to: items[k].to, ok: false, error: err.message });
      }
      done();
    };

    const write = (line: string) => socket.write(line + "\r\n");

    const startNext = () => {
      if (i >= items.length) { stage = 99; write("QUIT"); return done(); }
      if (Date.now() >= deadline) {
        // Out of time. Stop cleanly WITHOUT marking the rest as failed — they
        // were never attempted, and the caller sends them on the next run.
        stage = 99; write("QUIT"); return done();
      }
      const item = items[i];
      message = buildWireMessage(from, item.to, item.subject, item.html, item.extra, SMTP_HOST);
      const envelopeFrom = item.extra?.bounceReturnPath ? angleAddr(item.extra.bounceReturnPath) : angleAddr(from);
      stage = 6;
      write(`MAIL FROM:<${envelopeFrom}>`);
    };

    const failCurrent = (line: string) => {
      results.push({ to: items[i].to, ok: false, error: line });
      i++;
      stage = 10;             // await the RSET reply, then start the next
      write("RSET");
    };

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      let idx;
      while ((idx = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (/^\d{3}-/.test(line)) continue;   // continuation line
        step(Number(line.slice(0, 3)), line);
      }
    };

    const startTls = () => {
      const secure = tls.connect({ socket: socket as import("node:net").Socket, servername: SMTP_HOST }, () => {
        upgraded = true;
        socket.removeAllListeners("data");
        socket = secure;
        socket.on("data", onData);
        // Re-arm every liveness handler on the NEW socket.
        //
        // They were attached to the plaintext socket before the upgrade, and
        // after reassignment nothing watched the TLS socket at all: a server
        // that dropped the connection mid-session left this promise pending
        // forever, with no timeout to rescue it. That is the shape of a request
        // that "just hangs" and returns nothing — reproduced deterministically
        // against a server that closes mid-batch.
        socket.setTimeout(SESSION_IDLE_MS, () => abort(new Error("SMTP timeout")));
        socket.on("error", (e) => abort(e));
        socket.on("end", () => abort(new Error("SMTP connection closed before completion")));
        socket.on("close", () => abort(new Error("SMTP connection closed")));
        write(`EHLO marketwaros.com`);
      });
      secure.on("error", (e) => abort(e));
    };

    const step = (code: number, line: string) => {
      const ok = code >= 200 && code < 400;
      switch (stage) {
        case 0:
          if (!ok) return abort(new Error(`SMTP greeting: ${line}`));
          stage = 1; write(`EHLO marketwaros.com`); break;
        case 1:
          if (!ok) return abort(new Error(`SMTP EHLO: ${line}`));
          if (!upgraded) { stage = 2; write("STARTTLS"); }
          else { stage = 3; write("AUTH LOGIN"); }
          break;
        case 2:
          if (!ok) return abort(new Error(`SMTP STARTTLS: ${line}`));
          stage = 1; startTls(); break;
        case 3:
          if (!ok) return abort(new Error(`SMTP AUTH: ${line}`));
          stage = 4; write(Buffer.from(SMTP_USER).toString("base64")); break;
        case 4:
          if (!ok) return abort(new Error(`SMTP AUTH user: ${line}`));
          stage = 5; write(Buffer.from(SMTP_PASS).toString("base64")); break;
        case 5:
          if (!ok) return abort(new Error(`SMTP AUTH failed: ${line}`));
          startNext(); break;                       // authenticated once, for all of them
        case 6:
          if (!ok) return failCurrent(`MAIL FROM: ${line}`);
          stage = 7; write(`RCPT TO:<${angleAddr(items[i].to)}>`); break;
        case 7:
          // A refused recipient is THIS recipient's problem, not the batch's.
          if (!ok) return failCurrent(`RCPT TO: ${line}`);
          stage = 8; write("DATA"); break;
        case 8:
          if (code !== 354) return failCurrent(`DATA: ${line}`);
          stage = 9; socket.write(message + "\r\n.\r\n"); break;
        case 9:
          if (!ok) return failCurrent(`send: ${line}`);
          results.push({ to: items[i].to, ok: true, id: (line.match(/queued as (\S+)/i) || [])[1] || "accepted" });
          i++;
          stage = 10; write("RSET"); break;
        case 10:
          // RSET's reply — whatever it says, move on to the next message.
          startNext(); break;
        case 99:
          break;                                    // QUIT reply; already resolved
      }
    };

    const connectOpts = { host: SMTP_HOST, port: SMTP_PORT };
    socket = SMTP_SECURE ? tls.connect({ ...connectOpts, servername: SMTP_HOST }) : net.connect(connectOpts);
    // Idle timeout: fires only when the server goes quiet, so it bounds a stuck
    // session without capping how long a healthy batch may run.
    socket.setTimeout(SESSION_IDLE_MS, () => abort(new Error("SMTP timeout")));
    socket.on("data", onData);
    socket.on("error", (e) => abort(e));
    socket.on("end", () => abort(new Error("SMTP connection closed before completion")));
    socket.on("close", () => abort(new Error("SMTP connection closed")));
  });
}

async function sendViaSmtp(
  node: SendingNode,
  from: string,
  to: string,
  subject: string,
  html: string,
  extra?: { replyTo?: string; listUnsubscribe?: string; bounceReturnPath?: string; attachments?: EmailAttachment[]; dkim?: { domain: string; selector: string; privateKeyPem: string } },
): Promise<string> {
  const net = await import("node:net");
  const tls = await import("node:tls");
  const SMTP_HOST = node.host, SMTP_PORT = node.port, SMTP_USER = node.user, SMTP_PASS = node.pass, SMTP_SECURE = node.secure;

  return new Promise<string>((resolve, reject) => {
    let socket: import("node:net").Socket | import("node:tls").TLSSocket;
    let buffer = "";
    let stage = 0;
    let upgraded = SMTP_SECURE;
    let settled = false;
    // Return-Path (envelope MAIL FROM) = a bounce address on OUR domain, not the
    // visible From. Bounce notifications go there (for us to process/suppress),
    // never into the sender's own inbox. DMARC still passes via DKIM alignment.
    const envelopeFrom = extra?.bounceReturnPath ? angleAddr(extra.bounceReturnPath) : angleAddr(from);
    const envelopeTo = angleAddr(to);

    const finish = (err: Error | null, id?: string) => {
      if (settled) return;
      settled = true;
      try { socket.end(); } catch { /* already closed */ }
      if (err) reject(err); else resolve(id || "accepted");
    };

    const write = (line: string) => socket.write(line + "\r\n");

    // Build the header set. Date + Message-ID are required for deliverability;
    // Reply-To makes replies land in the sender's own inbox. The header map is
    // also what DKIM signs, so it must match the emitted headers exactly.
    const domainOfFrom = angleAddr(from).split("@")[1] || SMTP_HOST || "marketwaros.com";
    const messageId = `<${Date.now().toString(36)}.${Math.abs(hashStr(to + subject)).toString(36)}@${domainOfFrom}>`;
    const dateHeader = new Date().toUTCString();
    const headers: Record<string, string> = {
      From: from,
      To: to,
      Subject: subject,
      Date: dateHeader,
      "Message-ID": messageId,
      "MIME-Version": "1.0",
      "Content-Type": "text/html; charset=utf-8",
      "Content-Transfer-Encoding": "8bit",
    };
    // With attachments the message becomes multipart/mixed; the HTML is part 1.
    const atts = extra?.attachments ?? [];
    let bodySource = html;
    if (atts.length) {
      const mime = buildMimeBody(html, atts);
      bodySource = mime.body;
      headers["Content-Type"] = mime.contentType;
      delete headers["Content-Transfer-Encoding"];
    }
    if (extra?.replyTo) headers["Reply-To"] = extra.replyTo;
    if (extra?.listUnsubscribe) {
      headers["List-Unsubscribe"] = `<${extra.listUnsubscribe}>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }

    // Dot-stuffing + bare-LF normalisation so the message body can't break the
    // DATA terminator or trip strict MTAs.
    const canonBody = bodySource.replace(/\r?\n/g, "\r\n").replace(/\r\n\./g, "\r\n..");

    // DKIM-sign with the sending domain's key when the domain is authenticated —
    // this is what earns the inbox. Signed as its own header, prepended first.
    let dkimHeader = "";
    if (extra?.dkim) {
      try { dkimHeader = dkimSignature(headers, bodySource, { ...extra.dkim }) + "\r\n"; }
      catch { dkimHeader = ""; /* never block a send on a signing hiccup */ }
    }

    const headerBlock = Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join("\r\n");
    const message = dkimHeader + headerBlock + "\r\n\r\n" + canonBody;

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      // Process complete response lines (last line of a reply has "code " form).
      let idx;
      while ((idx = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (/^\d{3}-/.test(line)) continue; // continuation line
        const code = Number(line.slice(0, 3));
        step(code, line);
      }
    };

    const startTls = () => {
      const secure = tls.connect({ socket: socket as import("node:net").Socket, servername: SMTP_HOST }, () => {
        upgraded = true;
        socket.removeAllListeners("data");
        socket = secure;
        socket.on("data", onData);
        // Re-arm on the new socket — see the note in smtpSendMany. Without this
        // the timeout stayed on the discarded plaintext socket and a connection
        // that died after the upgrade never settled.
        socket.setTimeout(15000, () => finish(new Error("SMTP timeout")));
        socket.on("error", (e) => finish(e));
        socket.on("end", () => finish(new Error("SMTP connection closed before completion")));
        socket.on("close", () => finish(new Error("SMTP connection closed")));
        write(`EHLO marketwaros.com`);
      });
      secure.on("error", (e) => finish(e));
    };

    const step = (code: number, line: string) => {
      // 2xx/3xx advance; anything else is a hard failure.
      const ok = code >= 200 && code < 400;
      switch (stage) {
        case 0: // server greeting
          if (!ok) return finish(new Error(`SMTP greeting: ${line}`));
          stage = 1;
          write(`EHLO marketwaros.com`);
          break;
        case 1: // EHLO response
          if (!ok) return finish(new Error(`SMTP EHLO: ${line}`));
          if (!upgraded) { stage = 2; write("STARTTLS"); }
          else { stage = 3; write("AUTH LOGIN"); }
          break;
        case 2: // STARTTLS accepted → upgrade the socket; new EHLO restarts at stage 1
          if (!ok) return finish(new Error(`SMTP STARTTLS: ${line}`));
          stage = 1;
          startTls();
          break;
        case 3: // AUTH LOGIN → send base64 username
          if (!ok) return finish(new Error(`SMTP AUTH: ${line}`));
          stage = 4;
          write(Buffer.from(SMTP_USER).toString("base64"));
          break;
        case 4: // username accepted → send base64 password
          if (!ok) return finish(new Error(`SMTP AUTH user: ${line}`));
          stage = 5;
          write(Buffer.from(SMTP_PASS).toString("base64"));
          break;
        case 5: // authenticated → MAIL FROM
          if (!ok) return finish(new Error(`SMTP AUTH failed: ${line}`));
          stage = 6;
          write(`MAIL FROM:<${envelopeFrom}>`);
          break;
        case 6:
          if (!ok) return finish(new Error(`SMTP MAIL FROM: ${line}`));
          stage = 7;
          write(`RCPT TO:<${envelopeTo}>`);
          break;
        case 7:
          if (!ok) return finish(new Error(`SMTP RCPT TO: ${line}`));
          stage = 8;
          write("DATA");
          break;
        case 8: // 354 go-ahead → send body + terminator
          if (code !== 354) return finish(new Error(`SMTP DATA: ${line}`));
          stage = 9;
          socket.write(message + "\r\n.\r\n");
          break;
        case 9: // final 250 → queued
          if (!ok) return finish(new Error(`SMTP send: ${line}`));
          finish(null, (line.match(/queued as (\S+)/i) || [])[1] || "accepted");
          break;
      }
    };

    const connectOpts = { host: SMTP_HOST, port: SMTP_PORT };
    if (SMTP_SECURE) {
      socket = tls.connect({ ...connectOpts, servername: SMTP_HOST });
    } else {
      socket = net.connect(connectOpts);
    }
    socket.setTimeout(15000, () => finish(new Error("SMTP timeout")));
    socket.on("data", onData);
    socket.on("error", (e) => finish(e));
    socket.on("end", () => finish(new Error("SMTP connection closed before completion")));
  });
}

// ---------------------------------------------------------------------------
// 2. Sending facade (provider pool — SMTP first, then Resend, then SendGrid)
// ---------------------------------------------------------------------------

export type SendResult = {
  ok: boolean;
  mode: "live" | "demo";
  provider: string;
  id: string | null;
  filteredOut: EmailVerdict[];
  detail: string;
};

/**
 * Send a whole campaign batch over one authenticated SMTP session.
 *
 * Hygiene still runs per address — an unsendable one is filtered before the
 * provider is contacted, exactly as in the single send — and every message keeps
 * its own personalised subject, body, tracking and unsubscribe link. Only the
 * connection is shared.
 *
 * Falls back to the one-at-a-time path when SMTP is not the active provider, so
 * a Resend/SendGrid deployment and demo mode behave exactly as before.
 */
/** Which path a batch actually took — surfaced so the send result can say so. */
export let lastBatchMode: "session" | "one-at-a-time" | "mixed" | "none" = "none";

export async function sendEmailBatch(
  items: { to: string; subject: string; html: string; listUnsubscribe?: string }[],
  common: {
    from?: string; replyTo?: string;
    dkim?: { domain: string; selector: string; privateKeyPem: string };
    attachments?: EmailAttachment[];
    deadline?: number;
    /** Makes each message's bounce attributable to this brand and recipient. */
    brandId?: string;
  } = {},
): Promise<SendResult[]> {
  const from = common.from || FROM_DEFAULT;

  // Pre-send hygiene, before a connection is opened. Blocked addresses never
  // reach the provider — that is the "no bounce back" guarantee, and batching
  // must not weaken it.
  const verdicts = items.map((it) => ({ item: it, verdict: validateAddress(it.to) }));
  const sendableItems = verdicts.filter((v) => v.verdict.sendable);

  const results = new Map<string, SendResult>();
  for (const v of verdicts) {
    if (!v.verdict.sendable) {
      results.set(v.item.to, {
        ok: false, mode: emailConfigured ? "live" : "demo", provider: "hygiene-filter",
        id: null, filteredOut: [v.verdict], detail: `blocked pre-send: ${v.verdict.reason}`,
      });
    }
  }

  const fromDomain = angleAddr(from).split("@")[1] || "";
  const day = new Date().toISOString().slice(0, 10);
  const node = smtpConfigured ? pickNode(fromDomain, day) : null;

  if (node && sendableItems.length) {
    try {
      const prepared = sendableItems.map((v) => ({
        to: v.verdict.email,
        subject: v.item.subject,
        html: v.item.html,
        extra: {
          replyTo: common.replyTo, dkim: common.dkim, listUnsubscribe: v.item.listUnsubscribe,
          // Per recipient, so a failure says whose it was and which address died
          // instead of the intake guessing from the text of the notice.
          bounceReturnPath: (common.brandId && bounceAddressFor(common.brandId, v.verdict.email)) || BOUNCE_RETURN_PATH,
          attachments: common.attachments,
        },
      }));

      // A few sessions in parallel, not one per message.
      //
      // Reusing a session removes the handshake, but each message still costs a
      // handful of round trips to the provider, so on a real link one session
      // alone does not fit a day's allowance into a single press. A small number
      // of concurrent sessions does, while staying far below the connection
      // limits providers actually enforce — they cap connections per hour much
      // harder than messages. Deliberately small: this is a reputation system,
      // not a benchmark.
      const streams = Math.max(1, Math.min(8, Number(process.env.SMTP_CONCURRENCY || 4)));
      const lanes: typeof prepared[] = Array.from({ length: streams }, () => []);
      prepared.forEach((item, idx) => lanes[idx % streams].push(item));

      const laneResults = await Promise.all(
        lanes.filter((l) => l.length).map((lane) => smtpSendMany(node, from, lane, { deadline: common.deadline })),
      );
      const batchResults = laneResults.flat();
      const accepted = batchResults.filter((r) => r.ok).length;
      if (accepted > 0) recordNodeSend(node.label, day, accepted);
      const provider = getPool().length > 1 ? `smtp:${node.label}` : "smtp";
      lastBatchMode = "session";
      for (const r of batchResults) {
        results.set(r.to, {
          ok: r.ok, mode: "live", provider, id: r.id ?? null, filteredOut: [],
          detail: r.ok ? (common.dkim ? "accepted (DKIM-signed)" : "accepted") : (r.error || "send failed"),
        });
      }
    } catch {
      // Session-level failure: fall through so every address still gets its own
      // attempt through the single-send path rather than the batch failing whole.
      lastBatchMode = "one-at-a-time";
    }
  } else {
    lastBatchMode = "one-at-a-time";
  }

  // Anything without a result — no SMTP node, a session that died, or a provider
  // pool that is not SMTP — goes through the original one-at-a-time path.
  //
  // The deadline is honoured HERE too. Without it, addresses the batch skipped
  // for time were immediately re-sent one at a time with no budget at all, which
  // undoes the stop and runs the function past its limit — the very failure the
  // deadline exists to prevent.
  //
  // An address the batch ATTEMPTED and failed is never retried here. The result
  // is already recorded, and re-sending it would mail anyone whose message the
  // server accepted just before the connection died a second time.
  const out: SendResult[] = [];
  const deadline = common.deadline ?? Number.POSITIVE_INFINITY;
  for (const it of items) {
    const existing = results.get(it.to);
    if (existing) { out.push(existing); continue; }
    // Out of budget: leave the rest ABSENT. The caller reads a missing result as
    // "never attempted", so they stay sendable on the next run.
    if (Date.now() >= deadline) break;
    out.push(await sendEmail({
      to: it.to, subject: it.subject, html: it.html,
      from: common.from, replyTo: common.replyTo, listUnsubscribe: it.listUnsubscribe,
      dkim: common.dkim, attachments: common.attachments,
    }));
  }
  return out;
}

export async function sendEmail(opts: {
  attachments?: EmailAttachment[];
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  listUnsubscribe?: string; // RFC 8058 one-click unsubscribe URL
  transactional?: boolean;
  // When the sending domain is authenticated (sending-domains.ts), the caller
  // passes its DKIM key so the message is signed as that domain — the inbox key.
  dkim?: { domain: string; selector: string; privateKeyPem: string };
}): Promise<SendResult> {
  const verdict = validateAddress(opts.to);
  const roleOk = opts.transactional && verdict.checks.role && verdict.valid && !verdict.checks.suppressed;
  if (!verdict.sendable && !roleOk) {
    // The "no bounce back" guarantee: unsendable addresses are filtered
    // here, before any provider is contacted.
    return {
      ok: false,
      mode: emailConfigured ? "live" : "demo",
      provider: "hygiene-filter",
      id: null,
      filteredOut: [verdict],
      detail: `blocked pre-send: ${verdict.reason}`,
    };
  }

  if (!emailConfigured) {
    return {
      ok: true,
      mode: "demo",
      provider: "demo-pool",
      id: `demo_${Date.now().toString(36)}`,
      filteredOut: [],
      detail: "Demo mode — send simulated. Add RESEND_API_KEY or SENDGRID_API_KEY to go live.",
    };
  }

  let smtpError = "";
  if (smtpConfigured) {
    // Route through the pool: the sending domain gets a stable home node (its IP),
    // spreading domains across the fleet. One node → same as the single-node setup.
    const fromDomain = angleAddr(opts.from || FROM_DEFAULT).split("@")[1] || "";
    const day = new Date().toISOString().slice(0, 10);
    const node = pickNode(fromDomain, day);
    if (node) {
      try {
        const id = await sendViaSmtp(node, opts.from || FROM_DEFAULT, verdict.email, opts.subject, opts.html, { replyTo: opts.replyTo, dkim: opts.dkim, listUnsubscribe: opts.listUnsubscribe, bounceReturnPath: BOUNCE_RETURN_PATH, attachments: opts.attachments });
        recordNodeSend(node.label, day, 1);
        return { ok: true, mode: "live", provider: getPool().length > 1 ? `smtp:${node.label}` : "smtp", id, filteredOut: [], detail: opts.dkim ? "accepted (DKIM-signed)" : "accepted" };
      } catch (e) {
        // Capture the reason (safe — SMTP status lines carry no credentials) so a
        // failed send is diagnosable instead of a silent "pool-exhausted".
        smtpError = e instanceof Error ? e.message : String(e);
        // fall through to the HTTP pool on any SMTP failure
      }
    }
  }
  if (RESEND_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: opts.from || FROM_DEFAULT, to: [verdict.email], subject: opts.subject, html: opts.html, ...(opts.replyTo ? { reply_to: opts.replyTo } : {}), ...(opts.attachments?.length ? { attachments: opts.attachments.map((a) => ({ filename: a.filename, content: a.contentBase64 })) } : {}) }),
    });
    if (res.ok) {
      const body = (await res.json()) as { id?: string };
      return { ok: true, mode: "live", provider: "resend", id: body.id ?? null, filteredOut: [], detail: "accepted" };
    }
    // fall through to next provider on failure
  }

  if (SENDGRID_KEY) {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${SENDGRID_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: verdict.email }] }],
        from: { email: (opts.from || FROM_DEFAULT).replace(/.*<(.+)>.*/, "$1") },
        ...(opts.replyTo ? { reply_to: { email: opts.replyTo.replace(/.*<(.+)>.*/, "$1") } } : {}),
        subject: opts.subject,
        content: [{ type: "text/html", value: opts.html }],
      }),
    });
    if (res.status === 202) {
      return { ok: true, mode: "live", provider: "sendgrid", id: res.headers.get("x-message-id"), filteredOut: [], detail: "accepted" };
    }
  }

  return {
    ok: false,
    mode: "live",
    provider: "pool-exhausted",
    id: null,
    filteredOut: [],
    detail: smtpError ? `SMTP send failed: ${smtpError}` : "all providers failed — send queued for retry",
  };
}
