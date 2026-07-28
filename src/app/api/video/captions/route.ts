import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio, transcriptionConfigured, MAX_AUDIO_BYTES } from "@/backend/transcribe";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { meterAction } from "@/backend/wallet";

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
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "captions"), 20, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  // Transcription spends real provider budget — meter it like any AI action.
  const meter = await meterAction(auth, "llm");
  if (!meter.allowed) return NextResponse.json({ error: meter.error }, { status: meter.status });

  if (!transcriptionConfigured()) {
    return NextResponse.json({ error: "Subtitles need OPENAI_API_KEY (Whisper). Nothing is invented — connect the key to generate real captions." }, { status: 503 });
  }

  const ctype = req.headers.get("content-type") || "";
  let bytes: ArrayBuffer | null = null;
  let filename = "clip.mp4";
  let language: string | undefined;
  let translate = false;

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
      if (!/^https:\/\//i.test(url)) return NextResponse.json({ error: "Only https URLs are accepted." }, { status: 400 });
      const r = await fetch(url);
      if (!r.ok) return NextResponse.json({ error: `Couldn't fetch that media (HTTP ${r.status}).` }, { status: 400 });
      const len = Number(r.headers.get("content-length") || 0);
      if (len > MAX_AUDIO_BYTES) {
        return NextResponse.json({ error: `That file is ${(len / 1048576).toFixed(1)}MB — the limit is 25MB. Trim it first.` }, { status: 400 });
      }
      bytes = await r.arrayBuffer();
      filename = url.split("/").pop()?.split("?")[0] || filename;
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't read the media." }, { status: 400 });
  }

  const result = await transcribeAudio({ bytes: bytes!, filename, language, translateToEnglish: translate });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  return NextResponse.json({
    ok: true,
    language: result.language,
    durationSec: result.durationSec,
    wordCount: result.wordCount,
    segments: result.segments,
    srt: result.srt,
    vtt: result.vtt,
    text: result.text,
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
    doctrine: "Transcribed from the actual audio — never generated, never guessed. Burning captions into the frame is a separate video-processing job; a subtitle file is what the platforms accept on upload.",
  });
}
