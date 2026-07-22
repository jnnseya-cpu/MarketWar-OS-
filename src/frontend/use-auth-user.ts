"use client";

// Client hook exposing the current Firebase user + a sign-out action, so the UI
// can show who is signed in and offer a logout everywhere. Subscribes to
// onAuthStateChanged, which rehydrates the persisted session on every refresh
// (browserLocalPersistence is set in firebase-client) — so the identity survives
// reloads instead of appearing to log the user out.
//
// Demo mode (no NEXT_PUBLIC_FIREBASE_* keys): firebaseConfigured is false, there
// is no account, and the hook reports configured:false so callers can show a
// "Demo mode" affordance instead of a fake user.

import { useEffect, useState, useCallback } from "react";
import { firebaseAuth, firebaseConfigured } from "@/frontend/firebase-client";

export type AuthUser = { uid: string; email: string | null; displayName: string | null };

export function useAuthUser(): {
  user: AuthUser | null;
  loading: boolean;
  configured: boolean;
  signOutNow: () => Promise<void>;
} {
  const configured = firebaseConfigured && Boolean(firebaseAuth);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(configured);

  useEffect(() => {
    if (!configured || !firebaseAuth) { setLoading(false); return; }
    let unsub: (() => void) | undefined;
    (async () => {
      const { onAuthStateChanged } = await import("firebase/auth");
      unsub = onAuthStateChanged(firebaseAuth!, (u) => {
        setUser(u ? { uid: u.uid, email: u.email, displayName: u.displayName } : null);
        setLoading(false);
      });
    })();
    return () => { if (unsub) unsub(); };
  }, [configured]);

  const signOutNow = useCallback(async () => {
    if (!firebaseAuth) return;
    const { signOut } = await import("firebase/auth");
    await signOut(firebaseAuth);
  }, []);

  return { user, loading, configured, signOutNow };
}
