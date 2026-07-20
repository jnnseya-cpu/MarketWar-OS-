// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar OS — Subscription, ACU & Commercial Profitability engine.
//
// Separates PLATFORM ACCESS (predictable subscription) from AI CONSUMPTION
// (metered ACUs). Implements the owner commercial model verbatim:
//   • £1 = 100 ACUs.
//   • Pricing rule: Customer ACU Charge = Provider Cost × 4  →  Required ACUs =
//     Provider Cost × 4 × 100. This is a 300% MARKUP = 75% GROSS MARGIN.
//     (Owner correction 2026-07-20: "400% margin" is impossible — margin ≤ 100%;
//     the target is 100%–400% markup, min 300% markup / 75% gross margin.)
//   • Every plan auto-allocates 20% of the price paid as ACUs.
//   • Annual = 30% subscription discount; annual ACUs released monthly.
//
// Pure + deterministic so it runs in demo mode and unit-checks. All computed
// plan figures are verified against the owner's published table.

const round2 = (n: number) => Math.round(n * 100) / 100;

export const ACU_PER_GBP = 100;                 // £1 = 100 ACUs
export const ACU_ALLOCATION_RATE = 0.20;        // 20% of price paid → ACUs
export const ANNUAL_DISCOUNT = 0.30;            // 30% off for annual billing
export const STANDARD_MARKUP = 4;               // 4× provider cost (300% markup)
export const MARKUP_FLOOR = 2;                  // 2× hard floor (100% markup / 50% margin)
export const PROVIDER_COST_CEIL_PER_GBP = 0.25; // ≤ £0.25 provider cost per £1 of ACU value

// ---------------------------------------------------------------------------
// Markup ↔ margin (the owner terminology correction).
// ---------------------------------------------------------------------------
export function markupToMargin(markupX: number) {
  return {
    markupMultiplier: markupX,                                  // e.g. 4
    markupPct: round2((markupX - 1) * 100),                     // 4× → 300% markup
    grossMarginPct: markupX > 0 ? round2((markupX - 1) / markupX * 100) : 0, // 4× → 75% gross margin
  };
}

// Pricing formula: Required ACUs = Provider Cost × markup × 100 (never below floor).
export function requiredAcus(providerCostGbp: number, markupX = STANDARD_MARKUP) {
  const markup = Math.max(MARKUP_FLOOR, markupX);
  const customerChargeGbp = round2(Math.max(0, providerCostGbp) * markup);
  return {
    providerCostGbp: round2(Math.max(0, providerCostGbp)), // internal only
    markup,
    customerChargeGbp,
    requiredAcus: Math.ceil(customerChargeGbp * ACU_PER_GBP),
    ...markupToMargin(markup),
  };
}

// ---------------------------------------------------------------------------
// The plan table (owner-published; monthly ACUs = price × 20% × 100).
// ---------------------------------------------------------------------------
export type Plan = {
  id: string; name: string; monthlyGbp: number; brands: number | "custom"; users: number | "custom";
  workspaces: number | "custom"; socialAccounts: number | "custom"; campaigns: number | "custom" | "unlimited";
  storageGb: number; custom?: boolean;
};

// Only the price + structural caps are stored; every ACU/annual/top-up figure is
// COMPUTED from the rules below so the table can never drift from the formula.
export const PLANS: Plan[] = [
  { id: "free", name: "Free", monthlyGbp: 0, brands: 1, users: 1, workspaces: 1, socialAccounts: 1, campaigns: 1, storageGb: 0.5 },
  { id: "starter", name: "Starter", monthlyGbp: 19, brands: 1, users: 2, workspaces: 2, socialAccounts: 3, campaigns: 5, storageGb: 5 },
  { id: "growth", name: "Growth", monthlyGbp: 49, brands: 3, users: 5, workspaces: 5, socialAccounts: 10, campaigns: 20, storageGb: 25 },
  { id: "scale", name: "Scale", monthlyGbp: 149, brands: 10, users: 15, workspaces: 15, socialAccounts: 30, campaigns: 100, storageGb: 100 },
  { id: "business", name: "Business", monthlyGbp: 399, brands: 30, users: 40, workspaces: 50, socialAccounts: 100, campaigns: 500, storageGb: 500 },
  { id: "enterprise", name: "Enterprise", monthlyGbp: 999, brands: 100, users: 100, workspaces: 200, socialAccounts: 300, campaigns: "unlimited", storageGb: 2048 },
  { id: "corporate", name: "Corporate", monthlyGbp: 2499, brands: 300, users: 300, workspaces: 750, socialAccounts: 1000, campaigns: "unlimited", storageGb: 10240 },
  { id: "global", name: "Global", monthlyGbp: 7499, brands: "custom", users: "custom", workspaces: "custom", socialAccounts: "custom", campaigns: "unlimited", storageGb: 20480, custom: true },
];

