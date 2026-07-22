// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// AI blog generator — turns a topic into a complete, SEO-optimised Markdown
// article via the AI Gateway (Claude → OpenAI → Gemini failover). With no
// provider key it returns a deterministic starter article, clearly flagged.

import { gatewayComplete, GatewayUnconfiguredError } from "@/backend/gateway";

const SYSTEM = `You are an expert SEO content strategist and writer for MarketWar OS, an AI customer-acquisition platform. Write a complete, publish-ready blog article in Markdown.
Rules:
- Start with a single H1 title line ("# Title").
- Then a compelling 1-2 sentence stand-first paragraph (this becomes the excerpt).
- Then the full body: H2/H3 sections, practical and specific, scannable, 700-1100 words.
- SEO-optimised around the topic and any target keywords; British English; expert, honest tone.
- NEVER fabricate statistics or testimonials. End with a short call-to-action.
Return ONLY the Markdown article - no preamble, no code fences.`;

export type GeneratedArticle = { title: string; excerpt: string; content: string; mode: "live" | "demo" };

export async function generateArticle(input: { topic: string; category?: string; keywords?: string }): Promise<GeneratedArticle> {
  const prompt = [
    `Topic: ${input.topic}`,
    input.category ? `Category: ${input.category}` : "",
    input.keywords ? `Target keywords: ${input.keywords}` : "",
    "",
    "Write the article now.",
  ].filter(Boolean).join("\n");

  try {
    const res = await gatewayComplete({ system: SYSTEM, prompt });
    return { ...splitArticle(res.text.trim(), input.topic), mode: "live" };
  } catch (e) {
    if (e instanceof GatewayUnconfiguredError) {
      return { ...demoArticle(input.topic, input.category), mode: "demo" };
    }
    throw e;
  }
}

function splitArticle(md: string, fallbackTitle: string): { title: string; excerpt: string; content: string } {
  const clean = md.replace(/^```(?:markdown)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const lines = clean.split("\n");
  const h1 = lines.find((l) => /^#\s+/.test(l));
  const title = h1 ? h1.replace(/^#\s+/, "").trim() : fallbackTitle;
  const body = clean.replace(/^#\s+.*$/m, "").trim();
  const firstPara = body.split(/\n{2,}/).map((s) => s.trim()).find((s) => s && !s.startsWith("#") && !s.startsWith("!"));
  const excerpt = (firstPara || `A practical guide to ${fallbackTitle}.`).replace(/[#*_>`]/g, "").slice(0, 220);
  return { title, excerpt, content: clean };
}

function demoArticle(topic: string, category?: string): { title: string; excerpt: string; content: string } {
  const cat = category || "Growth";
  const content = [
    `# ${topic}`,
    ``,
    `A practical, margin-safe take on ${topic.toLowerCase()} for founders who want customers, not vanity metrics.`,
    ``,
    `## Why this matters`,
    `Owned-channel acquisition compounds; rented reach does not. The goal is the cheapest next customer, not the most views.`,
    ``,
    `## The play`,
    `1. Define the offer around real price, cost and stock.`,
    `2. Reach buyers on channels you own - email, WhatsApp links, your own site.`,
    `3. Measure attributed revenue, not impressions.`,
    ``,
    `## Next steps`,
    `Add an AI provider key to generate full, live ${cat.toLowerCase()} articles like this on demand.`,
  ].join("\n");
  return { title: topic, excerpt: `A practical guide to ${topic.toLowerCase()}.`, content };
}
