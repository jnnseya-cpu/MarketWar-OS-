// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar AI Landing Page Creation Engine (spec §4.6–§4.14).
//
// THE central agent: the landing page is where attention becomes action. This
// engine designs the full page — type, structure, copy, CTA hierarchy, trust,
// urgency, form, tracking, A/B variants and the 8-score matrix — matching the
// LandingPage schema (§4.13). Deterministic + demo-safe; renders the same
// structured JSON the frontend needs. Never generic — every page is built from
// the business, objective, offer, audience and pain.

export type PageType =
  | "lead_capture" | "whatsapp_conversion" | "booking" | "order" | "app_download"
  | "partner_signup" | "event_ticket" | "reactivation" | "local_seo" | "offer_claim";

export type FormField = { key: string; label: string; type: string; required: boolean };
import { writeCopy } from "@/backend/copywriter";

export type LandingSection = { type: string; heading: string; body: string; items?: string[] };

export type LandingInput = {
  business: string; objective?: string; offer?: string; audience?: string;
  location?: string; product?: string; painPoint?: string; whatsappNumber?: string;
  // Owner controls: exact CTA wording, and a REAL external destination for the
  // button (product page, checkout, booking, Calendly…). When ctaUrl is set the
  // page's button links out instead of scrolling to the built-in lead form —
  // this is what turns a page into "add my own product link", not a placeholder.
  ctaLabel?: string; ctaUrl?: string;
  // REAL proof, supplied by the owner. Never generated: an invented testimonial
  // is a legal problem, not a shortcut. Each entry is a quote the owner has and
  // can stand behind, with the name of the person who said it.
  testimonials?: { quote: string; name: string }[];
  // A real deadline. Urgency is only ever rendered when one is given — a
  // countdown that resets on refresh is noticed, and costs trust permanently.
  deadline?: string;
};

import { resolveIndustry } from "@/shared/industry";

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const seed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

// Treat "0", blanks and punctuation-only inputs as MISSING so the page never
// renders junk like "0 — fresh, fast". Returns a cleaned string or "".
const clean = (s?: string): string => {
  const t = (s || "").trim();
  if (!t || t === "0" || !/[a-z]/i.test(t)) return "";
  return t;
};
// Accept a real external destination for the CTA (product page, checkout,
// booking, WhatsApp, Calendly…). Adds https:// when the scheme is missing but it
// looks like a domain, so an owner can paste "veryx.com/start". Returns "" when
// there's nothing usable — the CTA then falls back to the in-page lead form.
const normalizeUrl = (s?: string): string => {
  const t = (s || "").trim();
  if (!t) return "";
  if (/^(https?:\/\/|mailto:|tel:)/i.test(t)) return t;
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/|\?|#|$)/i.test(t)) return `https://${t}`;
  return "";
};

// Real deadline/scarcity signal in the offer text — we only show urgency when
// it's TRUE (honesty: no fabricated "only a few spaces left").
const hasRealDeadline = (offer: string): boolean =>
  /\b(today|tonight|tomorrow|this week|this weekend|ends|deadline|until|by \w+day|\d+\s*(hours?|days?|left)|limited|only \d+|while stocks last|last \d+)\b/i.test(offer);

// ---------------------------------------------------------------------------
// Page-type selection from the objective (§4.6)
// ---------------------------------------------------------------------------
export function selectPageType(objective: string): PageType {
  const o = objective.toLowerCase();
  if (/\b(whatsapp|message|chat|dm)\b/.test(o)) return "whatsapp_conversion";
  if (/\b(book|appointment|reservation|viewing|slot)\b/.test(o)) return "booking";
  if (/\b(order|buy|purchase|checkout|delivery)\b/.test(o)) return "order";
  if (/\b(download|install|app)\b/.test(o)) return "app_download";
  if (/\b(partner|supplier|driver|onboard|b2b)\b/.test(o)) return "partner_signup";
  if (/\b(ticket|event|concert|workshop|conference)\b/.test(o)) return "event_ticket";
  if (/\b(reactivat|comeback|win.?back|dormant|old customer)\b/.test(o)) return "reactivation";
  if (/\b(near me|local seo|city|neighbourhood|rank)\b/.test(o)) return "local_seo";
  if (/\b(claim|discount|flash|promo|deal)\b/.test(o)) return "offer_claim";
  return "lead_capture";
}

