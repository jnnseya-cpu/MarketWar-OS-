// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Presenter video — a synthetic face and voice reading a script.
//
// One door to every avatar provider, exactly like the text and image gateways:
// feature code never calls a vendor, so a provider can be swapped, priced or
// dropped without touching a screen.
//
// THE PART THAT IS NOT LIKE THE OTHER GATEWAYS. An image gateway that renders
// the wrong thing wastes an ACU. An avatar gateway that renders the wrong thing
// puts a PERSON'S FACE on a claim they never made. So this one refuses before
// it renders:
//
//   • A STOCK avatar is a licensed performer. The licence is the provider's,
//     and it does not cover every use — several forbid political, medical and
//     financial-advice content outright, and none of them let you imply the
//     performer personally endorses the product.
//   • A CUSTOM avatar is a real person the customer knows, and needs a consent
//     record — `likeness-consent.ts` — scoped to territory, platform, paid use
//     and an end date. No record, no render. Not a warning: a refusal.
//   • Either way the output is SYNTHETIC MEDIA and must say so. The EU AI Act
//     requires the disclosure, the ASA treats an undisclosed synthetic
//     endorsement as misleading, and a viewer who discovers it afterwards
//     treats it as a lie about everything else in the ad.
//
// Providers are reached over REST behind env keys, and with none set the module
// returns a real, useful BRIEF rather than a fake video — the same honesty rule
// the image gateway keeps.

import { consentFor, SYNTHETIC_DISCLOSURE } from "@/backend/likeness-consent";
import { adminDb } from "@/backend/firebase-admin";
import { uploadPublicMedia, storageConfigured } from "@/backend/storage";
import { saveWork } from "@/backend/work-library";
import { creditAcus, ACTION_COST_ACU } from "@/backend/wallet";
import { walletIdForBrand } from "@/backend/brand-access";
import { createHash } from "crypto";
import {
  WORDS_PER_MINUTE as SPEAKING_WPM, BEAT_SECONDS, MAX_COMMERCIAL_SECONDS,
  storyboard, storyboardFailed, type Beat,
} from "@/shared/storyboard";

export type AvatarProviderId = "heygen" | "did" | "synthesia" | "none";

export type AvatarProvider = {
  id: AvatarProviderId;
  label: string;
  envKey: string;
  /** Uses the provider itself forbids, from their published policies. */
  forbids: string[];
  customAvatars: boolean;
  /**
   * WHAT THIS ONE CHARGES US PER MINUTE, and the reason the pool has a price
   * column at all.
   *
   * The owner's question: HeyGen looks far cheaper than our price. Half of that
   * is structural — HeyGen BUILDS its avatar models and we resell them, so a
   * reseller cannot undercut the manufacturer — but the other half is a lever
   * we were not pulling: these three do not cost the same, and the pool was
   * picking whichever key happened to be set first.
   *
   * ESTIMATES, EVERY ONE, from published rates and deliberately on the high
   * side, exactly like `PROVIDER_COST_GBP`. Correct them in the Admin Control
   * Centre against a real invoice and the price re-derives — do not edit them
   * here and deploy.
   */
  costPerMinuteGbp: number;
  /** Does it publish a roster this platform can list? */
  roster: boolean;
  /** Can it re-render the mouth for another language? */
  translation: boolean;
  /**
   * CAN ONE REQUEST CARRY SEVERAL SCENES AND COME BACK AS ONE VIDEO?
   *
   * This is what makes a continuous commercial possible without stitching
   * anything. HeyGen's `video_inputs` and Synthesia's `input` are both ARRAYS
   * of scenes rendered into a single file, with the same character and voice
   * carried across them. D-ID's `/talks` is one script per talk, so a
   * commercial on D-ID would mean four files and three visible joins — which
   * is the "stop" the brief rules out, so it is declared false rather than
   * faked by concatenation.
   */
  scenes: boolean;
};

export const AVATAR_PROVIDERS: AvatarProvider[] = [
  {
    id: "heygen", label: "HeyGen", envKey: "HEYGEN_API_KEY", customAvatars: true,
    costPerMinuteGbp: 0.45, roster: true, translation: true, scenes: true,
    forbids: ["impersonating a real person without consent", "political campaigning", "content implying a medical or financial recommendation"],
  },
  {
    id: "did", label: "D-ID", envKey: "DID_API_KEY", customAvatars: true,
    costPerMinuteGbp: 0.18, roster: false, translation: false, scenes: false,
    forbids: ["animating a photo of someone who has not consented", "deceptive or defamatory depiction"],
  },
  {
    id: "synthesia", label: "Synthesia", envKey: "SYNTHESIA_API_KEY", customAvatars: true,
    costPerMinuteGbp: 0.60, roster: false, translation: false, scenes: true,
    forbids: ["news-style content", "political content", "claims requiring regulatory approval"],
  },
];

/**
 * Which provider renders this, and it is the CHEAPEST configured one.
 *
 * IT USED TO BE WHICHEVER KEY WAS SET FIRST — `AVATAR_PROVIDERS.find(...)` —
 * which meant the array's declaration order decided what every tenant paid.
 * With HeyGen listed first, configuring a cheaper provider alongside it changed
 * nothing at all: the pool existed for failover and did no work on price.
 *
 * Now the pool routes on cost, which is the owner's pricing law applied to our
 * own supply: *win on a lower cost base, never by breaching the floor*. The
 * customer price follows the same number, so a cheaper supplier is a cheaper
 * price rather than a quietly fatter margin.
 *
 * A `need` narrows the field first, because two of the three cannot do
 * everything: only HeyGen publishes a roster and only HeyGen re-renders a
 * mouth. Asking for the cheapest provider that cannot do the job is how a pool
 * silently downgrades a feature.
 */
export type AvatarNeed = "roster" | "translation" | "scenes";

export function configuredProvider(need?: AvatarNeed): AvatarProvider | null {
  const able = AVATAR_PROVIDERS
    .filter((p) => Boolean(process.env[p.envKey]))
    // ROUTING ON COST MUST NEVER SILENTLY REMOVE A CAPABILITY. The cheapest
    // provider is chosen from those that can do the JOB asked for, not from all
    // of them — a commercial sent to a provider that renders one scene per
    // request would come back as one fifteen-second clip.
    .filter((p) => (need === "roster" ? p.roster : need === "translation" ? p.translation : need === "scenes" ? p.scenes : true));
  if (!able.length) return null;
  return able.reduce((cheapest, p) => (p.costPerMinuteGbp < cheapest.costPerMinuteGbp ? p : cheapest));
}

/**
 * What a presenter minute costs us on the provider that would actually run it,
 * so the price the customer is quoted comes from the same choice the router
 * makes. Falls back to the catalogue estimate when nothing is configured.
 */
export function activeAvatarCostGbp(): number | null {
  const p = configuredProvider();
  return p ? p.costPerMinuteGbp : null;
}

/** Every configured provider with what it costs and what it can do. */
export function poolStatus(): {
  id: AvatarProviderId; label: string; configured: boolean; costPerMinuteGbp: number;
  roster: boolean; translation: boolean; chosen: boolean;
}[] {
  const chosen = configuredProvider();
  return AVATAR_PROVIDERS.map((p) => ({
    id: p.id, label: p.label,
    configured: Boolean(process.env[p.envKey]),
    costPerMinuteGbp: p.costPerMinuteGbp,
    roster: p.roster, translation: p.translation,
    chosen: chosen?.id === p.id,
  }));
}

