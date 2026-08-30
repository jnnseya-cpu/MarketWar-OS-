// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Video Render Gateway — one door to every video model.
//
// Video generation is ASYNC (renders take seconds→minutes and return via an
// operation handle), so this gateway is a two-step job model, NOT a synchronous
// call: startVideoRender() kicks off the render and returns a jobId; a client
// polls getVideoRender(jobId) until it is ready, at which point the finished MP4
// is uploaded to Firebase Storage and a HOSTED URL is returned — ready to attach
// to a published post.
//
// Providers (env-gated, reached over REST — no SDK coupling, like the other
// gateways): Google Veo via the Gemini API (GEMINI_API_KEY) and OpenAI Sora
// (OPENAI_API_KEY). With no key the gateway runs a deterministic DEMO job so the
// flow is testable end to end and the UI is honest ("activates with a Veo/Sora
// key"). Every live path degrades gracefully to demo on any error.

import { adminDb } from "@/backend/firebase-admin";
import { uploadPublicMedia, storageConfigured } from "@/backend/storage";
import { spendAcus, creditAcus, type Spender } from "@/backend/wallet";
import { readProviderFailure, failureLine, type ProviderFailure } from "@/shared/provider-failure";
import { reviewBrief, briefRefusal, type Aspect, type Resolution } from "@/shared/render-brief";
import { walletIdForBrand } from "@/backend/brand-access";
import { requiredAcus } from "@/backend/subscription";
import { minimumAcusFor } from "@/backend/unit-economics";
import { ffmpegCloudConfigured, createTranscode, getTranscode, getDownloadUrl, toQueueStatus } from "@/backend/ffmpeg-cloud";
import { saveWork } from "@/backend/work-library";
import { getBrandById } from "@/backend/brand-store";
import { mp4Duration, durationMatches } from "@/shared/mp4-duration";

export type VideoRenderStatus = "queued" | "rendering" | "ready" | "failed" | "demo";
export type VideoProvider = "veo" | "sora" | "demo";

export type VideoJob = {
  jobId: string;
  brandId: string;
  prompt: string;
  provider: VideoProvider;
  status: VideoRenderStatus;
  mode: "live" | "demo";
  videoUrl: string | null;   // hosted MP4 when ready (attachable)
  providerRef: string | null; // provider operation/id to poll
  /** What the caller asked for, and what the model will actually deliver. Both
   *  carried so a 4-second clip can never again arrive without an explanation. */
  requestedSeconds?: number;
  seconds?: number;
  /** ACUs actually taken for this render. 0 in demo, and 0 again after a refund. */
  chargedAcu?: number;
  /**
   * THE CLIPS THIS LENGTH IS MADE OF.
   *
   * Twelve and fifteen seconds are longer than either engine renders in one
   * call, so they are several clips that sum exactly to the length on the
   * button. One entry means one render, which is every job written before this
   * existed — those keep working off `providerRef` alone.
   */
  segments?: { seconds: number; ref: string | null; url: string | null }[];
  /** Every finished clip, in order, once they are all rendered. */
  clips?: string[];
  /** The join job, while several clips are being made into the one file. */
  stitchRef?: string | null;
  note: string;
};

function seed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}
function jobIdFor(brandId: string, prompt: string): string {
  return `vid_${(seed(brandId + "|" + prompt) >>> 0).toString(16).padStart(8, "0")}`;
}

export function videoGatewayConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
}
function chosenProvider(): VideoProvider {
  if (process.env.GEMINI_API_KEY) return "veo";
  if (process.env.OPENAI_API_KEY) return "sora";
  return "demo";
}

// ---------------------------------------------------------------------------
// Job store — Firestore when configured, in-memory otherwise (mirrors ledger.ts
// / invites.ts). Jobs are short-lived render tickets.
// ---------------------------------------------------------------------------
const memJobs = new Map<string, VideoJob>();

async function saveJob(job: VideoJob): Promise<void> {
  memJobs.set(job.jobId, job);
  if (adminDb) { try { await adminDb.collection("video_jobs").doc(job.jobId).set(job); } catch { /* non-fatal */ } }
}
async function loadJob(jobId: string): Promise<VideoJob | null> {
  if (memJobs.has(jobId)) return memJobs.get(jobId)!;
  if (adminDb) { try { const d = await adminDb.collection("video_jobs").doc(jobId).get(); if (d.exists) return d.data() as VideoJob; } catch { /* ignore */ } }
  return null;
}

