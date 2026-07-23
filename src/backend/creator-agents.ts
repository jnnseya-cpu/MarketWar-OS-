// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// The five programme agents (Activation Playbook §4). Scout + Match are
// deterministic (real, auditable heuristics — no fabricated numbers). Brief runs
// through the AI gateway with an honest scaffold fallback. Attribution + Payout
// live in creator-engine.ts (split, cycle meter, fraud score, gate).

import { gatewayComplete, GatewayUnconfiguredError } from "@/backend/gateway";
import { MIN_PAYOUT_FOLLOWERS } from "@/shared/creator-program";
import type { Programme, CreatorAccount } from "@/backend/creator-engine";

// ---- Scout Agent: score an applicant (audience fit, engagement, authenticity)
export type ScoutInput = { followers: number; platforms: number; engagementPct?: number; niche?: string; brandNiche?: string };
export function scoutScore(input: ScoutInput): { score: number; flags: string[]; verdict: "approve" | "review" | "reject" } {
  const flags: string[] = [];
  let score = 50;
  // Combined-follower welcome for micro/local: spread across platforms is good.
  if (input.platforms >= 3) score += 10;
  if (input.followers >= MIN_PAYOUT_FOLLOWERS) score += 15; else flags.push("below 10K combined — can accrue, not yet payable");
  // Engagement authenticity heuristic — very low engagement at high followers = bought-follower risk.
  const eng = input.engagementPct ?? -1;
  if (eng >= 0) {
    if (eng < 0.5 && input.followers > 20000) { score -= 25; flags.push("low engagement vs following — possible bought followers"); }
    else if (eng >= 2) score += 15;
  }
  // Niche fit.
  if (input.niche && input.brandNiche && input.niche.toLowerCase().split(/\W+/).some((w) => w.length > 3 && input.brandNiche!.toLowerCase().includes(w))) score += 10;
  score = Math.max(0, Math.min(100, score));
  const verdict = score >= 65 ? "approve" : score >= 45 ? "review" : "reject";
  return { score, flags, verdict };
}

// ---- Match Agent: rank the 1–100 catalogue for a creator by audience fit
export function matchProgrammes(creatorNiche: string, catalogue: Programme[]): { programmeId: string; name: string; brandName: string; fit: number; why: string }[] {
  const words = (creatorNiche || "").toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  return catalogue.map((p) => {
    const hay = `${p.name} ${p.product} ${p.description}`.toLowerCase();
    const hits = words.filter((w) => hay.includes(w)).length;
    const fit = Math.min(100, 30 + hits * 20);
    return { programmeId: p.id, name: p.name, brandName: p.brandName, fit, why: hits > 0 ? `Matches your niche on: ${words.filter((w) => hay.includes(w)).slice(0, 3).join(", ")}` : "General fit — worth testing with your audience." };
  }).sort((a, b) => b.fit - a.fit);
}

// ---- Brief Agent: generate the campaign brief (AI, with scaffold fallback)
export type Brief = { mode: "live" | "scaffold"; talkingPoints: string[]; prohibitedClaims: string[]; disclosure: string; deliverables: string[] };
const BRIEF_SYSTEM = `You are the MarketWar Brief Agent. Produce a creator campaign brief for a product. British English. Compliant with UK ASA/CMA influencer rules. Return STRICT JSON only:
{ "talkingPoints": string[], "prohibitedClaims": string[], "disclosure": string, "deliverables": string[] }
talkingPoints: 4-6 honest selling angles. prohibitedClaims: 3-5 things the creator must NOT say (no guaranteed-income/health/financial-return claims). disclosure: the exact mandatory ad-disclosure wording. deliverables: 3-5 concrete deliverables.`;

export async function generateBrief(programme: { name: string; product: string; description: string }, lang?: string): Promise<Brief> {
  const prompt = `Product/programme: ${programme.name}\nWhat it is: ${programme.product}\nDetails: ${programme.description}`;
  try {
    const res = await gatewayComplete({ system: BRIEF_SYSTEM, prompt, maxTokens: 900, lang });
    const m = res.text.match(/\{[\s\S]*\}/);
    if (m) {
      const p = JSON.parse(m[0]) as Record<string, unknown>;
      const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
      if (arr(p.talkingPoints).length) return { mode: "live", talkingPoints: arr(p.talkingPoints), prohibitedClaims: arr(p.prohibitedClaims), disclosure: String(p.disclosure || "#ad — paid partnership."), deliverables: arr(p.deliverables) };
    }
  } catch (e) { if (!(e instanceof GatewayUnconfiguredError)) { /* scaffold */ } }
  return {
    mode: "scaffold",
    talkingPoints: [`What ${programme.name} does and who it's for`, "The single strongest benefit for your audience", "A real, honest use case", "Why now — the offer or hook"],
    prohibitedClaims: ["No guaranteed-income or 'get rich' claims", "No health/financial-return promises", "No fabricated results or fake testimonials", "Nothing a competitor could call misleading"],
    disclosure: "#ad — this is a paid partnership with the brand. (Mandatory under UK ASA/CMA rules.)",
    deliverables: ["1 primary video/post with your tracked code", "1 follow-up story/short", "Pinned comment with the link", "Honest AI-content disclosure where used"],
  };
}
