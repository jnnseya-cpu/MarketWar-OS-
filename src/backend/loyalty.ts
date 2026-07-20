// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Loyalty & Referral Network Engine (Referral Engine + Brevo loyalty).
//
// Turns customers into a growth loop: tiered loyalty points, human-readable
// referral codes, viral-coefficient (k-factor) projections, and mobile-wallet
// pass descriptors. Deterministic so it runs with zero config in demo mode;
// live Brevo loyalty + referral tracking plug in at go-live.
//
// Doctrine: honesty — every projected cycle, k-factor and growth number is an
// ESTIMATE, never a guarantee, and no metric is fabricated. Referral invites
// require recipient consent and honour a hard cap of MAX 5 touches per 7 days.

const seed = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
};
const round2 = (n: number): number => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------
export type TierName = "bronze" | "silver" | "gold" | "platinum";

export type Tier = {
  tier: TierName;
  threshold: number; // points required to reach this tier
  perks: string[];
};

export const TIERS: Tier[] = [
  {
    tier: "bronze",
    threshold: 0,
    perks: ["Welcome reward", "Birthday points bonus", "Members-only offers"],
  },
  {
    tier: "silver",
    threshold: 500,
    perks: ["1.25x points on every purchase", "Early access to new drops", "Free delivery over £20"],
  },
  {
    tier: "gold",
    threshold: 2000,
    perks: ["1.5x points on every purchase", "Priority support", "Quarterly gift", "Exclusive events"],
  },
  {
    tier: "platinum",
    threshold: 5000,
    perks: ["2x points on every purchase", "Dedicated concierge", "Free delivery always", "VIP experiences"],
  },
];

export type TierResult = {
  tier: TierName;
  nextTier: TierName | null;
  pointsToNext: number; // 0 when already at the top tier
  perks: string[];
};

export function tierFor(points: number): TierResult {
  const pts = Number.isFinite(points) ? Math.max(0, Math.floor(points)) : 0;
  // Highest tier whose threshold is satisfied.
  let currentIndex = 0;
  for (let i = 0; i < TIERS.length; i++) {
    if (pts >= TIERS[i].threshold) currentIndex = i;
  }
  const current = TIERS[currentIndex];
  const next = currentIndex < TIERS.length - 1 ? TIERS[currentIndex + 1] : null;
  return {
    tier: current.tier,
    nextTier: next ? next.tier : null,
    pointsToNext: next ? Math.max(0, next.threshold - pts) : 0,
    perks: current.perks,
  };
}

// ---------------------------------------------------------------------------
// Earning points
// ---------------------------------------------------------------------------
export type EarnAction =
  | "purchase"
  | "review"
  | "referral_signup"
  | "referral_purchase"
  | "birthday";

// Deterministic points table. `purchase` is per whole £ spent.
const EARN_TABLE: Record<EarnAction, number> = {
  purchase: 10, // points per £1
  review: 50,
  referral_signup: 100,
  referral_purchase: 250,
  birthday: 200,
};

export type EarnResult = {
  action: EarnAction;
  amountGbp: number | null;
  points: number;
  basis: string;
  note: string;
};

export function earnPoints(action: string, amountGbp?: number): EarnResult {
  const known = (Object.keys(EARN_TABLE) as EarnAction[]).find((a) => a === action);
  if (!known) {
    return {
      action: "purchase",
      amountGbp: null,
      points: 0,
      basis: "unknown-action",
      note: `Unknown action "${action}" — no points awarded (ESTIMATE table covers: ${Object.keys(EARN_TABLE).join(", ")}).`,
    };
  }
  if (known === "purchase") {
    const amt = Number.isFinite(amountGbp) && (amountGbp as number) > 0 ? Math.floor(amountGbp as number) : 0;
    return {
      action: "purchase",
      amountGbp: amt,
      points: amt * EARN_TABLE.purchase,
      basis: `${EARN_TABLE.purchase} points per £1`,
      note: "Points are awarded on completed, paid purchases only.",
    };
  }
  return {
    action: known,
    amountGbp: null,
    points: EARN_TABLE[known],
    basis: "flat award",
    note: known.startsWith("referral")
      ? "Referral rewards require recipient consent; invites capped at max 5 touches per 7 days."
      : "Flat loyalty award.",
  };
}

// ---------------------------------------------------------------------------
// Referral codes
// ---------------------------------------------------------------------------
// Human-readable, stable code seeded from the customer id (no ambiguous chars).
const CODE_ALPHABET = "ACDEFGHJKLMNPQRSTUVWXYZ23456789";

export type ReferralResult = {
  customerId: string;
  code: string;
  shareUrl: string;
  consentRequired: boolean;
  maxTouchesPer7Days: number;
  note: string;
};

