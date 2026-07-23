// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Per-brand Creator Recruitment Advisor — the AI agent that tells EACH brand who
// to recruit. The portfolio targeting used to live on the public page; it now
// lives inside each brand, generated for that brand's own niche by the AI agent
// (niche-first doctrine). Real gateway call; deterministic honest scaffold when
// no provider key. Pairs with the commission model in shared/creator-program.ts.

import { gatewayComplete, GatewayUnconfiguredError } from "@/backend/gateway";

export type RecruitInput = { business: string; industry?: string; product?: string; audience?: string; location?: string; lang?: string };

export type CreatorProfile = { profile: string; why: string; whereToFind: string; suggestedTier: "micro" | "authority" | "local_viral"; searchTerms: string[] };
export type RecruitResult = {
  mode: "live" | "scaffold";
  business: string;
  angle: string;                 // the single best pitch angle to creators
  profiles: CreatorProfile[];    // who to recruit
  outreachOpener: string;        // a ready first-message opener
  note: string;
};

const SYSTEM = `You are the MarketWar Creator Recruitment Advisor. For ONE business you recommend which social/YouTube creators it should recruit as affiliates/promoters. Doctrine: niche-first — trusted niche educators, operators, reviewers and problem-solvers, NOT vanity-follower generalists; local micro-creators and community experts convert best. British English. Do not invent specific real creators, follower counts or contact details — describe PROFILES and where to find them.

Return STRICT JSON only:
{
  "angle": string,                       // the single best pitch angle for creators promoting this business
  "profiles": [ { "profile": string, "why": string, "whereToFind": string, "suggestedTier": "micro"|"authority"|"local_viral", "searchTerms": string[] } ],
  "outreachOpener": string               // a short, ready first-DM opener the brand can send
}
Give 4-7 profiles. searchTerms are the YouTube/social search phrases to find that profile.`;

function safeJson(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as Record<string, unknown>; } catch { return null; }
}

const TIERS = new Set(["micro", "authority", "local_viral"]);

export async function recommendCreators(input: RecruitInput): Promise<RecruitResult> {
  const business = (input.business || "").trim() || "your business";
  const prompt = [
    `Business: ${business}`,
    input.industry ? `Industry: ${input.industry}` : "",
    input.product ? `Product/service: ${input.product}` : "",
    input.audience ? `Target audience: ${input.audience}` : "",
    input.location ? `Location/market: ${input.location}` : "",
  ].filter(Boolean).join("\n");

  try {
    const res = await gatewayComplete({ system: SYSTEM, prompt, maxTokens: 1500, lang: input.lang });
    const p = safeJson(res.text);
    if (p) {
      const profiles: CreatorProfile[] = (Array.isArray(p.profiles) ? p.profiles : []).map((x: Record<string, unknown>) => ({
        profile: String(x.profile || ""), why: String(x.why || ""), whereToFind: String(x.whereToFind || ""),
        suggestedTier: (TIERS.has(String(x.suggestedTier)) ? String(x.suggestedTier) : "micro") as CreatorProfile["suggestedTier"],
        searchTerms: Array.isArray(x.searchTerms) ? x.searchTerms.map(String).slice(0, 6) : [],
      })).filter((x) => x.profile);
      if (profiles.length) return {
        mode: "live", business,
        angle: String(p.angle || ""), profiles, outreachOpener: String(p.outreachOpener || ""),
        note: "Generated for your brand's niche by the recruitment agent. Describes creator PROFILES + where to find them — no invented accounts or follower counts.",
      };
    }
  } catch (e) {
    if (!(e instanceof GatewayUnconfiguredError)) { /* fall through to scaffold */ }
  }

  // Honest scaffold from the brand's own words.
  const niche = (input.industry || input.product || business).toLowerCase();
  const loc = input.location || "your area";
  return {
    mode: "scaffold", business,
    angle: `Trusted ${niche} voices recommending ${business} to the exact audience already looking for it.`,
    profiles: [
      { profile: `${niche} educators / explainers`, why: "Audiences trust people who teach the topic.", whereToFind: "YouTube + TikTok search for how-to content in your niche", suggestedTier: "micro", searchTerms: [`how to ${niche}`, `best ${niche}`, `${niche} tips`] },
      { profile: `Local ${loc} creators`, why: "Local trust + intent convert fastest.", whereToFind: `Search "${loc}" + your category on Instagram/TikTok`, suggestedTier: "local_viral", searchTerms: [`${niche} ${loc}`, `${loc} review`] },
      { profile: `${niche} reviewers`, why: "Reviewers reach high-intent, comparison-stage buyers.", whereToFind: "YouTube review + comparison channels in your category", suggestedTier: "authority", searchTerms: [`${niche} review`, `${niche} vs`, `is ${niche} worth it`] },
    ],
    outreachOpener: `Hi — I run ${business}. Your ${niche} content reaches exactly the people we help. We pay 0.75% per referred customer on verified revenue, with your own tracked code. Open to a quick chat?`,
    note: "Structural scaffold generated from your inputs (no AI provider connected). Connect an AI provider for a full, niche-specific recruitment plan. No invented creators or numbers.",
  };
}
