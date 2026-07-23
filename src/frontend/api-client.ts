"use client";

// Authenticated fetch — attaches the signed-in user's Firebase ID token to
// same-origin API calls so server routes can verify WHO is calling and enforce
// brand ownership (see src/backend/brand-access.ts).
//
// Zero-config demo (no Firebase) or a signed-out visitor: falls through to a
// plain fetch with no Authorization header, so nothing breaks without keys. The
// moment Firebase Auth is configured and a user is signed in, every sensitive
// call carries a verifiable token.
//
// Use this in place of `fetch` for any call to a brand-scoped or money route.

import { firebaseAuth } from "@/frontend/firebase-client";

export async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  try {
    const user = firebaseAuth?.currentUser;
    if (user && !headers.has("Authorization")) {
      const token = await user.getIdToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }
  } catch {
    // Token unavailable → proceed unauthenticated (server decides whether to allow).
  }
  // Attach the user's language so AI engines can respond in it (gateway reads it).
  try {
    const loc = typeof localStorage !== "undefined" ? localStorage.getItem("mw.locale.v1") : null;
    if (loc && !headers.has("x-mw-lang")) headers.set("x-mw-lang", loc);
  } catch { /* ignore */ }
  return fetch(input, { ...init, headers });
}
