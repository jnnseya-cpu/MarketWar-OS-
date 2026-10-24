// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// EVERY REQUIRED API KEY, SET IN THE ADMIN ACCOUNT.
//
// OWNER DIRECTIVE: *"All required API keys, to be set up in the admin account."*
// Until now every credential lived in Vercel's environment variables, which
// means the owner leaves the product to configure the product, a deploy is
// needed before a key takes effect, and the one surface that knows which keys
// are missing could not do anything about it.
//
// So keys are stored here, encrypted, settable from the Admin Control Centre,
// and hydrated into `process.env` so that all 125 existing reads keep working
// untouched. That last part is the whole design: rewriting every
// `process.env.ANTHROPIC_API_KEY` into an async store read would be a
// hundred-file refactor of working code, and the repository's third rule says
// do not touch working code without a reason. Hydration gives the same result
// with no call-site changes.
//
// WHY THERE IS NO BOOT HOOK, WHICH IS WHERE THIS STARTED. The first version
// hydrated from `src/instrumentation.ts`, Next's once-per-instance hook. THE
// BUILD FAILED: this platform has middleware, so Next compiles an EDGE bundle
// of instrumentation as well as a Node one, and the edge compilation followed
// the import chain into `firebase-admin` → `@google-cloud/firestore` →
// `gaxios` → `require("https")`, which does not exist on the edge. A runtime
// guard on `NEXT_RUNTIME` does not help: webpack bundles what it can see, not
// what will run. `serverExternalPackages: ["firebase-admin"]` is already set
// and does not reach that compilation either.
//
// So hydration is LAZY instead, at the doors that actually read a key
// (`ensurePlatformKeys()`), and that turned out to be the better design on its
// own merits: a cold start pays no Firestore read unless something needs a key,
// and the TTL means a warm instance picks up a change within a minute. The
// `register()` hook is not worth a bundler fight to save one read.
//
// ───────────────────────────────────────────────────────────────────────────
// THREE KINDS OF KEY THAT CANNOT LIVE HERE, AND SAYING SO IS THE FEATURE
// ───────────────────────────────────────────────────────────────────────────
//
// An admin screen that accepts a key it cannot actually use is worse than one
// that refuses it: the owner pastes it, sees "saved", and the platform stays
// dark with no explanation. Each refusal below names the reason.
//
//  1. THE FIREBASE ADMIN CREDENTIALS. The store IS Firestore. Reading a key out
//     of Firestore in order to connect to Firestore is a bootstrap paradox —
//     without those variables there is nothing to read the key from. They stay
//     in the host environment, and they are the only ones that must.
//
//  2. THE FIELD ENCRYPTION MASTER KEY. It is what decrypts this store. Keeping
//     it inside the thing it decrypts is the same paradox wearing a different
//     hat, and storing it in plaintext to avoid that would hand every key in
//     the store to anyone who could read one document.
//
//  3. ANYTHING `NEXT_PUBLIC_*`. Next.js INLINES those into the browser bundle
//     at BUILD time. A value saved at runtime cannot change a string that was
//     compiled into JavaScript last Tuesday. Saving one here would appear to
//     work and do nothing, which is the exact failure this platform calls a
//     reported success that never happened.
//
// ───────────────────────────────────────────────────────────────────────────
// WHICH VALUE WINS, AND WHY IT IS THE STORE
// ───────────────────────────────────────────────────────────────────────────
//
// If a key is set in both places the STORED one wins, because the owner asked
// for the admin account to be where keys are managed and a screen that cannot
// change a value already in Vercel does not answer that. The cost of that
// choice is a split brain nobody can see, so it is made visible instead of
// being argued about: the inventory marks every key that is overriding an
// environment value, `/api/health/live` reports the SOURCE of each key, and
// every set and clear is written to the audit trail with who did it.
//
// ───────────────────────────────────────────────────────────────────────────
// WHAT A COMPROMISED STORE COULD DO, AND WHY IT CANNOT
// ───────────────────────────────────────────────────────────────────────────
//
// Hydration assigns into `process.env`, which is the process's own
// configuration — so an attacker who could write arbitrary names into this
// document would be writing arbitrary environment variables into a running
// Node server. `NODE_OPTIONS` alone turns that into code execution.
//
// So hydration is ALLOWLISTED, not filtered: a name is applied only if it is in
// `ENV_CATALOGUE` and passes `storeable()`. A name that is not in the catalogue
// is ignored and counted, never assigned. The allowlist is the security
// boundary; the admin gate on the route is the second one.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { encryptField, decryptField, encryptionConfigured } from "@/backend/crypto";
import { ENV_CATALOGUE, type EnvVar } from "@/shared/env-catalogue";
import { SECRET_SHAPES } from "@/shared/secret-shapes";
import { createHash } from "crypto";