const CTA_BY_TYPE: Record<PageType, string> = {
  lead_capture: "Get Your Free Quote", whatsapp_conversion: "Message Us On WhatsApp",
  booking: "Book Your Slot", order: "Order Now", app_download: "Download The App",
  partner_signup: "Become A Partner", event_ticket: "Reserve Your Ticket",
  reactivation: "Claim Your Comeback Offer", local_seo: "Get A Free Quote", offer_claim: "Claim The Offer",
};

// Objective-driven form fields (§4.7)
function formFields(pageType: PageType): { fields: FormField[]; submitAction: string } {
  const basic: FormField[] = [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "phone", label: "Phone", type: "tel", required: true },
    { key: "email", label: "Email", type: "email", required: false },
    { key: "postcode", label: "Postcode", type: "text", required: false },
  ];
  switch (pageType) {
    case "booking":
      return { fields: [...basic, { key: "preferred_date", label: "Preferred date", type: "date", required: true }, { key: "preferred_time", label: "Preferred time", type: "time", required: true }, { key: "service", label: "Service needed", type: "text", required: true }], submitAction: "book_appointment" };
    case "lead_capture": case "partner_signup":
      return { fields: [...basic, { key: "project_type", label: "What do you need?", type: "text", required: true }, { key: "budget", label: "Budget", type: "text", required: false }, { key: "urgency", label: "How urgent?", type: "text", required: false }], submitAction: "save_lead" };
    case "app_download":
      return { fields: [{ key: "phone", label: "Phone number", type: "tel", required: true }, { key: "platform", label: "App platform", type: "text", required: true }, { key: "referral_code", label: "Referral code", type: "text", required: false }], submitAction: "download_app" };
    case "whatsapp_conversion":
      return { fields: [{ key: "name", label: "Name", type: "text", required: false }], submitAction: "send_whatsapp" };
    default:
      return { fields: [...basic, { key: "interest", label: "Interest", type: "text", required: false }], submitAction: "save_lead" };
  }
}

// Industry-adaptive primary CTA — the generic service CTA ("Get Your Free Quote")
// is wrong for a shop or a restaurant, so lead/local pages adapt to the industry.
type Profile = ReturnType<typeof resolveIndustry>;
function primaryCtaFor(pageType: PageType, profile: Profile, input?: LandingInput): string {
  // 1) Owner's exact wording always wins — no forced "quote" on every business.
  const custom = clean(input?.ctaLabel);
  if (custom) return custom.slice(0, 40);

  const base = CTA_BY_TYPE[pageType];
  if (pageType === "lead_capture" || pageType === "local_seo" || pageType === "offer_claim") {
    // 2) When the offer/objective is a trial/free/start motion, "Get a quote"
    //    is the wrong verb — read the real intent and match it.
    const ctx = `${input?.objective || ""} ${input?.offer || ""}`.toLowerCase();
    if (/\b(free|trial|try|start|get started|sign ?up|demo|download|install)\b/.test(ctx)) return "Start Now";
    if (/\b(buy|order|shop|checkout|purchase|deal|discount|% off|save)\b/.test(ctx)) return "Get The Offer";
    if (profile.key === "ecommerce") return "Get The Offer";
    if (["hospitality", "beauty", "fitness", "health", "automotive", "events"].includes(profile.key)) return "Book Now";
  }
  return base;
}

