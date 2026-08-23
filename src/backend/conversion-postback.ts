// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// BREAK ONE, CLOSED: the brand's checkout tells us a sale happened.
//
// The buyer pays on the BRAND'S own site, in the brand's own checkout, on the
// brand's domain. Nothing we run sees it. Without a report back MarketWar cannot
// know a sale occurred and therefore cannot owe, compute or pay a commission —
// which made every step after it unreachable, however finished it looked.
//
// THREE THINGS THIS HAS TO GET RIGHT, AND ALL THREE ARE ABOUT MONEY.
//
//   1. SIGNED, PER BRAND. This endpoint mints commission liabilities. Unsigned,
//      anyone who learns the URL can post fake orders and be paid for them. Each
//      brand gets its own secret so a leak from one brand cannot forge another's
//      orders, and the signature is compared in constant time.
//
//   2. IDEMPOTENT BY ORDER ID. Checkouts retry. Webhooks retry. A retried order
//      that accrues a second commission pays twice for one sale, and the money
//      is gone before anybody reconciles. The order id is the key, and a repeat
//      returns the FIRST result rather than a new one.
//
//   3. THE LINES BROKEN OUT. `netEligibleValue` needs product value, tax,
//      delivery, tip and gift card SEPARATELY, because tax and delivery are
//      money the merchant never keeps and cannot fund a commission. A postback
//      that sends only a total forces a guess, and a guessed commission is a
//      wrong payment.

import { createHmac, timingSafeEqual, createHash } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";

export type PostbackLines = {
  productPence: number;
  taxPence?: number;
  deliveryPence?: number;
  tipPence?: number;
  giftCardPence?: number;
  otherExcludedPence?: number;
  refundedPence?: number;
  cancelled?: boolean;
};

export type ConversionPostback = {
  brandId: string;
  /** The creator's tracked code, as the brand's site captured it. */
  ref: string;
  /** The brand's own order id. THE idempotency key. */
  orderId: string;
  currency: string;
  checkoutTotalPence: number;
  lines: PostbackLines;
  /** 1 = first payment, 2 = first renewal. One-off orders are always 1. */
  paymentNumber?: number;
  recurring?: boolean;
  /** When the customer paid, from the brand's system, not ours. */
  paidAtISO: string;
};

export type ParseResult =
  | { ok: true; postback: ConversionPostback }
  | { ok: false; error: string };

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Read the body, refusing anything that would produce a wrong payment.
 *
 * Deliberately strict. A postback missing a field is a broken integration, and
 * the honest response is to say which field rather than to default it to zero
 * and pay somebody the wrong amount for a year.
 */
export function parsePostback(body: unknown): ParseResult {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const brandId = str(b.brandId);
  const ref = str(b.ref).toUpperCase();
  const orderId = str(b.orderId);
  const paidAtISO = str(b.paidAtISO);

  if (!brandId) return { ok: false, error: "brandId is required." };
  if (!ref) return { ok: false, error: "ref is required — without the creator's code there is nobody to credit." };
  if (!orderId) return { ok: false, error: "orderId is required — it is the idempotency key, and without it a retry pays twice." };
  if (!Number.isFinite(Date.parse(paidAtISO))) return { ok: false, error: "paidAtISO must be an ISO timestamp of when the customer actually paid." };

  const lines = (b.lines && typeof b.lines === "object" ? b.lines : {}) as Record<string, unknown>;
  if (!("productPence" in lines)) {
    return {
      ok: false,
      error: "lines.productPence is required. Commission is computed on product value only — tax, delivery and tips are money you never keep, so a total on its own cannot be used.",
    };
  }

  const productPence = num(lines.productPence);
  const checkoutTotalPence = num(b.checkoutTotalPence) || productPence;
  if (productPence > checkoutTotalPence) {
    return { ok: false, error: `Product value (${productPence}) is greater than the checkout total (${checkoutTotalPence}).` };
  }

  const paymentNumber = Math.max(1, Math.round(num(b.paymentNumber) || 1));

  return {
    ok: true,
    postback: {
      brandId, ref, orderId,
      currency: (str(b.currency) || "GBP").toUpperCase().slice(0, 3),
      checkoutTotalPence,
      lines: {
        productPence,
        taxPence: num(lines.taxPence),
        deliveryPence: num(lines.deliveryPence),
        tipPence: num(lines.tipPence),
        giftCardPence: num(lines.giftCardPence),
        otherExcludedPence: num(lines.otherExcludedPence),
        refundedPence: num(lines.refundedPence),
        cancelled: lines.cancelled === true,
      },
      paymentNumber,
      recurring: b.recurring === true || paymentNumber > 1,
      paidAtISO,
    },
  };
}

