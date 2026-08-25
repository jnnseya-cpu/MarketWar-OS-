// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Tagged checkout links — closes the money loop so payments self-attribute.
//
// MarketWar creates a Stripe Checkout Session pre-stamped with
// metadata.marketwar_brand_id + marketwar_source. When a customer pays that
// link, the Stripe webhook (src/app/api/webhooks/stripe) records attributed
// revenue for the brand automatically — no metadata set by hand, no manual
// logging. Dependency-free: a form-encoded POST to Stripe's REST API with the
// secret key (no `stripe` package). Demo-safe: without STRIPE_SECRET_KEY it
// returns a simulated link plus the exact metadata that WILL attribute.

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
// Never fall back to localhost in a hosted build — a checkout/return URL of
// localhost is broken for real customers. Default to the production domain.
const APP_URL = (process.env.NEXT_PUBLIC_PRODUCTION_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.marketwaros.com").replace(/\/$/, "");

export const checkoutConfigured = Boolean(STRIPE_SECRET_KEY);

/** Is the platform key one that moves real money? */
export function keyIsLive(secret = STRIPE_SECRET_KEY): boolean {
  return /^(sk|rk)_live/.test(secret);
}

/** A Stripe connected-account id, or "" if the value is not one. */
export function connectedAccount(id: string | undefined | null): string {
  const v = (id || "").trim();
  return /^acct_[A-Za-z0-9]+$/.test(v) ? v : "";
}

export type CheckoutInput = {
  brandId: string;
  source: string;
  amountGbp: number;
  productName?: string;
  currency?: string;
  /**
   * The SELLER's own Stripe connected account (`acct_…`). When present the
   * session is created ON that account, so the buyer's money lands in the
   * seller's balance and never enters MarketWar's.
   */
  stripeAccountId?: string;
};
export type CheckoutResult = {
  ok: boolean;
  mode: "live" | "demo";
  url: string | null;
  sessionId: string | null;
  metadata: { marketwar_brand_id: string; marketwar_source: string };
  note: string;
  error?: string;
};

function formEncode(params: Record<string, string>): string {
  return Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}

// ACU top-up checkout — the platform selling ACUs to the customer. Creates a
// Stripe Checkout Session stamped with metadata.marketwar_topup + the ACU
// quantity, so the webhook credits the customer's ACU wallet on payment. No
// discount (the 4× provider-cost recovery must stay protected). Demo-safe.
// NOTE: no `acus` parameter. The count is DERIVED from the amount below and
// stamped into the metadata, so a caller cannot ask for more ACUs than they are
// paying for. It used to be accepted and then ignored, which is a loaded gun
// left for whoever next "fixes" the unused argument by honouring it.
export async function createTopupCheckout(input: { amountGbp: number; orgId?: string; planId?: string }): Promise<CheckoutResult & { acus: number }> {
  const amountGbp = Math.max(0, Number(input.amountGbp) || 0);
  // SERVER-AUTHORITATIVE ACU quantity: never trust the client's `acus` (it can be
  // decoupled from the charge → pay £1, claim 1,000,000 ACUs). £1 = 100 ACUs.
  const ACU_PER_GBP = 100;
  const acus = Math.max(0, Math.round(amountGbp * ACU_PER_GBP));
  const metadata = { marketwar_brand_id: "", marketwar_source: "ACU top-up" };
  if (amountGbp <= 0 || acus <= 0) return { ok: false, mode: checkoutConfigured ? "live" : "demo", url: null, sessionId: null, metadata, acus, note: "amount and acus must be > 0", error: "amount and acus must be > 0" };

  if (!checkoutConfigured) {
    return {
      ok: true, mode: "demo", sessionId: null, metadata, acus,
      url: `${APP_URL}/checkout-demo?topup=1&acus=${acus}&amt=${amountGbp}`,
      note: `Demo mode — set STRIPE_SECRET_KEY to mint a real Stripe link. On payment the webhook credits ${acus} ACUs (metadata.marketwar_topup) to the wallet. No discount on top-ups.`,
    };
  }

  const body = formEncode({
    mode: "payment",
    success_url: `${APP_URL}/dashboard/billing?topup=success`,
    cancel_url: `${APP_URL}/dashboard/billing?topup=cancel`,
    "line_items[0][price_data][currency]": "gbp",
    "line_items[0][price_data][product_data][name]": `${acus.toLocaleString("en-GB")} ACUs top-up`,
    "line_items[0][price_data][unit_amount]": String(Math.round(amountGbp * 100)),
    "line_items[0][quantity]": "1",
    "metadata[marketwar_topup]": "true",
    "metadata[marketwar_acus]": String(acus),
    "metadata[marketwar_org_id]": input.orgId ?? "",
    "metadata[orgId]": input.orgId ?? "",
    "metadata[marketwar_plan]": input.planId ?? "",
    ...(input.orgId ? { client_reference_id: input.orgId } : {}),
  });
  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST", headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" }, body,
    });
    const data = (await res.json()) as { url?: string; id?: string; error?: { message?: string } };
    if (!res.ok) return { ok: false, mode: "live", url: null, sessionId: null, metadata, acus, note: "Stripe rejected the top-up", error: data?.error?.message || `HTTP ${res.status}` };
    return { ok: true, mode: "live", url: data.url ?? null, sessionId: data.id ?? null, metadata, acus, note: `Live Stripe link — paying it credits ${acus} ACUs to your wallet.` };
  } catch (e) {
    return { ok: false, mode: "live", url: null, sessionId: null, metadata, acus, note: "Network error contacting Stripe", error: e instanceof Error ? e.message : "unknown" };
  }
}

