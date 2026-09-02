import { NextRequest, NextResponse } from "next/server";
import {
  authoriseIngestion, businessDNA, truthLayer, instantAudit, attackMap, demoSiteRaid,
  INPUT_TYPES, GAP_CLASSES, ATTACK_PRIORITIES,
  type Authorisation, type SiteExtract, type Claim,
} from "@/backend/siteraid";
import { crawlSite } from "@/backend/crawler";
import { deepCrawl } from "@/backend/deep-crawl";
import { saveSiteFacts, latestSiteFacts, memoryFactsFrom, provenance, factsAreDurable } from "@/backend/site-facts";
import { remember } from "@/backend/brand-memory";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { meterAction } from "@/backend/wallet";

// SiteRaid AI API — Website → Autonomous Viral Growth brain (deterministic).
// Live crawl / competitor fetch route through connectors; this surface is the
// DNA / Truth-Layer / audit / attack-map brain.
// POST { action: "authorise", authorisation }              → ingestion gate
// POST { action: "dna", site{business,category,offers,…} } → Business DNA
// POST { action: "truth", claims[] }                       → Truth Layer verdicts
// POST { action: "audit", site{…} }                        → 6-part marketing audit
// POST { action: "attack", site{…} }                       → Competitive Attack Map
// GET  → doctrine, input types, gap classes, priorities, demo SiteRaid run

// A deep crawl fetches robots.txt, a sitemap, a stylesheet and up to a dozen
// pages, one at a time and politely. It needs room; overrunning returns a 504
// with no body, which tells the customer nothing.
export const maxDuration = 120;
const DEEP_BUDGET_MS = 105_000;

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  // P1 denial-of-wallet: this route spends real provider budget (AI/search/crawl).
  // Rate-limit always; require auth + meter ACUs once accounts are enforced.
  const _rl = rateLimit(clientKey(req, "siteraid"), 60, 60_000, Date.now());
  if (!_rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(_rl.retryAfterSec) } });
  const _auth = await requireAuth(req);
  if (!_auth.ok) return NextResponse.json({ error: _auth.error }, { status: _auth.status });
  const _meter = await meterAction(_auth, "search");
  if (!_meter.allowed) return NextResponse.json({ error: _meter.error }, { status: _meter.status });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "audit";
  const site = body.site as SiteExtract | undefined;
  const needsSite = ["dna", "audit", "attack"].includes(action);
  if (needsSite && (!site || !site.business || !site.category || !Array.isArray(site.offers))) {
    return NextResponse.json({ error: `${action} requires site.business, site.category and site.offers[]` }, { status: 400 });
  }

  // Live crawl — a REAL measured audit of the actual page (no third party).
  if (action === "crawl") {
    const rl = rateLimit(clientKey(req, "siteraid-crawl"), 20, 60_000, Date.now());
    if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
    const target = typeof body.url === "string" ? body.url : "";
    if (!target.trim()) return NextResponse.json({ error: "A website URL is required to crawl." }, { status: 400 });
    return NextResponse.json(await crawlSite(target));
  }

  // Deep crawl — several pages, robots-obeying, with extraction. This is what
  // "Activate with a connector" was standing in for; there is no connector.
  if (action === "deep") {
    const rl = rateLimit(clientKey(req, "siteraid-deep"), 6, 60_000, Date.now());
    if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
    const target = typeof body.url === "string" ? body.url : "";
    if (!target.trim()) return NextResponse.json({ error: "A website URL is required to crawl." }, { status: 400 });
    // Budget anchored at arrival, under maxDuration, so a big site returns a
    // partial answer that says so rather than a 504 that says nothing.
    const spent = Date.now() - startedAt;
    const crawled = await deepCrawl(target, {
      maxPages: Math.max(1, Math.min(12, Number(body.maxPages) || 8)),
      budgetMs: Math.max(10_000, DEEP_BUDGET_MS - spent),
    });
    // KEEP IT. This is the whole point: the crawl used to live in the browser
    // and die there, so the audit four hundred pixels below it scored nothing.
    const stored = await keepCrawl(req, body, crawled);
    return NextResponse.json({ ...crawled, stored });
  }

  if (action === "authorise") {
    return NextResponse.json(authoriseIngestion({ authorisation: body.authorisation as Authorisation | undefined }));
  }
  if (action === "dna") return NextResponse.json(businessDNA(site!));
  if (action === "truth") {
    const claims = Array.isArray(body.claims) ? (body.claims as Claim[]) : [];
    return NextResponse.json(truthLayer(claims));
  }
  if (action === "audit") {
    // The audit scores what a crawl found. Given a URL it fetches one, because
    // an audit handed nothing but a business name can only honestly answer
    // "not measured" — which is what it now does rather than hashing the name
    // into a plausible-looking 72/100.
    //
    // But "no URL" no longer means "no evidence". If this brand has been
    // crawled before, that crawl is the evidence, and re-fetching the site to
    // learn what we already know would cost the customer time and money for
    // nothing.
    const target = typeof body.url === "string" ? body.url.trim() : "";
    if (!target) {
      const kept = await storedFacts(req, body);
      if (kept) {
        return NextResponse.json({
          ...instantAudit(site!, { audit: kept.audit, extraction: kept.extraction }),
          evidence: { from: "stored-crawl", url: kept.url, at: kept.at, pages: kept.pagesRead, ageDays: kept.ageDays, stale: kept.stale, note: provenance(kept) },
        });
      }
      return NextResponse.json(instantAudit(site!));
    }
    const spent = Date.now() - startedAt;
    const deep = await deepCrawl(target, {
      maxPages: Math.max(1, Math.min(12, Number(body.maxPages) || 6)),
      budgetMs: Math.max(10_000, DEEP_BUDGET_MS - spent),
    });
    return NextResponse.json({
      ...instantAudit(site!, { audit: deep.audit, extraction: deep.extraction }),
      crawl: { pages: deep.pages.length, partial: deep.partial, note: deep.note },
    });
  }
  if (action === "attack") {
    // Ranked from a crawl when there is one, honestly unranked when there is not.
    const target = typeof body.url === "string" ? body.url.trim() : "";
    if (!target) {
      const kept = await storedFacts(req, body);
      if (kept) return NextResponse.json({ ...attackMap(site!, { audit: kept.audit, extraction: kept.extraction }), evidence: { from: "stored-crawl", at: kept.at, note: provenance(kept) } });
      return NextResponse.json(attackMap(site!));
    }
    const spent = Date.now() - startedAt;
    const deep = await deepCrawl(target, {
      maxPages: Math.max(1, Math.min(12, Number(body.maxPages) || 6)),
      budgetMs: Math.max(10_000, DEEP_BUDGET_MS - spent),
    });
    return NextResponse.json(attackMap(site!, { audit: deep.audit, extraction: deep.extraction }));
  }

  return NextResponse.json({ error: "Unknown action — use authorise, dna, truth, audit or attack" }, { status: 400 });
}

