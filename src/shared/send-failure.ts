// WHY A MESSAGE DID NOT GO, IN WORDS THE PERSON WAITING FOR IT CAN USE.
//
// THE HOLE THIS CLOSES. `sendEmail` returns a `failure` category and a `detail`
// string saying exactly what went wrong — a missing sending server, a mail
// server that refused the credentials, a suppressed address. The free audit
// route carries both back in its response as `emailNote`. And the page that
// renders that response says, for every one of them:
//
//   "we could not email you a copy just now"
//
// So the reason existed, travelled all the way to the browser, and was dropped
// one line before it could be read. The owner's report was "never send any
// emails", and nothing on the screen could tell them whether the server was
// unconfigured, refusing the password, or rejecting that particular address —
// which are three different problems with three different fixes.
//
// That is the defect class this platform keeps producing: a value that exists on
// one side of a boundary and is never carried across.
//
// WHAT THIS DOES NOT DO. It never shows the raw server line to a stranger. An
// SMTP rejection can carry the sending host, the account name and the provider's
// internal reasoning, and a member of the public who typed their website into a
// free tool has no use for any of it. Each category maps to one plain sentence;
// the precise detail stays in the API response and the server log, where the
// person who can act on it will look.

// `crashed` is not one of `sendEmail`'s return values, and that is the point.
// Every `ok: false` path inside `sendEmail` carries one of the four categories
// below — so a caller reporting "unknown" has not received a classified failure
// at all: the sending path THREW, before or during the attempt, and the caller's
// try/catch is all that stands between that and a 500.
//
// It was reported as "the send did not complete" — the `unknown` default, the
// one sentence in this file that names no problem and suggests no fix — while
// the owner had every setting in place and no email had ever arrived. The
// distinction matters because the two have opposite diagnoses: a classified
// failure means the sending path ran and something refused, while a crash means
// it never ran, and no amount of checking SMTP credentials will explain it.
export type SendFailure = "halted" | "hygiene" | "not_configured" | "provider" | "crashed" | "unknown";

/** The category, from whatever the send actually returned. */
export function sendFailureOf(raw: unknown): SendFailure {
  const v = typeof raw === "string" ? raw.trim() : "";
  return v === "halted" || v === "hygiene" || v === "not_configured" || v === "provider" || v === "crashed" ? v : "unknown";
}

/**
 * One sentence for the person who was expecting the message.
 *
 * Written so that each one names a DIFFERENT problem: somebody reading these
 * should never have to ask which of the three it was.
 */
export function publicSendFailure(raw: unknown): string {
  switch (sendFailureOf(raw)) {
    case "not_configured":
      return "no mail server is set up on this deployment yet, so nothing was sent";
    case "provider":
      return "the mail server refused the message";
    case "hygiene":
      return "that address has bounced or unsubscribed before, so we do not send to it";
    case "halted":
      return "sending is paused on this account";
    case "crashed":
      return "the mail service on this deployment failed to start, so nothing was sent — this is our fault, not your address";
    default:
      return "the send did not complete";
  }
}

/**
 * What the OPERATOR should do about it, and where to look.
 *
 * Kept beside the public sentence rather than in a runbook, because the runbook
 * is not open when somebody is staring at a failed send.
 */
export function operatorFix(raw: unknown): string {
  switch (sendFailureOf(raw)) {
    case "not_configured":
      return "Set SMTP_HOST + SMTP_USER + SMTP_PASS (all three), or RESEND_API_KEY, or SENDGRID_API_KEY. Then open /api/health/email.";
    case "provider":
      return "The credentials are present but the server rejected them or the message. Open /api/health/email — it opens a real SMTP connection and names the stage it failed at.";
    case "hygiene":
      return "The address is on the suppression ledger from an earlier bounce, complaint or unsubscribe. That is working as intended; nothing to fix.";
    case "halted":
      return "The emergency stop is engaged for this lane. Clear it before sending resumes.";
    case "crashed":
      return "The sending path THREW rather than returning a failure, so no provider was ever contacted and the mail settings are not the thing to check first. This is a module that failed to load or initialise — most often Firebase Admin credentials that are absent or malformed on this deployment, since the send path reads the suppression ledger before it sends. The thrown message is in the server log on the line above this one. Open /api/health/email, which reports a load failure rather than dying with it.";
    default:
      return "Open /api/health/email for a live check of the sending path.";
  }
}

