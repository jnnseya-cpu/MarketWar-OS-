// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// WHO CHANGED THIS, FROM WHAT, TO WHAT, AND WHY.
//
// The platform already records several things well and none of them is this.
// `sentinel.ts` keeps security events, `approvals.ts` keeps a per-item state
// history, `publication-ledger.ts` keeps publish attempts, `db.ts` keeps agent
// runs. What no store holds is the one thing an audit log is FOR:
//
//   THE VALUE BEFORE AND THE VALUE AFTER.
//
// A log that says "the owner updated the budget" is useless in the dispute it
// exists to settle. "The owner changed monthlyBudgetGbp from 500 to 5000 at
// 02:14, reason: none given" ends the argument in one line. Most audit logs are
// the first kind, because the second requires the caller to hand over both
// values and that is inconvenient.
//
// THE PART THAT MATTERS MORE THAN THE FEATURE.
//
// An audit log is the single most likely place in a platform to leak a
// credential. It is handed arbitrary before/after values by every caller, and
// "log the change" is exactly how an API key, a Page access token or a DKIM
// private key ends up in permanent storage, in a support export, on a screen.
//
// This codebase's absolute rule is no secrets in the repo, bundle, LOGS or URLs.
// So redaction here is not a convention callers follow — it is what the module
// does to everything it is given, and it works two ways, because either one
// alone has a hole:
//
//   • BY FIELD NAME — `pageAccessToken`, `apiKey`, `password`. Catches the
//     obvious case.
//   • BY VALUE SHAPE — a PEM block, a JWT, an `sk-…` key, a bearer token, a long
//     high-entropy string. Catches the case field names cannot: a field called
//     `notes` with a key pasted into it, which is how it actually happens.
//
// APPEND ONLY. There is no update and no delete in this file. An audit log that
// can be edited is not an audit log, and the additive-only law says the same
// thing for a different reason.

import { createHash } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";

const hid = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

export type ActorType = "user" | "agent" | "system";

export type AuditEntry = {
  id: string;
  at: string;
  /** Never ambiguous: a person, an agent, or the platform acting on a schedule. */
  actorType: ActorType;
  /** `uid:…`, an agent id, or `system`. Never a raw IP — see `actorFrom`. */
  actor: string;
  /** What was done, as a dotted verb: "budget.updated", "campaign.deleted". */
  action: string;
  /** What it was done to. */
  resource: string;
  resourceId?: string;
  brandId?: string;
  /** Only the fields that CHANGED, redacted. Absent when nothing changed. */
  before?: Record<string, string>;
  after?: Record<string, string>;
  /** Why, when the caller knows. Never invented. */
  reason?: string;
  /** The approval this action was carried out under, when there was one. */
  approvalId?: string;
  /** A hashed request fingerprint. Stable enough to correlate, never personal. */
  device?: string;
  /** Anything else worth keeping, redacted the same way. */
  meta?: Record<string, string>;
};

const MAX_ENTRIES = 5_000;
const entries: AuditEntry[] = [];
const COLLECTION = "audit_logs";

// ---------------------------------------------------------------------------
// Redaction — the part that must be right
// ---------------------------------------------------------------------------

/** Field names that never carry a value worth keeping. */
const SECRET_KEY = /(token|secret|password|passwd|credential|api[-_]?key|\bkey\b|authorization|auth|cookie|session|private|dkim|signature|salt|otp|pin|cvv|iban|account[-_]?number)/i;

/** Value shapes that are credentials regardless of what the field is called. */
const SECRET_VALUE: { re: RegExp; what: string }[] = [
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, what: "private key" },
  { re: /\bsk-[A-Za-z0-9_-]{16,}/, what: "provider key" },
  { re: /\b(?:AIza|ghp_|gho_|github_pat_|xox[baprs]-|EAA[A-Za-z0-9]{20,})/, what: "provider key" },
  { re: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/i, what: "bearer token" },
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, what: "signed token" },
  { re: /\b[a-f0-9]{40,}\b/i, what: "hex secret" },
  { re: /(?:postgres|mysql|mongodb(?:\+srv)?|redis|amqp)s?:\/\/[^\s:@/]+:[^\s@/]+@/i, what: "connection string with a password" },
];

export const REDACTED = "[redacted]";

/**
 * Is this value a credential, whatever it is called?
 *
 * Exported because it is the security-relevant half of this module and it
 * should be testable on its own — a rule nobody can run against a specific
 * string is a rule nobody can check.
 */
export function looksSecret(value: string): string | null {
  const v = String(value || "");
  for (const { re, what } of SECRET_VALUE) if (re.test(v)) return what;
  // A long unbroken run of base64-ish characters with no spaces is a token in
  // practice. Bounded away from ordinary prose by requiring no whitespace and
  // a mix of cases or digits.
  if (/^[A-Za-z0-9_\-+/=.]{40,}$/.test(v) && /[0-9]/.test(v) && /[A-Za-z]/.test(v)) return "opaque token";
  return null;
}

/** One value, made safe to keep. Long prose is truncated; credentials are replaced. */
export function redactValue(key: string, value: unknown): string {
  const v = typeof value === "string" ? value : value === undefined || value === null ? "" : JSON.stringify(value);
  if (SECRET_KEY.test(key)) return REDACTED;
  const kind = looksSecret(v);
  if (kind) return `${REDACTED} (${kind})`;
  return v.length > 500 ? `${v.slice(0, 500)}…` : v;
}

