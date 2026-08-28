// MARKETWAR OS — THE HUMAN GATE.
//
// Owner directive: only humans sign up and log in, to every section and every
// part of this OS. `human-check.ts` already proves a person is present at the
// door; this module is what keeps that true for the whole visit, and applies it
// to every route rather than to the two that remembered to ask.
//
// WHAT IT ACTUALLY DOES, STATED HONESTLY:
//
//   • A passed human check mints a signed, HttpOnly session cookie. Middleware
//     checks it on every matched path, so coverage is a ROUTING RULE and not a
//     habit each route has to keep. A route added tomorrow is covered the day
//     it is added.
//   • Sensitive actions — money leaving, identity, admin, keys — require the
//     check to have been passed RECENTLY, not just at some point today. A
//     twelve-hour session is a twelve-hour window for whoever picks the laptop
//     up, and that is the window a payout would leave through.
//   • It is NOT a proof of humanity. Nothing served over HTTP is. It proves a
//     browser passed a cost-bearing challenge and has held a signed cookie
//     since; a determined person driving a real browser passes it. What it
//     stops is SCALE — scripts, farms, credential-stuffing runs, scraped
//     sessions replayed elsewhere — which is the threat that actually empties
//     wallets. Anyone who says a web check does more than that is selling
//     something.
//
// NO NODE `crypto` HERE ON PURPOSE. This module runs in middleware (edge
// runtime) as well as in Node route handlers, so it signs with Web Crypto,
// which exists in both. Importing `node:crypto` here would work in tests and
// fail in production, which is the worst place to find out.

// Layer guard: this is a backend module. It runs in middleware and in route
// handlers, never in the browser.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

export const HUMAN_COOKIE = "mw_human";

/** How long one passed check keeps a session open. */
export const SESSION_TTL_MS = 12 * 60 * 60_000;

/**
 * How recently the check must have been passed for a sensitive action.
 *
 * Fifteen minutes is the number a bank uses for the same reason: it is long
 * enough that a person doing one job is not challenged twice, and short enough
 * that an unattended laptop is not a payout button.
 */
export const REVERIFY_MS = 15 * 60_000;

export type Sensitivity = "normal" | "sensitive";

/**
 * Paths that always require a RECENT check, whatever else they are.
 *
 * Written as prefixes and matched here rather than in each route, because the
 * list of things that move money is exactly the list nobody should be able to
 * extend by forgetting.
 */
export const SENSITIVE_PREFIXES = [
  "/api/share2earn",      // withdrawals, identity, claims
  "/api/creator-engine",  // payouts
  "/api/admin",
  "/api/billing",
  "/api/checkout",
  "/api/connections",     // third-party credentials
  "/api/settings",
  "/dashboard/earnings",
  "/dashboard/admin",
  "/dashboard/settings",
];

/** Paths the gate must never close, or nobody could ever open it. */
export const ALWAYS_OPEN_PREFIXES = [
  "/api/auth/human",      // the check itself
  "/api/health",
  "/api/client-error",
  "/verify-human",
  "/login",
  "/signup",
  "/r/",                  // a creator's tracked link — a public redirect
];

/**
 * THE MACHINE LANES.
 *
 * "Block all non-human instructions" cannot mean "block everything without a
 * browser", because a Stripe webhook, the nightly autopilot and an inbound
 * email are not people and never will be. It means something stricter and more
 * useful: **every request must be attributable either to a verified human
 * session or to a machine we invited, authenticated as that machine.** An
 * unauthenticated script has no lane at all.
 *
 * Each lane names the credential that makes it legitimate. The gate checks that
 * a credential of the right shape is PRESENT; the route behind it verifies the
 * credential itself (a Stripe signature needs the raw body, which middleware
 * should not consume). That division is stated rather than glossed, because a
 * gate that claimed to verify a signature it never read would be worse than one
 * that admits it delegates.
 */
