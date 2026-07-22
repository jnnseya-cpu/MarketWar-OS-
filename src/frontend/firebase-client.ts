// Firebase client SDK — browser-side Auth, Firestore and Storage.
//
// Initialises only when NEXT_PUBLIC_FIREBASE_* env vars are present, so the
// platform keeps running in zero-config demo mode without a Firebase project.
// Import { firebaseApp, firebaseAuth, firebaseDb, firebaseStorage } from here;
// each is null when Firebase is not configured — always guard before use.

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  // RTDB (europe-west1) is intentionally unused; included for config completeness.
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
};

export const firebaseConfigured = Boolean(config.apiKey && config.projectId);

function app(): FirebaseApp | null {
  if (!firebaseConfigured) return null;
  return getApps()[0] ?? initializeApp(config);
}

export const firebaseApp: FirebaseApp | null = app();
export const firebaseAuth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null;

// Persist the session in localStorage so a page refresh NEVER forces a re-login.
// Without this, some environments fall back to in-memory persistence and the
// user is logged out on every reload — the "keep re-logging in" bug.
if (firebaseAuth) {
  setPersistence(firebaseAuth, browserLocalPersistence).catch(() => {
    /* private-mode / storage blocked — falls back to default persistence */
  });
}
export const firebaseDb: Firestore | null = firebaseApp ? getFirestore(firebaseApp) : null;
export const firebaseStorage: FirebaseStorage | null = firebaseApp
  ? getStorage(firebaseApp)
  : null;
