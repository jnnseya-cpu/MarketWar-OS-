import { NextRequest, NextResponse } from "next/server";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey } from "@/backend/guard";
import { saveTemplate, listTemplates, deleteTemplate, mergeTemplate } from "@/backend/email-templates";

// Email template store (the editor behind the ESP).
// POST { action:"save", brandId, name, subject, html }     → upsert a template
// POST { action:"preview", brandId, subject, html, sample } → merged preview
// GET  ?brandId=…                                          → list templates
// DELETE ?brandId=…&id=…                                   → delete a template
// Ownership enforced on every path.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "email-templates"), 40, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const action = typeof body.action === "string" ? body.action : "save";

  // Preview needs no persistence — just merge sample data so the editor shows the
  // real, personalised output the recipient would receive.
  if (action === "preview") {
    const subject = typeof body.subject === "string" ? body.subject : "";
    const html = typeof body.html === "string" ? body.html : "";
    const sample = (body.sample && typeof body.sample === "object" ? body.sample : {}) as Record<string, string>;
    const brand = typeof body.brand === "string" ? body.brand : "";
    return NextResponse.json({
      subject: mergeTemplate(subject, { contact: sample, brand }),
      html: mergeTemplate(html, { contact: sample, brand }),
    });
  }

  if (action === "save") {
    const name = typeof body.name === "string" ? body.name : "";
    const subject = typeof body.subject === "string" ? body.subject : "";
    const html = typeof body.html === "string" ? body.html : "";
    if (!name.trim()) return NextResponse.json({ error: "Template name is required" }, { status: 400 });
    if (html.length > 500_000) return NextResponse.json({ error: "Template is too large (500KB max)" }, { status: 400 });
    try {
      const tpl = await saveTemplate(brandId, name, subject, html, new Date().toISOString());
      return NextResponse.json(tpl);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  }

  return NextResponse.json({ error: "Unknown action — use save or preview" }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId") || "";
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  return NextResponse.json({ templates: await listTemplates(brandId) });
}

export async function DELETE(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId") || "";
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!brandId || !id) return NextResponse.json({ error: "brandId and id required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  await deleteTemplate(brandId, id);
  return NextResponse.json({ ok: true });
}
