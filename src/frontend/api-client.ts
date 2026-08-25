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

// It also answers the human gate. src/middleware.ts refuses a money-touching
// route with a machine-readable remedy and its own comment promising that APIs
// "answer 403 with what to do about it" — and nothing had ever read it, so the
// screen printed "your check was 21 minutes ago" over a form with no way to
// pass one. See src/shared/human-retry.ts for the whole account of it.

import { firebaseAuth } from "@/frontend/firebase-client";
import { runHumanCheck } from "@/frontend/human-check";
import { fetchWithHumanRetry, replayable, type HumanRetryOutcome } from "@/shared/human-retry";

/**
 * The server refuses a submission faster than a hand can make one (1.2s). This
 * re-check IS automatic, so it waits for real rather than back-dating its own
 * clock to step around a control we wrote.
 */
const CHECK_FLOOR_MS = 1_500;

/**
 * One check at a time. A screen that fires four calls on load would otherwise
 * start four proofs-of-work, each costing seconds, and three of them for a
 * cookie the first one already set.
 */
let inFlightCheck: Promise<HumanRetryOutcome> | null = null;

function passHumanCheck(): Promise<HumanRetryOutcome> {
  if (inFlightCheck) return inFlightCheck;
  const run = (async (): Promise<HumanRetryOutcome> => {
    try {
      const mountedAt = Date.now();
      await new Promise((r) => setTimeout(r, CHECK_FLOOR_MS));
      const res = await runHumanCheck({ mountedAt });
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    } catch (e) {
      return { ok: false, error: (e as Error)?.message || "the check could not run in this browser" };
    }
  })();
  inFlightCheck = run;
  void run.finally(() => { if (inFlightCheck === run) inFlightCheck = null; });
  return run;
}

export async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const send = async (): Promise<Response> => {
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
  };

  return fetchWithHumanRetry({
    send,
    check: passHumanCheck,
    // A Request carries its own consumed body; only the string/URL form can be
    // sent a second time from the same init.
    bodyReplayable: replayable(init.body) && !(typeof Request !== "undefined" && input instanceof Request),
  });
}