// WHICH SMTP VERB WAS REFUSED — SAYABLE WITHOUT NAMING ANYBODY.
//
// THE DEAD END THIS ENDS. The free audit told the owner "the mail server refused
// the message", which is the right sentence for a stranger and useless to the
// person who can fix it. `/api/health/email` HAS the answer — it opens a real
// SMTP connection and records the exact stage — but the whole probe is behind a
// platform-admin session, so the one line that mattered was reachable only by
// signing in, on a platform where signing in was itself broken.
//
// The STAGE is not a secret. It is which verb the server refused, and every one
// of them maps to a different fault with a different fix. The server's own words,
// the mail host, the account username and the recipient stay gated exactly as
// they were — those name people and machines. This names a protocol step.
export function smtpStageVerdict(stage: string | null | undefined, ok: boolean): string {
  if (ok) return "SENDING. The server authenticated and accepted an envelope just now, so configuration is not the problem — if mail still does not arrive the cause is delivery (SPF, DKIM, DMARC or the receiving side).";
  switch ((stage || "").trim()) {
    case "connect":
      return "NOT SENDING — the connection never opened. The host or port is wrong, or the host blocks outbound SMTP. Nothing about the password or the addresses has been tested yet.";
    case "ehlo":
    case "starttls":
      return "NOT SENDING — the connection opened but the TLS handshake failed. This is a port/encryption mismatch: 465 needs implicit TLS, 587 needs STARTTLS.";
    case "auth":
    case "auth-user":
    case "auth-pass":
      return "NOT SENDING — THE SERVER REFUSED THE PASSWORD. The mailbox in SMTP_USER and the password in SMTP_PASS do not match. Mailbox passwords are per mailbox, not per domain, so if SMTP_USER was changed recently SMTP_PASS has to be that mailbox's own password. Many hosts also require an app-specific password rather than the login one.";
    case "mail-from":
      return "NOT SENDING — the password was accepted and the server then refused the SENDER address. EMAIL_FROM must be an address this relay is allowed to send as.";
    case "rcpt-to":
      return "NOT SENDING — the password was accepted and the server then refused the RECIPIENT. A relay that authenticates you and rejects RCPT TO is usually restricted to its own domain.";
    case "mail-from-fallback":
      return "SENDING, but only as the visible From address — the envelope sender was refused. Set MW_BOUNCE_ADDRESS to a mailbox this relay accepts, or bounces will go nowhere.";
    default:
      return "NOT SENDING — the probe did not reach a recognised stage. Sign in as a platform admin for the server's own words.";
  }
}

// IS THIS FAILURE THE RECIPIENT'S FAULT? — the question that decides whether an
// address is destroyed.
//
// WHAT HAPPENED, ON THE LIVE PLATFORM, TWICE. The campaign route suppressed any
// failure whose text contained a 5xx code:
//
//     if (/\b5\d\d\b/.test(r.detail || "") || r.failure === "hygiene") → bounce
//
// The SMTP server was refusing our PASSWORD — `535 5.7.8 Authentication
// failed`. `535` is a 5xx. So 104 perfectly good prospects on one brand, and 250
// on another, were recorded as hard bounces and permanently suppressed because
// OUR credential was wrong. The vault went from 104 sendable to 0. Worse, the
// fabricated bounce rate then drove the deliverability agent to tell the owner
// their list was dirty and to buy a verification service — a wrong number
// producing wrong advice producing wrong spending.
//
// This is the codebase's own rule — "a panel must not blame the owner for its own
// failed request" — in the one place where the cost is not a screen but a
// customer's data, and where the damage is permanent.
//
// THE RULE, AND IT IS DELIBERATELY CONSERVATIVE: suppress ONLY on a code that
// names the recipient's mailbox. Anything else — an authentication refusal, a
// syntax error, a rate limit, a policy rejection of the SENDER, a dropped
// connection — is about us or about the moment, and a retry costs a fraction of
// a penny while a wrongful suppression costs a customer for ever.
//
// IF IN DOUBT, DO NOT SUPPRESS.

/** Codes that mean THIS MAILBOX does not exist or cannot receive. */
const RECIPIENT_REJECTION = [
  550, // mailbox unavailable / no such user — the overwhelming majority of real bounces
  551, // user not local, no forwarding
  552, // mailbox full (over quota)
  553, // mailbox name not allowed
];

/**
 * Codes that look like a bounce and are not. Listed explicitly rather than left
 * to fall through, because each one has been mistaken for a bad address:
 *   535/530/534/538  the server refused OUR login
 *   500–504          a syntax or command error — our code, not their mailbox
 *   554              usually a policy rejection of the sender or the content
 *   521/541          the server does not accept mail from us at all
 */
const NOT_THE_RECIPIENT = [500, 501, 502, 503, 504, 521, 530, 534, 535, 538, 541, 554];

