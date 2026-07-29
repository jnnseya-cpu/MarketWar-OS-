// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Human check — keeping scripted signups out of the platform, and out of the
// AI budget.
//
// READ THIS BEFORE TRUSTING IT. The signup form talks straight to Google's
// Identity Toolkit using the public web API key, which is visible in the page
// source. A bot does not have to load our React form at all — it can POST to
// Google directly. So NOTHING in this file, and nothing in the form, can stop a
// determined script from creating a Firebase account.
//
// Only two things actually can, and they are different jobs:
//
//   1. STOP THE ACCOUNT BEING CREATED. That has to be enforced by Google, at the
//      endpoint the bot is calling: Firebase App Check with reCAPTCHA, and/or
//      Identity Platform's reCAPTCHA Enterprise bot protection. Both are console
//      settings plus a site key. See docs/HUMAN-VERIFICATION.md. Until they are
//      switched on, accounts CAN be created by a script and this module says so
//      rather than implying otherwise.
//
//   2. MAKE THE ACCOUNT WORTHLESS UNTIL A HUMAN IS BEHIND IT. That we control
//      completely, and it is the half that protects the money. A new wallet gets
//      the free allowance only after this check passes, so a script that creates
//      ten thousand accounts gets ten thousand empty ones and spends none of the
//      owner's provider budget.
//
// The check itself is deliberately keyless — proof of work, a honeypot, form
// timing, throwaway-domain rejection and a verified email. It is worth being
// precise about what that buys: proof of work does not identify a human, it
// prices volume. One signup costs a fraction of a second. A hundred thousand
// costs real CPU-hours, which is what turns farming the free allowance from
// free into not worth it. It will not stop one determined person signing up
// once, and it is not meant to.

import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { meetsDifficulty, DEFAULT_BITS, CHALLENGE_TTL_MS, POW_VERSION } from "@/shared/proof-of-work";

export const POW_BITS = Math.min(24, Math.max(8, Number(process.env.HUMAN_CHECK_BITS || DEFAULT_BITS)));

/** How fast a form CAN be filled in by a person who already knows what they are typing. */
const MIN_FORM_MS = 1_200;
/** Beyond this the page has been open so long the timing tells us nothing. */
const MAX_FORM_MS = 60 * 60_000;

/** How long a passed check stays good for — enough to finish signing up, no more. */
export const HUMAN_TOKEN_TTL_MS = 20 * 60_000;

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

