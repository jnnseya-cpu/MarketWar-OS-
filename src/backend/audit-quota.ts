// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// WHO HAS AUDITED WHAT, FOR NINETY DAYS — without keeping anybody's address.
//
// The rules are in `shared/audit-quota.ts` and are pure. This file is storage
// and identity: it decides WHO a request belongs to, keeps the count, and
// answers the entitlement question. Nothing here re-implements the policy.
//
// ---------------------------------------------------------------------------
// THE IP ADDRESS IS NEVER STORED, AND THE HASH IS SALTED
// ---------------------------------------------------------------------------
//
// A ninety-day record of "this address audited these websites" is personal data
// under UK GDPR — an IP address is explicitly so — and this platform sells
// itself on lawful basis being handled properly. Keeping it in plaintext to
// enforce a free-tier limit would be the kind of thing the market-exit engine
// refuses to do to a third party.
//
// So the key is `sha256(salt + ip)`. THE SALT MATTERS AND IS NOT DECORATION:
// there are only four billion IPv4 addresses, so an unsalted hash of one is
// reversible by enumeration in seconds — it is an encoding, not a protection.
// With a per-deployment salt the table is useless to anybody who takes a copy.
//
// If no salt is configured the hash is still applied and `saltConfigured` is
// reported as false, because a weak protection stated honestly is worth more
// than a strong-sounding one that is not there. It is NOT a hard failure: this
// is the platform's front door, and refusing every visitor because an optional
// variable is unset would be a self-inflicted outage.
//
// ---------------------------------------------------------------------------
// SIGNED IN? THEN IT IS THE ACCOUNT, NOT THE ADDRESS
// ---------------------------------------------------------------------------
//
// An office, a school, a library or a mobile carrier puts hundreds of people
// behind one address. Three websites per ninety days across all of them would
// lock out an entire building, and the person we most want — somebody at work,
// looking at their own company's site — is exactly who sits behind a shared
// address. So an account id wins whenever there is one, and the address is only
// the fallback for a stranger who has not signed in.

import { createHash } from "node:crypto";
import { adminConfigured, adminDb } from "@/backend/firebase-admin";
import { AUDIT_QUOTA, checkQuota, siteKey, type AuditUse, type QuotaVerdict } from "@/shared/audit-quota";

const COLLECTION = "audit_quota_uses";
const useDb = () => Boolean(adminConfigured && adminDb);

/** In-memory when there is no database — the zero-config demo must keep working. */
const mem = new Map<string, AuditUse[]>();

/** True when the hash is salted. Reported, never guessed at. */
export function quotaSaltConfigured(): boolean {
  return Boolean((process.env.AUDIT_QUOTA_SALT || process.env.FIELD_ENCRYPTION_MASTER_KEY || "").trim());
}

function subjectKey(input: { accountId?: string | null; ip?: string | null }): { key: string; kind: "account" | "address" | "unknown" } {
  const account = (input.accountId || "").trim();
  // An account is a stable, attributable identity and beats a shared address.
  if (account) return { key: `acct:${createHash("sha256").update(`account:${account}`).digest("hex").slice(0, 32)}`, kind: "account" };

  const ip = (input.ip || "").trim();
  if (!ip) return { key: "", kind: "unknown" };

  const salt = (process.env.AUDIT_QUOTA_SALT || process.env.FIELD_ENCRYPTION_MASTER_KEY || "").trim();
  return { key: `ip:${createHash("sha256").update(`${salt}|ip|${ip}`).digest("hex").slice(0, 32)}`, kind: "address" };
}

/**
 * One stored row, CHECKED rather than asserted.
 *
 * The cast guard is right to refuse `as AuditUse` here: a document written by an
 * older build, a partial write, or anything hand-edited in the console arrives
 * as whatever it is. A promise to the compiler that nobody verified is how two
 * production crashes in this codebase happened. Anything that is not a complete,
 * readable row is dropped — a quota counted from a malformed row is a person
 * refused for a reason nobody can explain.
 */
function useFromStored(raw: unknown): AuditUse | null {
  if (!raw || typeof raw !== "object") return null;
  const rec: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  const site = typeof rec.site === "string" ? rec.site.trim() : "";
  const at = typeof rec.at === "string" ? rec.at.trim() : "";
  if (!site || !at) return null;
  if (!Number.isFinite(Date.parse(at))) return null;
  return { site, at };
}

