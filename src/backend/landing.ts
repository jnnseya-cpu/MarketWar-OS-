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
export type LandingSection = { type: string; heading: string; body: string; items?: string[] };

export type LandingInput = {
  business: string; objective?: string; offer?: string; audience?: string;
  location?: string; product?: string; painPoint?: string; whatsappNumber?: string;
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const seed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

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

// ---------------------------------------------------------------------------
// 10-section structure generator (§4.7)
// ---------------------------------------------------------------------------
function buildSections(input: LandingInput, pageType: PageType): LandingSection[] {
  const biz = input.business || "our business";
  const where = input.location || "your area";
  const pain = input.painPoint || "wasting money on options that disappoint";
  const offer = input.offer || "a first-time offer";
  const cta = CTA_BY_TYPE[pageType];
  const sections: LandingSection[] = [
    { type: "problem", heading: "Sound familiar?", body: `Tired of ${pain}?` },
    { type: "offer", heading: "The offer", body: `${offer} — clear eligibility, honest deadline.`, items: ["Offer name", "Discount / value", "Deadline", "Who's eligible", cta] },
    { type: "benefits", heading: "Why choose us", body: "", items: ["Fast, reliable service", "Trusted locally in " + where, "Easy to order / book", "Honest pricing", "Real people, quick replies"] },
    { type: "proof", heading: "Trusted by locals", body: "", items: ["Star rating + review count", "Named testimonials", "Customer photos / before-after", "Order/booking numbers"] },
    { type: "process", heading: "How it works", body: "", items: pageType === "whatsapp_conversion" ? ["Tap WhatsApp", "Tell us what you need", "Confirm", "Done"] : ["Choose", "Confirm", "Receive", "Enjoy"] },
    { type: "faq", heading: "Questions", body: "", items: ["How much does it cost?", "How fast is it?", "Where do you cover?", "Can I pay later?", "Is there a guarantee?"] },
    { type: "urgency", heading: "Don't miss it", body: pageType === "offer_claim" || pageType === "order" ? "Limited slots — offer ends soon." : "Only a few spaces left this week." },
  ];
  if (pageType.includes("booking") || pageType === "order" || pageType === "app_download") {
    sections.push({ type: pageType === "app_download" ? "app_store" : pageType === "order" ? "order_capture" : "booking_system", heading: pageType === "app_download" ? "Get the app" : pageType === "order" ? "Place your order" : "Pick a time", body: pageType === "app_download" ? "App Store + Google Play buttons." : pageType === "order" ? "Order/enquiry capture with instant confirmation." : "Calendar slots, confirmation + reminder." });
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
  const who = input.audience || "locals"; const where = input.location || "your area"; const offer = input.offer || "our offer";
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
  headline: string; subheadline: string; offerText: string; primaryCta: string; secondaryCta: string;
  sections: LandingSection[];
  formConfig: { enabled: boolean; fields: FormField[]; submitAction: string };
  whatsappConfig: { enabled: boolean; phoneNumber: string; prefilledMessage: string };
  tracking: { utmSource: string; utmMedium: string; utmCampaign: string; metaPixelId: string; googleTagId: string; tiktokPixelId: string };
  scores: LandingScores;
  abVariants: ABVariant[];
  optimisationRecommendations: string[];
  publishUrl: string;
};

export function generateLandingPage(input: LandingInput): GeneratedLandingPage {
  const business = input.business || "Brixton Grill House";
  const objective = input.objective || "get whatsapp orders";
  const pageType = selectPageType(objective);
  const where = input.location || "your area";
  const who = input.audience || "local customers";
  const offer = input.offer || "a first-time offer";
  const headline = pageType === "local_seo"
    ? `Best ${input.product || "service"} in ${where}`
    : `${(input.product || "What you need")}, ${pageType === "whatsapp_conversion" ? "on WhatsApp" : "made easy"} in ${where}`;
  const { fields, submitAction } = formFields(pageType);
  const sections = buildSections(input, pageType);
  const scores = scoreLanding(input, pageType, fields.length);
  const slug = slugify(`${business}-${where}-${input.product || pageType}`);

  return {
    pageType, title: `${business} — ${objective}`, slug, status: "draft",
    objective, targetAudience: who, targetLocation: where,
    headline, subheadline: `${offer} — fresh, fast and trusted by ${who}.`,
    offerText: offer, primaryCta: CTA_BY_TYPE[pageType], secondaryCta: pageType === "order" ? "View Menu" : "Learn More",
    sections,
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
