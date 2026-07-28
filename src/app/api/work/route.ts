import { NextRequest, NextResponse } from "next/server";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey } from "@/backend/guard";
import {
  saveWork, listWork, getWork, latestWork, deleteWork, patchWork, libraryDurable,
  titleFrom, type WorkKind,
} from "@/backend/work-library";

// The Work Library API — everything the OS has produced for a brand.
//
// GET  ?brandId=…[&source=…][&kind=…][&latest=1][&id=…]  → list / one / latest
// POST { action:"save",   brandId, source, sourceName, output, input?, kind?, title? }
// POST { action:"update", brandId, id, title?, pinned?, note? }
// DELETE ?brandId=…&id=…
//
// Ownership enforced on every path. Saving is free — a customer already paid for
// the work when it was generated, and charging them to keep it would be the
// reason they lose it.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const nowISO = (req: NextRequest) => {
  const h = req.headers.get("x-now");
  return h && !Number.isNaN(Date.parse(h)) ? new Date(h).toISOString() : new Date().toISOString();
};

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId") || "";
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const id = req.nextUrl.searchParams.get("id") || "";
  const source = req.nextUrl.searchParams.get("source") || "";
  const kind = (req.nextUrl.searchParams.get("kind") || "") as WorkKind | "";
  const wantLatest = req.nextUrl.searchParams.get("latest") === "1";

  if (id) {
    const item = await getWork(brandId, id);
    return item
      ? NextResponse.json({ item, durable: libraryDurable() })
      : NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (wantLatest && source) {
    return NextResponse.json({ item: await latestWork(brandId, source), durable: libraryDurable() });
  }
  const items = await listWork(brandId, {
    source: source || undefined,
    kind: kind || undefined,
    limit: Number(req.nextUrl.searchParams.get("limit")) || 200,
  });
  return NextResponse.json({
    items,
    count: items.length,
    durable: libraryDurable(),
    note: libraryDurable()
      ? ""
      : "Durable storage is not configured on this deployment, so saved work lasts only for the current session. Export anything you need to keep.",
  });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "work"), 120, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const brandId = s(body.brandId);
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const action = s(body.action) || "save";

  if (action === "update") {
    const id = s(body.id);
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const item = await patchWork(brandId, id, {
      title: s(body.title) || undefined,
      pinned: typeof body.pinned === "boolean" ? body.pinned : undefined,
      note: typeof body.note === "string" ? body.note : undefined,
    }, nowISO(req));
    return item ? NextResponse.json({ item }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (action === "save") {
    const output = typeof body.output === "string" ? body.output : "";
    const source = s(body.source);
    if (!output.trim()) return NextResponse.json({ error: "Nothing to save — the output is empty." }, { status: 400 });
    if (!source) return NextResponse.json({ error: "source required" }, { status: 400 });
    if (output.length > 400_000) return NextResponse.json({ error: "That output is too large to save (400KB max)." }, { status: 400 });

    const input = (body.input && typeof body.input === "object" ? body.input : {}) as Record<string, string>;
    const sourceName = s(body.sourceName) || source;
    const res = await saveWork({
      brandId,
      ownerId: access.uid ?? null,
      kind: (s(body.kind) || "agent") as WorkKind,
      source,
      sourceName,
      title: s(body.title) || titleFrom(output, sourceName, input),
      output,
      input,
    }, nowISO(req));
    return NextResponse.json(res);
  }

  return NextResponse.json({ error: "Unknown action — use save or update" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId") || "";
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!brandId || !id) return NextResponse.json({ error: "brandId and id required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  return NextResponse.json({ ok: await deleteWork(brandId, id) });
}
