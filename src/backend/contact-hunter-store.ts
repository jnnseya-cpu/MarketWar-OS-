// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// SUPPRESSION, SOURCE POLICY AND SOURCE QUALITY.
//
// The rules are pure and live in `shared/contact-hunter.ts`. This is storage,
// and it holds the three things that have to survive a restart to mean anything:
//
//   • SUPPRESSIONS. An objection that lives in memory is an objection that comes
//     back next deploy. Stored as a HASH of the value, never the address — a
//     do-not-contact list in plaintext is the most valuable marketing list in
//     the building and the one nobody thinks to protect.
//   • SOURCE POLICY. Whether a domain may be read at all, what fields may be
//     taken from it, and how fast. Consulted before a fetch, not after.
//   • SOURCE OUTCOMES. Bounces, wrong numbers and complaints per source, so a
//     source that produces bad data turns itself off by arithmetic rather than
//     by somebody noticing.
//
// AN OBJECTION IS PLATFORM-WIDE BY DEFAULT. `recordObjection` writes scope
// PLATFORM unless a caller explicitly narrows it, because somebody who told one
// tenant to stop should not have to tell the next one. A tenant cannot delete a
// platform suppression: there is no function here that does it.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { record as auditRecord } from "@/backend/audit-log";
import {
  valueHash, judgeSource,
  type Suppression, type SuppressionChannel, type SuppressionScope,
  type SourceQuality, type SourceVerdict,
} from "@/shared/contact-hunter";

const SUPPRESSIONS = "contact_suppressions";
const SOURCE_POLICY = "contact_source_policy";
const SOURCE_STATS = "contact_source_stats";
const useDb = () => adminConfigured && Boolean(adminDb);

const memSuppressions: Suppression[] = [];
const memPolicy = new Map<string, SourcePolicy>();
const memStats = new Map<string, SourceQuality>();

// ---------------------------------------------------------------------------
// Suppression
// ---------------------------------------------------------------------------

export function suppressionFromStored(data: unknown): Suppression | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Partial<Suppression>;
  if (typeof d.valueHash !== "string" || !d.valueHash) return null;
  if (d.scope !== "PLATFORM" && d.scope !== "TENANT") return null;
  if (d.channel !== "EMAIL" && d.channel !== "PHONE" && d.channel !== "ALL") return null;
  return {
    valueHash: d.valueHash,
    scope: d.scope,
    tenantId: typeof d.tenantId === "string" ? d.tenantId : undefined,
    channel: d.channel,
    reason: typeof d.reason === "string" ? d.reason : "objection",
    requestedAt: typeof d.requestedAt === "string" ? d.requestedAt : "",
    permanent: d.permanent !== false,
  };
}

export async function listSuppressions(): Promise<Suppression[]> {
  if (!useDb()) return [...memSuppressions];
  try {
    const snap = await adminDb!.collection(SUPPRESSIONS).get();
    const out = [...memSuppressions];
    const seen = new Set(out.map((s) => `${s.valueHash}|${s.scope}|${s.channel}|${s.tenantId ?? ""}`));
    snap.forEach((doc) => {
      const s = suppressionFromStored(doc.data());
      if (s && !seen.has(`${s.valueHash}|${s.scope}|${s.channel}|${s.tenantId ?? ""}`)) out.push(s);
    });
    return out;
  } catch {
    return [...memSuppressions];
  }
}

/**
 * Record an objection. Platform-wide unless deliberately narrowed.
 *
 * Takes the RAW value and hashes it here, so no caller has to remember to — and
 * so the raw value never reaches storage. The value is used once, in memory, and
 * is not returned.
 */
export async function recordObjection(input: {
  value: string;
  reason: string;
  requestedAt: string;
  channel?: SuppressionChannel;
  /** Narrow to one tenant ONLY when the objection was explicitly that narrow. */
  scope?: SuppressionScope;
  tenantId?: string;
  by?: string;
}): Promise<{ ok: false; error: string } | { ok: true; suppression: Suppression }> {
  const raw = String(input.value || "").trim();
  if (!raw) return { ok: false, error: "An objection needs the address or number it is about." };
  if (!input.reason.trim()) return { ok: false, error: "An objection needs a reason — it is what the audit trail shows." };

  const scope: SuppressionScope = input.scope === "TENANT" ? "TENANT" : "PLATFORM";
  if (scope === "TENANT" && !input.tenantId) return { ok: false, error: "A tenant-scoped suppression needs the tenant it applies to." };

  const suppression: Suppression = {
    valueHash: valueHash(raw),
    scope,
    tenantId: scope === "TENANT" ? input.tenantId : undefined,
    channel: input.channel ?? "ALL",
    reason: input.reason.trim(),
    requestedAt: input.requestedAt,
    permanent: true,
  };

  memSuppressions.push(suppression);
  if (useDb()) {
    try {
      await adminDb!.collection(SUPPRESSIONS)
        .doc(`${suppression.valueHash}__${suppression.channel}__${suppression.scope}${suppression.tenantId ? `__${suppression.tenantId}` : ""}`)
        .set(suppression);
    } catch { /* memory holds it for this instance */ }
  }
  auditRecord({
    actorType: "user", actor: input.by || "subject", action: "contact.objection",
    resource: "suppression", resourceId: suppression.valueHash,
    brandId: suppression.tenantId,
    after: { scope: suppression.scope, channel: suppression.channel },
    reason: suppression.reason, nowISO: input.requestedAt,
  });
  return { ok: true, suppression };
}

