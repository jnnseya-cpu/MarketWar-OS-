import { NextRequest, NextResponse } from "next/server";
import {
  voiceConfigured, listVoices, textToSpeech, startDub, dubStatus, dubResult,
  billableUnits, DUB_LANGUAGES, MAX_TTS_CHARS,
} from "@/backend/voice";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { meterAction } from "@/backend/wallet";

// Audio Studio & Dubbing — real speech, real dubbed video.
//
//   POST { action:"voices" }                                    → the voice list
//   POST { action:"speak",  text, voiceId?, speed? }            → MP3 (audio/mpeg)
//   POST { action:"dub",    sourceUrl, targetLang, minutes }    → start a dub job
//   POST { action:"dubStatus", dubbingId }                      → poll it
//   POST { action:"dubResult", dubbingId, lang }                → the dubbed file
//
// Metering follows how the provider bills: speech per 1,000 characters, dubbing
// per minute of video. The customer is quoted the same number they are charged
// because both come from billableUnits / the declared minutes.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "voice"), 40, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (!voiceConfigured()) {
    return NextResponse.json({ error: "Voice and dubbing need ELEVENLABS_API_KEY. Nothing is simulated — connect the key to generate real audio." }, { status: 503 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const action = s("action");

  // Listing voices is a free read — no charge for looking at your own voices.
  if (action === "voices") {
    const r = await listVoices();
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
    return NextResponse.json({ voices: r.voices });
  }

  if (action === "speak") {
    const text = s("text");
    if (!text) return NextResponse.json({ error: "Write the script first." }, { status: 400 });
    if (text.length > MAX_TTS_CHARS) {
      return NextResponse.json({ error: `That script is ${text.length} characters — the limit is ${MAX_TTS_CHARS} per request. Split it into sections.` }, { status: 400 });
    }
    const meter = await meterAction(auth, "voice", billableUnits(text));
    if (!meter.allowed) return NextResponse.json({ error: meter.error }, { status: meter.status });

    const r = await textToSpeech({
      text, voiceId: s("voiceId") || undefined,
      speed: typeof body.speed === "number" ? body.speed : undefined,
      stability: typeof body.stability === "number" ? body.stability : undefined,
    });
    if (!r.ok || !r.audio) return NextResponse.json({ error: r.error }, { status: 502 });
    return new NextResponse(r.audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": 'attachment; filename="voiceover.mp3"',
        "X-Charged-Acu": String(meter.charged ?? 0),
        "X-Balance-Acu": String(meter.balanceAcu ?? 0),
      },
    });
  }

  if (action === "dub") {
    const sourceUrl = s("sourceUrl");
    const targetLang = s("targetLang");
    // Dubbing is billed per minute of source video, so the length is required.
    // We charge on the declared length and it is validated against the provider's
    // own estimate when the job starts.
    const minutes = Math.max(1, Math.ceil(Number(body.minutes) || 0));
    if (!Number(body.minutes)) return NextResponse.json({ error: "Tell us how long the video is (minutes) — dubbing is billed per minute." }, { status: 400 });
    if (minutes > 45) return NextResponse.json({ error: "Dubbing is capped at 45 minutes per job. Split the video first." }, { status: 400 });

    const meter = await meterAction(auth, "dub", minutes);
    if (!meter.allowed) return NextResponse.json({ error: meter.error }, { status: meter.status });

    const r = await startDub({ sourceUrl, targetLang, sourceLang: s("sourceLang") || undefined, numSpeakers: Number(body.numSpeakers) || undefined });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
    return NextResponse.json({
      ok: true, dubbingId: r.dubbingId, targetLang,
      expectedDurationSec: r.expectedDurationSec,
      chargedAcu: meter.charged, balanceAcu: meter.balanceAcu,
      note: "Dubbing runs on ElevenLabs — transcribe, translate, re-voice and re-time. Poll for the file; a long video takes several minutes.",
    });
  }

  if (action === "dubStatus") {
    const r = await dubStatus(s("dubbingId"));
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
    return NextResponse.json({ status: r.status, targetLanguages: r.targetLanguages, error: r.error });
  }

  if (action === "dubResult") {
    const r = await dubResult(s("dubbingId"), s("lang"));
    if (!r.ok || !r.media) return NextResponse.json({ error: r.error || "Not ready yet." }, { status: 502 });
    return new NextResponse(r.media, {
      status: 200,
      headers: {
        "Content-Type": r.contentType || "video/mp4",
        "Content-Disposition": `attachment; filename="dubbed-${s("lang") || "audio"}.mp4"`,
      },
    });
  }

  return NextResponse.json({ error: "Unknown action — use voices, speak, dub, dubStatus or dubResult" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "Audio Studio & Dubbing (ElevenLabs)",
    configured: voiceConfigured(),
    actions: ["voices", "speak", "dub", "dubStatus", "dubResult"],
    limits: { maxCharsPerRequest: MAX_TTS_CHARS, maxDubMinutes: 45 },
    languages: DUB_LANGUAGES,
    billing: "Speech is charged per 1,000 characters and dubbing per minute of video — the same units the provider bills us on.",
    doctrine: "Real audio only. Without a key this returns 503 rather than a description of a voiceover.",
  });
}
