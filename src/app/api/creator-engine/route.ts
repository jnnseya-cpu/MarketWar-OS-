import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { meterAction } from "@/backend/wallet";
import { resolveBrandAccess } from "@/backend/brand-access";
import { gatewayLangFrom } from "@/backend/gateway";
import {
  createProgramme, listProgrammes, getProgramme, setProgrammeActive, deleteProgramme, upsertCreator, getCreator, getCreatorByToken, listCreators, subscribe, listSubscriptions,
  recordConversion, creatorWallet, requestPayout, setFollowerVerification, creatorId as makeCreatorId,
  type CreatorAccount, type PayoutRegion,
} from "@/backend/creator-engine";
import { scoutScore, matchProgrammes, generateBrief, verifyFollowersBatch } from "@/backend/creator-agents";
import { EARNING_TIERS, MIN_PAYOUT_FOLLOWERS, MAX_PROGRAMMES, COMMISSION_BANDS, ratePct } from "@/shared/creator-program";

// Creator & Partner Monetisation Engine API — the whole loop.
// GET → catalogue + tiers + constants.
// POST { action, ... } → programmes, creators, subscriptions, ledger, wallet,
//   payout, and the Scout / Match / Brief agents.
//
// AUTH (production): every action is protected. Brand-scoped actions verify
// brand ownership; PII/agent reads require a signed-in user; money + admin
// actions (record_conversion, payout, admin_verify) require an admin scope or a
// server ledger secret. Demo/zero-config (no Firebase Admin) passes through.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// verify_followers fetches each social page and reads the count out of it with
// a model call, per profile. The route now debits before doing that, so the
// platform default of ~10s would charge a customer and then be killed with
// nothing delivered.
export const maxDuration = 120;