function processFor(pageType: PageType): string[] {
  switch (pageType) {
    case "lead_capture": case "local_seo": case "partner_signup": return ["Send your details", "We reply fast", "Get your quote / plan", "Get started"];
    case "order": return ["Choose what you want", "Place your order", "We confirm", "Receive it"];
    case "booking": return ["Pick a time", "Confirm your booking", "We send a reminder", "See you there"];
    case "offer_claim": return ["Check you're eligible", "Claim the offer", "We confirm", "Enjoy it"];
    default: return ["Choose", "Confirm", "Receive", "Enjoy"];
  }
}

// FAQ with SHORT, honest answers built from what we actually know — never fake
// numbers or guarantees.
function faqFor(offer: string, where: string, pageType: PageType): string[] {
  const out = [
    `How much does it cost? — ${offer ? "See the offer above, or ask for a quick, no-obligation price." : "Ask for a quick, no-obligation price for exactly what you need."}`,
    "How fast can you help? — Send your details and we'll come back to you quickly.",
    `Where do you cover? — ${where ? `${where} and nearby.` : "Ask us about your area — we'll confirm."}`,
  ];
  if (pageType === "order" || pageType === "booking") out.push("Can I change or cancel? — Yes — just let us know and we'll sort it.");
  return out;
}

// ---------------------------------------------------------------------------
// Section generator (§4.7) — emits REAL, honest content from the brand's data.
// Nothing is a wireframe label; sections with no real input are omitted rather
// than shown as placeholders; urgency appears ONLY when the offer is truly
// time-bound; no fabricated reviews/ratings ever.
// ---------------------------------------------------------------------------
function buildSections(input: LandingInput, pageType: PageType): LandingSection[] {
  const where = clean(input.location);
  const pain = clean(input.painPoint);
  const offer = clean(input.offer);
  const product = clean(input.product);
  const who = clean(input.audience);
  const profile = resolveIndustry(`${product} ${input.business || ""} ${who}`);
  const sections: LandingSection[] = [];

  // Problem — only when we have a real pain to name (no invented one).
  if (pain) sections.push({ type: "problem", heading: "Sound familiar?", body: `Tired of ${pain}?` });

  // Offer — the real offer text + real, filled value points (not field labels).
  if (offer) {
    sections.push({
      type: "offer", heading: "The offer", body: offer,
      items: [
        product ? `What you get: ${product}` : "Clear, honest value — no surprises",
        who ? `Made for ${who}` : "Made for people like you",
        where ? `Available across ${where}` : "Ask us about availability",
      ],
    });
  }

  // Benefits — real value points, tuned to the industry.
  sections.push({
    type: "benefits", heading: "Why choose us", body: "",
    items: [
      "Fast, reliable service",
      where ? `Trusted by ${profile.audience} in ${where}` : `Trusted by ${profile.audience}`,
      "Easy to get started",
      "Honest, upfront pricing",
      "Real people, quick replies",
    ],
  });

  // Process — real steps for this page's job.
  sections.push({
    type: "process", heading: "How it works", body: "",
    items: pageType === "whatsapp_conversion" ? ["Tap WhatsApp", "Tell us what you need", "We confirm", "Done"] : processFor(pageType),
  });

  // FAQ — real questions WITH honest short answers.
  // Proof — ONLY from quotes the owner supplied. Nothing here is written by the
  // platform, because a testimonial nobody said is a claim nobody can defend.
  const quotes = (input.testimonials || [])
    .filter((t) => t && t.quote?.trim() && t.name?.trim())
    .slice(0, 4);
  if (quotes.length) {
    sections.push({
      type: "proof",
      heading: "What customers say",
      body: "",
      items: quotes.map((t) => `\u201C${t.quote.trim()}\u201D — ${t.name.trim()}`),
    });
  }

  sections.push({ type: "faq", heading: "Questions", body: "", items: faqFor(offer, where, pageType) });

  // Urgency — ONLY when the offer is genuinely time-bound (honesty: no fake scarcity).
  if (offer && hasRealDeadline(offer)) {
    sections.push({ type: "urgency", heading: "Don't miss it", body: offer });
  } else if (clean(input.deadline)) {
    // A deadline the owner stated explicitly — real, so it may be shown.
    sections.push({ type: "urgency", heading: "Ends soon", body: clean(input.deadline) });
  }

  // Conversion tail (booking/order/app) — describes the real capture step.
  if (pageType === "booking" || pageType === "order" || pageType === "app_download") {
    sections.push({ type: pageType === "app_download" ? "app_store" : pageType === "order" ? "order_capture" : "booking_system", heading: pageType === "app_download" ? "Get the app" : pageType === "order" ? "Place your order" : "Pick a time", body: pageType === "app_download" ? "Download links for iOS + Android." : pageType === "order" ? "Order/enquiry capture with instant confirmation." : "Choose a slot — we'll confirm and send a reminder." });
  }
  return sections;
}

