import { NextRequest, NextResponse } from "next/server";
import { recordEvent, listEvents, deleteEvent, brandSummary } from "@/backend/ledger";
import { summarize, type ResultType, type RevenueEvent } from "@/shared/results";
import { rateLimit, clientKey } from "@/backend/guard";

// Per-brand results API — the money ledger.
// GET  ?brandId=…                → { events, summary }
// POST { brandId, type, source, amountGbp?, note?, at? }  → record + return event
//        (this IS the owned lead-capture endpoint: an owned landing-page form
//         posts a conversion here; it also backs the dashboard "Log a result").
// DELETE ?brandId=&id=           → remove an event
//
// Rate-limited (denial-of-write protection). No provider cost is involved.

export const runtime = "nodejs";

const TYPES: ResultType[] = ["lead", "order", "sale"];

function makeId(): string {
  try { if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID(); } catch { /* noop */ }
  return `evt_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId") || "";
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  const events = await listEvents(brandId);
  return NextResponse.json({ events, summary: summarize(events) });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "results"), 120, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  const type = TYPES.includes(body.type as ResultType) ? (body.type as ResultType) : "lead";
  const source = typeof body.source === "string" && body.source.trim() ? body.source.trim() : "Untagged";
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });

  const amountGbp = type === "lead" ? 0 : Math.max(0, Number(body.amountGbp) || 0);
  const at = typeof body.at === "string" && body.at ? body.at : new Date().toISOString();
  const id = typeof body.id === "string" && body.id ? body.id : makeId();
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : undefined;

  const event: RevenueEvent = { id, brandId, type, source, amountGbp, note, at };
  await recordEvent(event);
  return NextResponse.json({ ok: true, event, summary: await brandSummary(brandId) });
}

export async function DELETE(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId") || "";
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!brandId || !id) return NextResponse.json({ error: "brandId and id are required" }, { status: 400 });
  await deleteEvent(brandId, id);
  return NextResponse.json({ ok: true, summary: await brandSummary(brandId) });
}
