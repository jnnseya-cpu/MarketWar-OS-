import { NextRequest, NextResponse } from "next/server";
import { joinShare2Earn } from "@/backend/share2earn-signup";
import { SIGNUP_DOORS, UPGRADE_PATH } from "@/shared/creator-program";
import { DISCLOSURE } from "@/backend/share2earn";
import { rateLimit, clientKey } from "@/backend/guard";

// The SHARE2EARN join, on its own path.
//
// It lives here rather than as an action on /api/share2earn because the human
// gate works on paths: /api/share2earn moves money — withdrawals, identity,
// claims — so it requires a recently-checked human session, and requiring a
// session on the form somebody uses to GET a session is circular. This is a
// public-form lane: no session, but its own bot cost in rate limiting, and the
// account it creates is empty until real sales verify.
//
// The parent route still accepts { action: "join" } for anything already
// calling it; that path is simply gated like the rest of the money surface.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "share2earn-join"), 10, 60_000, Date.now());
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts — try again shortly." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid submission" }, { status: 400 }); }
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");

  const res = await joinShare2Earn({ name: str("name"), email: str("email"), nowISO: new Date().toISOString() });
  if (!res.ok) return NextResponse.json({ error: res.error, field: res.field }, { status: 400 });
  return NextResponse.json({ ...res, doors: SIGNUP_DOORS, upgradePath: UPGRADE_PATH, disclosure: DISCLOSURE });
}
