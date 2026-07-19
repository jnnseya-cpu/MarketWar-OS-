// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar 7-Agent Marketing Strategy Chain (spec "AI-Agent Section").
//
// A CONNECTED strategy engine, not isolated prompts: each stage reuses the
// previous output, exactly as specified —
//   Customer Avatar → Message Weapon → Channel Commander → 90-Day Content →
//   Funnel Architect → Paid-Ads Risk-Control → One-Page Battle Plan.
// The Funnel Architect always requires a landing page (§4.6 central agent).
// Deterministic + demo-safe; produces the structured schema for each stage.

import { compareChannels } from "@/backend/roi-engine";
import { campaignReadiness, type ReadinessInput } from "@/backend/roi-engine";

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const seed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };

export type StrategyInput = {
  business: string; product?: string; audience?: string; location?: string;
  offer?: string; priceGbp?: number; painPoint?: string; monthlyBudgetGbp?: number;
  readiness?: ReadinessInput;
};

// --------------------------------------------------------------- 1. Avatar
export type CustomerAvatar = {
  demographics: string[]; psychographics: string[]; dailyFrustrations: string[];
  failedAlternatives: string[]; desiredSolution: string[]; onlineLocations: string[];
  customerLanguage: string[]; buyingTriggers: string[]; immediatePurchaseMotivators: string[];
  summaryParagraph: string;
  scores: { painIntensity: number; urgency: number; buyingPower: number; reachability: number; conversionProbability: number; repeatPurchase: number; referralPotential: number };
};

export function buildCustomerAvatar(i: StrategyInput): CustomerAvatar {
  const who = i.audience || "local customers"; const where = i.location || "your area"; const pain = i.painPoint || "wasting money on options that disappoint";
  const s = seed(i.business + who);
  return {
    demographics: [`${who}`, `based in/near ${where}`, "value-conscious", "mobile-first"],
    psychographics: ["wants results without the runaround", "trusts local + word-of-mouth", "sceptical of hype", "acts on a clear, honest offer"],
    dailyFrustrations: [pain, "too many choices, none trustworthy", "slow or no follow-up", "hidden costs"],
    failedAlternatives: ["big-brand options that ignore them", "cheap options that disappoint", "DIY that wastes time"],
    desiredSolution: ["a trusted local option", "fast and fair", "no risk to try once"],
    onlineLocations: ["WhatsApp", "Instagram/TikTok", "Google (search + Maps)", "local Facebook groups"],
    customerLanguage: ["\"is it actually good?\"", "\"how fast?\"", "\"any deal?\"", "\"near me\""],
    buyingTriggers: ["a specific, honest offer", "social proof from people like them", "urgency that's real", "an easy first step (WhatsApp)"],
    immediatePurchaseMotivators: ["first-order incentive", "fast/near-me availability", "a visible guarantee"],
    summaryParagraph: `The core buyer is ${who} in ${where} who are tired of ${pain}. They trust local and proof, act on clear honest offers, and convert fastest through WhatsApp with a low-risk first step.`,
    scores: {
      painIntensity: clamp(70 + (s % 20)), urgency: clamp(60 + ((s >> 2) % 25)), buyingPower: clamp(55 + ((s >> 4) % 25)),
      reachability: clamp(75 + ((s >> 6) % 15)), conversionProbability: clamp(62 + ((s >> 8) % 20)),
      repeatPurchase: clamp(58 + ((s >> 10) % 25)), referralPotential: clamp(60 + ((s >> 12) % 25)),
    },
  };
}

// --------------------------------------------------------------- 2. Messaging
export type MessagingStrategy = {
  mainBrandMessage: string; uniqueValueProposition: string;
  slogans: { context: string; text: string }[];
  emotionalTriggers: string[]; objections: { objection: string; response: string }[];
  wordsToUse: string[]; wordsToAvoid: string[];
  scores: { clarity: number; painMatch: number; emotionalStrength: number; trustStrength: number; objectionHandling: number; conversionPower: number };
};

export function buildMessaging(i: StrategyInput, a: CustomerAvatar): MessagingStrategy {
  const biz = i.business; const where = i.location || "your area"; const s = seed(biz + "msg");
  return {
    mainBrandMessage: `${i.product || "What you need"}, done right — for ${i.audience || "locals"} in ${where}, without ${i.painPoint || "the usual hassle"}.`,
    uniqueValueProposition: `The trusted local choice: fast, fair, and easy to try — proof over promises.`,
    slogans: [
      { context: "ads", text: `Stop settling. ${where}'s better choice.` },
      { context: "landing_page", text: `${i.product || "It"} — the way it should be.` },
      { context: "whatsapp", text: `Message us — sorted in minutes.` },
    ],
    emotionalTriggers: ["fear of wasting money", "urgency", "convenience", "status", "relief", "trust"],
    objections: [
      { objection: "It's too expensive.", response: "Priced for value — and cheaper than the cost of getting it wrong twice." },
      { objection: "I tried something like this before.", response: "This is different: proof up front, a low-risk first step, and real follow-up." },
      { objection: "I don't trust online offers.", response: "Local, reviewed, and a guarantee — talk to a real person on WhatsApp first." },
    ],
    wordsToUse: ["trusted", "local", "fast", "fair", "guaranteed", "today"],
    wordsToAvoid: ["cheap", "revolutionary", "world-class", "synergy", "unlimited (unless true)"],
    scores: { clarity: clamp(78 + (s % 12)), painMatch: clamp(a.scores.painIntensity - 4), emotionalStrength: clamp(74 + ((s >> 2) % 15)), trustStrength: clamp(68 + ((s >> 4) % 15)), objectionHandling: clamp(72 + ((s >> 6) % 12)), conversionPower: clamp(70 + ((s >> 8) % 15)) },
  };
}

