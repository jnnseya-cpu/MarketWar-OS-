"use client";

// Client-side admin check — is the signed-in user a platform operator (admin)?
// Reads the Firebase ID-token custom claims (role: executive/admin, or a
// platform_admin scope) with an email-allowlist fallback
// (NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS). Used to hide operator-only surfaces
// (Comms Event Architecture, economics) from ordinary business users.
//
// Zero-config demo (no Firebase configured): there are no accounts, so the demo
// shows everything (isAdmin true) — enforcement only matters once Auth is live.

import { useEffect, useState } from "react";
import { firebaseAuth, firebaseConfigured } from "@/frontend/firebase-client";

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS || "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

export function useIsAdmin(): { isAdmin: boolean; ready: boolean } {
  const [state, setState] = useState<{ isAdmin: boolean; ready: boolean }>({ isAdmin: false, ready: false });

  useEffect(() => {
    let on = true;
    // No Firebase → zero-config demo: nothing to enforce, show operator surfaces.
    if (!firebaseConfigured || !firebaseAuth) { setState({ isAdmin: true, ready: true }); return; }
    (async () => {
      const u = firebaseAuth?.currentUser;
      if (!u) { if (on) setState({ isAdmin: false, ready: true }); return; }
      try {
        const res = await u.getIdTokenResult();
        const claims = res.claims as { role?: string; scopes?: unknown };
        const scopes = Array.isArray(claims.scopes) ? (claims.scopes as string[]) : [];
        const byClaim = claims.role === "executive" || claims.role === "admin" || scopes.includes("platform_admin");
        const byEmail = u.email ? ADMIN_EMAILS.includes(u.email.toLowerCase()) : false;
        if (on) setState({ isAdmin: byClaim || byEmail, ready: true });
      } catch {
        if (on) setState({ isAdmin: false, ready: true });
      }
    })();
    return () => { on = false; };
  }, []);

  return state;
}