const COLLECTION = "platform_config";
const DOC = "admin_keys";

/** The scope the stored values are encrypted under. Not a tenant. */
const KEY_SCOPE = "mw-platform-keys";

export type KeySource = "environment" | "admin" | "unset";

type StoredKey = {
  /** AES-256-GCM ciphertext. Never returned by any function in this module. */
  value: string;
  /** A hash of the value, so two keys can be told apart without revealing one. */
  fingerprint: string;
  updatedAt: string;
  /** The uid that set it. The audit trail answers "who", this answers "still who". */
  updatedBy: string;
};

type StoredDoc = Record<string, StoredKey>;

// ---------------------------------------------------------------------------
// What may be stored
// ---------------------------------------------------------------------------

/**
 * Names that cannot be stored, each with the reason the owner will be shown.
 * Spelled out rather than pattern-matched, because a bootstrap paradox is not
 * something to infer from a prefix.
 */
export const NOT_STOREABLE: Record<string, string> = {
  FIREBASE_CLIENT_EMAIL: "This store lives in Firestore, so Firebase Admin must already be connected before anything here can be read. Set it in the hosting environment.",
  FIREBASE_PRIVATE_KEY: "This store lives in Firestore, so Firebase Admin must already be connected before anything here can be read. Set it in the hosting environment.",
  FIREBASE_PROJECT_ID: "Firebase Admin needs it to connect to the project this store is in. Set it in the hosting environment.",
  FIREBASE_SERVICE_ACCOUNT: "This store lives in Firestore, so Firebase Admin must already be connected before anything here can be read. Set it in the hosting environment.",
  FIREBASE_STORAGE_BUCKET: "Read when the Admin SDK initialises, before this store is reachable. Set it in the hosting environment.",
  GOOGLE_APPLICATION_CREDENTIALS: "An alternative way to give Firebase Admin its credentials, so it has the same bootstrap problem.",
  GOOGLE_APPLICATION_CREDENTIALS_JSON: "An alternative way to give Firebase Admin its credentials, so it has the same bootstrap problem.",
  GCLOUD_PROJECT: "Set by the host when it applies, and read during Admin SDK initialisation.",
  GOOGLE_CLOUD_PROJECT: "Set by the host when it applies, and read during Admin SDK initialisation.",
  FIELD_ENCRYPTION_MASTER_KEY: "This is the key that decrypts this store. Keeping it inside what it decrypts cannot work, and storing it unencrypted would expose every other key here. Set it in the hosting environment.",
};

export type Storeable = { ok: true } | { ok: false; why: string };

export function storeable(name: string): Storeable {
  const known = ENV_CATALOGUE.find((e) => e.name === name);
  if (!known) {
    return { ok: false, why: "Not a variable this platform reads. Only catalogued names can be set, because hydration writes them into the server's own environment." };
  }
  if (name.startsWith("NEXT_PUBLIC_")) {
    return { ok: false, why: "A NEXT_PUBLIC_ value is compiled into the browser bundle when the site is BUILT, so setting it now could not change what the browser already has. Set it in the hosting environment and redeploy." };
  }
  const blocked = NOT_STOREABLE[name];
  if (blocked) return { ok: false, why: blocked };
  return { ok: true };
}

/** Every key the admin account can set, in catalogue order. */
export function settableKeys(): EnvVar[] {
  return ENV_CATALOGUE.filter((e) => storeable(e.name).ok);
}

export function fingerprintOf(value: string): string {
  return createHash("sha256").update(`mw-key-fp|${value}`).digest("hex").slice(0, 12);
}

