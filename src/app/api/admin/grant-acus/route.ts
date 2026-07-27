import { NextRequest, NextResponse } from "next/server";
import { requireAuth, rateLimit, clientKey } from "@/backend/guard";
import { adminAuth, adminConfigured } from "@/backend/firebase-admin";
import { creditAcus, getWallet } from "@/backend/wallet";
import { PLANS } from "@/backend/subscription";

// Admin — grant ACUs to a pilot/customer wallet WITHOUT a payment.
//
// For design-partner pilots and comps: the owner credits a tenant's ACU wallet so
// they can use the AI surfaces freely during a trial while remaining a normal
// metered tenant (a realistic customer experience, never stalled at the paywall).
//
// POST { email? , orgId?, acus, planId? }
//   • email  → resolved to the Firebase uid (which IS the wallet's org id).
//   • orgId  → credit that wallet directly (use when you already know the uid).
//   • acus   → how many ACUs to add (server-validated, > 0).
//   • planId → optional: also set the wallet's plan (e.g. "growth") for display.
//
// Locked to platform_admin. Never returns another org's secrets — only the wallet
// balance. Demo/no-Admin returns a clear "accounts not enforced" note.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "grant-acus"), 30, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const auth = await requireAuth(req, { scope: "platform_admin" });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const orgIdIn = typeof body.orgId === "string" ? body.orgId.trim() : "";
  const acus = Math.round(typeof body.acus === "number" ? body.acus : Number(body.acus) || 0);
  const planId = typeof body.planId === "string" && PLANS.some((p) => p.id === body.planId) ? (body.planId as string) : undefined;

  if (!(acus > 0)) return NextResponse.json({ error: "acus must be greater than zero" }, { status: 400 });
  if (!email && !orgIdIn) return NextResponse.json({ error: "Provide the pilot's email (or their orgId)." }, { status: 400 });

  // Resolve the wallet's org id. In production the org id IS the Firebase uid, so
  // look it up from the email. Demo/no-Admin has no accounts to resolve.
  let orgId = orgIdIn;
  if (!orgId && email) {
    if (!adminConfigured || !adminAuth) {
      return NextResponse.json({ error: "Accounts are not enforced on this deployment (no Firebase Admin) — there is no per-user wallet to credit. Set the Firebase admin credentials first." }, { status: 409 });
    }
    try {
      const user = await adminAuth.getUserByEmail(email);
      orgId = user.uid;
    } catch {
      return NextResponse.json({ error: `No account found for ${email}. Ask them to sign up first, then grant.` }, { status: 404 });
    }
  }

  const wallet = await creditAcus(orgId, acus, planId);
  return NextResponse.json({
    ok: true,
    granted: acus,
    orgId,
    email: email || undefined,
    planId: planId ?? wallet.planId,
    balanceAcu: wallet.balanceAcu,
    note: `Credited ${acus.toLocaleString("en-GB")} ACUs${planId ? ` and set plan to ${planId}` : ""}. New balance ${wallet.balanceAcu.toLocaleString("en-GB")} ACUs.`,
  });
}

export async function GET(req: NextRequest) {
  // Peek a wallet balance by email/orgId (admin only) — handy to confirm a grant.
  const auth = await requireAuth(req, { scope: "platform_admin" });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const url = new URL(req.url);
  const email = (url.searchParams.get("email") || "").trim();
  const orgIdIn = (url.searchParams.get("orgId") || "").trim();
  let orgId = orgIdIn;
  if (!orgId && email) {
    if (!adminConfigured || !adminAuth) return NextResponse.json({ live: false, note: "Accounts not enforced — no per-user wallet." });
    try { orgId = (await adminAuth.getUserByEmail(email)).uid; }
    catch { return NextResponse.json({ error: `No account for ${email}` }, { status: 404 }); }
  }
  if (!orgId) return NextResponse.json({ error: "Provide email or orgId" }, { status: 400 });
  const wallet = await getWallet(orgId);
  return NextResponse.json({ live: true, orgId, balanceAcu: wallet.balanceAcu, planId: wallet.planId, lifetimeCreditedAcu: wallet.lifetimeCreditedAcu, lifetimeDebitedAcu: wallet.lifetimeDebitedAcu });
}