export function avatarGatewayConfigured(): boolean { return configuredProvider() !== null; }

// ---------------------------------------------------------------------------
// Categories a synthetic presenter must not be pointed at
//
// Not squeamishness — these are the categories where a synthetic endorsement is
// both a provider policy breach AND a regulated-advertising problem, so a render
// here would be refused twice over and the second refusal costs the customer
// their account rather than an ACU.
// ---------------------------------------------------------------------------
const RESTRICTED = [
  { re: /\b(cure|treat|diagnos|prescri|clinically proven|medical|prescription)\b/i, why: "medical claims" },
  { re: /\b(invest|returns?|profit guaranteed|crypto|trading signals?|financial advice)\b/i, why: "financial advice or investment returns" },
  { re: /\b(vote|election|candidate|referendum|political party)\b/i, why: "political content" },
  { re: /\b(breaking news|reports? confirm|sources say)\b/i, why: "news-style presentation" },
];

export function restrictedUse(script: string): { restricted: boolean; why: string[] } {
  const why = RESTRICTED.filter((r) => r.re.test(script || "")).map((r) => r.why);
  return { restricted: why.length > 0, why };
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
/**
 * THE SHAPE OF THE FRAME, which used to be a hardcoded 1080x1920.
 *
 * Portrait-only is right for a Reel and wrong for everything else: a YouTube
 * pre-roll, a landing-page explainer and a LinkedIn post are 16:9, and a feed
 * ad is square. Rendering one shape and letting the customer crop it is how a
 * presenter ends up with their chin cut off, because the provider framed the
 * head for the frame it was given.
 */
export type AvatarAspect = "9:16" | "16:9" | "1:1";

export const AVATAR_DIMENSIONS: Record<AvatarAspect, { width: number; height: number; use: string }> = {
  "9:16": { width: 1080, height: 1920, use: "Reels, TikTok, Shorts, Stories" },
  "16:9": { width: 1920, height: 1080, use: "YouTube, a landing page, an email" },
  "1:1": { width: 1080, height: 1080, use: "Feed posts and square ads" },
};

export type AvatarRequest = {
  brandId: string;
  script: string;
  /** A provider's licensed performer, or a real person the customer knows. */
  avatarKind: "stock" | "custom";
  avatarId?: string;        // provider's stock avatar id
  personName?: string;      // required for custom — whose face this is
  voiceId?: string;
  aspect?: AvatarAspect;
  /**
   * A hosted MP3 for the presenter to lip-sync to, instead of the provider's
   * own text-to-speech. This is how a CLONED voice reaches the avatar: the
   * speech is generated by ElevenLabs, hosted by us, and handed over as audio.
   * The provider never sees the voice model, only the finished track.
   */
  audioUrl?: string;
  territory?: string;
  platform?: string;
  paidAd?: boolean;
  /**
   * What the route already took for this render, so a later failure can put
   * exactly that back. Carried across the boundary rather than recomputed:
   * recomputing a refund is how a price change silently refunds the wrong
   * amount months later.
   */
  chargedAcu?: number;
  nowISO: string;
};

export type AvatarJob =
  | {
      ok: true;
      mode: "live" | "brief";
      provider: AvatarProviderId;
      /** The PROVIDER's id. Kept for readers written before jobId existed. */
      jobRef: string | null;
      /** OUR id — the thing to poll. A provider id is not a job (see below). */
      jobId?: string;
      status?: AvatarRenderStatus;
      videoUrl?: string | null;
      disclosure: string;
      note: string;
      /** What to render, when no provider is configured — a real deliverable. */
      brief?: string;
    }
  | { ok: false; error: string; hint?: string };

/**
 * Every refusal, and NOT the render.
 *
 * Split out deliberately. A caller has to charge for a render, and charging
 * before the gates means a refused request debits an ACU, while charging after
 * the provider has started means the PLATFORM pays for a render the customer
 * could not afford. Neither is acceptable, so the order has to be: gates here,
 * then the wallet, then `renderAvatar`. This is exported so a route can do that
 * without duplicating a single rule.
 */
export async function gateAvatar(req: AvatarRequest): Promise<{ ok: true } | { ok: false; error: string; hint?: string }> {
  const script = (req.script || "").trim();
  if (!script) return { ok: false, error: "There is no script. A presenter with nothing to say renders a person staring." };
  if (script.length > 4000) return { ok: false, error: "That script is longer than any short-form ad should be — trim it to the one point the video is making." };

  // 1. The category gate, before anything else. This one costs an account, not
  //    an ACU, so it is checked before consent and before the provider.
  const restricted = restrictedUse(script);
  if (restricted.restricted) {
    return {
      ok: false,
      error: `A synthetic presenter cannot be used for ${restricted.why.join(", ")}.`,
      hint: "Every avatar provider forbids these outright, and the advertising regulators treat a synthetic endorsement in these categories as misleading. Film a real person, or make the claim without a presenter.",
    };
  }

  // 2. A custom avatar is somebody's face. No consent record, no render.
  if (req.avatarKind === "custom") {
    const person = (req.personName || "").trim();
    if (!person) return { ok: false, error: "Name whose likeness this is. A custom avatar without a named person cannot be checked against a consent." };
    const face = await consentFor({ brandId: req.brandId, personName: person, kind: "face", territory: req.territory, platform: req.platform, paidAd: req.paidAd, nowISO: req.nowISO });
    if (!face.allowed) return { ok: false, error: face.reason, hint: "Record the consent — with evidence, territories, platforms and an end date — and this will run." };
    // A voice is a separate permission. Consent to a face is not consent to be
    // heard saying something.
    //
    // `audioUrl` IS IN THIS CONDITION AND THAT IS THE WHOLE POINT. A cloned
    // voice arrives as a finished audio track rather than a provider voice id,
    // so a check written only against `voiceId` would wave through the one case
    // where the consent matters most: a real person's cloned voice, saying
    // words they never said, on their own face.
    if (req.voiceId || req.audioUrl) {
      const voice = await consentFor({ brandId: req.brandId, personName: person, kind: "voice", territory: req.territory, platform: req.platform, paidAd: req.paidAd, nowISO: req.nowISO });
      if (!voice.allowed) return { ok: false, error: voice.reason, hint: "A face consent does not cover a voice. Record the voice consent separately, or use a stock voice." };
    }
  }
  return { ok: true };
}

/** Will this cost anything? A brief calls nobody, so it is free — and the caller needs to know BEFORE it meters. */
export function wouldCallProvider(): boolean { return configuredProvider() !== null; }

/**
 * How long this script will run, in minutes, rounded up.
 *
 * Every avatar provider bills by DURATION, so the charge has to as well. A flat
 * per-render price overcharges a fifteen-second clip and loses money on a
 * two-minute one, and the second of those breaches the margin floor without
 * anybody noticing. 150 words per minute is a natural presenter pace — the same
 * rate the brief uses to state its own length, so the number the customer is
 * quoted and the number they are charged come from one place.
 *
 * THAT ONE PLACE IS NOW `shared/storyboard.ts`, re-exported here. The
 * storyboard splits a commercial into fifteen-second beats and the SCREEN shows
 * the customer those seconds before anything is charged — so a second copy of
 * the pace in the frontend would be free to drift from the one that bills.
 */
export { WORDS_PER_MINUTE } from "@/shared/storyboard";
export function billableMinutes(script: string): number {
  const words = (script || "").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / SPEAKING_WPM));
}