// ---------------------------------------------------------------------------
// Reading and writing the store
// ---------------------------------------------------------------------------

async function readDoc(): Promise<StoredDoc> {
  if (!adminConfigured || !adminDb) return {};
  try {
    const snap = await adminDb.collection(COLLECTION).doc(DOC).get();
    const data = snap.exists ? snap.data() : null;
    if (!data || typeof data !== "object") return {};
    const out: StoredDoc = {};
    for (const [name, raw] of Object.entries(data as Record<string, unknown>)) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Partial<StoredKey>;
      if (typeof r.value !== "string" || !r.value) continue;
      out[name] = {
        value: r.value,
        fingerprint: typeof r.fingerprint === "string" ? r.fingerprint : "",
        updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : "",
        updatedBy: typeof r.updatedBy === "string" ? r.updatedBy : "",
      };
    }
    return out;
  } catch {
    return {};
  }
}

export type SetResult =
  | { ok: true; name: string; fingerprint: string; applied: boolean }
  | { ok: false; status: number; error: string };

/**
 * Store a key. The value is encrypted before it leaves this function and is
 * never returned, logged or echoed by anything in this module.
 *
 * `by` is the admin's uid, recorded against the key.
 */
export async function setPlatformKey(name: string, value: string, by: string): Promise<SetResult> {
  const allowed = storeable(name);
  if (!allowed.ok) return { ok: false, status: 400, error: allowed.why };

  const v = value.trim();
  if (!v) return { ok: false, status: 400, error: "The value is empty. To remove a key, delete it instead." };
  if (v.length > 8192) return { ok: false, status: 400, error: "That value is longer than 8 KB, which no key this platform reads needs. Check what was pasted." };
  // A NUL byte in an environment value is how a truncation bug becomes a
  // security bug — `dns.resolve` truncating at a NUL is a live 2026 CVE.
  if (v.includes("\u0000")) return { ok: false, status: 400, error: "That value contains a NUL byte. Keys never do; something has gone wrong with the copy." };

  // WRONG FIELD IS THE LIKELIEST MISTAKE, so it is caught here rather than as a
  // confusing provider error an hour later. `SECRET_SHAPES` already knows which
  // variable each vendor's credential belongs in.
  const shape = SECRET_SHAPES.find((s) => s.envVar && s.re.test(v));
  if (shape && shape.envVar !== name) {
    return {
      ok: false, status: 400,
      error: `That looks like ${shape.provider}'s ${shape.what}, which belongs in ${shape.envVar} — not ${name}. Nothing was saved.`,
    };
  }

  if (!adminConfigured || !adminDb) {
    return { ok: false, status: 503, error: "No database is configured on this deployment, so there is nowhere to keep a key. Set the Firebase Admin credentials in the hosting environment first — they are the one set that cannot be managed here." };
  }
  // FAIL CLOSED: a provider key written in plaintext is worse than one not
  // saved. The customer-facing promise is field-level encryption; a key store
  // that silently drops it would be the same misrepresentation `crypto.ts`
  // already refuses to make for contact data.
  if (!encryptionConfigured) {
    return { ok: false, status: 503, error: "FIELD_ENCRYPTION_MASTER_KEY is not set, so a key could only be stored unencrypted. Refusing. Set that one variable in the hosting environment and this screen works for everything else." };
  }

  const fingerprint = fingerprintOf(v);
  const record: StoredKey = {
    value: encryptField(v, KEY_SCOPE),
    fingerprint,
    updatedAt: new Date().toISOString(),
    updatedBy: by || "unknown",
  };
  await adminDb.collection(COLLECTION).doc(DOC).set({ [name]: record }, { merge: true });

  // Apply to THIS instance immediately, so the admin who just saved it can test
  // it without waiting for a cold start.
  process.env[name] = v;
  hydrated.add(name);
  lastHydrated = 0; // force the next ensure() to re-read, for other instances

  return { ok: true, name, fingerprint, applied: true };
}

