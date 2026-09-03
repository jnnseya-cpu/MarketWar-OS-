// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// AN API ROUTE MUST NEVER ANSWER WITH HTML.
//
// THE SYMPTOM THIS ENDS, reported from production and impossible to act on:
//
//     ⚠️ Unexpected token '<', "<!DOCTYPE "... is not valid JSON
//
// That is a `fetch` expecting JSON and receiving Next's error page. Every screen
// that calls an API shows the same sentence, so one throw in one engine reads to
// the person using it as the entire platform being broken — and the sentence
// names no cause, no route and no fix, so there is nothing to act on either.
//
// It happens because a route handler that throws is not a route handler that
// returned a 500: Next renders its own HTML error document. `/api/organic-
// dominance` ran `const result = await runOnboarding(input)` with nothing around
// it, so any provider error inside the gateway — a refusal, a malformed answer,
// a socket closing — came back as a web page.
//
// This is deliberately NOT six more try/catch blocks. A guard somebody has to
// remember is a guard somebody forgets, and the routes most likely to be written
// in a hurry are the ones that call the most fragile things.
//
// ---------------------------------------------------------------------------
// IT ALSO ENFORCES A DEADLINE, WHICH IS THE HALF A CATCH CANNOT DO
// ---------------------------------------------------------------------------
//
// A hosting platform kills a function that overruns. Nothing in this process
// gets to run when that happens — no catch, no logging, no JSON — and the caller
// receives the platform's HTML error page, identical to the one above and
// equally unactionable. A try/catch cannot help, because there is no throw.
//
// So the work races a timer set BELOW the route's own `maxDuration`. If the
// work loses, the route answers with JSON, on time, saying what it was doing and
// how long it was given. Slow is then a message a person can read instead of a
// page they cannot parse.

import { NextResponse } from "next/server";

export type GuardOptions = {
  /**
   * Seconds this route is allowed, matching its `maxDuration`. The deadline is
   * set a little under it so the answer is sent while the function is still
   * alive — a deadline equal to the limit races the executioner and loses.
   */
  maxSeconds: number;
  /** Names the route in the error a person sees, so a screenshot is diagnosable. */
  label: string;
};

/** Reserve enough time to serialise and send the answer before the platform pulls the plug. */
const HEADROOM_MS = 2_000;

export type Guarded = (req: Request, ctx?: unknown) => Promise<Response>;

/**
 * Wrap a route handler so it can only ever answer with JSON.
 *
 * The success path is untouched — whatever the handler returns is returned. Only
 * the two ways a route can fail to answer at all are changed.
 */
export function jsonRoute(handler: Guarded, opts: GuardOptions): Guarded {
  const budgetMs = Math.max(1_000, opts.maxSeconds * 1000 - HEADROOM_MS);

  return async function guarded(req: Request, ctx?: unknown): Promise<Response> {
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onTime = new Promise<Response>((resolve) => {
      timer = setTimeout(() => {
        const seconds = Math.round((Date.now() - startedAt) / 1000);
        console.error(`[route-guard] ${opts.label} hit its ${opts.maxSeconds}s deadline after ${seconds}s`);
        resolve(NextResponse.json({
          error: `This took longer than the ${opts.maxSeconds} seconds it is allowed and was stopped before the host could kill it.`,
          // The distinction that decides what somebody does next.
          reason: "timeout",
          route: opts.label,
          elapsedSeconds: seconds,
          fix: "Nothing was charged for work that did not finish. A large site or a slow provider is the usual cause — try again, and if it keeps happening send this message with the address you used.",
        }, { status: 504 }));
      }, budgetMs);
    });

    try {
      return await Promise.race([handler(req, ctx), onTime]);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      // The stack goes to the log, never the response — a provider's message is
      // safe to show, an internal stack is not.
      console.error(`[route-guard] ${opts.label} threw: ${err.message}\n${err.stack || "(no stack)"}`);
      return NextResponse.json({
        error: `${opts.label} failed: ${err.message}`,
        reason: "crashed",
        route: opts.label,
        fix: "This is a fault in our code rather than anything you entered or any setting of yours. It has been logged with the exact cause.",
      }, { status: 500 });
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}
