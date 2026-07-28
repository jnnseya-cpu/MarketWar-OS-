import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { resolveBrandAccess } from "@/backend/brand-access";
import { meterAction } from "@/backend/wallet";
import { gatewayLangFrom } from "@/backend/gateway";
import { writeEmailTemplate, EMAIL_PURPOSES, type EmailPurposeId } from "@/backend/email-template-writer";

// AI writer for the Email Template editor.
//
// POST { brandId, business, product?, audience?, location?, offer?, website?,
//        purpose?, notes?, tone? }
//   → { draft: { name, subject, heading, body, ctaLabel, ctaUrl },
//       written, tokensUsed, warnings, blocked, note }
//
// The draft is returned for editing — never saved, never sent. The customer
// still has to press Create template.
//
// GET → { purposes } so the editor's list of email jobs is generated from the
// same table the writer uses, and the two cannot drift apart.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The gateway budgets up to 50s. A route that calls it must reserve more, or
// the function is killed mid-call and the customer sees nothing at all.
export const maxDuration = 60;

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function GET() {
  return NextResponse.json({
    purposes: EMAIL_PURPOSES.map((p) => ({ id: p.id, label: p.label, needs: p.needs ?? null })),
  });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "email-template-ai"), 20, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const brandId = s(body.brandId);
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const business = s(body.business);
  if (!business) return NextResponse.json({ error: "Pick a brand first — the email is written from that brand's own details." }, { status: 400 });

  // Charged only once the request is known to be valid and owned, so a typo
  // never costs a customer ACUs.
  const meter = await meterAction(auth, "llm");
  if (!meter.allowed) return NextResponse.json({ error: meter.error }, { status: meter.status });

  const purpose = EMAIL_PURPOSES.find((p) => p.id === s(body.purpose))?.id as EmailPurposeId | undefined;

  const result = await writeEmailTemplate({
    business,
    product: s(body.product) || undefined,
    audience: s(body.audience) || undefined,
    location: s(body.location) || undefined,
    offer: s(body.offer) || undefined,
    website: s(body.website) || undefined,
    purpose,
    notes: s(body.notes) || undefined,
    tone: s(body.tone) || undefined,
    lang: gatewayLangFrom(req),
  });

  // A refused draft (no provider, unusable reply, fabricated claim) is a 200
  // with ok:false and the outline attached — the editor shows the reason and
  // the customer keeps working. It is never a silent empty box.
  return NextResponse.json({
    ok: result.ok,
    draft: result.draft,
    written: result.written,
    provider: result.provider,
    tokensUsed: result.tokensUsed,
    warnings: result.warnings,
    blocked: result.blocked,
    note: result.note,
    balanceAcu: meter.balanceAcu,
  });
}
