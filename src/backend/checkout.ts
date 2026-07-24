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

export type CheckoutInput = { brandId: string; source: string; amountGbp: number; productName?: string; currency?: string };
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
export async function createTopupCheckout(input: { amountGbp: number; acus: number; orgId?: string; planId?: string }): Promise<CheckoutResult & { acus: number }> {
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
    "metadata[marketwar_plan]": input.planId ?? "",
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
export async function createSubscriptionCheckout(input: { planId: string; planName: string; cycle: "monthly" | "annual"; amountGbp: number }): Promise<CheckoutResult & { planId: string; cycle: "monthly" | "annual" }> {
  const cycle = input.cycle === "annual" ? "annual" : "monthly";
  const interval = cycle === "annual" ? "year" : "month";
  const amountGbp = Math.max(0, Number(input.amountGbp) || 0);
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

export async function createCheckoutLink(input: CheckoutInput): Promise<CheckoutResult> {
  const brandId = (input.brandId || "").trim();
  const source = (input.source || "").trim() || "Checkout";
  const amountGbp = Math.max(0, Number(input.amountGbp) || 0);
  const productName = (input.productName || "").trim() || "Order";
  const currency = (input.currency || "gbp").toLowerCase();
  const metadata = { marketwar_brand_id: brandId, marketwar_source: source };

  if (!brandId) return { ok: false, mode: checkoutConfigured ? "live" : "demo", url: null, sessionId: null, metadata, note: "brandId is required", error: "brandId is required" };
  if (amountGbp <= 0) return { ok: false, mode: checkoutConfigured ? "live" : "demo", url: null, sessionId: null, metadata, note: "amount must be greater than zero", error: "amount must be > 0" };

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
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json()) as { url?: string; id?: string; error?: { message?: string } };
    if (!res.ok) return { ok: false, mode: "live", url: null, sessionId: null, metadata, note: "Stripe rejected the checkout request", error: data?.error?.message || `HTTP ${res.status}` };
    return { ok: true, mode: "live", url: data.url ?? null, sessionId: data.id ?? null, metadata, note: "Live Stripe Checkout link — share it; the payment auto-attributes to this brand + source." };
  } catch (e) {
    return { ok: false, mode: "live", url: null, sessionId: null, metadata, note: "Network error contacting Stripe", error: e instanceof Error ? e.message : "unknown" };
  }
}
