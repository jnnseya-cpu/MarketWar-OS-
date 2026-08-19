import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientKey } from "@/backend/guard";
import { view, act, CLIENT_ACTIONS, type ClientAction } from "@/backend/client-portal";

// THE CLIENT PORTAL'S ONLY ENDPOINT.
//
// Deliberately UNAUTHENTICATED, and that is the whole point of the feature: the
// person using it is a busy client at another company who will never make an
// account. The token is the credential, and `client-portal.ts` is where it is
// proven — signed, single-item, expiring, revocable, compared in constant time.
//
//   GET  ?token=…                          → the one item, and which actions are legal
//   POST { token, action, note?, name? }   → the decision
//
// Nothing here reads the token's fields itself. Every branch goes through the
// engine, so the rules about what a link may open live in exactly one place.
//
// NOT METERED. A client approving somebody else's work does not spend that
// customer's credits, and no provider is called.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tighter than the dashboard's 60/min. A public endpoint that takes a signature
// is the one worth guessing at, and a real client clicks a handful of times.
const LIMIT = 20;

export async function GET(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "portal"), LIMIT, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const token = (req.nextUrl.searchParams.get("token") || "").trim();
  if (!token) return NextResponse.json({ error: "That link is missing its token." }, { status: 400 });

  const r = await view(token);
  // 404 rather than 401: a caller holding a bad token learns that it does not
  // work, and nothing about whether the item exists.
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(r.view, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "portal"), LIMIT, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const s = (k: string) => (typeof b[k] === "string" ? (b[k] as string).trim() : "");

  const token = s("token");
  if (!token) return NextResponse.json({ error: "That link is missing its token." }, { status: 400 });

  const action = s("action");
  if (!(CLIENT_ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ error: "A client link can only approve, request changes or reject." }, { status: 400 });
  }

  const r = await act({
    token, action: action as ClientAction,
    note: s("note") || undefined,
    clientName: s("name") || undefined,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ state: r.state, note: r.note }, { headers: { "Cache-Control": "no-store" } });
}
