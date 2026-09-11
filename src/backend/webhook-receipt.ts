// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// DID A REAL STRIPE DELIVERY EVER VERIFY AGAINST THE SECRET WE HOLD?
//
// WHY THIS EXISTS, AND IT IS THE MOST EXPENSIVE GAP THIS PLATFORM HAS HAD.
// `launch-check.ts` raises a blocker when `STRIPE_WEBHOOK_SECRET` is ABSENT,
// with exactly the right words: "Payments are taken but nothing is credited."
// Then it goes quiet the moment the variable holds any string at all.
//
// This account has SEVEN webhook endpoints. Each has its own signing secret.
// Copying the wrong one produces a value that is present, well-formed, starts
// `whsec_`, passes every shape check, and fails every single delivery with a
// signature mismatch. 246 events have been sent and nothing has landed — while
// the go-live report said the money path was fine. That is this codebase's
// second defect class, a check passing for a reason unrelated to what it tests,
// standing on the one finding whose whole point is that a customer gets charged
// and served nothing.
//
// NOTHING SHORT OF A DELIVERY CAN PROVE IT. Stripe does not return signing
// secrets when you list endpoints, only when you create one, so no amount of
// API access can compare the secret we hold against the secret Stripe signs
// with. The secret can be well-formed, belong to this account, and belong to the
// wrong endpoint. The single fact that settles it is a real POST from Stripe
// whose signature verified here — so that is what gets recorded, the instant it
// happens, in the webhook route.
//
// RECORDED ON VERIFICATION, NOT ON OUTCOME. `processed_events` already exists
// and already holds event ids, and reading THAT would be the tempting shortcut —
// but it only gains a row when an event carries a wallet credit or an
// entitlement change. A `customer.subscription.updated` that verified perfectly
// and needed no wallet change writes nothing there, so an account whose webhook
// works would still read as never proven. Verification and outcome are different
// facts; this file records the first one.
//
// IT MUST NEVER AFFECT THE RESPONSE. Stripe retries anything that is not a 2xx,
// so a bookkeeping write that throws would turn a healthy endpoint into a retry
// storm. Every function here swallows its own failure and the caller does not
// await a result it needs.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";

const COLLECTION = "webhook_receipts";
const DOC = "stripe";

export type WebhookReceipt = {
  /** When a Stripe delivery last verified against the secret this deployment holds. */
  lastVerifiedAt: string | null;
  /** The event type, so the report can say what proved it rather than only that something did. */
  lastEventType: string;
  /**
   * How many have verified. Deliberately approximate under concurrency — it is a
   * sign of life, never an accounting figure, and the ledger is where money is
   * counted.
   */
  verifiedCount: number;
};

const EMPTY: WebhookReceipt = { lastVerifiedAt: null, lastEventType: "", verifiedCount: 0 };

/** Per-process fallback so the platform works with zero configuration. */
let mem: WebhookReceipt = { ...EMPTY };

/**
 * Record that a delivery from Stripe verified. Call it AFTER the signature check
 * passes and before anything else can fail, because the fact being recorded is
 * "the secret is right", not "the event was useful".
 */
export async function recordVerifiedDelivery(eventType: string, at = new Date().toISOString()): Promise<void> {
  const type = String(eventType || "").slice(0, 120);
  try {
    if (adminConfigured && adminDb) {
      const ref = adminDb.collection(COLLECTION).doc(DOC);
      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const cur = (snap.exists ? snap.data() : null) as WebhookReceipt | null;
        tx.set(ref, {
          lastVerifiedAt: at,
          lastEventType: type,
          verifiedCount: Math.max(0, Number(cur?.verifiedCount) || 0) + 1,
        });
      });
      return;
    }
  } catch {
    // A failed bookkeeping write must never make Stripe retry a delivery we
    // have already accepted. Fall through to memory.
  }
  mem = { lastVerifiedAt: at, lastEventType: type, verifiedCount: mem.verifiedCount + 1 };
}

/**
 * What has verified, if anything.
 *
 * NEVER THROWS, AND NEVER INVENTS. A read that fails returns the empty receipt,
 * which the launch report treats as "not proven" — the safe direction, because
 * the alternative is telling somebody their money path is fine on the strength
 * of a database error.
 */
export async function lastVerifiedDelivery(): Promise<WebhookReceipt> {
  try {
    if (adminConfigured && adminDb) {
      const snap = await adminDb.collection(COLLECTION).doc(DOC).get();
      const d = (snap.exists ? snap.data() : null) as Partial<WebhookReceipt> | null;
      if (!d || !d.lastVerifiedAt) return { ...EMPTY };
      return {
        lastVerifiedAt: String(d.lastVerifiedAt),
        lastEventType: String(d.lastEventType || ""),
        verifiedCount: Math.max(0, Number(d.verifiedCount) || 0),
      };
    }
  } catch {
    return { ...EMPTY };
  }
  return { ...mem };
}

/** Test seam only — the in-memory fallback, reset between cases. */
export function __resetWebhookReceipt(): void {
  mem = { ...EMPTY };
}