export type PlanEconomics = {
  id: string; name: string; monthlyGbp: number;
  annualGbp: number;              // 30% off ×12
  annualSavingGbp: number;
  monthlyAcus: number;            // price × 20% × 100
  annualAcus: number;             // annual price × 20% × 100
  annualMonthlyReleaseAcus: number; // annual ACUs / 12
  defaultTopUpGbp: number;        // 20% of monthly price
  defaultTopUpAcus: number;
  brands: number | "custom"; users: number | "custom"; storageGb: number; custom?: boolean;
};

export function planEconomics(plan: Plan): PlanEconomics {
  // Free plan: 100 ACUs once per 12-month eligibility (not monthly).
  if (plan.id === "free") {
    return {
      id: plan.id, name: plan.name, monthlyGbp: 0, annualGbp: 0, annualSavingGbp: 0,
      monthlyAcus: 0, annualAcus: 100, annualMonthlyReleaseAcus: 0, defaultTopUpGbp: 0, defaultTopUpAcus: 0,
      brands: plan.brands, users: plan.users, storageGb: plan.storageGb,
    };
  }
  const annualGbp = round2(plan.monthlyGbp * 12 * (1 - ANNUAL_DISCOUNT));
  const monthlyAcus = Math.round(plan.monthlyGbp * ACU_ALLOCATION_RATE * ACU_PER_GBP);
  const annualAcus = Math.round(annualGbp * ACU_ALLOCATION_RATE * ACU_PER_GBP);
  const defaultTopUpGbp = round2(plan.monthlyGbp * ACU_ALLOCATION_RATE);
  return {
    id: plan.id, name: plan.name, monthlyGbp: plan.monthlyGbp,
    annualGbp, annualSavingGbp: round2(plan.monthlyGbp * 12 - annualGbp),
    monthlyAcus, annualAcus, annualMonthlyReleaseAcus: Math.round(annualAcus / 12),
    defaultTopUpGbp, defaultTopUpAcus: Math.round(defaultTopUpGbp * ACU_PER_GBP),
    brands: plan.brands, users: plan.users, storageGb: plan.storageGb, custom: plan.custom,
  };
}

export function allPlanEconomics(): PlanEconomics[] {
  return PLANS.map(planEconomics);
}

// ---------------------------------------------------------------------------
// ACU top-ups — default (20% of monthly price) + flexible tiers. No discount:
// the 4× provider-cost recovery must stay protected.
// ---------------------------------------------------------------------------
export const FLEXIBLE_TOPUPS_GBP = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
export function topUps() {
  return FLEXIBLE_TOPUPS_GBP.map((gbp) => ({ gbp, acus: gbp * ACU_PER_GBP }));
}

// ---------------------------------------------------------------------------
// ACU expiry & rollover rules.
// ---------------------------------------------------------------------------
export const EXPIRY_RULES = {
  free: { rolloverDays: 0, note: "Free ACUs expire after 30 days; no rollover, non-transferable." },
  monthly_subscription: { rolloverDays: 90, maxBalanceMonths: 3, note: "Roll over up to 90 days; max balance 3 months of included ACUs; oldest consumed first." },
  annual_subscription: { rolloverDays: 90, note: "Released monthly; each monthly allocation rolls over up to 90 days; unused expire at contract end." },
  topup: { validDays: 365, note: "Top-up ACUs valid 12 months; consumed after promo but before expiry; transferable between workspaces in the same org." },
} as const;

// Consumption order: promotional/free → oldest subscription → top-up (spec §9).
export const CONSUMPTION_ORDER = ["promotional", "subscription_oldest_first", "topup"] as const;

// ---------------------------------------------------------------------------
// Add-ons (prevent forced upgrades for one small need).
// ---------------------------------------------------------------------------
export const ADDONS = {
  brandPerMonthGbp: { starter: 10, growth: 15, scale: 20, business: 25 },
  userPerMonthGbp: { starter: 5, growth: 8, scale: 12, business: 15 },
  socialPerMonthGbp: { starter: 2, growth: 2, scale: 1.5, business: 1 },
  storageGbp: { "100gb": 10, "500gb": 35, "1tb": 60, "5tb": 250 },
  whiteLabelGbp: { scale: 99, business: 149, enterprise: 0 },
  apiPackageGbp: { growth: 49, scale: 99, business: 0 },
} as const;

