import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio, transcriptionConfigured, MAX_AUDIO_BYTES } from "@/backend/transcribe";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { meterAction, creditAcus } from "@/backend/wallet";
import { classifyMediaUrl, isMediaContentType } from "@/shared/media-url";

// Real subtitles from real audio — SRT + VTT, not a "caption spec".
//
// POST multipart  (field "file")           → transcribe an uploaded clip
// POST json { url }                        → transcribe a hosted clip
//   optional: language (ISO code), translate:true (dub-to-English text)
//
// Returns { srt, vtt, segments, text } — the .srt is what YouTube, LinkedIn,
// Meta and TikTok all accept on upload, so this is usable immediately without
// any video processing. Burning captions INTO the frame needs FFmpeg and is a
// separate job; a subtitle file is what platforms actually want.
//
// The ORDER here is deliberate and is a money rule: every check that can fail
// runs before the wallet is touched, and if the provider fails after we have
// charged, the charge is returned. A customer must never pay for a transcript
// they did not receive.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "captions"), 20, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (!transcriptionConfigured()) {
    return NextResponse.json({ error: "Subtitles need OPENAI_API_KEY (Whisper). Nothing is invented — connect the key to generate real captions." }, { status: 503 });
  }

  const ctype = req.headers.get("content-type") || "";
  let bytes: ArrayBuffer | null = null;
  let filename = "clip.mp4";
  let language: string | undefined;
  let translate = false;

  // ---- gather the media; reject anything unusable BEFORE metering ----------
  try {
    if (ctype.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "Attach a video or audio file in the 'file' field." }, { status: 400 });
      if (file.size > MAX_AUDIO_BYTES) {
        return NextResponse.json({ error: `File is ${(file.size / 1048576).toFixed(1)}MB — the limit is 25MB. Trim it first, or export audio only.` }, { status: 400 });
      }
      bytes = await file.arrayBuffer();
      filename = file.name || filename;
      language = (form.get("language") as string) || undefined;
      translate = String(form.get("translate")) === "true";
    } else {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const url = typeof body.url === "string" ? body.url.trim() : "";
      language = typeof body.language === "string" ? body.language : undefined;
      translate = body.translate === true;
      if (!url) return NextResponse.json({ error: "Provide a hosted video/audio url, or upload a file." }, { status: 400 });

      // A YouTube/Vimeo/page link fetches HTML, and HTML handed to Whisper comes
      // back as "Unrecognized file format" — an error that explains nothing and
      // arrives after the charge. Catch it here and say what to do instead.
      const verdict = classifyMediaUrl(url);

      // YOUR OWN YOUTUBE VIDEO IS A SPECIAL CASE, AND A BETTER ONE.
      //
      // This screen exists to produce an .srt — which is exactly what YouTube
      // already holds for a video on a channel you own, and hands over through
      // its own API. Reading it beats transcribing: YouTube captioned the
      // master, we would be transcribing a re-encode; there is no 25MB ceiling;
      // it returns immediately; and it costs nothing, so the meter below is
      // never reached. Nothing is downloaded, which is the whole point.
      if (verdict.kind === "youtube" && verdict.youtubeId) {
        // The brand's OWN connection, ownership-checked. Never the platform's:
        // that would answer every customer with somebody else's account.
        const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
        if (!brandId) {
          return NextResponse.json({
            error: "Pick a brand first. A YouTube link is read with that brand's own connection, never with the platform's.",
            urlKind: verdict.kind, studioUrl: verdict.studioUrl,
          }, { status: 400 });
        }
        const { resolveBrandAccess } = await import("@/backend/brand-access");
        const access = await resolveBrandAccess(req, brandId);
        if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

        const { captionsFor } = await import("@/backend/youtube-captions");
        const { toVtt } = await import("@/backend/transcribe");
        const caps = await captionsFor(verdict.youtubeId, brandId, language);
        if (!caps.ok) {
          return NextResponse.json({
            error: caps.error, hint: caps.hint, urlKind: verdict.kind,
            studioUrl: verdict.studioUrl, needsConsent: caps.needsConsent,
          }, { status: 400 });
        }
        return NextResponse.json({
          ok: true,
          source: "youtube-captions",
          language: caps.track.language,
          auto: caps.track.auto,
          segments: caps.segments,
          srt: caps.srt,
          vtt: toVtt(caps.segments),
          chargedAcu: 0,
          note: caps.note,
        });
      }

      if (!verdict.usable) return NextResponse.json({ error: verdict.reason, urlKind: verdict.kind, studioUrl: verdict.studioUrl }, { status: 400 });

      const r = await fetch(url);
      if (!r.ok) return NextResponse.json({ error: `Couldn't fetch that media (HTTP ${r.status}).` }, { status: 400 });

      // A URL can still lie about what it serves — check what actually came back.
      const served = r.headers.get("content-type") || "";
      if (!isMediaContentType(served)) {
        return NextResponse.json({
          error: `That link returned ${served.split(";")[0] || "a web page"}, not audio or video. Paste a direct link to the media file, or upload it instead.`,
          urlKind: "page",
        }, { status: 400 });
      }
      const len = Number(r.headers.get("content-length") || 0);
      if (len > MAX_AUDIO_BYTES) {
        return NextResponse.json({ error: `That file is ${(len / 1048576).toFixed(1)}MB — the limit is 25MB. Trim it first.` }, { status: 400 });
      }
      bytes = await r.arrayBuffer();
      // content-length is optional, so re-check once the bytes are in hand.
      if (bytes.byteLength > MAX_AUDIO_BYTES) {
        return NextResponse.json({ error: `That file is ${(bytes.byteLength / 1048576).toFixed(1)}MB — the limit is 25MB. Trim it first.` }, { status: 400 });
      }
      filename = url.split("/").pop()?.split("?")[0] || filename;
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't read the media." }, { status: 400 });
  }

  if (!bytes || bytes.byteLength === 0) {
    return NextResponse.json({ error: "That file is empty — there is no audio to transcribe." }, { status: 400 });
  }

  // ---- only now does it cost anything --------------------------------------
  const meter = await meterAction(auth, "llm");
  if (!meter.allowed) return NextResponse.json({ error: meter.error }, { status: meter.status });

  const result = await transcribeAudio({ bytes, filename, language, translateToEnglish: translate });
  if (!result.ok) {
    // Charged, but no transcript — give the money back.
    if (meter.metered && meter.charged && auth.uid) await creditAcus(auth.uid, meter.charged).catch(() => {});
    return NextResponse.json({ error: result.error, refundedAcu: meter.charged ?? 0 }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    language: result.language,
    durationSec: result.durationSec,
    wordCount: result.wordCount,
    segments: result.segments,
    srt: result.srt,
    vtt: result.vtt,
    text: result.text,
    chargedAcu: meter.charged ?? 0,
    balanceAcu: meter.balanceAcu,
    note: "Real subtitles transcribed from your audio. Download the .srt and upload it with your video on YouTube, LinkedIn, Facebook, Instagram or TikTok — every one of them accepts it.",
  });
}

export async function GET() {
  return NextResponse.json({
    engine: "Subtitle & Caption Engine — real transcription",
    accepts: ["multipart upload (field: file)", "json { url } for hosted media"],
    returns: ["srt", "vtt", "segments with timestamps", "plain transcript"],
    limits: { maxBytes: MAX_AUDIO_BYTES, note: "25MB per request (Whisper limit). Trim longer videos first." },
    configured: transcriptionConfigured(),
    notAccepted: "YouTube and Vimeo page links — those are web pages, not media files, and the platforms do not permit downloading the video. Export your own copy and upload it.",
    doctrine: "Transcribed from the actual audio — never generated, never guessed. Charged only once usable media is in hand, and refunded if transcription fails.",
  });
}
