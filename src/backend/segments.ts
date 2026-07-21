// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar AI Audience Segmentation Engine (Brevo pack Module 18/19).
//
// Unifies customer records and auto-builds PROFITABLE segments with RFM / LTV /
// churn / intent scoring, then hands each segment a recommended offer, channel
// and follow-up + a campaign priority. Deterministic so it works in demo mode;
// live data plugs in via the CDP import. Feeds the ROI engine (which segment is
// cheapest to convert), the email/amplify engines (who to send to) and the
// warfare engine (offer per segment). No fabricated data — scores come from the
// records provided (or the deterministic demo set).

export type CustomerRecord = {
  id: string;
  name?: string;
  lastOrderDaysAgo?: number; // recency
  orderCount?: number; // frequency
  totalSpendGbp?: number; // monetary
  avgOrderValueGbp?: number;
  emailEngaged?: boolean;
  consent?: boolean; // marketing consent (governs eligibility)
  referredCount?: number;
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const seed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };

// Deterministic demo customer base so the engine demonstrates with zero config.
export function sampleCustomers(business: string, count = 40): CustomerRecord[] {
  const s = seed(business || "Brixton Grill House");
  return Array.from({ length: count }, (_, i) => {
    const k = s + i * 2654435761;
    const orderCount = (k % 12);
    const aov = 18 + (k % 55);
    return {
      id: `c${i + 1}`,
      name: `Customer ${(k % 900) + 100}`,
      lastOrderDaysAgo: (k >> 3) % 400,
      orderCount,
      totalSpendGbp: orderCount * aov,
      avgOrderValueGbp: aov,
      emailEngaged: ((k >> 5) % 3) !== 0,
      consent: ((k >> 2) % 5) !== 0, // ~80% consented
      referredCount: (k >> 7) % 4,
    };
  });
}

// ---------------------------------------------------------------------------
// Per-customer scoring (RFM + LTV + churn + intent)
// ---------------------------------------------------------------------------
export type ScoredCustomer = CustomerRecord & {
  recencyScore: number; frequencyScore: number; monetaryScore: number;
  ltvGbp: number; churnRisk: number; purchaseIntent: number; segment: string;
};

function scoreCustomer(c: CustomerRecord): ScoredCustomer {
  const recencyDays = c.lastOrderDaysAgo ?? 999;
  const freq = c.orderCount ?? 0;
  const spend = c.totalSpendGbp ?? 0;
  const aov = c.avgOrderValueGbp ?? (freq ? spend / freq : 0);

  const recencyScore = clamp(100 - recencyDays / 4);
  const frequencyScore = clamp(freq * 12);
  const monetaryScore = clamp(spend / 6);
  // Simple LTV proxy: AOV × expected future orders (scaled by frequency + recency).
  const ltvGbp = Math.round(aov * (1 + freq) * (recencyScore / 100) * 1.5);
  const churnRisk = clamp(recencyDays / 4 - frequencyScore * 0.3 + (c.emailEngaged ? -10 : 15));
  const purchaseIntent = clamp(recencyScore * 0.5 + frequencyScore * 0.3 + (c.emailEngaged ? 20 : 0));

  return { ...c, recencyScore, frequencyScore, monetaryScore, ltvGbp, churnRisk, purchaseIntent, segment: classify({ recencyDays, freq, spend, churnRisk, purchaseIntent, referred: c.referredCount ?? 0, ltvGbp }) };
}

function classify(x: { recencyDays: number; freq: number; spend: number; churnRisk: number; purchaseIntent: number; referred: number; ltvGbp: number }): string {
  if (x.freq === 0) return "hot_leads"; // signed up / engaged but never bought
  if (x.freq >= 6 && x.spend >= 250) return "vip_customers";
  if (x.ltvGbp >= 200) return "high_ltv_customers";
  if (x.referred >= 2) return "referral_ready_customers";
  if (x.recencyDays > 180) return "inactive_customers";
  if (x.churnRisk >= 60) return "churn_risk_customers";
  if (x.freq >= 2) return "repeat_buyers";
  if (x.purchaseIntent >= 60) return "high_intent_customers";
  return "price_sensitive_customers";
}

