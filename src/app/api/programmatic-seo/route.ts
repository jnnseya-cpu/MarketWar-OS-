import { NextRequest, NextResponse } from "next/server";
import {
  buildPage, generateBatch, demoProgrammaticSeo, PAGE_TYPES,
  type PageType, type BatchInput,
} from "@/backend/programmatic-seo";

// Programmatic SEO Builder API — generate hundreds of SEO page specs at scale
// with duplicate-content variation control. Emits page specs (title/meta/slug/
// JSON-LD/intro) for the landing engine to render; never fabricates data.
// POST { action: "page", type, fields{brand,service,location,...} }  → one page spec
// POST { action: "batch", brand, type, services?, locations?, industries?, comparisons?, cap? }
// GET  → doctrine, page types, demo batch

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "batch";
  const types = PAGE_TYPES.map((p) => p.id);

  if (action === "page") {
    const type = body.type as PageType;
    if (!types.includes(type)) return NextResponse.json({ error: `page requires a valid type (${types.join(", ")})` }, { status: 400 });
    const fields = body.fields as { brand?: string } | undefined;
    if (!fields || !fields.brand) return NextResponse.json({ error: "page requires fields.brand" }, { status: 400 });
    return NextResponse.json(buildPage(type, fields as { brand: string }));
  }

  if (action === "batch") {
    const type = body.type as PageType;
    if (!types.includes(type)) return NextResponse.json({ error: `batch requires a valid type (${types.join(", ")})` }, { status: 400 });
    if (typeof body.brand !== "string") return NextResponse.json({ error: "batch requires brand" }, { status: 400 });
    return NextResponse.json(generateBatch(body as unknown as BatchInput));
  }

  return NextResponse.json({ error: "Unknown action — use page or batch" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "Programmatic SEO Builder — hundreds of SEO page specs at scale",
    doctrine: "Recombines your supplied axis values (services × locations × industries) into unique page specs with per-page title/meta/slug + JSON-LD. AI variation control skips near-duplicates to avoid duplicate-content penalties. Emits specs for the landing engine to render — never fabricates facts.",
    pageTypes: PAGE_TYPES,
    demo: demoProgrammaticSeo(),
  });
}
