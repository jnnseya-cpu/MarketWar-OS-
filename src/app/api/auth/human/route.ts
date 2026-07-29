import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import {
  issueChallenge, verifyHumanCheck, verifyHumanToken, bindingFor,
  isDisposableEmail, humanCheckStatus,
} from "@/backend/human-check";
import { claimSignupGrant, getWallet, signupGrantClaimed, FREE_SIGNUP_ACUS } from "@/backend/wallet";

// The human check behind signup and login.
//
// GET   → a proof-of-work challenge for this browser
// POST  { challenge, solution, elapsedMs, honeypot?, email? }
//         → verifies it and returns a short-lived token
// PUT   { token }  (authenticated)
//         → spends the token to claim the one-off free ACU allowance
//
// Split into three steps on purpose. The check has to happen BEFORE the account
// exists (the browser talks to Firebase directly, so there is no server hop to
// hang it on), while the allowance can only be granted AFTER, when there is a
// verified identity to attach it to and a token to bind the two together.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Issuing is cheap but not free, and an unlimited challenge tap is its own
  // small denial-of-service.
  const rl = rateLimit(clientKey(req, "human-challenge"), 30, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts — wait a moment." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const st = humanCheckStatus();
  return NextResponse.json({
    challenge: issueChallenge(bindingFor(req)),
    // So the form can say "checking you're human…" honestly, with a real number
    // behind it rather than a spinner that means nothing.
    bits: st.bits,
  });
}

export async function POST(req: NextRequest) {
  // The expensive path. Ten a minute is far more than a person needs and far
  // less than a farm wants.
  const rl = rateLimit(clientKey(req, "human-verify"), 10, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Too many verification attempts — wait a moment and try again." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const res = await verifyHumanCheck({
    challenge: body.challenge as never,
    solution: body.solution as never,
    binding: bindingFor(req),
    elapsedMs: typeof body.elapsedMs === "number" ? body.elapsedMs : undefined,
    honeypot: typeof body.honeypot === "string" ? body.honeypot : "",
    email: typeof body.email === "string" ? body.email : "",
  });

  if (!res.ok) {
    return NextResponse.json({ error: res.reason, retryable: res.retryable }, { status: res.retryable ? 400 : 403 });
  }
  return NextResponse.json({ token: res.token, expiresAt: res.expiresAt });
}

export async function PUT(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "human-claim"), 20, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts — wait a moment." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // Demo mode: no accounts, no real spend, nothing to farm. The allowance is
  // already in the wallet — say so rather than inventing a claim step.
  if (!auth.enforced || !auth.uid) {
    return NextResponse.json({
      granted: 0, already: true, balanceAcu: FREE_SIGNUP_ACUS,
      note: "Demo mode — there are no accounts to verify, so the free allowance is already available.",
    });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* token may be absent; handled below */ }

  const wallet = await getWallet(auth.uid);
  if (signupGrantClaimed(wallet)) {
    return NextResponse.json({ granted: 0, already: true, balanceAcu: wallet.balanceAcu, note: "The free allowance has already been added to this account." });
  }

  // Three independent signals, and the allowance needs all of them. Any one on
  // its own is cheap to fake; a verified mailbox at a real domain, plus work
  // done in this browser, is not worth automating for 100 ACUs.
  const tok = verifyHumanToken(typeof body.token === "string" ? body.token : "", bindingFor(req));
  if (!tok.ok) {
    return NextResponse.json({ error: `${tok.reason} Reload the page to run the check again.`, granted: 0 }, { status: 403 });
  }
  if (!auth.emailVerified) {
    return NextResponse.json({
      error: "Verify your email address first — open the link we sent you, then reload. The free allowance needs a mailbox that actually receives mail.",
      granted: 0, needsEmailVerification: true,
    }, { status: 403 });
  }
  if (auth.email && isDisposableEmail(auth.email)) {
    return NextResponse.json({
      error: `${auth.email.split("@")[1]} is a disposable-mail service. Change to an address you can be reached at to receive the free allowance.`,
      granted: 0,
    }, { status: 403 });
  }

  const out = await claimSignupGrant(auth.uid);
  return NextResponse.json({
    ...out,
    note: out.already
      ? "The free allowance has already been added to this account."
      : `${out.granted} free ACUs added. This is a one-off allowance for a new account.`,
  });
}
