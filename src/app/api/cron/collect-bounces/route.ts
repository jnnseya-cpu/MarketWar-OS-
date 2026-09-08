import { NextRequest, NextResponse } from "next/server";
import { cronAuthorised } from "@/backend/guard";
import { collectBounces } from "@/backend/bounce-collector";

// COLLECT DELIVERY FAILURES ON A SCHEDULE, so nobody opens a mailbox to find out
// why a campaign did not arrive.
//
// Scheduler-authorised only. It writes to the suppression ledger and to brand
// inboxes, so an anonymous caller must never be able to trigger it — and
// `cronAuthorised` fails closed when CRON_SECRET is unset rather than treating an
// unconfigured deployment as an open one.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Reading a mailbox and routing fifty messages is slower than a page render.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = cronAuthorised(req);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized", reason: auth.reason }, { status: 401 });

  const limit = Math.max(1, Math.min(200, Number(req.nextUrl.searchParams.get("limit")) || 50));
  const result = await collectBounces(limit);
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}

// GET runs it too, because Vercel Cron issues GET. Same authorisation.
export async function GET(req: NextRequest) {
  return POST(req);
}