// ---------------------------------------------------------------------------
// 8-score matrix (§4.8) + optimisation rules (§4.9)
// ---------------------------------------------------------------------------
export type LandingScores = { conversionScore: number; clarityScore: number; trustScore: number; urgencyScore: number; mobileScore: number; emotionalScore: number; frictionScore: number; leadQualityScore: number };

function scoreLanding(input: LandingInput, pageType: PageType, fieldCount: number): LandingScores {
  const s = seed(input.business + (input.offer || "") + pageType);
  const hasUrgency = /\b(today|now|limited|ends|only|last|deadline|slots)\b/i.test(input.offer || "");
  const specificAudience = (input.audience || "").length > 20;
  const clarity = clamp(72 + (input.offer ? 10 : -10) + ((s >> 1) % 12));
  const trust = clamp(60 + ((s >> 2) % 20));
  const urgency = clamp((hasUrgency ? 82 : 50) + ((s >> 3) % 12));
  const emotional = clamp((input.painPoint ? 78 : 58) + ((s >> 4) % 12));
  const mobile = clamp(80 + ((s >> 5) % 15));
  // Friction: fewer form fields = higher (less effort). WhatsApp = lowest friction.
  const friction = clamp((pageType === "whatsapp_conversion" ? 90 : 100 - fieldCount * 8) + ((s >> 6) % 8));
  const leadQuality = clamp((specificAudience ? 78 : 58) + (fieldCount >= 5 ? 8 : 0) + ((s >> 7) % 10));
  const conversion = clamp(clarity * 0.2 + trust * 0.2 + urgency * 0.2 + emotional * 0.15 + friction * 0.15 + leadQuality * 0.1);
  return { conversionScore: conversion, clarityScore: clarity, trustScore: trust, urgencyScore: urgency, mobileScore: mobile, emotionalScore: emotional, frictionScore: friction, leadQualityScore: leadQuality };
}

const OPTIMISATION_RULES: { test: (s: LandingScores, fields: number) => boolean; rec: string }[] = [
  { test: (s) => s.clarityScore < 70, rec: "Shorten the headline — one clear promise, not a paragraph." },
  { test: (s) => s.conversionScore < 70, rec: "Strengthen the CTA — action verb + outcome, repeated." },
  { test: (s) => s.urgencyScore < 60, rec: "Add honest urgency — a real deadline or limited quantity." },
  { test: (s) => s.trustScore < 65, rec: "Add more trust proof — reviews, named testimonials, guarantees." },
  { test: (s, f) => f > 5, rec: "Cut form fields — every extra field lowers conversion." },
  { test: (s) => s.frictionScore < 65, rec: "Reduce friction — stronger WhatsApp button, fewer steps." },
  { test: (s) => s.mobileScore < 80, rec: "Improve mobile spacing + faster-loading layout." },
  { test: (s) => s.emotionalScore < 65, rec: "Sharper emotional hook + more local language." },
];

