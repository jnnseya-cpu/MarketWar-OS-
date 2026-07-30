import { NextRequest, NextResponse } from "next/server";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import {
  getDeployConfig, saveDeployConfig, installTag, snippetInstalled, normaliseHost,
  draftFixesFromCrawl, crawledPath,
  type SeoFix, type SeoFixKind, type CrawlSummary,
} from "@/backend/seo-deploy";
import type { Brand } from "@/shared/brand";
import { SEO_FIX_KIND_VALUES } from "@/shared/seo-deploy";

// Manage what the auto-deploy snippet is allowed to do.
//
// GET  ?brandId=…            → the config, the install tag, and whether it is live
// POST { brandId, brand, crawl } → draft fixes from a SiteRaid crawl (saves nothing)
// PUT  { brandId, … }        → hosts, on/off, and per-fix approval
//
// Approval lives here, on the server. The snippet is public — anyone can read
// it — so an unapproved fix must never be written into it in the first place.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
// One list, shared with the panel — a kind the UI offers but the route rejects
// would silently drop a fix the customer thought they had saved.
const KINDS: SeoFixKind[] = SEO_FIX_KIND_VALUES;
const SITE = (process.env.NEXT_PUBLIC_PRODUCTION_URL || "https://www.marketwaros.com").replace(/\/$/, "");

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId") || "";
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const config = await getDeployConfig(brandId);
  const tag = installTag(SITE, brandId);

  // Measured, not assumed: fetch the customer's own page and look for the tag.
  let installed: boolean | null = null;
  const checkUrl = s(req.nextUrl.searchParams.get("verifyUrl"));
  if (checkUrl) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8_000);
      const res = await fetch(checkUrl, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": "MarketWarBot/1.0 (+https://marketwaros.com)" } });
      clearTimeout(t);
      installed = res.ok ? snippetInstalled(await res.text(), brandId) : null;
    } catch { installed = null; }
  }

  const approved = config.fixes.filter((f) => f.approved).length;
  return NextResponse.json({
    config,
    installTag: tag,
    installed,
    note: [
      `${approved} of ${config.fixes.length} fix(es) approved.`,
      config.enabled ? "" : "Auto-deploy is OFF, so the snippet applies nothing even where it is installed.",
      config.allowedHosts.length ? "" : "No hosts are authorised yet, so the snippet refuses to run anywhere — that is what stops someone pasting your snippet onto their own site.",
      installed === false ? "The page checked does not contain the tag." : installed === true ? "The tag is present on the page checked." : "",
      "This applies fixes in the browser. Google renders JavaScript and will see them, on a later pass than server-rendered markup — but social unfurlers, non-rendering crawlers and the AI assistants your visibility check asks will NOT. Where you can edit the page template, do it there instead.",
    ].filter(Boolean).join(" "),
  });
}

/**
 * Draft fixes from a crawl. Deliberately READ-ONLY.
 *
 * Nothing is saved and nothing is approved: this hands back candidates for a
 * person to look at. Saving would mean the act of pressing "crawl" changed what
 * a customer's live website says.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "seo-deploy-draft"), 30, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const brandId = s(body.brandId);
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const brand = (body.brand && typeof body.brand === "object" ? body.brand : {}) as Brand;
  if (!s(brand.name)) return NextResponse.json({ error: "brand.name required — fixes are written from your brand's own record, never invented" }, { status: 400 });
  const crawl = (body.crawl && typeof body.crawl === "object" ? body.crawl : {}) as CrawlSummary;

  const cur = await getDeployConfig(brandId);
  const { fixes, needsYou } = draftFixesFromCrawl(crawl, brand, cur.fixes);
  const path = crawledPath(crawl);

  return NextResponse.json({
    fixes, needsYou, path,
    note: [
      fixes.length
        ? `${fixes.length} draft fix(es) for ${path}, written from your brand record. Nothing is saved or applied until you approve them.`
        : `Nothing to draft for ${path}${cur.fixes.length ? " that is not already on your list" : ""}.`,
      needsYou.length ? `${needsYou.length} gap(s) the OS will not fill on its own — see the reasons.` : "",
    ].filter(Boolean).join(" "),
  });
}

export async function PUT(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "seo-deploy"), 30, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const brandId = s(body.brandId);
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const cur = await getDeployConfig(brandId);
  const patch: Partial<typeof cur> = {};

  if (Array.isArray(body.allowedHosts)) {
    patch.allowedHosts = [...new Set((body.allowedHosts as unknown[]).map(s).map(normaliseHost).filter(Boolean))].slice(0, 10);
  }
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;

  if (Array.isArray(body.fixes)) {
    const now = new Date().toISOString();
    patch.fixes = (body.fixes as Record<string, unknown>[])
      .map((f, i): SeoFix | null => {
        const kind = s(f.kind) as SeoFixKind;
        if (!KINDS.includes(kind)) return null;
        const value = s(f.value);
        if (!value) return null;
        return {
          id: s(f.id) || `${kind}-${i}-${now}`,
          kind,
          path: s(f.path) || "*",
          value: value.slice(0, 6000),
          replace: f.replace === true,
          approved: f.approved === true,
          source: s(f.source) || "manual",
          createdAt: s(f.createdAt) || now,
        };
      })
      .filter((f): f is SeoFix => f !== null)
      .slice(0, 200);
  }

  const config = await saveDeployConfig(brandId, patch);
  const approved = config.fixes.filter((f) => f.approved).length;

  return NextResponse.json({
    config,
    installTag: installTag(SITE, brandId),
    note: [
      `Saved. ${approved} fix(es) will be applied.`,
      config.enabled && !config.allowedHosts.length
        ? "Auto-deploy is on but no host is authorised, so nothing runs. Add the domain this snippet should apply to."
        : "",
      approved && config.enabled ? "Live within five minutes — the snippet is cached briefly so a change you approve reaches your pages quickly." : "",
    ].filter(Boolean).join(" "),
  });
}
