if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// ProfitGuard AI (VideoDominance Gap 11) — pre-scale safety + profitability gate.
// Before a high-performing clip is allowed to scale spend/reach, ProfitGuard runs
// nine hard checks. A viral clip must NOT scale a low-margin or out-of-stock
// product — any failed check BLOCKS scaling. House doctrine: honesty (all figures
// are ESTIMATES from supplied data; nothing fabricated), profit floor (margin must
// clear threshold), and consent (never scale on unverified inputs). Outputs are
// deterministic and demo-safe (no Date.now / new Date / Math.random).

const seed = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

export const CHECKS = [
  "in_stock",
  "offer_valid",
  "price_correct",
  "margin_meets_threshold",
  "delivery_capacity",
  "landing_page_works",
  "checkout_works",
  "cac_viable",
  "ai_cost_controlled",
] as const;

export type ProfitGuardCheck = (typeof CHECKS)[number];

export interface PreScaleInput {
  productInStock?: boolean;
  offerValid?: boolean;
  priceCorrect?: boolean;
  marginPct?: number;
  marginThresholdPct?: number;
  deliveryCapacity?: boolean;
  landingPageOk?: boolean;
  checkoutOk?: boolean;
  cacGbp?: number;
  targetCacGbp?: number;
  aiCostControlled?: boolean;
}

export interface CheckResult {
  check: ProfitGuardCheck;
  pass: boolean;
  detail: string;
}

export type ProfitGuardVerdict = "scale" | "hold";

export interface PreScaleResult {
  checks: CheckResult[];
  cleared: boolean;
  blockers: string[];
  verdict: ProfitGuardVerdict;
  note: string;
}

export interface ProfitGuardDemo {
  doctrine: string;
  checks: readonly ProfitGuardCheck[];
  blocked: PreScaleResult;
  cleared: PreScaleResult;
}

const DEFAULT_MARGIN_THRESHOLD_PCT = 20;

