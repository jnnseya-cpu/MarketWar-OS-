// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar AI Marketing ROI Engine — the growth-channel arbitrator.
//
// The flagship "AI Growth OS" idea: don't sell advertising, sell the cheapest
// next customer. Every campaign starts with one question — "where can we get
// the next customer for the lowest acquisition cost?" — and the engine compares
// channels by predicted CAC, conversion probability and ROI, then allocates
// budget to the highest-ROI mix. Owned channels (WhatsApp/email/referral/local
// SEO/community) are favoured because they lower CAC and BUILD the moat
// (independence doctrine); rented channels are ROI amplifiers, not foundations.
//
// Deterministic so it works in demo mode; live performance data refines the
// predictions post-launch (never faked — predictions are labelled estimates).

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const seed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };
const round2 = (n: number) => Math.round(n * 100) / 100;

type ChannelDef = {
  id: string; label: string; owned: boolean;
  baseCacGbp: number; // baseline cost per acquired customer
  baseConversion: number; // baseline lead→customer probability (0–1)
};

// Owned channels carry a lower CAC and compound into the moat; rented channels
// buy reach but rent the customer.
const CHANNELS: ChannelDef[] = [
  { id: "referral", label: "Referral / word-of-mouth", owned: true, baseCacGbp: 6, baseConversion: 0.30 },
  { id: "whatsapp", label: "WhatsApp (owned list)", owned: true, baseCacGbp: 8, baseConversion: 0.26 },
  { id: "email", label: "Email (owned list)", owned: true, baseCacGbp: 9, baseConversion: 0.18 },
  { id: "local_seo", label: "Local SEO / Google Business", owned: true, baseCacGbp: 12, baseConversion: 0.20 },
  { id: "community", label: "Community / groups / forums", owned: true, baseCacGbp: 11, baseConversion: 0.16 },
  { id: "sms", label: "SMS (owned list)", owned: true, baseCacGbp: 10, baseConversion: 0.15 },
  { id: "tiktok", label: "TikTok ads", owned: false, baseCacGbp: 18, baseConversion: 0.12 },
  { id: "instagram", label: "Instagram ads", owned: false, baseCacGbp: 22, baseConversion: 0.13 },
  { id: "facebook", label: "Facebook ads", owned: false, baseCacGbp: 24, baseConversion: 0.14 },
  { id: "google_search", label: "Google Search ads", owned: false, baseCacGbp: 28, baseConversion: 0.22 },
  { id: "youtube", label: "YouTube ads", owned: false, baseCacGbp: 26, baseConversion: 0.10 },
  { id: "linkedin", label: "LinkedIn ads", owned: false, baseCacGbp: 45, baseConversion: 0.16 },
  { id: "influencer", label: "Influencer / creator", owned: false, baseCacGbp: 20, baseConversion: 0.11 },
];

// Objective → channel fit multiplier (lower CAC where the channel suits the goal).
const OBJECTIVE_FIT: Record<string, Partial<Record<string, number>>> = {
  orders: { whatsapp: 0.8, local_seo: 0.85, google_search: 0.85, referral: 0.8 },
  bookings: { local_seo: 0.8, google_search: 0.8, whatsapp: 0.85, referral: 0.85 },
  leads: { google_search: 0.8, linkedin: 0.8, email: 0.85, facebook: 0.9 },
  messages: { whatsapp: 0.75, instagram: 0.9, facebook: 0.9 },
  b2b: { linkedin: 0.7, email: 0.8, google_search: 0.85 },
  reactivation: { email: 0.7, whatsapp: 0.75, sms: 0.8 },
};

export type ChannelROI = {
  channel: string; label: string; owned: boolean;
  predictedCacGbp: number; conversionProbability: number; predictedRoi: number; fitScore: number;
  recommended: boolean; note: string;
};

export type RoiReport = {
  business: string; objective: string; budgetGbp: number; avgOrderValueGbp: number;
  channels: ChannelROI[];
  nextCheapestCustomer: { channel: string; label: string; cacGbp: number; why: string };
  allocation: { channel: string; label: string; amountGbp: number; share: number; owned: boolean }[];
  ownedShare: number; // fraction of budget to owned channels
  doctrine: string;
  honesty: string;
};

function objectiveKey(objective: string): string {
  const o = objective.toLowerCase();
  if (/\b(order|buy|purchase|sale)\b/.test(o)) return "orders";
  if (/\b(book|appointment|reservation|viewing|demo)\b/.test(o)) return "bookings";
  if (/\b(message|whatsapp|chat|dm|enquir)\b/.test(o)) return "messages";
  if (/\b(b2b|partner|supplier|wholesale|enterprise)\b/.test(o)) return "b2b";
  if (/\b(reactivat|win.?back|dormant|old customer)\b/.test(o)) return "reactivation";
  return "leads";
}