async function readUses(key: string): Promise<AuditUse[]> {
  if (!key) return [];
  if (!useDb()) return mem.get(key) ?? [];
  const snap = await adminDb!.collection(COLLECTION).doc(key).get();
  const data: unknown = snap.exists ? snap.data() : null;
  const bag = data && typeof data === "object" ? (data as { uses?: unknown }).uses : null;
  if (!Array.isArray(bag)) return [];
  const out: AuditUse[] = [];
  for (const row of bag) {
    const u = useFromStored(row);
    if (u) out.push(u);
  }
  return out;
}

async function writeUses(key: string, uses: AuditUse[]): Promise<void> {
  if (!key) return;
  // Only what is still inside the window is kept. A row that can never be
  // counted again is personal data held for no reason, and the retention
  // question is settled by never storing it past its purpose.
  const cutoff = Date.now() - AUDIT_QUOTA.windowDays * 24 * 60 * 60_000;
  const live = uses.filter((u) => (Date.parse(u.at) || 0) >= cutoff).slice(-200);
  if (useDb()) await adminDb!.collection(COLLECTION).doc(key).set({ uses: live, updatedAt: new Date().toISOString() }, { merge: true });
  else mem.set(key, live);
}

export type QuotaCheck = QuotaVerdict & {
  /** Empty when the request could not be attributed to anybody. */
  subject: "account" | "address" | "unknown";
  site: string;
  /** True when a storage failure meant the count could not be read — see below. */
  degraded?: boolean;
};

/**
 * May this request run a free audit?
 *
 * READ ONLY. Nothing is recorded here, because a crawl that the site refuses
 * must not spend somebody's allowance — they received nothing. `recordAuditUse`
 * is called afterwards, and only on a real report.
 */
export async function checkAuditQuota(input: {
  url: string;
  ip?: string | null;
  accountId?: string | null;
  paid?: boolean;
  nowISO?: string;
}): Promise<QuotaCheck> {
  const nowISO = input.nowISO || new Date().toISOString();
  const site = siteKey(input.url);
  const { key, kind } = subjectKey(input);

  // Un-attributable, or an address we could not read: allow. The alternative is
  // refusing everybody whose proxy strips the header, on the one page that
  // exists to win strangers.
  if (!key || !site) {
    return { ...checkQuota({ history: [], site, nowISO, paid: true }), unlimited: Boolean(input.paid), subject: "unknown", site } as QuotaCheck;
  }

  let history: AuditUse[] = [];
  let degraded = false;
  try {
    history = await readUses(key);
  } catch (e) {
    // FAILS OPEN, LOUDLY. A storage blip must not close the platform's main
    // acquisition surface — the cost of a few extra free crawls is a fetch and a
    // parse, and the cost of a closed front door is every lead that day. It is
    // logged so a persistent failure is visible rather than quietly unlimited.
    console.error(`[audit-quota] could not read usage, allowing the audit: ${e instanceof Error ? e.message : String(e)}`);
    degraded = true;
  }

  const verdict = checkQuota({ history, site, nowISO, paid: input.paid });
  return { ...verdict, subject: kind, site, ...(degraded ? { degraded: true } : {}) };
}

/**
 * Record ONE completed audit.
 *
 * Called only after a report a person could actually read. A paid subscriber is
 * not recorded at all — there is no limit to enforce, so there is no reason to
 * keep the row.
 */
export async function recordAuditUse(input: {
  url: string;
  ip?: string | null;
  accountId?: string | null;
  paid?: boolean;
  nowISO?: string;
}): Promise<void> {
  if (input.paid) return;
  const site = siteKey(input.url);
  const { key } = subjectKey(input);
  if (!key || !site) return;
  try {
    const uses = await readUses(key);
    await writeUses(key, [...uses, { site, at: input.nowISO || new Date().toISOString() }]);
  } catch (e) {
    // A failure to record is a free audit somebody got for nothing. That is the
    // safe direction and it must not break their report, which has already run.
    console.error(`[audit-quota] could not record a use for ${site}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Test seam — the in-memory store is process state and would leak between cases. */
export function __resetAuditQuota(): void { mem.clear(); }
