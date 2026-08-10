// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MARKETWAR OS — WHAT A CREATOR IS ALLOWED TO PROMOTE.
//
// The owner asked the right question: does a brand pick what gets promoted, or
// can everything be promoted as creators want? The answer is BOTH, chosen by
// the brand — and it is two gates, not one:
//
//   1. THE BRAND'S PERMISSION.  Three modes. `mission_only` (nothing is
//      self-serve; creators can only work the missions the brand publishes —
//      this is what the platform did before this module and stays the default,
//      so no existing brand is silently opted into owing commission).
//      `curated` (only the products the brand switches on). `open_catalogue`
//      (everything the brand lists is promotable by default; the brand excludes
//      individual items rather than admitting them one at a time).
//
//   2. THE MARGIN'S PERMISSION.  A brand can open its whole range and STILL not
//      make a product promotable, because `productEligible()` decides that from
//      the product's own economics. This is the part a brand cannot switch on.
//      A product whose contribution cannot fund 0.5% inside the GrowthGuard
//      allowance is shown INELIGIBLE with the arithmetic — never quietly
//      re-rated, because a headline rate that becomes something smaller on some
//      products is a rate nobody can trust.
//
// Both gates must open. "Everything is promotable" therefore means everything
// the brand allows AND the margin can pay for, which is the only version of
// that sentence that is true.
//
// ONE LINK SCHEME. A claimed product issues its tracked code through the
// existing programme + subscription machinery (creator-engine), not through a
// second attribution path of its own. The last time this codebase grew a second
// path for money it grew a weaker one; there is exactly one place a referral
// code is minted and one place /r/{CODE} resolves it.

import { createHash } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { economicsFor, capacityFromTransaction, type OfferEconomics, type Economics } from "@/backend/profit-guard-economics";
import { netEligibleValue, productEligible, type Eligibility } from "@/backend/share2earn";
import { createProgramme, subscribe, type Subscription } from "@/backend/creator-engine";
import { SHARE2EARN_RATE, ratePct } from "@/shared/creator-program";

// ---------------------------------------------------------------------------
// The three modes
// ---------------------------------------------------------------------------
export type PromotionMode = "mission_only" | "curated" | "open_catalogue";

export const PROMOTION_MODES: { mode: PromotionMode; label: string; what: string; suits: string }[] = [
  {
    mode: "mission_only",
    label: "Missions only",
    what: "Nothing is self-serve. Creators can only earn on the missions you publish, with the budget you funded and the brief you wrote.",
    suits: "Launches, regulated products, and anything where the wording matters more than the volume. It is the default because it is the mode that can never surprise you.",
  },
  {
    mode: "curated",
    label: "Curated catalogue",
    what: "You list products and switch on the ones creators may promote. A creator browses what is switched on and claims a tracked link for it, without asking you first.",
    suits: "Most brands. You keep the choice of what gets pushed; you stop approving every creator individually.",
  },
  {
    mode: "open_catalogue",
    label: "Open catalogue",
    what: "Everything you list is promotable by default and you exclude individual items. Creators pick whatever they actually like — which is the content that performs.",
    suits: "Wide ranges where you cannot predict what a creator will make work, and you would rather have the reach than the control.",
  },
];

export const modeSpec = (m: PromotionMode) => PROMOTION_MODES.find((x) => x.mode === m) || PROMOTION_MODES[0];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type PromotionPolicy = {
  brandId: string;
  mode: PromotionMode;
  /** The brand's own destination for anything without its own URL. */
  defaultDestinationUrl?: string;
  /** The margin the brand refuses to spend, as a share of price (ProfitGuard). */
  survivalFloorPct?: number;
  updatedAt: string;
};

export type PromotableProduct = {
  id: string;
  brandId: string;
  name: string;
  /** The brand's own product page — where the tracked link sends the visitor. */
  url: string;
  offer: OfferEconomics;
  /** Curated mode: the brand switched this one on. */
  promotable: boolean;
  /** Open mode: the brand switched this one OFF, and said why. */
  excludedReason?: string;
  createdAt: string;
};

/** Why a product is or is not claimable, with both gates answered separately. */
export type PromotionDecision = {
  productId: string;
  name: string;
  open: boolean;
  /** Gate 1 — the brand. */
  brandAllows: boolean;
  brandReason: string;
  /** Gate 2 — the margin. Computed, never configured. */
  eligibility: Eligibility;
  /** What a creator would earn on one sale at list price. */
  commissionPence: number;
  eligiblePence: number;
  reason: string;
};

const memProducts = new Map<string, PromotableProduct>();
const memPolicy = new Map<string, PromotionPolicy>();
const useDb = () => Boolean(adminConfigured && adminDb);
const hid = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);