// ---------------------------------------------------------------------------
// Segment roll-up with recommended offer / channel / follow-up
// ---------------------------------------------------------------------------
type SegmentPlaybook = { label: string; offer: string; channel: string; followUp: string; basePriority: number };
const PLAYBOOK: Record<string, SegmentPlaybook> = {
  hot_leads: { label: "Hot leads (never bought)", offer: "First-order incentive to convert the intent now", channel: "WhatsApp + email", followUp: "48h sequence: reminder → social proof → deadline", basePriority: 95 },
  vip_customers: { label: "VIP customers", offer: "VIP-only early access / thank-you reward (protect margin)", channel: "WhatsApp (personal)", followUp: "Concierge touch + referral ask", basePriority: 88 },
  high_ltv_customers: { label: "High-LTV customers", offer: "Loyalty tier upgrade + cross-sell", channel: "Email + WhatsApp", followUp: "Post-purchase upsell sequence", basePriority: 84 },
  repeat_buyers: { label: "Repeat buyers", offer: "Bundle to raise average order value", channel: "Email + WhatsApp", followUp: "Reorder reminder at their cadence", basePriority: 72 },
  high_intent_customers: { label: "High-intent (recent, engaged)", offer: "Time-boxed offer while intent is hot", channel: "WhatsApp", followUp: "24h nudge", basePriority: 80 },
  referral_ready_customers: { label: "Referral-ready", offer: "Refer-a-friend reward (both sides win)", channel: "WhatsApp + SMS", followUp: "Share link + milestone bonus", basePriority: 76 },
  inactive_customers: { label: "Inactive (>180d)", offer: "Win-back comeback offer", channel: "Email → SMS if unopened", followUp: "Win-back once, then sunset", basePriority: 60 },
  churn_risk_customers: { label: "Churn risk", offer: "Retention offer + 'we miss you'", channel: "WhatsApp + email", followUp: "Resolve any complaint first, then offer", basePriority: 68 },
  price_sensitive_customers: { label: "Price-sensitive / low-freq", offer: "Value bundle, not a deep discount", channel: "Email", followUp: "Value-led nurture", basePriority: 45 },
};

export type Segment = {
  key: string; label: string; size: number; consentedSize: number;
  revenuePotentialGbp: number; recommendedOffer: string; recommendedChannel: string;
  recommendedFollowUp: string; campaignPriority: number;
};

export type SegmentationReport = {
  business: string; totalCustomers: number; consentedShare: number;
  segments: Segment[];
  note: string;
};

// ---------------------------------------------------------------------------
// Individual scored-customer rows (additive export — the Customer Vault reads
// these directly; segment roll-ups above are unchanged). Sorted by LTV so the
// vault's "top customers" and table share one deterministic ordering.
// ---------------------------------------------------------------------------
export function scoredCustomerList(business: string, customers: CustomerRecord[]): ScoredCustomer[] {
  const base = customers.length ? customers : sampleCustomers(business);
  return base.map(scoreCustomer).sort((a, b) => b.ltvGbp - a.ltvGbp);
}

// Human label for a segment key (additive — surfaces PLAYBOOK labels without
// exposing the map). Falls back to the raw key prettified.
export function segmentLabel(key: string): string {
  return PLAYBOOK[key]?.label ?? key.replace(/_/g, " ");
}

export function segmentAudience(business: string, customers: CustomerRecord[]): SegmentationReport {
  const base = customers.length ? customers : sampleCustomers(business);
  const scored = base.map(scoreCustomer);
  const byKey = new Map<string, ScoredCustomer[]>();
  scored.forEach((c) => { const a = byKey.get(c.segment) ?? []; a.push(c); byKey.set(c.segment, a); });

  const segments: Segment[] = [...byKey.entries()].map(([key, members]) => {
    const pb = PLAYBOOK[key] ?? PLAYBOOK.price_sensitive_customers;
    const consented = members.filter((m) => m.consent !== false);
    // Revenue potential = sum of LTV of consented members × the segment's intent.
    const avgIntent = members.reduce((a, m) => a + m.purchaseIntent, 0) / members.length / 100;
    const revenuePotential = Math.round(consented.reduce((a, m) => a + m.ltvGbp, 0) * (0.4 + avgIntent));
    // Priority blends the playbook base with size + revenue.
    const campaignPriority = clamp(pb.basePriority * 0.7 + Math.min(20, consented.length) + Math.min(10, revenuePotential / 200));
    return {
      key, label: pb.label, size: members.length, consentedSize: consented.length,
      revenuePotentialGbp: revenuePotential, recommendedOffer: pb.offer,
      recommendedChannel: pb.channel, recommendedFollowUp: pb.followUp, campaignPriority,
    };
  }).sort((a, b) => b.campaignPriority - a.campaignPriority);

  const consentedShare = Math.round(scored.filter((c) => c.consent !== false).length / scored.length * 100) / 100;
  return {
    business, totalCustomers: scored.length, consentedShare, segments,
    note: "Segments are ranked by campaign priority (offer strength × consented size × revenue potential). Only consented contacts are eligible for marketing — the follow-up engine enforces frequency caps and opt-out.",
  };
}