export async function renderAvatar(req: AvatarRequest): Promise<AvatarJob> {
  // The gates run here too. A second entry point that skipped them would be the
  // whole point of the module lost to a convenience.
  const gate = await gateAvatar(req);
  if (!gate.ok) return gate;
  const script = (req.script || "").trim();

  const provider = configuredProvider();

  // 3. No provider configured — return the BRIEF rather than a fake video.
  if (!provider) {
    return {
      ok: true,
      mode: "brief",
      provider: "none",
      jobRef: null,
      disclosure: SYNTHETIC_DISCLOSURE,
      brief: [
        `PRESENTER SCRIPT (${Math.ceil(script.split(/\s+/).length / 2.5)}s at a natural pace):`,
        "",
        script,
        "",
        "Framing: chest-up, eyeline to lens, neutral background in a brand colour.",
        "Captions: burned in — most of this will be watched on mute.",
        `Disclosure: ${SYNTHETIC_DISCLOSURE}`,
      ].join("\n"),
      note: "No avatar provider is configured, so nothing was rendered and nothing was charged. The script and shot brief above are real and usable — film them, or set HEYGEN_API_KEY / DID_API_KEY / SYNTHESIA_API_KEY to render.",
    };
  }

  // 4. Live. The adapter is deliberately thin — one door, and the provider's own
  //    id scheme stays the provider's business.
  const started = await startWith(provider, req, [{ text: script, ...(req.audioUrl ? { audioUrl: req.audioUrl } : {}) }]);
  if (!started.ok) return { ok: false, error: started.error };

  // THE RENDER IS WRITTEN DOWN BEFORE THE CALLER IS TOLD ABOUT IT.
  //
  // Without this record there is nothing to poll, nothing to refund and
  // nothing to file — which is exactly the state this path was in: it handed
  // back the provider's id and forgot the job existed. The id alone is not a
  // job; the customer's brand, their charge and what they asked for all have
  // to survive the response, or the money and the video have no owner.
  const jobId = `av_${hid(`${req.brandId}|${started.ref}|${req.nowISO}`)}`;
  const job: AvatarRender = {
    jobId,
    brandId: req.brandId,
    provider: provider.id,
    providerRef: started.ref,
    status: "rendering",
    videoUrl: null,
    script,
    avatarKind: req.avatarKind,
    ...(req.personName ? { personName: req.personName } : {}),
    aspect: req.aspect || "9:16",
    minutes: billableMinutes(script),
    chargedAcu: req.chargedAcu ?? 0,
    startedAt: req.nowISO,
    disclosure: SYNTHETIC_DISCLOSURE,
    note: `Rendering with ${provider.label}.`,
  };
  await saveRender(job);

  return {
    ok: true,
    mode: "live",
    provider: provider.id,
    jobRef: started.ref,
    jobId,
    status: "rendering",
    videoUrl: null,
    disclosure: SYNTHETIC_DISCLOSURE,
    note: `Rendering with ${provider.label}. ${req.avatarKind === "custom" ? "Consent on record and in date." : "Stock performer — you may not imply they personally endorse the product."} ${SYNTHETIC_DISCLOSURE}`,
  };
}

// ---------------------------------------------------------------------------
// A CONTINUOUS COMMERCIAL, UP TO A MINUTE, OUT OF FIFTEEN-SECOND BEATS
// ---------------------------------------------------------------------------
//
// THE OWNER'S BRIEF: *"a very professional and commercial video of up to 1
// minute no stop if 15 second each with a tool to make them together as 1
// video."*
//
// There is no stitching here, and the reason is in `shared/storyboard.ts`: the
// provider's scene array already renders several beats as ONE continuous file,
// so the "tool to make them together" is one request rather than a joiner.
// That removes ffmpeg, three extra jobs, three extra failure modes, three
// refunds — and, most of all, the visible joins where separate renders drift
// apart in head position, lighting and audio level.
//
// Everything after the render is the single-take path untouched: one
// `avatar_renders` job, polled by `getAvatarRender`, hosted on our own storage,
// filed in the work library, refunded if it fails. The commercial is a
// DIFFERENT SCRIPT SPLIT, not a different pipeline.

export type CommercialRequest = AvatarRequest & {
  /**
   * One hosted track per beat, in order, when a cloned voice is used.
   *
   * A single-take render takes one `audioUrl`; a four-beat commercial needs
   * four tracks, because each scene lip-syncs to its own. An entry may be null
   * for a beat that should use the provider's own voice — mixing the two in one
   * video would be audible, so the route sends all or none.
   */
  beatAudioUrls?: (string | null)[];
  /** Override the beat length. Defaults to the brief's fifteen seconds. */
  beatSeconds?: number;
};

export type CommercialJob =
  | (Extract<AvatarJob, { ok: true }> & {
      beats: { index: number; text: string; seconds: number }[];
      totalSeconds: number;
      minutes: number;
      dividedBy: "author" | "pace";
      warnings: string[];
    })
  | { ok: false; error: string; hint?: string };

/**
 * Plan the commercial WITHOUT rendering or charging anything.
 *
 * Exported because the screen has to show the split before the money moves,
 * and the route has to know the duration before it meters. One function
 * answering both means the beats the customer approved are the beats that get
 * rendered — rather than a preview computed one way and a render another, which
 * is the defect this codebase keeps producing.
 */
export function planCommercial(req: { script: string; beatSeconds?: number }): {
  ok: true; beats: Beat[]; totalSeconds: number; minutes: number; dividedBy: "author" | "pace"; warnings: string[];
} | { ok: false; error: string; hint?: string } {
  const plan = storyboard(req.script, { beatSeconds: req.beatSeconds || BEAT_SECONDS, maxSeconds: MAX_COMMERCIAL_SECONDS });
  if (storyboardFailed(plan)) return { ok: false, error: plan.error, ...(plan.hint ? { hint: plan.hint } : {}) };
  return {
    ok: true,
    beats: plan.beats,
    totalSeconds: plan.totalSeconds,
    // CHARGED BY DURATION, like every other render, from the same arithmetic.
    // A commercial is not a new price line — it is presenter minutes, and a
    // sixty-second one is a single minute of them.
    minutes: Math.max(1, Math.ceil(plan.totalSeconds / 60)),
    dividedBy: plan.dividedBy,
    warnings: plan.warnings,
  };
}

