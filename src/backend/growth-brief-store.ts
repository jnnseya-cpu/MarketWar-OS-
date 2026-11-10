// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// WHERE A GROWTH BRIEF LIVES, AND WHAT IT HAS TO CLEAR TO EXIST (Trend
// Intelligence §6, §9, §14, §16, §18).
//
// The rules are not here. The contract — 22 required fields, a closed object,
// the ordered runtime refusals — is `shared/growth-brief.ts`, and the scoring
// gate is `shared/trend-score.ts`. Both are pure, and this module is deliberately
// only storage plus wiring: a store that decides what a valid brief is becomes a
// second rulebook, and the two disagree the first time either is edited. Same
// reasoning as `opportunity-board-store.ts`, which says so in its own words.
//
// WHAT THIS DOES ADD, and why each piece is wiring into something that already
// exists rather than a new mechanism beside it:
//
//   • A BRIEF CANNOT BE ISSUED BELOW THE BAND. §5's table says a brief is for
//     ≥75 opportunity AND ≥75 confidence with no veto. So issuing asks the real
//     `decide()` and refuses by name, which is the only reason the 69 cap has
//     any force: a cap that nothing checks is a comment.
//
//   • THE APPROVAL IS THE PLATFORM'S OWN. `approvals.ts` has run the review
//     workflow — draft → in_review → approved, with an immutable history — since
//     long before this spec arrived. A brief creates an item there and is
//     resolvable only once that item is `approved`. A second approval mechanism
//     for one kind of document is how two screens come to disagree about whether
//     something was signed off.
//
//   • AN EDIT INVALIDATES THE APPROVAL (§18: "edits, expiry or relevant policy
//     changes invalidate approval"). Re-issuing bumps `brief_version` and sends
//     the approval item back to draft. The thing that was approved is not the
//     thing that would now happen.
//
//   • A FROZEN LANE REFUSES THROUGH THE SAME SHAPE. §14's channel freeze is the
//     platform's `emergency-stop.ts` publish lane, and a halt comes back as
//     `{ok:false, baseline:true, code:"channel_frozen"}` — the shape every other
//     refusal already uses, so a caller that handles one handles all of them.
//
//   • EVERY ISSUE AND EVERY RESOLUTION IS AUDITED through `audit-log.ts`.

import { createHash } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { record as auditRecord } from "@/backend/audit-log";
import { createItem as createApproval, getItem as getApproval, transition } from "@/backend/approvals";
import { haltFor } from "@/backend/emergency-stop";
import {
  validateShape, resolveEffective, cacheableForMs, channelIsLive,
  type GrowthBrief, type EffectiveRequest, type EffectiveResult,
} from "@/shared/growth-brief";
import { decide, type Veto } from "@/shared/trend-score";

const COLLECTION = "growth_briefs";
const useDb = () => Boolean(adminConfigured && adminDb);
/** brandId → briefId → stored brief. Zero-config demo keeps working with no Firestore. */
const mem = new Map<string, Map<string, StoredBrief>>();

const hid = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

export type StoredBrief = {
  brandId: string;
  brief: GrowthBrief;
  /** The approval item in the platform's own workflow. */
  approvalId: string;
  /** What the scoring gate said at issue time, kept so the decision is auditable later. */
  issuedWith: { opportunity: number; confidence: number; vetoes: Veto[]; band: string };
  issuedAt: string;
  issuedBy: string;
  updatedAt: string;
};

const docId = (brandId: string, briefId: string) => `${brandId}__${briefId}`;

function bucket(brandId: string): Map<string, StoredBrief> {
  const b = mem.get(brandId) ?? new Map<string, StoredBrief>();
  mem.set(brandId, b);
  return b;
}

/**
 * A stored document is not a StoredBrief until something has checked it.
 *
 * `d.data() as StoredBrief` is a cast, and a cast guarantees nothing — the
 * identical one on the render queue took /dashboard/video down in production,
 * which is why `approvals.ts` grew `approvalFromStored`. A brief written before
 * a field existed must not be read as if it had one, so the contract itself is
 * re-run on the way out: a document that no longer validates is dropped rather
 * than repaired into something that looks real.
 */