// Which actions require what. Read-but-PII and agent actions need a signed-in
// user; money/admin actions need platform_admin (or the ledger secret).
const ADMIN_ACTIONS = new Set(["record_conversion", "payout", "admin_verify"]);
const AUTHED_ACTIONS = new Set(["list_creators", "creator", "wallet", "subscriptions", "subscribe", "register_creator", "scout", "match", "brief", "verify_followers"]);

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "creator-engine"), 40, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof b.action === "string" ? b.action : "";
  const s = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : "");
  const num = (k: string) => (typeof b[k] === "number" ? (b[k] as number) : Number(b[k]) || 0);
  const nowISO = typeof b.nowISO === "string" ? b.nowISO : new Date().toISOString();

  // Kept so the actions that spend can charge the same signed-in caller the
  // gate just approved, instead of re-verifying the token a second time.
  let authed: Awaited<ReturnType<typeof requireAuth>> | null = null;

  // ---- Authorisation gate ----
  if (action === "create_programme" || action === "list_programmes" || action === "set_programme_active" || action === "delete_programme") {
    const access = await resolveBrandAccess(req, s("brandId"));
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  } else if (ADMIN_ACTIONS.has(action)) {
    // record_conversion also accepts a server ledger secret (billing webhook).
    const secret = req.headers.get("x-ledger-secret") || "";
    const secretOk = action === "record_conversion" && process.env.CREATOR_LEDGER_SECRET && secret === process.env.CREATOR_LEDGER_SECRET;
    if (!secretOk) {
      const auth = await requireAuth(req, { scope: "platform_admin" });
      if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
  } else if (AUTHED_ACTIONS.has(action)) {
    authed = await requireAuth(req);
    if (!authed.ok) return NextResponse.json({ error: authed.error }, { status: authed.status });
  }

  switch (action) {
    case "create_programme": {
      if (!s("brandId") || !s("name")) return NextResponse.json({ error: "brandId and name are required" }, { status: 400 });
      const scope = (["brand", "product", "both", "custom"].includes(s("scope")) ? s("scope") : "brand") as "brand" | "product" | "both" | "custom";
      return NextResponse.json(await createProgramme({ brandId: s("brandId"), brandName: s("brandName") || s("brandId"), name: s("name"), scope, target: s("target"), campaign: s("campaign"), destinationUrl: s("destinationUrl"), product: s("product"), description: s("description"), nowISO }));
    }
    case "list_programmes":
      return NextResponse.json({ programmes: await listProgrammes(s("brandId") || undefined) });

    // PAUSE / RESUME. `Programme.active` has gated subscribe() since the engine
    // was written and nothing could ever set it — a policy with no switch.
    case "set_programme_active": {
      const id = s("programmeId");
      if (!id) return NextResponse.json({ error: "programmeId is required" }, { status: 400 });
      const prog = await getProgramme(id);
      // The gate above proved the CALLER owns the brand they named; this proves
      // the PROGRAMME belongs to that brand. Without the second check a caller
      // could pause any programme on the platform by naming their own brand.
      if (!prog || prog.brandId !== s("brandId")) return NextResponse.json({ error: "That programme is not in this brand." }, { status: 404 });
      const next = await setProgrammeActive(id, b.active !== false, nowISO);
      return NextResponse.json({
        programme: next,
        note: next?.active
          ? "Live again — creators can subscribe and it appears in discovery."
          : "Paused. No new creator can subscribe and it is out of discovery; links already published keep working, and nothing already earned is affected.",
      });
    }

    case "delete_programme": {
      const id = s("programmeId");
      if (!id) return NextResponse.json({ error: "programmeId is required" }, { status: 400 });
      const prog = await getProgramme(id);
      if (!prog || prog.brandId !== s("brandId")) return NextResponse.json({ error: "That programme is not in this brand." }, { status: 404 });
      const res = await deleteProgramme(id);
      // 409, not 400: the request was well formed and the state refuses it.
      if (!res.ok) return NextResponse.json({ ...res, canPauseInstead: true }, { status: 409 });
      return NextResponse.json(res);
    }

    case "register_creator": {
      if (!s("email") || !s("name")) return NextResponse.json({ error: "name and email are required" }, { status: 400 });
      const scout = scoutScore({ followers: num("followers"), platforms: num("platforms") || 1, engagementPct: typeof b.engagementPct === "number" ? (b.engagementPct as number) : undefined, niche: s("niche"), brandNiche: s("brandNiche") });
      // SECURITY (ISO1): a partner's accessToken is a secret. Any signed-in user
      // can call this with someone else's email; if that partner already exists we
      // must neither overwrite their account nor return their token. Only a truly
      // NEW registration hands back the token (to the account it just created).
      const existing = await getCreator(makeCreatorId(s("email")));
      if (existing) {
        return NextResponse.json({
          creator: { id: existing.id, name: existing.name, tier: existing.tier, followers: existing.followers, followersVerified: existing.followersVerified, payoutEligible: existing.payoutEligible, scoutScore: existing.scoutScore },
          scout, existed: true,
          note: "This email is already registered — account left unchanged and its dashboard link is not exposed here.",
        });
      }
      const c = await upsertCreator({ name: s("name"), email: s("email"), tier: (s("tier") || "promoter") as CreatorAccount["tier"], followers: num("followers"), followersVerified: b.followersVerified === true, adminOverride: b.adminOverride === true, nowISO, scoutScore: scout.score, scoutFlags: scout.flags });
      return NextResponse.json({ creator: c, scout, existed: false });
    }
    case "subscribe": {
      const cid = s("creatorId") || (s("email") ? makeCreatorId(s("email")) : "");
      if (!cid || !s("programmeId")) return NextResponse.json({ error: "creatorId (or email) and programmeId required" }, { status: 400 });
      return NextResponse.json(await subscribe(cid, s("programmeId"), nowISO));
    }
    case "subscriptions":
      return NextResponse.json({ subscriptions: await listSubscriptions(s("creatorId")) });

    case "record_conversion": {
      if (!s("code")) return NextResponse.json({ error: "code is required" }, { status: 400 });
      return NextResponse.json(await recordConversion({ code: s("code"), grossGbp: num("grossGbp"), refundsGbp: num("refundsGbp"), feesGbp: num("feesGbp"), referredRef: s("referredRef"), idempotencyKey: s("idempotencyKey"), velocity: num("velocity"), nowISO }));
    }
    case "wallet": {
      const w = await creatorWallet(s("creatorId"));
      return w ? NextResponse.json(w) : NextResponse.json({ error: "No creator account" }, { status: 404 });
    }
    case "payout": {
      const region: PayoutRegion = s("region") === "africa" ? "africa" : "other";
      return NextResponse.json(await requestPayout(s("creatorId"), region, nowISO));
    }
    case "verify_followers": {
      const socials = Array.isArray(b.socials) ? (b.socials as { platform?: string; url: string }[]) : [];
      // Each social read is a page fetch plus a model call to pull the follower
      // count out of it — an AI action, charged per profile before it runs.
      if (!authed) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      const meter = await meterAction(authed, "llm", Math.max(1, socials.length));
      if (!meter.allowed) return NextResponse.json({ error: meter.error, balanceAcu: meter.balanceAcu }, { status: meter.status });
      const v = await verifyFollowersBatch(socials);
      if (s("creatorId") && v.verifiedTotal > 0 && v.humanRequired === 0) await setFollowerVerification(s("creatorId"), v.verifiedTotal, "ai");
      return NextResponse.json(v);
    }
    case "admin_verify": {
      const c = await setFollowerVerification(s("creatorId"), num("followers"), "human");
      return c ? NextResponse.json({ creator: c }) : NextResponse.json({ error: "No creator account" }, { status: 404 });
    }

    case "scout":
      return NextResponse.json(scoutScore({ followers: num("followers"), platforms: num("platforms") || 1, engagementPct: typeof b.engagementPct === "number" ? (b.engagementPct as number) : undefined, niche: s("niche"), brandNiche: s("brandNiche") }));
    case "match": {
      const catalogue = await listProgrammes(s("brandId") || undefined);
      return NextResponse.json({ matches: matchProgrammes(s("creatorNiche"), catalogue) });
    }
    case "brief": {
      const prog = s("programmeId") ? await getProgramme(s("programmeId")) : null;
      const p = prog || { name: s("name") || "the product", product: s("product"), description: s("description") };
      return NextResponse.json(await generateBrief({ name: p.name, product: p.product || "", description: p.description || "" }, gatewayLangFrom(req)));
    }
    case "creator":
      return NextResponse.json({ creator: await getCreator(s("creatorId")) });
    case "partner_portal": {
      // Token-gated: the partner's own access token IS the credential (no
      // platform login). Returns only that partner's own data.
      const partner = await getCreatorByToken(s("token"));
      if (!partner) return NextResponse.json({ error: "Invalid or expired dashboard link." }, { status: 401 });
      const [wallet, subscriptions] = await Promise.all([creatorWallet(partner.id), listSubscriptions(partner.id)]);
      // Enrich subscriptions with programme name/brand for display.
      const enriched = await Promise.all(subscriptions.map(async (sub) => {
        const prog = await getProgramme(sub.programmeId);
        return { code: sub.code, link: sub.link, programme: prog?.name || "", brand: prog?.brandName || "", destinationUrl: prog?.destinationUrl || "" };
      }));
      return NextResponse.json({
        partner: { name: partner.name, tier: partner.tier, followers: partner.followers, followersVerified: partner.followersVerified, payoutEligible: partner.payoutEligible, scoutScore: partner.scoutScore },
        wallet, subscriptions: enriched,
      });
    }
    case "list_creators": {
      // Strip PII (email) — the network panel only needs display fields.
      const creators = (await listCreators()).map((c) => ({ id: c.id, name: c.name, followers: c.followers, tier: c.tier, scoutScore: c.scoutScore, payoutEligible: c.payoutEligible, followersVerified: c.followersVerified }));
      return NextResponse.json({ creators, count: creators.length });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    engine: "MarketWar Creator & Partner Monetisation Engine (Activation Playbook v1.0)",
    tiers: EARNING_TIERS,
    catalogue: await listProgrammes(),
    constants: { MIN_PAYOUT_FOLLOWERS, MAX_PROGRAMMES, bands: COMMISSION_BANDS.map((b) => `${b.label}: ${ratePct(b.creatorRate)} creator + ${ratePct(b.platformRate)} platform = ${ratePct(b.totalRate)} charged to the brand`), cycle: "£20,000 cap-and-recycle, per creator (all programmes combined)" },
    agents: ["Scout (applicant scoring)", "Match (programme matching)", "Brief (campaign brief)", "Attribution (split + cycle + fraud)", "Payout (10K gate + BitriPay release)"],
  });
}
