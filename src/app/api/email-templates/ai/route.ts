import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { resolveBrandAccess } from "@/backend/brand-access";
import { meterAction } from "@/backend/wallet";
import { gatewayLangFrom } from "@/backend/gateway";
import { writeEmailTemplate, EMAIL_PURPOSES, type EmailPurposeId } from "@/backend/email-template-writer";
import { getIdentity, identityBrief } from "@/backend/brand-identity";

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

async function GETImpl() {
  return NextResponse.json({
    purposes: EMAIL_PURPOSES.map((p) => ({ id: p.id, label: p.label, needs: p.needs ?? null })),
  });
}

async function POSTImpl(req: NextRequest) {
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

  // Read the brand's stored identity so this email sounds like the brand rather
  // than like whatever the model felt like today. Best-effort: a brand with no
  // identity yet still gets an email.
  const identity = await getIdentity(s(body.brandId)).catch(() => null);

  const result = await writeEmailTemplate({
    business,
    identityBrief: identityBrief(identity) || undefined,
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


// EVERY ANSWER FROM THIS ROUTE IS JSON — see backend/route-guard.ts.
import { jsonRoute } from "@/backend/route-guard";
export const POST = jsonRoute(POSTImpl as never, { maxSeconds: 60, label: "/api/email-templates/ai" });
export const GET = jsonRoute(GETImpl as never, { maxSeconds: 60, label: "/api/email-templates/ai" });
