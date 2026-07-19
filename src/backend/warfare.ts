// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// M-36 Autonomous Campaign Warfare Engine — the results-driven ecosystem.
//
// Doctrine (docs/ai-os/08 Autonomous Campaign Engine; spec STEPS 1–11):
// the business answers only six questions — what you sell, who you want,
// what result, budget, location, offer — and the OS designs the ENTIRE
// campaign ecosystem, not just an ad. Every stage is deterministic so it
// works in zero-config demo mode and stays specific to the business:
//
//   STEP 1  Business analysis            → inferred vertical + margin/demand read
//   STEP 2  Objective engine             → highest-probability objective
//   STEP 3  Customer psychology engine   → triggers, fears, aspirations, local slang
//   STEP 4  Offer creation engine        → scored offer archetypes (margin-guarded)
//   STEP 5  Visual creation engine       → attention-trigger concepts per platform
//   STEP 6  Copywriting engine           → AIDA + PAS variants, hooks, CTA
//   STEP 7  Hashtag engine               → classed + scored
//   STEP 8  Multi-platform adaptation    → one campaign → many native payloads
//   STEP 9  Landing page generation      → objective-specific page spec
//   STEP 10 Distribution engine          → where/when/how-often (frequency-governed)
//   STEP 11 (learning loop)              → measured post-launch, never faked here
//
// Plus the flagship AI Campaign Score™ (8 dimensions) — a PROBABILITY
// estimate derived from the inputs and labelled as such. It never promises
// customers; the causal-measurement honesty safeguard forbids that.

// Frequency ceiling shared with the M-35 amplification engine — the OS never
// plans more than this many touches per person per 7 days.
const MAX_TOUCHES_PER_7D = 5;

export type WarfareInput = {
  product: string; // what you sell
  audience: string; // who you want
  result: string; // what result you want
  budget: number; // total campaign budget (major currency unit)
  location: string; // where
  offer?: string; // promotion/offer (optional — the engine proposes if blank)
  currency?: string; // ISO code for money surfaces (default GBP)
  autonomy?: 1 | 2 | 3; // requested autonomy level (default 1)
};

type Vertical =
  | "food" | "education" | "ecommerce" | "services" | "beauty"
  | "fitness" | "property" | "b2b" | "generic";

type PsychProfile = {
  triggers: string[];
  fears: string[];
  aspirations: string[];
  motivations: string[];
  slang: string[]; // colloquial, scroll-stopping local phrasing
};