// --------------------------------------------------------------- 3. Channels
export function buildChannelStrategy(i: StrategyInput) {
  const roi = compareChannels({ business: i.business, objective: i.offer ? "get orders" : "get leads", budgetGbp: i.monthlyBudgetGbp ?? 600, avgOrderValueGbp: i.priceGbp ?? 40 });
  const top3 = roi.channels.slice(0, 3).map((c) => ({
    channel: c.label, reason: c.owned ? "Owned — lowest CAC, builds the moat." : "Rented — fast reach where the ROI proves out.",
    bestContentTypes: c.owned ? ["direct message", "offer post", "review request"] : ["short video hook", "carousel", "offer ad"],
    timeToResults: c.owned ? "days" : "1–2 weeks", budgetRange: `£${Math.round((i.monthlyBudgetGbp ?? 600) * 0.2)}–£${Math.round((i.monthlyBudgetGbp ?? 600) * 0.35)}`,
    successIndicators: [`CAC ≤ £${c.predictedCacGbp}`, `ROI ≥ ${c.predictedRoi}×`],
  }));
  const avoid = roi.channels.filter((c) => c.predictedRoi < 1.5).slice(0, 2).map((c) => ({ channel: c.label, reason: `Predicted ROI ${c.predictedRoi}× — too low until the offer + page are proven.` }));
  return { recommendedChannels: top3, channelsToAvoid: avoid, doctrine: roi.doctrine };
}

// --------------------------------------------------------------- 4. 90-Day content
export function buildContentPlan(i: StrategyInput, channels: { channel: string }[]) {
  const pillars = [
    { name: "Pain Awareness", purpose: "Name the frustration", customerJourneyStage: "Awareness" },
    { name: "Proof & Trust", purpose: "Reviews + results", customerJourneyStage: "Trust Building" },
    { name: "Offer Education", purpose: "Why act now", customerJourneyStage: "Offer Education" },
    { name: "Objection Handling", purpose: "Remove hesitation", customerJourneyStage: "Objection Handling" },
    { name: "Local Authority", purpose: "Own the area", customerJourneyStage: "Conversion" },
  ];
  const ch = channels.map((c) => c.channel);
  const weeklyCalendar = Array.from({ length: 12 }, (_, w) => ({
    weekNumber: w + 1, theme: pillars[w % pillars.length].name,
    posts: ch.slice(0, 3).map((channel, d) => ({ day: ["Mon", "Wed", "Fri"][d], channel, topic: `${pillars[w % pillars.length].name} for ${i.audience || "locals"}`, objective: d === 2 ? "conversion" : "trust/awareness", journeyStage: pillars[w % pillars.length].customerJourneyStage, cta: d === 2 ? "Message us" : "Follow for more" })),
  }));
  return {
    durationDays: 90, contentPillars: pillars, weeklyCalendar,
    repurposing: "One core idea → 1 Reel/TikTok · 1 Facebook post · 1 LinkedIn post · 1 WhatsApp broadcast · 1 email · 1 local-SEO paragraph · 1 Google Business post.",
    metricsToTrack: ["reach", "profile/site clicks", "leads", "conversions", "cost per lead"],
  };
}

// --------------------------------------------------------------- 5. Funnel
export function buildFunnel(i: StrategyInput) {
  const stageDefs: [string, string, string][] = [
    ["cold_discovery", "Get seen by the right people", "TikTok/IG + local SEO"],
    ["interest", "Earn the click", "hook + offer"],
    ["lead_capture", "Capture intent", "landing page + WhatsApp"],
    ["nurture", "Stay useful", "email/WhatsApp sequence"],
    ["trust_build", "Prove it", "reviews + guarantee"],
    ["offer_push", "Reason to act now", "time-boxed offer"],
    ["conversion", "Close the sale", "WhatsApp/checkout"],
    ["post_purchase", "Deliver + delight", "confirmation + thank-you"],
    ["retention", "Bring them back", "loyalty + reorder reminder"],
    ["referral", "Turn buyers into sellers", "referral reward"],
  ];
  return {
    productName: i.product || "your offer", price: i.priceGbp ?? 40, currency: "GBP",
    stages: stageDefs.map(([stage, objective, channel]) => ({ stage, objective, channel, message: `${objective} — ${channel}`, cta: stage === "conversion" ? "Order/Book now" : "Next step", automation: "handled by the Automation Lab journeys", successMetric: stage === "conversion" ? "sales" : "stage progression" })),
    landingPageRequired: true,
    landingPageType: (i.offer && /whatsapp|order/i.test(i.offer)) ? "whatsapp_conversion" : "lead_capture",
    note: "The Funnel Architect always requires a landing page — it triggers the AI Landing Page Creation Agent (Conversion Architect).",
  };
}

