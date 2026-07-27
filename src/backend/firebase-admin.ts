// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Firebase Admin SDK — server-side Firestore/Auth for API routes.
//
// Runs on Vercel's Node runtime. Initialises from FIREBASE_PROJECT_ID +
// FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (the standard Vercel env-var
// pattern for service accounts). All exports are null when unconfigured —
// server code must degrade gracefully (demo mode / no persistence).

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage, type Storage } from "firebase-admin/storage";
import { createHash } from "node:crypto";

// Credentials may be supplied in ANY of these forms — the loader accepts them all
// so a working key is never rejected on a formatting technicality:
//   • The whole service-account JSON pasted into ONE var (FIREBASE_SERVICE_ACCOUNT,
//     FIREBASE_PRIVATE_KEY, or GOOGLE_APPLICATION_CREDENTIALS_JSON) — MOST ROBUST.
//   • The three individual fields (FIREBASE_PROJECT_ID / _CLIENT_EMAIL / _PRIVATE_KEY).
// It tolerates: surrounding quotes, escaped "\n", CRLF, and a stray BOM.

type Creds = { projectId?: string; clientEmail?: string; privateKey?: string };

function stripWrap(s: string): string {
  let t = s.trim().replace(/^﻿/, ""); // drop BOM
  if (t.length >= 2 && ((t[0] === '"' && t.at(-1) === '"') || (t[0] === "'" && t.at(-1) === "'"))) t = t.slice(1, -1).trim();
  return t;
}

// Normalise a PEM private key: unescape "\n", fix CRLF, strip wrapping quotes.
function normalizeKey(k: string): string {
  return stripWrap(k).replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
}

// Recover the 3 fields from a service-account blob even when JSON.parse FAILS —
// which happens when the private key's real newlines end up inside the JSON (the
// single most common corruption when pasting a service account into an env UI).
// Regex-extracts each field; the private_key capture spans newlines up to the END
// marker, so it survives both escaped "\n" and raw newlines.
function extractCredsLoose(s: string): Creds | null {
  const projectId = /"project_id"\s*:\s*"([^"]+)"/.exec(s)?.[1];
  const clientEmail = /"client_email"\s*:\s*"([^"]+)"/.exec(s)?.[1];
  const keyMatch = /"private_key"\s*:\s*"([\s\S]*?-----END [A-Z ]*PRIVATE KEY-----\\?n?)\s*"/.exec(s);
  const privateKey = keyMatch ? normalizeKey(keyMatch[1]) : undefined;
  if (clientEmail && privateKey) return { projectId, clientEmail, privateKey };
  return null;
}

// Parse a value that MIGHT be a service-account JSON — raw JSON, base64 JSON, or
// even corrupted JSON (via loose field extraction). Returns null if not usable.
function parseJsonCreds(raw: string): Creds | null {
  let s = stripWrap(raw);
  // base64? (no leading '{', looks like base64) — decode and retry.
  if (!s.startsWith("{") && /^[A-Za-z0-9+/=\s]+$/.test(s) && s.length > 100) {
    try {
      const decoded = Buffer.from(s.replace(/\s+/g, ""), "base64").toString("utf8").trim();
      if (decoded.startsWith("{")) s = decoded;
    } catch { /* not base64 */ }
  }
  if (!s.includes("private_key")) return null; // not a service account at all
  // 1) Clean JSON.
  if (s.startsWith("{")) {
    try {
      const j = JSON.parse(s) as { project_id?: string; client_email?: string; private_key?: string };
      if (j.private_key && j.client_email) return { projectId: j.project_id, clientEmail: j.client_email, privateKey: normalizeKey(j.private_key) };
    } catch { /* fall through to loose recovery */ }
  }
  // 2) Corrupted JSON — recover fields by regex.
  return extractCredsLoose(s);
}

// Which var supplied the creds + why loading failed — surfaced (safely) by the
// health diagnostic so a misconfig is never a silent mystery again.
let credSource = "none";

function loadCreds(): Creds {
  // 1) Any of the single-var JSON candidates, in priority order.
  for (const name of ["FIREBASE_SERVICE_ACCOUNT", "GOOGLE_APPLICATION_CREDENTIALS_JSON", "FIREBASE_PRIVATE_KEY"]) {
    const v = (process.env[name] || "").trim();
    if (!v) continue;
    const parsed = parseJsonCreds(v);
    if (parsed?.projectId && parsed.clientEmail && parsed.privateKey) { credSource = `${name} (json)`; return parsed; }
  }
  // 2) Individual fields (FIREBASE_PRIVATE_KEY holding a bare PEM, not JSON).
  const rawKey = (process.env.FIREBASE_PRIVATE_KEY || "").trim();
  const creds: Creds = {
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: rawKey && !stripWrap(rawKey).startsWith("{") ? normalizeKey(rawKey) : undefined,
  };
  if (creds.projectId && creds.clientEmail && creds.privateKey) credSource = "individual fields";
  return creds;
}

