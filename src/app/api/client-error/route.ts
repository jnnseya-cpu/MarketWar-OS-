import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { recordClientError, recentClientErrors } from "@/backend/client-errors";

// Where a crash in the browser goes.
//
// The global error boundary caught the error, printed "Something broke — the OS
// caught it", and reported it to nobody. Not a log, not an endpoint, nothing —
// so the one person who could fix it never learned what broke, and the customer
// was left with a Try again button and no way to say what happened. A boundary
// that swallows the error is a nicer white screen, not a fix.
//
// POST { message, route, digest?, stack? }  → record it
// GET                                        → the recent ones (platform_admin)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(req: NextRequest) {
  // Open to signed-out users on purpose: a crash on the sign-up page is exactly
  // the one worth hearing about, and that visitor has no session. Rate-limited
  // per client so it cannot be used to flood the log.
  const rl = rateLimit(clientKey(req, "client-error"), 20, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ ok: true, recorded: false, note: "rate limited" });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const str = (k: string, max: number) => (typeof body[k] === "string" ? (body[k] as string).slice(0, max) : "");

  const message = str("message", 500);
  if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

  const ref = await recordClientError({
    message,
    route: str("route", 200),
    digest: str("digest", 64),
    // Capped hard: a stack is for us, and an unbounded field from the browser
    // is somewhere to put things that are not stacks.
    stack: str("stack", 4000),
    userAgent: (req.headers.get("user-agent") || "").slice(0, 200),
    at: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true, ref });
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, { scope: "platform_admin" });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ errors: await recentClientErrors() });
}