// ---------------------------------------------------------------------------
// Margin governance — bands on the AI GROSS MARGIN (not markup).
// ---------------------------------------------------------------------------
export type MarginBand = "green" | "amber" | "red" | "blocked";
export function marginBand(grossMarginPct: number, minPct = 50): { band: MarginBand; note: string } {
  if (grossMarginPct < minPct) return { band: "blocked", note: `Gross margin ${grossMarginPct}% below configured minimum ${minPct}% — action blocked.` };
  if (grossMarginPct < 65) return { band: "red", note: `Gross margin ${grossMarginPct}% is red (<65%) — arbitrate to a cheaper provider.` };
  if (grossMarginPct < 75) return { band: "amber", note: `Gross margin ${grossMarginPct}% is amber (65–74.99%).` };
  return { band: "green", note: `Gross margin ${grossMarginPct}% is green (≥75%).` };
}

// ProfitGuard: Net AI Contribution = ACU Revenue − Provider − Processing − Payment.
export function netContribution(input: { acuRevenueGbp: number; providerCostGbp: number; processingCostGbp?: number; paymentCostGbp?: number }) {
  const rev = Math.max(0, input.acuRevenueGbp);
  const cost = Math.max(0, input.providerCostGbp) + Math.max(0, input.processingCostGbp ?? 0) + Math.max(0, input.paymentCostGbp ?? 0);
  const net = round2(rev - cost);
  const grossMarginPct = rev > 0 ? round2(net / rev * 100) : 0;
  return { netContributionGbp: net, grossMarginPct, ...marginBand(grossMarginPct) };
}

// ---------------------------------------------------------------------------
// Org hierarchy + wallet models.
// ---------------------------------------------------------------------------
export const ORG_HIERARCHY = ["Organisation", "Business Unit", "Brand", "Workspace", "Campaign", "Asset"] as const;
export const WALLET_MODELS = [
  { id: "shared", label: "Shared Wallet", bestFor: ["startups", "SMEs", "small agencies"] },
  { id: "allocated", label: "Allocated Wallets", bestFor: ["agencies", "multi-brand", "enterprises"] },
  { id: "controlled", label: "Controlled Wallets", bestFor: ["large enterprises", "governments", "franchises", "global orgs"] },
] as const;

// ---------------------------------------------------------------------------
// Enterprise commercial fees (§19) — large customers don't get implementation
// for free. Complexity is paid for separately from subscription + ACUs.
// ---------------------------------------------------------------------------
export const ENTERPRISE_FEES = {
  onboarding: { enterprise: "from £2,500", corporate: "from £10,000", global: "£25,000–£250,000+" },
  customIntegrationGbpFrom: 1500, // per integration
  dataMigration: "quoted by volume + complexity",
  training: { remoteTeam: "from £750", department: "from £2,500", enterpriseProgramme: "custom", onSite: "expenses + professional fees" },
  premiumSupport: { enhancedPctOfAcv: 10, critical247PctOfAcv: "15–20", embeddedSpecialist: "separately contracted" },
} as const;

// Commercial protection (§20) — every subscription must include these.
export const COMMERCIAL_PROTECTION = [
  "Automatic renewal", "Payment-method validation", "Failed-payment retries", "Grace period",
  "Service restriction after non-payment", "ACU hard stop", "Spend limits", "Fraud monitoring",
  "Account-sharing controls", "Fair-use policy", "Storage limits", "Export limits",
  "Provider-cost adjustment clause", "Currency adjustment clause", "Tax treatment", "Refund policy", "Data-retention policy",
] as const;

// Provider-cost adjustment clause (§20): the customer's PURCHASED ACU quantity
// never changes, but future actions may require different ACU amounts as provider
// costs move — which is exactly how the 4× recovery is preserved.
export const PROVIDER_COST_ADJUSTMENT_CLAUSE =
  "MarketWar may adjust ACU consumption RATES when external provider costs change. Your purchased ACU quantity is unchanged; future actions may require different ACU amounts based on current provider costs — preserving the 4× provider-cost recovery.";

// Discounts (§18) never apply to these — the 4× recovery must stay protected.
export const DISCOUNT_EXCLUSIONS = [
  "ACU top-ups", "Provider pass-through fees", "Implementation", "Custom development",
  "Premium data", "Dedicated infrastructure", "Creator payments", "Advertising spend", "Third-party licences",
] as const;

