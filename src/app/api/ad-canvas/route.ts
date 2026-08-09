import { NextRequest, NextResponse } from "next/server";
import {
  PLACEMENTS, placement, docFromAd, applyEdit, applyFix, refit, refitAll,
  checkDoc, renderSvg, fitAll, AD_CANVAS_DOCTRINE,
  type AdDoc, type Edit, type PlacementId, type CanvasFinding,
} from "@/backend/ad-canvas";
import { saveDoc, loadDoc, listDocs, deleteDoc } from "@/backend/ad-canvas-store";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey } from "@/backend/guard";

// The ad canvas — a generated ad you can still change.
//
// GET  ?brandId=…            → the placements, the saved documents, the doctrine
// GET  ?brandId=…&id=…&svg=1 → the rendered SVG for one document
// POST { action: "build"  }  → an editable document from a generated ad
// POST { action: "edit"   }  → one validated change
// POST { action: "fix"    }  → apply the repair a finding offered
// POST { action: "refit"  }  → re-lay-out for another placement
// POST { action: "export" }  → every placement it will run in, each checked
// POST { action: "delete" }  → remove a document
//
// NOT METERED, AND THAT IS THE WHOLE POINT. Every action here is local
// arithmetic — no provider is called, no model runs, no artwork is regenerated.
// Charging for a typo correction would reintroduce the exact cost this module
// exists to remove, so the wallet is not touched. Rate-limited instead, because
// free is not the same as unlimited.
//
// EVERY PATH IS BRAND-SCOPED. A document belongs to a brand, so every read and
// every write goes through `resolveBrandAccess` — the same gate the rest of the
// tenant-owned data uses.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PLACEMENT_IDS = PLACEMENTS.map((p) => p.id);
const isPlacement = (s: unknown): s is PlacementId => typeof s === "string" && PLACEMENT_IDS.includes(s as PlacementId);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const brandId = (url.searchParams.get("brandId") || "").trim();

  if (!brandId) {
    return NextResponse.json({
      placements: PLACEMENTS,
      doctrine: AD_CANVAS_DOCTRINE,
      note: "Pass brandId to load your saved ads.",
    });
  }

  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const id = (url.searchParams.get("id") || "").trim();
  if (id) {
    const doc = await loadDoc(brandId, id);
    if (!doc) return NextResponse.json({ error: "No such document." }, { status: 404 });
    if (url.searchParams.get("svg")) {
      return new NextResponse(renderSvg(doc), {
        status: 200,
        headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    return NextResponse.json({ doc, svg: renderSvg(doc), check: checkDoc(doc), placement: placement(doc.placementId) });
  }

  return NextResponse.json({
    placements: PLACEMENTS,
    docs: await listDocs(brandId),
    doctrine: AD_CANVAS_DOCTRINE,
  });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "ad-canvas"), 120, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const brandId = str("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });

  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const action = str("action") || "build";
  const nowISO = new Date().toISOString();
  const facts = str("suppliedFacts");

  try {
    if (action === "build") {
      const headline = str("headline");
      if (!headline) return NextResponse.json({ error: "A headline is required — an ad with nothing to say is a picture." }, { status: 400 });
      const placementId = isPlacement(body.placementId) ? body.placementId : "feed-square";
      const colours = Array.isArray(body.colours) ? (body.colours as unknown[]).filter((c): c is string => typeof c === "string") : [];
      const doc = docFromAd({
        brandId, docId: str("docId") || `ad-${Date.now().toString(36)}`,
        placementId, headline,
        subhead: str("subhead") || undefined,
        offer: str("offer") || undefined,
        cta: str("cta") || undefined,
        imageUrl: str("imageUrl") || undefined,
        logoUrl: str("logoUrl") || undefined,
        colours,
        origin: { kind: str("imageUrl") ? "generated" : "blank", provider: str("provider") || undefined, prompt: str("prompt") || undefined },
      });
      const saved = await saveDoc(doc, nowISO);
      return NextResponse.json({ doc: saved, svg: renderSvg(saved), check: checkDoc(saved, facts), placement: placement(saved.placementId) });
    }

    // Everything below operates on a document. It is either posted whole by the
    // editor or loaded by id — never half of each, so there is no chance of an
    // edit landing on a version the customer is not looking at.
    const doc = await resolveDoc(brandId, body);
    if (!doc) return NextResponse.json({ error: "No document — pass `doc` or a saved `docId`." }, { status: 400 });

    if (action === "edit") {
      const edit = body.edit as Edit | undefined;
      if (!edit || typeof edit !== "object" || typeof edit.op !== "string") return NextResponse.json({ error: "An `edit` with an `op` is required." }, { status: 400 });
      const res = applyEdit(doc, edit);
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      const out = fitAll(res.doc);
      const saved = await saveDoc(out, nowISO);
      return NextResponse.json({ doc: saved, svg: renderSvg(saved), check: checkDoc(saved, facts), note: res.note, charged: false });
    }

    if (action === "fix") {
      const finding = body.finding as CanvasFinding | undefined;
      if (!finding || typeof finding !== "object") return NextResponse.json({ error: "A `finding` is required." }, { status: 400 });
      const res = applyFix(doc, finding);
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      const out = fitAll(res.doc);
      const saved = await saveDoc(out, nowISO);
      return NextResponse.json({ doc: saved, svg: renderSvg(saved), check: checkDoc(saved, facts), note: res.note, charged: false });
    }

    if (action === "refit") {
      if (!isPlacement(body.placementId)) return NextResponse.json({ error: "placementId required", placements: PLACEMENT_IDS }, { status: 400 });
      const out = refit(doc, body.placementId);
      const saved = await saveDoc(out, nowISO);
      return NextResponse.json({ doc: saved, svg: renderSvg(saved), check: checkDoc(saved, facts), placement: placement(saved.placementId), charged: false });
    }

    if (action === "export") {
      const ids = Array.isArray(body.placementIds) ? (body.placementIds as unknown[]).filter(isPlacement) : PLACEMENT_IDS;
      const sizes = refitAll(doc, ids).map((r) => ({
        placement: r.placement,
        doc: r.doc,
        svg: renderSvg(r.doc),
        check: r.check,
      }));
      return NextResponse.json({
        sizes,
        publishable: sizes.filter((s) => s.check.publishable).length,
        of: sizes.length,
        note: "Each size is a re-layout of the same document, not a crop of one picture — which is why the story does not arrive with its offer under the reply bar. Nothing was regenerated, so nothing was charged.",
        charged: false,
      });
    }

    if (action === "check") {
      return NextResponse.json({ check: checkDoc(doc, facts), svg: renderSvg(doc), doc });
    }

    if (action === "delete") {
      const removed = await deleteDoc(brandId, doc.id);
      return NextResponse.json({ ok: removed, id: doc.id });
    }

    return NextResponse.json({ error: "Unknown action — use build, edit, fix, refit, export, check or delete." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Canvas failed" }, { status: 500 });
  }
}

/**
 * A posted document is forced back onto the caller's own brand before anything
 * touches it. Trusting `doc.brandId` from the body would let a valid session for
 * brand A save into brand B by editing one field.
 */
async function resolveDoc(brandId: string, body: Record<string, unknown>): Promise<AdDoc | null> {
  const posted = body.doc;
  if (posted && typeof posted === "object" && Array.isArray((posted as AdDoc).layers)) {
    return { ...(posted as AdDoc), brandId };
  }
  const id = typeof body.docId === "string" ? body.docId.trim() : "";
  return id ? loadDoc(brandId, id) : null;
}