export type MachineLane = {
  prefix: string;
  credential: "cron_bearer" | "provider_signature";
  what: string;
  /**
   * May an unauthenticated GET/HEAD read this path?
   *
   * True only where the GET is a provider's own handshake or self-documenting
   * text that returns no secret. It is FALSE on every scheduler lane, whose GET
   * is the thing that runs the job and spends the provider budget.
   */
  openToRead?: boolean;
};

export const MACHINE_LANES: MachineLane[] = [
  // openToRead: the GET on every webhook route is either self-documenting text
  // with no secret in it, or META'S OWN VERIFICATION HANDSHAKE — which arrives
  // as a GET carrying `hub.verify_token` and no signature header, and was
  // therefore refused before it could ever reach the check that authenticates
  // it. The Meta webhook could not be verified at all.
  { prefix: "/api/webhooks", credential: "provider_signature", what: "Stripe, email, Meta and Zernio webhooks. The route verifies the provider's signature against the raw body.", openToRead: true },
  { prefix: "/api/inbound", credential: "provider_signature", what: "Inbound mail delivered by the mail provider — and the dashboard's own inbox, which reads and writes the same store." },
  { prefix: "/api/orchestrator/scheduled", credential: "cron_bearer", what: "The scheduler, authorised by CRON_SECRET, which the owner set." },
  { prefix: "/api/trends/scheduled", credential: "cron_bearer", what: "The scheduler." },
  { prefix: "/api/ai-visibility/scheduled", credential: "cron_bearer", what: "The scheduler." },
  { prefix: "/api/autopilot/nightly", credential: "cron_bearer", what: "The scheduler." },
  { prefix: "/api/blog/daily", credential: "cron_bearer", what: "The scheduler." },
  { prefix: "/api/seo-autopilot", credential: "cron_bearer", what: "The scheduler." },
];

/**
 * PUBLIC FORM LANES — where requiring a session would be circular.
 *
 * You cannot demand a signed-in human session on the page somebody uses to
 * become a signed-in human. These paths carry their own bot cost instead:
 * proof of work, a honeypot, form timing, and rate limits per address. That is
 * a weaker guarantee than a session cookie and it is the correct one here.
 */
export const PUBLIC_FORM_LANES = [
  // The free audit. A stranger who has never heard of us types their website in
  // and gets a real answer — requiring a session here would close the front door
  // of the entire organic acquisition machine.
  "/api/audit",
  "/api/share2earn/join",
  "/api/growth/apply",
  "/api/landing",
  "/api/track",
  "/api/invites",
  "/api/contact",
  // Leaving the newsletter. Its own route precisely so this exemption cannot
  // reach the endpoint that SENDS — and because a human check standing between
  // somebody and the unsubscribe button is the friction that makes them press
  // "spam" instead, which is charged to every customer sending through this
  // domain.
  "/api/unsubscribe",
];

/**
 * WHERE THE GATE APPLIES — the OS, not the shop window.
 *
 * The directive is that only humans get into every section and every part of
 * this OS. The OS is what is behind the login: the dashboard, the partner
 * portal and the API. The marketing site is not part of it, and gating it would
 * be a straightforward act of self-harm — Google could not crawl the pages this
 * platform sells SEO on, and nobody could read what they were buying before
 * being asked to prove they are a person.
 *
 * So the rule is stated as a short list of what IS the OS, rather than a
 * growing list of exceptions to a gate over everything. A list of exceptions is
 * a list somebody eventually forgets to extend, and the failure is silent.
 */
export const GATED_PREFIXES = ["/dashboard", "/partner", "/api"];

export const isGatedSurface = (path: string): boolean =>
  GATED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`));

export const machineLaneFor = (path: string): MachineLane | null =>
  MACHINE_LANES.find((l) => path === l.prefix || path.startsWith(`${l.prefix}/`)) || null;

export const isPublicForm = (path: string): boolean =>
  PUBLIC_FORM_LANES.some((p) => path === p || path.startsWith(`${p}/`));

export const isSensitivePath = (path: string): boolean =>
  SENSITIVE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`));