export function redact(obj: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (!obj) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = redactValue(k, v);
  return Object.keys(out).length ? out : undefined;
}

/**
 * Only what changed.
 *
 * Storing the whole object twice makes the log unreadable and doubles the
 * exposure for no benefit. A field that did not move is not evidence of
 * anything.
 */
export function changedFields(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): { before?: Record<string, string>; after?: Record<string, string> } {
  if (!before && !after) return {};
  const keys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]));
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of keys) {
    const bv = before?.[k];
    const av = after?.[k];
    if (JSON.stringify(bv ?? null) === JSON.stringify(av ?? null)) continue;
    if (before && k in before) b[k] = bv;
    if (after && k in after) a[k] = av;
  }
  return { before: redact(Object.keys(b).length ? b : undefined), after: redact(Object.keys(a).length ? a : undefined) };
}

/** A stable, non-personal fingerprint of the request. Never a raw address. */
export function actorFrom(req: { headers: { get(name: string): string | null } } | undefined, uid?: string | null): { actor: string; actorType: ActorType; device?: string } {
  const ua = req?.headers.get("user-agent") || "";
  const ip = (req?.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const device = ip || ua ? hid(`${ip}|${ua}`) : undefined;
  if (uid) return { actor: `uid:${uid}`, actorType: "user", device };
  return { actor: device ? `anon:${device}` : "anon", actorType: "user", device };
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

export type RecordInput = {
  actorType: ActorType;
  actor: string;
  action: string;
  resource: string;
  resourceId?: string;
  brandId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
  approvalId?: string;
  device?: string;
  meta?: Record<string, unknown>;
  nowISO?: string;
};

/**
 * Write one entry. Never throws, never blocks the caller's work.
 *
 * A failure to record an audit entry must not fail a customer's request — the
 * same reasoning Sentinel uses. The in-memory ring is what queries read, so a
 * storage outage costs durability, not visibility.
 */
export function record(input: RecordInput): AuditEntry {
  const at = input.nowISO || new Date().toISOString();
  const { before, after } = changedFields(input.before, input.after);

  const entry: AuditEntry = {
    id: `al_${hid(`${at}|${input.actor}|${input.action}|${input.resourceId || ""}|${entries.length}`)}`,
    at,
    actorType: input.actorType,
    actor: input.actor || "unknown",
    action: input.action,
    resource: input.resource,
  };
  if (input.resourceId) entry.resourceId = input.resourceId;
  if (input.brandId) entry.brandId = input.brandId;
  if (before) entry.before = before;
  if (after) entry.after = after;
  if (input.reason) entry.reason = String(input.reason).slice(0, 1000);
  if (input.approvalId) entry.approvalId = input.approvalId;
  if (input.device) entry.device = input.device;
  const meta = redact(input.meta);
  if (meta) entry.meta = meta;

  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);

  if (adminConfigured && adminDb) {
    void adminDb.collection(COLLECTION).doc(entry.id).set(entry).catch(() => { /* the ring still has it */ });
  }
  return entry;
}

export type Query = {
  brandId?: string;
  actor?: string;
  action?: string;
  resource?: string;
  resourceId?: string;
  sinceMs?: number;
  limit?: number;
};

/** Newest first. Reads the in-memory ring, which is always current. */
export function query(q: Query = {}): AuditEntry[] {
  const cutoff = q.sinceMs ?? 0;
  return entries
    .filter((e) => (!q.brandId || e.brandId === q.brandId))
    .filter((e) => (!q.actor || e.actor === q.actor))
    .filter((e) => (!q.action || e.action.startsWith(q.action)))
    .filter((e) => (!q.resource || e.resource === q.resource))
    .filter((e) => (!q.resourceId || e.resourceId === q.resourceId))
    .filter((e) => Date.parse(e.at) >= cutoff)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, Math.max(1, Math.min(500, q.limit ?? 100)));
}

/** The trail for one thing, oldest first — how it got to where it is. */
export function trail(resource: string, resourceId: string): AuditEntry[] {
  return query({ resource, resourceId, limit: 500 }).slice().reverse();
}

/** Counted, never estimated. */
export function stats(sinceMs = 0): { total: number; byAction: { action: string; count: number }[]; actors: number } {
  const rows = entries.filter((e) => Date.parse(e.at) >= sinceMs);
  const byAction = new Map<string, number>();
  const actors = new Set<string>();
  for (const e of rows) {
    byAction.set(e.action, (byAction.get(e.action) || 0) + 1);
    actors.add(e.actor);
  }
  return {
    total: rows.length,
    byAction: Array.from(byAction, ([action, count]) => ({ action, count })).sort((a, b) => b.count - a.count),
    actors: actors.size,
  };
}

export const AUDIT_DOCTRINE = [
  "The value before and the value after, or it is not an audit log. \"The owner updated the budget\" is useless in the dispute the log exists to settle.",
  "Redaction is what the module DOES, not a convention callers follow — by field name AND by value shape, because a key pasted into a field called `notes` is how it actually happens.",
  "Append only. No update, no delete. A log that can be edited is not an audit log.",
  "Only changed fields are stored. Recording the whole object twice makes the log unreadable and doubles the exposure for nothing.",
  "Recording never fails a customer's request. A storage outage costs durability, not visibility — the in-memory ring is what queries read.",
  "No raw IP addresses. A hashed request fingerprint correlates just as well and cannot be read back into somebody's home connection.",
];

/** Test seam. Never called by product code. */
export function __resetAuditLog(): void { entries.length = 0; }
