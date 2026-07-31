// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Funnel → checkout, without ever touching the customer's money.
//
// The Funnel Builder was labelled "hosted page building + checkout wiring land
// with connectors". Both halves were already here: pages publish to
// /b/<brand>/<slug>, and checkout.ts mints Stripe sessions. Joining them looked
// like an afternoon's work — until you follow where the money goes.
//
// createCheckoutLink() creates the session on the PLATFORM's STRIPE_SECRET_KEY.
// A customer selling a £199 product through it sends £199 to MarketWar's Stripe
// balance, correctly attributed in the reports and entirely in the wrong bank
// account, with no payout mechanism back to them. Wiring that into every funnel
// page would have multiplied one bad panel into the whole product, and put the
// platform in payment-facilitator territory it has not built for.
//
// So the button carries the CUSTOMER'S OWN payment link. Stripe Payment Links,
// PayPal.me, SumUp, Shopify, Square, a Calendly deposit — whatever they already
// use. Money moves from their buyer to them and never passes through us.
//
// WHAT THIS COSTS THE CUSTOMER: nothing per sale, and nothing in ACUs. Writing
// the funnel is AI work with a real provider bill behind it, so it comes out of
// the plan's ACU allowance like any other generation. Rendering a button and
// counting clicks costs us no provider spend at all, and metering it would be a
// payment fee wearing a compute costume — inventing a cost we do not bear
// breaks the pricing law exactly as badly as underpricing does.

/** Providers we can recognise, so the page can say where the money goes. */
const PROVIDERS: { name: string; hosts: RegExp; note: string }[] = [
  { name: "Stripe", hosts: /(^|\.)(buy\.stripe\.com|checkout\.stripe\.com|pay\.stripe\.com)$/i, note: "Stripe Payment Link — settles to your Stripe account." },
  { name: "PayPal", hosts: /(^|\.)(paypal\.me|paypal\.com)$/i, note: "PayPal — settles to your PayPal balance." },
  { name: "SumUp", hosts: /(^|\.)(pay\.sumup\.com|sumup\.me)$/i, note: "SumUp — settles to your SumUp account." },
  { name: "Square", hosts: /(^|\.)(square\.link|squareup\.com|checkout\.square\.site)$/i, note: "Square — settles to your Square account." },
  { name: "Shopify", hosts: /(^|\.)(myshopify\.com|shop\.app)$/i, note: "Shopify — settles through your Shopify payouts." },
  { name: "Gumroad", hosts: /(^|\.)gumroad\.com$/i, note: "Gumroad — settles to your Gumroad account." },
  { name: "Calendly", hosts: /(^|\.)calendly\.com$/i, note: "Calendly — a booking, with any deposit settling to the account you connected there." },
  { name: "Lemon Squeezy", hosts: /(^|\.)lemonsqueezy\.com$/i, note: "Lemon Squeezy — settles to your account there." },
];

export type CheckoutLinkCheck = {
  ok: boolean;
  url: string;
  provider: string;
  /** True when we recognise it as a payment/booking destination rather than any old page. */
  recognised: boolean;
  note: string;
  error?: string;
};

/**
 * Validate a payment link the customer pasted.
 *
 * Deliberately permissive about the PROVIDER and strict about the TRANSPORT.
 * We cannot know every payment processor a business might use, and refusing an
 * unrecognised one would block a legitimate seller for our own convenience. But
 * a checkout served over plain http exposes their buyer's card details, and
 * that is not a preference.
 */
export function checkCheckoutLink(raw: string): CheckoutLinkCheck {
  const input = (raw || "").trim();
  if (!input) return { ok: false, url: "", provider: "", recognised: false, note: "", error: "Paste the payment link you want the button to open." };

  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`); }
  catch { return { ok: false, url: input, provider: "", recognised: false, note: "", error: "That is not a valid web address." }; }

  if (u.protocol !== "https:") {
    return { ok: false, url: u.toString(), provider: "", recognised: false, note: "", error: "A payment link must be https. Over plain http your buyer's card details travel in the clear — this is not a preference we can let you set." };
  }

  const host = u.hostname.toLowerCase();
  const match = PROVIDERS.find((p) => p.hosts.test(host));

  return {
    ok: true,
    url: u.toString(),
    provider: match?.name || host,
    recognised: Boolean(match),
    note: match
      ? `${match.note} MarketWar never handles this payment — the button opens your link and your buyer pays you directly.`
      : `We do not recognise ${host} as a payment provider, so check it opens the right checkout before you publish. Either way the money goes to whoever owns that link, not to MarketWar.`,
  };
}

export type FunnelCheckout = {
  enabled: boolean;
  /** The customer's own payment URL. Empty = the button falls back to the lead form. */
  url: string;
  buttonLabel: string;
  /** Shown under the button so the buyer knows who they are paying. */
  provider: string;
  priceLabel: string;
};

export function emptyCheckout(): FunnelCheckout {
  return { enabled: false, url: "", buttonLabel: "Buy now", provider: "", priceLabel: "" };
}

/**
 * Build the checkout block for a published funnel page.
 *
 * Returns null when there is nothing safe to render, rather than a dead button.
 * A "Buy now" that goes nowhere costs a real sale and teaches the buyer the site
 * is broken.
 */
export function checkoutBlock(cfg: FunnelCheckout): { url: string; label: string; sub: string } | null {
  if (!cfg.enabled) return null;
  const check = checkCheckoutLink(cfg.url);
  if (!check.ok) return null;
  return {
    url: check.url,
    label: (cfg.buttonLabel || "Buy now").slice(0, 40),
    sub: [cfg.priceLabel, check.recognised ? `Secure checkout via ${check.provider}` : ""].filter(Boolean).join(" · "),
  };
}

/**
 * What a funnel costs the customer.
 *
 * Stated as a function so the page and the docs cannot drift from the billing
 * code, and so the answer to "does the checkout cost ACUs?" is written down
 * once, in the codebase, rather than in a support reply.
 */
export function funnelCostNote(acuPerPage: number): string {
  return [
    `Writing the page costs ${acuPerPage} ACUs from your plan's monthly allowance — the same allowance as everything else, with no separate funnel fee.`,
    "Publishing it, hosting it, the buy button and click tracking cost nothing: no ACUs, and no per-sale fee.",
    "Payments do not run through MarketWar at all, so there is nothing for us to take a cut of. Your buyer pays your payment link, and the money lands in your account.",
  ].join(" ");
}