// Set HUMAN_CHECK_SECRET in production. Without it a random per-process secret
// is used, which works on one instance and fails across a restart or a second
// one — a customer would solve a challenge and be told it was invalid. The
// health route reports this rather than leaving it to be discovered in the wild.
const EPHEMERAL_SECRET = randomBytes(32).toString("hex");
export const humanCheckSecretConfigured = Boolean((process.env.HUMAN_CHECK_SECRET || "").trim());
function secret(): string {
  return (process.env.HUMAN_CHECK_SECRET || "").trim() || EPHEMERAL_SECRET;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

/** Constant-time compare — a fast-fail loop leaks the signature one byte at a time. */
function sigEqual(a: string, b: string): boolean {
  const x = Buffer.from(a || "", "utf8");
  const y = Buffer.from(b || "", "utf8");
  if (x.length !== y.length || x.length === 0) return false;
  return timingSafeEqual(x, y);
}

// ---------------------------------------------------------------------------
// Challenge
// ---------------------------------------------------------------------------

export type Challenge = { v: string; nonce: string; bits: number; expiresAt: number; sig: string };

/**
 * Issue a puzzle.
 *
 * Bound to the caller so a challenge solved on one machine is not a token that
 * can be handed round. The binding is a coarse signal (IP + user agent), not an
 * identity — it raises the cost of reselling solutions, nothing more.
 */
export function issueChallenge(binding: string, now: number = Date.now()): Challenge {
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = now + CHALLENGE_TTL_MS;
  const bits = POW_BITS;
  return { v: POW_VERSION, nonce, bits, expiresAt, sig: sign(`${POW_VERSION}|${nonce}|${bits}|${expiresAt}|${binding}`) };
}

// A solved challenge is worth one signup, not many. Bounded so a flood of
// solutions cannot grow this without limit — per instance, like the rate
// limiter, which is stated in the docs rather than assumed away.
const spent = new Set<string>();
const SPENT_MAX = 20_000;
function markSpent(nonce: string): void {
  if (spent.size >= SPENT_MAX) spent.clear();
  spent.add(nonce);
}

export type CheckInput = {
  challenge: Partial<Challenge> | null | undefined;
  solution: string | number | null | undefined;
  binding: string;
  /** Milliseconds between the form rendering and being submitted. */
  elapsedMs?: number;
  /** A field no human can see. Anything in it means a script filled the form in. */
  honeypot?: string;
  email?: string;
};

export type CheckResult =
  | { ok: true; token: string; expiresAt: number }
  | { ok: false; reason: string; retryable: boolean };

/**
 * Verify a solved challenge.
 *
 * Every rejection says what to do about it. A person who fails this is a
 * customer we just turned away, so "verification failed" with no reason is not
 * an acceptable answer.
 */
export async function verifyHumanCheck(input: CheckInput, now: number = Date.now()): Promise<CheckResult> {
  const c = input.challenge;
  if (!c || !c.nonce || !c.sig || typeof c.bits !== "number" || typeof c.expiresAt !== "number") {
    return { ok: false, reason: "The verification challenge was missing or malformed. Reload the page and try again.", retryable: true };
  }
  if (c.v !== POW_VERSION) {
    return { ok: false, reason: "This page was loaded before an update. Reload it and try again.", retryable: true };
  }
  if (!sigEqual(c.sig, sign(`${POW_VERSION}|${c.nonce}|${c.bits}|${c.expiresAt}|${input.binding}`))) {
    // Either tampering, or the challenge was issued to a different client, or
    // HUMAN_CHECK_SECRET is unset and this is a second instance.
    return { ok: false, reason: "The verification challenge did not match this browser. Reload the page and try again.", retryable: true };
  }
  if (now > c.expiresAt) {
    return { ok: false, reason: "The verification challenge expired. Reload the page and try again.", retryable: true };
  }
  if (c.bits < POW_BITS) {
    return { ok: false, reason: "The verification challenge was too easy to be accepted. Reload the page and try again.", retryable: true };
  }
  if (spent.has(c.nonce)) {
    return { ok: false, reason: "That verification was already used. Reload the page and try again.", retryable: true };
  }

  // The honeypot and the clock are checked before the expensive hash, so a
  // crude bot costs us nothing to reject.
  if ((input.honeypot || "").trim()) {
    return { ok: false, reason: "Automated submission detected.", retryable: false };
  }
  if (typeof input.elapsedMs === "number") {
    if (input.elapsedMs < MIN_FORM_MS) {
      return { ok: false, reason: "That form was submitted faster than a person can fill it in. If this is wrong, wait a moment and try again.", retryable: true };
    }
    if (input.elapsedMs > MAX_FORM_MS) {
      return { ok: false, reason: "This page has been open too long. Reload it and try again.", retryable: true };
    }
  }

  const email = (input.email || "").trim().toLowerCase();
  if (email && isDisposableEmail(email)) {
    return {
      ok: false,
      reason: `${email.split("@")[1]} is a disposable-mail service. Sign up with an address you can actually receive mail at — the free allowance needs a verified inbox.`,
      retryable: false,
    };
  }

  if (!(await meetsDifficulty(c.nonce, input.solution ?? "", c.bits))) {
    return { ok: false, reason: "The verification did not solve correctly. Reload the page and try again.", retryable: true };
  }

  markSpent(c.nonce);
  const expiresAt = now + HUMAN_TOKEN_TTL_MS;
  return { ok: true, expiresAt, token: issueHumanToken(input.binding, expiresAt) };
}

// ---------------------------------------------------------------------------
// The token a passed check produces
// ---------------------------------------------------------------------------

export function issueHumanToken(binding: string, expiresAt: number): string {
  const body = `${expiresAt}.${binding}`;
  return `${expiresAt}.${sign(body)}`;
}

export function verifyHumanToken(token: string | null | undefined, binding: string, now: number = Date.now()): { ok: boolean; reason?: string } {
  const raw = (token || "").trim();
  if (!raw) return { ok: false, reason: "No human-verification token was presented." };
  const [expStr, sig] = raw.split(".");
  const expiresAt = Number(expStr);
  if (!Number.isFinite(expiresAt) || !sig) return { ok: false, reason: "The human-verification token is malformed." };
  if (now > expiresAt) return { ok: false, reason: "The human-verification token has expired — run the check again." };
  if (!sigEqual(sig, sign(`${expiresAt}.${binding}`))) return { ok: false, reason: "The human-verification token does not match this browser." };
  return { ok: true };
}

/** IP + user agent. Coarse on purpose: a stricter binding breaks mobile users whose IP changes mid-form. */
export function bindingFor(req: Request): string {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  const ua = (req.headers.get("user-agent") || "").slice(0, 120);
  return createHmac("sha256", secret()).update(`${ip}|${ua}`).digest("hex").slice(0, 32);
}

// ---------------------------------------------------------------------------
// Throwaway mailboxes
// ---------------------------------------------------------------------------

// The known-worst offenders. This list is a speed bump, not a wall — there are
// thousands of these domains and new ones daily, so the REAL barrier is
// requiring a verified email: a farm needs a working inbox per account whether
// or not we recognise the domain. Kept short and specific rather than long and
// wrong; blocking a legitimate provider costs a paying customer.
const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com",
  "10minutemail.com", "10minutemail.net", "tempmail.com", "temp-mail.org",
  "throwawaymail.com", "yopmail.com", "yopmail.fr", "trashmail.com",
  "getnada.com", "dispostable.com", "maildrop.cc", "fakeinbox.com",
  "mailnesia.com", "mytemp.email", "moakt.com", "tempr.email",
  "spamgourmet.com", "mailcatch.com", "inboxbear.com", "emailondeck.com",
  "burnermail.io", "mohmal.com", "linshiyouxiang.net", "harakirimail.com",
]);

