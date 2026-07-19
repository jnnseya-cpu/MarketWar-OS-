import { NextRequest, NextResponse } from "next/server";
import { detectIntent, INTENT_CATALOGUE } from "@/backend/intent-router";

// "Make Anything" universal command box API.
// POST { prompt } → detected goal + routed engine + only-essential questions
//                   + ACU estimate (provider cost never exposed).
// GET → the intent catalogue the box can fulfil.

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  if (!prompt.trim()) return NextResponse.json({ error: "prompt is required — tell the OS what you want to make" }, { status: 400 });
  return NextResponse.json(detectIntent(prompt));
}

export async function GET() {
  return NextResponse.json({
    box: "Make Anything — the universal command box",
    doctrine: "Detects your goal, routes to an owned engine (never a generic generator), asks only the essentials, and previews ACUs before anything runs.",
    catalogue: INTENT_CATALOGUE,
  });
}