export function referralCode(customerId: string): string {
  const id = customerId || "guest";
  const h = seed(id);
  let n = h;
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[n % CODE_ALPHABET.length];
    n = Math.floor(n / CODE_ALPHABET.length) + seed(id + i);
  }
  return `MW-${out}`;
}

export function referralInvite(customerId: string): ReferralResult {
  const code = referralCode(customerId);
  return {
    customerId: customerId || "guest",
    code,
    shareUrl: `https://marketwar.os/join?ref=${code}`,
    consentRequired: true,
    maxTouchesPer7Days: 5,
    note: "Only invite recipients who have consented to be contacted. Hard cap: max 5 touches per 7 days per recipient.",
  };
}

// ---------------------------------------------------------------------------
// K-factor (viral coefficient) — all outputs are ESTIMATES
// ---------------------------------------------------------------------------
export type ProjectedCycle = { cycle: number; newCustomers: number };

export type KFactorResult = {
  invitesSent: number;
  inviteAcceptRate: number;
  purchaseRate: number;
  kFactor: number;
  projectedCycles: ProjectedCycle[];
  verdict: "viral" | "sub-viral";
  note: string;
};

export function kFactor(invitesSent: number, inviteAcceptRate: number, purchaseRate: number): KFactorResult {
  const invites = Number.isFinite(invitesSent) ? Math.max(0, invitesSent) : 0;
  const accept = Number.isFinite(inviteAcceptRate) ? Math.max(0, Math.min(1, inviteAcceptRate)) : 0;
  const purchase = Number.isFinite(purchaseRate) ? Math.max(0, Math.min(1, purchaseRate)) : 0;

  // k = invites per user x accept rate x conversion-to-active rate.
  const k = round2(invites * accept * purchase);

  // Project ~5 cycles starting from a seed cohort of 100 active customers.
  const cycles: ProjectedCycle[] = [];
  let cohort = 100;
  for (let c = 1; c <= 5; c++) {
    cohort = cohort * k;
    cycles.push({ cycle: c, newCustomers: Math.round(cohort) });
  }

  const verdict: "viral" | "sub-viral" = k >= 1 ? "viral" : "sub-viral";
  return {
    invitesSent: invites,
    inviteAcceptRate: accept,
    purchaseRate: purchase,
    kFactor: k,
    projectedCycles: cycles,
    verdict,
    note: `ESTIMATE only — modelled k=${k} from a seed cohort of 100. ${verdict === "viral" ? "k>=1 implies self-sustaining growth in this model" : "k<1 implies referral traffic decays without paid acquisition"}. Not a guarantee; real results depend on offer, audience and market.`,
  };
}

// ---------------------------------------------------------------------------
// Mobile-wallet pass descriptor
// ---------------------------------------------------------------------------
export type WalletCustomer = { name: string; tier?: string; points?: number };

export type WalletPassSpec = {
  title: string;
  tier: TierName;
  points: number;
  barcodeValue: string;
  memberName: string;
  perks: string[];
  note: string;
};

export function walletPassSpec(customer: WalletCustomer): WalletPassSpec {
  const name = customer.name || "Member";
  const points = Number.isFinite(customer.points) ? Math.max(0, Math.floor(customer.points as number)) : 0;
  const resolved = tierFor(points);
  const tier: TierName = ((): TierName => {
    const claimed = customer.tier as TierName | undefined;
    if (claimed && TIERS.some((t) => t.tier === claimed)) return claimed;
    return resolved.tier;
  })();
  const passId = seed(`${name}|${tier}|${points}`).toString(36).toUpperCase().padStart(8, "0");
  return {
    title: "MarketWar OS Loyalty",
    tier,
    points,
    barcodeValue: `MWLOYAL:${passId}`,
    memberName: name,
    perks: (TIERS.find((t) => t.tier === tier) ?? TIERS[0]).perks,
    note: "Wallet pass descriptor only — points balance shown is a snapshot ESTIMATE at issue time.",
  };
}

// ---------------------------------------------------------------------------
// Zero-config demo
// ---------------------------------------------------------------------------
export type LoyaltyDemo = {
  tier: TierResult;
  referral: ReferralResult;
  earn: EarnResult;
  kFactor: KFactorResult;
  walletPass: WalletPassSpec;
};

export function demoLoyalty(): LoyaltyDemo {
  return {
    tier: tierFor(2600),
    referral: referralInvite("cust_9f3a"),
    earn: earnPoints("purchase", 42),
    kFactor: kFactor(8, 0.35, 0.45),
    walletPass: walletPassSpec({ name: "Ada Okafor", points: 2600 }),
  };
}
