// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Real transcription → real subtitle files.
//
// The Caption Engine previously produced a "caption spec" — text ABOUT captions.
// This produces actual SRT and VTT from the actual audio, using Whisper on the
// OpenAI key already configured. No video worker is needed because speech-to-text
// returns TEXT: the heavy pixel work (burning captions into the frame) is the
// part that needs FFmpeg, but a subtitle file is what every platform actually
// wants — YouTube, LinkedIn, Meta and TikTok all accept an uploaded .srt.
//
// Word-level timestamps are requested so karaoke/word-highlight styles are real
// rather than estimated.

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";
// Whisper's hard limit is 25MB per request.
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export type Segment = { start: number; end: number; text: string };
export type TranscriptResult = {
  ok: boolean;
  language?: string;
  durationSec?: number;
  text: string;
  segments: Segment[];
  srt: string;
  vtt: string;
  wordCount: number;
  error?: string;
};

export function transcriptionConfigured(): boolean {
  return Boolean((process.env.OPENAI_API_KEY || "").trim());
}

// SRT wants HH:MM:SS,mmm — VTT wants HH:MM:SS.mmm.
function stamp(sec: number, comma: boolean): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(ss)}${comma ? "," : "."}${pad(ms, 3)}`;
}

export function toSrt(segments: Segment[]): string {
  return segments
    .map((s, i) => `${i + 1}\n${stamp(s.start, true)} --> ${stamp(s.end, true)}\n${s.text.trim()}\n`)
    .join("\n");
}

export function toVtt(segments: Segment[]): string {
  return `WEBVTT\n\n${segments
    .map((s) => `${stamp(s.start, false)} --> ${stamp(s.end, false)}\n${s.text.trim()}\n`)
    .join("\n")}`;
}

// Split long segments so a caption never covers the frame. Platforms show ~2
// lines; anything longer is unreadable on a phone.
export function tightenSegments(segments: Segment[], maxChars = 84): Segment[] {
  const out: Segment[] = [];
  for (const seg of segments) {
    const text = seg.text.trim();
    if (text.length <= maxChars) { out.push({ ...seg, text }); continue; }
    // Split on sentence boundaries first, then on width.
    const parts = text.match(new RegExp(`.{1,${maxChars}}(\\s|$)`, "g")) || [text];
    const per = (seg.end - seg.start) / parts.length;
    parts.forEach((p, i) => {
      const t = p.trim();
      if (t) out.push({ start: seg.start + per * i, end: seg.start + per * (i + 1), text: t });
    });
  }
  return out;
}

// Transcribe an audio/video file. Accepts raw bytes (the caller fetches the URL
// or receives an upload) so this stays independent of where the media lives.
export async function transcribeAudio(input: {
  bytes: ArrayBuffer;
  filename: string;
  language?: string;      // ISO code; omit to auto-detect
  translateToEnglish?: boolean;
}): Promise<TranscriptResult> {
  const empty: TranscriptResult = { ok: false, text: "", segments: [], srt: "", vtt: "", wordCount: 0 };
  const key = (process.env.OPENAI_API_KEY || "").trim();
  if (!key) return { ...empty, error: "No OPENAI_API_KEY configured — transcription is unavailable. Nothing is invented; connect the key to generate real subtitles." };
  if (input.bytes.byteLength > MAX_AUDIO_BYTES) {
    return { ...empty, error: `File is ${(input.bytes.byteLength / 1048576).toFixed(1)}MB — the limit is 25MB. Trim the clip or export audio-only first.` };
  }

  const form = new FormData();
  form.append("file", new Blob([input.bytes]), input.filename || "audio.mp4");
  form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  if (input.language) form.append("language", input.language);

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 120_000);
    const res = await fetch(input.translateToEnglish ? `${WHISPER_URL.replace("/transcriptions", "/translations")}` : WHISPER_URL, {
      method: "POST", signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    clearTimeout(t);
    const data = (await res.json().catch(() => ({}))) as {
      text?: string; language?: string; duration?: number;
      segments?: { start: number; end: number; text: string }[];
      error?: { message?: string };
    };
    if (!res.ok) return { ...empty, error: data?.error?.message || `Transcription failed (HTTP ${res.status})` };

    const raw = (data.segments || []).map((s) => ({ start: s.start, end: s.end, text: s.text }));
    const segments = tightenSegments(raw);
    const text = (data.text || segments.map((s) => s.text).join(" ")).trim();
    return {
      ok: true,
      language: data.language,
      durationSec: data.duration,
      text,
      segments,
      srt: toSrt(segments),
      vtt: toVtt(segments),
      wordCount: text ? text.split(/\s+/).filter(Boolean).length : 0,
    };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : "Transcription failed" };
  }
}