export async function renderCommercial(req: CommercialRequest): Promise<CommercialJob> {
  // The same gates as a single take, in the same order, from the same function.
  // A second entry point that skipped them would be the whole point of the
  // module lost to a convenience.
  const gate = await gateAvatar(req);
  if (!gate.ok) return gate;

  const plan = planCommercial(req);
  if (!plan.ok) return plan;

  const beats = plan.beats;
  const provider = configuredProvider("scenes");

  // No provider that can render scenes — hand over the STORYBOARD rather than a
  // fake video. It is a real deliverable: a shot list somebody can film.
  if (!provider) {
    const anyProvider = configuredProvider();
    return {
      ok: true,
      mode: "brief",
      provider: "none",
      jobRef: null,
      disclosure: SYNTHETIC_DISCLOSURE,
      beats: beats.map((b) => ({ index: b.index, text: b.text, seconds: b.seconds })),
      totalSeconds: plan.totalSeconds,
      minutes: plan.minutes,
      dividedBy: plan.dividedBy,
      warnings: plan.warnings,
      brief: [
        `COMMERCIAL STORYBOARD — ${beats.length} scenes, ${plan.totalSeconds}s total`,
        "",
        ...beats.flatMap((b) => [`SCENE ${b.index} (${b.seconds}s)`, b.text, ""]),
        "Continuity: the same presenter, voice and framing in every scene — a change of any of",
        "the three reads as a different video spliced in.",
        "Captions: burned in — most of this will be watched on mute.",
        `Disclosure: ${SYNTHETIC_DISCLOSURE}`,
      ].join("\n"),
      note: anyProvider
        ? `${anyProvider.label} is configured but renders one scene per request, so it cannot make this continuous. Nothing was rendered and nothing was charged. Set HEYGEN_API_KEY or SYNTHESIA_API_KEY to render it as one video — or film the storyboard above, which is real and usable.`
        : "No avatar provider is configured, so nothing was rendered and nothing was charged. The storyboard above is real and usable — film it, or set HEYGEN_API_KEY or SYNTHESIA_API_KEY to render it.",
    };
  }

  // ONE REQUEST, EVERY SCENE. A cloned voice supplies a track per beat; a
  // provider voice reads each beat's text. Mixing the two inside one video
  // would be audible, so a partial set of tracks is refused rather than
  // half-used.
  const tracks = req.beatAudioUrls || [];
  const usable = tracks.filter((t): t is string => typeof t === "string" && t.length > 0);
  if (usable.length && usable.length !== beats.length) {
    return {
      ok: false,
      error: `There are ${usable.length} voice tracks for ${beats.length} scenes.`,
      hint: "Every scene needs its own track, or none of them do — a commercial that switches between a cloned voice and a stock one halfway through is audibly two videos.",
    };
  }
  const scenes: Scene[] = beats.map((b, i) => ({
    text: b.text,
    ...(usable.length ? { audioUrl: usable[i] } : {}),
  }));

  const started = await startWith(provider, req, scenes);
  if (!started.ok) return { ok: false, error: started.error };

  const jobId = `av_${hid(`${req.brandId}|${started.ref}|${req.nowISO}`)}`;
  const job: AvatarRender = {
    jobId,
    brandId: req.brandId,
    provider: provider.id,
    providerRef: started.ref,
    status: "rendering",
    videoUrl: null,
    script: beats.map((b) => b.text).join("\n\n"),
    avatarKind: req.avatarKind,
    ...(req.personName ? { personName: req.personName } : {}),
    aspect: req.aspect || "9:16",
    minutes: plan.minutes,
    chargedAcu: req.chargedAcu ?? 0,
    startedAt: req.nowISO,
    disclosure: SYNTHETIC_DISCLOSURE,
    beats: beats.map((b) => ({ index: b.index, text: b.text, seconds: b.seconds })),
    totalSeconds: plan.totalSeconds,
    note: `Rendering a ${plan.totalSeconds}s commercial in ${beats.length} scenes with ${provider.label}.`,
  };
  await saveRender(job);

  return {
    ok: true,
    mode: "live",
    provider: provider.id,
    jobRef: started.ref,
    jobId,
    status: "rendering",
    videoUrl: null,
    disclosure: SYNTHETIC_DISCLOSURE,
    beats: job.beats || [],
    totalSeconds: plan.totalSeconds,
    minutes: plan.minutes,
    dividedBy: plan.dividedBy,
    warnings: plan.warnings,
    note: `Rendering one continuous ${plan.totalSeconds}s video from ${beats.length} scenes with ${provider.label} — no joins, because the provider renders them as a single piece. ${req.avatarKind === "custom" ? "Consent on record and in date." : "Stock performer — you may not imply they personally endorse the product."} ${SYNTHETIC_DISCLOSURE}`,
  };
}

// ---------------------------------------------------------------------------
// THE HALF THAT WAS MISSING: COLLECTING THE VIDEO
// ---------------------------------------------------------------------------
//
// WHAT WAS WRONG, AND IT WAS CHARGED FOR. `renderAvatar` started a render at
// HeyGen and returned the provider's job id. Nothing anywhere polled it,
// downloaded it or stored it — a grep for callers found one route and no
// collector — and the panel printed the id as monospace text: `Provider job:
// 4f21…`. So the customer paid us per minute, and then had to log into
// HeyGen's own dashboard to fetch the thing they had paid for.
//
// The generative side of this platform has had the whole chain since it
// shipped: `getVideoRender` polls, checks the bytes are a real MP4, uploads to
// Storage and files the result in the work library. The dubbing path has
// `dubStatus` and `dubResult`. The presenter path had the start and nothing
// else, which is the one shape this codebase calls a reported success that
// never happened.
//
// THREE REASONS THE FILE IS COPIED TO OUR OWN STORAGE rather than handing over
// the provider's URL:
//   1. THEY EXPIRE. HeyGen's result links are temporary — a customer who comes
//      back next week finds a dead link to a video they paid for.
//   2. The work library is where every other deliverable lives, and a library
//      that silently omits presenter videos is a library nobody trusts.
//   3. A provider URL leaks which vendor made it, which the pool design exists
//      to keep swappable.

export type AvatarRenderStatus = "rendering" | "ready" | "failed";

export type AvatarRender = {
  jobId: string;
  brandId: string;
  provider: AvatarProviderId;
  providerRef: string;
  status: AvatarRenderStatus;
  /** Hosted by US, once it is ready. Never the provider's expiring link. */
  videoUrl: string | null;
  script: string;
  avatarKind: "stock" | "custom";
  personName?: string;
  aspect: AvatarAspect;
  minutes: number;
  chargedAcu: number;
  startedAt: string;
  note: string;
  disclosure: string;
  /**
   * THE SCENES THIS VIDEO WAS BUILT FROM, when it is a commercial.
   *
   * Kept with the render rather than recomputed from the script, for the same
   * reason `chargedAcu` is: a storyboard re-derived months later would use
   * whatever the splitting rules are by then, and the answer to "what did we
   * actually render" would quietly change. Absent on a single-take video.
   */
  beats?: { index: number; text: string; seconds: number }[];
  totalSeconds?: number;
};

const memRenders = new Map<string, AvatarRender>();
const RENDERS = "avatar_renders";

const hid = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 20);

async function saveRender(job: AvatarRender): Promise<void> {
  memRenders.set(job.jobId, job);
  if (adminDb) { try { await adminDb.collection(RENDERS).doc(job.jobId).set(job); } catch { /* memory still has it */ } }
}

async function loadRender(jobId: string): Promise<AvatarRender | null> {
  if (memRenders.has(jobId)) return memRenders.get(jobId)!;
  if (adminDb) {
    try {
      const d = await adminDb.collection(RENDERS).doc(jobId).get();
      if (d.exists) return renderFromStored(d.data());
    } catch { /* fall through */ }
  }
  return null;
}

