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

// Credentials may be supplied EITHER as a full service-account JSON (the whole
// file pasted into ONE env var — FIREBASE_SERVICE_ACCOUNT or FIREBASE_PRIVATE_KEY)
// OR as the three individual fields. The JSON path is the most robust: it carries
// project_id + client_email + private_key together and sidesteps the mangled-
// newline problems that plague a multiline PEM pasted into an env var. This is
// the recommended setup on Vercel — set FIREBASE_PRIVATE_KEY to the whole JSON.
function loadCreds(): { projectId?: string; clientEmail?: string; privateKey?: string } {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_PRIVATE_KEY || "").trim();
  if (raw.startsWith("{")) {
    try {
      const j = JSON.parse(raw) as { project_id?: string; client_email?: string; private_key?: string };
      return { projectId: j.project_id, clientEmail: j.client_email, privateKey: j.private_key };
    } catch {
      /* not valid JSON — fall through to individual fields */
    }
  }
  return {
    projectId:
      process.env.FIREBASE_PROJECT_ID ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // Vercel stores multiline secrets with literal \n — normalise them.
    privateKey: raw ? raw.replace(/\\n/g, "\n") : undefined,
  };
}

const { projectId, clientEmail, privateKey } = loadCreds();

const hasCreds = Boolean(projectId && clientEmail && privateKey);

// Initialise DEFENSIVELY. A malformed credential — most commonly a private key
// whose newlines got mangled when pasted into an env var — must NEVER crash the
// whole app. Before, cert() throwing here 500-ed every route that imports this
// module. Now we catch it, log it, and degrade to demo mode (no persistence)
// so the site stays up and the rest of the platform keeps working.
let app: App | null = null;
if (hasCreds) {
  try {
    app =
      getApps()[0] ??
      initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  } catch (e) {
    console.error(
      "[firebase-admin] init failed — running without persistence. Check FIREBASE_PRIVATE_KEY formatting:",
      (e as Error).message
    );
    app = null;
  }
}

// True only when the Admin SDK actually initialised — so callers that guard on
// this never touch a half-initialised app.
export const adminConfigured = Boolean(app);

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