// Subscription checkout — a customer choosing a plan at sign-up. Creates a Stripe
// Checkout Session in `subscription` mode with a recurring price (monthly or
// annual), stamped with metadata.planId so the webhook activates the plan +
// allocates ACUs. Annual applies the 30% discount at the amount passed in.
export async function createSubscriptionCheckout(input: { planId: string; planName: string; cycle: "monthly" | "annual"; amountGbp: number; orgId?: string }): Promise<CheckoutResult & { planId: string; cycle: "monthly" | "annual" }> {
  const cycle = input.cycle === "annual" ? "annual" : "monthly";
  const interval = cycle === "annual" ? "year" : "month";
  const amountGbp = Math.max(0, Number(input.amountGbp) || 0);
  const orgId = (input.orgId || "").trim();
  const metadata = { marketwar_brand_id: "", marketwar_source: `subscription:${input.planId}` };
  if (amountGbp <= 0) return { ok: false, mode: checkoutConfigured ? "live" : "demo", url: null, sessionId: null, metadata, planId: input.planId, cycle, note: "amount must be > 0 (Free plan needs no checkout)", error: "amount must be > 0" };

  if (!checkoutConfigured) {
    return {
      ok: true, mode: "demo", sessionId: null, metadata, planId: input.planId, cycle,
      url: `${APP_URL}/checkout-demo?plan=${encodeURIComponent(input.planId)}&cycle=${cycle}&amt=${amountGbp}`,
      note: `Demo mode — set STRIPE_SECRET_KEY to start a real ${cycle} subscription. On payment the webhook activates ${input.planName} and allocates its ACUs.`,
    };
  }

  const body = formEncode({
    mode: "subscription",
    success_url: `${APP_URL}/dashboard?subscribed=${encodeURIComponent(input.planId)}`,
    cancel_url: `${APP_URL}/choose-plan?canceled=1`,
    "line_items[0][price_data][currency]": "gbp",
    "line_items[0][price_data][product_data][name]": `MarketWar ${input.planName} (${cycle})`,
    "line_items[0][price_data][unit_amount]": String(Math.round(amountGbp * 100)),
    "line_items[0][price_data][recurring][interval]": interval,
    "line_items[0][quantity]": "1",
    "metadata[planId]": input.planId,
    "metadata[cycle]": cycle,
    // Who to credit: stamp the org id on the session AND the subscription so both
    // checkout.session.completed and every future invoice.paid can find the wallet.
    ...(orgId ? {
      client_reference_id: orgId,
      "metadata[orgId]": orgId,
      "metadata[marketwar_org_id]": orgId,
      "subscription_data[metadata][orgId]": orgId,
      "subscription_data[metadata][marketwar_org_id]": orgId,
    } : {}),
    "subscription_data[metadata][planId]": input.planId,
    "subscription_data[metadata][cycle]": cycle,
  });
  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST", headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" }, body,
    });
    const data = (await res.json()) as { url?: string; id?: string; error?: { message?: string } };
    if (!res.ok) return { ok: false, mode: "live", url: null, sessionId: null, metadata, planId: input.planId, cycle, note: "Stripe rejected the subscription", error: data?.error?.message || `HTTP ${res.status}` };
    return { ok: true, mode: "live", url: data.url ?? null, sessionId: data.id ?? null, metadata, planId: input.planId, cycle, note: `Live Stripe ${cycle} subscription for ${input.planName}.` };
  } catch (e) {
    return { ok: false, mode: "live", url: null, sessionId: null, metadata, planId: input.planId, cycle, note: "Network error contacting Stripe", error: e instanceof Error ? e.message : "unknown" };
  }
}