export function isDisposableEmail(email: string): boolean {
  const domain = (email || "").trim().toLowerCase().split("@")[1] || "";
  if (!domain) return false;
  if (DISPOSABLE.has(domain)) return true;
  // Their subdomains too ("inbox.mailinator.com"), but ONLY as a suffix on a
  // dot — a plain substring test would reject "notmailinator.com.au" style
  // legitimate domains, the same false-positive class as the claim guard.
  for (const d of DISPOSABLE) if (domain.endsWith(`.${d}`)) return true;
  return false;
}

/** What the operator needs to know about whether this is actually protecting anything. */
export function humanCheckStatus(): {
  bits: number;
  secretConfigured: boolean;
  appCheckConfigured: boolean;
  blocksAccountCreation: boolean;
  note: string;
} {
  const appCheck = Boolean((process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "").trim());
  return {
    bits: POW_BITS,
    secretConfigured: humanCheckSecretConfigured,
    appCheckConfigured: appCheck,
    // Honest: our check gates the allowance, it does not gate Identity Toolkit.
    blocksAccountCreation: appCheck,
    note: [
      `Proof of work at ${POW_BITS} bits, plus honeypot, form timing and throwaway-domain rejection. This gates the free ACU allowance, so a scripted account is created empty and costs nothing.`,
      appCheck
        ? "App Check has a reCAPTCHA site key, so account creation itself can be enforced by Google — confirm enforcement is switched ON for Authentication in the Firebase console, because the key alone does not enforce anything."
        : "NEXT_PUBLIC_RECAPTCHA_SITE_KEY is not set, so nothing stops a script calling Google's Identity Toolkit directly with the public web API key and creating accounts. They will be empty accounts with no allowance, but they will exist. Set the key and turn on App Check enforcement to stop them being created at all.",
      humanCheckSecretConfigured
        ? ""
        : "HUMAN_CHECK_SECRET is not set, so challenges are signed with a per-process key. On more than one instance, or after a restart, a customer can solve a challenge and be told it did not match. Set it before relying on this in production.",
    ].filter(Boolean).join(" "),
  };
}

/** Test seam — the spent-nonce set is module state and would leak between cases. */
export function __resetHumanCheck(): void { spent.clear(); }