/** Enhanced status classes that name the sender or the session, never the mailbox. */
const SENDER_DSN = /\b5\.7\.[0-9]+\b/;
/** Enhanced status codes that DO name the mailbox. */
const MAILBOX_DSN = /\b5\.1\.[0-9]+\b|\b5\.2\.[12]\b/;

/**
 * True only when the server's words identify the RECIPIENT as the problem.
 *
 * Reads the enhanced status code first when there is one — `550 5.7.1` is a
 * policy rejection wearing a mailbox code's clothes, and treating it as a bounce
 * suppresses somebody whose address is fine.
 */
export function isRecipientRejection(detail: unknown): boolean {
  const text = typeof detail === "string" ? detail : "";
  if (!text.trim()) return false;

  // Authentication is never the recipient's doing, whatever code carries it.
  if (/\bauth(entication)?\b|\bpassword\b|\blogin\b|\bcredential/i.test(text)) return false;

  if (MAILBOX_DSN.test(text)) return true;
  if (SENDER_DSN.test(text)) return false;

  const codes = (text.match(/\b[45]\d\d\b/g) || []).map(Number);
  if (!codes.length) return false;
  // A 4xx anywhere means "try later" — never permanent, never a suppression.
  if (codes.some((c) => c >= 400 && c < 500)) return false;
  if (codes.some((c) => NOT_THE_RECIPIENT.includes(c))) return false;
  return codes.some((c) => RECIPIENT_REJECTION.includes(c));
}

// THE SERVER'S OWN WORDS, WITH THE NAMES TAKEN OUT.
//
// WHY THIS EXISTS. `/api/health/email` opens a real SMTP connection and captures
// the exact line the server refused with — `535 5.7.8 Error: authentication
// failed`, or `535 Incorrect authentication data`, or `550 SMTP is disabled for
// this account`. Those three sentences carry the same stage and demand three
// completely different actions, and the whole of it was gated behind a
// platform-admin session.
//
// The owner spent a day being told to reset a password, twice, because the one
// fact that would have separated "wrong password" from "SMTP turned off for this
// mailbox" from "locked out after too many attempts" was unreadable to them. A
// diagnostic only its author can read is not a diagnostic.
//
// WHAT IS WITHHELD, AND IT IS ONLY WHAT NAMES SOMEBODY. The line can carry the
// mail host and the account. Both are stripped. What is left is a status code
// and a sentence written by the mail server about the mail server, which is
// exactly the evidence and none of the identity.
export function redactSmtpLine(line: unknown): string {
  let text = typeof line === "string" ? line : "";
  if (!text.trim()) return "";
  // Any mailbox — the account we logged in as, or an envelope address.
  text = text.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "«address»");
  // Any hostname. Deliberately broad: a mail host is often the giveaway even
  // when no address appears, and losing a hostname costs the reader nothing.
  text = text.replace(/\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|uk|de|fr|es|it|nl|pl|ru|info|biz|me|dev|app|mail|email)\b/gi, "«host»");
  // Bare IPv4, for servers that name themselves that way.
  text = text.replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "«ip»");
  // A URL a server offers for help is safe and useful, but it may carry a host,
  // so it has already been reduced above; collapse whitespace and bound it.
  return text.replace(/\s+/g, " ").trim().slice(0, 300);
}

/**
 * What the server's refusal actually means, when its words are specific enough
 * to say. Returns "" when they are not — an invented reading is worse than none.
 */
export function readSmtpRefusal(line: unknown): string {
  const t = (typeof line === "string" ? line : "").toLowerCase();
  if (!t.trim()) return "";
  if (/disabled|not enabled|not allowed|forbidden|smtp access/.test(t)) {
    return "The server says SMTP sending is DISABLED or not permitted for this mailbox — that is a setting at the mail host, not a wrong password. Turn SMTP on for this account, or ask the host to.";
  }
  if (/too many|rate|throttl|try again later|temporarily (?:locked|blocked|suspended)|lockout/.test(t)) {
    return "The server says this account is temporarily blocked, usually after repeated failed logins. The password may already be correct. Wait, then check again before changing anything.";
  }
  if (/app[- ]?(?:specific )?password|two[- ]?factor|2fa/.test(t)) {
    return "The server is asking for an app-specific password rather than the mailbox login. Create one at the mail host and use that.";
  }
  if (/incorrect|invalid|failed|not accepted|bad/.test(t) && /auth|credential|password|login/.test(t)) {
    return "The server says the credential itself is wrong for this mailbox. If it was just reset, make sure the change was saved on the host AND that the deployment was rebuilt after it.";
  }
  return "";
}