// Ownership-checked before anything is stored against a brand or read back out
// of it. A crawl is the customer's own intelligence about their own site.
async function brandFor(req: NextRequest, body: Record<string, unknown>): Promise<string | null> {
  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  if (!brandId) return null;
  const access = await resolveBrandAccess(req, brandId);
  return access.ok ? brandId : null;
}

async function storedFacts(req: NextRequest, body: Record<string, unknown>) {
  const brandId = await brandFor(req, body);
  return brandId ? latestSiteFacts(brandId) : null;
}

async function keepCrawl(req: NextRequest, body: Record<string, unknown>, crawl: Awaited<ReturnType<typeof deepCrawl>>) {
  const brandId = await brandFor(req, body);
  if (!brandId) return { kept: false, why: "No brand on the request, so the crawl was not stored." };
  const nowISO = new Date().toISOString();
  const facts = await saveSiteFacts(brandId, crawl, nowISO);
  if (!facts) return { kept: false, why: "Nothing readable was fetched, so there was nothing worth keeping." };

  // And the facts the whole agent network can now read. MEASURED, because a
  // count of what is in the HTML is a count of what is in the HTML — never the
  // audience or the vertical, which are inferences other modules label as such.
  let written = 0;
  for (const f of memoryFactsFrom(facts)) {
    const res = await remember({ brandId, key: f.key, value: f.value, source: "measured", sourceRef: "deep-crawl", confidence: 1, observedAt: nowISO, note: f.note });
    if (res.ok) written++;
  }
  // SAY WHEN IT WILL NOT SURVIVE. Without Firebase Admin the store is this
  // instance's memory, which on serverless means the next request may not see
  // it — and the audit would go back to "nothing measured" with no explanation.
  // A silent failure here recreates the exact defect this fix exists to remove.
  const durable = factsAreDurable();
  return {
    kept: true, durable, pages: facts.pagesRead, memoryFacts: written,
    why: durable
      ? "Kept against this brand — the audit, the attack map and every agent now read it instead of asking you again."
      : "Held in memory only: Firebase Admin is not configured on this deployment, so this crawl may not survive to the next request and the audit can fall back to 'not measured'. Configure the FIREBASE_* admin credentials to make it stick.",
  };
}

export async function GET() {
  return NextResponse.json({
    engine: "SiteRaid AI — Website → Autonomous Viral Growth engine",
    doctrine: "Not a URL-to-ad scraper: understand → diagnose → map where to win. Ingestion needs ownership/permission (competitor URLs are public-analysis only, never republished). The Website Truth Layer blocks unsubstantiated superlatives and links every publishable claim to a source — no hallucinated advertising.",
    inputTypes: INPUT_TYPES,
    gapClasses: GAP_CLASSES,
    attackPriorities: ATTACK_PRIORITIES,
    demo: demoSiteRaid(),
  });
}
