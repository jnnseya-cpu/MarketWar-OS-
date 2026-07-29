import { NextRequest, NextResponse } from "next/server";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { meterAction, creditAcus, ACTION_COST_ACU } from "@/backend/wallet";
import { gatewayLangFrom } from "@/backend/gateway";
import { buildAsset, ASSET_IDS, SOCIAL_LIMITS, type BrandKitAssetId, type BrandKitAsset } from "@/backend/brand-kit";
import { extractLogoPalette } from "@/backend/logo-palette";
import { distilIdentity, saveIdentity, getIdentity } from "@/backend/brand-identity";

// Brand Launch Kit — the eight day-one documents, generated from the brand the
// customer already set up.
//
// GET                          → which assets exist, and the limits that are enforced
// POST { brandId, assets[] }   → builds them
//
// Written in the caller's language: the gateway reads x-mw-lang, so a French
// customer gets a French charte graphique rather than an English one they have
// to translate before handing it to a designer.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// Enough for the whole kit without the request outliving its ceiling. Each
// asset is one model call; eight of them at ~20s worst case fits 300s.
const BUDGET_MS = Number(process.env.BRAND_KIT_BUDGET_MS || 260_000);

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId") || "";
  const identity = brandId ? await getIdentity(brandId).catch(() => null) : null;
  return NextResponse.json({
    identity,
    assets: ASSET_IDS,
    socialLimits: SOCIAL_LIMITS,
    note: "Every asset is built from your brand's stored details. Anything the platform does not actually hold — hex codes, typefaces, phone numbers — is marked for you to supply rather than invented: a guessed colour becomes your brand the moment a designer builds to it.",
  });
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const rl = rateLimit(clientKey(req, "brand-kit"), 6, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const brandId = s(body.brandId);
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const name = s(body.name);
  if (!name) return NextResponse.json({ error: "A brand name is required — every document here is written about a named business." }, { status: 400 });

  const wanted = (Array.isArray(body.assets) ? (body.assets as unknown[]).map(s) : [])
    .filter((a): a is BrandKitAssetId => (ASSET_IDS as string[]).includes(a));
  const assets = wanted.length ? wanted : ASSET_IDS;

  const facts = {
    name,
    product: s(body.product), audience: s(body.audience), location: s(body.location),
    industry: s(body.industry), website: s(body.website), offer: s(body.offer), goal: s(body.goal),
    colours: Array.isArray(body.colours) ? (body.colours as unknown[]).map(s).filter(Boolean) : [],
    logoUrl: s(body.logoUrl) || undefined,
    extras: Array.isArray(body.extras)
      ? (body.extras as { label?: unknown; value?: unknown }[])
          .map((e) => ({ label: s(e?.label), value: s(e?.value) }))
          .filter((e) => e.label && e.value)
          .slice(0, 12)
      : [],
  };

  const meter = await meterAction(auth, "llm", assets.length);
  if (!meter.allowed) return NextResponse.json({ error: meter.error }, { status: meter.status });

  // Read the real palette out of the logo the customer already uploaded, before
  // anything is written. The colours were always in the file; nothing had ever
  // read a pixel of it, so the guidelines asked for hex codes the platform
  // could have measured. Not charged — it is our own CPU, not a provider call.
  let palette = null as Awaited<ReturnType<typeof extractLogoPalette>> | null;
  if (!facts.colours.length && facts.logoUrl) {
    palette = await extractLogoPalette(facts.logoUrl).catch(() => null);
    if (palette?.ok) facts.colours = palette.colours.map((c) => c.hex);
  }

  const lang = gatewayLangFrom(req);
  const built: BrandKitAsset[] = [];
  const failed: { id: string; error: string }[] = [];

  // Sequential on purpose. Eight parallel calls to one provider is how a rate
  // limit turns a full kit into a row of errors, and there is time in the
  // budget to be patient.
  for (const id of assets) {
    if (Date.now() > startedAt + BUDGET_MS) {
      failed.push({ id, error: "The run reached its time limit before this one was written. Build it on its own." });
      continue;
    }
    try {
      built.push(await buildAsset(id, facts, {}, { lang }));
    } catch (e) {
      failed.push({ id, error: (e as Error).message });
    }
  }

  // Refund what was not produced. The customer pays for documents.
  let refunded = 0;
  if (failed.length && meter.metered && auth.uid) {
    refunded = failed.length * ACTION_COST_ACU.llm;
    await creditAcus(auth.uid, refunded).catch(() => { refunded = 0; });
  }

  // Distil and KEEP the structured parts. This is what turns eight documents
  // into the brand's memory: every other engine in the OS reads this record
  // rather than inventing its own answer.
  let identity = null;
  if (built.length) {
    const suppliedFonts = (() => {
      const f = facts.extras.find((e) => /font|typeface|police/i.test(e.label));
      if (!f) return undefined;
      const [heading, body] = f.value.split(/\s*[\/,;]\s*/);
      return { heading: heading?.trim(), body: (body || heading)?.trim() };
    })();
    const tagline = facts.extras.find((e) => /tagline|slogan|baseline/i.test(e.label))?.value;
    identity = await saveIdentity(brandId, distilIdentity(brandId, built, {
      measuredColours: palette?.ok ? palette.colours.map((c) => c.hex) : undefined,
      measuredAccent: palette?.ok ? palette.accent : undefined,
      suppliedFonts,
      suppliedTagline: tagline,
    })).catch(() => null);
  }

  const needsTotal = built.reduce((n, a) => n + a.needs.length, 0);
  const blocked = built.filter((a) => a.blockers.length).length;

  return NextResponse.json({
    assets: built,
    failed,
    identity,
    palette: palette ? { ok: palette.ok, colours: palette.colours, accent: palette.accent, note: palette.note } : null,
    charged: assets.length * ACTION_COST_ACU.llm,
    refunded,
    balanceAcu: meter.balanceAcu === undefined ? undefined : meter.balanceAcu + refunded,
    note: [
      `${built.length} of ${assets.length} document(s) written.`,
      needsTotal ? `${needsTotal} detail(s) across the kit are marked for you to supply — fill them in and rebuild rather than deleting the markers.` : "",
      blocked ? `${blocked} document(s) contain a claim nothing you supplied backs. Fix those before handing them to anyone.` : "",
      refunded ? `${refunded} ACUs refunded for ${failed.length} document(s) that were not produced.` : "",
      palette?.ok ? `${palette.colours.length} colour(s) were read from your logo rather than asked for.` : "",
      identity ? "Saved as this brand's identity — the email writer, page builder and social publisher now read the same tone, colours and bios." : "",
    ].filter(Boolean).join(" "),
  });
}
