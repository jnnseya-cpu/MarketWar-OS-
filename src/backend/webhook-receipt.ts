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
// storm. Every function here swallows its own failure.
//
// AND A `try/catch` WAS NOT ENOUGH TO KEEP THAT PROMISE. Measured, with Firebase
// Admin configured and Firestore unreachable: the transaction below blocked for
// **over 75 seconds** and the read for **41**. The catch cannot run until the gRPC
// client has finished retrying UNAVAILABLE, and that is longer than the webhook
// invocation lives — so the route was killed, Stripe received no answer at all,
// and the delivery was redelivered. The comment here said this could never happen
// and was wrong for the most ordinary reason: catching an error bounds what
// happens when a call FAILS, never how long it takes to fail.
//
// Both calls now run under `withStoreDeadline`, chosen from measured healthy
// latency rather than taste — see the constants below. The money path is
// deliberately NOT bounded this way: `applyWebhookOutcome` failing must produce a
// 500 so Stripe redelivers, and the invocation ceiling already gives that.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { withStoreDeadline } from "@/shared/store-failure";

const COLLECTION = "webhook_receipts";
const DOC = "stripe";

// MEASURED ON A REAL STORE, so the numbers are evidence and not preference:
//
//   healthy   write 2547ms on a COLD connection, then 18-46ms warm
//             read    31ms cold, then 9-15ms
//   unreachable  write >75,000ms   read 41,459ms
//
// The write's ceiling has to clear that cold-start cost with room to spare, or a
// perfectly healthy deployment silently loses the first receipt after every cold
// start — which is the one that matters, because it is the first delivery after a
// deploy. 6s is roughly 2.4x the measured cold path and still a twelfth of what
// the unbounded call cost.
const WRITE_DEADLINE_MS = 6_000;
// The read serves the launch report and the health endpoints, where a person is
// waiting. Reads measured under 31ms even cold, so 5s is already generous.
const READ_DEADLINE_MS = 5_000;

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
 * WHY THE STORE READ IS EMPTY, when it is.
 *
 * "Not proven" and "we could not ask" look identical in a launch report, and this
 * platform has paid for that confusion more than once. Kept per process, which is
 * all a serverless instance can offer, and read by `receiptStoreNote()`.
 */
let lastStoreFailure: string | null = null;

/** The count out of a stored document, CHECKED. Anything unreadable is 0. */
function countFromStored(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  const n = Number((raw as Record<string, unknown>).verifiedCount);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** A stored document as a receipt, CHECKED rather than cast. */
function receiptFromStored(raw: unknown): WebhookReceipt {
  if (!raw || typeof raw !== "object") return { ...EMPTY };
  const d = raw as Record<string, unknown>;
  if (typeof d.lastVerifiedAt !== "string" || !d.lastVerifiedAt) return { ...EMPTY };
  return {
    lastVerifiedAt: d.lastVerifiedAt,
    lastEventType: typeof d.lastEventType === "string" ? d.lastEventType : "",
    verifiedCount: countFromStored(d),
  };
}

/**
 * Record that a delivery from Stripe verified. Call it AFTER the signature check
 * passes and before anything else can fail, because the fact being recorded is
 * "the secret is right", not "the event was useful".
 */
export async function recordVerifiedDelivery(eventType: string, at = new Date().toISOString()): Promise<void> {
  const type = String(eventType || "").slice(0, 120);
  if (adminConfigured && adminDb) {
    const db = adminDb;
    const ref = db.collection(COLLECTION).doc(DOC);
    const done = await withStoreDeadline("the webhook receipt write", WRITE_DEADLINE_MS, () =>
      db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const cur = countFromStored(snap.exists ? snap.data() : null);
        tx.set(ref, { lastVerifiedAt: at, lastEventType: type, verifiedCount: cur + 1 });
      }));
    if (done.ok) return;
    // A refused, slow or unreachable store must never make Stripe retry a
    // delivery we have already accepted. The receipt still lands in memory, so
    // this invocation's health report can say the secret verified.
    lastStoreFailure = done.failure.why;
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
  if (adminConfigured && adminDb) {
    const db = adminDb;
    const got = await withStoreDeadline("the webhook receipt read", READ_DEADLINE_MS, () =>
      db.collection(COLLECTION).doc(DOC).get());
    if (!got.ok) {
      lastStoreFailure = got.failure.why;
      // FALL BACK TO WHAT THIS INSTANCE KNOWS, not to nothing.
      //
      // The original returned EMPTY here, reasoned as "the safe direction, because
      // the alternative is telling somebody their money path is fine on the
      // strength of a database error". That reasoning is right about the database
      // and wrong about `mem`: a receipt in memory is not a database error, it is a
      // delivery THIS PROCESS verified against the secret this deployment holds —
      // the single fact the whole file exists to record. Returning EMPTY over the
      // top of it discards evidence we have.
      //
      // Driving a dead store is what found it: `recordVerifiedDelivery` fell back
      // to memory and the read ignored it, so in one invocation the write landed
      // and the read said "never verified". The fallback was write-only.
      //
      // Still safe. `mem` starts empty, so a store outage on a deployment that has
      // never had a verified delivery reads as not proven exactly as before, and
      // `receiptStoreNote()` carries the caveat either way.
      return { ...mem };
    }
    const stored = receiptFromStored(got.value.exists ? got.value.data() : null);
    // A store that answers "nothing here" while this instance holds a verified
    // delivery is a store that lost the write — and the delivery still happened.
    if (!stored.lastVerifiedAt && mem.lastVerifiedAt) return { ...mem };
    return stored;
  }
  return { ...mem };
}

/**
 * Why the last store attempt failed, or null if it did not.
 *
 * A surface reporting "no delivery has ever verified" must be able to add "…or we
 * could not reach the datastore to find out". The two want different actions.
 */
export function receiptStoreNote(): string | null {
  return lastStoreFailure;
}

/** Test seam only — the in-memory fallback, reset between cases. */
export function __resetWebhookReceipt(): void {
  mem = { ...EMPTY };
  lastStoreFailure = null;
}