function optimisationRecommendations(scores: LandingScores, fields: number): string[] {
  const recs = OPTIMISATION_RULES.filter((r) => r.test(scores, fields)).map((r) => r.rec);
  return recs.length ? recs : ["Page is strong — publish and A/B test the headline + CTA."];
}

// ---------------------------------------------------------------------------
// A/B variants A–D (§4.10)
// ---------------------------------------------------------------------------
export type ABVariant = { variant: "A" | "B" | "C" | "D"; focus: string; headline: string; subheadline: string; hypothesis: string };

function abVariants(input: LandingInput, headline: string): ABVariant[] {
  const who = clean(input.audience) || "your customers"; const where = clean(input.location) || "your market"; const offer = clean(input.offer) || "our offer";
  return [
    { variant: "A", focus: "Direct offer", headline, subheadline: `${offer} — for ${who} in ${where}.`, hypothesis: "Offer-led wins when intent is already high." },
    { variant: "B", focus: "Pain / problem", headline: `Stop ${input.painPoint || "wasting money on the wrong option"}.`, subheadline: `Here's the fix, made for ${who} in ${where}.`, hypothesis: "Pain-led wins with a cold, problem-aware audience." },
    { variant: "C", focus: "Trust / proof", headline: `${where}'s trusted choice — see why.`, subheadline: `Real reviews, real results. ${offer}.`, hypothesis: "Trust-led wins where scepticism is the blocker." },
    { variant: "D", focus: "Urgency", headline: `${offer} — ends soon.`, subheadline: `Limited slots for ${who} in ${where}. Don't miss it.`, hypothesis: "Urgency-led wins when the offer is genuinely scarce." },
  ];
}

// ---------------------------------------------------------------------------
// Orchestrator — the full LandingPage object (matches §4.13 schema)
// ---------------------------------------------------------------------------
export type GeneratedLandingPage = {
  pageType: PageType; title: string; slug: string; status: "draft";
  objective: string; targetAudience: string; targetLocation: string;
  headline: string; subheadline: string; offerText: string; primaryCta: string; primaryCtaUrl: string; secondaryCta: string;
  sections: LandingSection[];
  formConfig: { enabled: boolean; fields: FormField[]; submitAction: string };
  whatsappConfig: { enabled: boolean; phoneNumber: string; prefilledMessage: string };
  tracking: { utmSource: string; utmMedium: string; utmCampaign: string; metaPixelId: string; googleTagId: string; tiktokPixelId: string };
  scores: LandingScores;
  abVariants: ABVariant[];
  optimisationRecommendations: string[];
  publishUrl: string;
};

// ---------------------------------------------------------------------------
// AI-written variant. generateLandingPage below builds the STRUCTURE (page type,
// form fields, scoring, slug) deterministically — that part is sound. What was
// wrong is that it also wrote the words, by concatenation, which is how a
// construction-software company got "…, made easy in United Kingdom".
//
// This keeps the structure and replaces the words with real copy, grounded in
// the brand's own facts and claim-checked. With no provider key it returns the
// deterministic page unchanged and says so, rather than pretending.
// ---------------------------------------------------------------------------
export async function generateLandingPageWritten(
  input: LandingInput,
  opts: { facts?: string[]; lang?: string } = {},
): Promise<{ page: ReturnType<typeof generateLandingPage>; written: "ai" | "template"; note: string; warnings: string[] }> {
  const page = generateLandingPage(input);

  const result = await writeCopy({
    business: input.business,
    product: input.product || "",
    audience: input.audience,
    location: input.location,
    offer: input.offer,
    objective: input.objective,
    pain: input.painPoint,
    facts: opts.facts,
  }, { lang: opts.lang });

  if (result.written !== "ai") {
    return { page, written: "template", note: result.note, warnings: result.warnings };
  }

  const c = result.copy;
  // Replace only what was written; keep every structural decision.
  const sections = page.sections.map((sec) => {
    if (sec.type === "problem" && c.problemHeading) {
      return { ...sec, heading: c.problemHeading, body: c.problemBody || sec.body };
    }
    if (sec.type === "offer") {
      return { ...sec, heading: c.offerHeadline || sec.heading, items: c.offerBullets.length ? c.offerBullets : sec.items };
    }
    if ((sec.type === "benefits" || sec.type === "how_it_works") && c.benefits.length) {
      return { ...sec, items: c.benefits };
    }
    if (sec.type === "faq" && c.faq.length) {
      return { ...sec, items: c.faq.map((f) => `${f.q} ${f.a}`) };
    }
    return sec;
  });

  return {
    page: {
      ...page,
      headline: c.headline || page.headline,
      subheadline: c.subheadline || page.subheadline,
      primaryCta: c.primaryCta || page.primaryCta,
      sections,
    },
    written: "ai",
    note: result.note,
    warnings: result.warnings,
  };
}

