import { NextRequest, NextResponse } from "next/server";
import { cronAuthorised } from "@/backend/guard";
import { sweepPublished, MIN_SCORE } from "@/backend/blog-seo-gate";

// RE-SCORE EVERY PUBLISHED ARTICLE, and hold anything that has fallen below the
// bar.
//
// The publication gate stops a bad article going out. This stops a good one
// going bad — and that is the case that actually happened: the three articles
// found at 75 had correct titles when they were written, and only became wrong
// when a suffix was appended to all of them at once. No publication step would
// ever have seen that.
//
// Scheduler-authorised only: it unpublishes, so an anonymous caller must never
// reach it. `cronAuthorised` fails closed when CRON_SECRET is unset rather than
// treating an unconfigured deployment as an open one.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Crawling every article is slower than a page render.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = cronAuthorised(req);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized", reason: auth.reason }, { status: 401 });

  const result = await sweepPublished();
  return NextResponse.json({ ok: true, bar: MIN_SCORE, ...result });
}

// Vercel Cron issues GET. Same authorisation.
export async function GET(req: NextRequest) {
  return POST(req);
}
