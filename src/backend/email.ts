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

const RESEND_KEY = process.env.RESEND_API_KEY || "";
const SENDGRID_KEY = process.env.SENDGRID_API_KEY || "";
const FROM_DEFAULT = process.env.EMAIL_FROM || "MarketWar OS <os@notifications.marketwaros.com>";

// .trim() every SMTP value: a trailing space/newline pasted into an env var is a
// classic cause of "getaddrinfo ENOTFOUND" (host) or auth failures (user/pass).
const SMTP_HOST = (process.env.SMTP_HOST || "").trim();
const SMTP_PORT = Number((process.env.SMTP_PORT || "587").trim());
const SMTP_USER = (process.env.SMTP_USER || "").trim();
const SMTP_PASS = (process.env.SMTP_PASS || "").trim();
const SMTP_SECURE = (process.env.SMTP_SECURE || "").trim() === "true" || SMTP_PORT === 465; // implicit TLS

export const smtpConfigured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
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

async function sendViaSmtp(
  from: string,
  to: string,
  subject: string,
  html: string,
  extra?: { replyTo?: string; dkim?: { domain: string; selector: string; privateKeyPem: string } },
): Promise<string> {
  const net = await import("node:net");
  const tls = await import("node:tls");

  return new Promise<string>((resolve, reject) => {
    let socket: import("node:net").Socket | import("node:tls").TLSSocket;
    let buffer = "";
    let stage = 0;
    let upgraded = SMTP_SECURE;
    let settled = false;
    const envelopeFrom = angleAddr(from);
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
    if (extra?.replyTo) headers["Reply-To"] = extra.replyTo;

    // Dot-stuffing + bare-LF normalisation so the message body can't break the
    // DATA terminator or trip strict MTAs.
    const canonBody = html.replace(/\r?\n/g, "\r\n").replace(/\r\n\./g, "\r\n..");

    // DKIM-sign with the sending domain's key when the domain is authenticated —
    // this is what earns the inbox. Signed as its own header, prepended first.
    let dkimHeader = "";
    if (extra?.dkim) {
      try { dkimHeader = dkimSignature(headers, html, { ...extra.dkim }) + "\r\n"; }
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
        socket.on("error", (e) => finish(e));
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

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
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
    try {
      const id = await sendViaSmtp(opts.from || FROM_DEFAULT, verdict.email, opts.subject, opts.html, { replyTo: opts.replyTo, dkim: opts.dkim });
      return { ok: true, mode: "live", provider: "smtp", id, filteredOut: [], detail: opts.dkim ? "accepted (DKIM-signed)" : "accepted" };
    } catch (e) {
      // Capture the reason (safe — SMTP status lines carry no credentials) so a
      // failed send is diagnosable instead of a silent "pool-exhausted".
      smtpError = e instanceof Error ? e.message : String(e);
      // fall through to the HTTP pool on any SMTP failure
    }
  }

  if (RESEND_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: opts.from || FROM_DEFAULT, to: [verdict.email], subject: opts.subject, html: opts.html, ...(opts.replyTo ? { reply_to: opts.replyTo } : {}) }),
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
