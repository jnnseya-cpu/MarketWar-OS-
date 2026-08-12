import { NextResponse, type NextRequest } from "next/server";
import { decide, bindingFor, HUMAN_COOKIE } from "@/backend/human-gate";

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

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  const decision = await decide({
    path,
    cookie: req.cookies.get(HUMAN_COOKIE)?.value,
    binding: await bindingFor(req),
    authorization: req.headers.get("authorization"),
    hasProviderSignature: SIGNATURE_HEADERS.some((h) => Boolean(req.headers.get(h))),
  });

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
