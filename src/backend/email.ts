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
/**
 * The visible From, READ ON DEMAND.
 *
 * `FROM_DEFAULT` was frozen at import like the SMTP constants above it, and the
 * comment there already explains why that is wrong — it turns "I set the
 * variable and it still uses the old value" into an unanswerable question. This
 * one was missed when the others were fixed, and it had a second cost: the email
 * health check reads `process.env.EMAIL_FROM` live, so the address it probed and
 * the address the sender actually used could disagree without either being
 * visibly wrong. The constant is kept because other modules import it.
 */
export function fromDefault(): string {
  return process.env.EMAIL_FROM || "MarketWar OS <os@notifications.marketwaros.com>";
}
/** Snapshot at import. Prefer `fromDefault()`. */
const FROM_DEFAULT = process.env.EMAIL_FROM || "MarketWar OS <os@notifications.marketwaros.com>";
void FROM_DEFAULT;
/**
 * Return-Path for bounces — CONFIGURED, or empty.
 *
 * This defaulted to `bounce@marketwaros.com`, which nobody had ever created. So
 * every message left with a Return-Path pointing at a mailbox that does not
 * exist, and when the relay dropped it the bounce had nowhere to go: the
 * delivery failure destroyed its own evidence, which is why "email never been
 * delivered, ever" survived a month of green health checks.
 *
 * Empty now unless somebody states one. `resolveSender` falls back to the
 * AUTHENTICATED ACCOUNT, which exists by definition — the relay just accepted
 * its password. Nothing is lost: set MW_BOUNCE_ADDRESS and the old behaviour
 * returns, with the difference that the address is then real.
 *
 * READ ON DEMAND, like every other decision in this file. The constant below is
 * frozen at import and kept only because other modules import it; a value that
 * cannot change after boot turns "I set the variable and nothing changed" into
 * an unanswerable question, which is the exact fault this file has already been
 * fixed for twice.
 */
export function bounceReturnPath(): string {
  return (process.env.MW_BOUNCE_ADDRESS || "").trim();
}
/** Snapshot at import. Prefer `bounceReturnPath()`. */
export const BOUNCE_RETURN_PATH = (process.env.MW_BOUNCE_ADDRESS || "").trim();
import { bounceAddressFor, bounceHostConfigured } from "@/backend/reply-routing";
import { resolveSender } from "@/shared/sender-identity";
import { haltFor } from "@/backend/emergency-stop";
import { recordAttempt } from "@/backend/send-ledger";

// SMTP is now served by the sending-node POOL (src/backend/sending-pool.ts). With
// no pool configured it falls back to the single SMTP_* node — identical to the
// original single-node behaviour, no extra infrastructure. Adding nodes is a
// config change (MW_SENDING_POOL), not a code change.
// READ THESE ON DEMAND, NOT OFF THE CONSTANTS BELOW.
//
// The constants are frozen at import. The comment here used to claim they were
// evaluated on demand, which was simply false, and it turned "I set the variable
// and sending is still dark" into an unanswerable question. They are kept
// because other modules import them and nothing delivered gets removed — but
// every decision inside this file now calls the FUNCTIONS.
export function emailIsConfigured(): boolean {
  return Boolean(poolConfigured() || process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY);
}
/** Snapshot at import. Prefer `poolConfigured()`. */
export const smtpConfigured = poolConfigured();
/** Snapshot at import. Prefer `emailIsConfigured()`. */
export const emailConfigured = Boolean(smtpConfigured || RESEND_KEY || SENDGRID_KEY);

/**
 * The active sending path, asked NOW. Status surfaces must use this rather than
 * the constant below, or they answer with whatever was true at import.
 */
export function activeEmailProvider(): "smtp" | "resend" | "sendgrid" | "demo" {
  if (poolConfigured()) return "smtp";
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SENDGRID_API_KEY) return "sendgrid";
  return "demo";
}

