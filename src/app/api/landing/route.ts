import { NextRequest, NextResponse } from "next/server";
import { generateLandingPage, selectPageType, type LandingInput } from "@/backend/landing";
import { savePage, type StoredLandingPage } from "@/backend/landing-store";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey } from "@/backend/guard";

// AI Landing Page Creation Engine API (§4.6–§4.14).
// POST { action?:"generate", business, objective, offer?, ... }
//   → full LandingPage (type, structure, copy, form, tracking, 8 scores, A/B).
// POST { action:"publish", brandId, brandName, logoUrl?, brandColours?, ...input }
//   → persists the page and returns a REAL live URL (/b/{brandId}/{slug}).
// GET → the 10 page types + doctrine.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function inputFrom(body: Record<string, unknown>): LandingInput {
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : undefined);
  return {
    business: str("business") || "your business",
    objective: str("objective"), offer: str("offer"), audience: str("audience"),
    location: str("location"), product: str("product"), painPoint: str("painPoint"),
    whatsappNumber: str("whatsappNumber"),
  };
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "generate";

  if (action === "publish") {
    const rl = rateLimit(clientKey(req, "landing-publish"), 30, 60_000, Date.now());
    if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

    const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
    if (!brandId) return NextResponse.json({ error: "brandId is required to publish" }, { status: 400 });
    const access = await resolveBrandAccess(req, brandId);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    const input = inputFrom(body);
    const page = generateLandingPage(input);
    const relUrl = `/b/${brandId}/${page.slug}`;
    const origin = req.nextUrl.origin || "https://www.marketwaros.com";
    const stored: StoredLandingPage = {
      ...page,
      publishUrl: relUrl,
      brandId,
      brandName: typeof body.brandName === "string" && body.brandName.trim() ? body.brandName.trim() : input.business || brandId,
      logoUrl: typeof body.logoUrl === "string" ? body.logoUrl : undefined,
      brandColours: Array.isArray(body.brandColours) ? body.brandColours.map(String).filter(Boolean) : undefined,
      whatsappNumber: input.whatsappNumber,
      publishedAt: typeof body.nowISO === "string" ? body.nowISO : new Date().toISOString(),
      live: true,
    };
    await savePage(stored);
    return NextResponse.json({ page: stored, url: relUrl, absoluteUrl: `${origin}${relUrl}` });
  }

  // Default: generate (preview) — no persistence.
  return NextResponse.json(generateLandingPage(inputFrom(body)));
}

export async function GET() {
  return NextResponse.json({
    engine: "AI Landing Page Creation Engine — the central agent (attention → action)",
    pageTypes: ["lead_capture", "whatsapp_conversion", "booking", "order", "app_download", "partner_signup", "event_ticket", "reactivation", "local_seo", "offer_claim"],
    exampleSelection: { "get whatsapp orders": selectPageType("get whatsapp orders"), "book appointments": selectPageType("book appointments"), "sell tickets": selectPageType("sell event tickets") },
    doctrine: "Never a generic page. Every page is built from the business, objective, offer, audience and pain — with the 10-section structure, 8-score matrix, A/B variants and objective-driven forms; scores are estimates, real performance is measured post-launch. Published pages are served live at /b/{brandId}/{slug}.",
  });
}
