// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar "Make Anything" Intent Router — the universal command box brain.
//
// SuperCool has a single prompt box that turns a description into an asset.
// MarketWar's version is stronger: it detects the user's GOAL, routes to the
// right owned engine/agent (never a generic generator), asks only the
// essential questions, and previews the ACU cost before anything runs. Every
// route lands on an engine we already ship — this is an orchestrator, not a
// new generator.

import { quoteAcu, type ActionClass } from "@/backend/acu";

export type Intent = {
  id: string;
  label: string;
  keywords: string[];
  route: string; // dashboard destination
  agentId?: string; // agent that fulfils it, if any
  api?: string; // API the box can call directly for an inline result
  acuClass: ActionClass;
  // Indicative provider cost (GBP) for the ACU preview — server-side only,
  // never returned to the client (users only see ACUs).
  indicativeCostGbp: number;
  essentialQuestions: string[]; // ask ONLY these
};

// Catalogue covering the SuperCool "Make Anything" list, each mapped to an
// engine MarketWar already owns.
const INTENTS: Intent[] = [
  { id: "ad_creative", label: "Ad / social creative (image)", keywords: ["ad image", "creative", "poster", "banner", "flyer", "carousel", "graphic", "instagram post", "facebook ad", "story", "thumbnail", "mockup", "menu visual"], route: "/dashboard/studio", agentId: "brand-visual-creation", api: "/api/image", acuClass: "high", indicativeCostGbp: 0.03, essentialQuestions: ["What are you advertising?", "Platform (Instagram/TikTok/Facebook…)?", "Offer text + CTA?"] },
  { id: "video", label: "Video / movie ad", keywords: ["video", "movie", "reel", "tiktok video", "youtube", "spokesperson", "voiceover", "clip", "film"], route: "/dashboard/video", agentId: "video-commander", acuClass: "very_high", indicativeCostGbp: 0.4, essentialQuestions: ["What's the video about?", "Format (9:16 / 16:9 / 1:1)?", "Length + audio/voiceover?"] },
  { id: "full_campaign", label: "Full campaign ecosystem", keywords: ["campaign", "launch", "acquisition", "get customers", "get orders", "get bookings", "get leads", "grow", "mission", "everything"], route: "/dashboard/warfare", agentId: "campaign-warfare-strategist", api: "/api/warfare", acuClass: "medium", indicativeCostGbp: 0.05, essentialQuestions: ["What do you sell?", "Who do you want + where?", "Budget + offer?"] },
  { id: "landing_page", label: "Landing / conversion page", keywords: ["landing page", "website", "sales page", "funnel", "conversion page", "web page"], route: "/dashboard/landing-pages", acuClass: "medium", indicativeCostGbp: 0.04, essentialQuestions: ["Objective (leads/orders/bookings/WhatsApp)?", "Offer?", "Audience + location?"] },
  { id: "email", label: "Email / newsletter campaign", keywords: ["email", "newsletter", "broadcast", "mailer", "sequence"], route: "/dashboard/email", agentId: "email-commander", api: "/api/email", acuClass: "low", indicativeCostGbp: 0.01, essentialQuestions: ["Goal of the email?", "Audience segment?", "Offer + CTA?"] },
  { id: "social_content", label: "Social posts / content calendar", keywords: ["social post", "caption", "content calendar", "content plan", "posts", "reels script", "tiktok script"], route: "/dashboard/content", agentId: "content-factory", acuClass: "low", indicativeCostGbp: 0.01, essentialQuestions: ["Business + audience?", "Platforms?", "How many days of content?"] },
  { id: "hashtags", label: "Hashtags", keywords: ["hashtag", "tags"], route: "/dashboard/warfare", agentId: "campaign-warfare-strategist", acuClass: "low", indicativeCostGbp: 0.005, essentialQuestions: ["Business + location?", "Platform?"] },
  { id: "copy", label: "Ad copy / product descriptions", keywords: ["copy", "headline", "hook", "product description", "sales copy", "cta", "wording"], route: "/dashboard/content", agentId: "ad-creative", acuClass: "low", indicativeCostGbp: 0.008, essentialQuestions: ["What are you selling?", "Audience + tone?", "Where will it run?"] },
  { id: "brand_kit", label: "Brand kit / logo colour theme", keywords: ["brand kit", "brand colours", "logo", "palette", "brand theme", "brand identity"], route: "/dashboard/studio", agentId: "brand-visual-creation", api: "/api/image", acuClass: "high", indicativeCostGbp: 0.02, essentialQuestions: ["Business name?", "Upload a logo (or describe the vibe)?"] },
  { id: "audit", label: "Marketing failure audit", keywords: ["audit", "why no customers", "diagnose", "what's wrong", "review my marketing"], route: "/dashboard/audit", agentId: "business-diagnosis", api: "/api/audit", acuClass: "medium", indicativeCostGbp: 0.04, essentialQuestions: ["Business + industry?", "Past ad spend + result?", "Website / offer?"] },
  { id: "offer", label: "Offer builder", keywords: ["offer", "discount", "bundle", "promotion", "deal", "incentive"], route: "/dashboard/offers", agentId: "offer-builder", acuClass: "low", indicativeCostGbp: 0.01, essentialQuestions: ["What are you selling + margin?", "Goal (first-time/comeback/urgency)?"] },
  { id: "market_research", label: "Market research / business plan / pitch deck", keywords: ["market research", "business plan", "pitch deck", "strategy", "analysis", "research"], route: "/dashboard/briefing", agentId: "growth-strategist", acuClass: "medium", indicativeCostGbp: 0.05, essentialQuestions: ["Business + market?", "What decision do you need it for?"] },
  { id: "competitor", label: "Competitor / threat intelligence", keywords: ["competitor", "rival", "spy", "competition", "market gap", "threat"], route: "/dashboard/competitors", agentId: "competitor-spy", acuClass: "medium", indicativeCostGbp: 0.04, essentialQuestions: ["Your business + location?", "Known competitors?"] },
  { id: "local_seo", label: "Local SEO / AI visibility", keywords: ["local seo", "near me", "google business", "geo", "ai visibility", "get recommended", "chatgpt recommend"], route: "/dashboard/organic", agentId: "geo-recon", api: "/api/geo", acuClass: "medium", indicativeCostGbp: 0.03, essentialQuestions: ["Business + website?", "Target location?"] },
  { id: "whatsapp", label: "WhatsApp campaign / flow", keywords: ["whatsapp", "wa flow", "chat flow", "message flow"], route: "/dashboard/whatsapp", acuClass: "low", indicativeCostGbp: 0.01, essentialQuestions: ["Goal (orders/bookings/qualify)?", "Offer?"] },
  { id: "recovery", label: "Reactivate dead leads / recover revenue", keywords: ["reactivate", "recover", "resurrection", "dead leads", "old customers", "comeback", "win back", "dormant"], route: "/dashboard/recovery", agentId: "revenue-intelligence", acuClass: "medium", indicativeCostGbp: 0.03, essentialQuestions: ["How many old contacts + how old?", "What did they buy?"] },
  { id: "amplify", label: "Referral / viral loop / amplify reach", keywords: ["referral", "viral", "share", "amplify", "network effect", "loop", "retarget"], route: "/dashboard/amplify", agentId: "amplification-strategist", api: "/api/amplify", acuClass: "medium", indicativeCostGbp: 0.02, essentialQuestions: ["What's being shared?", "Reward both sides?"] },
];

