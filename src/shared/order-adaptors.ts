// SHOPIFY, WOOCOMMERCE AND STRIPE, TRANSLATED INTO ONE ORDER.
//
// The conversion endpoint is done and correct, and a small business is never
// going to write an HMAC-signed postback by hand. So each platform's own order
// webhook is accepted as-is and translated here.
//
// Pure, so every mapping can be tested against a real captured payload with no
// network, no shop and no keys.
//
// ────────────────────────────────────────────────────────────────────────────
// THE TRAP THIS FILE EXISTS TO AVOID: MONEY AS A DECIMAL STRING
// ────────────────────────────────────────────────────────────────────────────
//
// Shopify and WooCommerce send money as strings — "120.00", "9.99", "1.15".
// The obvious conversion is `Math.round(parseFloat(v) * 100)`, and it is wrong
// often enough to matter: binary floating point cannot hold 1.15, so
// `parseFloat("1.15") * 100` is 114.99999999999999. Math.round rescues that one
// and does not rescue every one, and each failure is a penny in somebody's
// commission that nobody can explain.
//
// `decimalToPence` never converts through a float. It splits on the decimal
// point and does integer arithmetic on the two halves.

export type AdaptedOrder = {
  ref: string;
  orderId: string;
  currency: string;
  checkoutTotalPence: number;
  lines: {
    productPence: number;
    taxPence: number;
    deliveryPence: number;
    tipPence: number;
    giftCardPence: number;
    otherExcludedPence: number;
    refundedPence: number;
    cancelled: boolean;
  };
  paymentNumber: number;
  recurring: boolean;
  paidAtISO: string;
};

export type AdaptResult = { ok: true; order: AdaptedOrder } | { ok: false; error: string };

/**
 * "120.00" → 12000, exactly, without ever touching a float.
 *
 * Accepts a number too (Stripe sends integers in minor units elsewhere, and a
 * caller may already have pence). Negative values are clamped to zero: a
 * negative line item is a refund or an adjustment and belongs in its own field,
 * not as a negative product value that would silently reduce the commission.
 */
