// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// THE GROWTH BRIEF, CONSUMED INVISIBLY (Trend Intelligence §14.5, §16).
//
// OWNER DIRECTIVE: this machinery works without being seen. No panel, no
// chips, no screen to operate — an agent that runs for a brand silently picks
// up whatever brief is actually in force for the channel it is about to work
// on, and runs on baseline instructions when there is none.
//
// WHY A PREAMBLE AND NOT A PARAMETER. The agent route already does exactly
// this for three other kinds of fact: live DNS records, the brand's shared
// memory, and a live crawl of the site. Each is gathered before the call and
// handed to the model as stated facts, because an agent that has to ASK for
// something the platform already holds is a dead end for the customer. A brief
// is the same shape of thing — the constraints the installation has already
// approved — so it travels the same way.
//
// §14.5 IS THE RULE THIS FILE EXISTS TO HONOUR, verbatim: *"On timeout,
// disabled entitlement, missing capability or no approved brief, use host
// baseline behaviour."* So EVERY path here that cannot produce a brief returns
// null and the agent runs exactly as it did before. A brief is an upgrade to a
// run, never a precondition for one — if this file threw, or blocked, or made
// a run conditional on a brief existing, it would have turned an optional
// improvement into a new way for the platform to stop working.
//
// AND NOTHING UNAPPROVED REACHES A MODEL. `effectiveBrief` refuses a brief
// that is not approved, is outside its window, is for another market or
// locale, was approved under a different policy version, or whose publish lane
// is frozen. This file adds no second opinion about any of that: it asks, and
// it uses what comes back or nothing.

import { effectiveBrief } from "@/backend/growth-brief-store";
import { listBriefs } from "@/backend/growth-brief-store";
import type { GrowthBrief } from "@/shared/growth-brief";
import type { BriefChannel } from "@/shared/growth-brief";

/**
 * Which brief channel an agent's work actually lands on.
 *
 * DELIBERATELY SPARSE. An agent only appears here when its output plainly goes
 * out on one of v1's two live routes — search-facing pages, or organic social.
 * Everything absent resolves no brief and runs on baseline, which is the
 * correct answer rather than a gap: guessing a channel for an agent that
 * writes an internal strategy document would apply publication constraints to
 * something that is never published, and the first symptom would be an agent
 * refusing to mention a product because a brief for a different surface said
 * not to.
 */
export const AGENT_CHANNEL: Record<string, BriefChannel> = {
  "seo-strategist": "seo",
  "content-factory": "seo",
  "organic-dominance": "seo",
  "website-intelligence": "seo",
  "landing-page-architect": "seo",
  "conversion-architect": "seo",
  "local-growth": "seo",
  "geo-recon": "seo",
  "citation-radar": "seo",
  "caption-engine": "organic_social",
  "viral-hook": "organic_social",
  "amplification-strategist": "organic_social",
  "thumbnail-title": "organic_social",
};

export type BriefPreflight = {
  brief: GrowthBrief;
  channel: BriefChannel;
  /** What the model is told. Facts and constraints, never instructions about tone. */
  preamble: string;
};

/**
 * Render an in-force brief as the facts an agent must work inside.
 *
 * The approved and prohibited claims are the load-bearing part. A prohibited
 * claim is not a style preference — it is something this installation has
 * decided it may not say, usually because saying it is a regulatory or
 * contractual problem, and it is stated as an absolute rather than a
 * suggestion.
 */
