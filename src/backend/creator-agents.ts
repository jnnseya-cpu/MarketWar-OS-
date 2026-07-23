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

// ---- Follower Verification Agent: read the PUBLIC profile view, extract the
// printed follower/subscriber count. If it can't (JS-rendered, blocked, or no
// number found), it honestly returns human_required — never a made-up number.
export type FollowerVerification = { url: string; platform?: string; count: number | null; method: "ai" | "human_required"; confidence: number; note: string };

const NUM = /([0-9][0-9.,]*\s?[KMB]?)\s*(followers|subscribers|abonnés|abonnes)/i;
function parseCount(s: string): number | null {
  const m = s.match(NUM);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/,/g, ""));
  const suffix = m[1].trim().slice(-1).toUpperCase();
  if (suffix === "K") n *= 1e3; else if (suffix === "M") n *= 1e6; else if (suffix === "B") n *= 1e9;
  return Number.isFinite(n) ? Math.round(n) : null;
}

export async function verifyFollowersFromProfile(url: string, platform?: string): Promise<FollowerVerification> {
  if (!/^https?:\/\//i.test(url)) return { url, platform, count: null, method: "human_required", confidence: 0, note: "Not a valid public URL — needs human verification." };
  let html = "";
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; MarketWarBot/1.0; +https://marketwaros.com)" } });
    clearTimeout(t);
    if (res.ok) html = (await res.text()).slice(0, 200_000);
  } catch { /* fall through to human_required */ }
  if (!html) return { url, platform, count: null, method: "human_required", confidence: 0, note: "Public page could not be read (blocked or JS-only) — a human should verify the printed count." };
  // Cheap deterministic pass on visible text first.
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const direct = parseCount(text);
  if (direct != null) return { url, platform, count: direct, method: "ai", confidence: 0.7, note: "Read from the public profile view." };
  // AI extraction pass — ask the model to find the printed follower number.
  try {
    const res = await gatewayComplete({ system: "Extract ONLY the public follower/subscriber count shown on this page. Reply with a single integer (no commas, no words). If none is clearly shown, reply exactly: NONE.", prompt: text.slice(0, 12_000), maxTokens: 12 });
    const n = parseInt((res.text.match(/\d[\d,]*/)?.[0] || "").replace(/,/g, ""), 10);
    if (Number.isFinite(n) && n > 0) return { url, platform, count: n, method: "ai", confidence: 0.6, note: "Extracted by the verification agent from the public view." };
  } catch { /* human */ }
  return { url, platform, count: null, method: "human_required", confidence: 0, note: "No follower count found on the public view — a human should verify." };
}

export async function verifyFollowersBatch(socials: { platform?: string; url: string }[]): Promise<{ results: FollowerVerification[]; verifiedTotal: number; humanRequired: number }> {
  const results = await Promise.all(socials.filter((s) => s.url).map((s) => verifyFollowersFromProfile(s.url, s.platform)));
  const verifiedTotal = results.reduce((sum, r) => sum + (r.count || 0), 0);
  const humanRequired = results.filter((r) => r.method === "human_required").length;
  return { results, verifiedTotal, humanRequired };
}

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
