import { NextRequest, NextResponse } from "next/server";
import {
  authoriseIngestion, businessDNA, truthLayer, instantAudit, attackMap, demoSiteRaid,
  INPUT_TYPES, GAP_CLASSES, ATTACK_PRIORITIES,
  type Authorisation, type SiteExtract, type Claim,
} from "@/backend/siteraid";

// SiteRaid AI™ API — Website → Autonomous Viral Growth brain (deterministic).
// Live crawl / competitor fetch route through connectors; this surface is the
// DNA / Truth-Layer / audit / attack-map brain.
// POST { action: "authorise", authorisation }              → ingestion gate
// POST { action: "dna", site{business,category,offers,…} } → Business DNA
// POST { action: "truth", claims[] }                       → Truth Layer verdicts
// POST { action: "audit", site{…} }                        → 6-part marketing audit
// POST { action: "attack", site{…} }                       → Competitive Attack Map
// GET  → doctrine, input types, gap classes, priorities, demo SiteRaid run

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "audit";
  const site = body.site as SiteExtract | undefined;
  const needsSite = ["dna", "audit", "attack"].includes(action);
  if (needsSite && (!site || !site.business || !site.category || !Array.isArray(site.offers))) {
    return NextResponse.json({ error: `${action} requires site.business, site.category and site.offers[]` }, { status: 400 });
  }

  if (action === "authorise") {
    return NextResponse.json(authoriseIngestion({ authorisation: body.authorisation as Authorisation | undefined }));
  }
  if (action === "dna") return NextResponse.json(businessDNA(site!));
  if (action === "truth") {
    const claims = Array.isArray(body.claims) ? (body.claims as Claim[]) : [];
    return NextResponse.json(truthLayer(claims));
  }
  if (action === "audit") return NextResponse.json(instantAudit(site!));
  if (action === "attack") return NextResponse.json(attackMap(site!));

  return NextResponse.json({ error: "Unknown action — use authorise, dna, truth, audit or attack" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "SiteRaid AI™ — Website → Autonomous Viral Growth engine",
    doctrine: "Not a URL-to-ad scraper: understand → diagnose → map where to win. Ingestion needs ownership/permission (competitor URLs are public-analysis only, never republished). The Website Truth Layer™ blocks unsubstantiated superlatives and links every publishable claim to a source — no hallucinated advertising.",
    inputTypes: INPUT_TYPES,
    gapClasses: GAP_CLASSES,
    attackPriorities: ATTACK_PRIORITIES,
    demo: demoSiteRaid(),
  });
}
