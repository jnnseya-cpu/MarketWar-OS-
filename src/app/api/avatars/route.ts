import { NextRequest, NextResponse } from "next/server";
import { AVATAR_PROVIDERS, avatarGatewayConfigured, billableMinutes, configuredProvider, gateAvatar, renderAvatar, restrictedUse, wouldCallProvider } from "@/backend/avatar-gateway";
import { recordConsent, listConsents, revokeConsent, consentFor, SYNTHETIC_DISCLOSURE, DEFAULT_TERM_DAYS, type ConsentEvidence, type LikenessKind } from "@/backend/likeness-consent";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey } from "@/backend/guard";
import { meterAction, creditAcus, ACTION_COST_ACU } from "@/backend/wallet";

// Presenter video — a synthetic face and voice reading your script.
//
// GET  ?brandId=…                       → providers, consents on record, the disclosure
// POST { action: "consent" }            → record a consent, scoped and dated
// POST { action: "revoke" }             → withdraw one; the record is kept
// POST { action: "check" }              → would this render be allowed, and why not
// POST { action: "render" }             → render it
//
// THE ORDER OF THE GATES IS THE DESIGN. Category first, because a medical or
// financial synthetic endorsement costs the customer their ad account rather
// than an ACU. Consent second, because a custom avatar is a real person's face.
// The wallet LAST — nothing is charged for a render that was never going to be
// allowed, and a refusal that debits is a refusal the customer will not believe
// was principled.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KINDS: LikenessKind[] = ["face", "voice"];
const EVIDENCE: ConsentEvidence[] = ["signed-release", "recorded-statement", "written-agreement", "self"];

