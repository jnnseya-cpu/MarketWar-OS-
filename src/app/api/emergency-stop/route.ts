import { NextRequest, NextResponse } from "next/server";
import {
  engage, release, activeHalts, haltHistory, haltFor,
  LANES, LANE_MEANING, PLATFORM, EMERGENCY_STOP_DOCTRINE, type Lane,
} from "@/backend/emergency-stop";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";

// EMERGENCY STOP.
//
// GET                                     → what is stopped right now, and the record
// POST { action: "engage", scope?, lanes?, reason }  → stop
// POST { action: "release", scope?, note }           → start again
//
// TWO THINGS THIS ROUTE DOES DELIBERATELY.
//
// It is NOT rate-limited as tightly as the rest. The one request that must never
// be refused for being too frequent is the one that stops the platform — an
// operator hammering the button during an incident is the expected behaviour,
// not abuse. Releasing keeps the ordinary limit.
//
// A brand-scoped halt requires access to that brand; a platform-wide halt
// requires authentication and is recorded against the person who pressed it.
// Neither is anonymous: `engagedBy` comes from the session, never from the body,
// for the same reason brand memory will not take `source` from a caller.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const scope = (new URL(req.url).searchParams.get("scope") || "").trim();
  const [active, sendHalt] = await Promise.all([
    activeHalts(),
    haltFor("send", scope || undefined),
  ]);

  return NextResponse.json({
    active,
    halted: sendHalt.halted || active.length > 0,
    history: haltHistory().slice(-50),
    lanes: LANES.map((l) => ({ id: l, meaning: LANE_MEANING[l] })),
    platformScope: PLATFORM,
    doctrine: EMERGENCY_STOP_DOCTRINE,
    neverHalted: "Transactional mail — password resets, receipts, security notices — has no lane here and cannot be stopped by this switch.",
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  const action = str("action");
  const scope = str("scope").trim() || PLATFORM;

  // Engaging is allowed to be spammed; releasing is not.
  if (action !== "engage") {
    const rl = rateLimit(clientKey(req, "emergency-stop"), 30, 60_000, Date.now());
    if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }

  if (scope !== PLATFORM) {
    const access = await resolveBrandAccess(req, scope);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const who = auth.uid || "operator";

  if (action === "engage") {
    const requested = Array.isArray(body.lanes) ? (body.lanes as unknown[]).filter((l): l is Lane => typeof l === "string" && (LANES as readonly string[]).includes(l)) : undefined;
    const res = await engage({ scope, lanes: requested, reason: str("reason"), engagedBy: who });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json(res);
  }

  if (action === "release") {
    const res = await release({ scope, releasedBy: who, note: str("note") });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json(res);
  }

  return NextResponse.json({ error: `Unknown action "${action}". Use "engage" or "release".` }, { status: 400 });
}
