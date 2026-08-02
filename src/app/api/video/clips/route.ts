import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio, transcriptionConfigured, MAX_AUDIO_BYTES, type Segment } from "@/backend/transcribe";
import { findClips, srtForClip } from "@/backend/clip-finder";
import { detectGenre, scoreClip, reframeSpec } from "@/backend/video-intelligence";
import { enqueueVideoJob, renderingAvailable } from "@/backend/video-jobs";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { meterAction, creditAcus } from "@/backend/wallet";
import { resolveBrandAccess } from "@/backend/brand-access";
import { classifyMediaUrl, isMediaContentType } from "@/shared/media-url";

// One long video in, cut clips out — the thing the Clip Lab could not do.
//
// The Lab could RANK moments and score them across eight commercial
// dimensions, but only ones a customer typed in by hand: they had to watch
// their own two-hour recording, note the timestamps of the good bits, and enter
// them — which is the job they came here for. Nothing in the platform ever read
// a video and found a moment in it.
//
// POST multipart (field "file")  → transcribe, find clips
// POST json { url }              → same, for hosted media
//   options: minSec, maxSec, limit, title, render:true + brandId
//
// What comes back is usable with no video worker at all: exact in/out
// timestamps, the quotable text, and a per-clip .srt already rebased to start
// at zero — which is what YouTube, LinkedIn, Meta and TikTok all accept on
// upload. With render:true and an FFmpeg worker configured it also queues the
// actual cuts, 9:16, on the existing job queue.
//
// MONEY ORDER, same as the captions route and for the same reason: every check
// that can fail runs BEFORE the wallet is touched, and a provider failure after
// the charge refunds it. A customer must never pay for clips they did not get.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Transcription of a 25MB file plus the sweep over its sentences. The default
// ~10s would kill this mid-flight, after the debit and with no code left alive
// to refund it.
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "video-clips"), 20, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const ctype = req.headers.get("content-type") || "";
  let bytes: ArrayBuffer | null = null;
  let filename = "video.mp4";
  let title = "";
  let language: string | undefined;
  let minSec = 15, maxSec = 75, limit = 10;
  let wantRender = false;
  let brandId = "";
  // Kept from the parse so the render job knows what to cut. The body is a
  // stream and can only be read once — re-reading it returns nothing.
  let sourceUrl = "";
  // A caller who already has a transcript (from /api/video/captions) can skip
  // the provider entirely — same clips, no second charge for the same audio.
  let segments: Segment[] | null = null;

  const num = (v: unknown, d: number, lo: number, hi: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
  };

  try {
    if (ctype.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "Attach a video or audio file in the 'file' field." }, { status: 400 });
      if (file.size > MAX_AUDIO_BYTES) {
        return NextResponse.json({ error: `File is ${(file.size / 1048576).toFixed(1)}MB — the limit is 25MB. Export audio-only, or trim it first.` }, { status: 400 });
      }
      bytes = await file.arrayBuffer();
      filename = file.name || filename;
      title = (form.get("title") as string) || "";
      language = (form.get("language") as string) || undefined;
      minSec = num(form.get("minSec"), minSec, 5, 300);
      maxSec = num(form.get("maxSec"), maxSec, 10, 600);
      limit = num(form.get("limit"), limit, 1, 30);
    } else {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      title = typeof body.title === "string" ? body.title : "";
      language = typeof body.language === "string" ? body.language : undefined;
      minSec = num(body.minSec, minSec, 5, 300);
      maxSec = num(body.maxSec, maxSec, 10, 600);
      limit = num(body.limit, limit, 1, 30);
      wantRender = body.render === true;
      brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";

      if (typeof body.url === "string") sourceUrl = body.url.trim();
      if (Array.isArray(body.segments) && body.segments.length) {
        segments = (body.segments as unknown[])
          .map((s) => s as Record<string, unknown>)
          .filter((s) => Number.isFinite(Number(s.start)) && Number.isFinite(Number(s.end)) && typeof s.text === "string")
          .map((s) => ({ start: Number(s.start), end: Number(s.end), text: String(s.text) }));
        if (!segments.length) {
          return NextResponse.json({ error: "Those segments have no usable {start, end, text} entries." }, { status: 400 });
        }
      } else {
        const url = typeof body.url === "string" ? body.url.trim() : "";
        sourceUrl = url;
        if (!url) return NextResponse.json({ error: "Provide a hosted video/audio url, upload a file, or pass segments from a transcript you already have." }, { status: 400 });

        // A YouTube or Vimeo page link fetches HTML, and HTML handed to Whisper
        // comes back as "Unrecognized file format" — after the charge.
        const verdict = classifyMediaUrl(url);
        if (!verdict.usable) return NextResponse.json({ error: verdict.reason, urlKind: verdict.kind }, { status: 400 });

        const r = await fetch(url);
        if (!r.ok) return NextResponse.json({ error: `Couldn't fetch that media (HTTP ${r.status}).` }, { status: 400 });
        const served = r.headers.get("content-type") || "";
        if (!isMediaContentType(served)) {
          return NextResponse.json({
            error: `That link returned ${served.split(";")[0] || "a web page"}, not audio or video. Paste a direct link to the media file, or upload it instead.`,
            urlKind: "page",
          }, { status: 400 });
        }
        bytes = await r.arrayBuffer();
        if (bytes.byteLength > MAX_AUDIO_BYTES) {
          return NextResponse.json({ error: `That file is ${(bytes.byteLength / 1048576).toFixed(1)}MB — the limit is 25MB. Trim it first.` }, { status: 400 });
        }
        filename = url.split("/").pop()?.split("?")[0] || filename;
      }
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't read the media." }, { status: 400 });
  }

  if (maxSec <= minSec) {
    return NextResponse.json({ error: `maxSec (${maxSec}) must be greater than minSec (${minSec}).` }, { status: 400 });
  }
  // Rendering attributes work and spends a brand's ACUs, so ownership is
  // established before anything is charged — not after the clips exist.
  if (wantRender && brandId) {
    const access = await resolveBrandAccess(req, brandId);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  }

  // ---- transcript: either supplied, or bought -------------------------------
  let chargedAcu = 0;
  let language_ = language;
  let durationSec: number | undefined;

  if (!segments) {
    if (!transcriptionConfigured()) {
      return NextResponse.json({
        error: "Finding clips needs OPENAI_API_KEY (Whisper) to read the video's speech. Nothing here guesses where the good bits are — connect the key, or pass a transcript you already have as `segments`.",
      }, { status: 503 });
    }
    if (!bytes || bytes.byteLength === 0) {
      return NextResponse.json({ error: "That file is empty — there is no audio to read." }, { status: 400 });
    }

    // ---- only now does it cost anything ------------------------------------
    const meter = await meterAction(auth, "llm");
    if (!meter.allowed) return NextResponse.json({ error: meter.error }, { status: meter.status });
    chargedAcu = meter.charged ?? 0;

    const t = await transcribeAudio({ bytes, filename, language });
    if (!t.ok) {
      if (meter.metered && meter.charged && auth.uid) await creditAcus(auth.uid, meter.charged).catch(() => {});
      return NextResponse.json({ error: t.error, refundedAcu: meter.charged ?? 0 }, { status: 502 });
    }
    segments = t.segments;
    language_ = t.language;
    durationSec = t.durationSec;
  }

  const found = findClips(segments, { minSec, maxSec, limit });
  const genre = detectGenre({ title, transcript: segments.map((s) => s.text).join(" ").slice(0, 4000) });

  const clips = found.clips.map((c) => {
    const hook = c.signals.find((s) => s.name === "Hook")?.score;
    const cta = c.signals.find((s) => s.name === "Ask")?.score;
    const buying = c.signals.find((s) => s.name === "Buying signal")?.score;
    return {
      ...c,
      // Only measured signals are handed on. Hook strength was counted off
      // this clip's own opening line, and buyer intent off its commercial
      // vocabulary. Emotional intensity and reputation risk are NOT knowable
      // from a transcript — it records that someone said "worth every penny",
      // not how they said it or whether the claim behind it is defensible — so
      // they are left out, and the scorer reports the dimensions that need them
      // as unscored rather than inventing them.
      commercial: scoreClip({ clipId: c.id, hookStrength: hook, buyerIntent: buying, ctaPresent: (cta ?? 0) > 0 }),
      srt: srtForClip(segments!, c.startSec, c.endSec),
    };
  });

  // ---- optional: queue the actual cuts --------------------------------------
  const render = renderingAvailable();
  let renderJob: { queued: boolean; jobId?: string; error?: string } | null = null;
  if (wantRender) {
    if (!brandId) {
      renderJob = { queued: false, error: "Rendering needs a brandId — the clips are cut against that brand's wallet and land in its library." };
    } else if (!render.ok) {
      renderJob = { queued: false, error: "No render worker is configured, so the cuts were not queued on the server — and they do not need to be. Cut them in your browser from the Clip Finder screen: nothing is uploaded, nothing is queued, and there is no render bill. The queue is only worth configuring for unattended batches; it needs either worker/ running on your own Google Cloud (VIDEO_WORKER_SECRET, no new supplier) or the hosted FFMPEG_CLOUD_API_KEY, which is one." };
    } else if (!clips.length) {
      renderJob = { queued: false, error: "Nothing to render — no clip fitted the length range." };
    } else if (!sourceUrl) {
      // A file upload gives us bytes, not a URL the worker can fetch. Saying so
      // beats queueing a job that can only fail after taking the ACUs.
      renderJob = { queued: false, error: "Rendering needs a hosted video URL the worker can fetch — an uploaded file only exists for this request. Upload the video to your library first, then send its url." };
    } else {
      const job = await enqueueVideoJob({
        brandId, kind: "clips", sourceUrl,
        params: { aspect: "9:16", moments: clips.map((c) => ({ startSec: c.startSec, endSec: c.endSec })) },
      });
      renderJob = job.ok ? { queued: true, jobId: job.job?.id } : { queued: false, error: job.error };
    }
  }

  return NextResponse.json({
    ok: true,
    language: language_,
    durationSec: durationSec ?? found.durationSec,
    sentences: found.sentences,
    genre,
    reframe: reframeSpec(genre.genre),
    clips,
    renderJob,
    renderingAvailable: render.ok,
    chargedAcu,
    note: `${found.note} Each clip carries a .srt already rebased to start at zero, so it is usable in any editor right now — and the Clip Finder screen cuts them to 9:16 with the captions burned in, in your own browser, with no upload and no render bill${render.ok ? ". A render worker is also configured, so render:true can queue them server-side for an unattended batch." : "."}`,
  });
}

export async function GET() {
  return NextResponse.json({
    engine: "Clip Finder — one long video in, scored short clips out",
    accepts: ["multipart upload (field: file)", "json { url }", "json { segments } from a transcript you already have"],
    returns: ["clip in/out timestamps", "the quotable text of each clip", "seven counted signals per clip with their evidence", "a per-clip .srt rebased to zero", "genre + reframe spec", "optional 9:16 render job"],
    options: { minSec: "default 15", maxSec: "default 75", limit: "default 10", render: "true to queue the cuts", brandId: "required when rendering" },
    limits: { maxBytes: MAX_AUDIO_BYTES, note: "25MB per request (Whisper's limit). Export audio-only from a long recording — it is a fraction of the size and the clip timings still line up with the video." },
    configured: transcriptionConfigured(),
    rendering: renderingAvailable(),
    doctrine: "Clips are found by reading the actual speech: sentences are rebuilt from Whisper's segments so a clip never starts mid-word, and every score is the average of seven signals counted off the words themselves — hook, whether the opening stands alone, payoff, pace from the real timestamps, length, commercial vocabulary, and whether there is an ask. Each count is shown, so you can disagree with the ranking and still use the timestamps. No transcript means no clips; nothing here guesses where the good bits are.",
  });
}