// ---------------------------------------------------------------------------
// Provider adapters (best-effort REST; defensive parsing; graceful failure).
// ---------------------------------------------------------------------------
// Trim + redact a provider error body to a short, safe reason (never leaks the key).
function safeReason(s: string): string {
  return s.replace(/key=[^&\s"]+/gi, "key=***").replace(/\s+/g, " ").trim().slice(0, 200);
}
// A failure carries the STATUS AND BODY, not just a sentence we made from them.
// Formatting the reason and throwing the evidence away is what left the render
// unable to tell "your account is empty" from "that model does not exist" —
// the two failures with the least in common and the most similar first line.
// `model` and `note` come back on SUCCESS as well as failure. Without them the
// job could not say what actually rendered it — and "was this the tier I asked
// for?" is the first question anyone judging a render asks, especially when the
// pinned model was unavailable and something else quietly answered.
type StartResult = { ref: string; model?: string; note?: string } | { error: string; status: number; body: string };

// WHICH VEO MODEL RENDERS — and why the owner sets it rather than this list.
//
// `GEMINI_VIDEO_MODEL` is tried FIRST and always has been. That is the quality
// dial: set it to the tier the business wants (Veo 3.1 for the best output, the
// 3.1 Lite preview for the cheapest 3.1-family output) and every render uses it.
// This list is only the FALLBACK for when that model is unavailable to the key.
//
// THE DEFECT IN THE OLD ORDER. The comment above it said "FAST FIRST — this
// order is a pricing decision", and then put `veo-3.0-generate-001` — the
// $0.40/s flagship, nearly THREE TIMES the rate the cost constant assumes —
// second in line. Veo ids drift by design (previews get promoted and the old id
// 404s), so that fallback is not hypothetical: the day Fast's id moved, every
// render would have cost 3x what it was priced at, the 2x floor would have been
// enforced against a number that was wrong, and nothing would have said so.
//
// So the fallback NEVER ESCALATES COST. It descends through the rates we have
// evidence for and stops; the flagship is reachable only by asking for it by
// name, where the owner has decided to pay for it. This is the same rule the
// provider failover follows — a fallback may deliver less, never cost more.
const VEO_CANDIDATES = [
  "veo-3.1-lite-generate-preview",  // 3.1 family, high-efficiency tier
  "veo-3.0-fast-generate-001",
  "veo-2.0-generate-001",
];

/**
 * The tiers an owner can pin with `GEMINI_VIDEO_MODEL`, for the surface to show.
 *
 * NO RATES ARE WRITTEN HERE ON PURPOSE. Published prices move, and this
 * codebase's rule is that the cost constant is set from an invoice — a rate
 * copied from a blog post into pricing code is a loss waiting for a promotion.
 * Set `VIDEO_COST_PER_SECOND_GBP_VEO` to match whichever tier is pinned.
 */
export const VEO_TIERS: { model: string; label: string; note: string }[] = [
  { model: "veo-3.1-generate-preview", label: "Veo 3.1", note: "Best output. The tier to pin when the first render has to be right and the rate is set to match." },
  { model: "veo-3.1-lite-generate-preview", label: "Veo 3.1 Lite", note: "The 3.1 family at its efficiency tier — no 4K, no extension. The default fallback." },
  { model: "veo-3.0-fast-generate-001", label: "Veo 3 Fast", note: "Previous generation, low rate. Reached only if the 3.1 ids are unavailable to the key." },
];
let workingVeoModel: string | null = null;

// HOW LONG THE CLIP IS — the thing nobody was asking for.
//
// The renders came back at four seconds and there was no bug to find, because
// there was no duration in the code at all: `startVideoRender` took a brandId
// and a prompt, Veo was called with `{ instances: [{ prompt }] }` and Sora with
// `{ model, prompt }`. Neither was told a length, so both returned their own
// default — and four seconds is not a social video, it is a GIF that costs
// money.
//
// WHAT EACH MODEL WILL ACTUALLY DO. This is the part a caller cannot guess and
// must not be allowed to assume: a single Veo call maxes out at 8 seconds, and
// Sora 2 accepts 4, 8 or 12 and nothing between. So a request for 15 seconds
// cannot be honoured by one call to either. The engine asks for the longest the
// chosen model supports and REPORTS the difference, rather than quietly
// shipping a quarter of what was asked for — which is exactly what it was
// doing.
export const VEO_MAX_SECONDS = 8;
export const VEO_MIN_SECONDS = 4;
export const SORA_STEPS = [4, 8, 12];
export const DEFAULT_SECONDS = 8;

// The lengths offered on screen, in the order they are offered.
//
// OWNER'S CALL: "noone will buy a 4sec video. we need between 8, 12 and 15
// second." Four seconds is gone. Twelve and fifteen are longer than any single
// call to either engine produces, so they are rendered as SEGMENTS that sum
// EXACTLY to the length on the button — see `segmentPlan`. The price is the sum
// of those segments, which is the only way a fifteen-second row can carry a
// fifteen-second price without charging for video nobody received.
export const OFFERED_SECONDS = [8, 12, 15];

// What the panel starts on. Owner's call: 15 seconds, because that is the
// length a social ad is actually cut to.
//
// NO SINGLE CALL PRODUCES IT — Veo caps at 8 and Sora's longest step is 12 — so
// this default is only defensible because the panel now prints, beside every
// option and before the click, the length that provider will really return and
// the ACUs it will really cost. Picking 15 is then an informed choice rather
// than a promise the engine cannot keep. `DEFAULT_SECONDS` above is a different
// thing and stays at 8: it is the fallback for an unparseable request, where
// guessing long would spend the customer's money on a guess.
export const DEFAULT_RENDER_SECONDS = 15;

// ---------------------------------------------------------------------------
// WHAT A GENERATED SECOND COSTS, AND THEREFORE WHAT IT SELLS FOR.
//
// This engine was not metered AT ALL. Veo and Sora bill us per second of
// generated video, and the customer was charged nothing for it — a straight
// breach of the pricing law (price is never below 2x provider cost), and the
// reason the panel could not answer "what will this cost me?": there was no
// answer to give.
//
// THE FIRST ATTEMPT PRICED AN 8-SECOND CLIP AT 1,280 ACUs — £12.80 — and the
// owner's answer was the right one: "not cheap and we will not be competitive."
//
// The mistake was not the margin. It was paying the most expensive rate on the
// board and then multiplying it. Two things fixed it, and both are the levers
// the pricing law actually names — win on a lower COST BASE, never by breaching
// the floor:
//
//   1. ROUTE TO THE CHEAP MODEL. Published rates: Veo 3 is $0.40/s, Veo 3 FAST
//      is $0.15/s, Sora 2 is about $0.10/s at 720p. The candidate order below
//      now asks for Fast first. A social clip does not need the flagship, and
//      the failover chain still reaches it.
//   2. PRICE AT THE FLOOR, NOT THE STANDARD MARKUP. Most actions carry 4x. On
//      an action whose provider cost is measured in pounds rather than pennies,
//      4x prices us out of the market. 2x is the owner's hard floor — 100%
//      margin, never lower — and it is what a big-ticket action is sold at.
//
// 8 seconds now costs the customer ~190 ACUs instead of 1,280, and every penny
// of that is still at least double what the render cost us.
//
// VIDEO_COST_PER_SECOND_GBP is the ONE number to update when the rate is
// confirmed off an invoice; every price moves with it and the floor is enforced
// by test, so a wrong rate cannot quietly become a loss. The default is Veo 3
// Fast's published $0.15/s converted to sterling.
export const VIDEO_COST_PER_SECOND_GBP = Number(process.env.VIDEO_COST_PER_SECOND_GBP || 0.12);

/**
 * PER-PROVIDER RATE, so "the best price on the best model" is a computation
 * rather than a hope.
 *
 * One constant priced both engines. If the two ever charge differently — and
 * they do — that constant is simultaneously overcharging on the cheaper model
 * and eating margin on the dearer one, and the 2x floor is only enforced
 * against a number that is right for at most one of them.
 *
 * NO INVENTED RATES. Both default to the measured Veo 3 Fast figure until an
 * invoice says otherwise; set VIDEO_COST_PER_SECOND_GBP_VEO / _SORA from a real
 * bill and the cheapest capable engine is chosen automatically from that day.
 */
export function videoCostPerSecondGbp(provider: VideoProvider): number {
  const raw = provider === "veo" ? process.env.VIDEO_COST_PER_SECOND_GBP_VEO
    : provider === "sora" ? process.env.VIDEO_COST_PER_SECOND_GBP_SORA
      : "";
  const n = Number((raw || "").trim());
  return n > 0 ? n : VIDEO_COST_PER_SECOND_GBP;
}

/** The markup video renders are sold at. The owner's hard floor, never below. */
const VIDEO_MARKUP = 2;

/** What a render of this many seconds costs the customer, in ACUs (1 ACU = 1p). */
export function videoRenderAcus(seconds: number, provider?: VideoProvider): number {
  const s = Math.max(1, Math.round(Number(seconds) || DEFAULT_SECONDS));
  const providerCostGbp = videoCostPerSecondGbp(provider ?? "veo") * s;
  return Math.max(
    requiredAcus(providerCostGbp, VIDEO_MARKUP).requiredAcus,
    minimumAcusFor({ providerCostGbp, persistsArtifact: true }).minAcus,
  );
}

/**
 * HOW A LENGTH IS ACTUALLY MADE, as clips that sum EXACTLY to it.
 *
 * Veo produces any whole number of seconds from 4 to 8; Sora only its published
 * steps. So a twelve-second ad is 8 + 4 on Veo and one call on Sora, and a
 * fifteen is 8 + 7 on Veo and not reachable at all on Sora, whose steps cannot
 * total 15.
 *
 * EXACT OR NOTHING. A plan that overshoots bills for video nobody asked for; a
 * plan that undershoots is the fault just fixed, where "15 seconds" quietly
 * arrived as 8. Returning null means this engine does not make that length, and
 * the menu simply does not offer it.
 */
export function segmentPlan(provider: VideoProvider, seconds: number): number[] | null {
  const target = Math.round(Number(seconds) || 0);
  if (target <= 0) return null;
  if (provider === "demo") return [target];

  if (provider === "veo") {
    if (target < VEO_MIN_SECONDS) return null;
    const segs: number[] = [];
    let left = target;
    while (left > VEO_MAX_SECONDS) {
      // Leave a remainder the engine can actually make. Taking the maximum
      // every time strands a 1-, 2- or 3-second tail that Veo cannot render,
      // so the last full segment gives up whatever the tail is short by.
      const after = left - VEO_MAX_SECONDS;
      const take = after > 0 && after < VEO_MIN_SECONDS
        ? VEO_MAX_SECONDS - (VEO_MIN_SECONDS - after)
        : VEO_MAX_SECONDS;
      if (take < VEO_MIN_SECONDS) return null;
      segs.push(take);
      left -= take;
    }
    if (left < VEO_MIN_SECONDS) return null;
    segs.push(left);
    return segs;
  }

  // Sora: only its published steps, largest first, and the total must land
  // exactly on the target.
  const steps = [...SORA_STEPS].sort((a, b) => b - a);
  const segs: number[] = [];
  let left = target;
  for (const step of steps) {
    while (left >= step) { segs.push(step); left -= step; }
  }
  return left === 0 && segs.length > 0 ? segs : null;
}

/** What a whole length costs on one provider: the sum of its segments. */
export function videoPlanAcus(provider: VideoProvider, seconds: number): number | null {
  const plan = segmentPlan(provider, seconds);
  if (!plan) return null;
  return plan.reduce((n, sec) => n + videoRenderAcus(sec, provider), 0);
}

/**
 * The cheapest engine that can make this length EXACTLY, out of the ones this
 * deployment is configured for. Ties go to the first in the chain.
 */
export function bestVideoProviderFor(seconds: number, providers?: VideoProvider[]): { provider: VideoProvider; acus: number; segments: number[] } | null {
  return videoPlansFor(seconds, providers)[0] ?? null;
}

/**
 * EVERY engine that can make this length exactly, cheapest first.
 *
 * `bestVideoProviderFor` is the head of this list, and is defined as the head
 * of this list so the two can never disagree about what "cheapest" means.
 *
 * The rest of the list is the failover chain, and until now it did not exist in
 * practice: the render picked one plan and, if that provider refused at the
 * API, abandoned the whole job. A chain that is only ever consulted once is a
 * preference, not a fallback — and the first real refusal in production was an
 * empty OpenAI account, which is precisely the case a second supplier answers.
 */
export function videoPlansFor(seconds: number, providers?: VideoProvider[]): { provider: VideoProvider; acus: number; segments: number[] }[] {
  const chain = providers ?? configuredChain();
  const out: { provider: VideoProvider; acus: number; segments: number[] }[] = [];
  for (const p of chain) {
    const segments = segmentPlan(p, seconds);
    if (!segments) continue;
    out.push({ provider: p, acus: videoPlanAcus(p, seconds)!, segments });
  }
  // Cheapest first; ties keep the chain's own order, which is the deployment's
  // stated preference.
  return out.sort((a, b) => a.acus - b.acus);
}

/** The providers this deployment can actually render on, in failover order. */
export function configuredChain(): VideoProvider[] {
  const chain: VideoProvider[] = [];
  if (process.env.GEMINI_API_KEY) chain.push("veo");
  if (process.env.OPENAI_API_KEY) chain.push("sora");
  return chain;
}

/**
 * The price list the panel shows, for the provider that will actually serve.
 *
 * PRICED ON WHAT IS DELIVERED, AND ONLY OFFERING WHAT CAN BE. The price has
 * always been computed from the delivered length, which was right — but the
 * MENU still listed every requested length, so on Veo the owner saw:
 *
 *     4 seconds  — 141 ACUs
 *     8 seconds  — 281 ACUs
 *     12 seconds — 281 ACUs (returns 8s)
 *     15 seconds — 281 ACUs (returns 8s)
 *
 * Three of those four rows are the same eight-second video. Two of them are
 * named after a length that does not exist, at a price that is correct for a
 * different product. Every price was defensible and the menu was not: a
 * customer reading it concludes either that longer video is free, or that we
 * charge for what we do not deliver, and both conclusions cost more than the
 * options are worth.
 *
 * So the menu is DEDUPLICATED BY WHAT ARRIVES. Each row is a length this
 * provider genuinely produces in one render, at the price for that length, and
 * `maxSingleRender` lets the panel explain the cap instead of pretending it is
 * not there. `acusPerSecond` travels with each row so the proportion is on the
 * screen and nobody has to take our word for it.
 */
export type VideoLengthOption = {
  requested: number; delivered: number; acus: number; acusPerSecond: number;
  /** The clips this length is made from. One entry means a single render. */
  segments: number[];
  /** Which engine will make it — the cheapest that can make it exactly. */
  provider: VideoProvider;
  note: string;
};

export function videoLengthOptions(provider?: VideoProvider): VideoLengthOption[] {
  // Explicit provider = "price it on this engine". No argument = price it on
  // whichever configured engine makes each length most cheaply, which is what
  // "best price on the best model" has to mean if it is to mean anything.
  const forced = provider ?? (chosenProvider() === "demo" ? "demo" : undefined);
  const out: VideoLengthOption[] = [];
  for (const seconds of OFFERED_SECONDS) {
    if (forced === "demo") {
      // Nothing renders, so nothing may be quoted.
      out.push({ requested: seconds, delivered: seconds, acus: 0, acusPerSecond: 0, segments: [seconds], provider: "demo", note: "" });
      continue;
    }
    const best = forced
      ? (() => { const segs = segmentPlan(forced, seconds); return segs ? { provider: forced, segments: segs, acus: videoPlanAcus(forced, seconds)! } : null; })()
      : bestVideoProviderFor(seconds);
    // A length no configured engine can make EXACTLY is not offered. Listing it
    // is how "15 seconds" came to mean eight.
    if (!best) continue;
    // ONE FILE OR IT IS NOT FOR SALE.
    //
    // Owner's directive: "I want both 12 and 15 second video to be in 1 clips."
    // Twelve is one Sora call. Fifteen is not one call on anything, so it is
    // 8 + 7 joined — and joining needs the render service. Without it we cannot
    // deliver what the row promises, so the row is withheld rather than sold
    // and part-delivered. `withheldLengths()` says which and why.
    if (best.segments.length > 1 && !ffmpegCloudConfigured()) continue;
    out.push({
      requested: seconds, delivered: seconds,
      acus: best.acus,
      acusPerSecond: Math.round((best.acus / seconds) * 10) / 10,
      segments: best.segments,
      provider: best.provider,
      note: best.segments.length > 1
        ? `Rendered as ${best.segments.length} clips (${best.segments.map((n) => `${n}s`).join(" + ")}) — no engine makes ${seconds} seconds in one call.`
        : "",
    });
  }
  return out.sort((a, b) => a.delivered - b.delivered);
}

/**
 * The longest clip this provider makes in ONE render.
 *
 * Named so the panel can say "eight seconds is the longest single clip this
 * engine makes; longer ads are cut from several" — which is a fact a customer
 * can plan around, rather than a menu row that quietly gives them less.
 */
export function maxSingleRender(provider?: VideoProvider): number {
  const p = provider ?? chosenProvider();
  if (p === "veo") return VEO_MAX_SECONDS;
  if (p === "sora") return SORA_STEPS[SORA_STEPS.length - 1];
  return OFFERED_SECONDS[OFFERED_SECONDS.length - 1];
}

/** What this provider will actually produce for a requested length. */
export function supportedSeconds(provider: VideoProvider, requested: number): number {
  const want = Math.max(1, Math.round(Number(requested) || DEFAULT_SECONDS));
  if (provider === "veo") return Math.min(VEO_MAX_SECONDS, Math.max(VEO_MIN_SECONDS, want));
  if (provider === "sora") {
    // Snap DOWN to a supported step, never up: a longer clip than asked for is
    // a bigger bill nobody approved.
    const fits = SORA_STEPS.filter((n) => n <= want);
    return fits.length ? fits[fits.length - 1] : SORA_STEPS[0];
  }
  return want;
}

/** Said out loud when the model cannot give what was asked for. */
export function durationNote(provider: VideoProvider, requested: number, delivered: number): string {
  if (delivered >= requested) return "";
  const cap = provider === "veo"
    ? `a single Veo call caps at ${VEO_MAX_SECONDS} seconds`
    : `Sora accepts only ${SORA_STEPS.join(", ")} seconds`;
  return `You asked for ${requested}s and this clip is ${delivered}s — ${cap}. For longer, render segments and stitch them in the Video War Room rather than expecting one call to produce it.`;
}

type GenParams = { aspect: Aspect; resolution: Resolution; negativePrompt: string };

async function veoTry(model: string, prompt: string, key: string, seconds: number, gen: GenParams): Promise<{ ref?: string; status: number; reason?: string }> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning?key=${key}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      // `durationSeconds` is the documented Veo parameter. If a model or region
      // rejects it the call is retried WITHOUT it rather than failing the
      // render — a shorter clip beats no clip, and the note says which happened.
      // THE SHAPE AND THE EXCLUSIONS ARE PARAMETERS, NOT HOPES. Until now this
      // sent a prompt and a duration and nothing else, so the platform could not
      // ask for portrait at all — a 9:16 Reel came back 16:9, wrong on the first
      // render every time — and "do not invent a logo" was an instruction the
      // model was free to read past. `negativePrompt` is the one it honours.
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          durationSeconds: seconds,
          aspectRatio: gen.aspect,
          resolution: gen.resolution,
          negativePrompt: gen.negativePrompt,
        },
      }),
    });
    if (!res.ok) {
      const reason = safeReason(await res.text().catch(() => ""));
      if (res.status === 400) {
        // STEP DOWN, DO NOT STRIP. An older model that rejects `resolution` will
        // still honour `aspectRatio` and `negativePrompt`, and throwing all
        // three away to satisfy one of them hands back the landscape-instead-of-
        // portrait render this change exists to stop. So the newest parameter
        // goes first, and only then the duration.
        const fallbacks: { params: Record<string, unknown>; note: string }[] = [
          { params: { durationSeconds: seconds, aspectRatio: gen.aspect, negativePrompt: gen.negativePrompt }, note: "resolution not accepted by this model — rendered at its default resolution" },
          { params: { durationSeconds: seconds, aspectRatio: gen.aspect }, note: "this model accepts no negative prompt — exclusions are in the prompt text only" },
          { params: { durationSeconds: seconds }, note: "this model accepts no aspect ratio — RENDERED LANDSCAPE, crop before publishing to a portrait placement" },
          { params: {}, note: "duration not accepted by this model — rendered at its default length" },
        ];
        for (const step of fallbacks) {
          const retry = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning?key=${key}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ instances: [{ prompt }], ...(Object.keys(step.params).length ? { parameters: step.params } : {}) }),
          });
          if (retry.ok) {
            const d = await retry.json().catch(() => null);
            if (typeof d?.name === "string") return { ref: d.name, status: 200, reason: step.note };
          }
        }
      }
      return { status: res.status, reason };
    }
    const data = await res.json().catch(() => null);
    return typeof data?.name === "string" ? { ref: data.name, status: 200 } : { status: 200, reason: "no operation handle" };
  } catch (e) { return { status: 0, reason: e instanceof Error ? e.message : "network error" }; }
}