const norm = (s: string) => s.toLowerCase();

export type IntentMatch = {
  intent: Intent;
  score: number;
  matched: string[];
};

export type IntentDecision = {
  prompt: string;
  best: {
    id: string; label: string; route: string; agentId?: string; api?: string;
    acuClass: ActionClass; acuEstimate: number; essentialQuestions: string[]; confidence: number;
  };
  alternatives: { id: string; label: string; route: string; confidence: number }[];
  note: string;
};

// Detect the goal from a free-text prompt. Deterministic keyword scoring so it
// works in demo mode; a live LLM can refine confidence at go-live.
export function detectIntent(prompt: string): IntentDecision {
  const p = norm(prompt || "");
  const matches: IntentMatch[] = INTENTS.map((intent) => {
    const matched = intent.keywords.filter((k) => p.includes(norm(k)));
    // longer keyword hits weigh more (more specific).
    const score = matched.reduce((a, k) => a + Math.max(1, k.split(" ").length), 0);
    return { intent, score, matched };
  }).filter((m) => m.score > 0).sort((a, b) => b.score - a.score);

  // No clear match → route to the full-campaign engine (the "does everything"
  // fallback), exactly the SuperCool "AI detects the goal" behaviour.
  const fallback = INTENTS.find((i) => i.id === "full_campaign")!;
  const top = matches[0]?.intent ?? fallback;
  const topScore = matches[0]?.score ?? 0;
  const totalScore = matches.reduce((a, m) => a + m.score, 0) || 1;
  const confidence = matches.length ? Math.round((topScore / totalScore) * 100) : 40;

  const acuEstimate = quoteAcu({ providerCostGbp: top.indicativeCostGbp, actionClass: top.acuClass }).acus;

  return {
    prompt,
    best: {
      id: top.id, label: top.label, route: top.route, agentId: top.agentId, api: top.api,
      acuClass: top.acuClass, acuEstimate, essentialQuestions: top.essentialQuestions, confidence,
    },
    alternatives: matches.slice(1, 4).map((m) => ({
      id: m.intent.id, label: m.intent.label, route: m.intent.route,
      confidence: Math.round((m.score / totalScore) * 100),
    })),
    note: matches.length
      ? `Detected "${top.label}" — routing to the owned engine, asking only what's essential.`
      : `No specific goal detected — defaulting to the full campaign engine, which designs the whole ecosystem.`,
  };
}

export const INTENT_CATALOGUE = INTENTS.map((i) => ({ id: i.id, label: i.label, route: i.route, acuClass: i.acuClass }));
