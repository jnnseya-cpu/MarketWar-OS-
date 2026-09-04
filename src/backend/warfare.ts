// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

import { writeCopy } from "@/backend/copywriter";

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
// Plus a readiness check on the brief: which INPUTS are present, and nothing
// more. It does not forecast conversion, revenue or "probability" — those
// cannot be known before a campaign runs, and a number shaped like a forecast
// will be read as one. Performance is measured after launch, from the
// customer's own traffic.

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
  /**
   * A real end date for the offer, in the customer's own words.
   *
   * THE FAULT THIS FIELD EXISTS TO END. "Deadline is real" was scored from
   * whether the OFFER text happened to contain a word like "today" or "ends" —
   * and no field anywhere asked for a deadline. So the readiness check scored 0
   * and the verdict said "Fill in: deadline is real", pointing at a box that did
   * not exist. Being told to supply something with nowhere to supply it is the
   * platform blaming somebody for its own omission.
   *
   * Optional, and it must stay optional: the driver text says "leave it out
   * rather than inventing one — a fake deadline is noticed", and that advice is
   * right. A check may report an input as ABSENT; it may not demand one nobody
   * was offered.
   */
  deadline?: string;
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
// STEP 5 — Visual concepts (attention triggers, platform-matched, localised)
// ---------------------------------------------------------------------------
export type VisualConcept = { platform: string; concept: string; attentionTriggers: string[]; localisation: string };

// The 12 human-attention triggers the visual AI works with (spec STEP 5).
const TRIGGER = {
  faces: "human faces", emotions: "visible emotion", eyeContact: "direct eye contact",
  movement: "movement / the reveal", contrast: "high contrast", luxury: "luxury cues",
  urgency: "urgency cue (countdown / scarcity badge)", foodCloseup: "food close-up",
  beforeAfter: "before / after", scarcity: "scarcity cue", authority: "authority signal",
  crowd: "crowd psychology (people already buying)",
} as const;

// Per-vertical emphasis — which of the 12 triggers this vertical leans on hardest.
const VERTICAL_TRIGGERS: Record<Vertical, string[]> = {
  food: [TRIGGER.foodCloseup, TRIGGER.emotions, TRIGGER.crowd, TRIGGER.urgency],
  education: [TRIGGER.faces, TRIGGER.emotions, TRIGGER.authority, TRIGGER.beforeAfter],
  ecommerce: [TRIGGER.contrast, TRIGGER.scarcity, TRIGGER.luxury, TRIGGER.crowd],
  services: [TRIGGER.authority, TRIGGER.beforeAfter, TRIGGER.faces, TRIGGER.urgency],
  beauty: [TRIGGER.beforeAfter, TRIGGER.faces, TRIGGER.luxury, TRIGGER.emotions],
  fitness: [TRIGGER.beforeAfter, TRIGGER.movement, TRIGGER.emotions, TRIGGER.crowd],
  property: [TRIGGER.luxury, TRIGGER.contrast, TRIGGER.scarcity, TRIGGER.authority],
  b2b: [TRIGGER.authority, TRIGGER.contrast, TRIGGER.faces, TRIGGER.crowd],
  generic: [TRIGGER.faces, TRIGGER.emotions, TRIGGER.contrast, TRIGGER.scarcity],
};

// Localisation directive — the visual AI adapts by country / culture / weather /
// language / local trends (spec STEP 5). Derived from the location string.
function localisationNote(input: WarfareInput): string {
  const loc = input.location || "the local market";
  const lang = input.currency ? "" : "";
  return `Adapt to ${loc}: local faces/ethnicity that mirror the audience, culturally-resonant setting, season/weather-appropriate styling, on-image copy in the local language, and current local trends. ${lang}`.trim();
}

