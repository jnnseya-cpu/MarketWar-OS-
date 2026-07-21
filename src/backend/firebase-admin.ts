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

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
// Vercel stores multiline secrets with literal \n — normalise them.
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

export const adminConfigured = Boolean(projectId && clientEmail && privateKey);

function adminApp(): App | null {
  if (!adminConfigured) return null;
  return (
    getApps()[0] ??
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    })
  );
}

const app = adminApp();

export const adminDb: Firestore | null = app ? getFirestore(app) : null;
export const adminAuth: Auth | null = app ? getAuth(app) : null;
export const adminStorage: Storage | null = app ? getStorage(app) : null;