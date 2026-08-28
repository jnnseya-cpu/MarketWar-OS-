// THE LIMITER ITSELF — arithmetic over a Map, and NOTHING ELSE IMPORTED.
//
// LAUNCH-AUDIT FINDING D-14. `backend/rate-limit.ts` was split out of guard.ts
// precisely so a route that only wants a rate limit does not drag the Firebase
// Admin SDK into its module graph, and it takes real care over that: the
// Sentinel recording is a DYNAMIC import on the refusal branch, so the Admin
// SDK is never evaluated on the happy path.
//
// That works for the Node runtime, which is what it was written for. It does
// not survive the EDGE runtime: webpack traces a dynamic import statically, so
// the moment `middleware.ts` imported the limiter the whole build failed with
// `UnhandledSchemeError: Reading from "node:crypto"`. The care was real and the
// bundler did not care.
//
// Which mattered, because the audit found 46 API routes that were both
// unauthenticated and unthrottled, and the only place to fix that once rather
// than 46 times is the middleware — where nothing Node-shaped may be imported.
//
// So the arithmetic lives here with zero imports, and `backend/rate-limit.ts`
// re-exports it and adds the Sentinel recording. ONE rulebook, two runtimes.
// A second copy of a limiter is two limits that disagree the first time one is
// edited.
//
// PER-INSTANCE, DELIBERATELY. The buckets are a Map in one process. On a
// serverless fleet that means the limit is enforced per instance, not globally
// — a speed bump against one abusive client rather than a defence against a
// distributed one. That is the honest description, it is what this deployment
// can do without shared state, and it is strictly better than no limit at all.

export type Verdict = { ok: boolean; remaining: number; retryAfterSec: number };

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Nothing ever removed a spent bucket, so a caller rotating source addresses
// grew the map for as long as the instance lived — the defence against a flood
// was itself what the flood consumed. Expired buckets are swept when the map
// gets large; the sweep is O(n) but rare, and every entry it touches is already
// past its window.
const MAX_BUCKETS = 10_000;

function sweepExpired(now: number): void {
  for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
  // Still full of live windows: drop the oldest so memory stays bounded. Those
  // callers get a fresh allowance, which is the safe direction to fail — a
  // limiter that runs the instance out of memory blocks everyone.
  if (buckets.size >= MAX_BUCKETS) {
    const oldest = [...buckets.entries()]
      .sort((a, b) => a[1].resetAt - b[1].resetAt)
      .slice(0, Math.floor(MAX_BUCKETS / 2));
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

/**
 * Take one request against `key`.
 *
 * `onRefusal` is how the Node build reports to the Sentinel without this module
 * knowing the Sentinel exists. The edge build passes nothing and simply refuses.
 */
export function rateLimitCore(
  key: string,
  limit: number,
  windowMs: number,
  now: number,
  onRefusal?: (info: { key: string; limit: number; windowMs: number; now: number }) => void,
): Verdict {
  if (buckets.size >= MAX_BUCKETS) sweepExpired(now);
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }
  if (b.count >= limit) {
    if (onRefusal) onRefusal({ key, limit, windowMs, now });
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count += 1;
  return { ok: true, remaining: limit - b.count, retryAfterSec: 0 };
}

/** Test seam — the buckets are process state and would otherwise leak between cases. */
export function __resetRateLimitCore(): void { buckets.clear(); }
