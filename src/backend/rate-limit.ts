// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// RATE LIMITING FOR THE NODE RUNTIME — the shared arithmetic, plus the security
// log the edge build cannot carry.
//
// Split out of guard.ts, and the reason is a cold start rather than tidiness:
// `rateLimit` and `clientKey` are pure arithmetic, and they sat in the same
// module as `requireAuth`, which imports firebase-admin. Every route that only
// wanted a rate limit therefore pulled the entire Admin SDK, gRPC and
// protobufjs into its module graph.
//
// The arithmetic now lives in `shared/rate-limit-core.ts` with NO imports at
// all — launch-audit finding D-14. The dynamic Sentinel import below keeps the
// Admin SDK off the happy path at runtime, which is what a Node cold start
// cares about, but webpack traces a dynamic import statically and so refused to
// build `middleware.ts` the moment it imported this file. The middleware needs
// the limiter (46 API routes were unauthenticated AND unthrottled), so the
// arithmetic had to become importable from the edge.
//
// This file stays the Node entry point and keeps its behaviour exactly: same
// limits, same buckets semantics, same Sentinel record. guard.ts re-exports
// both names, so every existing `import { rateLimit, clientKey } from
// "@/backend/guard"` keeps working unchanged.

import { rateLimitCore, ipHash, clientKey as coreClientKey, type Verdict } from "@/shared/rate-limit-core";

export { ipHash };
export const clientKey = coreClientKey;

export function rateLimit(key: string, limit: number, windowMs: number, now: number): Verdict {
  return rateLimitCore(key, limit, windowMs, now, ({ key: k, limit: l, windowMs: w, now: n }) => {
    // Sentinel sees every rate limit without a single route being edited,
    // because the key already carries the route and the caller. A control that
    // depends on a hundred call sites remembering to report is a control with a
    // hundred places to be forgotten.
    //
    // Loaded here rather than at the top of the file: this branch is the rare
    // one, and putting the Admin SDK in front of every allowed request in order
    // to log the refused ones is the wrong way round.
    const [route, ...rest] = k.split(":");
    void (async () => {
      try {
        const { record } = await import("@/backend/sentinel");
        record({
          at: new Date(n).toISOString(),
          kind: "rate_limited",
          actor: `ip:${ipHash(rest.join(":"))}`,
          path: route,
          detail: `limit ${l} per ${Math.round(w / 1000)}s`,
        });
      } catch { /* a security log must never fail a response, even its own refusal */ }
    })();
  });
}

/** Test seam — the buckets are process state and would otherwise leak between cases. */
export { __resetRateLimitCore as __resetRateLimits } from "@/shared/rate-limit-core";