/** Read a stored render by CHECKING it, never by asserting its shape. */
function renderFromStored(data: unknown): AvatarRender | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Partial<AvatarRender>;
  if (typeof d.jobId !== "string" || !d.jobId) return null;
  if (typeof d.brandId !== "string" || !d.brandId) return null;
  if (typeof d.providerRef !== "string") return null;
  const status: AvatarRenderStatus =
    d.status === "ready" || d.status === "failed" ? d.status : "rendering";
  return {
    ...d,
    jobId: d.jobId,
    brandId: d.brandId,
    provider: (d.provider || "none") as AvatarProviderId,
    providerRef: d.providerRef,
    status,
    videoUrl: typeof d.videoUrl === "string" ? d.videoUrl : null,
    script: typeof d.script === "string" ? d.script : "",
    avatarKind: d.avatarKind === "custom" ? "custom" : "stock",
    aspect: (d.aspect || "9:16") as AvatarAspect,
    minutes: typeof d.minutes === "number" ? d.minutes : 1,
    chargedAcu: typeof d.chargedAcu === "number" ? d.chargedAcu : 0,
    startedAt: typeof d.startedAt === "string" ? d.startedAt : "",
    note: typeof d.note === "string" ? d.note : "",
    disclosure: typeof d.disclosure === "string" ? d.disclosure : SYNTHETIC_DISCLOSURE,
  };
}

/** The sentence appended to every refunded failure, so the wallet is never a mystery. */
const REFUNDED = "The ACUs are back in your wallet.";

/**
 * Fail a render AND put the money back.
 *
 * The route charges before calling the provider — it has to, or a customer
 * with no balance could trigger a render the platform pays for. The price of
 * that order is that a failure which happens LATER, during rendering, has
 * already been billed. So it is refunded here, automatically, exactly as the
 * generative path does. "Contact support" is not a refund policy.
 */
async function failRefunded(job: AvatarRender, note: string): Promise<AvatarRender> {
  if (job.chargedAcu > 0) {
    try {
      const walletId = await walletIdForBrand(job.brandId);
      await creditAcus(walletId, job.chargedAcu);
      job.chargedAcu = 0;
    } catch { /* the note still tells the truth below */ }
  }
  job.status = "failed";
  job.note = note;
  await saveRender(job);
  return job;
}

type ProviderStatus =
  | { state: "rendering" }
  | { state: "ready"; url: string }
  | { state: "failed"; reason: string };

/**
 * Ask the provider whether it is done.
 *
 * NOT VERIFIED AGAINST A LIVE ACCOUNT. No provider key exists in the container
 * this was written in, so these response shapes come from the providers'
 * published API documentation and nothing here has been run against the real
 * service. That is why every reader is defensive and why an unrecognised shape
 * produces a NAMED diagnostic rather than a silent "still rendering" — a poll
 * that quietly never completes is indistinguishable from a slow render, and
 * would strand a paid job forever.
 */
async function providerStatus(p: AvatarProvider, ref: string): Promise<ProviderStatus> {
  const key = process.env[p.envKey] as string;
  try {
    if (p.id === "heygen") {
      const res = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(ref)}`, {
        headers: { "X-Api-Key": key },
      });
      if (!res.ok) return { state: "failed", reason: `HeyGen status ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}` };
      const d = (await res.json().catch(() => null)) as { data?: { status?: string; video_url?: string; error?: unknown } } | null;
      const st = d?.data?.status;
      if (st === "completed") {
        const url = d?.data?.video_url;
        return url ? { state: "ready", url } : { state: "failed", reason: "HeyGen reported the render complete but returned no video URL." };
      }
      if (st === "failed") {
        const e = d?.data?.error;
        return { state: "failed", reason: `HeyGen could not render it: ${typeof e === "string" ? e : JSON.stringify(e ?? {}).slice(0, 160)}` };
      }
      if (st === "processing" || st === "pending" || st === "waiting") return { state: "rendering" };
      return { state: "failed", reason: `HeyGen returned a status this platform does not recognise (${String(st)}). Treated as a failure rather than polled forever.` };
    }

    if (p.id === "did") {
      const res = await fetch(`https://api.d-id.com/talks/${encodeURIComponent(ref)}`, {
        headers: { Authorization: `Basic ${key}` },
      });
      if (!res.ok) return { state: "failed", reason: `D-ID status ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}` };
      const d = (await res.json().catch(() => null)) as { status?: string; result_url?: string; error?: { description?: string } } | null;
      if (d?.status === "done") {
        return d.result_url ? { state: "ready", url: d.result_url } : { state: "failed", reason: "D-ID reported done with no result URL." };
      }
      if (d?.status === "error" || d?.status === "rejected") {
        return { state: "failed", reason: `D-ID could not render it: ${d?.error?.description || "no reason given"}` };
      }
      if (d?.status === "created" || d?.status === "started") return { state: "rendering" };
      return { state: "failed", reason: `D-ID returned an unrecognised status (${String(d?.status)}).` };
    }

    const res = await fetch(`https://api.synthesia.io/v2/videos/${encodeURIComponent(ref)}`, {
      headers: { Authorization: key },
    });
    if (!res.ok) return { state: "failed", reason: `Synthesia status ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}` };
    const d = (await res.json().catch(() => null)) as { status?: string; download?: string; reason?: string } | null;
    if (d?.status === "complete") {
      return d.download ? { state: "ready", url: d.download } : { state: "failed", reason: "Synthesia reported complete with no download URL." };
    }
    if (d?.status === "failed" || d?.status === "rejected") {
      return { state: "failed", reason: `Synthesia could not render it: ${d?.reason || "no reason given"}` };
    }
    if (d?.status === "in_progress" || d?.status === "pending") return { state: "rendering" };
    return { state: "failed", reason: `Synthesia returned an unrecognised status (${String(d?.status)}).` };
  } catch (e) {
    // A NETWORK BLIP IS NOT A FAILED RENDER. The provider is still working; the
    // next poll asks again. Failing here would refund a render that is about to
    // succeed and leave the customer with neither the video nor the charge.
    return { state: "rendering" };
  }
}

/**
 * Poll a presenter render, and when it is finished, bring it home.
 *
 * Safe to call repeatedly: a job that is already ready or failed is returned
 * as it stands, so the panel can poll on a timer without re-downloading.
 */