/**
 * Product ids hash the brand in.
 *
 * The same defect once shipped in the money ledger: a document keyed by a bare
 * id lets one tenant write over another's row. Two brands selling "Starter
 * Plan" must not share a document.
 */
export const productId = (brandId: string, name: string): string =>
  `pp_${hid(`${brandId}::${name.trim().toLowerCase()}`)}`;

// ---------------------------------------------------------------------------
// The two gates
// ---------------------------------------------------------------------------

/** Gate 1: has the brand allowed this product to be promoted at all? */
export function brandAllows(p: PromotableProduct, policy: PromotionPolicy): { ok: boolean; reason: string } {
  if (policy.mode === "mission_only") {
    return { ok: false, reason: "This brand promotes by mission only — there is nothing to claim here. Its missions carry the reward, the brief and the funded budget." };
  }
  if (p.excludedReason) {
    return { ok: false, reason: `The brand excluded this product: ${p.excludedReason}` };
  }
  if (policy.mode === "curated" && !p.promotable) {
    return { ok: false, reason: "The brand has not switched this product on for creators. In a curated catalogue only what is switched on can be claimed." };
  }
  return {
    ok: true,
    reason: policy.mode === "open_catalogue"
      ? "This brand's catalogue is open — anything it lists and has not excluded can be promoted."
      : "The brand switched this product on for creators.",
  };
}

/**
 * Gate 2: can the product's own economics fund the commission?
 *
 * This is the gate a brand cannot open by choosing a mode. It is the same
 * `productEligible` the sale path uses, given the product at list price, so the
 * answer a creator reads in the catalogue is the answer the sale will give.
 */
export function marginAllows(p: PromotableProduct, survivalFloorPct?: number): { eligibility: Eligibility; economics: Economics; eligiblePence: number } {
  const e = economicsFor(p.offer);
  const value = netEligibleValue({
    checkoutTotalPence: p.offer.pricePence,
    productPence: Math.max(0, p.offer.pricePence - (p.offer.taxPence || 0)),
    taxPence: p.offer.taxPence || 0,
  });
  const allowance = capacityFromTransaction(e, survivalFloorPct);
  const eligibility = productEligible({
    eligiblePence: value.eligiblePence,
    contributionPence: e.contributionPence,
    growthPoolPence: e.growthPoolPence,
    growthGuardAllowancePence: allowance.pence,
  });
  return { eligibility, economics: e, eligiblePence: value.eligiblePence };
}

/** Both gates, in the order a creator experiences them. */
export function promotionDecision(p: PromotableProduct, policy: PromotionPolicy): PromotionDecision {
  const gate1 = brandAllows(p, policy);
  const gate2 = marginAllows(p, policy.survivalFloorPct);
  const open = gate1.ok && gate2.eligibility.eligible;
  return {
    productId: p.id,
    name: p.name,
    open,
    brandAllows: gate1.ok,
    brandReason: gate1.reason,
    eligibility: gate2.eligibility,
    commissionPence: gate2.eligibility.eligible ? gate2.eligibility.commissionPence : 0,
    eligiblePence: gate2.eligiblePence,
    reason: !gate1.ok ? gate1.reason : gate2.eligibility.eligible
      ? `Claimable. ${gate2.eligibility.reason}`
      : `The brand allows it, but the product's economics do not. ${gate2.eligibility.reason}`,
  };
}

// ---------------------------------------------------------------------------
// The public view — what a creator may see
//
// A catalogue entry carries the brand's cost of goods, its fulfilment cost and
// the margin it protects. NONE of that may cross to a creator: it is the
// brand's commercial position, and publishing it would be a worse leak than
// anything this module is for. The public shape is built by CONSTRUCTION —
// listing the fields that go out — rather than by deleting the ones that must
// not, because a delete-list silently stops covering a field somebody adds
// later.
// ---------------------------------------------------------------------------
export type PublicProduct = {
  id: string;
  brandId: string;
  name: string;
  url: string;
  pricePence: number;
  commissionPence: number;
  ratePct: number;
  reason: string;
};

export function publicView(p: PromotableProduct, d: PromotionDecision): PublicProduct {
  return {
    id: p.id,
    brandId: p.brandId,
    name: p.name,
    url: p.url,
    pricePence: p.offer.pricePence,
    commissionPence: d.commissionPence,
    ratePct: Math.round(SHARE2EARN_RATE * 10000) / 100,
    reason: d.reason,
  };
}

