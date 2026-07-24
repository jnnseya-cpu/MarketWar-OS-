import { NextRequest, NextResponse } from "next/server";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey } from "@/backend/guard";
import { addDomain, listDomains, verifyDomain, removeDomain } from "@/backend/sending-domains";

// ESP sending-domain authentication API.
// POST { action:"add", brandId, domain }        → generate DKIM key + DNS records
// POST { action:"verify", brandId, domain }     → live DNS check, flips to verified
// GET  ?brandId=…                               → list domains + records (no keys)
// DELETE ?brandId=…&domain=…                    → remove a domain
// Ownership enforced; the private key is NEVER returned.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "sending-domains"), 20, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  const domain = typeof body.domain === "string" ? body.domain.trim() : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });

  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    if (action === "add") return NextResponse.json(await addDomain(brandId, domain));
    if (action === "verify") {
      const v = await verifyDomain(brandId, domain);
      if (!v) return NextResponse.json({ error: "Domain not found — add it first" }, { status: 404 });
      return NextResponse.json(v);
    }
    return NextResponse.json({ error: "Unknown action — use add or verify" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId") || "";
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  return NextResponse.json({ domains: await listDomains(brandId) });
}

export async function DELETE(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId") || "";
  const domain = req.nextUrl.searchParams.get("domain") || "";
  if (!brandId || !domain) return NextResponse.json({ error: "brandId and domain required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  await removeDomain(brandId, domain);
  return NextResponse.json({ ok: true });
}
