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
