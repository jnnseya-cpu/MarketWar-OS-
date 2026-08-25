// Credit a creator for an account that has just been created.
//
// Called by the signup form the moment the account exists — not when the button
// was pressed. A referral recorded on submit counts every abandoned form as a
// referral, and the creator's wallet then fills with people who never arrived.
//
// THE ACCOUNT IS TAKEN FROM THE VERIFIED TOKEN, NEVER FROM THE BODY. The body
// says which CODE to credit; who is being credited FOR is whoever the Firebase
// ID token says is calling. Letting a caller name the referred account would let
// anyone mint referrals for accounts they have never seen, which is the whole
// programme's payout logic handed to whoever notices first.

import { NextResponse, type NextRequest } from "next/server";
import { requireAuth, rateLimit, clientKey } from "@/backend/guard";
import { adminConfigured, adminDb } from "@/backend/firebase-admin";
import { attributeSignup } from "@/backend/signup-attribution";
import { normaliseCode, SIGNUP_WINDOW_DAYS } from "@/shared/signup-attribution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "referral-attribute"), 20, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts — wait a moment." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // Fail CLOSED in production without Admin, like every other route that decides
  // who something belongs to. Without verified identities there is no way to
  // know whose signup this is, and guessing would credit the wrong creator.
  if (process.env.NODE_ENV === "production" && (!adminConfigured || !adminDb)) {
    return NextResponse.json({ error: "Attribution unavailable — Firebase Admin is not configured on this deployment." }, { status: 503 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* an empty body is simply nothing to credit */ }

  const code = normaliseCode(body.code);
  if (!code) return NextResponse.json({ attributed: false, reason: "No referral code on this signup." });

  // Zero-config demo (no Admin): nothing is persisted and no money exists, so
  // the flow stays testable end to end with the id the form supplies. In
  // production the branch above has already refused.
  const accountId = auth.enforced && auth.uid
    ? auth.uid
    : (typeof body.accountId === "string" ? body.accountId.trim() : "");
  if (!accountId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const result = await attributeSignup({
    accountId,
    code,
    // From the token when there is one — a self-referral check that trusted the
    // body would be a check anyone could pass by editing it.
    email: auth.enforced ? (auth.email || "") : (typeof body.email === "string" ? body.email : ""),
    via: body.via === "cookie" ? "cookie" : "visit",
    touchedAt: typeof body.touchedAt === "string" ? body.touchedAt : undefined,
    nowISO: new Date().toISOString(),
  });

  if (!result.ok) return NextResponse.json({ attributed: false, reason: result.reason });
  return NextResponse.json({
    attributed: true,
    alreadyAttributed: result.alreadyAttributed,
    code: result.record.code,
    via: result.record.via,
    windowDays: SIGNUP_WINDOW_DAYS,
  });
}