// Deterministic vertical psychology — mirrors the spec's worked examples
// (food: hunger/convenience/speed/family/cravings/late-night; education:
// fear of failure/grades/future success/parental guilt/confidence).
const PSYCH: Record<Vertical, PsychProfile> = {
  food: {
    triggers: ["hunger", "convenience", "speed", "family", "cravings", "late-night"],
    fears: ["cold food", "long waits", "overpaying the delivery apps", "a ruined night in"],
    aspirations: ["a treat that feels earned", "feeding the family well", "the local favourite"],
    motivations: ["order tonight", "beat the wait", "skip the app markup"],
    slang: ["proper feed", "sorted", "on its way", "bangin'"],
  },
  education: {
    triggers: ["fear of failure", "grades", "future success", "parental guilt", "confidence"],
    fears: ["falling behind", "wasted potential", "exam panic", "the wrong school"],
    aspirations: ["top grades", "a confident child", "a secured future"],
    motivations: ["book a free assessment", "start before term", "close the gap now"],
    slang: ["catch up fast", "smash the exams", "back on track"],
  },
  ecommerce: {
    triggers: ["scarcity", "novelty", "social proof", "instant gratification", "self-reward"],
    fears: ["missing the drop", "it selling out", "buying the fake"],
    aspirations: ["the look everyone asks about", "quality that lasts", "first to have it"],
    motivations: ["shop the drop", "claim the bundle", "checkout before it's gone"],
    slang: ["cop it", "the one", "limited", "restocked"],
  },
  services: {
    triggers: ["trust", "urgency", "reliability", "local reputation", "peace of mind"],
    fears: ["being ripped off", "a botched job", "no-shows", "hidden costs"],
    aspirations: ["it done right first time", "a firm you can call again", "fixed today"],
    motivations: ["get a free quote", "book same-week", "message on WhatsApp"],
    slang: ["sorted properly", "no hassle", "on it", "trusted local"],
  },
  beauty: {
    triggers: ["self-image", "confidence", "occasion", "transformation", "pampering"],
    fears: ["looking tired", "a bad appointment", "missing the booking window"],
    aspirations: ["glow for the event", "the before/after", "feeling like yourself again"],
    motivations: ["book your slot", "claim first-visit price", "reserve for the weekend"],
    slang: ["glow up", "booked & blessed", "fresh", "the look"],
  },
  fitness: {
    triggers: ["transformation", "identity", "accountability", "energy", "before/after"],
    fears: ["giving up again", "wasting the membership", "starting alone"],
    aspirations: ["the after photo", "energy back", "a body that keeps up"],
    motivations: ["claim your free session", "start the 6-week plan", "join the challenge"],
    slang: ["let's go", "no excuses", "results", "transform"],
  },
  property: {
    triggers: ["scarcity", "status", "urgency", "security", "opportunity"],
    fears: ["missing the listing", "overpaying", "a slow sale", "chain collapse"],
    aspirations: ["the move up", "a sold sign fast", "the right buyer"],
    motivations: ["book a viewing", "get a free valuation", "register for early access"],
    slang: ["just listed", "won't last", "move-in ready", "sold"],
  },
  b2b: {
    triggers: ["ROI", "authority", "risk reduction", "efficiency", "competitive edge"],
    fears: ["falling behind rivals", "wasted spend", "a bad vendor", "slow growth"],
    aspirations: ["predictable pipeline", "provable ROI", "market leadership"],
    motivations: ["book a demo", "get the audit", "start the pilot"],
    slang: ["scale it", "the edge", "proven", "pipeline"],
  },
  generic: {
    triggers: ["curiosity", "value", "trust", "urgency", "social proof"],
    fears: ["missing out", "wasting money", "picking the wrong option"],
    aspirations: ["a great result", "money well spent", "the local go-to"],
    motivations: ["message now", "claim the offer", "book today"],
    slang: ["sorted", "the one", "trusted", "don't miss it"],
  },
};

const VERTICAL_KEYWORDS: [Vertical, RegExp][] = [
  ["food", /\b(food|restaurant|takeaway|cafe|café|grill|pizza|kitchen|catering|bakery|deli|meal|delivery)\b/i],
  ["education", /\b(tutor|tuition|school|course|class|learn|exam|gcse|a-level|education|academy|coaching lesson)\b/i],
  ["ecommerce", /\b(shop|store|ecommerce|e-commerce|product|clothing|fashion|jewel|cosmetic|retail|drop|merch)\b/i],
  ["beauty", /\b(salon|beauty|hair|nails|barber|spa|lashes|aesthetic|makeup|skincare)\b/i],
  ["fitness", /\b(gym|fitness|personal train|pt|coach|bootcamp|yoga|pilates|workout|weight loss)\b/i],
  ["property", /\b(property|estate|letting|rental|real estate|house|flat|apartment|mortgage)\b/i],
  ["b2b", /\b(b2b|saas|software|agency|consult|wholesale|supplier|enterprise|manufactur)\b/i],
  ["services", /\b(plumb|electric|clean|repair|garage|builder|roofing|dentist|clinic|legal|accountant|service)\b/i],
];

function inferVertical(product: string): Vertical {
  for (const [v, re] of VERTICAL_KEYWORDS) if (re.test(product)) return v;
  return "generic";
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

// A tiny deterministic hash so demo numbers vary by input but never randomly.
function seed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h);
}

const URGENCY_RE = /\b(today|now|last|limited|ends|tonight|48|24|hours?|weekend|only|final|hurry|deadline|this week)\b/i;
const SPECIFIC_AUDIENCE_RE = /\b(within|near|mile|local|aged|\d|parents|women|men|students|families|owners|managers)\b/i;

