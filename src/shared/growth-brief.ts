// THE CONTRACT THAT CONNECTS EVERY AGENT — Trend Intelligence AI v2.3 §6 and
// Appendix A.
//
// WHAT A GROWTH BRIEF IS. One approved, versioned, time-limited instruction
// that changes what the existing agents prioritise at run time: the audience,
// the intent, which claims may be made, which must not, which channels are
// open, and what outcome counts. The SEO agent and the marketing agent read the
// SAME brief, so their work agrees without either of them being rewritten.
//
// WHY IT IS THE FIRST THING BUILT. Every other part of that specification
// references it. Actions carry `brief_version`; approval binds to it; the
// experiment freezes its hypothesis against it; and expiry is the whole reason
// a stale brief is safe rather than dangerous. Built after the action executor,
// the executor would have nothing to validate against.
//
// ───────────────────────────────────────────────────────────────────────────
// THE DISTINCTION THIS MODULE EXISTS TO MAKE, in the spec's own words:
//
//     "A schema-valid object can still fail these checks."
//
// So there are two gates here and they are deliberately separate functions:
//
//   • `validateShape` — the closed object. Every required field, nothing extra,
//     ids that match the pattern, scores in range, two-letter market, a UTC
//     timestamp that actually ends in Z, channels from the enum, bounded text.
//     This is Appendix A's JSON Schema, hand-written because the platform has
//     seven production dependencies and adding a schema library to validate one
//     object would be the dearest line in the file.
//
//   • `resolveEffective` — the runtime rules. `valid_from < expires_at`,
//     `valid_from <= now < expires_at`, the channel asked for is one the brief
//     allows, the market and locale match what was asked, the policy version
//     matches. A brief that passes the first and fails the second is the
//     dangerous case: it looks right and it is out of date.
//
// WHY `additionalProperties: false` IS LOAD-BEARING AND NOT PEDANTRY. The brief
// is partly generated and travels through a model. Conformance scenario TI-06
// is "model input contains instructions to bypass approvals or change spend" and
// the required outcome is that no privileged action can result. A closed object
// is how that is enforced at the contract: an extra `allow_publish: true` or
// `spend_cap: 99999` is not ignored, it is a REJECTION. Ignoring an unknown
// field is how an injected instruction becomes a field somebody later reads.
//
// NOTHING HERE TOUCHES A MODEL, A STORE OR A CLOCK IT DOES NOT RECEIVE. It is
// in `shared/` and pure, so the dangerous inputs can be driven directly — a
// boundary reachable only through a database is a boundary nobody tests.

/** Appendix A: the six channel routes. Two are live in v1; the rest reserve stable values. */
export const BRIEF_CHANNELS = [
  "seo", "organic_social", "sales_enablement", "owned_placement", "lifecycle", "paid",
] as const;
export type BriefChannel = (typeof BRIEF_CHANNELS)[number];

/**
 * The two routes a v1 draft may actually take.
 *
 * The spec is explicit that the wider enum is not a feature list: *"The broader
 * channel enum reserves stable routing values for future adapters and makes no
 * feature available on its own."* So a brief may ALLOW `paid` and still have no
 * adapter to run it — which is a different answer from "that channel does not
 * exist", and the difference is what stops a customer being told a capability
 * is broken when it was never enabled.
 */
export const LIVE_DRAFT_CHANNELS: readonly BriefChannel[] = ["seo", "organic_social"];

/** Appendix A `$defs.id`. */
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
/** Appendix A `$defs.utc` — a timestamp, and it must end in Z. */
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
/** ISO alpha-2. `ZZ` is reserved for explicitly global briefs (§16). */
const MARKET = /^[A-Z]{2}$/;
const SHORT_TEXT_MAX = 500;
const ID_LIST_MAX = 64;

/** §16: "Reserve ZZ for explicitly global, non-country-targeted briefs." */
export const GLOBAL_MARKET = "ZZ";

export type GrowthBrief = {
  schema_version: 1;
  brief_id: string;
  brief_version: number;
  tenant_id: string;
  platform_id: string;
  market: string;
  locale: string;
  topic_id: string;
  opportunity_score: number;
  confidence: number;
  valid_from: string;
  expires_at: string;
  evidence_ids: string[];
  audience: string;
  intent: string;
  approved_claim_ids: string[];
  cta_id: string;
  allowed_channels: BriefChannel[];
  prohibited_claims: string[];
  objective: string;
  experiment_id: string;
  policy_version: number;
};

/** Every required key, in the spec's order. The source of truth for "closed". */
export const BRIEF_REQUIRED = [
  "schema_version", "brief_id", "brief_version", "tenant_id", "platform_id",
  "market", "locale", "topic_id", "opportunity_score", "confidence",
  "valid_from", "expires_at", "evidence_ids", "audience", "intent",
  "approved_claim_ids", "cta_id", "allowed_channels", "prohibited_claims",
  "objective", "experiment_id", "policy_version",
] as const;