export async function getAvatarRender(jobId: string): Promise<AvatarRender | { error: string }> {
  const job = await loadRender(jobId);
  if (!job) return { error: "Unknown presenter render." };
  if (job.status !== "rendering") return job;

  const provider = AVATAR_PROVIDERS.find((p) => p.id === job.provider);
  if (!provider || !process.env[provider.envKey]) {
    return await failRefunded(job, `The ${job.provider} key is no longer set on this deployment, so this render cannot be collected. ${REFUNDED}`);
  }

  const status = await providerStatus(provider, job.providerRef);
  if (status.state === "rendering") return job;
  if (status.state === "failed") return await failRefunded(job, `${status.reason} ${REFUNDED}`);

  // Ready at the provider. Fetch the bytes.
  let bytes: Buffer | null = null;
  try {
    const res = await fetch(status.url);
    if (!res.ok) {
      return await failRefunded(job, `${provider.label} finished the render but the download returned HTTP ${res.status}. ${REFUNDED}`);
    }
    bytes = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    // The provider says ready and we could not fetch it — a transient network
    // problem on OUR side. Left rendering so the next poll retries, because
    // refunding a video that exists would lose the customer the video.
    job.note = `Rendered at ${provider.label}; the download has not succeeded yet (${e instanceof Error ? e.message : "network error"}). Retrying.`;
    await saveRender(job);
    return job;
  }

  // A real MP4 is never a few bytes — the same guard the generative path uses
  // against an empty blob being hosted as a "video" and playing as a black box.
  if (bytes.length < 2048) {
    return await failRefunded(job, `${provider.label} returned a file too small to be a video (${bytes.length} bytes). ${REFUNDED}`);
  }

  if (!storageConfigured()) {
    // Nothing to host it with. The video exists and is reachable for now, so
    // this is NOT a failure and NOT a refund — but the link is the provider's
    // and it will expire, which the note has to say out loud.
    job.status = "ready";
    job.videoUrl = status.url;
    job.note = `Rendered by ${provider.label}. No storage bucket is configured, so this is the provider's own link and it WILL expire — download it now. Set FIREBASE_STORAGE_BUCKET and future renders are hosted permanently and filed in your library. ${job.disclosure}`;
    await saveRender(job);
    return job;
  }

  const hosted = await uploadPublicMedia(bytes, {
    contentType: "video/mp4",
    ext: "mp4",
    keyPrefix: "presenter",
    nameSeed: `${job.brandId}|${job.providerRef}`,
  });
  if (!hosted) {
    job.status = "ready";
    job.videoUrl = status.url;
    job.note = `Rendered by ${provider.label}, but it could not be copied to your storage, so this is the provider's own link and it will expire. Download it now. ${job.disclosure}`;
    await saveRender(job);
    return job;
  }

  job.status = "ready";
  job.videoUrl = hosted;
  const filed = await fileInLibrary(job, hosted);
  job.note = `Rendered by ${provider.label} and hosted on your own storage.${filed ? " Filed in your work library." : ""} ${job.disclosure}`;
  await saveRender(job);
  return job;
}

/**
 * File the finished video where every other deliverable lives.
 *
 * FILED BEFORE IT IS CALLED READY, for the reason the generative path records:
 * a paid render that exists only in React state is gone on the next refresh.
 */
async function fileInLibrary(job: AvatarRender, url: string): Promise<boolean> {
  try {
    const r = await saveWork({
      brandId: job.brandId,
      ownerId: null,
      kind: "video",
      source: "presenter-video",
      sourceName: "AI Presenter",
      title: (job.script.split("\n")[0] || "").slice(0, 80) || `${job.minutes}-minute presenter video`,
      output: url,
      input: {
        script: job.script,
        presenter: job.avatarKind === "custom" ? `custom (${job.personName || "named person"})` : "stock performer",
        aspect: job.aspect,
        minutes: String(job.minutes),
        provider: job.provider,
        acus: String(ACTION_COST_ACU.avatar * job.minutes),
        disclosure: job.disclosure,
      },
    }, new Date().toISOString());
    return r.ok;
  } catch {
    return false;
  }
}

/** The frame the provider should render, from the aspect the customer chose. */
function dimensionFor(aspect?: AvatarAspect): { width: number; height: number } {
  const d = AVATAR_DIMENSIONS[aspect || "9:16"] || AVATAR_DIMENSIONS["9:16"];
  return { width: d.width, height: d.height };
}

/**
 * One piece of a render: what is said, and optionally the track to say it with.
 *
 * A single-take video is one of these; a commercial is several. Keeping them
 * the same shape is the reason there is ONE adapter rather than two — a second
 * `startCommercialWith` would be a second place for a provider's id scheme, a
 * second set of headers and a second thing to forget when a provider changes.
 */
export type Scene = { text: string; audioUrl?: string };

