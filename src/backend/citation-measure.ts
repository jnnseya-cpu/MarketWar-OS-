// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// AI Citation Radar — MEASURED by actually asking the models.
//
// The modelled version invented its numbers ("ChatGPT: VeryX 22% / Flame Republic
// 44%") and labelled them "Live intelligence". Nobody measured anything, and a
// customer would reasonably read those as real. This module instead RUNS each
// prompt through the configured providers and counts who is actually named in the
// answer. If no provider key is set we return `measured: false` and no numbers —
// never a fabricated share.
//
// Honest by construction: share-of-voice is computed from the answers we received,
// and the raw answer snippet is kept as evidence for every mention.

import { gatewayComplete, GatewayUnconfiguredError, type ProviderId } from "@/backend/gateway";

export type PromptResult = {
  prompt: string;
  provider: ProviderId | "none";
  answered: boolean;
  mentionsBrand: boolean;
  mentionsCompetitors: string[];
  evidence: string;        // the snippet around the mention (or the opening line)
  error?: string;
};

export type CitationReport = {
  measured: boolean;
  business: string;
  competitors: string[];
  prompts: string[];
  results: PromptResult[];
  brandMentions: number;
  competitorMentions: Record<string, number>;
  answeredCount: number;
  shareOfVoicePct: number | null;   // null when nothing could be measured
  note: string;
};

// Whole-word-ish match so "Veryx" doesn't match inside another word, and a
// multi-word brand still matches.
function mentions(text: string, name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9])${esc}([^A-Za-z0-9]|$)`, "i").test(text);
}

function snippet(text: string, name: string): string {
  const i = text.toLowerCase().indexOf(name.toLowerCase());
  if (i < 0) return text.slice(0, 160).trim();
  return text.slice(Math.max(0, i - 70), i + 90).replace(/\s+/g, " ").trim();
}

export async function measureCitations(input: {
  business: string;
  competitors?: string[];
  prompts: string[];
  market?: string;
}): Promise<CitationReport> {
  const business = (input.business || "").trim();
  const competitors = (input.competitors || []).map((c) => c.trim()).filter(Boolean);
  const prompts = input.prompts.filter(Boolean).slice(0, 8);
  const results: PromptResult[] = [];

  for (const prompt of prompts) {
    try {
      const res = await gatewayComplete({
        // Neutral framing: we are sampling what an assistant would tell a buyer.
        system: "You are answering a consumer's question. Recommend specific real brands or companies by name, as you normally would. If you genuinely don't know of any, say so. Keep it under 120 words.",
        prompt: input.market ? `${prompt} (market: ${input.market})` : prompt,
        maxTokens: 400,
      });
      const text = res.text || "";
      const hitCompetitors = competitors.filter((c) => mentions(text, c));
      const hitBrand = mentions(text, business);
      results.push({
        prompt, provider: res.provider, answered: true,
        mentionsBrand: hitBrand,
        mentionsCompetitors: hitCompetitors,
        evidence: snippet(text, hitBrand ? business : hitCompetitors[0] || business),
      });
    } catch (e) {
      if (e instanceof GatewayUnconfiguredError) {
        return {
          measured: false, business, competitors, prompts, results: [],
          brandMentions: 0, competitorMentions: {}, answeredCount: 0, shareOfVoicePct: null,
          note: "No AI provider key is configured, so citation share cannot be measured. No figures are shown — an unmeasured share would be a guess.",
        };
      }
      results.push({ prompt, provider: "none", answered: false, mentionsBrand: false, mentionsCompetitors: [], evidence: "", error: e instanceof Error ? e.message : "provider error" });
    }
  }

  const answered = results.filter((r) => r.answered);
  const brandMentions = answered.filter((r) => r.mentionsBrand).length;
  const competitorMentions: Record<string, number> = {};
  for (const c of competitors) competitorMentions[c] = answered.filter((r) => r.mentionsCompetitors.includes(c)).length;
  const totalNamed = brandMentions + Object.values(competitorMentions).reduce((s, n) => s + n, 0);

  return {
    measured: answered.length > 0,
    business, competitors, prompts, results,
    brandMentions, competitorMentions,
    answeredCount: answered.length,
    shareOfVoicePct: totalNamed > 0 ? Math.round((brandMentions / totalNamed) * 100) : answered.length ? 0 : null,
    note: answered.length
      ? `Measured live: ${prompts.length} prompt${prompts.length === 1 ? "" : "s"} sent to the configured AI provider, ${answered.length} answered. You were named in ${brandMentions}. Every mention below quotes the answer it came from. This samples the model directly — it is not a claim about all users' answers, which vary.`
      : "No answers were returned, so nothing is reported. No estimated share is shown.",
  };
}

// Default buyer-intent prompt battery, built from the brand's own words — never
// from an assumed industry. Callers may override.
export function defaultPrompts(business: string, market?: string, category?: string): string[] {
  const where = market ? ` in ${market}` : "";
  const cat = (category || "").trim();
  const subject = cat || business;
  return [
    `What are the best ${subject} providers${where}?`,
    `Is ${business} a good choice? What do you know about them?`,
    `Who are the top alternatives to ${business}${where}?`,
    `Which ${subject} company would you recommend${where} and why?`,
    `What should I look for when choosing a ${subject} supplier${where}?`,
  ];
}
