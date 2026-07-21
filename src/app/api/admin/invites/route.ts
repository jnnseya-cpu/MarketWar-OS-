import { NextRequest, NextResponse } from "next/server";
import { createInvite, listInvites, revokeInvite } from "@/backend/invites";
import { requireAuth } from "@/backend/guard";

// Admin invites — invite a (multi-brand) company to test. Admin-scoped
// (tenant_manage) when Firebase Admin is configured; open in zero-config demo.
// GET  → all invites. POST { email, companyName, planId?, brands?, note? } → create.
// DELETE ?token= → revoke.
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, { scope: "tenant_manage" });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ invites: await listInvites() });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, { scope: "tenant_manage" });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const email = typeof body.email === "string" ? body.email : "";
  const companyName = typeof body.companyName === "string" ? body.companyName : "";
  if (!companyName.trim()) return NextResponse.json({ error: "companyName is required" }, { status: 400 });
  const invite = await createInvite({
    email, companyName,
    planId: typeof body.planId === "string" ? body.planId : undefined,
    brands: typeof body.brands === "number" ? body.brands : Number(body.brands) || undefined,
    note: typeof body.note === "string" ? body.note : undefined,
  });
  return NextResponse.json({ ok: true, invite });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req, { scope: "tenant_manage" });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const token = req.nextUrl.searchParams.get("token") || "";
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });
  return NextResponse.json(await revokeInvite(token));
}