export async function GET(req: NextRequest) {
  const brandId = (new URL(req.url).searchParams.get("brandId") || "").trim();
  if (!brandId) {
    return NextResponse.json({
      providers: AVATAR_PROVIDERS.map(({ id, label, forbids, customAvatars }) => ({ id, label, forbids, customAvatars })),
      configured: avatarGatewayConfigured(),
      disclosure: SYNTHETIC_DISCLOSURE,
      note: "Pass brandId to see the consents on record.",
    });
  }
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const consents = await listConsents(brandId);
  const now = Date.now();
  return NextResponse.json({
    providers: AVATAR_PROVIDERS.map(({ id, label, forbids, customAvatars }) => ({ id, label, forbids, customAvatars })),
    configured: avatarGatewayConfigured(),
    provider: configuredProvider()?.id || null,
    // The envKey is never returned — a provider's readiness is public, its key is not.
    consents: consents.map((c) => ({
      ...c,
      live: !c.revokedAt && new Date(c.expiresAt).getTime() > now,
      daysLeft: Math.max(0, Math.round((new Date(c.expiresAt).getTime() - now) / 86_400_000)),
    })),
    defaultTermDays: DEFAULT_TERM_DAYS,
    disclosure: SYNTHETIC_DISCLOSURE,
    // The price before the click, like every other action on the platform.
    acuPerMinute: ACTION_COST_ACU.avatar,
  });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "avatars"), 30, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const brandId = str("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });

  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const nowISO = new Date().toISOString();
  const action = str("action") || "render";

  if (action === "consent") {
    const kinds = Array.isArray(body.kinds) ? (body.kinds as unknown[]).filter((k): k is LikenessKind => KINDS.includes(k as LikenessKind)) : [];
    const evidence = str("evidence") as ConsentEvidence;
    if (!EVIDENCE.includes(evidence)) return NextResponse.json({ error: `evidence must be one of ${EVIDENCE.join(", ")}`, }, { status: 400 });
    const res = await recordConsent({
      brandId,
      personName: str("personName"),
      personRef: str("personRef") || undefined,
      kinds,
      evidence,
      evidenceNote: str("evidenceNote") || undefined,
      territories: Array.isArray(body.territories) ? (body.territories as unknown[]).filter((t): t is string => typeof t === "string") : [],
      platforms: Array.isArray(body.platforms) ? (body.platforms as unknown[]).filter((p): p is string => typeof p === "string") : [],
      paidAds: body.paidAds === true,
      termDays: typeof body.termDays === "number" ? body.termDays : undefined,
      nowISO,
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ consent: res.consent, disclosure: SYNTHETIC_DISCLOSURE });
  }

  if (action === "revoke") {
    const id = str("consentId");
    if (!id) return NextResponse.json({ error: "consentId required" }, { status: 400 });
    const ok = await revokeConsent(brandId, id, nowISO, str("reason") || undefined);
    if (!ok) return NextResponse.json({ error: "No such consent for this brand." }, { status: 404 });
    return NextResponse.json({
      ok: true,
      note: "Withdrawn, and it takes effect now. The record of the withdrawal is kept — a person who changes their mind must never have to argue about whether they did.",
    });
  }

  if (action === "check") {
    const script = str("script");
    const restricted = restrictedUse(script);
    const person = str("personName");
    const consent = person
      ? await consentFor({ brandId, personName: person, kind: (KINDS.includes(str("kind") as LikenessKind) ? str("kind") : "face") as LikenessKind, territory: str("territory") || undefined, platform: str("platform") || undefined, paidAd: body.paidAd === true, nowISO })
      : null;
    return NextResponse.json({
      restricted: restricted.restricted,
      why: restricted.why,
      consent,
      wouldRender: !restricted.restricted && (str("avatarKind") !== "custom" || Boolean(consent && consent.allowed)),
      disclosure: SYNTHETIC_DISCLOSURE,
      charged: false,
    });
  }

  if (action !== "render") return NextResponse.json({ error: "Unknown action — use consent, revoke, check or render." }, { status: 400 });

  const avatarKind = str("avatarKind") === "custom" ? "custom" : "stock";
  const request = {
    brandId, script: str("script"), avatarKind: avatarKind as "stock" | "custom",
    avatarId: str("avatarId") || undefined,
    personName: str("personName") || undefined,
    voiceId: str("voiceId") || undefined,
    territory: str("territory") || undefined,
    platform: str("platform") || undefined,
    paidAd: body.paidAd === true,
    nowISO,
  };

  // 1. GATES. A refusal must never cost anything, so these run before the wallet.
  const gate = await gateAvatar(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error, hint: gate.hint, charged: false }, { status: 400 });

  // 2. WALLET — but only if a provider will actually be called. With none
  //    configured the answer is a written brief, which costs nobody anything.
  const minutes = billableMinutes(request.script);
  let charged = false;
  if (wouldCallProvider()) {
    // Per minute, because that is how every avatar provider bills. A flat
    // charge would lose money on a long script — quietly, which is the worst
    // way to breach a margin floor.
    const meter = await meterAction(access, "avatar", minutes);
    if (!meter.allowed) return NextResponse.json({ error: meter.error, balanceAcu: meter.balanceAcu, charged: false, minutes }, { status: meter.status });
    charged = meter.metered;
  }

  // 3. RENDER. The gates run again inside — one skipped check is the whole
  //    module lost — but by now they are known to pass.
  const job = await renderAvatar(request);

  // 4. If the provider failed, REFUND. Charging before the call is the only way
  //    to stop a customer with no balance triggering a render the platform pays
  //    for; the price of that order is that a provider failure has already been
  //    billed. So it is put back here, automatically. "Contact support" is not a
  //    refund policy, it is a hope that they will not bother.
  if (!job.ok) {
    let refunded = false;
    if (charged && access.ok && access.uid) {
      try { await creditAcus(access.uid, ACTION_COST_ACU.avatar * minutes); refunded = true; } catch { refunded = false; }
    }
    return NextResponse.json({
      error: job.error, hint: job.hint,
      charged: charged && !refunded,
      refunded,
      note: refunded
        ? `The provider failed, so the ${ACTION_COST_ACU.avatar * minutes} ACUs have been put back. You have not paid for a video you did not get.`
        : undefined,
    }, { status: 502 });
  }
  return NextResponse.json({ ...job, charged, minutes });
}
