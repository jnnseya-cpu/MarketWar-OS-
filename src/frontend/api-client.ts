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

  const res = await fetchWithHumanRetry({
    send,
    check: passHumanCheck,
    // A Request carries its own consumed body; only the string/URL form can be
    // sent a second time from the same init.
    bodyReplayable: replayable(init.body) && !(typeof Request !== "undefined" && input instanceof Request),
  });

  return describing(res, urlOf(input));
}

/** The address a caller used, for the message below. Never throws on an odd input. */
function urlOf(input: RequestInfo | URL): string {
  try {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.pathname + input.search;
    if (typeof Request !== "undefined" && input instanceof Request) return new URL(input.url).pathname;
  } catch { /* fall through */ }
  return "the server";
}

/**
 * MAKE `Unexpected token '<'` IMPOSSIBLE TO SEE.
 *
 * THE MESSAGE THIS REPLACES, reported from production and impossible to act on:
 *
 *     ⚠️ Unexpected token '<', "<!DOCTYPE "... is not valid JSON
 *
 * That is `JSON.parse` meeting an HTML page. It is the browser's message, not
 * ours, and it names nothing: not the address, not the status, not a word of
 * what the page said. Every screen in the platform shows the same sentence, so
 * one bad response reads as everything being broken — and there is no thread to
 * pull, which is exactly how days disappear.
 *
 * 239 call sites do `res.json()` the moment a call returns. Fixing them one at a
 * time is 239 chances to miss one, and the next route added is a 240th. So the
 * response itself is taught to explain: `json()` reads the body as TEXT first,
 * and only then parses. When the parse fails, the error names the address, the
 * status and the first line of whatever actually came back — so a screenshot is
 * a diagnosis rather than a mystery.
 *
 * The success path is byte-for-byte unchanged: valid JSON parses and returns
 * exactly as before. `ok`, `status`, `headers` and every other member of the
 * Response are untouched, because callers check them before parsing.
 */
function describing(res: Response, url: string): Response {
  const original = res.json.bind(res);
  Object.defineProperty(res, "json", {
    configurable: true,
    value: async () => {
      let raw: string;
      try {
        raw = await res.text();
      } catch {
        // The body could not even be read — a dropped connection mid-response.
        throw new Error(`${url} did not send a complete answer (HTTP ${res.status}). The connection dropped part-way through.`);
      }
      try {
        return raw ? JSON.parse(raw) : {};
      } catch {
        const looksHtml = /^\s*<(!doctype|html|head|body)/i.test(raw);
        const snippet = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
        throw new Error(
          looksHtml
            ? `${url} returned a web page instead of data (HTTP ${res.status}).${snippet ? ` The page said: "${snippet}".` : ""} That is a server fault or a redirect, not something you typed.`
            : `${url} returned something that is not data (HTTP ${res.status}).${snippet ? ` It sent: "${snippet}".` : ""}`,
        );
      }
    },
  });
  // `original` stays reachable so the binding is not optimised away, and so a
  // future caller that wants the raw behaviour has it.
  Object.defineProperty(res, "__rawJson", { configurable: true, enumerable: false, value: original });
  return res;
}
