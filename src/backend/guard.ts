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

// ---------------------------------------------------------------------------
// Rate limiting (in-memory; per-instance). A shared store (Redis/Firestore)
// is required for multi-instance correctness — tracked as a launch action.
// ---------------------------------------------------------------------------
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number, now: number): { ok: boolean; remaining: number; retryAfterSec: number } {
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
  | { ok: true; enforced: boolean; uid: string | null; role: Role | null }
  | { ok: false; status: 401 | 403; error: string };

export async function requireAuth(req: Request, opts?: { scope?: Scope }): Promise<AuthResult> {
  // Demo / CI: Admin not configured → do not enforce (keeps zero-config working).
  if (!adminConfigured || !adminAuth) {
    return { ok: true, enforced: false, uid: null, role: null };
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
  const role = (decoded.role as Role | undefined) ?? null;
  if (opts?.scope) {
    if (!role || !hasScope(role, opts.scope)) {
      return { ok: false, status: 403, error: `Insufficient permission (requires ${opts.scope})` };
    }
  }
  return { ok: true, enforced: true, uid: decoded.uid, role };
}