function buildVisuals(input: WarfareInput, v: Vertical): VisualConcept[] {
  const t = VERTICAL_TRIGGERS[v];
  const loc = localisationNote(input);
  const hero = v === "food" ? "the hero dish, close-up, steam and gloss"
    : v === "beauty" || v === "fitness" ? "an authentic before/after of a real local customer (with written release)"
    : v === "property" ? "the standout room, wide + warm light"
    : v === "ecommerce" ? "the product in-hand, lifestyle context"
    : v === "b2b" ? "a confident operator at work, clean composition"
    : "a real customer's face mid-result, natural light";
  return [
    { platform: "TikTok / Reels", concept: `9:16 native: ${hero}. First 0.5s IS the hook — no logo intro. On-screen text ≤ 5 words. Sound-on, trend-aware.`, attentionTriggers: [TRIGGER.movement, t[0], t[1]], localisation: loc },
    { platform: "Instagram / Facebook feed", concept: `4:5 stopping frame: ${hero}. One clear focal point, offer badge top-right, brand colour rim.`, attentionTriggers: [t[0], TRIGGER.contrast, t[2] || TRIGGER.scarcity], localisation: loc },
    { platform: "Stories", concept: `Full-bleed vertical, tappable sticker over the offer, urgency countdown.`, attentionTriggers: [TRIGGER.urgency, TRIGGER.movement], localisation: loc },
    { platform: "LinkedIn", concept: `Clean, credible 1:1 or 4:5 — no clickbait. Authority and proof lead; muted brand palette.`, attentionTriggers: [TRIGGER.authority, TRIGGER.faces, TRIGGER.contrast], localisation: loc },
    { platform: "Carousel", concept: `Slide 1 hook → slides 2–4 proof/benefits → slide 5 CTA. Swipe curiosity gap on slide 1.`, attentionTriggers: [TRIGGER.beforeAfter, TRIGGER.authority], localisation: loc },
    { platform: "YouTube thumbnail", concept: `Bold face + ≤ 4-word overlay, colour that fights the feed. Emotion legible at thumb size.`, attentionTriggers: [TRIGGER.faces, TRIGGER.emotions, TRIGGER.contrast], localisation: loc },
  ];
}

// ---------------------------------------------------------------------------
// STEP 6 — Copywriting engine (AIDA + PAS)
// ---------------------------------------------------------------------------
export type CopyPack = {
  headline: string; aida: string; pas: string; hooks: string[]; cta: string;
  emojis: string[]; urgencyWording: string; trustWording: string; persuasionModels: string[];
};

// Emoji sets keyed to vertical — used sparingly, never spam (deliverability +
// LinkedIn stay clean; the payload builder strips them where inappropriate).
const VERTICAL_EMOJI: Record<Vertical, string[]> = {
  food: ["🔥", "🍽️", "🚗", "💨", "🎉"], education: ["📚", "🎯", "✅", "🚀"],
  ecommerce: ["✨", "🛒", "⚡", "🔥"], services: ["✅", "🛠️", "📞", "⭐"],
  beauty: ["✨", "💅", "💆", "🌟"], fitness: ["💪", "🔥", "⚡", "🏆"],
  property: ["🏡", "🔑", "📍", "⭐"], b2b: ["📈", "✅", "🚀", "🎯"],
  generic: ["✨", "✅", "🔥", "⭐"],
};

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
    emojis: VERTICAL_EMOJI[v],
    // Urgency wording stays HONEST — a real, stated deadline/scarcity, never fabricated.
    urgencyWording: `${input.offer && URGENCY_RE.test(input.offer) ? input.offer : "This week only"} — ${cta.toLowerCase()} before it's gone. (Only use a deadline you will actually honour.)`,
    // Trust wording — proof and reassurance, not hype.
    trustWording: `Trusted by ${where} locals · real reviews, not stock · no hidden costs · ${obj.primaryChannel} reply within the hour.`,
    persuasionModels: ["AIDA", "PAS", "emotional selling", "scarcity", "authority", "urgency", "social proof", "curiosity", "FOMO", "local identity"],
  };
}

