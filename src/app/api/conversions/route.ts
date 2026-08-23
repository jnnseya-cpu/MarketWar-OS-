import { NextRequest, NextResponse } from "next/server";
import {
  parsePostback, verifyPostbackSignature, secretFor, alreadySeen, markSeen,
} from "@/backend/conversion-postback";
import { accrue } from "@/backend/commission-ledger";
import { attributeSale } from "@/shared/referral-attribution";
import { listClicks } from "@/backend/referral-clicks";
import { rateLimit, clientKey } from "@/backend/guard";
import { FUNDING_MODES, type FundingPolicy } from "@/backend/profit-guard-economics";

// THE BRAND'S CHECKOUT TELLS US A SALE HAPPENED.
//
// POST /api/conversions
//   headers: X-MW-Signature: sha256=<hmac of the raw body, per-brand secret>
//   body:    { brandId, ref, orderId, currency, checkoutTotalPence,
//              lines: { productPence, taxPence, deliveryPence, ... },
//              paymentNumber?, recurring?, paidAtISO }
//
// This endpoint MINTS MONEY OWED, so it is the strictest one in the platform.
// Signed per brand, idempotent by order id, and it refuses rather than guessing
// any field that would change what somebody is paid.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The platform default, read from the one place funding modes are defined. */
function revenueLockedPolicy(): FundingPolicy {
  const p = FUNDING_MODES.find((m) => m.mode === "revenue_locked");
  if (!p) throw new Error("revenue_locked funding mode is missing from FUNDING_MODES");
  return p;
}

export async function POST(req: NextRequest) {
  // Generous, because a busy shop posts one per order — but not unbounded, since
  // this endpoint is public and creates liabilities.
  const rl = rateLimit(clientKey(req, "conversions"), 300, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  // RAW body first — re-serialising changes key order and the signature then
  // never matches, which is the most common way this integration is got wrong.
  const raw = await req.text();

  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = parsePostback(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const p = parsed.postback;

  // The signature is checked against the BRAND's own secret, so a leak from one
  // brand cannot forge another brand's orders.
  const secret = await secretFor(p.brandId);
  const verdict = verifyPostbackSignature(raw, req.headers.get("x-mw-signature"), secret);
  if (!verdict.valid) {
    return NextResponse.json({ error: "Invalid signature.", detail: verdict.reason }, { status: 401 });
  }

  // IDEMPOTENCY BEFORE ANYTHING ELSE. Checkouts retry, webhooks retry, and a
  // second accrual for one sale pays twice.
  const seen = await alreadySeen(p.brandId, p.orderId);
  if (seen) {
    return NextResponse.json({ ok: true, duplicate: true, accrualId: seen, note: "This order was already recorded. Nothing was added." });
  }

  const nowISO = new Date().toISOString();

  // Does a click actually connect this code to this sale? A sanity check, not a
  // per-person match — see the note in shared/referral-attribution.ts.
  const attribution = attributeSale({
    code: p.ref,
    saleAtISO: p.paidAtISO,
    clicks: (await listClicks(p.ref)).map((c) => ({ code: c.code, atISO: c.atISO })),
  });
  if (!attribution.attributed) {
    // Recorded as seen so a retry does not re-run the work, but nothing accrues.
    // 200, not an error: the brand's integration is working correctly and this
    // order simply is not one a creator earned.
    await markSeen(p.brandId, p.orderId, "unattributed");
    return NextResponse.json({ ok: true, attributed: false, reason: attribution.reason });
  }

  const result = await accrue({
    brandId: p.brandId,
    code: p.ref,
    orderId: p.orderId,
    checkoutTotalPence: p.checkoutTotalPence,
    lines: { ...p.lines, checkoutTotalPence: p.checkoutTotalPence },
    paymentNumber: p.paymentNumber ?? 1,
    recurring: Boolean(p.recurring),
    paidAtISO: p.paidAtISO,
    nowISO,
    // Cash-Protected Growth by default, taken from FUNDING_MODES rather than
    // written out here — a second copy of a settlement window is a second
    // rulebook, and the two disagree the first time one is edited.
    policy: revenueLockedPolicy(),
  });

  if (!result.ok) {
    await markSeen(p.brandId, p.orderId, "not-commissionable");
    return NextResponse.json({ ok: true, attributed: true, accrued: false, reason: result.reason });
  }

  await markSeen(p.brandId, p.orderId, result.accrual.id);
  return NextResponse.json({
    ok: true,
    attributed: true,
    accrued: true,
    accrualId: result.accrual.id,
    eligiblePence: result.accrual.eligiblePence,
    earnedPence: result.accrual.earnedPence,
    releasedPence: result.accrual.releasedPence,
    state: result.accrual.state,
    why: result.accrual.why,
    attribution: attribution.reason,
  });
}

/** How to integrate, readable without a login. No secrets are returned. */
export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/conversions",
    signature: "X-MW-Signature: sha256=<hex HMAC-SHA256 of the exact raw request body, using your brand's postback secret>",
    idempotency: "By orderId. Retries are safe and never accrue twice.",
    required: ["brandId", "ref", "orderId", "paidAtISO", "lines.productPence"],
    whyLinesMatter:
      "Commission is computed on product value only. Tax, delivery, tips and gift cards are money you never keep, so they cannot fund a commission — send them separately and they are excluded rather than guessed.",
    recurring: "Send paymentNumber: 1 for the first payment, 2 for the first renewal, and so on. Whether a renewal earns anything is set by the programme.",
  });
}
