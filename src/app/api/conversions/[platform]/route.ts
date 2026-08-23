import { NextRequest, NextResponse } from "next/server";
import { adapt, type Platform } from "@/shared/order-adaptors";
import { verifyShopify, verifyWoo, verifyStripeWebhook } from "@/backend/platform-webhooks";
import { alreadySeen, markSeen } from "@/backend/conversion-postback";
import { accrue } from "@/backend/commission-ledger";
import { attributeSale } from "@/shared/referral-attribution";
import { listClicks } from "@/backend/referral-clicks";
import { FUNDING_MODES, type FundingPolicy } from "@/backend/profit-guard-economics";
import { rateLimit, clientKey } from "@/backend/guard";

// THE SHOP'S OWN WEBHOOK, ACCEPTED AS-IS.
//
//   POST /api/conversions/shopify?brandId=…       X-Shopify-Hmac-Sha256
//   POST /api/conversions/woocommerce?brandId=…   X-WC-Webhook-Signature
//   POST /api/conversions/stripe?brandId=…        Stripe-Signature
//
// The signed postback at /api/conversions is correct and a small business is
// never going to write one. This takes what the platform already sends, verifies
// it with that platform's own scheme, and translates it into the same order.
//
// The brand is named in the QUERY STRING rather than the body, because none of
// these platforms will add a field to their payload for us — and it is not a
// secret, it is an identifier. What proves the request is the signature.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLATFORMS: Platform[] = ["shopify", "woocommerce", "stripe"];

function policy(): FundingPolicy {
  const p = FUNDING_MODES.find((m) => m.mode === "revenue_locked");
  if (!p) throw new Error("revenue_locked funding mode is missing from FUNDING_MODES");
  return p;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ platform: string }> }) {
  const platform = ((await ctx.params).platform || "").toLowerCase() as Platform;
  if (!PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: `Unknown platform. Use one of: ${PLATFORMS.join(", ")}.` }, { status: 404 });
  }

  const rl = rateLimit(clientKey(req, `conv-${platform}`), 300, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const brandId = (req.nextUrl.searchParams.get("brandId") || "").trim();
  if (!brandId) return NextResponse.json({ error: "brandId query parameter is required." }, { status: 400 });

  // RAW body, before anything touches it. All three schemes sign exact bytes.
  const raw = await req.text();

  const verdict =
    platform === "shopify" ? verifyShopify(raw, req.headers.get("x-shopify-hmac-sha256"))
      : platform === "woocommerce" ? verifyWoo(raw, req.headers.get("x-wc-webhook-signature"))
        : verifyStripeWebhook(raw, req.headers.get("stripe-signature"), Date.now());

  if (!verdict.valid) {
    return NextResponse.json({ error: "Invalid signature.", detail: verdict.reason }, { status: 401 });
  }

  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const adapted = adapt(platform, payload);
  if (!adapted.ok) {
    // 200 with a reason, not an error. An order with no referral code is a
    // perfectly normal order that no creator earned, and returning a failure
    // would make the shop's webhook log fill with red for correct behaviour —
    // and Shopify disables an endpoint that keeps failing.
    return NextResponse.json({ ok: true, accrued: false, reason: adapted.error });
  }
  const o = adapted.order;

  const seen = await alreadySeen(brandId, o.orderId);
  if (seen) return NextResponse.json({ ok: true, duplicate: true, accrualId: seen });

  const clicks = (await listClicks(o.ref)).map((c) => ({ code: c.code, atISO: c.atISO }));
  const attribution = attributeSale({ code: o.ref, saleAtISO: o.paidAtISO, clicks });
  if (!attribution.attributed) {
    await markSeen(brandId, o.orderId, "unattributed");
    return NextResponse.json({ ok: true, accrued: false, reason: attribution.reason });
  }

  const result = await accrue({
    brandId, code: o.ref, orderId: o.orderId,
    checkoutTotalPence: o.checkoutTotalPence,
    lines: { ...o.lines, checkoutTotalPence: o.checkoutTotalPence },
    paymentNumber: o.paymentNumber, recurring: o.recurring,
    paidAtISO: o.paidAtISO, nowISO: new Date().toISOString(),
    policy: policy(),
  });

  if (!result.ok) {
    await markSeen(brandId, o.orderId, "not-commissionable");
    return NextResponse.json({ ok: true, accrued: false, reason: result.reason });
  }
  await markSeen(brandId, o.orderId, result.accrual.id);
  return NextResponse.json({
    ok: true, accrued: true, accrualId: result.accrual.id,
    earnedPence: result.accrual.earnedPence, state: result.accrual.state,
  });
}

/** Setup instructions, readable without a login. No secrets are returned. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ platform: string }> }) {
  const platform = ((await ctx.params).platform || "").toLowerCase();
  const guide: Record<string, unknown> = {
    shopify: {
      webhook: "Settings → Notifications → Webhooks → create `Order payment` (orders/paid), JSON",
      url: "https://marketwaros.com/api/conversions/shopify?brandId=YOUR_BRAND_ID",
      secret: "SHOPIFY_WEBHOOK_SECRET must match the signing secret Shopify shows you.",
      theCode: "Put the creator's code in a cart/note attribute named `mw_ref`. The landing URL is read as a fallback.",
    },
    woocommerce: {
      webhook: "WooCommerce → Settings → Advanced → Webhooks → Topic `Order updated`, delivery JSON",
      url: "https://marketwaros.com/api/conversions/woocommerce?brandId=YOUR_BRAND_ID",
      secret: "WOO_WEBHOOK_SECRET must match the webhook's Secret field.",
      theCode: "Store the code in order meta named `mw_ref`.",
    },
    stripe: {
      webhook: "Developers → Webhooks → add `checkout.session.completed` and `invoice.paid`",
      url: "https://marketwaros.com/api/conversions/stripe?brandId=YOUR_BRAND_ID",
      secret: "STRIPE_WEBHOOK_SECRET, the signing secret for that endpoint.",
      theCode: "Set `metadata[mw_ref]` on the Checkout Session or Subscription.",
    },
  };
  const g = guide[platform];
  if (!g) return NextResponse.json({ error: `Unknown platform. Use one of: ${PLATFORMS.join(", ")}.` }, { status: 404 });
  return NextResponse.json({
    platform, ...g,
    commission: "Computed on product value only. Tax, delivery, tips and gift cards are excluded — they are money you never keep.",
    idempotency: "By the platform's own order id. Retries and replays never accrue twice.",
  });
}