async function startWith(p: AvatarProvider, req: AvatarRequest, scenes: Scene[]): Promise<{ ok: true; ref: string } | { ok: false; error: string }> {
  const key = process.env[p.envKey] as string;
  const parts = scenes.length ? scenes : [{ text: (req.script || "").trim() }];
  if (parts.length > 1 && !p.scenes) {
    // Unreachable through the routes, which ask `configuredProvider("scenes")`.
    // Checked anyway, because the alternative to this line is a commercial
    // silently rendered as its first fifteen seconds.
    return { ok: false, error: `${p.label} renders one scene per request, so it cannot make a continuous commercial. Configure HeyGen or Synthesia for that.` };
  }
  try {
    if (p.id === "heygen") {
      const res = await fetch("https://api.heygen.com/v2/video/generate", {
        method: "POST",
        headers: { "X-Api-Key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          // ONE REQUEST, N SCENES, ONE VIDEO BACK. This array has always been
          // an array; we had always sent exactly one entry. Several entries is
          // what makes a sixty-second commercial out of fifteen-second beats
          // with no joins to hide — the provider renders them as one piece,
          // with the same character and voice throughout.
          video_inputs: parts.map((scene) => ({
            character: { type: "avatar", avatar_id: req.avatarId || "" },
            // A HOSTED AUDIO TRACK BEATS THE PROVIDER'S OWN TEXT-TO-SPEECH when
            // one is supplied, and that is how a CLONED voice gets onto the
            // avatar: ElevenLabs renders the speech in the customer's own voice,
            // we host it, and the presenter lip-syncs to it. The provider never
            // receives the voice model — only a finished track — so a cloned
            // voice is not uploaded to a second vendor to make this work.
            voice: scene.audioUrl
              ? { type: "audio", audio_url: scene.audioUrl }
              : { type: "text", input_text: scene.text, voice_id: req.voiceId || undefined },
          })),
          dimension: dimensionFor(req.aspect),
        }),
      });
      if (!res.ok) return { ok: false, error: `HeyGen ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}` };
      const d = (await res.json().catch(() => null)) as { data?: { video_id?: string } } | null;
      const ref = d?.data?.video_id;
      return ref ? { ok: true, ref } : { ok: false, error: "HeyGen returned no video id." };
    }
    if (p.id === "did") {
      const res = await fetch("https://api.d-id.com/talks", {
        method: "POST",
        headers: { Authorization: `Basic ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          script: parts[0].audioUrl
            ? { type: "audio", audio_url: parts[0].audioUrl }
            : { type: "text", input: parts[0].text },
          presenter_id: req.avatarId || undefined,
        }),
      });
      if (!res.ok) return { ok: false, error: `D-ID ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}` };
      const d = (await res.json().catch(() => null)) as { id?: string } | null;
      return d?.id ? { ok: true, ref: d.id } : { ok: false, error: "D-ID returned no id." };
    }
    const res = await fetch("https://api.synthesia.io/v2/videos", {
      method: "POST",
      headers: { Authorization: key, "Content-Type": "application/json" },
      // Synthesia's `input` is an array of scenes too, so a commercial is one
      // video here as well — the same reason D-ID is declared `scenes: false`.
      body: JSON.stringify({
        test: false,
        input: parts.map((scene) => ({ scriptText: scene.text, avatar: req.avatarId || undefined })),
      }),
    });
    if (!res.ok) return { ok: false, error: `Synthesia ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}` };
    const d = (await res.json().catch(() => null)) as { id?: string } | null;
    return d?.id ? { ok: true, ref: d.id } : { ok: false, error: "Synthesia returned no id." };
  } catch (e) {
    return { ok: false, error: `${p.label} request failed: ${e instanceof Error ? e.message : "network error"}` };
  }
}

// ---------------------------------------------------------------------------
// THE ROSTER — pick a face, don't paste an id
// ---------------------------------------------------------------------------
//
// The panel used to take `avatarId` as a free-text field. That is an id the
// customer can only obtain by logging into the provider's own dashboard,
// finding the avatar and copying a UUID — which means the one thing our screen
// could not do was let somebody choose a presenter. A wrong paste renders a
// stranger reading their script, and they are billed for it.
//
// Cached in memory for an hour: the roster is the same for every tenant on the
// platform key, it changes when the provider adds performers (rarely), and
// fetching it on every page load would spend a provider rate limit on a list
// that has not moved.

export type AvatarChoice = {
  id: string;
  name: string;
  /** "avatar" is a filmed performer; "photo" is a still brought to life. */
  kind: "avatar" | "photo";
  gender?: string;
  previewImage?: string;
  previewVideo?: string;
};

export type VoiceChoice = {
  id: string;
  name: string;
  language?: string;
  gender?: string;
  previewAudio?: string;
};

type Roster = { avatars: AvatarChoice[]; voices: VoiceChoice[]; fetchedAt: number; note: string };

let rosterCache: Roster | null = null;
const ROSTER_TTL_MS = 60 * 60_000;

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Every presenter and voice this deployment can actually use.
 *
 * Returns empty lists with a REASON rather than an error when the provider has
 * no roster endpoint — D-ID presenters and Synthesia avatars are listed in
 * their own consoles, and pretending otherwise would put an empty grid in front
 * of the customer with no explanation.
 */
export async function avatarRoster(force = false): Promise<Roster> {
  // Asks for a provider that publishes one — the cheapest renderer may not.
  const provider = configuredProvider("roster") || configuredProvider();
  if (!provider) {
    return { avatars: [], voices: [], fetchedAt: Date.now(), note: "No avatar provider is configured, so there is no roster to show. Set HEYGEN_API_KEY in the admin account and the presenters appear here." };
  }
  if (!force && rosterCache && Date.now() - rosterCache.fetchedAt < ROSTER_TTL_MS) return rosterCache;

  const key = process.env[provider.envKey] as string;

  if (provider.id !== "heygen") {
    const r: Roster = {
      avatars: [], voices: [], fetchedAt: Date.now(),
      note: `${provider.label} does not publish a roster this platform can list, so choose the presenter in ${provider.label}'s own console and paste its id. HeyGen does publish one — with that key set, you pick a face here instead.`,
    };
    rosterCache = r;
    return r;
  }

  const avatars: AvatarChoice[] = [];
  const voices: VoiceChoice[] = [];
  const problems: string[] = [];

  try {
    const res = await fetch("https://api.heygen.com/v2/avatars", { headers: { "X-Api-Key": key } });
    if (res.ok) {
      const d = (await res.json().catch(() => null)) as {
        data?: { avatars?: unknown[]; talking_photos?: unknown[] };
      } | null;
      for (const raw of d?.data?.avatars || []) {
        const a = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
        const id = str(a.avatar_id);
        if (!id) continue;
        avatars.push({
          id, kind: "avatar",
          name: str(a.avatar_name) || id,
          gender: str(a.gender) || undefined,
          previewImage: str(a.preview_image_url) || undefined,
          previewVideo: str(a.preview_video_url) || undefined,
        });
      }
      for (const raw of d?.data?.talking_photos || []) {
        const a = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
        const id = str(a.talking_photo_id);
        if (!id) continue;
        avatars.push({
          id, kind: "photo",
          name: str(a.talking_photo_name) || id,
          previewImage: str(a.preview_image_url) || undefined,
        });
      }
    } else {
      problems.push(`presenters (HTTP ${res.status})`);
    }
  } catch { problems.push("presenters (network)"); }

  try {
    const res = await fetch("https://api.heygen.com/v2/voices", { headers: { "X-Api-Key": key } });
    if (res.ok) {
      const d = (await res.json().catch(() => null)) as { data?: { voices?: unknown[] } } | null;
      for (const raw of d?.data?.voices || []) {
        const v = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
        const id = str(v.voice_id);
        if (!id) continue;
        voices.push({
          id,
          name: str(v.name) || id,
          language: str(v.language) || undefined,
          gender: str(v.gender) || undefined,
          previewAudio: str(v.preview_audio) || undefined,
        });
      }
    } else {
      problems.push(`voices (HTTP ${res.status})`);
    }
  } catch { problems.push("voices (network)"); }

  const r: Roster = {
    avatars, voices, fetchedAt: Date.now(),
    note: problems.length
      ? `${provider.label} answered for some of the roster but not all — could not read: ${problems.join(", ")}. What is listed is real; the rest is missing rather than empty.`
      : `${avatars.length} presenters and ${voices.length} voices from ${provider.label}.`,
  };
  // ONLY CACHE A COMPLETE ANSWER. Caching a partial roster for an hour would
  // hide a provider outage behind a half-empty grid that looks deliberate.
  if (!problems.length) rosterCache = r;
  return r;
}

// ---------------------------------------------------------------------------
// LIP-SYNCED TRANSLATION
// ---------------------------------------------------------------------------
//
// NOT THE SAME THING AS DUBBING, AND THE DIFFERENCE IS THE POINT. The platform
// already dubs through ElevenLabs: it transcribes, translates and re-voices,
// and the result is a video whose audio is Spanish while the mouth is still
// saying English. That is fine for a voiceover over B-roll and obviously wrong
// on a close-up of a face.
//
// Translation here re-renders the MOUTH to match the new language, which is the
// feature HeyGen is actually bought for. It is billed per minute per language,
// so the price is quoted per language BEFORE the click — a customer who picks
// eight languages on a two-minute video is spending sixteen minutes of render,
// and finding that out afterwards is how a platform loses an account.

export type TranslationJob = {
  jobId: string;
  brandId: string;
  sourceJobId: string;
  lang: string;
  provider: AvatarProviderId;
  providerRef: string;
  status: AvatarRenderStatus;
  videoUrl: string | null;
  minutes: number;
  chargedAcu: number;
  startedAt: string;
  note: string;
};

const memTranslations = new Map<string, TranslationJob>();
const TRANSLATIONS = "avatar_translations";

async function saveTranslation(job: TranslationJob): Promise<void> {
  memTranslations.set(job.jobId, job);
  if (adminDb) { try { await adminDb.collection(TRANSLATIONS).doc(job.jobId).set(job); } catch { /* memory still has it */ } }
}

async function loadTranslation(jobId: string): Promise<TranslationJob | null> {
  if (memTranslations.has(jobId)) return memTranslations.get(jobId)!;
  if (adminDb) {
    try {
      const d = await adminDb.collection(TRANSLATIONS).doc(jobId).get();
      if (!d.exists) return null;
      const raw = d.data();
      if (!raw || typeof raw !== "object") return null;
      const t = raw as Partial<TranslationJob>;
      if (typeof t.jobId !== "string" || typeof t.brandId !== "string" || typeof t.providerRef !== "string") return null;
      return {
        ...t,
        jobId: t.jobId, brandId: t.brandId, providerRef: t.providerRef,
        sourceJobId: str(t.sourceJobId),
        lang: str(t.lang),
        provider: (t.provider || "none") as AvatarProviderId,
        status: t.status === "ready" || t.status === "failed" ? t.status : "rendering",
        videoUrl: typeof t.videoUrl === "string" ? t.videoUrl : null,
        minutes: typeof t.minutes === "number" ? t.minutes : 1,
        chargedAcu: typeof t.chargedAcu === "number" ? t.chargedAcu : 0,
        startedAt: str(t.startedAt),
        note: str(t.note),
      };
    } catch { return null; }
  }
  return null;
}