async function veoStart(prompt: string, seconds: number, gen: GenParams): Promise<StartResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { error: "No GEMINI_API_KEY set", status: -1, body: "missing api key" };
  const ordered = [process.env.GEMINI_VIDEO_MODEL, workingVeoModel, ...VEO_CANDIDATES]
    .filter((m): m is string => Boolean(m))
    .filter((m, i, a) => a.indexOf(m) === i);
  let lastErr = "";
  for (const model of ordered) {
    const r = await veoTry(model, prompt, key, seconds, gen);
    if (r.ref) { workingVeoModel = model; return { ref: r.ref, model, note: r.reason }; }
    // 404 / 400 = wrong-or-unavailable model → try the next candidate.
    if (r.status === 404 || r.status === 400) { lastErr = `${model}: ${r.status} ${r.reason || ""}`.trim(); continue; }
    // 401/403/429/5xx are key/quota/server issues — stop and report (not a model problem).
    return { error: `Veo API ${r.status} (model ${model})${r.reason ? ` — ${r.reason}` : ""}`, status: r.status, body: r.reason || "" };
  }
  return {
    error: `No usable Veo model for your key. Tried ${ordered.join(", ")}. Last: ${lastErr}.`,
    status: 404, body: `model_not_found: ${lastErr}`,
  };
}
// Dig the video out of Veo's long-running-operation response. Google has shipped
// several response shapes across model versions, and the clip may be a fetchable
// URI OR inline base64 — handle them all so a finished render actually yields bytes.
function extractVeoVideo(resp: unknown): { uri?: string; b64?: string } {
  const r = (resp || {}) as Record<string, unknown>;
  const paths: unknown[] = [
    (r.generateVideoResponse as Record<string, unknown> | undefined)?.generatedSamples,
    (r.generateVideoResponse as Record<string, unknown> | undefined)?.videos,
    r.generatedVideos, r.generatedSamples, r.videos, r.samples,
  ];
  for (const arr of paths) {
    const first = Array.isArray(arr) ? (arr[0] as Record<string, unknown> | undefined) : undefined;
    if (!first) continue;
    const video = (first.video as Record<string, unknown> | undefined) ?? first;
    const uri = video?.uri ?? video?.videoUri ?? first.uri;
    const b64 = video?.bytesBase64Encoded ?? first.bytesBase64Encoded ?? video?.videoBytes;
    if (typeof b64 === "string" && b64) return { b64 };
    if (typeof uri === "string" && uri) return { uri };
  }
  return {};
}

