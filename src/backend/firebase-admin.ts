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

// On Google Cloud the project id is auto-injected; on Vercel it is not, so fall
// back to the public project id (always set for the client SDK). This makes the
// Admin backend + brand-isolation enforcement light up on Vercel without needing
// a separate FIREBASE_PROJECT_ID var.
const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
// Vercel stores multiline secrets with literal \n — normalise them.
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

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
export const adminDb: Firestore | null = app ? getFirestore(app) : null;
export const adminAuth: Auth | null = app ? getAuth(app) : null;
export const adminStorage: Storage | null = app ? getStorage(app) : null;