// WHOSE MONEY IS THIS?
//
// createCheckoutLink builds a checkout for something the CUSTOMER is selling —
// their platter, their consultancy day, their £199 course. Every other function
// in this file sells MarketWar's own product (a plan, a top-up) and rightly
// charges on MarketWar's key. This one does not, and for a long time it used
// that same key anyway. The consequence was not theoretical: a customer shares
// the link, a buyer pays £199, and the £199 lands in MarketWar's Stripe balance
// with no payout path back — MarketWar holding a stranger's takings, and the
// seller with a receipt naming the wrong company.
//
// A warning under the button was not a control. This is:
//
//   1. Seller has a connected account (`acct_…`)  → mint ON their account. The
//      money is theirs from the first second and never touches our balance.
//   2. No connected account, platform key is TEST → mint as before. Test cards
//      only, no real money exists to misroute, so the attribution loop stays
//      provable end to end.
//   3. No connected account, platform key is LIVE → REFUSE, and say where to
//      sell instead (their own payment link on a funnel page, which already
//      works and never passes through us).
//
// Nothing was removed to achieve this. The demo path is intact, the attribution
// metadata is unchanged, and the capability grew a way to sell for real.
export function sellerRoute(stripeAccountId: string | undefined, live = keyIsLive()): {
  route: "connected" | "test" | "refuse";
  account: string;
  note: string;
} {
  const account = connectedAccount(stripeAccountId);
  if (account) {
    return {
      route: "connected", account,
      note: `Paid straight into your own Stripe account (${account}). MarketWar creates the link and reads the payment for attribution, but never holds the money — there is nothing for us to pay out because it was never ours.`,
    };
  }
  if (!live) {
    return {
      route: "test", account: "",
      note: "Test mode: this link takes Stripe test cards only, so no real money moves. It exists to prove the attribution loop end to end. To sell for real, either connect your own Stripe account or put your own payment link on a funnel page.",
    };
  }
  return {
    route: "refuse", account: "",
    note: "This would take a real payment into MarketWar's Stripe account rather than yours, and there is no payout path back to you — so we will not create it. Two ways to actually get paid: connect your own Stripe account (the money is then yours from the first second), or put your own payment link — Stripe, PayPal, SumUp, Shopify — on a funnel page, which never passes through us at all.",
  };
}

export async function createCheckoutLink(input: CheckoutInput): Promise<CheckoutResult> {
  const brandId = (input.brandId || "").trim();
  const source = (input.source || "").trim() || "Checkout";
  const amountGbp = Math.max(0, Number(input.amountGbp) || 0);
  const productName = (input.productName || "").trim() || "Order";
  const currency = (input.currency || "gbp").toLowerCase();
  const metadata = { marketwar_brand_id: brandId, marketwar_source: source };

  if (!brandId) return { ok: false, mode: checkoutConfigured ? "live" : "demo", url: null, sessionId: null, metadata, note: "brandId is required", error: "brandId is required" };
  if (amountGbp <= 0) return { ok: false, mode: checkoutConfigured ? "live" : "demo", url: null, sessionId: null, metadata, note: "amount must be greater than zero", error: "amount must be > 0" };

  const seller = sellerRoute(input.stripeAccountId);
  if (checkoutConfigured && seller.route === "refuse") {
    return { ok: false, mode: "live", url: null, sessionId: null, metadata, note: seller.note, error: "This sale would be paid to MarketWar rather than to you — connect your own Stripe account, or use your own payment link on a funnel page." };
  }

  if (!checkoutConfigured) {
    return {
      ok: true, mode: "demo", sessionId: null, metadata,
      url: `${APP_URL}/checkout-demo?brand=${encodeURIComponent(brandId)}&source=${encodeURIComponent(source)}&amt=${amountGbp}`,
      note: "Demo mode — set STRIPE_SECRET_KEY to mint a real Stripe Checkout link. The metadata shown here is exactly what attributes the payment: when a customer pays a real link carrying it, the webhook records the revenue for this brand automatically.",
    };
  }

  const body = formEncode({
    mode: "payment",
    success_url: `${APP_URL}/dashboard/revenue?paid=1`,
    cancel_url: `${APP_URL}/dashboard/revenue?canceled=1`,
    "line_items[0][price_data][currency]": currency,
    "line_items[0][price_data][product_data][name]": productName,
    "line_items[0][price_data][unit_amount]": String(Math.round(amountGbp * 100)),
    "line_items[0][quantity]": "1",
    "metadata[marketwar_brand_id]": brandId,
    "metadata[marketwar_source]": source,
    // Also stamp the PaymentIntent so charge.succeeded/payment_intent.succeeded attribute too.
    "payment_intent_data[metadata][marketwar_brand_id]": brandId,
    "payment_intent_data[metadata][marketwar_source]": source,
  });

  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
        // Direct charge on the seller's own account: Stripe settles to THEM.
        ...(seller.account ? { "Stripe-Account": seller.account } : {}),
      },
      body,
    });
    const data = (await res.json()) as { url?: string; id?: string; error?: { message?: string } };
    if (!res.ok) return { ok: false, mode: "live", url: null, sessionId: null, metadata, note: "Stripe rejected the checkout request", error: data?.error?.message || `HTTP ${res.status}` };
    return { ok: true, mode: "live", url: data.url ?? null, sessionId: data.id ?? null, metadata, note: `Share this link; the payment auto-attributes to this brand + source. ${seller.note}` };
  } catch (e) {
    return { ok: false, mode: "live", url: null, sessionId: null, metadata, note: "Network error contacting Stripe", error: e instanceof Error ? e.message : "unknown" };
  }
}
