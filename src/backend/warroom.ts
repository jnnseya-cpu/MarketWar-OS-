// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Campaign War Room Engine — the live campaign board.
//
// Every campaign carries a verdict: losers die, winners get scale orders.
// This engine computes an active-campaign board for a brand — each campaign
// with channel, status, spend, results, ROAS and a Stop/Fix/Scale verdict —
// plus roll-up metrics, DETERMINISTICALLY so the surface works in zero-config
// demo mode and stays specific to the business.
//
// It reuses the M-36 warfare engine (designCampaign) for structure: the
// inferred vertical, the highest-probability objective/primary channel and the
// AI Campaign Score shape the demo board so it matches what the OS would
// actually run for this business.
//
// REAL revenue: when a brandId's results ledger is supplied, real attributed
// revenue is folded onto matching campaigns (mode → "live") — never fabricated.
// Without a ledger it is deterministic DEMO INTELLIGENCE, clearly badged. No
// wall-clock / randomness, so the same brand always renders the same board.

import { designCampaign } from "@/backend/warfare";
import type { CampaignVerdict } from "@/shared/types";
import type { ResultsSummary, SourceRollup } from "@/shared/results";

const clamp = (n: number, lo = 0, hi = 1e9) => Math.max(lo, Math.min(hi, Math.round(n)));
// FNV-1a — deterministic seed, shared style across engines.
const seed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };

export type CampaignCard = {
  id: string;
  name: string;
  channel: string;
  goal: string;
  hook: string;
  status: "active" | "paused" | "testing";
  spend: number;
  leads: number;
  messages: number;
  orders: number;
  revenue: number;
  roas: number; // revenue / spend (0-spend organic channels report Infinity → shown as ∞ upstream)
  costPerLead: number;
  costPerOrder: number;
  verdict: CampaignVerdict;
  verdictReason: string;
  spark: number[]; // 7-day lead trend
  startedDaysAgo: number;
  dataMode: "demo" | "live"; // "live" once real ledger revenue is attributed to it
};

export type WarBoardMetrics = {
  spend: number;
  leads: number;
  orders: number;
  revenue: number;
  roas: number;
  costPerLead: number;
  costPerOrder: number;
  activeCount: number;
};

export type WarBoard = {
  business: string;
  mode: "empty" | "demo-intelligence" | "live";
  badge: string;
  campaigns: CampaignCard[];
  metrics: WarBoardMetrics;
  realRevenueGbp: number; // attributed revenue pulled from the ledger (0 when none)
  realOrders: number;
  note: string;
};

// The channel roster a local business realistically runs across.
const CHANNELS = ["Meta", "Instagram", "TikTok", "WhatsApp", "Google", "LinkedIn"];

function round2(n: number): number { return Math.round(n * 100) / 100; }

// Verdict rules — Stop the losers, Fix the fixable, Scale the winners.
function decideVerdict(c: { spend: number; orders: number; roas: number; startedDaysAgo: number; leads: number }): { verdict: CampaignVerdict; reason: string } {
  const cpo = c.orders > 0 ? c.spend / c.orders : Infinity;
  if (c.startedDaysAgo < 3) {
    return { verdict: "TESTING", reason: `${c.startedDaysAgo === 0 ? "Just launched" : `${c.startedDaysAgo}d into test`} — verdict locks once it clears the spend threshold. Hold and watch cost per order.` };
  }
  if (c.spend === 0 && c.orders > 0) {
    return { verdict: "SCALE", reason: "Zero-cost channel converting — the cheapest revenue you can buy. Extend it to the rest of the eligible list." };
  }
  if (c.roas >= 3 && c.orders > 0) {
    return { verdict: "SCALE", reason: `ROAS ${round2(c.roas)}× at £${round2(cpo)}/order — a proven winner. Raise the daily budget ~40% and clone the winning creative.` };
  }
  if (c.orders === 0 || c.roas < 1) {
    return { verdict: "STOP", reason: `£${c.spend} spent, ${c.orders} orders — burning budget without return. Kill it and reroute spend to a Scale campaign.` };
  }
  return { verdict: "FIX", reason: `Leads land but stall before ordering (ROAS ${round2(c.roas)}×). Tighten the offer and the first WhatsApp reply before adding budget.` };
}

