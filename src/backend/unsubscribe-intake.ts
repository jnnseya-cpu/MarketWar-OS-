// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// WHAT HAPPENED WHEN SOMEBODY ASKED TO BE LEFT ALONE.
//
// Split out of the route so the three outcomes can be DRIVEN in a test rather
// than inferred from the shape of the code. The route was returning HTTP 200
// for all three, and the reason that survived review is that nothing could
// exercise the failing branches: `handle()` was a closure inside a Next route
// file, and a route file cannot export a helper for a test to call.
//
// An untestable branch is an unverified branch, and this one sits on the RFC
// 8058 one-click unsubscribe path — the control Gmail and Yahoo require to
// work, on the single request where a false success is invisible to everyone
// including the person it harms.

import { verifyToken, recordEvent, type EmailEvent } from "@/backend/email-events";

/** The recorder's own input shape — the id is assigned by the store. */
type NewEvent = Omit<EmailEvent, "id">;

export type UnsubscribeOutcome =
  | { ok: true; brandId: string }
  /** The token is missing, forged, or malformed. Nothing to record, and a retry cannot help. */
  | { ok: false; reason: "bad_token" }
  /** The token was GOOD and the write failed. A retry IS meaningful. */
  | { ok: false; reason: "store_failed"; detail: string };

/**
 * Record an unsubscribe from a signed token.
 *
 * `record` is injectable ONLY so a test can make storage fail. Product code
 * never passes it — the default is the real recorder, so there is no second
 * code path to drift.
 */
export async function recordUnsubscribe(
  token: string,
  record: (e: NewEvent) => Promise<unknown> = recordEvent,
): Promise<UnsubscribeOutcome> {
  const claim = verifyToken(token || "");
  if (!claim) return { ok: false, reason: "bad_token" };
  try {
    await record({
      brandId: claim.brandId, email: claim.email, type: "unsubscribe",
      at: new Date().toISOString(), campaign: claim.campaign || undefined,
    });
    return { ok: true, brandId: claim.brandId };
  } catch (e) {
    // NEVER SILENT. Somebody asked to be left alone and it was not written
    // down; whoever reads the logs has to be able to see that.
    //
    // The ADDRESS IS NOT LOGGED. An unsubscribe log full of the addresses of
    // people who asked to be forgotten is its own privacy problem, and the
    // brand plus the error is enough to act on.
    const detail = e instanceof Error ? e.message : "unknown storage error";
    console.error(`[unsubscribe] FAILED TO RECORD for brand ${claim.brandId}: ${detail}`);
    return { ok: false, reason: "store_failed", detail };
  }
}