export function briefFromStored(data: unknown): StoredBrief | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Partial<StoredBrief>;
  if (typeof d.brandId !== "string" || !d.brandId) return null;
  if (typeof d.approvalId !== "string" || !d.approvalId) return null;
  const shape = validateShape(d.brief);
  if (!shape.ok) return null;
  const g = d.issuedWith;
  return {
    brandId: d.brandId,
    brief: shape.brief,
    approvalId: d.approvalId,
    issuedWith: {
      opportunity: typeof g?.opportunity === "number" ? g.opportunity : 0,
      confidence: typeof g?.confidence === "number" ? g.confidence : 0,
      vetoes: Array.isArray(g?.vetoes) ? g!.vetoes : [],
      band: typeof g?.band === "string" ? g.band : "unknown",
    },
    issuedAt: typeof d.issuedAt === "string" ? d.issuedAt : "",
    issuedBy: typeof d.issuedBy === "string" ? d.issuedBy : "unknown",
    updatedAt: typeof d.updatedAt === "string" ? d.updatedAt : "",
  };
}

async function save(rec: StoredBrief): Promise<void> {
  bucket(rec.brandId).set(rec.brief.brief_id, rec);
  if (useDb()) {
    try { await adminDb!.collection(COLLECTION).doc(docId(rec.brandId, rec.brief.brief_id)).set(rec); }
    catch { /* memory holds it; a store failure must not lose the issue */ }
  }
}

export async function getBrief(brandId: string, briefId: string): Promise<StoredBrief | null> {
  const local = bucket(brandId).get(briefId);
  if (local) return local;
  if (!useDb()) return null;
  try {
    const snap = await adminDb!.collection(COLLECTION).doc(docId(brandId, briefId)).get();
    return snap.exists ? briefFromStored(snap.data()) : null;
  } catch { return null; }
}

/**
 * THE TENANT FILTER, AS A PURE FUNCTION, because the query is not testable here.
 *
 * `listBriefs` narrows by `where("brandId","==",brandId)` — and a mutation sweep
 * showed that deleting that clause broke no test, because without Firebase
 * Admin the query branch never runs in CI or in this container. An untested
 * tenant boundary is the one boundary that must not be untested.
 *
 * So the filter is applied AGAIN, here, over whatever the store returned. It is
 * belt and braces on purpose: the query should narrow it, and if the query ever
 * stops narrowing it, this still does — and unlike the query, this can be
 * driven directly with no infrastructure at all.
 */
export function onlyThisBrand(records: readonly StoredBrief[], brandId: string): StoredBrief[] {
  const want = (brandId || "").trim();
  if (!want) return [];
  return records.filter((r) => r && r.brandId === want);
}