// ---------------------------------------------------------------------------
// Per-brand signing
// ---------------------------------------------------------------------------

const SECRETS = "brand_postback_secrets";

/**
 * Derived, not stored, when there is a platform secret to derive from.
 *
 * A per-brand secret that is a keyed hash of the brand id means there is no
 * table of secrets to leak, rotating the platform key rotates every brand's key
 * at once, and one brand's secret reveals nothing about another's.
 */
export function derivedSecretFor(brandId: string): string | null {
  const root = (process.env.POSTBACK_ROOT_SECRET || "").trim();
  if (!root) return null;
  return createHmac("sha256", root).update(`postback|${brandId}`).digest("hex");
}

export async function secretFor(brandId: string): Promise<string | null> {
  // An explicitly stored secret wins, so a brand that needs its own rotated key
  // can have one without changing the platform key for everybody.
  if (adminConfigured && adminDb) {
    try {
      const doc = await adminDb.collection(SECRETS).doc(brandId).get();
      const v = doc.exists ? (doc.data() as { secret?: string }).secret : "";
      if (v) return v;
    } catch { /* fall through to derivation */ }
  }
  return derivedSecretFor(brandId);
}

export type SigVerdict = { valid: boolean; reason?: string };

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8"); const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  try { return timingSafeEqual(ab, bb); } catch { return false; }
}

/**
 * Verify the raw body against the brand's secret.
 *
 * REFUSES when no secret is configured. This endpoint creates money owed; an
 * unverified one is a licence for anyone to mint it, and "it worked in testing"
 * is exactly how that reaches production open.
 */
export function verifyPostbackSignature(rawBody: string, header: string | null | undefined, secret: string | null): SigVerdict {
  if (!secret) return { valid: false, reason: "No signing secret for this brand — set POSTBACK_ROOT_SECRET or store a per-brand secret." };
  const sig = (header || "").trim().replace(/^sha256=/i, "").toLowerCase();
  if (!sig) return { valid: false, reason: "No X-MW-Signature header." };
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return safeEqual(sig, expected) ? { valid: true } : { valid: false, reason: "Signature did not match the body." };
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

const SEEN = "conversion_orders";
const seenMem = new Map<string, string>(); // key → the id of the record it created

export const orderKey = (brandId: string, orderId: string) =>
  `${brandId}__${createHash("sha256").update(orderId).digest("hex").slice(0, 24)}`;

/** Has this exact order already been accepted? Returns the earlier record's id. */
export async function alreadySeen(brandId: string, orderId: string): Promise<string | null> {
  const k = orderKey(brandId, orderId);
  const local = seenMem.get(k);
  if (local) return local;
  if (adminConfigured && adminDb) {
    try {
      const doc = await adminDb.collection(SEEN).doc(k).get();
      if (doc.exists) return (doc.data() as { recordId?: string }).recordId || k;
    } catch { /* memory is the fallback */ }
  }
  return null;
}

export async function markSeen(brandId: string, orderId: string, recordId: string): Promise<void> {
  const k = orderKey(brandId, orderId);
  seenMem.set(k, recordId);
  if (adminConfigured && adminDb) {
    try { await adminDb.collection(SEEN).doc(k).set({ brandId, recordId, at: new Date().toISOString() }); } catch { /* memory holds it */ }
  }
}

/** Test seam. Never called by product code. */
export function __resetPostbacks(): void { seenMem.clear(); }
