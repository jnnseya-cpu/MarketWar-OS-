import { NextRequest, NextResponse } from "next/server";
import {
  keywordResearch,
  analyseTitles,
  mineComments,
  shortsScript,
  demoYoutube,
} from "@/backend/youtube";

// YouTube SEO Intelligence API (YepAPI §11) — topic/keyword research, viral
// title pattern analysis, comment pain-point mining + sentiment, and short-form
// script generation. All numbers are deterministic ESTIMATES — never live
// YouTube Data API results — and no provider cost or secret is ever exposed.
//
// POST { action: "keywords", seed }     → topic ideas w/ volume/competition/opportunity
// POST { action: "titles",   titles }   → per-title viral patterns + score (sorted)
// POST { action: "comments", comments } → pain-point clusters + naive sentiment
// POST { action: "script",   topic }    → 15–30s short-form script
// GET                                    → doctrine + full demo output

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action;

  if (action === "keywords") {
    if (typeof body.seed !== "string" || body.seed.trim() === "") {
      return NextResponse.json(
        { error: "keywords requires a non-empty seed string" },
        { status: 400 }
      );
    }
    return NextResponse.json(keywordResearch(body.seed as string));
  }

  if (action === "titles") {
    if (!Array.isArray(body.titles) || body.titles.length === 0) {
      return NextResponse.json(
        { error: "titles requires a non-empty titles array" },
        { status: 400 }
      );
    }
    const titles = (body.titles as unknown[]).filter(
      (t): t is string => typeof t === "string"
    );
    if (titles.length === 0) {
      return NextResponse.json(
        { error: "titles must contain at least one string" },
        { status: 400 }
      );
    }
    return NextResponse.json({ titles: analyseTitles(titles) });
  }

  if (action === "comments") {
    if (!Array.isArray(body.comments) || body.comments.length === 0) {
      return NextResponse.json(
        { error: "comments requires a non-empty comments array" },
        { status: 400 }
      );
    }
    const comments = (body.comments as unknown[]).filter(
      (c): c is string => typeof c === "string"
    );
    if (comments.length === 0) {
      return NextResponse.json(
        { error: "comments must contain at least one string" },
        { status: 400 }
      );
    }
    return NextResponse.json(mineComments(comments));
  }

  if (action === "script") {
    if (typeof body.topic !== "string" || body.topic.trim() === "") {
      return NextResponse.json(
        { error: "script requires a non-empty topic string" },
        { status: 400 }
      );
    }
    return NextResponse.json(shortsScript(body.topic as string));
  }

  return NextResponse.json(
    { error: "Unknown action — use keywords, titles, comments or script" },
    { status: 400 }
  );
}

export async function GET() {
  return NextResponse.json({
    engine: "YouTube SEO Intelligence (keyword research · viral title analysis · comment mining · shorts script)",
    doctrine:
      "Every volume, competition, opportunity and title score is a deterministic ESTIMATE — not live YouTube data. We label all projections as estimates, never fabricate view counts, comments or testimonials, and keep titles/thumbnails honest to the underlying content.",
    demo: demoYoutube(),
  });
}
