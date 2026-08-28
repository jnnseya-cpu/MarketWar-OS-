import { NextResponse, type NextRequest } from "next/server";
import { decide, bindingFor, HUMAN_COOKIE } from "@/backend/human-gate";
import { rateLimitCore, clientKey } from "@/shared/rate-limit-core";

// THE ONE PLACE THE HUMAN GATE IS APPLIED.
//
// Owner directive: only humans get into every section and every part of this
// OS, and non-human instructions are blocked. This file is why that is true of
// routes nobody has written yet — coverage is a matcher, not a checklist each
// route has to remember to be on.
//
// Every request lands in exactly one lane:
//
//   always_open  — the human check itself, health, login. Closing these would
//                  close the only door anyone can prove themselves through.
//   machine      — webhooks and the scheduler: not people, never will be, and
//                  each one has to present the credential that makes it an
//                  INVITED machine. Without it there is no lane.
//   public_form  — signup and lead capture, where demanding a session to obtain
//                  a session is circular. They carry proof-of-work instead.
//   human        — everything else. A signed session cookie, and for anything
//                  that moves money or credentials, one checked recently.
//
// It fails to a CHALLENGE, never a lockout: pages redirect to /verify-human
// with where they were going, APIs answer 403 with what to do about it.
//
// Runs on the edge runtime, so the gate signs with Web Crypto and this file
// imports nothing that needs Node.

export const config = {
  // Everything except Next's own assets and the public files. Deliberately
  // broad: a route added tomorrow is covered tomorrow.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|llms.txt|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml|webmanifest)$).*)"],
};

// A provider signature, by the header the provider actually sends. Presence is
// checked here; the signature itself is verified by the route, which has the
// raw body middleware must not consume.
const SIGNATURE_HEADERS = [
  "stripe-signature",
  "x-hub-signature-256",
  "x-signature",
  "x-mailgun-signature",
  "x-resend-signature",
  "svix-signature",
  "x-zernio-signature",
];

// A FLOOR UNDER EVERY API ROUTE — launch-audit finding D-13 (P2).
//
// The audit enumerated 59 mutating API routes with no authentication, and 46 of
// those had no rate limit either. Most are pure-computation engines with no
// storage behind them, which is why they are unauthenticated and why that is
// defensible. It is not defensible that anybody could call them without limit:
// 200 unauthenticated POSTs at 20 concurrent were accepted with zero 429s, and
// on a serverless deployment each one is a billed invocation. That is a
// denial-of-wallet surface, and it scales with the attacker's concurrency
// rather than ours.
//
// The floor lives HERE for the same reason the human gate does: a per-route
// limit is a checklist every future route has to remember to be on, and the
// list of 46 is exactly what happens when it is. A matcher covers the route
// somebody writes tomorrow.
//
// GENEROUS ON PURPOSE. This is a ceiling on abuse, not a quota — a busy
// dashboard fans out many calls per screen, and a limit that a real session
// trips is a limit that gets removed. Routes with a genuine reason to be
// stricter keep their own tighter `rateLimit` call; this never overrides one.
//
// PER-INSTANCE, and `backend/rate-limit.ts` explains why that is accepted here:
// it is a Map, so a serverless fleet enforces it per instance rather than
// globally. That makes it a speed bump against a single abusive client rather
// than a defence against a distributed one — which is the honest description,
// and still strictly better than the nothing it replaces. A global limiter
// needs shared state this deployment does not have.
const API_LIMIT = 120;
const API_WINDOW_MS = 60_000;

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  const decision = await decide({
    path,
    cookie: req.cookies.get(HUMAN_COOKIE)?.value,
    binding: await bindingFor(req),
    authorization: req.headers.get("authorization"),
    hasProviderSignature: SIGNATURE_HEADERS.some((h) => Boolean(req.headers.get(h))),
    // A machine lane judges a safe READ differently from a write: a provider's
    // verification handshake arrives as a GET with no signature.
    method: req.method,
  });

  // THE LIMIT RUNS AFTER THE LANE IS KNOWN, AND SKIPS TWO OF THEM.
  //
  // The first version of this limited every /api path before the gate had
  // classified it, and the load check caught it within a minute: 100% of
  // requests to `/api/health/live` and `/api/auth/human` came back 429. Both
  // are in the gate's `always_open` lane, and that lane exists for exactly one
  // reason, written at the top of this file — closing the human check or the
  // health endpoint closes the only door anyone can prove themselves through.
  // An uptime monitor would have been throttled, and a busy office on one
  // outbound address could have been locked out of signing up.
  //
  // The `machine` lane is skipped too: Stripe redelivers in bursts and each of
  // those events is already signature-verified, so throttling them buys nothing
  // and drops money on the floor.
  //
  // So the limit applies to the lanes where abuse is actually possible, and it
  // reuses the gate's own classification rather than growing a second list of
  // exempt paths that would drift from the first.
  if (path.startsWith("/api/") && decision.lane !== "always_open" && decision.lane !== "machine") {
    // Keyed on the client, not the route, so spraying 46 different endpoints
    // costs an attacker exactly what hammering one does.
    const rl = rateLimitCore(clientKey(req, "api"), API_LIMIT, API_WINDOW_MS, Date.now());
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests. Slow down and try again shortly.", retryAfterSec: rl.retryAfterSec },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }
  }

  // The decision travels with the request whether or not it blocked, so the
  // Sentinel counts what was refused AND what was allowed in observe mode.
  // A control nobody can see the effect of is a control nobody maintains.
  const headers = new Headers(req.headers);
  headers.set("x-mw-gate-lane", decision.lane);
  headers.set("x-mw-gate-allow", decision.allow ? "1" : "0");
  headers.set("x-mw-gate-observed", decision.observed ? "1" : "0");
  if (decision.action) headers.set("x-mw-gate-action", decision.action);

  if (decision.allow || decision.observed) {
    return NextResponse.next({ request: { headers } });
  }

  if (path.startsWith("/api/")) {
    return NextResponse.json({
      error: decision.reason,
      humanCheckRequired: true,
      action: decision.action || "verify",
      where: "/verify-human",
      lane: decision.lane,
    }, { status: 403 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/verify-human";
  url.search = "";
  url.searchParams.set("next", `${path}${req.nextUrl.search}`);
  if (decision.action) url.searchParams.set("action", decision.action);
  return NextResponse.redirect(url);
}