export function briefPreamble(brief: GrowthBrief, channel: BriefChannel): string {
  return [
    `AN APPROVED GROWTH BRIEF IS IN FORCE for this brand on ${channel}. It was reviewed and signed off inside this platform, it is inside its validity window, and it is the authority for this piece of work. Treat everything below as a constraint, not a suggestion.`,
    `- Topic: ${brief.topic_id}`,
    `- Objective: ${brief.objective}`,
    `- Audience: ${brief.audience}`,
    `- Intent to serve: ${brief.intent}`,
    `- Market and language: ${brief.market}, ${brief.locale}`,
    brief.approved_claim_ids.length
      ? `- Claims approved for use (ids, as held in this platform's claim register): ${brief.approved_claim_ids.join(", ")}. Make no factual claim about the product beyond these.`
      : "- No claims have been approved. Make no factual claim about the product at all.",
    brief.prohibited_claims.length
      ? `- MUST NOT SAY, under any phrasing or synonym: ${brief.prohibited_claims.join("; ")}. This is absolute. If the obvious way to make the point requires one of these, make a different point.`
      : "",
    `- Call to action to drive towards: ${brief.cta_id}`,
    `- Channels this brief covers: ${brief.allowed_channels.join(", ")}. Do not produce work for any other channel under this brief.`,
    `- It expires at ${brief.expires_at}. Nothing here authorises work after that.`,
    `(Brief ${brief.brief_id} v${brief.brief_version}, policy version ${brief.policy_version}.)`,
  ].filter(Boolean).join("\n");
}

/**
 * The first resolution that actually AUTHORISES work — pure, and exported so
 * the one decision in this file can be driven directly.
 *
 * It was `if (resolved.ok) return { brief: resolved.brief, ... }` inline, and a
 * mutation sweep showed that replacing the condition with `true` broke no test.
 * The reason is worse than the mutant: a refusal carries no `brief`, so the
 * mutated version built a preamble from `undefined`, threw, and the catch below
 * swallowed it into the same `null` the correct code returns. **The check was
 * being kept honest by an exception being discarded** — a check that passes for
 * a reason unrelated to what it tests, which is this repo's second-oldest
 * defect class. Pulled out here, `ok` is load-bearing and a test can say so.
 */
export function firstInForce(
  results: readonly { ok: boolean; brief?: GrowthBrief }[],
): GrowthBrief | null {
  for (const r of results || []) {
    // BOTH CONDITIONS. `ok` is the verdict and `brief` is the payload, and a
    // result carrying one without the other is a result nothing should act on.
    if (r && r.ok === true && r.brief) return r.brief;
  }
  return null;
}

/**
 * The brief in force for this agent and brand, or null — silently.
 *
 * NEVER THROWS. The caller is a pre-flight step inside a paid agent run, and a
 * brief is an improvement to that run rather than a condition of it. An
 * exception escaping this function would turn "there is no brief today" into a
 * failed agent call the customer has already been charged for.
 */
export async function briefFor(input: {
  agentId: string;
  brandId: string;
  nowISO: string;
  /** Overrides the agent's default channel, when the caller genuinely knows better. */
  channel?: BriefChannel;
  market?: string;
  locale?: string;
  policy_version?: number;
}): Promise<BriefPreflight | null> {
  try {
    const channel = input.channel ?? AGENT_CHANNEL[input.agentId];
    if (!channel) return null;
    const brandId = (input.brandId || "").trim();
    if (!brandId) return null;

    // WHICH BRIEF. A brand may hold several; the one that applies is the one
    // that resolves for this channel. They are tried newest first, and the
    // first that `effectiveBrief` accepts wins — asking the resolver rather
    // than re-deciding here, because a second opinion about validity is a
    // second rulebook and the two disagree the first time either is edited.
    const candidates = await listBriefs(brandId, 20);
    const resolved = [];
    for (const stored of candidates) {
      resolved.push(await effectiveBrief({
        brandId,
        briefId: stored.brief.brief_id,
        req: {
          channel,
          market: input.market,
          locale: input.locale,
          policy_version: input.policy_version,
          nowISO: input.nowISO,
        },
      }));
    }
    const chosen = firstInForce(resolved);
    if (!chosen) return null;
    return { brief: chosen, channel, preamble: briefPreamble(chosen, channel) };
  } catch {
    // §14.5: baseline behaviour. Silently, because the customer asked for an
    // agent run and got one.
    return null;
  }
}