export type ShapeResult =
  | { ok: true; brief: GrowthBrief }
  | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

function idList(v: unknown, field: string, errors: string[], minItems = 0): string[] | null {
  if (!Array.isArray(v)) { errors.push(`${field}: must be an array`); return null; }
  if (v.length < minItems) { errors.push(`${field}: needs at least ${minItems} item(s)`); return null; }
  if (v.length > ID_LIST_MAX) { errors.push(`${field}: more than ${ID_LIST_MAX} items`); return null; }
  const out: string[] = [];
  for (const [i, x] of v.entries()) {
    if (typeof x !== "string" || !ID.test(x)) { errors.push(`${field}[${i}]: not a valid id`); continue; }
    if (out.includes(x)) { errors.push(`${field}[${i}]: duplicate (${x})`); continue; }
    out.push(x);
  }
  return errors.length ? null : out;
}

function shortText(v: unknown, field: string, errors: string[]): string | null {
  if (typeof v !== "string") { errors.push(`${field}: must be a string`); return null; }
  if (v.length < 1 || v.length > SHORT_TEXT_MAX) { errors.push(`${field}: 1–${SHORT_TEXT_MAX} characters`); return null; }
  return v;
}

function score(v: unknown, field: string, errors: string[]): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) { errors.push(`${field}: must be a number`); return null; }
  if (v < 0 || v > 100) { errors.push(`${field}: must be 0–100`); return null; }
  return v;
}

function ident(v: unknown, field: string, errors: string[]): string | null {
  if (typeof v !== "string" || !ID.test(v)) { errors.push(`${field}: not a valid id`); return null; }
  return v;
}

/**
 * Appendix A, as a function.
 *
 * Returns EVERY error rather than the first, because a brief is reviewed by a
 * person: "three fields are wrong and here they are" is one correction, and
 * "field 4 is wrong" four times over is four rounds of guessing.
 */
export function validateShape(input: unknown): ShapeResult {
  const errors: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ["not an object"] };

  // CLOSED FIRST, because this is the security property. An injected
  // `allow_publish` must be a refusal and not a field somebody later reads.
  const allowed = new Set<string>(BRIEF_REQUIRED);
  const extra = Object.keys(input).filter((k) => !allowed.has(k)).sort();
  if (extra.length) errors.push(`unexpected field(s): ${extra.join(", ")} — this object is closed`);
  const missing = BRIEF_REQUIRED.filter((k) => !(k in input));
  if (missing.length) errors.push(`missing field(s): ${missing.join(", ")}`);

  if (input.schema_version !== 1) errors.push("schema_version: must be exactly 1");
  const brief_id = ident(input.brief_id, "brief_id", errors);
  const tenant_id = ident(input.tenant_id, "tenant_id", errors);
  const platform_id = ident(input.platform_id, "platform_id", errors);
  const topic_id = ident(input.topic_id, "topic_id", errors);
  const cta_id = ident(input.cta_id, "cta_id", errors);
  const experiment_id = ident(input.experiment_id, "experiment_id", errors);

  const brief_version = Number.isInteger(input.brief_version) && (input.brief_version as number) >= 1
    ? (input.brief_version as number) : (errors.push("brief_version: integer >= 1"), null);
  const policy_version = Number.isInteger(input.policy_version) && (input.policy_version as number) >= 1
    ? (input.policy_version as number) : (errors.push("policy_version: integer >= 1"), null);

  if (typeof input.market !== "string" || !MARKET.test(input.market)) errors.push("market: two uppercase letters (ISO alpha-2, or ZZ for global)");
  if (typeof input.locale !== "string" || input.locale.length < 2 || input.locale.length > 35) errors.push("locale: 2–35 characters");

  const opportunity_score = score(input.opportunity_score, "opportunity_score", errors);
  const confidence = score(input.confidence, "confidence", errors);

  for (const f of ["valid_from", "expires_at"] as const) {
    const v = input[f];
    if (typeof v !== "string" || !UTC.test(v) || !Number.isFinite(Date.parse(v))) {
      errors.push(`${f}: an RFC 3339 UTC timestamp ending in Z`);
    }
  }

  // minItems: 1 — a brief with no evidence is an opinion.
  const evidence_ids = idList(input.evidence_ids, "evidence_ids", errors, 1);
  const approved_claim_ids = idList(input.approved_claim_ids, "approved_claim_ids", errors, 0);

  const audience = shortText(input.audience, "audience", errors);
  const intent = shortText(input.intent, "intent", errors);
  const objective = shortText(input.objective, "objective", errors);

  let allowed_channels: BriefChannel[] | null = null;
  if (!Array.isArray(input.allowed_channels)) {
    errors.push("allowed_channels: must be an array");
  } else if (input.allowed_channels.length < 1 || input.allowed_channels.length > 6) {
    errors.push("allowed_channels: 1–6 items");
  } else {
    const seen: BriefChannel[] = [];
    for (const [i, c] of input.allowed_channels.entries()) {
      if (typeof c !== "string" || !(BRIEF_CHANNELS as readonly string[]).includes(c)) {
        errors.push(`allowed_channels[${i}]: not one of ${BRIEF_CHANNELS.join(", ")}`);
        continue;
      }
      if (seen.includes(c as BriefChannel)) { errors.push(`allowed_channels[${i}]: duplicate (${c})`); continue; }
      seen.push(c as BriefChannel);
    }
    allowed_channels = seen;
  }

  let prohibited_claims: string[] | null = null;
  if (!Array.isArray(input.prohibited_claims)) {
    errors.push("prohibited_claims: must be an array");
  } else if (input.prohibited_claims.length > 32) {
    errors.push("prohibited_claims: at most 32 items");
  } else {
    const out: string[] = [];
    for (const [i, c] of input.prohibited_claims.entries()) {
      if (typeof c !== "string" || c.length < 1 || c.length > SHORT_TEXT_MAX) {
        errors.push(`prohibited_claims[${i}]: 1–${SHORT_TEXT_MAX} characters`);
        continue;
      }
      if (out.includes(c)) { errors.push(`prohibited_claims[${i}]: duplicate`); continue; }
      out.push(c);
    }
    prohibited_claims = out;
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    brief: {
      schema_version: 1,
      brief_id: brief_id!, brief_version: brief_version!,
      tenant_id: tenant_id!, platform_id: platform_id!,
      market: input.market as string, locale: input.locale as string,
      topic_id: topic_id!,
      opportunity_score: opportunity_score!, confidence: confidence!,
      valid_from: input.valid_from as string, expires_at: input.expires_at as string,
      evidence_ids: evidence_ids!,
      audience: audience!, intent: intent!,
      approved_claim_ids: approved_claim_ids!,
      cta_id: cta_id!,
      allowed_channels: allowed_channels!,
      prohibited_claims: prohibited_claims!,
      objective: objective!,
      experiment_id: experiment_id!,
      policy_version: policy_version!,
    },
  };
}