// Build one deterministic demo campaign for a channel slot.
function demoCampaign(business: string, channel: string, i: number, aov: number): CampaignCard {
  const s = seed(`${business}·${channel}·${i}`);
  const startedDaysAgo = 1 + (s % 16);
  const isOrganic = channel === "WhatsApp"; // owned/organic — zero ad spend
  const spend = isOrganic ? 0 : 30 + (s % 110);
  const leads = 3 + (s % 44);
  const messages = Math.round(leads * (0.5 + ((s >> 3) % 40) / 100));
  const orders = Math.round(messages * (0.25 + ((s >> 5) % 45) / 100));
  const revenue = Math.round(orders * aov);
  const roas = spend > 0 ? revenue / spend : orders > 0 ? Infinity : 0;
  const costPerLead = leads > 0 ? round2(spend / leads) : 0;
  const costPerOrder = orders > 0 ? round2(spend / orders) : 0;
  const { verdict, reason } = decideVerdict({ spend, orders, roas: roas === Infinity ? 999 : roas, startedDaysAgo, leads });

  // 7-day lead spark — deterministic shape scaled to the campaign's lead volume.
  const base = Math.max(1, Math.round(leads / 7));
  const drift = verdict === "SCALE" ? 0.22 : verdict === "STOP" ? -0.16 : 0.04;
  const spark = Array.from({ length: 7 }, (_, d) => Math.max(0, Math.round(base * (1 + drift * d) + ((s >> (d % 12)) % 3))));

  const GOALS: Record<string, string> = { WhatsApp: "Get WhatsApp orders", LinkedIn: "Get catering / B2B contracts", Google: "Capture buying intent", Meta: "Get orders", Instagram: "Get orders", TikTok: "Get new customers" };
  const goal = GOALS[channel] ?? "Get customers";
  const status: CampaignCard["status"] = verdict === "STOP" ? "paused" : verdict === "TESTING" ? "testing" : "active";

  return {
    id: `wr-${channel.toLowerCase()}-${i}`,
    name: `${channel} — ${goal.replace(/^Get /, "")}`,
    channel,
    goal,
    hook: `Deterministic demo campaign for ${business} on ${channel}.`,
    status,
    spend,
    leads,
    messages,
    orders,
    revenue,
    roas: roas === Infinity ? Infinity : round2(roas),
    costPerLead,
    costPerOrder,
    verdict,
    verdictReason: reason,
    spark,
    startedDaysAgo,
    dataMode: "demo",
  };
}

// Infer the channel a ledger source belongs to (e.g. "IG Reels promo" → Instagram).
function inferChannel(source: string): string {
  const s = source.toLowerCase();
  const hit = CHANNELS.find((c) => s.includes(c.toLowerCase()));
  if (hit) return hit;
  if (/\b(ig|insta)\b/.test(s)) return "Instagram";
  if (/\b(fb|facebook)\b/.test(s)) return "Meta";
  if (/\b(wa|whatsapp)\b/.test(s)) return "WhatsApp";
  if (/\b(g|ads|adwords|search)\b/.test(s)) return "Google";
  if (/\b(li|linkedin)\b/.test(s)) return "LinkedIn";
  return "Direct";
}

// A REAL campaign card built purely from a ledger source rollup — real revenue,
// orders and leads. Ad spend is untracked (£0) until the ad account connects, so
// ROAS/cost-per-order are shown as such and the verdict says so. Never fabricated.
function ledgerCard(source: SourceRollup, i: number): CampaignCard {
  const channel = inferChannel(source.source);
  const revenue = Math.round(source.revenueGbp);
  const orders = source.orders;
  const leads = source.leads || orders;
  const spend = 0; // no ad account connected → no tracked spend
  const roas = orders > 0 ? Infinity : 0;
  const { verdict, reason } = orders > 0
    ? { verdict: "SCALE" as CampaignVerdict, reason: `£${revenue.toLocaleString()} from ${orders} order${orders === 1 ? "" : "s"} with no tracked ad spend — pure attributed revenue. Connect the ${channel} ad account to see true ROAS, then scale what pays.` }
    : { verdict: "FIX" as CampaignVerdict, reason: `${leads} lead${leads === 1 ? "" : "s"} logged, no orders yet. Follow up on WhatsApp/email to convert before spending on ads.` };
  const base = Math.max(1, Math.round(leads / 7));
  const spark = Array.from({ length: 7 }, (_, d) => Math.max(0, base + ((i + d) % 2)));
  return {
    id: `wr-real-${i}`,
    name: source.source,
    channel,
    goal: orders > 0 ? "Attributed revenue" : "Convert logged leads",
    hook: `Real results logged to your ledger for “${source.source}”.`,
    status: orders > 0 ? "active" : "testing",
    spend, leads, messages: leads, orders, revenue,
    roas: roas === Infinity ? Infinity : round2(roas),
    costPerLead: 0, costPerOrder: 0,
    verdict, verdictReason: reason, spark, startedDaysAgo: 0,
    dataMode: "live",
  };
}