/**
 * WHICH sensitive paths actually demand a check passed in the last 15 minutes.
 *
 * ONLY THE API ONES. Opening a page moves nothing; the money moves when the
 * screen calls a route, and every one of those routes is in the list above and
 * still demands freshness. Requiring the check to LOOK at /dashboard/earnings
 * bought no security that /api/creator-engine was not already buying, and it
 * cost this:
 *
 *   The check is a proof-of-work. Measured on a server-class machine at the
 *   shipped difficulty it takes about seven seconds, and a fifth of runs take
 *   more than eleven. A phone is several times slower again. So a customer
 *   opening their earnings page fifteen minutes after the last one sat on a
 *   full-screen spinner — and then sat on it again a quarter of an hour later,
 *   because reading a page refreshes nothing. On mobile the page was, in
 *   practice, shut.
 *
 * Nothing is removed from SENSITIVE_PREFIXES: those pages are still marked
 * sensitive, the Sentinel still counts them as such, and they still require a
 * signed human session like every other dashboard route. What changes is that
 * the session is enough to READ them, and the fresh check is demanded where it
 * was always the real control — on the request that spends the money.
 */
export const requiresFreshCheck = (path: string): boolean =>
  isSensitivePath(path) && path.startsWith("/api/");

export const isAlwaysOpen = (path: string): boolean =>
  ALWAYS_OPEN_PREFIXES.some((p) => path === p || path.startsWith(p));

// ---------------------------------------------------------------------------
// Enforcement mode
//
// The zero-config demo has no accounts, no money and nothing to protect, and
// the platform's standing rule is that it must keep working with no keys. So
// the gate ENFORCES the moment the deployment is real — a signing secret or a
// Firebase project — and OBSERVES otherwise, saying which it is doing rather
// than leaving an operator to assume the stronger one.
// ---------------------------------------------------------------------------
export type Mode = "enforced" | "observe";

export function mode(env: Record<string, string | undefined> = process.env): Mode {
  // ENFORCEMENT REQUIRES A DURABLE SIGNING SECRET, AND NOTHING ELSE COUNTS.
  //
  // The first version of this returned "enforced" when a Firebase project was
  // configured. That was a live-site outage waiting to happen, and it is worth
  // writing down exactly why rather than quietly deleting the clause:
  //
  // Without HUMAN_CHECK_SECRET the gate signs with a per-process key. On any
  // real deployment there is more than one process — serverless functions scale
  // out, instances restart — so a session minted by one is REJECTED by the
  // next. The customer verifies, gets a cookie, loads the dashboard, is bounced
  // back to /verify-human, verifies again, and never gets in. A production
  // Firebase project without this one env var is the exact configuration that
  // would produce it, and it is the most likely configuration to exist.
  //
  // This module's own doctrine says a control that strands a paying customer has
  // simply chosen a different way to lose the account. It applies to the control
  // itself: the gate only enforces when it can enforce CORRECTLY.
  return (env.HUMAN_CHECK_SECRET || "").trim() ? "enforced" : "observe";
}

export function gateStatus(env: Record<string, string | undefined> = process.env): {
  mode: Mode; sessionTtlMs: number; reverifyMs: number; sensitivePaths: string[]; note: string;
} {
  const m = mode(env);
  return {
    mode: m,
    sessionTtlMs: SESSION_TTL_MS,
    reverifyMs: REVERIFY_MS,
    sensitivePaths: SENSITIVE_PREFIXES,
    note: m === "enforced"
      ? `Enforced over ${GATED_PREFIXES.join(", ")}. Every dashboard page, the partner portal and every API route except the check itself requires a signed human session; the ${SENSITIVE_PREFIXES.filter((p) => p.startsWith("/api/")).length} money- and credential-touching API prefixes additionally require the check to have been passed in the last ${Math.round(REVERIFY_MS / 60_000)} minutes. The sensitive DASHBOARD pages are readable on a session alone — the fresh check is demanded of the request that spends the money, not of the page that displays the button.`
      : "Observing only — HUMAN_CHECK_SECRET is not set, so the gate cannot sign a session that survives more than one instance. It evaluates and reports every request but blocks nothing, because enforcing with a per-process key would bounce real customers between the dashboard and the check forever. Set HUMAN_CHECK_SECRET to enforce; until then this is the safe half of the control, not the whole one.",
  };
}