export function preScaleCheck(input: PreScaleInput): PreScaleResult {
  const marginThresholdPct =
    typeof input.marginThresholdPct === "number" ? input.marginThresholdPct : DEFAULT_MARGIN_THRESHOLD_PCT;

  const checks: CheckResult[] = [];

  // in_stock
  const inStock = input.productInStock === true;
  checks.push({
    check: "in_stock",
    pass: inStock,
    detail: inStock
      ? "ESTIMATE: product reported in stock."
      : "Product not confirmed in stock — scaling would drive spend to unfulfillable demand.",
  });

  // offer_valid
  const offerValid = input.offerValid === true;
  checks.push({
    check: "offer_valid",
    pass: offerValid,
    detail: offerValid
      ? "ESTIMATE: offer reported valid and live."
      : "Offer not confirmed valid — expired or misconfigured offers must not scale.",
  });

  // price_correct
  const priceCorrect = input.priceCorrect === true;
  checks.push({
    check: "price_correct",
    pass: priceCorrect,
    detail: priceCorrect
      ? "ESTIMATE: displayed price reported correct."
      : "Price not confirmed correct — pricing errors compound at scale.",
  });

  // margin_meets_threshold
  const marginPct = typeof input.marginPct === "number" ? input.marginPct : undefined;
  const marginPass = marginPct !== undefined && marginPct >= marginThresholdPct;
  checks.push({
    check: "margin_meets_threshold",
    pass: marginPass,
    detail:
      marginPct === undefined
        ? `Margin not supplied — cannot confirm it clears the ${marginThresholdPct}% profit floor.`
        : marginPass
          ? `ESTIMATE: margin ${marginPct}% clears the ${marginThresholdPct}% threshold.`
          : `Margin ${marginPct}% is below the ${marginThresholdPct}% profit floor — scaling would burn cash.`,
  });

  // delivery_capacity
  const deliveryCapacity = input.deliveryCapacity === true;
  checks.push({
    check: "delivery_capacity",
    pass: deliveryCapacity,
    detail: deliveryCapacity
      ? "ESTIMATE: delivery/fulfilment capacity confirmed."
      : "Delivery capacity not confirmed — scaling risks fulfilment failure and refunds.",
  });

  // landing_page_works
  const landingPageOk = input.landingPageOk === true;
  checks.push({
    check: "landing_page_works",
    pass: landingPageOk,
    detail: landingPageOk
      ? "ESTIMATE: landing page reported working."
      : "Landing page not confirmed working — a broken page wastes every scaled click.",
  });

  // checkout_works
  const checkoutOk = input.checkoutOk === true;
  checks.push({
    check: "checkout_works",
    pass: checkoutOk,
    detail: checkoutOk
      ? "ESTIMATE: checkout reported working."
      : "Checkout not confirmed working — a broken checkout converts scaled traffic to zero.",
  });

  // cac_viable
  const cacGbp = typeof input.cacGbp === "number" ? input.cacGbp : undefined;
  const targetCacGbp = typeof input.targetCacGbp === "number" ? input.targetCacGbp : undefined;
  const cacPass = cacGbp !== undefined && targetCacGbp !== undefined && cacGbp <= targetCacGbp;
  checks.push({
    check: "cac_viable",
    pass: cacPass,
    detail:
      cacGbp === undefined || targetCacGbp === undefined
        ? "CAC and target CAC not both supplied — cannot confirm acquisition cost is viable."
        : cacPass
          ? `ESTIMATE: CAC GBP ${cacGbp} is within target GBP ${targetCacGbp}.`
          : `CAC GBP ${cacGbp} exceeds target GBP ${targetCacGbp} — scaling would acquire customers at a loss.`,
  });

  // ai_cost_controlled
  const aiCostControlled = input.aiCostControlled === true;
  checks.push({
    check: "ai_cost_controlled",
    pass: aiCostControlled,
    detail: aiCostControlled
      ? "ESTIMATE: AI generation cost reported within controlled budget."
      : "AI cost not confirmed controlled — uncapped AI spend erodes margin at scale.",
  });

  const cleared = checks.every((c) => c.pass);
  const blockers = checks.filter((c) => !c.pass).map((c) => `${c.check}: ${c.detail}`);
  const verdict: ProfitGuardVerdict = cleared ? "scale" : "hold";

  const note = cleared
    ? `ESTIMATE: all ${checks.length} pre-scale checks passed (ref ${seed(CHECKS.join(","))}). Cleared to scale. Re-verify inputs before each spend increase.`
    : `ESTIMATE: ${blockers.length} of ${checks.length} pre-scale check(s) failed — scaling is HELD. A high-performing clip must not scale a low-margin or out-of-stock product.`;

  return { checks, cleared, blockers, verdict, note };
}

export function demoProfitGuard(): ProfitGuardDemo {
  // Blocked example: high-performing clip but product is out of stock and margin
  // is below the profit floor — ProfitGuard HOLDS scaling.
  const blocked = preScaleCheck({
    productInStock: false,
    offerValid: true,
    priceCorrect: true,
    marginPct: 11,
    marginThresholdPct: 20,
    deliveryCapacity: true,
    landingPageOk: true,
    checkoutOk: true,
    cacGbp: 34,
    targetCacGbp: 25,
    aiCostControlled: false,
  });

  // Cleared example: all nine safety + profitability checks pass.
  const cleared = preScaleCheck({
    productInStock: true,
    offerValid: true,
    priceCorrect: true,
    marginPct: 42,
    marginThresholdPct: 20,
    deliveryCapacity: true,
    landingPageOk: true,
    checkoutOk: true,
    cacGbp: 18,
    targetCacGbp: 25,
    aiCostControlled: true,
  });

  return {
    doctrine:
      "ProfitGuard AI is the pre-scale gate: before a winning clip scales spend or reach, all nine safety + profitability checks must pass. A high-performing clip must NOT scale a low-margin or out-of-stock product. All figures are ESTIMATES derived from supplied data — nothing is fabricated.",
    checks: CHECKS,
    blocked,
    cleared,
  };
}