export async function listBriefs(brandId: string, limit = 50): Promise<StoredBrief[]> {
  const byId = new Map<string, StoredBrief>(bucket(brandId));
  if (useDb()) {
    try {
      const snap = await adminDb!.collection(COLLECTION).where("brandId", "==", brandId).limit(limit).get();
      snap.forEach((d) => { const r = briefFromStored(d.data()); if (r) byId.set(r.brief.brief_id, r); });
    } catch { /* memory answers */ }
  }
  return onlyThisBrand([...byId.values()], brandId)
    .sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Issuing — §5's band is the gate, and the platform's approvals are the review
// ---------------------------------------------------------------------------

export type IssueInput = {
  brandId: string;
  /** A candidate brief. Validated against the v1 contract before anything else. */
  brief: unknown;
  /** The spec's own scoring inputs for THIS candidate. Not the radar's score. */
  gate: { opportunity: number; confidence: number; vetoes?: Veto[] };
  issuedBy: string;
  nowISO: string;
};

export type IssueResult =
  | { ok: true; stored: StoredBrief; note: string }
  | { ok: false; code: "invalid" | "below_band" | "vetoed"; error: string; errors?: string[] };

/**
 * Issue a brief, or refuse and say which gate it failed.
 *
 * ORDER: the contract first, then the band. A candidate that is not a valid
 * brief cannot be judged on its score — reporting "opportunity too low" about an
 * object missing half its fields sends somebody to improve the wrong thing.
 */
export async function issueBrief(input: IssueInput): Promise<IssueResult> {
  const shape = validateShape(input.brief);
  if (!shape.ok) {
    return {
      ok: false, code: "invalid", errors: shape.errors,
      error: `This is not a v1 growth brief, so it cannot be issued: ${shape.errors.slice(0, 4).join("; ")}`,
    };
  }
  const brief = shape.brief;

  // §5's table decides, asked rather than re-implemented.
  const d = decide({
    opportunity: input.gate.opportunity,
    confidence: input.gate.confidence,
    vetoes: input.gate.vetoes,
  });
  if (d.vetoes.length) {
    return {
      ok: false, code: "vetoed",
      error: `Held, not issued: ${d.vetoes.join(", ")}. A veto is not a low score — fix the cause rather than the number, because no score clears it.`,
    };
  }
  if (d.band !== "brief" && d.band !== "auto_eligible") {
    return {
      ok: false, code: "below_band",
      error: `Not issued: ${d.reason} A brief needs opportunity ≥75 AND confidence ≥75, and confidence is capped at 69 while only one source family backs it — so a second independent family, not a better headline, is usually what is missing.`,
    };
  }

  const existing = await getBrief(input.brandId, brief.brief_id);

  // §18: AN EDIT INVALIDATES THE APPROVAL. Re-issuing is an edit.
  const version = existing ? Math.max(brief.brief_version, existing.brief.brief_version + 1) : brief.brief_version;
  const approvalId = existing?.approvalId
    ?? (await createApproval({
      brandId: input.brandId,
      title: `Growth brief — ${brief.topic_id} (${brief.market}/${brief.locale})`,
      description: [
        `Objective: ${brief.objective}`,
        `Channels: ${brief.allowed_channels.join(", ")}`,
        `Valid ${brief.valid_from} → ${brief.expires_at}`,
        `Opportunity ${d.opportunity.toFixed(2)}, confidence ${d.confidence.toFixed(2)}.`,
        `Evidence: ${brief.evidence_ids.join(", ")}`,
      ].join("\n"),
      createdBy: input.issuedBy,
      nowISO: input.nowISO,
    })).id;

  if (existing) {
    // §18: THE SIGN-OFF HAS TO BE WITHDRAWN, AND THE REFUSAL HAS TO BE READ.
    //
    // The first version of this called `transition` and threw the result away.
    // `request_changes` is only legal from `in_review`, so from `approved` it
    // was refused every single time — and the brief carried on resolving at
    // v2 with a sign-off granted for v1. The whole §18 rule was a comment.
    // This repo's oldest defect: a refusal existed on one side of a boundary
    // and never crossed it.
    //
    // An item mid-review (draft, in_review, changes_requested) is left where it
    // is on purpose: nobody has signed anything off, and the reviewer will see
    // the new version. Only a granted sign-off has to be taken back.
    const item = await getApproval(approvalId);
    if (item && (item.state === "approved" || item.state === "published")) {
      const back = await transition({
        id: approvalId, action: "reopen", actor: input.issuedBy,
        note: `The brief was re-issued as v${version}; the version that was approved is no longer the one that would be used.`,
        nowISO: input.nowISO,
      });
      if (!back.ok) {
        // REFUSE THE ISSUE RATHER THAN LEAVE A STALE APPROVAL STANDING. The
        // alternative is a brief that resolves for every channel under a
        // sign-off nobody gave for its contents, which is worse than not
        // being able to edit it.
        return {
          ok: false, code: "invalid",
          error: `The brief was not changed: its approval is "${item.state}" and could not be withdrawn (${back.error}). Editing it would leave a sign-off standing for content nobody approved.`,
        };
      }
    }
  }

  const stored: StoredBrief = {
    brandId: input.brandId,
    brief: { ...brief, brief_version: version },
    approvalId,
    issuedWith: { opportunity: d.opportunity, confidence: d.confidence, vetoes: d.vetoes, band: d.band },
    issuedAt: existing?.issuedAt || input.nowISO,
    issuedBy: input.issuedBy,
    updatedAt: input.nowISO,
  };
  await save(stored);

  auditRecord({
    actorType: "user", actor: input.issuedBy,
    action: existing ? "brief.reissued" : "brief.issued",
    resource: "growth_brief", resourceId: brief.brief_id, brandId: input.brandId,
    before: existing ? { brief_version: existing.brief.brief_version } : undefined,
    after: { brief_version: version, band: d.band },
    approvalId,
    meta: { topic: brief.topic_id, channels: brief.allowed_channels.join(","), opportunity: d.opportunity, confidence: d.confidence },
    nowISO: input.nowISO,
  });

  return {
    ok: true, stored,
    note: existing
      ? `Re-issued as v${version}. The approval went back for review, because §18 is explicit that an edit invalidates approval — the thing that was approved is not the thing that would now happen.`
      : `Issued as v${version} and sent for review. It will not resolve for any channel until the approval is granted: ${d.reason}`,
  };
}

// ---------------------------------------------------------------------------
// §16 · Resolving the effective brief — the whole reason the contract exists
// ---------------------------------------------------------------------------

export type ResolvedBrief = EffectiveResult & {
  /** §16: how long this answer may be cached, never past the brief's own expiry. */
  cacheForMs?: number;
  /** Whether the channel is one of v1's live routes or a reserved value. */
  live?: boolean;
  approvalState?: string;
};

/**
 * The effective brief for one channel, or the baseline and why.
 *
 * THE ORDER HERE IS THE ORDER OF CONSEQUENCES, same principle as the pure
 * resolver it delegates to. The freeze is checked FIRST: a halted lane means no
 * live change may happen at all, and reporting "that brief expired" to somebody
 * whose whole publish lane is stopped sends them to fix the wrong thing.
 */
export async function effectiveBrief(input: {
  brandId: string;
  briefId: string;
  req: EffectiveRequest;
}): Promise<ResolvedBrief> {
  // §14's channel freeze, which on this platform is the publish lane of the
  // emergency stop that has existed for a long time.
  const halt = await haltFor("publish", input.brandId);
  if (halt.halted) {
    return {
      ok: false, baseline: true, code: "channel_frozen",
      reason: `Publishing is frozen for this brand, so no brief can authorise work: ${halt.reason} Release the stop and ask again.`,
    };
  }

  const stored = await getBrief(input.brandId, input.briefId);
  if (!stored) {
    return {
      ok: false, baseline: true, code: "no_such_brief",
      reason: "No brief with that id belongs to this brand, so the baseline instructions apply.",
    };
  }

  // §9/§18: approved, or it directs nothing. Checked BEFORE the window, because
  // an unapproved brief is unusable whatever its dates say.
  const item = await getApproval(stored.approvalId);
  const state = item?.state ?? "unknown";
  if (state !== "approved" && state !== "published") {
    return {
      ok: false, baseline: true, code: "not_approved", approvalState: state,
      reason: `This brief is "${state.replace(/_/g, " ")}", not approved, so it cannot direct work. Approve it in Collaboration & Approvals and it takes effect inside its own validity window.`,
    };
  }

  const result = resolveEffective(stored.brief, input.req);
  if (!result.ok) return { ...result, approvalState: state };

  return {
    ...result,
    approvalState: state,
    live: channelIsLive(input.req.channel),
    cacheForMs: cacheableForMs(stored.brief, input.req.nowISO),
  };
}

/** Test seam. Never called by product code. */
export function __resetBriefs(): void { mem.clear(); }