const { projectId, clientEmail, privateKey } = loadCreds();

const hasCreds = Boolean(projectId && clientEmail && privateKey);

// Validate the private key shape BEFORE cert() so we can report a precise reason.
const keyLooksValid = Boolean(privateKey && /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(privateKey) && /-----END [A-Z ]*PRIVATE KEY-----/.test(privateKey) && privateKey.includes("\n"));

let adminInitError: string | null = null;

// Initialise DEFENSIVELY. A malformed credential must NEVER crash the whole app —
// cert() throwing here would 500 every route that imports this module. We catch,
// record the exact reason, and degrade to demo mode (no persistence) so the site
// stays up and the rest of the platform keeps working.
let app: App | null = null;
if (hasCreds) {
  if (!keyLooksValid) {
    adminInitError = "Private key present but not a well-formed PEM (missing BEGIN/END markers or newlines). Paste the WHOLE service-account JSON into FIREBASE_PRIVATE_KEY — do not wrap it in quotes.";
  } else {
    try {
      app = getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    } catch (e) {
      adminInitError = `cert() rejected the credentials: ${(e as Error).message}`;
      console.error("[firebase-admin] init failed — running without persistence:", (e as Error).message);
      app = null;
    }
  }
} else {
  adminInitError = `Missing credentials — projectId:${Boolean(projectId)} clientEmail:${Boolean(clientEmail)} privateKey:${Boolean(privateKey)}. Paste the whole service-account JSON into FIREBASE_PRIVATE_KEY.`;
}

// True only when the Admin SDK actually initialised — so callers that guard on
// this never touch a half-initialised app.
export const adminConfigured = Boolean(app);

// SAFE diagnostics for the health endpoint (never the secret). The fingerprint is
// a one-way sha256 prefix of the private key so you can confirm the DEPLOYED value
// actually changed between redeploys without ever exposing the key.
export const adminDiagnostics = {
  configured: Boolean(app),
  source: credSource,
  hasProjectId: Boolean(projectId),
  hasClientEmail: Boolean(clientEmail),
  hasPrivateKey: Boolean(privateKey),
  privateKeyLooksValidPem: keyLooksValid,
  privateKeyLength: privateKey ? privateKey.length : 0,
  clientEmailDomain: clientEmail && clientEmail.includes("@") ? clientEmail.split("@")[1] : null,
  keyFingerprint: privateKey ? createHash("sha256").update(privateKey).digest("hex").slice(0, 12) : null,
  initError: adminInitError,
};

// Build the service handles DEFENSIVELY. getFirestore/getAuth/getStorage run at
// MODULE LOAD — outside the init try/catch above — so if any of them throws on
// the serverless runtime (a known failure mode with certain credential/runtime
// combinations), it takes down the ENTIRE module import and every route that
// imports it 500s at cold-start with a bare "Internal Server Error" before any
// handler-level try/catch can run. Wrapping each call keeps module load total-
// failure-proof: a throw here degrades to null (demo mode), never a crash.
function safeInit<T>(make: (a: App) => T, name: string): T | null {
  if (!app) return null;
  try {
    return make(app);
  } catch (e) {
    console.error(`[firebase-admin] ${name}() failed at init — degrading to demo:`, (e as Error).message);
    return null;
  }
}
// Firestore REJECTS any field whose value is `undefined` and throws on write —
// which 500s a route the moment real persistence is on (in demo/in-memory mode
// the same objects write fine, hiding the bug). Our records carry many optional
// fields (a contact with no company/spend/consent, a job with no result yet…),
// so set `ignoreUndefinedProperties` ONCE, globally, at init: every write across
// the platform then silently drops undefined fields instead of crashing. Must be
// called before the first Firestore operation — module load is the right place.
export const adminDb: Firestore | null = safeInit((a) => {
  const db = getFirestore(a);
  try { db.settings({ ignoreUndefinedProperties: true }); } catch { /* already set / already used — safe to ignore */ }
  return db;
}, "getFirestore");
export const adminAuth: Auth | null = safeInit((a) => getAuth(a), "getAuth");
export const adminStorage: Storage | null = safeInit((a) => getStorage(a), "getStorage");