// ---------------------------------------------------------------------------
// The runtime rules — "a schema-valid object can still fail these checks"
// ---------------------------------------------------------------------------

export type EffectiveRequest = {
  /** The channel the agent is about to work on. */
  channel: string;
  market?: string;
  locale?: string;
  topic_id?: string;
  /** The policy revision the caller is running under, when it has one. */
  policy_version?: number;
  nowISO: string;
};

export type EffectiveResult =
  | { ok: true; brief: GrowthBrief; note: string }
  /**
   * NOT AN ERROR — the spec's 204. There is no eligible brief, so the agent
   * uses its baseline behaviour. §14.5: *"On timeout, disabled entitlement,
   * missing capability or no approved brief, use host baseline behaviour."*
   * Reporting this as a failure is how a caller learns to ignore failures.
   */
  | { ok: false; baseline: true; reason: string; code: EffectiveRefusal };

export type EffectiveRefusal =
  | "invalid" | "not_yet_valid" | "expired" | "channel_not_allowed"
  | "market_mismatch" | "locale_mismatch" | "topic_mismatch" | "policy_mismatch"
  | "unreadable_window"
  /**
   * §14's channel freeze. NOT decided here — this module has no clock it was
   * not given and no store at all, so it cannot know a lane is halted. The
   * code lives in this union so that the platform's existing emergency stop
   * refuses through the SAME shape as every other refusal: a caller that
   * handles `{ok:false, baseline:true, code}` already handles a freeze, which
   * is the whole point of having one shape.
   */
  | "channel_frozen"
  /** The brief was never approved, or its approval was invalidated by an edit (§18). */
  | "not_approved"
  /** No brief of that id belongs to this tenant. Never "not found", which leaks whether it exists. */
  | "no_such_brief";

/**
 * Resolve one approved, fresh brief for this channel — or say to fall back.
 *
 * The order of these checks is the order of their consequences. Expiry is
 * checked before channel because an expired brief is unusable for every
 * channel, and reporting "that channel is not allowed" about a brief that
 * expired yesterday sends somebody to change the wrong setting.
 */