export function compareChannels(input: { business?: string; objective?: string; budgetGbp?: number; avgOrderValueGbp?: number; currency?: string }): RoiReport {
  const business = (input.business || "your business").trim();
  const objective = (input.objective || "get leads").trim();
  const budget = Math.max(0, input.budgetGbp ?? 600);
  const aov = Math.max(1, input.avgOrderValueGbp ?? 40);
  const objKey = objectiveKey(objective);
  const fit = OBJECTIVE_FIT[objKey] || {};
  const s = seed(business + objective);

  const channels: ChannelROI[] = CHANNELS.map((c, i) => {
    const fitMult = fit[c.id] ?? 1; // <1 = better fit → lower CAC
    const jitter = 1 + (((s >> i) % 30) - 15) / 100; // ±15% deterministic
    const cac = round2(c.baseCacGbp * fitMult * jitter);
    const conv = Math.min(0.6, c.baseConversion * (fitMult < 1 ? 1.15 : 1) * jitter);
    // ROI = value returned per £ spent = (AOV × conversionUplift) / CAC, expressed as a multiple.
    const roi = round2((aov * (0.6 + conv)) / cac);
    const fitScore = clamp(100 - (cac / 0.6) + (c.owned ? 12 : 0));
    return {
      channel: c.id, label: c.label, owned: c.owned,
      predictedCacGbp: cac, conversionProbability: Math.round(conv * 100) / 100,
      predictedRoi: roi, fitScore,
      recommended: false,
      note: c.owned ? "Owned — lowers CAC and builds the moat." : "Rented — ROI amplifier only; the customer isn't yours.",
    };
  }).sort((a, b) => b.predictedRoi - a.predictedRoi || a.predictedCacGbp - b.predictedCacGbp);

  // Recommend the top channels by ROI, front-loading owned ones.
  channels.slice(0, 5).forEach((c) => { c.recommended = true; });

  const cheapest = [...channels].sort((a, b) => a.predictedCacGbp - b.predictedCacGbp)[0];

  // Allocate budget across the recommended set, weighting by ROI.
  const rec = channels.filter((c) => c.recommended);
  const roiSum = rec.reduce((a, c) => a + c.predictedRoi, 0) || 1;
  const allocation = rec.map((c) => {
    const share = c.predictedRoi / roiSum;
    return { channel: c.channel, label: c.label, amountGbp: Math.round(budget * share), share: Math.round(share * 100) / 100, owned: c.owned };
  });
  const ownedShare = Math.round(rec.filter((c) => c.owned).reduce((a, c) => a + c.predictedRoi, 0) / roiSum * 100) / 100;

  return {
    business, objective, budgetGbp: budget, avgOrderValueGbp: aov,
    channels,
    nextCheapestCustomer: { channel: cheapest.channel, label: cheapest.label, cacGbp: cheapest.predictedCacGbp, why: `Lowest predicted CAC (£${cheapest.predictedCacGbp}) for "${objective}"${cheapest.owned ? " — and it's an owned channel, so it compounds." : "."}` },
    allocation,
    ownedShare,
    doctrine: "Don't buy the most reach — buy the cheapest next customer. Front-load owned channels (they lower CAC and build the moat); treat rented ad platforms as ROI amplifiers, scaled only where the numbers work.",
    honesty: "CAC/conversion/ROI are ESTIMATES from channel baselines + your inputs, not guarantees. The engine re-ranks on real performance after launch — it never claims attribution it can't prove. It never bypasses platform policies or scrapes protected data — it allocates budget more intelligently and optimises on measurable performance.",
  };
}

// ---------------------------------------------------------------------------
// AI Marketing Guarantee Score — campaign readiness BEFORE spend (spec)
// Prevents businesses wasting budget on a campaign that isn't ready.
// ---------------------------------------------------------------------------
export type ReadinessInput = {
  hasOffer?: boolean; offerStrength?: number; // 0–100
  hasWebsite?: boolean; hasLandingPage?: boolean;
  hasCreatives?: boolean; hasTargeting?: boolean; audienceSpecific?: boolean;
  hasTracking?: boolean; hasFollowUp?: boolean;
};

export type ReadinessReport = {
  scores: { name: string; score: number }[];
  overall: number;
  verdict: "launch" | "improve first" | "do not launch";
  blockers: string[];
  recommendation: string;
};

export function campaignReadiness(input: ReadinessInput): ReadinessReport {
  const offer = input.offerStrength ?? (input.hasOffer ? 70 : 30);
  const website = input.hasLandingPage ? 82 : input.hasWebsite ? 60 : 25;
  const creatives = input.hasCreatives ? 74 : 40;
  const targeting = input.audienceSpecific ? 80 : input.hasTargeting ? 55 : 35;
  const tracking = input.hasTracking ? 78 : 30;
  const followUp = input.hasFollowUp ? 75 : 35;
  const scores = [
    { name: "Offer", score: clamp(offer) },
    { name: "Website / landing page", score: clamp(website) },
    { name: "Creatives", score: clamp(creatives) },
    { name: "Targeting", score: clamp(targeting) },
    { name: "Tracking", score: clamp(tracking) },
    { name: "Follow-up", score: clamp(followUp) },
  ];
  const overall = clamp(scores.reduce((a, s) => a + s.score, 0) / scores.length);
  const blockers = scores.filter((s) => s.score < 55).map((s) => `${s.name} (${s.score}) — fix before spending.`);
  const verdict = overall >= 70 && blockers.length === 0 ? "launch" : overall >= 55 ? "improve first" : "do not launch";
  return {
    scores, overall, verdict, blockers,
    recommendation: verdict === "launch"
      ? "Ready — launch on the lowest-CAC channels first and scale the winners."
      : verdict === "improve first"
        ? `Close to ready — fix ${blockers.length ? blockers.map((b) => b.split(" (")[0]).join(", ") : "the weakest scores"} first; spending now leaks budget.`
        : "Not ready — spending now will waste money. Fix the blockers (especially tracking) before any paid channel.",
  };
}