/**
 * The languages this provider will lip-sync into.
 *
 * Read from the provider rather than hardcoded, because a list that goes stale
 * either offers a language that fails at render time or hides one the customer
 * is paying for.
 */
export async function translationLanguages(): Promise<{ languages: string[]; note: string }> {
  const provider = configuredProvider("translation");
  if (!provider || provider.id !== "heygen") {
    return { languages: [], note: "Lip-synced translation needs HeyGen. Without it the platform can still DUB (ElevenLabs) — the audio is translated but the mouth is not, which is fine over B-roll and wrong on a face." };
  }
  try {
    const res = await fetch("https://api.heygen.com/v2/video_translate/target_languages", {
      headers: { "X-Api-Key": process.env[provider.envKey] as string },
    });
    if (!res.ok) return { languages: [], note: `HeyGen could not list its languages (HTTP ${res.status}).` };
    const d = (await res.json().catch(() => null)) as { data?: { languages?: unknown[] } } | null;
    const languages = (d?.data?.languages || []).filter((l): l is string => typeof l === "string");
    return { languages, note: `${languages.length} languages, lip-synced.` };
  } catch (e) {
    return { languages: [], note: `Could not reach HeyGen to list languages: ${e instanceof Error ? e.message : "network error"}.` };
  }
}

export type StartTranslation = { ok: true; job: TranslationJob } | { ok: false; error: string };

/**
 * Translate a finished render into one language, with the mouth re-rendered.
 *
 * Takes the SOURCE JOB rather than a URL on purpose: a translation of a video
 * we did not make has no minutes we can price, no brand to bill and no consent
 * record behind the face in it. The source job has all three.
 */
export async function startTranslation(input: {
  source: AvatarRender;
  lang: string;
  chargedAcu: number;
  nowISO: string;
}): Promise<StartTranslation> {
  const provider = configuredProvider("translation");
  if (!provider || provider.id !== "heygen") {
    return { ok: false, error: "Lip-synced translation needs HeyGen configured. The dubbing path translates the audio without the mouth, which is a different product." };
  }
  if (input.source.status !== "ready" || !input.source.videoUrl) {
    return { ok: false, error: "That video is not finished yet. A translation can only be made from a rendered video." };
  }
  const lang = (input.lang || "").trim();
  if (!lang) return { ok: false, error: "Name the language to translate into." };

  try {
    const res = await fetch("https://api.heygen.com/v2/video_translate", {
      method: "POST",
      headers: { "X-Api-Key": process.env[provider.envKey] as string, "Content-Type": "application/json" },
      body: JSON.stringify({
        video_url: input.source.videoUrl,
        output_language: lang,
        title: `${input.source.jobId}-${lang}`.slice(0, 80),
      }),
    });
    if (!res.ok) return { ok: false, error: `HeyGen refused the translation (HTTP ${res.status}): ${(await res.text().catch(() => "")).slice(0, 160)}` };
    const d = (await res.json().catch(() => null)) as { data?: { video_translate_id?: string } } | null;
    const ref = d?.data?.video_translate_id;
    if (!ref) return { ok: false, error: "HeyGen accepted the translation but returned no id to poll." };

    const job: TranslationJob = {
      jobId: `tr_${hid(`${input.source.jobId}|${lang}|${input.nowISO}`)}`,
      brandId: input.source.brandId,
      sourceJobId: input.source.jobId,
      lang,
      provider: provider.id,
      providerRef: ref,
      status: "rendering",
      videoUrl: null,
      minutes: input.source.minutes,
      chargedAcu: input.chargedAcu,
      startedAt: input.nowISO,
      note: `Translating into ${lang} with the mouth re-rendered.`,
    };
    await saveTranslation(job);
    return { ok: true, job };
  } catch (e) {
    return { ok: false, error: `HeyGen translation request failed: ${e instanceof Error ? e.message : "network error"}` };
  }
}

/** Poll a translation, and bring the finished file home exactly as a render is. */
export async function getTranslation(jobId: string): Promise<TranslationJob | { error: string }> {
  const job = await loadTranslation(jobId);
  if (!job) return { error: "Unknown translation." };
  if (job.status !== "rendering") return job;

  const provider = AVATAR_PROVIDERS.find((p) => p.id === job.provider);
  if (!provider || !process.env[provider.envKey]) {
    return await failTranslation(job, `The ${job.provider} key is no longer set, so this translation cannot be collected. ${REFUNDED}`);
  }

  let url = "";
  try {
    const res = await fetch(`https://api.heygen.com/v2/video_translate/${encodeURIComponent(job.providerRef)}`, {
      headers: { "X-Api-Key": process.env[provider.envKey] as string },
    });
    if (!res.ok) return job; // a bad poll is not a failed translation; ask again
    const d = (await res.json().catch(() => null)) as { data?: { status?: string; url?: string; message?: string } } | null;
    const st = d?.data?.status;
    if (st === "failed") return await failTranslation(job, `HeyGen could not translate it: ${d?.data?.message || "no reason given"}. ${REFUNDED}`);
    if (st !== "success" && st !== "completed") return job;
    url = str(d?.data?.url);
    if (!url) return await failTranslation(job, `HeyGen reported the translation finished but returned no file. ${REFUNDED}`);
  } catch {
    return job;
  }

  // Hosted by us, for the same three reasons the render is.
  if (storageConfigured()) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const bytes = Buffer.from(await res.arrayBuffer());
        if (bytes.length >= 2048) {
          const hosted = await uploadPublicMedia(bytes, {
            contentType: "video/mp4", ext: "mp4", keyPrefix: "presenter",
            nameSeed: `${job.brandId}|${job.providerRef}|${job.lang}`,
          });
          if (hosted) url = hosted;
        }
      }
    } catch { /* the provider's link still works for now; the note says so */ }
  }

  job.status = "ready";
  job.videoUrl = url;
  job.note = `Translated into ${job.lang}, lip-synced.${url.includes("googleapis") || url.includes("firebase") ? " Hosted on your own storage." : " This is the provider's link and it will expire — download it."}`;
  await saveTranslation(job);
  return job;
}

async function failTranslation(job: TranslationJob, note: string): Promise<TranslationJob> {
  if (job.chargedAcu > 0) {
    try {
      const walletId = await walletIdForBrand(job.brandId);
      await creditAcus(walletId, job.chargedAcu);
      job.chargedAcu = 0;
    } catch { /* the note still tells the truth */ }
  }
  job.status = "failed";
  job.note = note;
  await saveTranslation(job);
  return job;
}

/** A render the customer owns, for the routes that poll or translate it. */
export async function ownedRender(jobId: string, brandId: string): Promise<AvatarRender | null> {
  const job = await loadRender(jobId);
  if (!job || job.brandId !== brandId) return null;
  return job;
}
