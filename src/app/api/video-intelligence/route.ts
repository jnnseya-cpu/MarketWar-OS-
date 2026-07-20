import { NextRequest, NextResponse } from "next/server";
import {
  detectGenre, rankMoments, scoreClip, findMoments, reframeSpec, captionSpec, demoVideoIntelligence,
  GENRES, CLIP_SCORE_DIMENSIONS, REFRAME_LAYOUTS,
  type Moment, type ClipScoreInput, type Genre,
} from "@/backend/video-intelligence";

// VideoDominance AI™ API — clip-intelligence brain (OpusClip/WayinVideo class).
// Multimodal analysis/render is model-gated; this surface is the deterministic
// decision core. Scores are labelled ESTIMATES; moments are never fabricated.
// POST { action: "genre", title?, transcript? }        → genre detection
// POST { action: "rank", moments[] }                   → ranked candidate moments
// POST { action: "score", input }                      → 8 separate clip scores
// POST { action: "find", moments[], query }            → NL moment search
// GET  → doctrine, genres, score dimensions, layouts, demo

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "genre";

  if (action === "genre") {
    return NextResponse.json(detectGenre({ title: typeof body.title === "string" ? body.title : undefined, transcript: typeof body.transcript === "string" ? body.transcript : undefined }));
  }

  if (action === "rank") {
    const moments = Array.isArray(body.moments) ? (body.moments as Moment[]) : null;
    if (!moments || moments.length === 0) return NextResponse.json({ error: "rank requires a non-empty moments[]" }, { status: 400 });
    return NextResponse.json({ moments: rankMoments(moments) });
  }

  if (action === "score") {
    const input = body.input as ClipScoreInput | undefined;
    if (!input || typeof input.clipId !== "string") return NextResponse.json({ error: "score requires input.clipId" }, { status: 400 });
    return NextResponse.json(scoreClip(input));
  }

  if (action === "find") {
    const moments = Array.isArray(body.moments) ? (body.moments as Moment[]) : null;
    if (!moments || moments.length === 0) return NextResponse.json({ error: "find requires a non-empty moments[]" }, { status: 400 });
    if (typeof body.query !== "string" || body.query.trim() === "") return NextResponse.json({ error: "find requires query" }, { status: 400 });
    return NextResponse.json(findMoments(moments, body.query));
  }

  return NextResponse.json({ error: "Unknown action — use genre, rank, score or find" }, { status: 400 });
}

export async function GET() {
  const genre: Genre = "product_demo";
  return NextResponse.json({
    engine: "VideoDominance AI™ — clip-intelligence brain",
    doctrine: "Not a clipping utility: genre → moment ranking → EIGHT separate commercial clip scores (reach/ad/engagement/retention/lead/conversion/brand-safety/profitability), never one vanity number. NL moment search returns timestamped, transcript-evidenced results. Scores are ESTIMATES; brand-safety gates publishing; moments are never fabricated.",
    genres: GENRES,
    clipScoreDimensions: CLIP_SCORE_DIMENSIONS,
    reframeLayouts: REFRAME_LAYOUTS,
    exampleReframe: reframeSpec(genre),
    exampleCaptions: captionSpec({ keywords: ["grill"] }),
    demo: demoVideoIntelligence(),
  });
}
