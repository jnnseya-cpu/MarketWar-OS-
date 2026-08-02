// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// API request guards — authentication, role authorisation and rate limiting.
//
// Demo-safe by construction: when the Firebase Admin SDK is NOT configured
// (zero-config demo / CI), auth is not enforced so every module keeps working
// with no keys. When Admin IS configured (production), sensitive routes require
// a valid Firebase ID token and, where specified, a role claim — closing the
// "unauthenticated admin/financial endpoint" hole.
//
// Rate limiting is ALWAYS on (in-memory token bucket per IP+route) so a single
// caller can never trigger a denial-of-wallet on the AI endpoints, even in demo.

import { adminAuth, adminConfigured } from "@/backend/firebase-admin";
import type { Role, Scope } from "@/shared/roles";
import { hasScope } from "@/shared/roles";

// Bootstrap-admin allowlist: any signed-in user whose (Firebase-verified) email
// is listed in PLATFORM_ADMIN_EMAILS is treated as an `executive` (full admin) —
// WITHOUT needing a custom claim set out-of-band. The owner controls this env
// var, and Firebase already verified the email, so it's a safe, reliable way to
// grant the first admin. Comma-separated, case-insensitive.
const ADMIN_EMAILS = new Set(
  (process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

// ---------------------------------------------------------------------------
// Rate limiting (in-memory; per-instance). A shared store (Redis/Firestore)
// is required for multi-instance correctness — tracked as a launch action.
// ---------------------------------------------------------------------------
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// The limiter keys on IP, and nothing ever removed a spent bucket. A caller
// rotating source addresses therefore grew the map for as long as the instance
// lived — the defence against a flood was itself the thing the flood consumed.
// Expired buckets are swept whenever the map gets large; the sweep is O(n) but
// runs rarely, and every entry it touches is already past its window.
const MAX_BUCKETS = 10_000;
function sweepExpired(now: number): void {
  for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
  // Still full of live windows: drop the oldest so memory stays bounded. Those
  // callers get a fresh allowance, which is the safe direction to fail — a
  // limiter that runs the instance out of memory blocks everyone.
  if (buckets.size >= MAX_BUCKETS) {
    const oldest = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt).slice(0, Math.floor(MAX_BUCKETS / 2));
    for (const [k] of oldest) buckets.delete(k);
  }
}

export function rateLimit(key: string, limit: number, windowMs: number, now: number): { ok: boolean; remaining: number; retryAfterSec: number } {
  if (buckets.size >= MAX_BUCKETS) sweepExpired(now);
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }
  if (b.count >= limit) {
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count += 1;
  return { ok: true, remaining: limit - b.count, retryAfterSec: 0 };
}

export function clientKey(req: Request, route: string): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  const ip = xff.split(",")[0].trim() || "local";
  return `${route}:${ip}`;
}

// ---------------------------------------------------------------------------
// Authentication + role authorisation
// ---------------------------------------------------------------------------
export type AuthResult =
  | {
      ok: true; enforced: boolean; uid: string | null; role: Role | null;
      // Carried so a route can tell a real mailbox from a made-up one without a
      // second round trip to Firebase. Both are null when auth is not enforced.
      email?: string | null;
      emailVerified?: boolean;
    }
  | { ok: false; status: 401 | 403; error: string };

export async function requireAuth(req: Request, opts?: { scope?: Scope }): Promise<AuthResult> {
  // Demo / CI: Admin not configured → do not enforce (keeps zero-config working).
  if (!adminConfigured || !adminAuth) {
    return { ok: true, enforced: false, uid: null, role: null, email: null, emailVerified: false };
  }
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return { ok: false, status: 401, error: "Authentication required" };
  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    return { ok: false, status: 401, error: "Invalid or expired session" };
  }
  let role = (decoded.role as Role | undefined) ?? null;
  // Bootstrap admin by verified-email allowlist — grants executive even without
  // a custom claim. Owner-controlled env var; never widens access on its own.
  //
  // email_verified IS PART OF THE CHECK, not decoration. Firebase will happily
  // mint a token for an email/password account created with an address the
  // registrant has never proved they can read. If the owner's address were on
  // this list before the owner had signed up with it, whoever registered it
  // first would be handed `executive` — which reads every org's admin surface
  // AND skips metering entirely, so it also spends the owner's provider keys
  // without limit. An address nobody has proved they own grants nothing.
  if (decoded.email && decoded.email_verified && ADMIN_EMAILS.has(String(decoded.email).toLowerCase())) {
    role = "executive";
  }
  if (opts?.scope) {
    if (!role || !hasScope(role, opts.scope)) {
      return { ok: false, status: 403, error: `Insufficient permission (requires ${opts.scope})` };
    }
  }
  return {
    ok: true, enforced: true, uid: decoded.uid, role,
    email: decoded.email ? String(decoded.email).toLowerCase() : null,
    // Firebase's own verification, read off the signed token — not something the
    // client can assert about itself.
    emailVerified: Boolean(decoded.email_verified),
  };
}
