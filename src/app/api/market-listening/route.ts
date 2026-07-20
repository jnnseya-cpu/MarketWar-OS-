import { NextRequest, NextResponse } from "next/server";
import {
  analyseMentions, detectLeads, demoMarketListening, SOURCES,
  type Mention,
} from "@/backend/market-listening";

// Market Listening API — Brandwatch-class social/market intelligence core
// (Organic Dominance OS). Live ingestion is connector-gated; this surface is
// the deterministic scoring brain. Analyses only supplied mentions.
// POST { action: "analyse", mentions[], brand }        → sentiment/SoV/topics/influencers
// POST { action: "leads", mentions[], competitors? }   → Lead Opportunity Cards
// GET  → doctrine, sources, demo listening report

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "analyse";
  const mentions = Array.isArray(body.mentions) ? (body.mentions as Mention[]) : null;

  if (action === "analyse") {
    if (!mentions || mentions.length === 0) return NextResponse.json({ error: "analyse requires a non-empty mentions[]" }, { status: 400 });
    const brand = typeof body.brand === "string" ? body.brand : "";
    if (!brand) return NextResponse.json({ error: "analyse requires brand" }, { status: 400 });
    return NextResponse.json(analyseMentions(mentions, brand));
  }

  if (action === "leads") {
    if (!mentions || mentions.length === 0) return NextResponse.json({ error: "leads requires a non-empty mentions[]" }, { status: 400 });
    const competitors = Array.isArray(body.competitors) ? (body.competitors as string[]) : [];
    return NextResponse.json(detectLeads(mentions, competitors));
  }

  return NextResponse.json({ error: "Unknown action — use analyse or leads" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "Market Listening — Brandwatch-class social/market intelligence",
    doctrine: "Analyses only the mentions supplied — sentiment, reach, share-of-voice, topic velocity and lead cards are labelled estimates, never fabricated. Every insight carries a recommended action; every detected lead reply must pass the consent + compliance gate before sending.",
    sources: SOURCES,
    demo: demoMarketListening(),
  });
}
