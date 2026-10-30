import { NextRequest, NextResponse } from "next/server";
import {
  AVATAR_PROVIDERS, AVATAR_DIMENSIONS, avatarGatewayConfigured, avatarRoster, billableMinutes,
  configuredProvider, gateAvatar, getAvatarRender, getTranslation, ownedRender, renderAvatar,
  planCommercial, renderCommercial,
  restrictedUse, startTranslation, translationLanguages, wouldCallProvider,
  type AvatarAspect,
} from "@/backend/avatar-gateway";
import { textToSpeech, billableUnits, voiceConfigured } from "@/backend/voice";
import { uploadPublicMedia, storageConfigured } from "@/backend/storage";
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
// POST { action: "storyboard" }         → split a script into beats, free
// POST { action: "commercial" }         → render those beats as ONE video
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
  const url = new URL(req.url);
  const brandId = (url.searchParams.get("brandId") || "").trim();

  // THE ROSTER. No brand needed: it is the same list for every tenant on the
  // platform key, and it contains no customer data — only which performers and
  // voices this deployment can use.
  if (url.searchParams.get("roster")) {
    const roster = await avatarRoster(url.searchParams.get("refresh") === "1");
    const langs = await translationLanguages();
    return NextResponse.json({
      avatars: roster.avatars,
      voices: roster.voices,
      note: roster.note,
      aspects: Object.entries(AVATAR_DIMENSIONS).map(([id, d]) => ({ id, ...d })),
      translation: { languages: langs.languages, note: langs.note, acuPerMinutePerLanguage: ACTION_COST_ACU.avatar_translate },
    });
  }
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

  // POLL A RENDER. The half that did not exist: this is what turns a provider
  // job id into the customer's video, hosted by us and filed in their library.
  const jobId = (url.searchParams.get("jobId") || "").trim();
  if (jobId) {
    // OWNERSHIP FIRST. A job id is guessable enough that reading one by id
    // alone would let a tenant poll another tenant's render — and the response
    // carries their script.
    const owned = await ownedRender(jobId, brandId);
    if (!owned) return NextResponse.json({ error: "No such render for this brand." }, { status: 404 });
    const job = await getAvatarRender(jobId);
    return NextResponse.json(job);
  }

  const translationId = (url.searchParams.get("translationId") || "").trim();
  if (translationId) {
    const t = await getTranslation(translationId);
    if ("error" in t) return NextResponse.json(t, { status: 404 });
    if (t.brandId !== brandId) return NextResponse.json({ error: "No such translation for this brand." }, { status: 404 });
    return NextResponse.json(t);
  }

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

  // ----------------------------------------------------------------------
  // TRANSLATE — the same video, lip-synced into other languages
  // ----------------------------------------------------------------------
  if (action === "translate") {
    const sourceId = str("jobId");
    const langs = Array.isArray(body.languages)
      ? [...new Set((body.languages as unknown[]).filter((l): l is string => typeof l === "string" && l.trim().length > 0).map((l) => l.trim()))]
      : [];
    if (!sourceId) return NextResponse.json({ error: "jobId of the finished video is required" }, { status: 400 });
    if (!langs.length) return NextResponse.json({ error: "Pick at least one language." }, { status: 400 });
    if (langs.length > 10) return NextResponse.json({ error: "Ten languages at a time. Each one is a separate render billed per minute, and a slip of the finger should not spend an afternoon's budget." }, { status: 400 });

    const source = await ownedRender(sourceId, brandId);
    if (!source) return NextResponse.json({ error: "No such render for this brand." }, { status: 404 });
    if (source.status !== "ready" || !source.videoUrl) {
      return NextResponse.json({ error: "That video has not finished rendering yet." }, { status: 409 });
    }

    // PRICED PER LANGUAGE, PER MINUTE, AND CHARGED ONE LANGUAGE AT A TIME.
    // Metering the whole batch up front would take money for languages that
    // never start if the provider refuses the second one.
    const perLanguage = ACTION_COST_ACU.avatar_translate * source.minutes;
    const started: unknown[] = [];
    const refused: { lang: string; error: string }[] = [];
    for (const lang of langs) {
      const meter = await meterAction(access, "avatar_translate", source.minutes);
      if (!meter.allowed) { refused.push({ lang, error: meter.error || "Not enough ACUs." }); break; }
      const r = await startTranslation({ source, lang, chargedAcu: meter.metered ? perLanguage : 0, nowISO });
      if (!r.ok) {
        if (meter.metered && access.ok && access.uid) { try { await creditAcus(access.uid, perLanguage); } catch { /* reported below */ } }
        refused.push({ lang, error: r.error });
        continue;
      }
      started.push(r.job);
    }

    return NextResponse.json({
      started,
      refused,
      acuPerLanguage: perLanguage,
      minutes: source.minutes,
      note: `${started.length} translation(s) started at ${perLanguage} ACUs each (${source.minutes} minute(s) × ${ACTION_COST_ACU.avatar_translate} per minute per language). Poll each with ?translationId=. A translation that fails is refunded automatically.`,
      disclosure: SYNTHETIC_DISCLOSURE,
    });
  }

  // ----------------------------------------------------------------------
  // A CONTINUOUS COMMERCIAL, UP TO A MINUTE, FROM FIFTEEN-SECOND BEATS
  //
  // THE OWNER'S BRIEF: *"a very professional and commercial video of up to 1
  // minute no stop if 15 second each with a tool to make them together as 1
  // video."*
  //
  // `plan` is the whole feature's honesty: it splits the script, says how long
  // each scene runs and refuses one that would overrun BEFORE anything is
  // metered. The same function answers the screen's preview, so the beats the
  // customer approved are the beats that get rendered.
  //
  // The order here is the render path's order, for the render path's reasons:
  // gates, then the wallet, then the provider. Nothing touches the wallet until
  // a refusal is impossible.
  // ----------------------------------------------------------------------
  if (action === "commercial" || action === "storyboard") {
    const asked = {
      brandId, script: str("script"),
      avatarKind: (str("avatarKind") === "custom" ? "custom" : "stock") as "stock" | "custom",
      avatarId: str("avatarId") || undefined,
      personName: str("personName") || undefined,
      voiceId: str("voiceId") || undefined,
      aspect: (["9:16", "16:9", "1:1"] as const).includes(str("aspect") as AvatarAspect) ? (str("aspect") as AvatarAspect) : ("9:16" as AvatarAspect),
      territory: str("territory") || undefined,
      platform: str("platform") || undefined,
      paidAd: body.paidAd === true,
      audioUrl: undefined as string | undefined,
      beatSeconds: typeof body.beatSeconds === "number" ? body.beatSeconds : undefined,
      chargedAcu: 0,
      nowISO,
    };
    const clone = str("voiceSource") === "cloned";
    if (clone) asked.audioUrl = "pending";

    const plan = planCommercial({ script: asked.script, beatSeconds: asked.beatSeconds });

    // `storyboard` is the free preview: the split, the seconds and the price,
    // with nothing rendered and nothing charged. A customer who can see the
    // split can fix the script; one who cannot pays for a video that runs four
    // seconds over and gets cut off.
    if (action === "storyboard") {
      if (!plan.ok) return NextResponse.json({ error: plan.error, hint: plan.hint, charged: false }, { status: 400 });
      const sceneProvider = configuredProvider("scenes");
      return NextResponse.json({
        ok: true,
        beats: plan.beats, totalSeconds: plan.totalSeconds, minutes: plan.minutes,
        dividedBy: plan.dividedBy, warnings: plan.warnings,
        acus: sceneProvider ? ACTION_COST_ACU.avatar * plan.minutes : 0,
        continuous: Boolean(sceneProvider),
        provider: sceneProvider?.label || null,
        note: sceneProvider
          ? `${plan.beats.length} scenes, ${plan.totalSeconds}s, rendered by ${sceneProvider.label} as ONE continuous video — ${ACTION_COST_ACU.avatar * plan.minutes} ACUs. Nothing has been charged yet.`
          : "No provider that can render several scenes in one video is configured, so this would come back as a storyboard to film rather than a video. Nothing would be charged.",
        charged: false,
      });
    }

    // 1. GATES, before the wallet. A refusal must never cost anything.
    const cGate = await gateAvatar(asked);
    if (!cGate.ok) return NextResponse.json({ error: cGate.error, hint: cGate.hint, charged: false }, { status: 400 });
    if (!plan.ok) return NextResponse.json({ error: plan.error, hint: plan.hint, charged: false }, { status: 400 });

    // 2. WALLET — per minute, like every presenter render, and only when a
    //    provider that can do scenes will actually be called.
    const willRender = configuredProvider("scenes") !== null;
    let cCharged = false;
    const refund = async (acus: number) => {
      if (acus > 0 && access.ok && access.uid) { try { await creditAcus(access.uid, acus); return true; } catch { return false; } }
      return false;
    };
    if (willRender) {
      const meter = await meterAction(access, "avatar", plan.minutes);
      if (!meter.allowed) return NextResponse.json({ error: meter.error, balanceAcu: meter.balanceAcu, charged: false, minutes: plan.minutes }, { status: meter.status });
      cCharged = meter.metered;
    }
    let taken = cCharged ? ACTION_COST_ACU.avatar * plan.minutes : 0;

    // 2b. ONE VOICE TRACK PER SCENE, when the customer's own voice is used.
    //
    // A single-take render needs one track. A four-scene commercial needs four,
    // because each scene lip-syncs to its own — one long track handed to four
    // scenes would have every scene start at the beginning of it. Each is
    // metered per 1,000 characters, which is how ElevenLabs bills us.
    const tracks: string[] = [];
    if (clone && willRender) {
      if (!voiceConfigured()) {
        await refund(taken);
        return NextResponse.json({ error: "A cloned voice needs ELEVENLABS_API_KEY. Set it in the admin account, or pick one of the provider's own voices.", charged: false, note: taken ? "The presenter minutes were refunded." : undefined }, { status: 400 });
      }
      if (!storageConfigured()) {
        await refund(taken);
        return NextResponse.json({ error: "A cloned voice has to be hosted somewhere the presenter provider can fetch it, and no storage bucket is configured. Set FIREBASE_STORAGE_BUCKET, or pick one of the provider's own voices.", charged: false, note: taken ? "The presenter minutes were refunded." : undefined }, { status: 400 });
      }
      for (const beat of plan.beats) {
        const units = billableUnits(beat.text);
        const sm = await meterAction(access, "voice", units);
        if (!sm.allowed) {
          await refund(taken);
          return NextResponse.json({ error: sm.error, balanceAcu: sm.balanceAcu, charged: false, note: `Everything taken for this commercial has been put back — scene ${beat.index} of ${plan.beats.length} could not be voiced, and a commercial missing one scene is not a commercial.` }, { status: sm.status });
        }
        taken += sm.metered ? ACTION_COST_ACU.voice * units : 0;
        const speech = await textToSpeech({ text: beat.text, voiceId: str("elevenVoiceId") || undefined });
        if (!speech.ok || !speech.audio) {
          await refund(taken);
          return NextResponse.json({ error: speech.error || `The voice for scene ${beat.index} could not be generated.`, charged: false, note: "Everything taken for this commercial has been put back." }, { status: 502 });
        }
        const hostedTrack = await uploadPublicMedia(Buffer.from(speech.audio), {
          contentType: "audio/mpeg", ext: "mp3", keyPrefix: "presenter-voice",
          nameSeed: `${brandId}|${beat.index}|${beat.text}|${str("elevenVoiceId")}`,
        });
        if (!hostedTrack) {
          await refund(taken);
          return NextResponse.json({ error: `The voice for scene ${beat.index} was generated but could not be hosted, so the presenter has nothing to lip-sync to.`, charged: false, note: "Everything taken for this commercial has been put back." }, { status: 503 });
        }
        tracks.push(hostedTrack);
      }
    }
    // Never send the sentinel to a provider — it exists only to make the
    // consent gate fire before the tracks have been generated.
    asked.audioUrl = undefined;

    // 3. RENDER. One request, every scene, one video back.
    asked.chargedAcu = cCharged ? ACTION_COST_ACU.avatar * plan.minutes : 0;
    const made = await renderCommercial({ ...asked, ...(tracks.length ? { beatAudioUrls: tracks } : {}) });

    // 4. A PROVIDER FAILURE REFUNDS ITSELF, including every voice track that
    //    was paid for on the way to a video that does not exist.
    if (!made.ok) {
      const putBack = await refund(taken);
      return NextResponse.json({
        error: made.error, hint: made.hint,
        charged: taken > 0 && !putBack,
        refunded: putBack,
        note: putBack ? `The provider failed, so the ${taken} ACUs have been put back. You have not paid for a video you did not get.` : undefined,
      }, { status: 502 });
    }
    return NextResponse.json({ ...made, charged: cCharged });
  }

  if (action !== "render") return NextResponse.json({ error: "Unknown action — use consent, revoke, check, render, commercial, storyboard or translate." }, { status: 400 });

  const avatarKind = str("avatarKind") === "custom" ? "custom" : "stock";
  const aspect: AvatarAspect = (["9:16", "16:9", "1:1"] as const).includes(str("aspect") as AvatarAspect)
    ? (str("aspect") as AvatarAspect)
    : "9:16";
  // "cloned" means ElevenLabs speaks the script in the customer's own voice and
  // the presenter lip-syncs to that track, instead of the provider's stock TTS.
  const clonedVoice = str("voiceSource") === "cloned";
  const request = {
    brandId, script: str("script"), avatarKind: avatarKind as "stock" | "custom",
    avatarId: str("avatarId") || undefined,
    personName: str("personName") || undefined,
    voiceId: str("voiceId") || undefined,
    aspect,
    territory: str("territory") || undefined,
    platform: str("platform") || undefined,
    paidAd: body.paidAd === true,
    // Set below if a cloned voice is used — declared here so the consent gate
    // sees it. A gate that runs before the field is populated is not a gate.
    audioUrl: undefined as string | undefined,
    // What the wallet took, filled in after metering so a later provider
    // failure can refund exactly that. Declared here, and the render is still
    // called as `renderAvatar(request)` — unchanged — because an existing guard
    // reads this file's SOURCE to prove the order of gates, wallet and render,
    // and a call rewritten into `renderAvatar({ ...request, … })` makes that
    // guard silently stop matching. A test that can no longer see the thing it
    // protects is worse than no test.
    chargedAcu: 0,
    nowISO,
  };
  if (clonedVoice) {
    // Marks the request as carrying a voice BEFORE `gateAvatar` runs, so the
    // voice-consent check fires even though the track has not been made yet.
    request.audioUrl = "pending";
  }

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

  // 2b. THE CLONED VOICE, IF THAT IS WHAT WAS ASKED FOR.
  //
  // ORDER MATTERS AND IT IS NOT THE OBVIOUS ONE. The speech is generated
  // AFTER the avatar minutes are metered and BEFORE the provider is called,
  // because the audio track is an input to the render: make it afterwards and
  // there is nothing to lip-sync to; make it before the gates and a refused
  // script has already cost the customer an ElevenLabs charge.
  //
  // It is metered SEPARATELY, per 1,000 characters, because that is how
  // ElevenLabs bills us. Rolling it into the per-minute avatar price would
  // breach the margin floor on a long script — quietly, which is the worst way.
  // ONLY WHEN A PROVIDER WILL ACTUALLY RENDER. With none configured this route
  // returns a written brief and charges nothing — so generating the speech here
  // would bill the customer for an audio track with nothing to lip-sync it,
  // which is the one outcome worse than no feature.
  if (clonedVoice && wouldCallProvider()) {
    if (!voiceConfigured()) {
      return NextResponse.json({ error: "A cloned voice needs ELEVENLABS_API_KEY. Set it in the admin account, or pick one of the provider's own voices.", charged }, { status: 400 });
    }
    if (!storageConfigured()) {
      return NextResponse.json({ error: "A cloned voice has to be hosted somewhere the presenter provider can fetch it, and no storage bucket is configured. Set FIREBASE_STORAGE_BUCKET, or pick one of the provider's own voices.", charged }, { status: 400 });
    }
    const units = billableUnits(request.script);
    const speechMeter = await meterAction(access, "voice", units);
    if (!speechMeter.allowed) {
      // The avatar minutes were already taken. Put them back rather than
      // leaving the customer charged for a render that is not going to happen.
      if (charged && access.ok && access.uid) { try { await creditAcus(access.uid, ACTION_COST_ACU.avatar * minutes); } catch { /* noted below */ } }
      return NextResponse.json({ error: speechMeter.error, balanceAcu: speechMeter.balanceAcu, charged: false, note: "The presenter minutes were refunded — nothing was rendered." }, { status: speechMeter.status });
    }
    const speech = await textToSpeech({ text: request.script, voiceId: str("elevenVoiceId") || undefined });
    if (!speech.ok || !speech.audio) {
      if (charged && access.ok && access.uid) { try { await creditAcus(access.uid, ACTION_COST_ACU.avatar * minutes); } catch { /* noted below */ } }
      if (speechMeter.metered && access.ok && access.uid) { try { await creditAcus(access.uid, ACTION_COST_ACU.voice * units); } catch { /* noted below */ } }
      return NextResponse.json({ error: speech.error || "The voice could not be generated.", charged: false, note: "Everything taken for this render has been put back." }, { status: 502 });
    }
    const hosted = await uploadPublicMedia(Buffer.from(speech.audio), {
      contentType: "audio/mpeg", ext: "mp3", keyPrefix: "presenter-voice",
      nameSeed: `${brandId}|${request.script}|${str("elevenVoiceId")}`,
    });
    if (!hosted) {
      if (charged && access.ok && access.uid) { try { await creditAcus(access.uid, ACTION_COST_ACU.avatar * minutes); } catch { /* noted below */ } }
      if (speechMeter.metered && access.ok && access.uid) { try { await creditAcus(access.uid, ACTION_COST_ACU.voice * units); } catch { /* noted below */ } }
      return NextResponse.json({ error: "The voice was generated but could not be hosted, so the presenter has nothing to lip-sync to.", charged: false, note: "Everything taken for this render has been put back." }, { status: 503 });
    }
    request.audioUrl = hosted;
  } else {
    // Never send the sentinel to a provider. It exists only to make the consent
    // gate fire before the track has been generated.
    request.audioUrl = undefined;
  }

  // 3. RENDER. The gates run again inside — one skipped check is the whole
  //    module lost — but by now they are known to pass.
  request.chargedAcu = charged ? ACTION_COST_ACU.avatar * minutes : 0;
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
