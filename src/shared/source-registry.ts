// THE SOURCE REGISTRY — Trend Intelligence AI v2.3 §3.
//
// WHAT EACH SIGNAL CAN PROVE, AND UNDER WHAT TERMS. Every source adapter
// registers itself here before a single observation from it is scored, because
// a number means nothing without its provenance: who it came from, whether the
// access was keyless or depended on the host, what it is permitted to be used
// for, how fresh it is, and whether it is currently working. §3 is explicit —
// *"Every source adapter must register access_path … and source family, access
// mode, owner, terms and permitted uses, supported territories and languages,
// cadence, ingestion lag, quota, retention, and failure status."*
//
// THE ONE LOAD-BEARING ENUM IS `access_path` (§2's keyless gate):
//
//   • public_keyless — a permitted public feed needing no credential.
//   • host_mediated  — forwarded by an integration the host already operates;
//     the module never takes possession of the connector's secret.
//   • file_import    — CSV or manual upload.
//
// If a source is none of these — it would need a NEW connector credential — it
// is not registered, and the capability is shown unavailable (TI-22). That is
// how "the core workflow needs zero new keys" is enforced at the registry
// rather than hoped for downstream.
//
// PORTABILITY (§14, TI-17). `source_family`, territories and languages are
// DATA, not a built-in taxonomy. Core must never ship an industry's source list
// as a default; an installation registers its own. So family is a validated
// string, not an enum — the opposite choice from `access_path`, deliberately.
//
// Pure: no store, no clock it does not receive. The registry's PERSISTENCE is a
// separate backend concern; this file is the shape and the rules.

/** §2's keyless gate. The only values that keep the core workflow key-free. */
export const ACCESS_PATHS = ["public_keyless", "host_mediated", "file_import"] as const;
export type AccessPath = (typeof ACCESS_PATHS)[number];

/**
 * §3 failure status. A STALE source is not a dead one: it "can provide dated
 * context but cannot support fresh automated actions." unavailable/revoked
 * contribute nothing until restored.
 */
export const SOURCE_STATUSES = ["ok", "stale", "unavailable", "revoked"] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const nonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0;

export type SourceRegistryEntry = {
  /** Stable id of this source within the installation. */
  source_id: string;
  /** DATA, not a built-in taxonomy (portability). What independent family this belongs to. */
  source_family: string;
  access_path: AccessPath;
  /** How it is read: e.g. "push", "poll", "batch", "manual" — a validated non-empty label. */
  access_mode: string;
  /** Who the data belongs to. */
  owner: string;
  /** The terms version under which it was ingested; carried onto every observation. */
  terms_version: string;
  /** What this source is permitted to be used for. At least one. */
  permitted_uses: string[];
  /** ISO-ish territory codes this source covers. DATA (portability). */
  territories: string[];
  /** Locales/languages this source covers. DATA. */
  languages: string[];
  /** Human-readable cadence, e.g. "15-60 min", "daily". */
  cadence: string;
  /** Typical lag between an event happening and it being ingestible, in minutes. */
  ingestion_lag_minutes: number;
  /** Requests/records permitted per window; 0 means unmetered/unknown. */
  quota: number;
  /** How long raw payloads may be retained, in days. */
  retention_days: number;
  /** Current operational state. */
  status: SourceStatus;
};

export type RegistryResult =
  | { ok: true; entry: SourceRegistryEntry }
  | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

function strList(v: unknown, field: string, errors: string[], minItems: number): string[] | null {
  if (!Array.isArray(v)) { errors.push(`${field}: must be an array`); return null; }
  if (v.length < minItems) { errors.push(`${field}: needs at least ${minItems} item(s)`); return null; }
  const out: string[] = [];
  for (const [i, x] of v.entries()) {
    if (!nonEmpty(x)) { errors.push(`${field}[${i}]: must be a non-empty string`); continue; }
    const s = (x as string).trim();
    if (!out.includes(s)) out.push(s);
  }
  return errors.length ? null : out;
}

function nonNegInt(v: unknown, field: string, errors: string[]): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || !Number.isInteger(v)) {
    errors.push(`${field}: must be a non-negative integer`);
    return null;
  }
  return v;
}

/** Validate a source registration. Returns every error, like the brief validator. */
export function validateSource(input: unknown): RegistryResult {
  const errors: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ["not an object"] };

  if (typeof input.source_id !== "string" || !ID.test(input.source_id)) errors.push("source_id: not a valid id");
  if (!nonEmpty(input.source_family)) errors.push("source_family: non-empty string");
  if (!(ACCESS_PATHS as readonly string[]).includes(input.access_path as string)) {
    errors.push(`access_path: one of ${ACCESS_PATHS.join(", ")} — a source needing a new credential cannot be registered (§2)`);
  }
  if (!nonEmpty(input.access_mode)) errors.push("access_mode: non-empty string");
  if (!nonEmpty(input.owner)) errors.push("owner: non-empty string");
  if (!nonEmpty(input.terms_version)) errors.push("terms_version: non-empty string");
  if (!(SOURCE_STATUSES as readonly string[]).includes(input.status as string)) {
    errors.push(`status: one of ${SOURCE_STATUSES.join(", ")}`);
  }

  const permitted_uses = strList(input.permitted_uses, "permitted_uses", errors, 1);
  const territories = strList(input.territories, "territories", errors, 0);
  const languages = strList(input.languages, "languages", errors, 0);
  const ingestion_lag_minutes = nonNegInt(input.ingestion_lag_minutes, "ingestion_lag_minutes", errors);
  const quota = nonNegInt(input.quota, "quota", errors);
  const retention_days = nonNegInt(input.retention_days, "retention_days", errors);
  if (!nonEmpty(input.cadence)) errors.push("cadence: non-empty string");

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    entry: {
      source_id: input.source_id as string,
      source_family: (input.source_family as string).trim(),
      access_path: input.access_path as AccessPath,
      access_mode: (input.access_mode as string).trim(),
      owner: (input.owner as string).trim(),
      terms_version: (input.terms_version as string).trim(),
      permitted_uses: permitted_uses!,
      territories: territories!,
      languages: languages!,
      cadence: (input.cadence as string).trim(),
      ingestion_lag_minutes: ingestion_lag_minutes!,
      quota: quota!,
      retention_days: retention_days!,
      status: input.status as SourceStatus,
    },
  };
}

/** §2: does this source keep the core workflow key-free? */
export function isKeyless(entry: SourceRegistryEntry): boolean {
  return entry.access_path === "public_keyless" || entry.access_path === "file_import";
}

/**
 * §3: "A source marked stale can provide dated context but cannot support fresh
 * automated actions." Only an `ok` source may feed a live change; stale is
 * read-for-context, unavailable/revoked contribute nothing.
 */
export function canSupportFreshAction(entry: SourceRegistryEntry): boolean {
  return entry.status === "ok";
}