/** Snapshot at import. Prefer `activeEmailProvider()`. */
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
  /** RFC 5322 Sender: — the account that submitted, when it is not the From. */
  senderHeader?: string;
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
  // Declared, not implied — see the single-send path for why a From/account
  // mismatch with no Sender: header reads as a forgery to the receiving side.
  if (extra?.senderHeader) headers["Sender"] = extra.senderHeader;
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
      // Same rule as the single send, from the same function. Two copies of this
      // decision is how the envelope a diagnostic tested stopped matching the
      // envelope a real message used.
      const identity = resolveSender({ from, authUser: SMTP_USER, bounce: item.extra?.bounceReturnPath });
      message = buildWireMessage(from, item.to, item.subject, item.html, { ...item.extra, senderHeader: identity.senderHeader }, SMTP_HOST);
      stage = 6;
      write(`MAIL FROM:<${identity.envelopeFrom}>`);
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
    // ONE rule for all three addresses — see shared/sender-identity.ts. With a
    // configured bounce address the envelope is that; otherwise it is the
    // AUTHENTICATED ACCOUNT, which exists by definition, instead of an invented
    // `bounce@` whose undeliverable failures are why nothing could be traced.
    const identity = resolveSender({ from, authUser: SMTP_USER, bounce: extra?.bounceReturnPath });
    const envelopeFrom = identity.envelopeFrom;
    const envelopeTo = angleAddr(to);
    /** Set when the relay refused the return-path and the From was used instead. */
    let returnPathDowngraded = "";

    const finish = (err: Error | null, id?: string) => {
      if (settled) return;
      settled = true;
      try { socket.end(); } catch { /* already closed */ }
      if (err) { reject(err); return; }
      // The downgrade is logged rather than swallowed: a deployment whose every
      // message loses bounce attribution should be visible, not silent.
      if (returnPathDowngraded) console.warn(`[email] ${returnPathDowngraded}`);
      resolve(id || "accepted");
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
    // RFC 5322 §3.6.2: when the mailbox in From is not the party that actually
    // submitted the message, `Sender:` names the party that did — for example a
    // dedicated sending account submitting as the address the business puts its
    // name to. (On marketwaros.com the two are now the SAME mailbox, `info@`, so
    // `identity.senderHeader` is empty and no header is emitted: there is no
    // arrangement to declare. The separate `appuser@` account this once assumed
    // was never created — see shared/sender-identity.ts.)
    // Declaring it when they DO differ is what tells a receiving server this is an arrangement
    // rather than a forgery — a mismatch with no Sender header reads as spoofing
    // and is exactly the shape of message a relay accepts and then drops.
    if (identity.senderHeader) headers["Sender"] = identity.senderHeader;
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
          // A REFUSED RETURN-PATH MUST NOT KILL THE MESSAGE.
          //
          // The envelope sender is now the authenticated account unless a real
          // bounce address was configured, so this branch should be unreachable
          // on a healthy relay — an account cannot refuse to be its own sender.
          // It stays because a configured MW_BOUNCE_ADDRESS can still be wrong,
          // and because many relays — Hostinger among them — accept only a MAIL
          // FROM that is the authenticated mailbox or a real alias.
          //
          // Bounce attribution is worth having. It is not worth more than the
          // message. So a rejected return-path retries ONCE as the visible From
          // and reports the downgrade rather than losing the mail.
          if (!ok) {
            if (!returnPathDowngraded && envelopeFrom !== angleAddr(from)) {
              returnPathDowngraded = `the relay refused the return-path <${envelopeFrom}> (${line.trim()}), so this was sent as <${angleAddr(from)}> and its bounces will not be attributable`;
              stage = 6;
              write(`MAIL FROM:<${angleAddr(from)}>`);
              break;
            }
            return finish(new Error(`SMTP MAIL FROM: ${line}`));
          }
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
  /**
   * A PROVIDER ACCEPTED THIS MESSAGE FOR DELIVERY. Nothing weaker.
   *
   * This used to be `true` in demo mode, for a message that was never sent to
   * anybody. Every counter, metric and digest downstream inherited that, so a
   * deployment with no sending server reported campaigns as sent, recorded
   * "sent" events against addresses that were never contacted, and burned the
   * warm-up allowance — while not one message existed. The owner's report was
   * "all messages send never reached inbox", and the platform's own screens had
   * been agreeing that they had.
   *
   * `ok` therefore means accepted by a provider. It is never true for a message
   * that did not leave the machine.
   */
  ok: boolean;
  mode: "live" | "demo";
  provider: string;
  id: string | null;
  filteredOut: EmailVerdict[];
  detail: string;
  /**
   * WHY it did not go, when it did not. `not_configured` is deliberately its own
   * value: "200 addresses failed" sends somebody off to clean their list, when
   * the truth is that this deployment has no sending server and the list was
   * never the problem.
   */
  /**
   * `crashed` is the one that took a month to name.
   *
   * Every other value here is a DECISION this function made. `crashed` means it
   * never got to make one — something threw and the caller was handed an
   * exception instead of a result. The caller's own catch then reported
   * "unknown: the send did not complete", which names no problem and points at
   * the mail settings, so the settings were checked over and over while the
   * actual fault was somewhere else entirely.
   */
  failure?: "not_configured" | "halted" | "hygiene" | "provider" | "crashed";
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

/**
 * A CAMPAIGN CANNOT THROW EITHER, and for a worse reason than a single send.
 *
 * A batch that throws loses the per-recipient results, so nobody can say which
 * of two thousand messages went and which did not — and a retry then re-sends
 * the ones that did. Every recipient gets a `crashed` row instead, which is a
 * complete answer rather than an exception.
 */
export async function sendEmailBatch(
  items: { to: string; subject: string; html: string; listUnsubscribe?: string }[],
  common?: Parameters<typeof sendEmailBatchInner>[1],
): Promise<SendResult[]> {
  try {
    return await sendEmailBatchInner(items, common);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error(`[email] sendEmailBatch threw for ${items.length} recipients: ${err.message}\n${err.stack || "(no stack)"}`);
    const mode = emailIsConfigured() ? ("live" as const) : ("demo" as const);
    return items.map(() => ({
      ok: false, mode, provider: "crashed", id: null, filteredOut: [],
      failure: "crashed" as const,
      detail: `The sending code failed before any message was handed to a provider: ${err.message}. Nothing was sent, so this batch is safe to retry once the fault is fixed.`,
    }));
  }
}

async function sendEmailBatchInner(
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
  const from = common.from || fromDefault();

  // A batch is marketing by definition, so the halt applies to all of it. The
  // check is here as well as in `sendEmail` because the pooled SMTP path below
  // does not go through `sendEmail` — a guard on one of two routes out is not a
  // guard.
  const halt = await haltFor("send", common.brandId);
  if (halt.halted) {
    return items.map(() => ({
      ok: false, mode: emailIsConfigured() ? "live" as const : "demo" as const, provider: "emergency-stop",
      id: null, filteredOut: [], failure: "halted" as const, detail: halt.message,
    }));
  }

  // Pre-send hygiene, before a connection is opened. Blocked addresses never
  // reach the provider — that is the "no bounce back" guarantee, and batching
  // must not weaken it.
  const verdicts = items.map((it) => ({ item: it, verdict: validateAddress(it.to) }));
  const sendableItems = verdicts.filter((v) => v.verdict.sendable);

  const results = new Map<string, SendResult>();
  for (const v of verdicts) {
    if (!v.verdict.sendable) {
      results.set(v.item.to, {
        ok: false, mode: emailIsConfigured() ? "live" : "demo", provider: "hygiene-filter",
        id: null, filteredOut: [v.verdict], failure: "hygiene",
        detail: `blocked pre-send: ${v.verdict.reason}`,
      });
    }
  }

  const fromDomain = angleAddr(from).split("@")[1] || "";
  const day = new Date().toISOString().slice(0, 10);
  // poolConfigured(), not the frozen constant — see the note on `smtpConfigured`.
  const node = poolConfigured() ? pickNode(fromDomain, day) : null;

  if (node && sendableItems.length) {
    try {
      const prepared = sendableItems.map((v) => ({
        to: v.verdict.email,
        subject: v.item.subject,
        html: v.item.html,
        extra: {
          replyTo: common.replyTo, dkim: common.dkim, listUnsubscribe: v.item.listUnsubscribe,
          // Per recipient, so a failure says whose it was and which address died
          // instead of the intake guessing from the text of the notice — but
          // ONLY once MW_BOUNCE_HOST names a domain that can actually receive.
          // A VERP address on a subdomain with no MX is not bounce attribution,
          // it is an envelope sender the failure notice cannot reach, and that
          // is precisely what hid a month of undelivered mail.
          bounceReturnPath: (bounceHostConfigured() && common.brandId && bounceAddressFor(common.brandId, v.verdict.email)) || bounceReturnPath(),
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
      // One row per recipient, so a campaign that half-delivered is legible
      // afterwards instead of being a single number nobody can act on.
      const subjectOf = new Map(prepared.map((p) => [p.to, p.subject]));
      for (const r of batchResults) {
        void recordAttempt({
          to: r.to, subject: subjectOf.get(r.to) || "", providerId: r.ok ? String(r.id ?? "") : "",
          node: node.label, ok: r.ok, failure: r.ok ? "" : "provider", detail: r.ok ? "" : String(r.error ?? ""),
          at: new Date().toISOString(),
        });
      }
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

/**
 * SEND ONE MESSAGE, AND NEVER THROW.
 *
 * This wrapper is the fix for a month of "mail sends nothing and we cannot say
 * why". `sendEmailInner` classifies every failure it DECIDES on — not_configured,
 * halted, hygiene, provider — and the caller reported `unknown` anyway, because
 * the interesting failures were not decisions. They were exceptions:
 *
 *   • `haltFor` reads the emergency-stop store. A storage error there threw
 *     before a single line of sending logic ran.
 *   • The Resend and SendGrid `fetch` calls were unwrapped, so a DNS failure or
 *     a blocked egress route threw out of the middle of the provider chain.
 *   • Anything else — a bad `MW_SENDING_POOL`, a malformed attachment, a
 *     provider SDK — had the same effect.
 *
 * A caller cannot classify an exception it did not create, so "the send did not
 * complete" was the honest limit of what it could say, and that sentence points
 * at the mail settings, which is where the time went.
 *
 * The remedy is structural rather than another catch at another call site:
 * ONE function, which always returns a `SendResult`. `crashed` carries the
 * message, and the stack goes to the log rather than the response — an SMTP or
 * provider message is safe to show, an internal stack is not.
 */
export async function sendEmail(opts: Parameters<typeof sendEmailInner>[0]): Promise<SendResult> {
  try {
    return await sendEmailInner(opts);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error(`[email] sendEmail threw for ${opts.to}: ${err.message}\n${err.stack || "(no stack)"}`);
    return {
      ok: false,
      mode: emailIsConfigured() ? "live" : "demo",
      provider: "crashed",
      id: null,
      filteredOut: [],
      failure: "crashed",
      // NAMES THE FAULT, and says plainly that it is not the settings — because
      // the previous wording sent somebody to check the settings for a month.
      detail: `The sending code itself failed before it could reach a provider: ${err.message}. This is a fault in the send path, not a missing mail setting — changing SMTP_HOST, SMTP_USER or EMAIL_FROM will not affect it.`,
    };
  }
}

async function sendEmailInner(opts: {
  attachments?: EmailAttachment[];
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  listUnsubscribe?: string; // RFC 8058 one-click unsubscribe URL
  transactional?: boolean;
  /** Lets a brand-scoped emergency stop apply. Absent means only a platform-wide halt reaches it. */
  brandId?: string;
  // When the sending domain is authenticated (sending-domains.ts), the caller
  // passes its DKIM key so the message is signed as that domain — the inbox key.
  dkim?: { domain: string; selector: string; privateKeyPem: string };
}): Promise<SendResult> {
  // THE EMERGENCY STOP, CHECKED BEFORE THE PROVIDER IS CONTACTED.
  //
  // Transactional mail is deliberately exempt and that exemption lives here
  // rather than in the stop: a password reset, a receipt or a security notice
  // must survive the halt, because the incident that made somebody press the
  // button is exactly when they need to get back into their account.
  if (!opts.transactional) {
    const halt = await haltFor("send", opts.brandId);
    if (halt.halted) {
      return {
        ok: false,
        mode: emailIsConfigured() ? "live" : "demo",
        provider: "emergency-stop",
        id: null,
        filteredOut: [],
        failure: "halted",
        detail: halt.message,
      };
    }
  }

  const verdict = validateAddress(opts.to);
  const roleOk = opts.transactional && verdict.checks.role && verdict.valid && !verdict.checks.suppressed;
  if (!verdict.sendable && !roleOk) {
    // The "no bounce back" guarantee: unsendable addresses are filtered
    // here, before any provider is contacted.
    return {
      ok: false,
      mode: emailIsConfigured() ? "live" : "demo",
      provider: "hygiene-filter",
      id: null,
      filteredOut: [verdict],
      failure: "hygiene",
      detail: `blocked pre-send: ${verdict.reason}`,
    };
  }

  // NOTHING WAS SENT, SO THIS IS NOT A SUCCESS.
  //
  // Asked on demand rather than read off the module-level constant: that constant
  // is frozen at import, so "I set the variable and it is still in demo mode" was
  // unanswerable, which is a bad position to be in while mail is going nowhere.
  if (!emailIsConfigured()) {
    return {
      ok: false,
      mode: "demo",
      provider: "not-configured",
      id: null,
      filteredOut: [],
      failure: "not_configured",
      detail:
        "No sending server is configured on this deployment, so nothing left the machine. " +
        "Set the sending pool (MW_SENDING_POOL or SMTP_HOST/SMTP_USER/SMTP_PASS), or RESEND_API_KEY, or SENDGRID_API_KEY.",
    };
  }

  let smtpError = "";
  if (poolConfigured()) {
    // Route through the pool: the sending domain gets a stable home node (its IP),
    // spreading domains across the fleet. One node → same as the single-node setup.
    const fromDomain = angleAddr(opts.from || fromDefault()).split("@")[1] || "";
    const day = new Date().toISOString().slice(0, 10);
    const node = pickNode(fromDomain, day);
    if (node) {
      // The same reconciliation the wire uses, so the ledger records the
      // addresses that were actually on the message rather than a second guess
      // at them.
      const identity = resolveSender({ from: opts.from || fromDefault(), authUser: node.user, bounce: bounceReturnPath() });
      try {
        const id = await sendViaSmtp(node, opts.from || fromDefault(), verdict.email, opts.subject, opts.html, { replyTo: opts.replyTo, dkim: opts.dkim, listUnsubscribe: opts.listUnsubscribe, bounceReturnPath: bounceReturnPath(), attachments: opts.attachments });
        recordNodeSend(node.label, day, 1);
        // WRITE IT DOWN. The provider's queue id is the only thing that turns
        // "nothing sends" into a question their support desk can answer, and it
        // used to be discarded the moment it arrived. The two sender addresses
        // go with it, because a queue id alone cannot say WHO the relay thought
        // was sending.
        void recordAttempt({ to: verdict.email, subject: opts.subject, providerId: id, node: node.label, ok: true, failure: "", detail: "", headerFrom: identity.headerFrom, envelopeFrom: identity.envelopeFrom, at: new Date().toISOString() });
        return { ok: true, mode: "live", provider: getPool().length > 1 ? `smtp:${node.label}` : "smtp", id, filteredOut: [], detail: opts.dkim ? "accepted (DKIM-signed)" : "accepted" };
      } catch (e) {
        // Capture the reason (safe — SMTP status lines carry no credentials) so a
        // failed send is diagnosable instead of a silent "pool-exhausted".
        smtpError = e instanceof Error ? e.message : String(e);
        void recordAttempt({ to: verdict.email, subject: opts.subject, providerId: "", node: node.label, ok: false, failure: "provider", detail: smtpError, headerFrom: identity.headerFrom, envelopeFrom: identity.envelopeFrom, at: new Date().toISOString() });
        // fall through to the HTTP pool on any SMTP failure
      }
    }
  }
  if (RESEND_KEY) {
   try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: opts.from || fromDefault(), to: [verdict.email], subject: opts.subject, html: opts.html, ...(opts.replyTo ? { reply_to: opts.replyTo } : {}), ...(opts.attachments?.length ? { attachments: opts.attachments.map((a) => ({ filename: a.filename, content: a.contentBase64 })) } : {}) }),
    });
    if (res.ok) {
      const body = (await res.json()) as { id?: string };
      return { ok: true, mode: "live", provider: "resend", id: body.id ?? null, filteredOut: [], detail: "accepted" };
    }
    // fall through to next provider on failure
   } catch (e) {
    // A NETWORK FAILURE HERE USED TO THROW OUT OF sendEmail ENTIRELY.
    // `fetch` rejects on DNS failure, a TLS error, a blocked egress route or an
    // abort — none of which is exotic on a fresh host — and neither provider
    // call was wrapped. So a deployment that could not reach Resend did not
    // fall through to SendGrid and did not return "provider": it threw, and
    // every caller reported an unclassified failure.
    smtpError = smtpError || `Resend unreachable: ${e instanceof Error ? e.message : String(e)}`;
   }
  }

  if (SENDGRID_KEY) {
   try {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${SENDGRID_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: verdict.email }] }],
        from: { email: (opts.from || fromDefault()).replace(/.*<(.+)>.*/, "$1") },
        ...(opts.replyTo ? { reply_to: { email: opts.replyTo.replace(/.*<(.+)>.*/, "$1") } } : {}),
        subject: opts.subject,
        content: [{ type: "text/html", value: opts.html }],
      }),
    });
    if (res.status === 202) {
      return { ok: true, mode: "live", provider: "sendgrid", id: res.headers.get("x-message-id"), filteredOut: [], detail: "accepted" };
    }
   } catch (e) {
    smtpError = smtpError || `SendGrid unreachable: ${e instanceof Error ? e.message : String(e)}`;
   }
  }

  return {
    ok: false,
    mode: "live",
    provider: "pool-exhausted",
    id: null,
    filteredOut: [],
    failure: "provider",
    detail: smtpError ? `SMTP send failed: ${smtpError}` : "all providers failed — send queued for retry",
  };
}