// ---------------------------------------------------------------------------
// Signing (Web Crypto — works in edge middleware and in Node)
// ---------------------------------------------------------------------------

// A per-process fallback so the demo runs. It is deliberately NOT a usable
// production secret: it dies with the process, so a second instance rejects the
// first instance's cookies, and `gateStatus` says so before anyone finds out.
let ephemeral: string | null = null;
function secret(): string {
  const configured = (process.env.HUMAN_CHECK_SECRET || "").trim();
  if (configured) return configured;
  if (!ephemeral) {
    const bytes = new Uint8Array(32);
    (globalThis.crypto as Crypto).getRandomValues(bytes);
    ephemeral = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return ephemeral;
}

const enc = new TextEncoder();
let keyPromise: Promise<CryptoKey> | null = null;
let keyForSecret = "";

async function hmacKey(): Promise<CryptoKey> {
  const s = secret();
  if (!keyPromise || keyForSecret !== s) {
    keyForSecret = s;
    keyPromise = (globalThis.crypto as Crypto).subtle.importKey(
      "raw", enc.encode(s), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    // A REJECTED PROMISE MUST NOT BE CACHED.
    //
    // Without this, one failed `importKey` is permanent: `keyForSecret` is
    // already set to `s`, so the guard above never re-enters, and every later
    // request on that instance awaits the same rejected promise. Since this key
    // signs the binding that the MIDDLEWARE computes for every request, a single
    // transient crypto failure turned into a 500 on every route, for every
    // visitor, for the life of the instance — with nothing in the logs
    // connecting the two.
    //
    // Clearing the cache on rejection makes the failure per-request and
    // recoverable instead of per-instance and terminal. The `catch` here only
    // resets state; the rejection still propagates to the caller.
    keyPromise.catch(() => { keyPromise = null; keyForSecret = ""; });
  }
  return keyPromise;
}

async function sign(payload: string): Promise<string> {
  const sig = await (globalThis.crypto as Crypto).subtle.sign("HMAC", await hmacKey(), enc.encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time compare — a fast-fail loop leaks a signature one byte at a time. */
function sigEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * The binding.
 *
 * IP plus user agent, hashed. Coarse on purpose — a stricter binding logs out
 * every mobile user whose address changes mid-session — so treat it as raising
 * the cost of replaying a stolen cookie somewhere else, not as preventing it.
 */
export async function bindingFor(req: { headers: { get(name: string): string | null } }): Promise<string> {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  const ua = (req.headers.get("user-agent") || "").slice(0, 120);
  return (await sign(`bind|${ip}|${ua}`)).slice(0, 32);
}

// ---------------------------------------------------------------------------
// The cookie
// ---------------------------------------------------------------------------
const COOKIE_VERSION = "h1";

export async function issueSession(binding: string, now: number = Date.now()): Promise<{ value: string; expiresAt: number }> {
  const expiresAt = now + SESSION_TTL_MS;
  const body = `${COOKIE_VERSION}.${expiresAt}.${now}.${binding}`;
  return { value: `${COOKIE_VERSION}.${expiresAt}.${now}.${await sign(body)}`, expiresAt };
}

export type Verdict =
  | { ok: true; verifiedAt: number; expiresAt: number; freshMs: number }
  | { ok: false; action: "verify" | "reverify"; reason: string };

/**
 * Is a human present on this request, recently enough for what it is asking to do?
 *
 * Returns the ACTION as well as the reason, because "verify" and "reverify" are
 * different experiences: one is a stranger at the door, the other is somebody
 * already inside being asked to confirm before money moves. Telling a signed-in
 * customer to "log in again" when they only needed to re-tap is how a payout
 * gets abandoned.
 */
export async function evaluate(input: {
  cookie: string | null | undefined;
  binding: string;
  sensitivity?: Sensitivity;
  now?: number;
}): Promise<Verdict> {
  const now = input.now ?? Date.now();
  const raw = (input.cookie || "").trim();
  if (!raw) return { ok: false, action: "verify", reason: "No human session on this request." };

  const [v, expStr, verStr, sig] = raw.split(".");
  const expiresAt = Number(expStr);
  const verifiedAt = Number(verStr);
  if (v !== COOKIE_VERSION || !Number.isFinite(expiresAt) || !Number.isFinite(verifiedAt) || !sig) {
    return { ok: false, action: "verify", reason: "The human session is malformed." };
  }
  if (now > expiresAt) return { ok: false, action: "verify", reason: "The human session has expired." };
  // A cookie claiming to have been verified in the future is a forged or
  // clock-skewed one; either way it must not buy freshness it did not earn.
  if (verifiedAt > now + 60_000) return { ok: false, action: "verify", reason: "The human session is dated in the future." };

  const expected = await sign(`${COOKIE_VERSION}.${expiresAt}.${verifiedAt}.${input.binding}`);
  if (!sigEqual(sig, expected)) {
    return { ok: false, action: "verify", reason: "The human session does not match this browser." };
  }

  const freshMs = now - verifiedAt;
  if ((input.sensitivity || "normal") === "sensitive" && freshMs > REVERIFY_MS) {
    return {
      ok: false,
      action: "reverify",
      reason: `This action moves money or credentials, so it needs a check passed in the last ${Math.round(REVERIFY_MS / 60_000)} minutes. Yours was ${Math.round(freshMs / 60_000)} minutes ago.`,
    };
  }
  return { ok: true, verifiedAt, expiresAt, freshMs };
}

// ---------------------------------------------------------------------------
// The single decision
//
// Kept in ONE function so the middleware, the status page and the tests all
// answer the question the same way. A policy that exists in three places is a
// policy with three behaviours.
// ---------------------------------------------------------------------------
export type Lane = "always_open" | "machine" | "public_form" | "public_page" | "human";

export type GateDecision = {
  lane: Lane;
  allow: boolean;
  /** True when the decision was made but not applied — observe mode. */
  observed: boolean;
  action?: "verify" | "reverify";
  reason: string;
  sensitivity: Sensitivity;
};

export async function decide(input: {
  path: string;
  cookie: string | null | undefined;
  binding: string;
  /** The Authorization header, for the scheduler lane. */
  authorization?: string | null;
  /** Header names present on the request — a provider signature is one of these. */
  hasProviderSignature?: boolean;
  /** The HTTP method. A safe read is judged differently from a write. */
  method?: string;
  cronSecret?: string;
  now?: number;
  env?: Record<string, string | undefined>;
}): Promise<GateDecision> {
  const enforcing = mode(input.env || process.env) === "enforced";
  const observed = !enforcing;
  const sensitivity: Sensitivity = isSensitivePath(input.path) ? "sensitive" : "normal";

  if (isAlwaysOpen(input.path)) {
    return { lane: "always_open", allow: true, observed: false, sensitivity, reason: "This path is how a human proves they are one; closing it would close the only door." };
  }

  const machine = machineLaneFor(input.path);
  if (machine) {
    const cronSecret = (input.cronSecret ?? process.env.CRON_SECRET ?? "").trim();
    const credentialPresent = machine.credential === "cron_bearer"
      // FAILS CLOSED with no secret set: a scheduled route nobody can be
      // recognised for is not "open to the scheduler", it is open.
      ? Boolean(cronSecret) && (input.authorization || "").trim() === `Bearer ${cronSecret}`
      : Boolean(input.hasProviderSignature);

    if (credentialPresent) {
      return { lane: "machine", allow: true, observed: false, sensitivity, reason: `Invited machine: ${machine.what}` };
    }

    // A SAFE READ, where the route's GET is a handshake or self-documenting.
    // Meta's verification is a GET with `hub.verify_token` and no signature, so
    // the branch below refused the one request that could ever set the webhook
    // up, and the Stripe route's own diagnostic GET was equally unreachable.
    const method = (input.method || "GET").toUpperCase();
    if (machine.openToRead && (method === "GET" || method === "HEAD")) {
      return { lane: "machine", allow: true, observed: false, sensitivity, reason: `A read on ${machine.prefix} returns no secret, and a provider's verification handshake arrives this way.` };
    }

    // NOT THE MACHINE — but is it an attributable HUMAN?
    //
    // This module's own doctrine is that every request must be attributable
    // "either to a verified human session or to a machine we invited". This
    // branch only ever answered the second half, so a path that serves BOTH
    // refused the person. `/api/inbound` is exactly that path: the mail
    // provider POSTs deliveries to it AND /dashboard/inbox reads and writes
    // through it, so the entire inbox was refused in enforced mode by a rule
    // matched on the prefix alone. A request carrying a session or a bearer
    // token is not an anonymous script; it falls through and is judged as the
    // human it claims to be, by the same evaluation as every other route.
    const attributableHuman = Boolean((input.cookie || "").trim()) || (input.authorization || "").trim().startsWith("Bearer ");
    if (!attributableHuman) {
      return {
        lane: "machine",
        allow: false,
        observed,
        sensitivity,
        reason: `This path is a machine lane and the request carried no ${machine.credential === "cron_bearer" ? "scheduler credential" : "provider signature"}. A script without the credential has no lane here.`,
      };
    }
    // Falls through to the human evaluation below.
  }

  // The public site. Open, and open on purpose.
  if (!isGatedSurface(input.path)) {
    return { lane: "public_page", allow: true, observed: false, sensitivity, reason: "A public page. The marketing site is not the OS, and a shop window nobody can look into sells nothing." };
  }

  if (isPublicForm(input.path)) {
    return { lane: "public_form", allow: true, observed: false, sensitivity, reason: "A public form. Its own proof-of-work, honeypot, timing and rate limits carry the bot cost — a session cookie cannot be required to obtain a session cookie." };
  }

  // Reported sensitivity and ENFORCED freshness are two questions. The page is
  // sensitive and is counted as such; only the API call has to be fresh.
  const verdict = await evaluate({
    cookie: input.cookie,
    binding: input.binding,
    sensitivity: requiresFreshCheck(input.path) ? "sensitive" : "normal",
    now: input.now,
  });
  if (verdict.ok) {
    return { lane: "human", allow: true, observed: false, sensitivity, reason: `Human session, checked ${Math.round(verdict.freshMs / 60_000)} minute(s) ago.` };
  }
  return { lane: "human", allow: false, observed, action: verdict.action, reason: verdict.reason, sensitivity };
}

export const HUMAN_GATE_DOCTRINE = [
  "Coverage is a routing rule, not a habit. The gate runs in middleware over every dashboard page and every API route, so a route added tomorrow is covered the day it is added rather than the day somebody remembers it.",
  "A session proves a check was passed, not that a human is still there. Anything that moves money or credentials therefore requires a RECENT check — a twelve-hour session is a twelve-hour window for whoever picks the laptop up.",
  "It stops scale, not determination. Scripts, farms and replayed sessions are what empty a wallet; one person driving a real browser passes any web check ever built, and claiming otherwise would be the dishonest part.",
  "It fails to a CHALLENGE, never to a lockout. Every refusal says which check is needed and where to take it, because a security control that strands a paying customer has simply chosen a different way to lose the account.",
  "In the zero-config demo it observes rather than blocks, and says so. There are no accounts and no balances there; pretending to protect them would be theatre.",
];
