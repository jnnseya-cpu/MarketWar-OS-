import { NextRequest, NextResponse } from "next/server";
import { getInvite, acceptInvite, publicInvite } from "@/backend/invites";
import { rateLimit, clientKey } from "@/backend/guard";

// Public invite endpoint (used by /signup?invite=<token>).
// GET  → validate + non-sensitive details for the sign-up banner.
// POST → accept (called when the invited user completes sign-up).
export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const invite = await getInvite(params.token);
  if (!invite) return NextResponse.json({ valid: false, error: "Invite not found" }, { status: 404 });
  return NextResponse.json({ valid: invite.status !== "revoked", invite: publicInvite(invite) });
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const rl = rateLimit(clientKey(req, "invite-accept"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* accept with no body is fine */ }
  const result = await acceptInvite(params.token, { uid: typeof body.uid === "string" ? body.uid : undefined });
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ ok: true, invite: publicInvite(result) });
}