export async function clearPlatformKey(name: string, by: string): Promise<SetResult> {
  const allowed = storeable(name);
  if (!allowed.ok) return { ok: false, status: 400, error: allowed.why };
  if (!adminConfigured || !adminDb) {
    return { ok: false, status: 503, error: "No database is configured, so there is no stored key to remove." };
  }
  const { FieldValue } = await import("firebase-admin/firestore");
  await adminDb.collection(COLLECTION).doc(DOC).set({ [name]: FieldValue.delete() }, { merge: true });

  // REMOVING THE STORED VALUE MUST NOT LEAVE THE PROCESS HOLDING IT. The
  // environment value, if there is one, has to come back — which is why the
  // originals are captured once at module load, before anything is hydrated.
  const original = ORIGINAL_ENV[name];
  if (original === undefined) delete process.env[name];
  else process.env[name] = original;
  hydrated.delete(name);
  lastHydrated = 0;

  return { ok: true, name, fingerprint: "", applied: true };
}

// ---------------------------------------------------------------------------
// The environment as it arrived, captured before anything is hydrated
// ---------------------------------------------------------------------------
//
// WITHOUT THIS, "CLEAR" IS A ONE-WAY DOOR. Hydration overwrites
// `process.env[NAME]` with the stored value, so by the time somebody clears the
// stored key the original is gone from the process and the platform goes dark
// until the next cold start — with the admin screen cheerfully reporting the
// environment value as still present. Captured once, at load, so "which value
// did the host give us?" always has an answer.
const ORIGINAL_ENV: Record<string, string | undefined> = Object.fromEntries(
  ENV_CATALOGUE.map((e) => [e.name, process.env[e.name]]),
);

/** Was this name set in the hosting environment, before any hydration? */
export function fromEnvironment(name: string): boolean {
  return Boolean((ORIGINAL_ENV[name] || "").trim());
}

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

let lastHydrated = 0;
const TTL_MS = 60_000;
/** The names the last hydration applied, for the health diagnostic. */
const hydrated = new Set<string>();

export type HydrateResult = {
  applied: string[];
  /** Names in the document that are not allowed to be applied, and were not. */
  refused: string[];
  overriding: string[];
  readAt: string;
};

/**
 * Copy every stored key into `process.env`, so the platform's existing reads
 * find it.
 *
 * ALLOWLISTED, NOT FILTERED — see the header. A name that is not catalogued and
 * storeable is counted in `refused` and never assigned, because assigning an
 * arbitrary name into a running Node process's environment is code execution
 * waiting for `NODE_OPTIONS`.
 */
/**
 * WHAT HYDRATION WOULD DO — the allowlist, as a pure function.
 *
 * SEPARATED FROM THE DATABASE DELIBERATELY, because this is the security
 * boundary and a boundary that can only be exercised through Firestore is a
 * boundary nobody tests. The dangerous input — a document containing
 * `NODE_OPTIONS`, or `PATH`, or any name this platform does not read — can now
 * be handed to it directly, and the test suite proves such a name is never in
 * `apply` whatever the store says.
 *
 * `decrypt` is passed in for the same reason: the caller owns the cipher, this
 * owns the decision.
 */
export function hydrationPlan(
  doc: Record<string, { value: string }>,
  decrypt: (ciphertext: string) => string,
): { apply: { name: string; value: string }[]; refused: string[]; overriding: string[] } {
  const apply: { name: string; value: string }[] = [];
  const refused: string[] = [];
  const overriding: string[] = [];

  for (const [name, record] of Object.entries(doc)) {
    // ALLOWLIST, NOT FILTER. Catalogued AND storeable, or it never reaches the
    // process — assigning an arbitrary name into a running Node server's
    // environment is code execution waiting for NODE_OPTIONS.
    if (!storeable(name).ok) { refused.push(name); continue; }
    if (!record || typeof record.value !== "string" || !record.value) { refused.push(name); continue; }
    let plain = "";
    try { plain = decrypt(record.value); } catch { refused.push(name); continue; }
    if (!plain) { refused.push(name); continue; }
    if (fromEnvironment(name) && (ORIGINAL_ENV[name] || "").trim() !== plain) overriding.push(name);
    apply.push({ name, value: plain });
  }
  return { apply, refused, overriding };
}