// --------------------------------------------------------------- 6. Paid ads (risk-gated)
export function buildPaidAdsStrategy(i: StrategyInput) {
  const readiness = campaignReadiness(i.readiness || { hasOffer: Boolean(i.offer), offerStrength: i.offer ? 80 : 40, hasWebsite: true, hasCreatives: true, hasTargeting: Boolean(i.audience), hasTracking: false, hasFollowUp: true });
  const budget = i.monthlyBudgetGbp ?? 600;
  if (readiness.verdict !== "launch") {
    return { ready: false, readiness, message: "Do not spend yet. Fix these first:", fixFirst: readiness.blockers, recommendedPlatform: null };
  }
  return {
    ready: true, readiness,
    recommendedPlatform: budget >= 800 ? "Meta (broad + retargeting)" : "Meta retargeting + Google Search (high-intent)",
    reason: "Start where intent is highest for the budget; scale only what proves out.",
    awarenessCampaign: { objective: "reach + video views", audience: i.audience || "local lookalikes", creativeFocus: "hook-first short video", budgetPercentage: 30 },
    conversionCampaign: { objective: "leads/orders", audience: "warm + high-intent", creativeFocus: "offer + proof", budgetPercentage: 45 },
    retargetingPlan: { audience: "site + WhatsApp touchers", message: "come back + honest urgency", cta: "Order now", budgetPercentage: 25 },
    stopLossRules: [
      { condition: "spend > 25% budget and 0 leads", action: "pause + fix landing page" },
      { condition: "clicks high, leads low", action: "fix landing page / offer" },
      { condition: "leads high, sales low", action: "fix follow-up" },
      { condition: "CPL too high", action: "test new audience or offer" },
      { condition: "CTR low", action: "fix creative + hook" },
    ],
    realisticExpectations: ["First results in days, not hours", "Winners emerge after ~48h of data", "Owned channels still beat ads on CAC"],
  };
}

// --------------------------------------------------------------- 7. Battle plan (chain)
export type BattlePlan = {
  business: string; mainCustomer: string; corePain: string; uniqueValueProposition: string; mainMessage: string;
  topChannels: string[]; contentSummary: string; funnelOverview: string; landingPageRequirement: string;
  paidAdsApproach: string; topKpis: string[];
  thirtyDayActionPlan: { week: number; focus: string; actions: string[]; successMetric: string }[];
};

export function buildBattlePlan(i: StrategyInput) {
  const avatar = buildCustomerAvatar(i);
  const messaging = buildMessaging(i, avatar);
  const channels = buildChannelStrategy(i);
  const content = buildContentPlan(i, channels.recommendedChannels);
  const funnel = buildFunnel(i);
  const paidAds = buildPaidAdsStrategy(i);
  const topChannels = channels.recommendedChannels.map((c) => c.channel);

  const battlePlan: BattlePlan = {
    business: i.business, mainCustomer: avatar.summaryParagraph.split(".")[0], corePain: i.painPoint || "wasted spend / no follow-up",
    uniqueValueProposition: messaging.uniqueValueProposition, mainMessage: messaging.mainBrandMessage,
    topChannels, contentSummary: `90-day plan across ${topChannels.join(", ")}; ${content.contentPillars.length} pillars, repurposed 7 ways.`,
    funnelOverview: `10-stage funnel (discovery → referral); landing page required (${funnel.landingPageType}).`,
    landingPageRequirement: `Build a ${funnel.landingPageType} page via the Conversion Architect before any paid spend.`,
    paidAdsApproach: paidAds.ready ? `Ready — ${paidAds.recommendedPlatform}, with stop-loss rules.` : `Not ready — fix ${paidAds.fixFirst?.length || 0} blocker(s) before spending; win on owned channels first.`,
    topKpis: ["cost per customer (CAC)", "revenue generated + recovered", "conversion rate"],
    thirtyDayActionPlan: [
      { week: 1, focus: "Foundation", actions: ["Lock the offer", "Build the landing page", "Set up WhatsApp + tracking"], successMetric: "page live + tracking firing" },
      { week: 2, focus: "Owned channels", actions: ["Launch WhatsApp/email to existing list", "Start the 90-day content", "Ask for reviews"], successMetric: "first owned-channel leads" },
      { week: 3, focus: "Test paid (if ready)", actions: paidAds.ready ? ["Launch small conversion + retargeting", "Kill losers at 48h"] : ["Fix the paid-ads blockers", "Keep compounding owned channels"], successMetric: "CAC within target" },
      { week: 4, focus: "Scale + recover", actions: ["Scale the winner", "Run a database resurrection", "Set referral reward"], successMetric: "revenue up, CAC down" },
    ],
  };

  return { avatar, messaging, channels, content, funnel, paidAds, battlePlan };
}
