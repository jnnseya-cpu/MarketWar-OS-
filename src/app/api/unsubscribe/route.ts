import { NextRequest, NextResponse } from "next/server";
import { unsubscribe } from "@/backend/newsletter";
import { rateLimit, clientKey } from "@/backend/guard";

// LEAVING THE LIST. ONE ACTION, NO ACCOUNT, NO HUMAN CHECK.
//
// This is its own route rather than an action on /api/newsletter for one
// reason: the human gate covers /api, and the newsletter route SENDS. Exempting
// the whole thing to let people leave would open the sending endpoint's outer
// door too. So the public lane is exactly this — a route that can do nothing
// except remove somebody from a mailing list.
//
// GET  ?t=<token>  → unsubscribe (the link in the email; some clients follow GET)
// POST { token }   → unsubscribe (the page uses this)
//
// GET performs the action deliberately, against the usual rule that GET should
// be safe. The alternative is a page that says "click here to confirm", and the
// mail clients that pre-fetch links would leave those people still subscribed
// and annoyed. The action is harmless, idempotent, and reversible only by the
// person themselves signing up again — which is the correct risk to take when
// the other side of the trade is a spam complaint charged to every customer
// sending through this domain.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

async function leave(req: NextRequest, token: string) {
  const rl = rateLimit(clientKey(req, "unsubscribe"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts — wait a moment and try the link again." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const res = await unsubscribe(token);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({
    ok: true,
    note: "You are unsubscribed. That took effect immediately and we will not write to you again. Your account is untouched — a password reset or a receipt still reaches you.",
  });
}

export async function GET(req: NextRequest) {
  return leave(req, new URL(req.url).searchParams.get("t") || "");
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* an empty body is just a bad link */ }
  return leave(req, typeof body.token === "string" ? body.token : "");
}