// ---------------------------------------------------------------------------
// Claiming — a creator takes a tracked link for a product
// ---------------------------------------------------------------------------
export type ClaimResult =
  | { ok: true; subscription: Subscription; product: PublicProduct; note: string }
  | { ok: false; error: string; hint?: string };

/**
 * Issue this creator a tracked code for this product.
 *
 * The decision is recomputed here rather than trusted from the caller. A
 * browser that saw a product as claimable ten minutes ago must not be able to
 * mint a code for one the brand has since excluded — or, worse, one whose
 * margin never allowed it, because the code is the promise and the promise is
 * money.
 */
export async function claimProduct(input: {
  creatorId: string;
  product: PromotableProduct;
  policy: PromotionPolicy;
  brandName: string;
  nowISO: string;
}): Promise<ClaimResult> {
  if (!input.creatorId?.trim()) return { ok: false, error: "No creator on this request." };
  const decision = promotionDecision(input.product, input.policy);
  if (!decision.open) {
    return {
      ok: false,
      error: decision.reason,
      hint: decision.brandAllows
        ? "Nothing you can do about this one — it is the product's margin, not you. Everything marked claimable pays the full rate."
        : "Try the brand's missions instead, or another product in the catalogue.",
    };
  }

  const dest = (input.product.url || input.policy.defaultDestinationUrl || "").trim();
  if (!/^https?:\/\//i.test(dest)) {
    return { ok: false, error: "This product has no destination link yet, so a tracked code would lead nowhere.", hint: "The brand needs to add the product's own page URL." };
  }

  // One programme per promotable product, created on first claim and reused
  // afterwards (createProgramme derives its id from brand + name, so a second
  // claim lands on the same programme rather than forking attribution).
  const prog = await createProgramme({
    brandId: input.product.brandId,
    brandName: input.brandName || input.product.brandId,
    name: `SHARE2EARN · ${input.product.name}`,
    scope: "product",
    target: input.product.name,
    product: input.product.name,
    destinationUrl: dest,
    description: `Self-serve SHARE2EARN claim. ${ratePct(SHARE2EARN_RATE)} of the eligible net value of every verified sale this link produces.`,
    nowISO: input.nowISO,
  });

  const sub = await subscribe(input.creatorId, prog.id, input.nowISO);
  if (!sub.subscription) return { ok: false, error: sub.error || "Could not issue a tracked code." };

  return {
    ok: true,
    subscription: sub.subscription,
    product: publicView(input.product, decision),
    note: `Your link is live: /r/${sub.subscription.code}. It sends visitors to the brand's own product page with your code attached, and pays ${ratePct(SHARE2EARN_RATE)} of the eligible net value of every verified sale — £${(decision.commissionPence / 100).toFixed(2)} on one at list price. Nothing is paid on clicks alone.`,
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
export const DEFAULT_POLICY = (brandId: string, nowISO: string): PromotionPolicy => ({
  brandId,
  // The default is the mode that owes nobody anything. A brand opts INTO
  // self-serve promotion; it is never opted in by an upgrade it did not read.
  mode: "mission_only",
  updatedAt: nowISO,
});

export async function getPolicy(brandId: string, nowISO: string): Promise<PromotionPolicy> {
  if (useDb()) {
    const s = await adminDb!.collection("promotion_policies").doc(brandId).get();
    if (s.exists) return s.data() as PromotionPolicy;
  } else {
    const p = memPolicy.get(brandId);
    if (p) return p;
  }
  return DEFAULT_POLICY(brandId, nowISO);
}

export async function setPolicy(input: { brandId: string; mode: PromotionMode; defaultDestinationUrl?: string; survivalFloorPct?: number; nowISO: string }): Promise<PromotionPolicy> {
  const mode: PromotionMode = PROMOTION_MODES.some((m) => m.mode === input.mode) ? input.mode : "mission_only";
  const p: PromotionPolicy = { brandId: input.brandId, mode, updatedAt: input.nowISO };
  const dest = (input.defaultDestinationUrl || "").trim();
  if (/^https?:\/\//i.test(dest)) p.defaultDestinationUrl = dest;
  if (typeof input.survivalFloorPct === "number" && input.survivalFloorPct >= 0) p.survivalFloorPct = input.survivalFloorPct;
  if (useDb()) await adminDb!.collection("promotion_policies").doc(input.brandId).set(p, { merge: true });
  else memPolicy.set(input.brandId, p);
  return p;
}

export async function saveProduct(input: {
  brandId: string; name: string; url: string; offer: OfferEconomics;
  promotable?: boolean; excludedReason?: string; nowISO: string;
}): Promise<PromotableProduct> {
  const name = input.name.trim();
  const p: PromotableProduct = {
    id: productId(input.brandId, name),
    brandId: input.brandId,
    name,
    url: (input.url || "").trim(),
    offer: input.offer,
    promotable: input.promotable !== false,
    createdAt: input.nowISO,
  };
  const reason = (input.excludedReason || "").trim();
  if (reason) p.excludedReason = reason.slice(0, 240);
  if (useDb()) await adminDb!.collection("promotable_products").doc(p.id).set(p, { merge: true });
  else memProducts.set(p.id, p);
  return p;
}

export async function getProduct(id: string): Promise<PromotableProduct | null> {
  if (useDb()) {
    const s = await adminDb!.collection("promotable_products").doc(id).get();
    return s.exists ? (s.data() as PromotableProduct) : null;
  }
  return memProducts.get(id) ?? null;
}

export async function listProducts(brandId: string): Promise<PromotableProduct[]> {
  if (useDb()) {
    const q = await adminDb!.collection("promotable_products").where("brandId", "==", brandId).limit(500).get();
    return q.docs.map((d) => d.data() as PromotableProduct);
  }
  return [...memProducts.values()].filter((p) => p.brandId === brandId);
}

/** The BRAND's view: every product, both gates, including the ones that fail. */
export async function catalogue(brandId: string, nowISO: string): Promise<{ policy: PromotionPolicy; products: { product: PromotableProduct; decision: PromotionDecision }[]; summary: string }> {
  const policy = await getPolicy(brandId, nowISO);
  const products = (await listProducts(brandId)).map((product) => ({ product, decision: promotionDecision(product, policy) }));
  const open = products.filter((p) => p.decision.open).length;
  const blockedByMargin = products.filter((p) => p.decision.brandAllows && !p.decision.eligibility.eligible).length;
  return {
    policy,
    products,
    summary: products.length === 0
      ? "No products listed yet. A creator cannot claim what is not described."
      : `${open} of ${products.length} claimable${blockedByMargin > 0 ? `, ${blockedByMargin} blocked by their own margin rather than by you` : ""}. Mode: ${modeSpec(policy.mode).label}.`,
  };
}

/** The CREATOR's view: only what is claimable, and without the brand's costs. */
export async function openCatalogue(brandId: string, nowISO: string): Promise<PublicProduct[]> {
  const { policy, products } = await catalogue(brandId, nowISO);
  void policy;
  return products.filter((p) => p.decision.open).map((p) => publicView(p.product, p.decision));
}

/**
 * DISCOVERY — what is claimable anywhere right now.
 *
 * A creator who has just joined has no brand in mind, and a catalogue nobody
 * can find is a catalogue nobody claims from. This is the cross-brand view: the
 * brands that opened a catalogue, and only the products that pass both gates,
 * in the public shape. Brands in `mission_only` never appear here at all —
 * their missions are the way in, by their own choice.
 */
export async function discoverable(limit = 60): Promise<{ brandId: string; mode: PromotionMode; products: PublicProduct[] }[]> {
  let policies: PromotionPolicy[];
  if (useDb()) {
    const q = await adminDb!.collection("promotion_policies").where("mode", "!=", "mission_only").limit(limit).get();
    policies = q.docs.map((d) => d.data() as PromotionPolicy);
  } else {
    policies = [...memPolicy.values()].filter((p) => p.mode !== "mission_only").slice(0, limit);
  }
  const out: { brandId: string; mode: PromotionMode; products: PublicProduct[] }[] = [];
  for (const policy of policies) {
    const products = (await listProducts(policy.brandId))
      .map((product) => ({ product, decision: promotionDecision(product, policy) }))
      .filter((p) => p.decision.open)
      .map((p) => publicView(p.product, p.decision));
    if (products.length) out.push({ brandId: policy.brandId, mode: policy.mode, products });
  }
  return out;
}

export function __resetPromotable(): void { memProducts.clear(); memPolicy.clear(); }

export const PROMOTION_DOCTRINE = [
  "A brand chooses one of three modes: missions only, a curated catalogue, or an open catalogue. The default is missions only, because no brand should start owing commission on a product it has not looked at.",
  "Whatever the mode, the product's own economics decide whether it can carry a commission. A brand can open its entire range and still find a product marked ineligible — that is the margin refusing, not the platform.",
  "An ineligible product is refused, never re-rated. 0.5% means 0.5% on everything marked eligible; a rate that silently shrinks on thin-margin items is a rate nobody can quote.",
  "A claim mints a tracked code through the same programme machinery as every other referral. There is one attribution path, because the second one is always the weaker one.",
  "A creator never sees the brand's cost of goods, fulfilment cost or protected margin. They see the price, their commission and whether they can claim it.",
];