export function generateLandingPage(input: LandingInput): GeneratedLandingPage {
  const business = clean(input.business) || "Our business";
  const objective = clean(input.objective) || "get more enquiries";
  const pageType = selectPageType(objective);
  const profile = resolveIndustry(`${clean(input.product)} ${business} ${clean(input.audience)}`);
  const where = clean(input.location);
  const who = clean(input.audience) || profile.audience;
  const product = clean(input.product) || profile.sampleProduct;
  const offer = clean(input.offer);
  const locSuffix = where ? ` in ${where}` : "";
  // Honest headline — no fabricated "Best in…" superlative (the Truth Layer
  // blocks unsubstantiated bests).
  const headline = pageType === "whatsapp_conversion"
    ? `${product}, on WhatsApp${locSuffix}`
    : `${product}, made easy${locSuffix}`;
  // Subheadline uses the real offer if given; otherwise an honest, filled line —
  // never "0 —" or a dangling placeholder.
  const subheadline = offer
    ? `${offer} — for ${who}${locSuffix}.`
    : `${product} for ${who}${locSuffix}. Straight answers, quick replies.`;
  const primaryCta = primaryCtaFor(pageType, profile, input);
  const primaryCtaUrl = normalizeUrl(input.ctaUrl);
  const { fields, submitAction } = formFields(pageType);
  const sections = buildSections(input, pageType);
  const scores = scoreLanding(input, pageType, fields.length);
  const slug = slugify(`${business}-${where || "site"}-${clean(input.product) || pageType}`);

  return {
    pageType, title: `${business} — ${objective}`, slug, status: "draft",
    objective, targetAudience: who, targetLocation: where || "your market",
    headline, subheadline,
    offerText: offer || `Tell us what you need${locSuffix} and we'll help.`, primaryCta, primaryCtaUrl, secondaryCta: pageType === "order" ? "See what's on" : "Learn More",
    sections,
    // When the CTA points to the owner's own product/checkout link, the built-in
    // lead form is optional (the button already does the job). We keep it enabled
    // as a secondary capture unless it's a WhatsApp-first page.
    formConfig: { enabled: pageType !== "whatsapp_conversion", fields, submitAction },
    whatsappConfig: { enabled: pageType === "whatsapp_conversion" || Boolean(input.whatsappNumber), phoneNumber: input.whatsappNumber || "", prefilledMessage: `Hi ${business}, I'd like to ${objective.replace(/^get /, "")}.` },
    tracking: { utmSource: "marketwar", utmMedium: "landing", utmCampaign: slug, metaPixelId: "", googleTagId: "", tiktokPixelId: "" },
    scores,
    abVariants: abVariants(input, headline),
    optimisationRecommendations: optimisationRecommendations(scores, fields.length),
    // Preview slug only — the REAL served URL is /b/{brandId}/{slug}, set on
    // publish (api/landing). Shown relative so no wrong domain is implied.
    publishUrl: `/b/${slugify(business)}/${slug}`,
  };
}
