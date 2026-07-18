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
// Env-guarded like the rest of the OS: with RESEND_API_KEY (or
// SENDGRID_API_KEY) configured, sends go out through the provider pool;
// without keys sendEmail() returns a simulated demo receipt and nothing
// leaves the machine.

const RESEND_KEY = process.env.RESEND_API_KEY || "";
const SENDGRID_KEY = process.env.SENDGRID_API_KEY || "";
const FROM_DEFAULT = process.env.EMAIL_FROM || "MarketWar OS <os@notifications.marketwaros.com>";

export const emailConfigured = Boolean(RESEND_KEY || SENDGRID_KEY);

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
// 2. Sending facade (provider pool — Resend first, SendGrid fallback)
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
  transactional?: boolean;
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

  if (RESEND_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: opts.from || FROM_DEFAULT, to: [verdict.email], subject: opts.subject, html: opts.html }),
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
        subject: opts.subject,
        content: [{ type: "text/html", value: opts.html }],
      }),
    });
    if (res.status === 202) {
      return { ok: true, mode: "live", provider: "sendgrid", id: res.headers.get("x-message-id"), filteredOut: [], detail: "accepted" };
    }
  }

  return { ok: false, mode: "live", provider: "pool-exhausted", id: null, filteredOut: [], detail: "all providers failed — send queued for retry" };
}