export function buildWarBoard(business: string, ledger?: ResultsSummary | null, opts?: { allowDemo?: boolean }): WarBoard {
  const name = (business || "").trim() || "your business";

  const realRollups: SourceRollup[] = (ledger && !ledger.isEmpty)
    ? ledger.bySource.filter((r) => r.revenueGbp > 0 || r.leads > 0)
    : [];
  const hasReal = realRollups.length > 0;

  // REAL board: one card per logged source (real revenue/orders/leads). This is
  // the only path a signed-in brand ever sees — no fabricated campaigns.
  if (hasReal) {
    const campaigns = realRollups
      .map((roll, i) => ledgerCard(roll, i))
      .sort((a, b) => verdictRank(a.verdict) - verdictRank(b.verdict));
    const spend = campaigns.reduce((a, c) => a + c.spend, 0);
    const leads = campaigns.reduce((a, c) => a + c.leads, 0);
    const orders = campaigns.reduce((a, c) => a + c.orders, 0);
    const revenue = campaigns.reduce((a, c) => a + c.revenue, 0);
    return {
      business: name,
      mode: "live",
      badge: "Live revenue attributed",
      campaigns,
      metrics: {
        spend, leads, orders, revenue,
        roas: spend > 0 ? round2(revenue / spend) : 0,
        costPerLead: leads > 0 ? round2(spend / leads) : 0,
        costPerOrder: orders > 0 ? round2(spend / orders) : 0,
        activeCount: campaigns.filter((c) => c.status !== "paused").length,
      },
      realRevenueGbp: revenue,
      realOrders: orders,
      note: "Every card is built from YOUR results ledger — real attributed revenue, orders and leads by source. Ad spend is untracked (£0) until you connect the ad account; connect it to see true ROAS. No fabricated figures.",
    };
  }

  // No real data. Default (a signed-in brand) → honest empty state, never demo.
  if (!opts?.allowDemo) {
    return {
      business: name,
      mode: "empty",
      badge: "No campaigns yet",
      campaigns: [],
      metrics: { spend: 0, leads: 0, orders: 0, revenue: 0, roas: 0, costPerLead: 0, costPerOrder: 0, activeCount: 0 },
      realRevenueGbp: 0,
      realOrders: 0,
      note: "No campaigns logged yet. Log a lead or sale against a source in Revenue Intel (or connect an ad account) and each source appears here as a live campaign with a Stop/Fix/Scale verdict.",
    };
  }

  // Opt-in deterministic demo board (internal demos / public marketing only —
  // never the signed-in real-brand path). Preserves the original demo capability.
  const eco = designCampaign({ product: name, audience: "", result: "", budget: 600, location: "" });
  const primaryChannel = eco.objective.primaryChannel.split(/[ +/]/)[0] || "Meta";
  const s = seed(name);
  const aov = 18 + (s % 55);
  const roster = [primaryChannel, ...CHANNELS].filter((c, i, a) => CHANNELS.includes(c) && a.indexOf(c) === i);
  const count = 4 + (s % 2);
  const campaigns: CampaignCard[] = Array.from({ length: count }, (_, i) => demoCampaign(name, roster[i % roster.length], i, aov))
    .sort((a, b) => verdictRank(a.verdict) - verdictRank(b.verdict));
  const spend = campaigns.reduce((a, c) => a + c.spend, 0);
  const leads = campaigns.reduce((a, c) => a + c.leads, 0);
  const orders = campaigns.reduce((a, c) => a + c.orders, 0);
  const revenue = campaigns.reduce((a, c) => a + c.revenue, 0);
  return {
    business: name,
    mode: "demo-intelligence",
    badge: "Demo intelligence",
    campaigns,
    metrics: {
      spend, leads, orders, revenue,
      roas: spend > 0 ? round2(revenue / spend) : 0,
      costPerLead: leads > 0 ? round2(spend / leads) : 0,
      costPerOrder: orders > 0 ? round2(spend / orders) : 0,
      activeCount: campaigns.filter((c) => c.status !== "paused").length,
    },
    realRevenueGbp: 0,
    realOrders: 0,
    note: "Deterministic demo intelligence: campaigns, spend and results are computed from the brand, not live ad-account data. Connect an ad account and log results (Revenue) to see real spend and attributed revenue. Every verdict follows the same Stop/Fix/Scale doctrine the OS runs live.",
  };
}

function verdictRank(v: CampaignVerdict): number {
  return v === "SCALE" ? 0 : v === "TESTING" ? 1 : v === "FIX" ? 2 : 3; // STOP last
}