// ---------------------------------------------------------------------------
// STEP 7 — Hashtag engine (classed + scored)
// ---------------------------------------------------------------------------
// `score` is retained for the existing UI contract but is always 0 and means
// "unranked": ranking hashtags without platform data would be invention.
export type ScoredHashtag = { tag: string; class: string; score: number };

function buildHashtags(input: WarfareInput, v: Vertical): ScoredHashtag[] {
  // What was here before glued tokens together — "United Kingdom" became
  // "united", which became #uniteddeals and #orderunited. Those are not
  // hashtags; they are string fragments nobody searches for. They were then
  // given confident scores out of 100 derived from a hash of the inputs.
  //
  // A hashtag's real value depends on how many people follow and search it,
  // which we do not know without live platform data. So this now returns only
  // tags that are ACTUAL WORDS, and reports them as unranked suggestions to
  // check rather than a scored league table.
  const tags: ScoredHashtag[] = [];
  const seen = new Set<string>();
  const add = (raw: string, cls: string) => {
    const tag = `#${raw.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    // Under 4 characters is almost always a fragment; over 30 is unreadable.
    if (tag.length < 5 || tag.length > 31 || seen.has(tag)) return;
    seen.add(tag);
    tags.push({ tag, class: cls, score: 0 });
  };

  // Location: the WHOLE place name, not its first token. "United Kingdom" →
  // #unitedkingdom, never #united.
  const place = (input.location || "").trim();
  if (place) {
    add(place, "local");
    // A city inside "Manchester, UK" is worth its own tag; a country fragment is not.
    const first = place.split(/\s*,\s*/)[0];
    if (first && first !== place && first.length >= 4) add(first, "local");
  }

  // The product, in the words the owner used for it.
  for (const word of (input.product || "").split(/\s+/)) {
    if (word.length >= 5) add(word, "product");
  }

  // The vertical, which is a real community tag on every platform.
  if (v !== "generic") { add(v, "niche"); add(`${v}business`, "niche"); }
  else add("smallbusiness", "niche");

  return tags.slice(0, 12);
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
      "Benefit blocks (outcome, not features)",
      `Urgency section: ${offer.offer}`,
      "Testimonials + reviews (real, local, with names/photos where consented)",
      "FAQ that dissolves the top 3 objections",
      "Trust badges + guarantees",
      "WhatsApp button (tap-to-chat) + lead form (minimum fields)",
      /\b(book|appointment|reservation|slot|viewing|demo)\b/i.test(obj.objective)
        ? "Booking system (calendar slots, confirmation, reminder)"
        : "Order / enquiry capture with instant confirmation",
      "Map / hours for local intent",
      "Pixels/UTM for measurement",
      `Primary CTA repeated: ${obj.primaryChannel}`,
    ],
    conversionNote: "One objective, one primary CTA repeated. Every element serves the single action or it is cut.",
  };
}

// ---------------------------------------------------------------------------
// STEP 11 — Performance learning signals (what gets MEASURED after launch)
// Honest by design: these are the signals the OS will learn from real data;
// nothing here is a pre-launch claim. The learning loop runs post-launch.
// ---------------------------------------------------------------------------
function learningSignals(): { signal: string; how: string }[] {
  return [
    { signal: "Which visuals win", how: "creative-level CTR / thumb-stop rate vs spend" },
    { signal: "Which colours convert", how: "palette variant → conversion rate A/B" },
    { signal: "Which emojis perform", how: "subject/caption variant → open & click deltas" },
    { signal: "Which hashtags drive traffic", how: "tag-tagged reach → profile/site clicks" },
    { signal: "Which hooks stop the scroll", how: "3-second view rate by hook variant" },
    { signal: "Which CTA converts", how: "CTA variant → action completion rate" },
    { signal: "Which audience buys", how: "segment → revenue per 1k reached" },
  ];
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
// Brief readiness — which inputs are present. Never a performance forecast.
// ---------------------------------------------------------------------------
export type CampaignScore = {
  composite: number;
  verdict: string;
  dimensions: { name: string; score: number; driver: string; optional?: boolean }[];
  honesty: string;
};

function scoreCampaign(input: WarfareInput, v: Vertical, offer: ScoredOffer, obj: Objective): CampaignScore {
  // This used to present eight "probabilities" — Conversion Probability,
  // Emotional Strength and so on — computed from whether a field was filled in,
  // plus a jitter() derived from a hash of the inputs. A random number wearing a
  // percentage sign, under a trademark.
  //
  // It is now what it always actually was: a READINESS CHECK on the brief. Each
  // line is a fact about what was supplied, phrased as a fact. Nothing here
  // predicts performance, because nothing here can.
  // Read from the field that ASKS for it, and still from the offer text, so a
  // brief written before the field existed scores exactly as it did.
  const hasUrgency = (input.deadline || "").trim().length > 2 || URGENCY_RE.test(input.offer || "");
  const specificAudience = SPECIFIC_AUDIENCE_RE.test(input.audience || "") || (input.audience || "").trim().length > 20;
  const specificLocation = (input.location || "").trim().length > 2;
  const hasOffer = (input.offer || "").trim().length > 2;
  const hasProduct = (input.product || "").trim().length > 2;
  const budget = Math.max(0, input.budget || 0);

  // Each check is worth the same, because a weighting would be a claim about
  // relative impact that we cannot substantiate either.
  const dimensions = [
    {
      name: "Product is described", score: hasProduct ? 100 : 0,
      driver: hasProduct ? `“${(input.product || "").slice(0, 60)}”` : "Not stated — every piece of copy below is generic without it.",
    },
    {
      name: "Audience is specific", score: specificAudience ? 100 : 0,
      driver: specificAudience ? `“${(input.audience || "").slice(0, 60)}”` : "Too broad. “Businesses” cannot be written to; “UK construction project managers” can.",
    },
    {
      name: "Location is set", score: specificLocation ? 100 : 0,
      driver: specificLocation ? input.location! : "No location — local targeting and local proof are both unavailable.",
    },
    {
      name: "Offer is stated", score: hasOffer ? 100 : 0,
      driver: hasOffer ? `“${(input.offer || "").slice(0, 60)}”` : "No offer — the page has nothing to ask for.",
    },
    {
      name: "Offer protects margin", score: offer.marginFlag ? 0 : 100,
      driver: offer.marginFlag ? "Flagged: this discount cuts into the floor." : "Within margin discipline.",
    },
    {
      name: "Deadline is real", score: hasUrgency ? 100 : 0,
      // OPTIONAL, AND THE WORDING HAS TO SAY SO. The old text told the reader to
      // leave it out and the verdict above told them to fill it in — two
      // instructions, opposite directions, about a box that did not exist.
      optional: true,
      driver: hasUrgency
        ? `A genuine time-box is present${(input.deadline || "").trim() ? `: “${(input.deadline || "").trim().slice(0, 60)}”` : "."}`
        : "Not set, and that is a fine answer — a deadline you will not honour is noticed. Add one in the Deadline box only if it is real.",
    },
    {
      name: "Budget covers a test", score: budget >= 100 ? 100 : 0,
      driver: budget >= 100
        ? `£${budget} is enough to test more than one variant.`
        : budget > 0 ? `£${budget} is thin — one variant only, and no reliable read on which wins.` : "No budget set.",
    },
  ];

  const ready = dimensions.filter((d) => d.score === 100).length;
  const composite = Math.round((ready / dimensions.length) * 100);
  // AN OPTIONAL INPUT IS NEVER SOMETHING TO "FILL IN".
  //
  // The verdict used to list every zero, so a brief that had deliberately left
  // out a deadline — on this engine's own advice — was told to go and supply
  // one. Optional lines still show their score, because leaving them out IS
  // information, but they never appear in an instruction.
  const missing = dimensions.filter((d) => d.score === 0 && !d.optional);
  const optionalGaps = dimensions.filter((d) => d.score === 0 && d.optional);

  const verdict = missing.length === 0
    ? `Every required input is present${optionalGaps.length ? `. Optional and not set: ${optionalGaps.map((d) => d.name.toLowerCase()).join(", ")} — leaving those out is a valid choice` : ` — all ${dimensions.length}`}. What happens next depends on the market, not on this checklist.`
    : `${ready} of ${dimensions.length} inputs ready. Fill in: ${missing.map((d) => d.name.toLowerCase()).join(", ")}.`;

  return {
    composite,
    verdict,
    dimensions,
    honesty:
      "This is a readiness check on your brief — how much the engine had to work with — NOT a prediction. " +
      "Nothing here forecasts clicks, leads or revenue, because nothing can before the campaign runs. " +
      "Real performance is measured after launch, from your own traffic.",
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
  learningSignals: { signal: string; how: string }[];
};

// ---------------------------------------------------------------------------
// AI-written variant.
//
// designCampaign below decides the STRUCTURE — vertical, objective, psychology
// profile, scored offers, formats, distribution, governance. That part is sound
// and deterministic, and it should stay that way.
//
// What was wrong is that it also wrote the WORDS, by concatenating a psychology
// profile: `${aspirations[0]} — for ${audience} in ${location}` produced "A
// great result — for Businesses Senior Management in United Kingdom", and a
// hook that read "sorted." — curiosity in three words. Every business on the
// platform got the same sentences with their nouns swapped in.
//
// This keeps every structural decision and replaces only the copy, written
// against the brand's real facts and claim-checked before it is returned.
// ---------------------------------------------------------------------------
export async function designCampaignWritten(
  input: WarfareInput,
  opts: { facts?: string[]; lang?: string } = {},
): Promise<CampaignEcosystem & { written: "ai" | "template"; copyNote: string; copyWarnings: string[] }> {
  const eco = designCampaign(input);

  const result = await writeCopy({
    business: input.product ? input.product : "this business",
    product: input.product,
    audience: input.audience,
    location: input.location,
    offer: input.offer,
    objective: input.result,
    facts: opts.facts,
  }, { lang: opts.lang });

  if (result.written !== "ai") {
    return { ...eco, written: "template", copyNote: result.note, copyWarnings: result.warnings };
  }

  const c = result.copy;
  const copy: CopyPack = {
    ...eco.copy,
    headline: c.headline || eco.copy.headline,
    // AIDA and PAS keep their shape — the frameworks are the point — but are
    // filled with written lines rather than profile fragments.
    aida: [
      `Attention: ${c.hooks[0] || c.headline}`,
      `Interest: ${c.subheadline}`,
      `Desire: ${c.benefits[0] || c.offerHeadline}`,
      `Action: ${c.primaryCta}`,
    ].join("\n"),
    pas: [
      `Problem: ${c.problemHeading || c.subheadline}`,
      `Agitate: ${c.problemBody || ""}`.trim(),
      `Solve: ${c.offerHeadline} ${c.primaryCta}.`,
    ].filter(Boolean).join("\n"),
    hooks: c.hooks.length ? c.hooks : eco.copy.hooks,
    cta: c.primaryCta || eco.copy.cta,
  };

  // Payloads are derived FROM the copy, so they must be rebuilt or the channel
  // adaptations would still carry the old concatenated lines.
  const payloads = buildPayloads(input, copy, eco.objective);

  return {
    ...eco,
    copy,
    payloads,
    written: "ai",
    copyNote: result.note,
    copyWarnings: result.warnings,
  };
}

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
        : "Audience is broad, so the engine defaulted to local intent. Naming a narrower audience — a job title, an industry, a situation — gives every piece of copy below something specific to say.",
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
    learningSignals: learningSignals(),
  };
}