// ---------------------------------------------------------------------------
// STEP 2 — Objective engine
// ---------------------------------------------------------------------------
type Objective = { objective: string; why: string; primaryChannel: string };

function selectObjective(result: string, v: Vertical): Objective {
  const r = result.toLowerCase();
  const has = (re: RegExp) => re.test(r);
  if (has(/\b(message|whatsapp|enquir|inquir|chat|dm)\b/))
    return { objective: "Get WhatsApp messages", why: "The result names conversation — the fastest, highest-intent capture channel.", primaryChannel: "WhatsApp" };
  if (has(/\b(book|appointment|reservation|slot|viewing|demo|assessment)\b/))
    return { objective: "Get bookings", why: "A booking is the committed action closest to revenue for this objective.", primaryChannel: "Landing page + WhatsApp" };
  if (has(/\b(order|sale|buy|purchase|checkout|revenue)\b/))
    return { objective: "Get orders", why: "The result is transactional — drive straight to the order/checkout action.", primaryChannel: v === "food" ? "WhatsApp + Google Business" : "Landing page" };
  if (has(/\b(lead|sign ?up|register|download|subscribe|list)\b/))
    return { objective: "Get leads", why: "Capture intent now, convert on the follow-up sequence.", primaryChannel: "Landing page + Email/SMS" };
  if (has(/\b(reactivat|comeback|repeat|retain|loyal|win.?back|old customer)\b/))
    return { objective: "Reactivate old customers", why: "Cheapest customers to win are the ones who already bought — sequence them first.", primaryChannel: "Email/SMS + WhatsApp" };
  const fallback: Record<Vertical, string> = {
    food: "Get orders", education: "Get bookings", ecommerce: "Get orders",
    services: "Get WhatsApp messages", beauty: "Get bookings", fitness: "Get leads",
    property: "Get bookings", b2b: "Get leads", generic: "Get leads",
  };
  return { objective: fallback[v], why: "No explicit action in the brief — defaulted to the highest-probability objective for this vertical.", primaryChannel: "Landing page + WhatsApp" };
}

// ---------------------------------------------------------------------------
// STEP 4 — Offer engine (margin-guarded, scored)
// ---------------------------------------------------------------------------
export type ScoredOffer = { archetype: string; offer: string; score: number; marginFlag: boolean; note: string };