export function resolveEffective(input: unknown, req: EffectiveRequest): EffectiveResult {
  const shape = validateShape(input);
  if (!shape.ok) {
    return { ok: false, baseline: true, code: "invalid", reason: `The brief does not match the v1 contract, so it is not used: ${shape.errors.slice(0, 3).join("; ")}` };
  }
  const brief = shape.brief;

  const from = Date.parse(brief.valid_from);
  const until = Date.parse(brief.expires_at);
  const now = Date.parse(req.nowISO);
  if (!Number.isFinite(now)) {
    return { ok: false, baseline: true, code: "unreadable_window", reason: "The current time could not be read, and a validity window cannot be checked against an unknown clock." };
  }
  // Appendix A runtime rules: valid_from < expires_at, then valid_from <= now < expires_at.
  if (!(from < until)) {
    return { ok: false, baseline: true, code: "unreadable_window", reason: `This brief expires at or before it begins (${brief.valid_from} → ${brief.expires_at}), which is not a validity window.` };
  }
  if (now < from) {
    return { ok: false, baseline: true, code: "not_yet_valid", reason: `This brief does not take effect until ${brief.valid_from}. Until then the baseline instructions apply.` };
  }
  // STRICTLY BEFORE `expires_at`. At the instant it expires it is expired —
  // "now < expires_at" and not "<=", because a brief that is valid for one
  // millisecond after its own expiry is a brief with a different expiry.
  if (now >= until) {
    return { ok: false, baseline: true, code: "expired", reason: `This brief expired at ${brief.expires_at}. An expired brief can never authorise work: use the baseline instructions and fetch the current brief.` };
  }

  const channel = (req.channel || "").trim();
  if (!(brief.allowed_channels as readonly string[]).includes(channel)) {
    return { ok: false, baseline: true, code: "channel_not_allowed", reason: `This brief allows ${brief.allowed_channels.join(", ")} and not ${channel || "(no channel given)"}.` };
  }

  // MARKET: an explicitly global brief (ZZ) never satisfies a country-targeted
  // lookup, which is §16's rule and the opposite of the convenient reading. A
  // global brief answering a request for Canada would put global copy on a
  // Canadian page and nothing would say so.
  if (req.market && req.market !== brief.market) {
    return { ok: false, baseline: true, code: "market_mismatch", reason: brief.market === GLOBAL_MARKET
      ? `This brief is explicitly global (ZZ) and does not match a request for ${req.market}.`
      : `This brief is for ${brief.market}, not ${req.market}.` };
  }
  if (req.locale && req.locale !== brief.locale) {
    return { ok: false, baseline: true, code: "locale_mismatch", reason: `This brief is written for ${brief.locale}, not ${req.locale}.` };
  }
  if (req.topic_id && req.topic_id !== brief.topic_id) {
    return { ok: false, baseline: true, code: "topic_mismatch", reason: `This brief is about ${brief.topic_id}, not ${req.topic_id}.` };
  }
  // POLICY: §18 — "Edits, expiry or relevant policy/profile changes invalidate
  // approval." A brief approved under policy 5 cannot direct work being done
  // under policy 6, because the thing that was approved is not the thing that
  // would happen.
  if (typeof req.policy_version === "number" && req.policy_version !== brief.policy_version) {
    return { ok: false, baseline: true, code: "policy_mismatch", reason: `This brief was approved under policy version ${brief.policy_version}; this installation is running policy version ${req.policy_version}. Re-approve it against the current policy.` };
  }

  const msLeft = until - now;
  return {
    ok: true, brief,
    note: `Brief ${brief.brief_id} v${brief.brief_version} for ${brief.market}/${brief.locale}, ${channel}. ${Math.floor(msLeft / 60000)} minute(s) of validity left.`,
  };
}

/**
 * The longest an SDK may cache a resolved brief, in milliseconds.
 *
 * §14.5: *"The SDK may cache within a 60-second ceiling and never beyond
 * expiry."* Both halves matter and the second is the one that gets forgotten: a
 * 60-second cache on a brief with 10 seconds left is 50 seconds of an expired
 * brief directing live work.
 */
export const CACHE_CEILING_MS = 60_000;

/** How long this brief may be held, given when it expires. Never beyond either. */
export function cacheableForMs(brief: GrowthBrief, nowISO: string): number {
  const until = Date.parse(brief.expires_at);
  const now = Date.parse(nowISO);
  if (!Number.isFinite(until) || !Number.isFinite(now)) return 0;
  return Math.max(0, Math.min(CACHE_CEILING_MS, until - now));
}

/**
 * Is this channel actually runnable, or only reserved?
 *
 * Separate from "is it allowed", because they are different answers and
 * collapsing them is how a customer is told a feature is broken when it was
 * never released. §Appendix A: the wider enum "makes no feature available on
 * its own".
 */
export function channelIsLive(channel: string): boolean {
  return (LIVE_DRAFT_CHANNELS as readonly string[]).includes(channel);
}
