// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// RATE LIMITING, WITH NOTHING HEAVY BEHIND IT.
//
// Split out of guard.ts, and the reason is a cold start rather than tidiness.
//
// `rateLimit` and `clientKey` are pure arithmetic over a Map. They sat in the
// same module as `requireAuth`, which imports firebase-admin — so every route
// that only wanted a rate limit pulled the entire Admin SDK, gRPC and protobufjs
// into its module graph and paid for initialising them on every cold start.
//
// That matters most for exactly one endpoint: the human check. It is the door
// everybody comes through before they have an account, it needs no database and
// no identity, and it was the heaviest cheap thing in the codebase. A door that
// is slow to open is a door some people find shut.
//
// Sentinel is imported DYNAMICALLY, on the refusal branch only. Recording a
// refusal must not put firebase-admin in front of the happy path — and the
// happy path is the one that runs on every single request.
//
// guard.ts re-exports both, so every existing `import { rateLimit, clientKey }
// from "@/backend/guard"` keeps working unchanged. This is an addition.

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

/** The caller in a security log is a hash, never an address. */
export function ipHash(ip: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < ip.length; i++) { h ^= ip.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

export function clientKey(req: Request, route: string): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  const ip = xff.split(",")[0].trim() || "local";
  return `${route}:${ip}`;
}

export function rateLimit(key: string, limit: number, windowMs: number, now: number): { ok: boolean; remaining: number; retryAfterSec: number } {
  if (buckets.size >= MAX_BUCKETS) sweepExpired(now);
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }
  if (b.count >= limit) {
    // Sentinel sees every rate limit without a single route being edited, because
    // the key already carries the route and the caller. A control that depends on
    // a hundred call sites remembering to report is a control with a hundred
    // places to be forgotten.
    //
    // Loaded here rather than at the top of the file: this branch is the rare
    // one, and putting the Admin SDK in front of every allowed request to log
    // the refused ones is the wrong way round.
    const [route, ...rest] = key.split(":");
    void (async () => {
      try {
        const { record } = await import("@/backend/sentinel");
        record({
          at: new Date(now).toISOString(),
          kind: "rate_limited",
          actor: `ip:${ipHash(rest.join(":"))}`,
          path: route,
          detail: `limit ${limit} per ${Math.round(windowMs / 1000)}s`,
        });
      } catch { /* a security log must never fail a response, even its own refusal */ }
    })();
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count += 1;
  return { ok: true, remaining: limit - b.count, retryAfterSec: 0 };
}

/** Test seam — the buckets are process state and would otherwise leak between cases. */
export function __resetRateLimits(): void { buckets.clear(); }
