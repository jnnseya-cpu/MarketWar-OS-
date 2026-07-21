import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings, sanitizeAutonomy } from "@/backend/settings-store";
import { rateLimit, clientKey } from "@/backend/guard";

// Tenant settings API — persists the per-capability autonomy dial (and future
// preferences) that used to be local-only UI state.
// GET  ?key=…                     → { settings } (null when nothing saved yet)
// POST { key, autonomy }          → persist + return the saved doc
//
// Rate-limited (denial-of-write protection). No provider cost is involved.

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") || "default";
  try {
    const settings = await getSettings(key);
    return NextResponse.json({ settings });
  } catch {
    return NextResponse.json({ error: "Settings store temporarily unavailable" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "settings"), 120, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const key = typeof body.key === "string" && body.key.trim() ? body.key.trim() : "default";
  const autonomy = sanitizeAutonomy(body.autonomy);
  try {
    const settings = await saveSettings(key, autonomy);
    return NextResponse.json({ ok: true, settings });
  } catch {
    return NextResponse.json({ error: "Could not persist settings" }, { status: 503 });
  }
}
