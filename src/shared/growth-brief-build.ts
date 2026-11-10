// THE BRIEF COORDINATOR — Trend Intelligence AI v2.3 §4 ("brief coordinator")
// and §5/§17 (validity windows).
//
// WHAT WAS MISSING. `trend-score.ts` decides whether a demand opportunity may
// become a brief (`assess`/`decide` → a `Decision`), and `growth-brief.ts`
// validates and resolves a brief once one exists (`validateShape`/
// `resolveEffective`). Nothing turned the first into the second. This file is
// that one step and nothing more: a `Decision` plus the installation's own
// identifiers becomes a contract-valid `GrowthBrief`, or a named refusal.
//
// WHY A SEPARATE, PURE FUNCTION. §4 gives the brief coordinator a single job —
// "one shared Growth Brief plus channel-specific job assignments" — and the
// safe place to assemble a partly-generated object is before it reaches a
// store or a model, where the assembly can be driven directly. So, like its two
// neighbours, this has no clock, no store and no model: the caller supplies
// `valid_from`; the window is computed from it; everything else is data.
//
// THE TWO INVARIANTS IT ENFORCES, both load-bearing:
//
//   • ONLY A DECISION THAT AUTHORISES A BRIEF PRODUCES ONE. §5's table makes a
//     brief at `band: "brief"` or `"auto_eligible"` and nothing lower. A
//     watch/archive item assembled into a brief would be a watch item issued as
//     an approved instruction — exactly the rounding error TI-03 guards against,
//     one layer up. A veto lands in `watch` (trend-score.ts), so it is refused
//     here too, by the same gate.
//
//   • THE OUTPUT IS VALIDATED BEFORE IT IS RETURNED. The assembled object is
//     passed through `validateShape`, so a caller can never receive a brief this
//     file would itself reject. The scores come from the `Decision`, never from
//     a second copy, so the number that cleared the gate is the number in the
//     brief.
//
// §17's windows: persistent topics default to seven days, breaking topics to
// twenty-four hours. "Limit one active brief per platform, market and topic" is
// a persistence rule and lives with the store, not here.

import { validateShape, type BriefChannel, type GrowthBrief } from "./growth-brief";
import type { Decision } from "./trend-score";

/** §17: "Default seven days for persistent topics and 24 hours for breaking topics." */
export type TopicClass = "persistent" | "breaking";
export const BRIEF_TTL_MS: Record<TopicClass, number> = {
  persistent: 7 * 24 * 60 * 60 * 1000,
  breaking: 24 * 60 * 60 * 1000,
};

/**
 * Everything the coordinator needs that is NOT already in the `Decision`.
 *
 * The scores are deliberately absent — they come from the decision, so the
 * value that cleared the gate is the value written into the brief.
 */
export type BriefCoordinates = {
  brief_id: string;
  brief_version: number;
  tenant_id: string;
  platform_id: string;
  topic_id: string;
  market: string;
  locale: string;
  audience: string;
  intent: string;
  objective: string;
  cta_id: string;
  experiment_id: string;
  evidence_ids: string[];
  approved_claim_ids: string[];
  allowed_channels: BriefChannel[];
  prohibited_claims: string[];
  policy_version: number;
  /** The moment the brief takes effect, as an RFC 3339 UTC timestamp ending in Z. */
  valid_from: string;
  /** Sets the validity window length (§17). Defaults to persistent. */
  topicClass?: TopicClass;
};

export type BuildResult =
  | { ok: true; brief: GrowthBrief }
  | { ok: false; errors: string[] };

/**
 * Turn a scored decision into a contract-valid Growth Brief, or refuse by name.
 *
 * Pure: the only time it reads is `valid_from`, which the caller supplies; the
 * expiry is derived, never taken from a clock of its own.
 */
export function buildGrowthBrief(decision: Decision, coords: BriefCoordinates): BuildResult {
  // Invariant 1: only a decision that authorises a brief produces one.
  if (decision.band !== "brief" && decision.band !== "auto_eligible") {
    const held = decision.vetoes.length ? ` (held: ${decision.vetoes.join(", ")})` : "";
    return {
      ok: false,
      errors: [
        `decision band '${decision.band}'${held} does not authorise a brief; ` +
          `only 'brief' or 'auto_eligible' do (§5).`,
      ],
    };
  }

  const from = Date.parse(coords.valid_from);
  if (!Number.isFinite(from)) {
    return { ok: false, errors: ["valid_from: not a readable UTC timestamp"] };
  }
  const ttl = BRIEF_TTL_MS[coords.topicClass ?? "persistent"];
  const expires_at = new Date(from + ttl).toISOString();

  // Scores come from the decision — a single source of truth, not a re-passed copy.
  const candidate = {
    schema_version: 1 as const,
    brief_id: coords.brief_id,
    brief_version: coords.brief_version,
    tenant_id: coords.tenant_id,
    platform_id: coords.platform_id,
    market: coords.market,
    locale: coords.locale,
    topic_id: coords.topic_id,
    opportunity_score: decision.opportunity,
    confidence: decision.confidence,
    valid_from: coords.valid_from,
    expires_at,
    evidence_ids: coords.evidence_ids,
    audience: coords.audience,
    intent: coords.intent,
    approved_claim_ids: coords.approved_claim_ids,
    cta_id: coords.cta_id,
    allowed_channels: coords.allowed_channels,
    prohibited_claims: coords.prohibited_claims,
    objective: coords.objective,
    experiment_id: coords.experiment_id,
    policy_version: coords.policy_version,
  };

  // Invariant 2: a caller never receives a brief this file would itself reject.
  const shape = validateShape(candidate);
  return shape.ok ? { ok: true, brief: shape.brief } : { ok: false, errors: shape.errors };
}