// ---------------------------------------------------------------------------
// Source policy
// ---------------------------------------------------------------------------

export type SourcePolicy = {
  domain: string;
  sourceType: string;
  robotsCheckedAt?: string;
  termsReviewStatus: "approved" | "restricted" | "rejected" | "unreviewed";
  crawlPermission: "full" | "limited" | "none";
  requestsPerMinute: number;
  permittedFields: string[];
  prohibitedFields: string[];
  retentionDays: number;
};

/**
 * The policy for a domain we have never reviewed.
 *
 * UNREVIEWED IS NOT PERMISSION. It returns `crawlPermission: "none"` so a domain
 * nobody has looked at cannot be crawled by default — the opposite of the usual
 * arrangement, where an unknown source is treated as fair game because nothing
 * said otherwise.
 */
export function defaultPolicy(domain: string): SourcePolicy {
  return {
    domain,
    sourceType: "unknown",
    termsReviewStatus: "unreviewed",
    crawlPermission: "none",
    requestsPerMinute: 0,
    permittedFields: [],
    prohibitedFields: ["personal_address", "special_category_data"],
    retentionDays: 0,
  };
}

export async function getSourcePolicy(domain: string): Promise<SourcePolicy> {
  const key = domain.trim().toLowerCase();
  const local = memPolicy.get(key);
  if (local) return local;
  if (useDb()) {
    try {
      const doc = await adminDb!.collection(SOURCE_POLICY).doc(key).get();
      const d = doc.exists ? doc.data() : null;
      if (d && typeof d === "object" && typeof (d as SourcePolicy).domain === "string") {
        return { ...defaultPolicy(key), ...(d as SourcePolicy) };
      }
    } catch { /* fall through to the default, which permits nothing */ }
  }
  return defaultPolicy(key);
}

export async function setSourcePolicy(policy: SourcePolicy, at: string, by: string): Promise<SourcePolicy> {
  const key = policy.domain.trim().toLowerCase();
  const next = { ...policy, domain: key };
  memPolicy.set(key, next);
  if (useDb()) {
    try { await adminDb!.collection(SOURCE_POLICY).doc(key).set(next); } catch { /* memory holds it */ }
  }
  auditRecord({
    actorType: "user", actor: by, action: "contact.source_policy",
    resource: "source_policy", resourceId: key,
    after: { crawlPermission: next.crawlPermission, terms: next.termsReviewStatus }, nowISO: at,
  });
  return next;
}

// ---------------------------------------------------------------------------
// Source outcomes
// ---------------------------------------------------------------------------

export async function recordOutcome(input: {
  sourceDomain: string;
  produced?: number;
  bounces?: number;
  wrongNumbers?: number;
  complaints?: number;
}): Promise<SourceQuality> {
  const key = input.sourceDomain.trim().toLowerCase();
  const cur = memStats.get(key) ?? { sourceDomain: key, contactsProduced: 0, bounces: 0, wrongNumbers: 0, complaints: 0 };
  const next: SourceQuality = {
    sourceDomain: key,
    contactsProduced: cur.contactsProduced + (input.produced ?? 0),
    bounces: cur.bounces + (input.bounces ?? 0),
    wrongNumbers: cur.wrongNumbers + (input.wrongNumbers ?? 0),
    complaints: cur.complaints + (input.complaints ?? 0),
  };
  memStats.set(key, next);
  if (useDb()) {
    try { await adminDb!.collection(SOURCE_STATS).doc(key).set(next); } catch { /* memory holds it */ }
  }
  return next;
}

export async function sourceVerdicts(): Promise<SourceVerdict[]> {
  const stats = [...memStats.values()];
  if (useDb()) {
    try {
      const snap = await adminDb!.collection(SOURCE_STATS).get();
      const seen = new Set(stats.map((s) => s.sourceDomain));
      snap.forEach((doc) => {
        const d = doc.data();
        if (d && typeof d === "object" && typeof (d as SourceQuality).sourceDomain === "string" && !seen.has((d as SourceQuality).sourceDomain)) {
          const q = d as SourceQuality;
          stats.push({
            sourceDomain: q.sourceDomain,
            contactsProduced: Number(q.contactsProduced) || 0,
            bounces: Number(q.bounces) || 0,
            wrongNumbers: Number(q.wrongNumbers) || 0,
            complaints: Number(q.complaints) || 0,
          });
        }
      });
    } catch { /* memory only */ }
  }
  return stats.map(judgeSource).sort((a, b) => Number(a.enabled) - Number(b.enabled));
}

/** Test seam. Never called by product code. */
export function __resetContactHunter(): void {
  memSuppressions.length = 0;
  memPolicy.clear();
  memStats.clear();
}