// Customer-facing pricing message (§21).
export const PRICING_MESSAGE = {
  headline: "One Marketing OS. Every Brand. Every Campaign. One Predictable Bill.",
  supporting:
    "Stop paying separately for disconnected content, video, social, campaign, analytics and AI tools. MarketWar gives your organisation one account to manage all brands, users, channels and campaigns. Every paid plan includes platform access and an automatic AI credit allowance — add ACUs when you need more AI power, without changing your subscription.",
  promises: [
    "Start free", "Upgrade as you grow", "Manage several brands under one account", "Pay only for the AI you use",
    "Keep complete control of budgets", "See where every ACU is spent", "Connect marketing activity to revenue", "Save 30% with annual billing",
  ],
} as const;

// ---------------------------------------------------------------------------
// Upgrade triggers — recommend an upgrade at structural limits.
// ---------------------------------------------------------------------------
export type Usage = {
  planId: string; topUpSpendGbp?: number; monthsToppingUp?: number;
  usersUsed?: number; brandsUsed?: number; socialUsed?: number; storagePct?: number; campaignsUsed?: number;
};

export function upgradeRecommendation(usage: Usage): { shouldUpgrade: boolean; signals: string[]; currentPlan: string; proposedPlan: string | null; note: string } {
  const idx = PLANS.findIndex((p) => p.id === usage.planId);
  const plan = PLANS[idx] ?? PLANS[1];
  const eco = planEconomics(plan);
  const signals: string[] = [];
  if (usage.topUpSpendGbp != null && plan.monthlyGbp > 0 && usage.topUpSpendGbp > plan.monthlyGbp * 0.5 && (usage.monthsToppingUp ?? 0) >= 3)
    signals.push("Top-ups exceeded 50% of subscription for 3 months — a higher plan's included ACUs are cheaper.");
  if (usage.usersUsed != null && typeof plan.users === "number" && usage.usersUsed >= plan.users) signals.push("User-seat limit reached.");
  if (usage.brandsUsed != null && typeof plan.brands === "number" && usage.brandsUsed >= plan.brands) signals.push("Brand limit reached.");
  if (usage.socialUsed != null && typeof plan.socialAccounts === "number" && usage.socialUsed >= plan.socialAccounts) signals.push("Social-connection limit reached.");
  if (usage.storagePct != null && usage.storagePct >= 80) signals.push("Storage above 80%.");
  if (usage.campaignsUsed != null && typeof plan.campaigns === "number" && usage.campaignsUsed >= plan.campaigns) signals.push("Campaign limit reached.");
  const proposed = signals.length && idx >= 0 && idx < PLANS.length - 1 ? PLANS[idx + 1] : null;
  return {
    shouldUpgrade: signals.length > 0,
    signals,
    currentPlan: plan.name,
    proposedPlan: proposed ? proposed.name : null,
    note: signals.length
      ? `${signals.length} upgrade signal(s). Included ACUs on ${proposed?.name ?? "the next tier"} beat repeated top-ups; add-ons remain available to avoid a full upgrade for one small need. Current monthly ${eco.monthlyGbp ? `£${eco.monthlyGbp}` : "£0"}.`
      : "Within plan limits — no upgrade needed.",
  };
}

// ---------------------------------------------------------------------------
// Deterministic demo.
// ---------------------------------------------------------------------------
export function demoSubscription() {
  return {
    plans: allPlanEconomics(),
    pricingExamples: [0.1, 0.75, 3].map((c) => requiredAcus(c)),
    markupCorrection: markupToMargin(STANDARD_MARKUP), // 4× → 300% markup / 75% margin
    topUps: topUps(),
    walletModels: WALLET_MODELS,
    upgradeExample: upgradeRecommendation({ planId: "growth", topUpSpendGbp: 30, monthsToppingUp: 3, usersUsed: 5 }),
    marginExample: netContribution({ acuRevenueGbp: 4, providerCostGbp: 1, processingCostGbp: 0.1, paymentCostGbp: 0.1 }),
    enterpriseFees: ENTERPRISE_FEES,
    commercialProtection: COMMERCIAL_PROTECTION,
    providerCostAdjustmentClause: PROVIDER_COST_ADJUSTMENT_CLAUSE,
    discountExclusions: DISCOUNT_EXCLUSIONS,
    pricingMessage: PRICING_MESSAGE,
  };
}