export function decimalToPence(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? Math.max(0, Math.round(v * 100)) : 0;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const m = s.match(/^-?(\d+)(?:[.,](\d+))?$/);
  if (!m) return 0;
  const whole = Number(m[1]);
  // Pad or truncate to exactly two digits. "9.9" is 990, "9.999" is 999 — a
  // third decimal is sub-penny and cannot be paid, so it is dropped rather than
  // rounded up into money the merchant did not take.
  const frac = (m[2] || "").padEnd(2, "0").slice(0, 2);
  const pence = whole * 100 + Number(frac);
  return s.startsWith("-") ? 0 : pence;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Find the referral code anywhere a platform might have kept it.
 *
 * Deliberately generous, because the shop owner controls where it lands and a
 * missing code means an unpaid creator. Checks explicit metadata first, then the
 * landing URL the customer arrived on.
 */
export function findRef(candidates: Array<unknown>): string {
  for (const c of candidates) {
    const s = str(c);
    if (!s) continue;
    // A bare code.
    if (/^[A-Za-z0-9_-]{3,32}$/.test(s)) return s.toUpperCase();
    // A URL or query string carrying it.
    const m = s.match(/[?&](?:mw_ref|ref)=([A-Za-z0-9_-]{3,32})/);
    if (m) return m[1].toUpperCase();
  }
  return "";
}

// ---------------------------------------------------------------------------
// Shopify — orders/paid
// ---------------------------------------------------------------------------

export function fromShopify(payload: unknown): AdaptResult {
  const o = obj(payload);
  const id = str(o.id) || (typeof o.id === "number" ? String(o.id) : "");
  if (!id) return { ok: false, error: "Shopify order has no id." };

  // The code: a note attribute the shop sets, a cart attribute, or the landing
  // page the customer first arrived on.
  const noteAttrs = arr(o.note_attributes).map((n) => {
    const na = obj(n);
    return /^(mw_ref|ref|referral)$/i.test(str(na.name)) ? str(na.value) : "";
  });
  const ref = findRef([...noteAttrs, obj(o.cart_attributes).mw_ref, o.landing_site, o.referring_site, o.note]);
  if (!ref) return { ok: false, error: "No referral code on this Shopify order — nothing to credit." };

  // subtotal_price is the line-item total AFTER discounts and BEFORE tax and
  // shipping, which is exactly the value a commission may be computed on.
  const productPence = decimalToPence(o.subtotal_price ?? o.current_subtotal_price);
  const taxPence = decimalToPence(o.total_tax ?? o.current_total_tax);
  const deliveryPence = decimalToPence(obj(obj(o.total_shipping_price_set).shop_money).amount);
  const tipPence = decimalToPence(o.total_tip_received);
  const refundedPence = arr(o.refunds).reduce((sum: number, r) => {
    const tx = arr(obj(r).transactions).reduce((t: number, x) => t + decimalToPence(obj(x).amount), 0);
    return sum + tx;
  }, 0);

  const cancelled = Boolean(str(o.cancelled_at)) || str(o.financial_status) === "voided";
  const paidAtISO = str(o.processed_at) || str(o.created_at) || new Date().toISOString();

  return {
    ok: true,
    order: {
      ref, orderId: `shopify_${id}`,
      currency: (str(o.currency) || "GBP").toUpperCase(),
      checkoutTotalPence: decimalToPence(o.total_price ?? o.current_total_price),
      lines: {
        productPence, taxPence, deliveryPence, tipPence,
        giftCardPence: decimalToPence(o.total_gift_card_amount ?? 0),
        otherExcludedPence: 0,
        refundedPence, cancelled,
      },
      // Shopify subscription apps vary; a plain order is always payment one.
      paymentNumber: 1, recurring: false,
      paidAtISO,
    },
  };
}

// ---------------------------------------------------------------------------
// WooCommerce — order.updated / order.created with status "processing"/"completed"
// ---------------------------------------------------------------------------

export function fromWoo(payload: unknown): AdaptResult {
  const o = obj(payload);
  const id = typeof o.id === "number" ? String(o.id) : str(o.id);
  if (!id) return { ok: false, error: "WooCommerce order has no id." };

  const meta = arr(o.meta_data).map((m) => {
    const md = obj(m);
    return /^_?(mw_ref|ref|referral)$/i.test(str(md.key)) ? str(md.value) : "";
  });
  const ref = findRef([...meta, o.customer_note, obj(o._wc_order_attribution).utm_content]);
  if (!ref) return { ok: false, error: "No referral code on this WooCommerce order — nothing to credit." };

  // Woo's `total` INCLUDES tax and shipping, so product value is derived rather
  // than taken: line items minus their discount.
  const lineTotal = arr(o.line_items).reduce((sum: number, li) => sum + decimalToPence(obj(li).total), 0);
  const taxPence = decimalToPence(o.total_tax);
  const deliveryPence = decimalToPence(o.shipping_total);
  const refundedPence = arr(o.refunds).reduce((sum: number, r) => sum + decimalToPence(obj(r).total), 0);
  const status = str(o.status).toLowerCase();

  return {
    ok: true,
    order: {
      ref, orderId: `woo_${id}`,
      currency: (str(o.currency) || "GBP").toUpperCase(),
      checkoutTotalPence: decimalToPence(o.total),
      lines: {
        productPence: lineTotal,
        taxPence, deliveryPence,
        tipPence: 0, giftCardPence: 0, otherExcludedPence: 0,
        refundedPence,
        cancelled: status === "cancelled" || status === "failed" || status === "refunded",
      },
      paymentNumber: 1, recurring: false,
      paidAtISO: str(o.date_paid_gmt) ? `${str(o.date_paid_gmt)}Z`.replace(/ZZ$/, "Z") : (str(o.date_created_gmt) ? `${str(o.date_created_gmt)}Z`.replace(/ZZ$/, "Z") : new Date().toISOString()),
    },
  };
}

// ---------------------------------------------------------------------------
// Stripe — checkout.session.completed / invoice.paid
// ---------------------------------------------------------------------------

export function fromStripe(event: unknown): AdaptResult {
  const e = obj(event);
  const type = str(e.type);
  const o = obj(obj(e.data).object);
  const id = str(o.id);
  if (!id) return { ok: false, error: "Stripe event has no object id." };

  const md = obj(o.metadata);
  const ref = findRef([md.mw_ref, md.ref, md.referral, obj(obj(o.subscription_details).metadata).mw_ref]);
  if (!ref) return { ok: false, error: "No mw_ref in the Stripe metadata — nothing to credit." };

  // Stripe is already in minor units, so no decimal parsing at all.
  const minor = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
  const details = obj(o.total_details);

  const isInvoice = type === "invoice.paid" || type === "invoice.payment_succeeded";
  // An invoice carries which payment in the series this is; a one-off checkout
  // is always the first.
  const paymentNumber = isInvoice
    ? Math.max(1, Math.round(Number(md.mw_payment_number) || Number(o.billing_reason === "subscription_create" ? 1 : 0) || 1))
    : 1;

  const total = minor(o.amount_total ?? o.amount_paid ?? o.total);
  const tax = minor(details.amount_tax ?? o.tax);
  const shipping = minor(details.amount_shipping);
  const discount = minor(details.amount_discount);
  const subtotal = minor(o.amount_subtotal ?? o.subtotal);
  // Product value: the subtotal after discount when Stripe gives one, otherwise
  // what is left of the total once tax and shipping come out.
  const productPence = subtotal > 0 ? Math.max(0, subtotal - discount) : Math.max(0, total - tax - shipping);

  const paidAt = typeof o.created === "number" ? new Date(o.created * 1000).toISOString()
    : typeof e.created === "number" ? new Date(e.created * 1000).toISOString()
      : new Date().toISOString();

  return {
    ok: true,
    order: {
      ref, orderId: `stripe_${id}`,
      currency: (str(o.currency) || "gbp").toUpperCase(),
      checkoutTotalPence: total,
      lines: {
        productPence, taxPence: tax, deliveryPence: shipping,
        tipPence: 0, giftCardPence: 0, otherExcludedPence: 0,
        refundedPence: minor(o.amount_refunded),
        cancelled: str(o.status) === "canceled" || str(o.status) === "void",
      },
      paymentNumber,
      recurring: isInvoice || Boolean(o.subscription),
      paidAtISO: paidAt,
    },
  };
}

export type Platform = "shopify" | "woocommerce" | "stripe";

export function adapt(platform: Platform, payload: unknown): AdaptResult {
  if (platform === "shopify") return fromShopify(payload);
  if (platform === "woocommerce") return fromWoo(payload);
  if (platform === "stripe") return fromStripe(payload);
  return { ok: false, error: `Unknown platform "${platform}".` };
}