async function veoPoll(op: string): Promise<{ done: boolean; bytes?: Buffer; diag?: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { done: false };
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${op}?key=${key}`);
    if (!res.ok) return { done: false };
    const data = await res.json().catch(() => null);
    if (!data?.done) return { done: false };
    // A finished operation can carry an error (safety block, quota, etc.) instead
    // of a video — surface it verbatim so the real cause is visible.
    if (data.error) return { done: true, diag: `Veo operation error: ${safeReason(JSON.stringify(data.error))}` };
    const { uri, b64 } = extractVeoVideo(data.response);
    if (b64) {
      const buf = Buffer.from(b64, "base64");
      return buf.length >= 2048 ? { done: true, bytes: buf } : { done: true, diag: `Inline video was only ${buf.length} bytes.` };
    }
    if (uri) {
      // Veo returns a Files-API URI; authenticate with BOTH the query key and the
      // header (Google accepts either), and request the media bytes.
      const dl = uri.includes("key=") ? uri : `${uri}${uri.includes("?") ? "&" : "?"}alt=media&key=${key}`;
      const v = await fetch(dl, { headers: { "x-goog-api-key": key } });
      if (v.ok) {
        const buf = Buffer.from(await v.arrayBuffer());
        return buf.length >= 2048 ? { done: true, bytes: buf } : { done: true, diag: `Downloaded only ${buf.length} bytes from the video URI (not a full video).` };
      }
      const body = safeReason(await v.text().catch(() => ""));
      return { done: true, diag: `Video URI download failed: HTTP ${v.status}${body ? ` — ${body}` : ""}.` };
    }
    // No video field found — report the actual response shape so it can be mapped.
    const keys = Object.keys((data.response as Record<string, unknown>) || {});
    const inner = keys.length ? keys.map((k) => { const v = (data.response as Record<string, unknown>)[k]; return `${k}:${Array.isArray(v) ? `[${v.length}]` : typeof v}`; }).join(", ") : "(empty response)";
    return { done: true, diag: `Veo returned no recognisable video field. Response shape: { ${inner} }.` };
  } catch (e) { return { done: false, diag: e instanceof Error ? e.message : "poll error" }; }
}
const SORA_SIZE: Record<Aspect, string> = { "16:9": "1280x720", "9:16": "720x1280", "1:1": "720x720" };

async function soraStart(prompt: string, seconds: number, gen: GenParams): Promise<StartResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { error: "No OPENAI_API_KEY set", status: -1, body: "missing api key" };
  const model = process.env.OPENAI_VIDEO_MODEL || "sora-2";
  try {
    const res = await fetch("https://api.openai.com/v1/videos", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      // Sora takes `seconds` as a string enum. Same rule as Veo: if it is
      // rejected, retry without it rather than losing the render.
      // Sora takes the shape as a pixel SIZE rather than a ratio. Same reason as
      // Veo above: without it a portrait placement comes back landscape.
      body: JSON.stringify({ model, prompt, seconds: String(seconds), size: SORA_SIZE[gen.aspect] }),
    });
    if (!res.ok) {
      const body = safeReason(await res.text().catch(() => ""));
      if (res.status === 400) {
        // Keep the shape if the duration is what was rejected — dropping both to
        // satisfy one hands back a landscape clip for a portrait placement.
        for (const body of [
          { model, prompt, size: SORA_SIZE[gen.aspect] },
          { model, prompt },
        ]) {
          const retry = await fetch("https://api.openai.com/v1/videos", {
            method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (retry.ok) {
            const d = await retry.json().catch(() => null);
            if (typeof d?.id === "string") return { ref: d.id, model, note: "this model rejected part of the request — see the shape and length actually used" };
          }
        }
      }
      return { error: `Sora API ${res.status} (model ${model})${body ? ` — ${body}` : ""}`, status: res.status, body };
    }
    const data = await res.json().catch(() => null);
    return typeof data?.id === "string" ? { ref: data.id, model } : { error: "Sora returned no video id", status: 200, body: "no video id in the response" };
  } catch (e) { return { error: `Sora request failed: ${e instanceof Error ? e.message : "network error"}`, status: 0, body: e instanceof Error ? e.message : "network error" }; }
}
async function soraPoll(id: string): Promise<{ done: boolean; bytes?: Buffer }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { done: false };
  try {
    const res = await fetch(`https://api.openai.com/v1/videos/${id}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) return { done: false };
    const data = await res.json().catch(() => null);
    if (data?.status !== "completed") return { done: false };
    const content = await fetch(`https://api.openai.com/v1/videos/${id}/content`, { headers: { Authorization: `Bearer ${key}` } });
    if (content.ok) return { done: true, bytes: Buffer.from(await content.arrayBuffer()) };
    return { done: true };
  } catch { return { done: false }; }
}