function buildOffers(input: WarfareInput, v: Vertical): ScoredOffer[] {
  const stated = (input.offer || "").trim();
  const base: { archetype: string; offer: string; urgency: number; marginRisk: number }[] = [
    { archetype: "First-time buyer", offer: `First-order deal for new ${input.audience || "customers"} — a low-risk reason to try you once.`, urgency: 60, marginRisk: 35 },
    { archetype: "Urgency / limited-time", offer: `Time-boxed promotion this week only — real scarcity, honestly stated.`, urgency: 90, marginRisk: 40 },
    { archetype: "Bundle", offer: `Bundle that raises average order value instead of discounting the hero item.`, urgency: 45, marginRisk: 15 },
    { archetype: "Referral", offer: `Refer-a-friend reward — both sides win, reach compounds through consented shares.`, urgency: 55, marginRisk: 20 },
    { archetype: "Comeback / loyalty", offer: `Win-back reward for past customers — cheapest revenue you can buy.`, urgency: 50, marginRisk: 25 },
  ];
  if (stated) {
    base.unshift({ archetype: "Your stated offer", offer: stated, urgency: URGENCY_RE.test(stated) ? 85 : 45, marginRisk: /free|50%|half/i.test(stated) ? 70 : 35 });
  }
  return base.map((b) => {
    const marginFlag = b.marginRisk >= 60; // deep-discount → margin-floor risk
    const score = clamp(b.urgency * 0.5 + (100 - b.marginRisk) * 0.35 + 15);
    return {
      archetype: b.archetype,
      offer: b.offer,
      score,
      marginFlag,
      note: marginFlag
        ? "⚠ Margin-floor risk: this discount may breach the 100% margin floor. Win on a cheaper cost base (caching, reuse, referral reach), not a deeper cut."
        : "Within margin discipline — urgency without cutting into the floor.",
    };
  }).sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// STEP 5 — Visual concepts (attention triggers, platform-matched)
// ---------------------------------------------------------------------------
export type VisualConcept = { platform: string; concept: string; attentionTriggers: string[] };

const ATTENTION = ["human face + eye contact", "motion / the reveal", "high contrast", "before/after", "scarcity cue", "authority signal"];

function buildVisuals(input: WarfareInput, v: Vertical): VisualConcept[] {
  const hero = v === "food" ? "the hero dish, close-up, steam and gloss"
    : v === "beauty" || v === "fitness" ? "an authentic before/after of a real local customer (with written release)"
    : v === "property" ? "the standout room, wide + warm light"
    : v === "ecommerce" ? "the product in-hand, lifestyle context"
    : "a real customer's face mid-result, natural light";
  return [
    { platform: "TikTok / Reels", concept: `9:16 native: ${hero}. First 0.5s IS the hook — no logo intro. On-screen text ≤ 5 words. Sound-on, trend-aware.`, attentionTriggers: [ATTENTION[1], ATTENTION[0], ATTENTION[3]] },
    { platform: "Instagram / Facebook feed", concept: `4:5 stopping frame: ${hero}. One clear focal point, offer badge top-right, brand colour rim.`, attentionTriggers: [ATTENTION[0], ATTENTION[2], ATTENTION[4]] },
    { platform: "Stories", concept: `Full-bleed vertical, tappable sticker over the offer, urgency countdown.`, attentionTriggers: [ATTENTION[4], ATTENTION[1]] },
    { platform: "Carousel", concept: `Slide 1 hook → slides 2–4 proof/benefits → slide 5 CTA. Swipe curiosity gap on slide 1.`, attentionTriggers: [ATTENTION[3], ATTENTION[5]] },
    { platform: "YouTube thumbnail", concept: `Bold face + ≤ 4-word overlay, colour that fights the feed. Emotion legible at thumb size.`, attentionTriggers: [ATTENTION[0], ATTENTION[2]] },
  ];
}

// ---------------------------------------------------------------------------
// STEP 6 — Copywriting engine (AIDA + PAS)
// ---------------------------------------------------------------------------
export type CopyPack = { headline: string; aida: string; pas: string; hooks: string[]; cta: string };

function buildCopy(input: WarfareInput, v: Vertical, p: PsychProfile, obj: Objective): CopyPack {
  const who = input.audience || "local customers";
  const where = input.location || "your area";
  const cta = p.motivations[0].replace(/^./, (c) => c.toUpperCase());
  return {
    headline: `${p.aspirations[0].replace(/^./, (c) => c.toUpperCase())} — for ${who} in ${where}.`,
    aida: `Attention: ${p.slang[0]} — ${p.triggers[0]} hits first.\nInterest: made for ${who} who care about ${p.triggers[1]}.\nDesire: picture ${p.aspirations[0]} without ${p.fears[0]}.\nAction: ${cta}.`,
    pas: `Problem: ${p.fears[0]}.\nAgitate: and every day it costs you ${p.fears[1]}.\nSolve: ${input.product} — ${p.aspirations[0]}. ${cta}.`,
    hooks: [
      `"${p.slang[0]}." — ${p.triggers[0]} in three words.`,
      `Stop ${p.fears[0]}. Here's how ${who} in ${where} fixed it.`,
      `${p.aspirations[0]} — without ${p.fears[0]}.`,
    ],
    cta,
  };
}

// ---------------------------------------------------------------------------
// STEP 7 — Hashtag engine (classed + scored)
// ---------------------------------------------------------------------------
export type ScoredHashtag = { tag: string; class: string; score: number };

function buildHashtags(input: WarfareInput, v: Vertical): ScoredHashtag[] {
  const loc = (input.location || "local").split(/[ ,]/)[0].replace(/[^a-z0-9]/gi, "").toLowerCase() || "local";
  const niche = v === "generic" ? "smallbusiness" : v;
  const s = seed(input.product + input.location);
  const raw: [string, string][] = [
    [`#${loc}`, "local"], [`#${loc}${niche}`, "local-niche"], [`#${niche}`, "niche"],
    [`#supportlocal`, "community"], [`#${loc}business`, "local"], [`#${niche}life`, "niche"],
    [`#deal`, "conversion"], [`#${loc}deals`, "conversion"], [`#trending`, "viral"], [`#fyp`, "viral"],
  ];
  return raw.map(([tag, cls], i) => {
    // conversion/local classes score highest for SMB intent; viral is reach-only.
    const classWeight = cls.includes("local") ? 82 : cls === "conversion" ? 88 : cls === "niche" || cls === "local-niche" ? 74 : cls === "community" ? 68 : 55;
    return { tag, class: cls, score: clamp(classWeight + ((s >> i) % 12) - 6) };
  }).sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// STEP 8 — Multi-platform adaptation (one campaign → many native payloads)
// ---------------------------------------------------------------------------
export type Payload = { channel: string; format: string; asset: string };

function buildPayloads(input: WarfareInput, copy: CopyPack, obj: Objective): Payload[] {
  const cta = copy.cta;
  return [
    { channel: "Facebook", format: "Feed ad", asset: `${copy.headline} ${cta} →` },
    { channel: "Instagram", format: "Feed + Stories", asset: `${copy.hooks[0]} ${cta}.` },
    { channel: "TikTok", format: "9:16 short", asset: `Hook: ${copy.hooks[1]}` },
    { channel: "LinkedIn", format: "Post", asset: `${copy.pas.split("\n")[2]}` },
    { channel: "WhatsApp", format: "Broadcast (consented)", asset: `${copy.hooks[2]} Reply to ${cta.toLowerCase()}.` },
    { channel: "Google Business", format: "Offer post", asset: `${copy.headline}` },
    { channel: "Email", format: "Transactional-grade broadcast", asset: `Subject: ${copy.hooks[0]}` },
    { channel: "SMS", format: "160-char", asset: `${copy.cta} — ${input.location || "local"}. Reply STOP to opt out.` },
    { channel: "Landing page", format: "Objective page", asset: `${obj.objective} page — see spec.` },
    { channel: "Blog article", format: "SEO long-form", asset: `"How ${input.audience || "locals"} in ${input.location || "your area"} get ${copy.cta.toLowerCase()}"` },
    { channel: "SEO page", format: "GEO/AI-cited page", asset: `Answer-first page targeting the buying query.` },
    { channel: "Push notification", format: "Re-engagement", asset: `${copy.hooks[2]}` },
  ];
}

// ---------------------------------------------------------------------------
// STEP 9 — Landing page spec
// ---------------------------------------------------------------------------
function buildLandingSpec(input: WarfareInput, obj: Objective, offer: ScoredOffer, p: PsychProfile) {
  return {
    objective: obj.objective,
    sections: [
      `Emotional headline — speaks to "${p.aspirations[0]}" and away from "${p.fears[0]}"`,
      `Sub-headline naming the audience: ${input.audience || "local customers"} in ${input.location || "your area"}`,
      `The offer, stated with honest urgency: ${offer.offer}`,
      "Three benefit blocks (outcome, not features)",
      "Proof: reviews / before-after / local testimonials",
      "FAQ that dissolves the top 3 objections",
      "Trust badges + guarantees",
      `Primary CTA: ${obj.primaryChannel} (WhatsApp button where relevant)`,
      "Lead form (minimum fields) + pixels/UTM for measurement",
      "Map / hours for local intent",
    ],
    conversionNote: "One objective, one primary CTA repeated. Every element serves the single action or it is cut.",
  };
}

// ---------------------------------------------------------------------------
// STEP 10 — Distribution engine (frequency-governed)
// ---------------------------------------------------------------------------
function buildDistribution(input: WarfareInput, obj: Objective, payloads: Payload[]) {
  const budget = Math.max(0, input.budget || 0);
  // Channel priority: primary objective channel first, then supporting reach.
  const priority = [obj.primaryChannel, "TikTok", "Instagram", "Facebook", "WhatsApp", "Google Business"];
  const split = [0.4, 0.2, 0.15, 0.15, 0.1]; // test-heavy on the primary
  const labels = ["Primary (objective channel)", "Reach A", "Reach B", "Retargeting", "Follow-up"];
  return {
    where: priority.slice(0, 5),
    when: "Launch on the audience's peak window (per-vertical); front-load budget on the objective channel, hold ~15% for the winner.",
    frequencyCap: `Max ${MAX_TOUCHES_PER_7D} touches per person / 7 days — hard cap. Opt-out or conversion ends contact immediately.`,
    sequence: "Wave 1 broad test → kill losers at 48h → scale the winner → retarget funnel-touchers only → consented follow-up.",
    budgetSplit: labels.map((label, i) => ({ label, amount: Math.round(budget * (split[i] || 0)), currency: input.currency || "GBP" })),
    note: "Retargeting is limited to people who touched the tenant's own funnel — no cross-web surveillance (M-35 doctrine).",
  };
}

// ---------------------------------------------------------------------------
// AI Campaign Score™ — 8-dimension probability estimate (labelled honestly)
// ---------------------------------------------------------------------------
export type CampaignScore = {
  composite: number;
  verdict: string;
  dimensions: { name: string; score: number; driver: string }[];
  honesty: string;
};

function scoreCampaign(input: WarfareInput, v: Vertical, offer: ScoredOffer, obj: Objective): CampaignScore {
  const hasUrgency = URGENCY_RE.test(input.offer || "") || offer.archetype.includes("Urgency");
  const specificAudience = SPECIFIC_AUDIENCE_RE.test(input.audience || "") || (input.audience || "").length > 20;
  const specificLocation = (input.location || "").trim().length > 2;
  const budget = Math.max(0, input.budget || 0);
  const budgetOk = budget >= 100;
  const channels = 5;
  const s = seed(input.product + input.audience + input.location);
  const jitter = (i: number) => ((s >> i) % 9) - 4;

  const audienceMatch = clamp((specificAudience ? 82 : 55) + (specificLocation ? 8 : 0) + jitter(1));
  const emotional = clamp((v === "generic" ? 62 : 78) + jitter(2));
  const attention = clamp(72 + (v === "food" || v === "beauty" || v === "fitness" ? 8 : 0) + jitter(3));
  const trust = clamp((specificLocation ? 70 : 55) + (offer.marginFlag ? -6 : 6) + jitter(4));
  const urgency = clamp((hasUrgency ? 86 : 52) + jitter(5));
  const scalability = clamp((budgetOk ? 74 : 48) + (channels >= 5 ? 8 : 0) + jitter(6));
  const conversion = clamp(audienceMatch * 0.3 + urgency * 0.25 + trust * 0.25 + emotional * 0.2);
  const revenue = clamp(conversion * 0.55 + scalability * 0.3 + (offer.marginFlag ? 40 : 62) * 0.15);

  const dimensions = [
    { name: "Conversion Probability", score: conversion, driver: specificAudience ? "audience is specific" : "audience is broad — tighten it" },
    { name: "Revenue Probability", score: revenue, driver: offer.marginFlag ? "margin risk drags revenue quality" : "offer protects margin" },
    { name: "Audience Match", score: audienceMatch, driver: specificLocation ? "location is set" : "no location — add one" },
    { name: "Emotional Strength", score: emotional, driver: "psychology profile mapped to vertical" },
    { name: "Attention Score", score: attention, driver: "hook-first visual concepts" },
    { name: "Trust Score", score: trust, driver: specificLocation ? "local specificity builds trust" : "add proof + locality" },
    { name: "Urgency Score", score: urgency, driver: hasUrgency ? "real time-box present" : "no urgency — add an honest deadline" },
    { name: "Scalability Score", score: scalability, driver: budgetOk ? "budget supports scaling the winner" : "budget thin for multi-channel scale" },
  ];
  const composite = clamp(dimensions.reduce((a, d) => a + d.score, 0) / dimensions.length);
  const verdict = composite >= 80 ? "High probability of generating customers"
    : composite >= 65 ? "Solid — a clear, fixable path to customers"
    : composite >= 50 ? "Workable, but tighten the flagged dimensions first"
    : "Rework the flagged dimensions before spending";
  return {
    composite,
    verdict,
    dimensions,
    honesty: "AI Campaign Score™ is a probability ESTIMATE from your inputs, not a guarantee. Real performance is measured after launch (STEP 11 learning loop) — the OS never claims attribution it cannot prove.",
  };
}

// ---------------------------------------------------------------------------
// Autonomy levels — what the OS runs at each level
// ---------------------------------------------------------------------------
function autonomyPlan(level: 1 | 2 | 3) {
  const levels = {
    1: { name: "Assisted", runs: "OS designs everything; you approve every asset and the launch.", youApprove: "Everything" },
    2: { name: "Semi-Autonomous", runs: "OS creates and schedules the full campaign automatically; you approve the launch.", youApprove: "Launch only" },
    3: { name: "Fully Autonomous", runs: "OS creates, launches, pauses, reallocates budget, swaps creatives, retargets funnel-touchers and runs consented follow-up — inside the margin floor and frequency cap.", youApprove: "Nothing (guardrails enforce the floor + frequency cap)" },
  } as const;
  return { level, ...levels[level] };
}

// ---------------------------------------------------------------------------
// Orchestrator — the single call that designs the whole ecosystem
// ---------------------------------------------------------------------------
export type CampaignEcosystem = {
  input: WarfareInput;
  vertical: Vertical;
  businessAnalysis: { vertical: Vertical; read: string; demandSignal: string };
  objective: Objective;
  psychology: PsychProfile;
  offers: ScoredOffer[];
  recommendedOffer: ScoredOffer;
  visuals: VisualConcept[];
  copy: CopyPack;
  hashtags: ScoredHashtag[];
  payloads: Payload[];
  landingPage: ReturnType<typeof buildLandingSpec>;
  distribution: ReturnType<typeof buildDistribution>;
  campaignScore: CampaignScore;
  autonomy: ReturnType<typeof autonomyPlan>;
};

export function designCampaign(input: WarfareInput): CampaignEcosystem {
  const v = inferVertical(input.product || "");
  const p = PSYCH[v];
  const objective = selectObjective(input.result || "", v);
  const offers = buildOffers(input, v);
  const recommendedOffer = offers[0];
  const copy = buildCopy(input, v, p, objective);
  const hashtags = buildHashtags(input, v);
  const payloads = buildPayloads(input, copy, objective);
  const landingPage = buildLandingSpec(input, objective, recommendedOffer, p);
  const distribution = buildDistribution(input, objective, payloads);
  const campaignScore = scoreCampaign(input, v, recommendedOffer, objective);
  const autonomy = autonomyPlan(input.autonomy || 1);

  return {
    input,
    vertical: v,
    businessAnalysis: {
      vertical: v,
      read: `Detected a ${v} business. Psychology, offers and creatives are tuned to that vertical; the objective is chosen for highest probability of the result you named.`,
      demandSignal: SPECIFIC_AUDIENCE_RE.test(input.audience || "")
        ? "Audience is specific enough to target tightly — good."
        : "Audience is broad — the engine defaulted to local intent; tightening it will lift Conversion Probability.",
    },
    objective,
    psychology: p,
    offers,
    recommendedOffer,
    visuals: buildVisuals(input, v),
    copy,
    hashtags,
    payloads,
    landingPage,
    distribution,
    campaignScore,
    autonomy,
  };
}
