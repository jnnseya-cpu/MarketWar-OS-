import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { gatewayLangFrom } from "@/backend/gateway";
import { recommendCreators, type RecruitInput } from "@/backend/creator-recruitment";

// Per-brand Creator Recruitment Advisor API.
// POST { business, industry?, product?, audience?, location? } → who this brand
//        should recruit (creator profiles, angle, where to find them, opener).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "creator-recruitment"), 20, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  // Paid AI — require a signed-in user (denial-of-wallet protection).
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : undefined);
  const business = s("business");
  if (!business) return NextResponse.json({ error: "business is required" }, { status: 400 });
  const input: RecruitInput = { business, industry: s("industry"), product: s("product"), audience: s("audience"), location: s("location"), lang: gatewayLangFrom(req) };
  return NextResponse.json(await recommendCreators(input));
}