// ---------------------------------------------------------------------------
// Public API — start + poll.
// ---------------------------------------------------------------------------
/**
 * THE CUSTOMER'S BRAND, IN THE PROMPT.
 *
 * OWNER'S DIRECTIVE: "VIDEO CREATION AND EVERYTHING ELSE MUST BE BRANDED PER
 * THE CUSTOMER BRAND ON LOGO AND COLOURS, NOT A VERY RANDOM COLOUR AND LOGO."
 *
 * The ad canvas and the ad styles have read `logoUrl` and `brandColours` for
 * months. The video gateway never did: it forwarded the raw prompt and nothing
 * else, so every render invented its own palette and put a made-up mark on the
 * screen. A brand kit that half the platform honours is not a brand kit.
 *
 * A generative video model takes no image input here, so the brand travels as
 * DIRECTION rather than as an asset: the exact hexes, the business, and an
 * explicit instruction to leave space for the real logo instead of inventing
 * one — a fabricated mark is worse than none, because it has to be removed
 * before the clip can be used and the customer paid for the frames it sits in.
 *
 * Everything is conditional. A brand with no colours set adds no colour line,
 * because an instruction naming no colour is noise the model will fill in.
 */
export function brandedVideoPrompt(prompt: string, brand: { name?: string; product?: string; brandColours?: string[]; logoUrl?: string } | null): string {
  if (!brand) return prompt;
  const lines: string[] = [prompt];
  const colours = (brand.brandColours || []).filter((c) => /^#?[0-9a-f]{3,8}$/i.test(String(c).trim())).slice(0, 4);
  if (colours.length) {
    lines.push(`BRAND COLOURS — grade and art-direct to these exact colours, and use no competing accent: ${colours.join(", ")}.`);
  }
  if (brand.name) {
    lines.push(`This is for ${brand.name}${brand.product ? `, whose product is ${brand.product}` : ""}. Keep the look consistent with that business throughout.`);
  }
  if (brand.logoUrl) {
    // NEVER ask a model to draw somebody's logo. It will approximate it, and an
    // approximated logo is a legal and brand problem wearing the customer's name.
    lines.push("Do NOT draw, letter or invent any logo, wordmark or brand name in the frame. Leave a clean, uncluttered area in a lower corner where the real logo is placed afterwards.");
  } else {
    lines.push("Do NOT invent a logo, wordmark or company name in the frame.");
  }
  return lines.join("\n\n");
}

export async function startVideoRender(input: {
  brandId: string; prompt: string; seconds?: number;
  /** Where the clip is going. 16:9 is assumed and SAID when omitted. */
  aspect?: string;
  resolution?: string;
  /** Who asked. Staff are not billed for their own platform; see spendAcus. */
  spender?: Spender | null;
}): Promise<VideoJob> {
  const brandId = input.brandId?.trim() || "brand";
  const askedPrompt = input.prompt?.trim() || "Product highlight video";
  // The brand is loaded, never assumed. A lookup that fails leaves the prompt
  // exactly as the customer typed it rather than half-branding the render.
  const brand = await getBrandById(brandId).catch(() => null);
  const prompt = brandedVideoPrompt(askedPrompt, brand);
  const requestedSeconds = Math.max(1, Math.round(Number(input.seconds) || DEFAULT_SECONDS));
  const jobId = jobIdFor(brandId, prompt);

  // WILL THIS COME BACK RIGHT? — asked before anything is charged.
  //
  // The brief is reviewed on what the CUSTOMER asked for, not on the branded
  // prompt: the brand block adds sentences of its own, and counting those as
  // actions would refuse every branded render for having too much happening.
  //
  // A refusal here is the cheapest possible outcome. Words in the frame come
  // back garbled at every quality tier, and three actions in four seconds lose
  // two of them — both produce a clip that looks like a successful render and
  // has to be thrown away. Saying so now costs nothing; finding out costs a
  // render, a wait, and the customer's confidence in the next one.
  const brief = reviewBrief({
    prompt: askedPrompt, seconds: requestedSeconds,
    aspect: input.aspect, resolution: input.resolution,
  });
  const gen = { aspect: brief.aspect, resolution: brief.resolution, negativePrompt: brief.negativePrompt };
  if (!brief.ok) {
    const job: VideoJob = { jobId, brandId, prompt, provider: "demo", status: "failed", mode: "live", videoUrl: null, providerRef: null,
      requestedSeconds, seconds: 0, chargedAcu: 0,
      note: `Not rendered, and nothing was charged — this brief would have come back wrong. ${briefRefusal(brief)}` };
    await saveJob(job);
    return job;
  }

  // Provider chain with automatic failover (like the AI gateway): try Veo, then
  // Sora — so if one provider's model is unavailable (404) or its quota is spent,
  // the render still goes through on the other. Falls back to demo only when no
  // key is set at all.
  const chain: VideoProvider[] = [];
  if (process.env.GEMINI_API_KEY) chain.push("veo");
  if (process.env.OPENAI_API_KEY) chain.push("sora");

  if (chain.length === 0) {
    const job: VideoJob = { jobId, brandId, prompt, provider: "demo", status: "demo", mode: "demo", videoUrl: null, providerRef: null,
      requestedSeconds, seconds: requestedSeconds,
      note: "Demo — video render activates with a Veo (GEMINI_API_KEY) or Sora (OPENAI_API_KEY) key. The pipeline, job model and post-attach are wired; only the render engine is gated." };
    await saveJob(job);
    return job;
  }

  // THE QUOTE IS THE PRICE. Never more, whatever the failover does.
  //
  // This used to debit the WORST case across the chain, on the reasoning that
  // failover makes the serving provider unknown. The panel, meanwhile, quoted
  // the chosen provider's price. With both keys set those are different numbers:
  // Veo caps a 15s request at 8s (281 ACUs), Sora snaps it to 12s (420), so the
  // screen said 281 and the wallet was asked for 420. A quote and a charge that
  // disagree is the one thing a price on a button may never do.
  //
  // So the quote is computed once, from the provider that will actually be
  // tried first, and it is both what is shown and what is taken. Failover can
  // then only ever deliver LESS — every provider is capped to the length that
  // was quoted for — and if it does, the difference is refunded. The customer
  // cannot be surprised upward.
  // THE PLAN IS THE PRODUCT. `bestVideoProviderFor` picks the cheapest engine
  // that makes this length EXACTLY, and returns the clips it will be made from.
  // With no plan on any configured engine the length is not sold — which cannot
  // happen from the panel, because the menu is built from the same function.
  const plans = videoPlansFor(requestedSeconds, chain);
  const plan = plans[0] ?? null;
  if (!plan) {
    const job: VideoJob = { jobId, brandId, prompt, provider: chain[0], status: "failed", mode: "live", videoUrl: null, providerRef: null,
      requestedSeconds, seconds: 0, chargedAcu: 0,
      note: `No configured engine makes exactly ${requestedSeconds} seconds. Pick a length from the list — each one there is a length that can actually be produced.` };
    await saveJob(job);
    return job;
  }
  const quotedSeconds = requestedSeconds;
  const quotedAcu = plan.acus;
  // The OWNING ACCOUNT's wallet, not the brand id — see walletIdForBrand.
  const walletId = await walletIdForBrand(brandId);
  const debit = await spendAcus(input.spender ?? null, walletId, quotedAcu, { agent: "video-gateway", kind: "video" });
  if (!debit.ok) {
    const job: VideoJob = { jobId, brandId, prompt, provider: chain[0], status: "failed", mode: "live", videoUrl: null, providerRef: null,
      requestedSeconds, seconds: 0, chargedAcu: 0,
      note: `Not enough ACUs — this render costs ${quotedAcu} ACUs and your balance is ${debit.balanceAcu}. Top up on Billing. Nothing was rendered and nothing was taken.` };
    await saveJob(job);
    return job;
  }
  // WHAT WAS TAKEN, not what was quoted. Every refund path below reads
  // `chargedAcu`, and refunding a quote to a wallet that was never debited
  // would mint ACUs — the same defect as charging for a call that never ran,
  // pointed the other way.
  const takenAcu = debit.charged;

  // EVERY CLIP, OR NONE.
  //
  // A fifteen-second ad whose second clip never started is an eight-second ad
  // charged at fifteen, which is the exact fault this whole change exists to
  // remove. So a segment that will not start abandons the render and refunds
  // the lot: partial delivery of something sold as one video is not a lesser
  // success, it is a failure with the customer's money still in our account.
  // NOW THE CHAIN IS ACTUALLY A CHAIN.
  //
  // Every plan is tried in turn, and two rules decide whether the next one is:
  //
  //   • THE QUOTE IS THE CEILING, AND THERE IS NO HEADROOM TO BEND IT. A plan
  //     costing more than what was quoted and taken is never run. Two reasons,
  //     and the second is the one that settles it: the customer must never be
  //     surprised upward, AND video is priced at VIDEO_MARKUP = 2, the owner's
  //     hard floor. Absorbing the difference — charging Sora's 420 to render a
  //     Veo plan priced 422 — would put that render at 1.99x its provider cost,
  //     under the floor. There is nothing to absorb with, so the answer is to
  //     refund and NAME the alternative with its price, and let the customer
  //     decide whether to buy it. Silently spending more of their money, or
  //     silently losing ours, are both worse than saying so.
  //
  //   • A REFUSED PROMPT ENDS IT. Content decisions are the same at every
  //     engine, so retrying spends a second supplier's quota to be told no
  //     twice. `tryAnotherProvider` is what separates the two.
  //
  // The failure this was built from was an empty OpenAI account with Sora as
  // the cheapest plan — exactly the case a second supplier answers, and the
  // case the old code abandoned the whole render on.
  const failures: { provider: VideoProvider; failure: ProviderFailure }[] = [];
  const tooDear: { provider: VideoProvider; acus: number }[] = [];
  let started: { seconds: number; ref: string | null; url: string | null }[] = [];
  let used: typeof plan | null = null;
  let promptRefused = false;
  let renderedBy = "";
  const stepDowns: string[] = [];

  for (const attempt of plans) {
    if (attempt.acus > quotedAcu) { tooDear.push({ provider: attempt.provider, acus: attempt.acus }); continue; }
    started = [];
    renderedBy = "";
    stepDowns.length = 0;
    let failed: ProviderFailure | null = null;
    for (const seconds of attempt.segments) {
      const r = attempt.provider === "veo" ? await veoStart(prompt, seconds, gen) : await soraStart(prompt, seconds, gen);
      if ("ref" in r) {
        started.push({ seconds, ref: r.ref, url: null });
        if (r.model) renderedBy = r.model;
        if (r.note) stepDowns.push(r.note);
        continue;
      }
      failed = readProviderFailure({ provider: attempt.provider, status: r.status, body: r.body || r.error });
      break;
    }
    if (!failed && started.length === attempt.segments.length) { used = attempt; break; }
    if (failed) {
      failures.push({ provider: attempt.provider, failure: failed });
      if (!failed.tryAnotherProvider) { promptRefused = true; break; }
    }
  }

  if (used) {
    const multi = used.segments.length > 1;
    const alsoTried = failures.length
      ? ` ${failures.map((f) => `${f.provider} could not: ${f.failure.why}`).join(" ")}`
      : "";
    const job: VideoJob = {
      jobId, brandId, prompt, provider: used.provider, status: "rendering", mode: "live", videoUrl: null,
      // Kept for every reader written before segments existed.
      providerRef: started[0].ref,
      segments: started,
      requestedSeconds, seconds: requestedSeconds, chargedAcu: takenAcu,
      // WHAT MADE IT, AND AT WHAT SHAPE. A render you cannot attribute is a
      // render you cannot judge: "is this the tier I pinned?" is the first
      // question, and a model that was unavailable fails over in silence
      // otherwise. Anything the model refused to honour is named too — a clip
      // rendered landscape because the model ignored the aspect ratio is wrong
      // for a portrait placement, and the job should say so rather than let it
      // be discovered on the timeline.
      note: `Rendering ${requestedSeconds}s at ${brief.aspect} ${brief.resolution} via ${renderedBy || used.provider}${multi ? ` as ${used.segments.length} clips (${used.segments.map((n) => `${n}s`).join(" + ")})` : ""} — ${takenAcu > 0 ? `${takenAcu} ACUs` : "not charged (staff)"}. Poll for the hosted MP4 (renders take up to a few minutes).${stepDowns.length ? ` NOTE: ${[...new Set(stepDowns)].join(" ")}` : ""}${alsoTried}`,
    };
    await saveJob(job);
    return job;
  }

  // Nothing usable started, so nothing is owed — but only what was actually
  // taken comes back.
  if (takenAcu > 0) await creditAcus(walletId, takenAcu);

  // EVERY REASON, WITH ITS OWN REMEDY.
  //
  // The sentence this replaces was fixed: "Confirm your Veo/Sora model access,
  // or set GEMINI_VIDEO_MODEL / OPENAI_VIDEO_MODEL to a model your account can
  // use." It named both engines whether or not either was configured, and it
  // named the one thing that could not have been wrong — the provider had just
  // said, in the same message, that the account had no credit.
  const reasons = failures.map((f) => `${f.provider}: ${failureLine(f.failure)}`).join(" ");
  const alternatives = tooDear.length
    ? ` ${tooDear.map((t) => `${t.provider} could make it for ${t.acus} ACUs, which is more than the ${quotedAcu} you were quoted, so it was not run without asking you`).join("; ")}.`
    : "";
  const nothingElse = !promptRefused && failures.length > 0 && tooDear.length === 0 && plans.length === failures.length
    ? " No other configured engine makes this length, so there was nothing to fall back to."
    : "";
  const job: VideoJob = { jobId, brandId, prompt, provider: (failures[0]?.provider ?? plan.provider), status: "failed", mode: "live", videoUrl: null, providerRef: null,
    requestedSeconds, seconds: 0, chargedAcu: 0,
    note: `This ${requestedSeconds}s render did not start, so nothing was kept${takenAcu > 0 ? ` and the ${takenAcu} ACUs are back in your wallet` : " and nothing was charged"}. ${reasons}${alternatives}${nothingElse}`.trim() };
  await saveJob(job);
  return job;
}

export async function getVideoRender(jobId: string): Promise<VideoJob | { error: string }> {
  const job = await loadJob(jobId);
  if (!job) return { error: "Unknown render job" };
  if (job.status !== "rendering" || !job.providerRef) return job; // demo/ready/failed are terminal here

  // A MULTI-CLIP RENDER FINISHES WHEN EVERY CLIP DOES.
  //
  // Jobs written before segments existed have no `segments` array and fall
  // straight through to the single-clip path below, unchanged.
  if (job.segments && job.segments.length > 1) return await pollSegments(job);

  const poll = job.provider === "veo" ? await veoPoll(job.providerRef) : await soraPoll(job.providerRef);
  if (!poll.done) return job; // still rendering

  // A real MP4 is never a few bytes — guard against an empty/placeholder blob
  // being hosted as a "video" (which shows as a blank player).
  const realVideo = Boolean(poll.bytes && poll.bytes.length >= 2048);

  // Completed — upload the MP4 to Storage so it has a hosted, attachable URL.
  if (realVideo && storageConfigured()) {
    const url = await uploadPublicMedia(poll.bytes!, { contentType: "video/mp4", ext: "mp4", keyPrefix: "videos", nameSeed: `${job.brandId}|${job.prompt}` });
    if (url) {
      job.status = "ready"; job.videoUrl = url; job.clips = [url];
      // FILED BEFORE IT IS CALLED READY. The panel's React state used to be the
      // only place a paid render existed; one refresh and it was gone.
      const filed = await fileInLibrary(job, [url]);
      job.note = filed
        ? `Rendered — hosted MP4 (${Math.round(poll.bytes!.length / 1024)} KB), saved to your library.`
        : `Rendered — hosted MP4 (${Math.round(poll.bytes!.length / 1024)} KB). It could not be filed in your library, so copy this link before you close the tab: ${url}`;
      await saveJob(job); return job;
    }
  }
  // Rendered but no Storage to host it (or no usable bytes) — honest terminal
  // state, now with the real diagnostic instead of a vague message.
  job.status = realVideo ? "failed" : "ready";
  if (realVideo) {
    job.note = "Rendered, but the hosted upload didn't return a URL — check Firebase Storage (bucket + admin creds). Probe /api/health/storage for a green/red readout.";
  } else {
    job.note = `Render finished but no video came back. ${(poll as { diag?: string }).diag || "The provider returned no downloadable asset."} Send me this line and I'll map it exactly.`;
  }
  await saveJob(job);
  return job;
}

/**
 * PUT THE FINISHED VIDEO IN THE CUSTOMER'S LIBRARY.
 *
 * THE FAULT THIS FIXES, reported by the owner: "big money spent generated a 12
 * second video which is not autosave to the work library and not possible to
 * download as the download MP4 give you a firebase link then all GONE."
 *
 * All of it true. Nothing anywhere called `saveWork` for a video — only the
 * agent and content routes ever did — so the ONLY record of a paid render was
 * the render job, and the only thing displaying it was React state in the
 * panel. Refresh the tab and a render the customer had paid for was gone from
 * every surface they could reach. The MP4 itself was still sitting in Storage
 * on a permanent URL, which somehow makes it worse: the asset existed and the
 * platform had thrown away the only pointer to it.
 *
 * This is the one action in the platform where a lost artifact is money
 * already taken. It is saved BEFORE the job is reported ready, and a failed
 * save downgrades the note rather than the video: the customer is told where
 * their file is either way.
 */
async function fileInLibrary(job: VideoJob, urls: string[]): Promise<boolean> {
  try {
    const r = await saveWork({
      brandId: job.brandId,
      ownerId: null,
      kind: "video",
      source: "video-creator",
      sourceName: "AI Video Creator",
      // The title is what the customer typed, not the brand-expanded prompt —
      // a library full of colour hexes is a library nobody can scan.
      title: (job.prompt.split("\n")[0] || "").slice(0, 80) || `${job.requestedSeconds || job.seconds || 0}s video`,
      // The deliverable is the URL(s). One per line, in order, so a multi-clip
      // render reads as what it is and every clip is reachable.
      output: urls.join("\n"),
      input: {
        prompt: job.prompt,
        seconds: String(job.requestedSeconds ?? job.seconds ?? ""),
        engine: job.provider,
        acus: String(job.chargedAcu ?? 0),
        clips: String(urls.length),
        jobId: job.jobId,
      },
    }, new Date().toISOString());
    return r.ok && r.persisted;
  } catch {
    return false;   // never lose the video over a failed filing
  }
}

/**
 * Poll a render made of several clips.
 *
 * Each clip is polled once per call and uploaded the moment it lands, so a slow
 * clip never makes us re-download a fast one. The job only becomes ready when
 * EVERY clip has a hosted URL — a partial set is still "rendering", never a
 * short video presented as the one that was bought.
 */
async function pollSegments(job: VideoJob): Promise<VideoJob> {
  const segs = job.segments!;
  let changed = false;

  for (const seg of segs) {
    if (seg.url || !seg.ref) continue;
    const poll = job.provider === "veo" ? await veoPoll(seg.ref) : await soraPoll(seg.ref);
    if (!poll.done) continue;
    // A real MP4 is never a few bytes — the same guard the single-clip path
    // uses against an empty blob being hosted as a video.
    if (!(poll.bytes && poll.bytes.length >= 2048)) {
      job.status = "failed";
      job.note = `One clip of this ${job.requestedSeconds}s render finished with no usable video, so the finished video would be short — it is reported as failed rather than handed over incomplete. ${(poll as { diag?: string }).diag || ""}`.trim();
      await saveJob(job);
      return job;
    }
    if (!storageConfigured()) continue;   // nothing to host it with yet
    const url = await uploadPublicMedia(poll.bytes, { contentType: "video/mp4", ext: "mp4", keyPrefix: "videos", nameSeed: `${job.brandId}|${job.prompt}|${seg.seconds}|${seg.ref}` });
    if (url) { seg.url = url; changed = true; }
  }

  const done = segs.every((x) => Boolean(x.url));
  if (!done) {
    if (changed) {
      job.note = `Rendering ${job.requestedSeconds}s — ${segs.filter((x) => x.url).length} of ${segs.length} clips done.`;
      await saveJob(job);
    }
    return job;
  }

  job.clips = segs.map((x) => x.url!);

  // ONE FILE. NOT "READY" UNTIL IT EXISTS.
  //
  // Owner's directive: 12 and 15 seconds arrive as one clip. The first version
  // of this fired the join and immediately called the job ready with
  // `videoUrl = clips[0]` — an eight-second clip presented as the fifteen
  // seconds that was paid for. That is the same defect as every other one on
  // this page, committed while fixing it.
  //
  // So the join is a stage with a beginning and an end: submitted here, polled
  // on the next call, and only when the joined MP4 is hosted does the job
  // become ready. Until then it is still rendering, which is the truth.
  if (!ffmpegCloudConfigured()) {
    // Unreachable from the panel — the menu withholds any length that needs a
    // join it cannot do. Kept because an API caller can still ask directly, and
    // a half-delivered fifteen seconds must never be the answer.
    job.status = "failed";
    job.note = `This ${job.requestedSeconds}s video is ${segs.length} clips that have to be joined into one file, and no join service is configured (FFMPEG_CLOUD_API_KEY). The clips rendered: ${job.clips.join(" ")}`;
    await saveJob(job);
    return job;
  }

  if (!job.stitchRef) {
    const stitched = await createTranscode({ inputUrls: job.clips, outputFormat: "mp4" });
    if (!stitched.ok) {
      job.status = "failed";
      job.note = `Rendered ${job.requestedSeconds}s as ${segs.length} clips but joining them failed — ${stitched.error}. The clips are here: ${job.clips.join(" ")}`;
      await saveJob(job);
      return job;
    }
    job.stitchRef = stitched.job.id;
    job.note = `All ${segs.length} clips rendered — joining them into one ${job.requestedSeconds}s file.`;
    await saveJob(job);
    return job;
  }

  const status = await getTranscode(job.stitchRef);
  if (!status.ok) return job;                       // transient — try again next poll
  const state = toQueueStatus(status.job.status);
  if (state === "queued" || state === "running") return job;
  if (state === "failed") {
    job.status = "failed";
    job.note = `The ${job.requestedSeconds}s clips rendered but the join failed. The clips are here: ${job.clips.join(" ")}`;
    await saveJob(job);
    return job;
  }

  const dl = await getDownloadUrl(job.stitchRef);
  if (!dl.ok) return job;                           // joined, link not ready yet

  // THE JOIN SERVICE'S URL EXPIRES IN TEN MINUTES (SIGNED_URL_TTL_SEC).
  //
  // Handing it over as the deliverable would have recreated the exact fault the
  // owner reported — "the download MP4 give you a firebase link then all GONE"
  // — with a shorter fuse. The joined file is pulled down and re-hosted on our
  // own permanent Storage URL, like every single-clip render already is.
  const got = await fetch(dl.url).catch(() => null);
  const bytes = got && got.ok ? Buffer.from(await got.arrayBuffer()) : null;
  if (!bytes || bytes.length < 2048) return job;    // transient — try again next poll

  // AND IT MUST BE THE LENGTH THAT WAS ORDERED.
  //
  // The service replies with an id and a status and nothing else — no duration,
  // no track list. So "the join succeeded" was the only evidence a fifteen-
  // second file existed, and the customer had already paid for fifteen seconds.
  // The file itself is the only witness that cannot be wrong, so it is read.
  // A short result means the join produced one clip rather than all of them:
  // that is a failure, refunded, with the clips still listed.
  const ordered = job.requestedSeconds ?? job.seconds ?? 0;
  const measured = mp4Duration(bytes);
  if (ordered > 0 && !durationMatches(measured, ordered)) {
    const walletId = await walletIdForBrand(job.brandId);
    if (job.chargedAcu) await creditAcus(walletId, job.chargedAcu);
    job.status = "failed";
    job.chargedAcu = 0;
    job.note = `The clips rendered but the joined file is ${measured?.toFixed(1)}s, not the ${ordered}s you ordered — so it has not been handed over and the ACUs are back in your wallet. The individual clips are here: ${(job.clips || []).join(" ")}`;
    await saveJob(job);
    return job;
  }

  const hosted = await uploadPublicMedia(bytes, { contentType: "video/mp4", ext: "mp4", keyPrefix: "videos", nameSeed: `${job.brandId}|${job.prompt}|joined|${job.stitchRef}` });
  if (!hosted) return job;                          // Storage hiccup — try again next poll
  job.videoUrl = hosted;
  job.status = "ready";
  const filed = await fileInLibrary(job, [hosted]);
  const length = measured ? `${measured.toFixed(1)}s` : `${ordered}s`;
  job.note = filed
    ? `Rendered ${length} as one file (joined from ${segs.length} clips), saved to your library.`
    : `Rendered ${length} as one file (joined from ${segs.length} clips). It could not be filed in your library, so copy this link before you close the tab: ${hosted}`;
  await saveJob(job);
  return job;
}

/**
 * Lengths this deployment could plan but cannot hand over as ONE file.
 *
 * Named rather than silently dropped: a menu that quietly loses fifteen seconds
 * reads as a bug, and the owner is owed the one setting that brings it back.
 */
export function withheldLengths(): { seconds: number; segments: number[]; why: string }[] {
  if (ffmpegCloudConfigured()) return [];
  const out: { seconds: number; segments: number[]; why: string }[] = [];
  for (const seconds of OFFERED_SECONDS) {
    const best = bestVideoProviderFor(seconds);
    if (!best || best.segments.length === 1) continue;
    out.push({
      seconds, segments: best.segments,
      why: `No engine renders ${seconds} seconds in one call, so it is ${best.segments.map((n) => `${n}s`).join(" + ")} joined into one file. Set FFMPEG_CLOUD_API_KEY and this length is available.`,
    });
  }
  return out;
}

export function videoGatewayStatus() {
  return {
    configured: videoGatewayConfigured(),
    provider: chosenProvider(),
    async: true,
    // The price list, so the panel shows what a length costs BEFORE the click
    // and never does the arithmetic itself — a price computed in the browser is
    // a second source of truth about money.
    lengths: videoLengthOptions(),
    // THE DEFAULT MUST BE A ROW ON THE MENU. DEFAULT_RENDER_SECONDS is 15 —
    // the length a social ad is cut to — and the menu now lists only lengths
    // this engine actually produces, so on Veo there is no 15-second row to
    // select. An unmatched default leaves the panel with no price beside a
    // button that spends money. Resolved to what this provider delivers, which
    // is by construction one of the rows.
    defaultSeconds: supportedSeconds(chosenProvider(), DEFAULT_RENDER_SECONDS),
    maxSingleRenderSeconds: maxSingleRender(),
    withheld: withheldLengths(),
    note: videoGatewayConfigured()
      ? "Live — renders via Veo/Sora, uploads the MP4 to Storage, and returns a hosted URL to attach to posts."
      : "Demo — the render pipeline, async job model and post-attach are wired; the render engine activates with a Veo (GEMINI_API_KEY) or Sora (OPENAI_API_KEY) key.",
  };
}