export async function hydratePlatformKeys(): Promise<HydrateResult> {
  const plan = hydrationPlan(await readDoc(), (c) => decryptField(c, KEY_SCOPE));
  const applied: string[] = [];
  for (const { name, value } of plan.apply) {
    process.env[name] = value;
    hydrated.add(name);
    applied.push(name);
  }
  // Names no longer in the store are no longer loaded, or the diagnostic would
  // keep reporting a key that was removed.
  for (const name of [...hydrated]) if (!applied.includes(name)) hydrated.delete(name);

  lastHydrated = Date.now();
  return { applied, refused: plan.refused, overriding: plan.overriding, readAt: new Date().toISOString() };
}

/**
 * The names this instance actually loaded from the admin account, as of its
 * last hydration.
 *
 * IN MEMORY, NO STORE READ, ON PURPOSE. Its one caller is `/api/health/live`,
 * which is unauthenticated: a diagnostic that triggered a database read per
 * anonymous request would be an amplification lever on the one route that must
 * always answer. And "what did THIS instance load?" is the honest question for
 * a per-instance diagnostic — a fresh read would describe the store rather
 * than the server being diagnosed.
 */
export function hydratedNames(): string[] {
  return [...hydrated];
}

/**
 * Hydrate if it has not happened recently.
 *
 * Called from the doors where a stale key costs the most — the AI gateway and
 * the sending path — so a key saved in the admin account reaches a server
 * instance that is already warm, instead of waiting for it to recycle. One
 * Firestore read per minute per instance is the price, and it buys the
 * difference between "saved" and "working".
 */
export async function ensurePlatformKeys(): Promise<void> {
  if (!adminConfigured || !adminDb) return;
  if (Date.now() - lastHydrated < TTL_MS) return;
  try { await hydratePlatformKeys(); } catch { lastHydrated = Date.now(); /* never fail a customer's request over this */ }
}

// ---------------------------------------------------------------------------
// The inventory the admin screen reads
// ---------------------------------------------------------------------------

export type KeyEntry = {
  name: string;
  group: EnvVar["group"];
  secret: boolean;
  unlocks: string;
  where: string;
  /** Where the running value came from. */
  source: KeySource;
  /** True when a stored value is overriding a different environment value. */
  overridesEnvironment: boolean;
  /** Present only for a stored key: a hash, never the value. */
  fingerprint?: string;
  updatedAt?: string;
  updatedBy?: string;
  /** Null when it can be set here; otherwise the reason it cannot. */
  cannotStore: string | null;
};

export type KeyInventory = {
  entries: KeyEntry[];
  total: number;
  setInAdmin: number;
  setInEnvironment: number;
  unset: number;
  /** Secrets that are unset — the ones that keep a capability dark. */
  missingSecrets: string[];
  encryptionReady: boolean;
  persistenceReady: boolean;
  note: string;
};

/** The whole catalogue with its status. NEVER any value. */
export async function keyInventory(): Promise<KeyInventory> {
  const doc = await readDoc();
  const entries: KeyEntry[] = ENV_CATALOGUE.map((e) => {
    const stored = doc[e.name];
    const can = storeable(e.name);
    const inEnv = fromEnvironment(e.name);
    const source: KeySource = stored ? "admin" : inEnv ? "environment" : "unset";
    return {
      name: e.name, group: e.group, secret: e.secret, unlocks: e.unlocks, where: e.where,
      source,
      overridesEnvironment: Boolean(stored) && inEnv,
      ...(stored ? { fingerprint: stored.fingerprint, updatedAt: stored.updatedAt, updatedBy: stored.updatedBy } : {}),
      cannotStore: can.ok ? null : can.why,
    };
  });

  const setInAdmin = entries.filter((e) => e.source === "admin").length;
  const setInEnvironment = entries.filter((e) => e.source === "environment").length;
  const unset = entries.filter((e) => e.source === "unset").length;

  return {
    entries,
    total: entries.length,
    setInAdmin,
    setInEnvironment,
    unset,
    missingSecrets: entries.filter((e) => e.secret && e.source === "unset").map((e) => e.name),
    encryptionReady: encryptionConfigured,
    persistenceReady: Boolean(adminConfigured && adminDb),
    note: entries.some((e) => e.overridesEnvironment)
      ? "Some keys set here are overriding a different value in the hosting environment. The stored one is what the platform uses."
      : "No key set here conflicts with the hosting environment.",
  };
}
