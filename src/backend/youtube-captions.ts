// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// The lawful way to get a YouTube video's words.
//
// Three screens dead-ended on the same paste — Render Farm, Caption Engine,
// Clip Finder — and the refusal was correct: YouTube permits downloading only
// through a download link YouTube itself displays. An extractor would hand the
// customer a terms breach against the channel they are trying to grow.
//
// But two of those three screens never needed the video. The Caption Engine
// produces an .srt, which IS a transcript with timestamps. The Clip Finder
// transcribes speech, rebuilds sentences and scores words. Both need the WORDS,
// and YouTube gives those away through its own API for a video on a channel you
// own — `captions.list` then `captions.download?tfmt=srt`.
//
// It is not a workaround. For the customer's own videos it is strictly better
// than what those screens do today:
//   • more accurate — YouTube captions the original master, we would be
//     transcribing a re-encoded copy,
//   • instant — no upload, no 25MB limit, no transcription wait,
//   • free — no transcription ACUs are spent at all.
//
// WHAT IT WILL NOT DO. It needs the OAuth of the channel owner. Somebody else's
// video returns 403 and that is reported as "not your channel", never as "no
// captions" — telling a customer their video has no subtitles when the real
// answer is that it is not theirs sends them to fix the wrong thing.
//
// AND IT IS PER BRAND, NEVER THE PLATFORM'S. The first version of this called
// `getGoogleAccessToken(scope)` with no brand, which resolves the ONE
// platform-wide refresh token used for Search Console and Business Profile.
// That would have been wrong twice over: every customer would be told "not on
// the connected channel" — an error about somebody else's account — and if the
// platform's own Google account owned a channel, any customer could have read
// its captions by pasting its links. `requireBrand` makes the absence of a
// brand connection a refusal rather than a silent fallback.

import { getGoogleAccessToken } from "@/backend/google-auth";
import type { Segment } from "@/backend/transcribe";

/** Sensitive scope: production apps need Google's OAuth verification for it. */
export const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";

const API = "https://www.googleapis.com/youtube/v3";

export type CaptionTrack = {
  id: string;
  language: string;
  /** "standard" = a human track. "ASR" = YouTube's own speech recognition. */
  trackKind: string;
  name: string;
  isDraft: boolean;
  auto: boolean;
};

export type CaptionsResult =
  | { ok: true; segments: Segment[]; srt: string; track: CaptionTrack; note: string }
  | { ok: false; error: string; hint?: string; needsConsent?: boolean };

// ---------------------------------------------------------------------------
// SRT → segments
//
// Written here rather than pulled in, because the failure mode of a loose
// parser is silent: a mis-parsed timestamp produces a clip that starts in the
// wrong place, and nothing downstream can tell.
// ---------------------------------------------------------------------------
const TIME = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

const secondsOf = (h: string, m: string, s: string, ms: string) =>
  Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000;

export function parseSrt(srt: string): Segment[] {
  const out: Segment[] = [];
  for (const block of (srt || "").replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (!lines.length) continue;
    const timeLine = lines.find((l) => TIME.test(l));
    if (!timeLine) continue;
    const m = TIME.exec(timeLine)!;
    const start = secondsOf(m[1], m[2], m[3], m[4]);
    const end = secondsOf(m[5], m[6], m[7], m[8]);
    // Everything after the timestamp is the caption. A cue index line before it
    // is dropped; a cue with no text is dropped rather than emitted empty.
    const text = lines.slice(lines.indexOf(timeLine) + 1).join(" ")
      .replace(/<[^>]+>/g, "")   // YouTube ships inline karaoke tags on ASR tracks
      .replace(/\s+/g, " ")
      .trim();
    if (!text || !(end > start)) continue;
    out.push({ start, end, text });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Which track to use
//
// A human-written track beats YouTube's speech recognition every time, and the
// difference matters here: the clip finder scores on the actual words, so an
// ASR mis-hearing becomes a mis-scored clip. When only ASR exists it is used
// and SAID to be auto-generated, rather than presented as the same thing.
// ---------------------------------------------------------------------------
export function pickTrack(tracks: CaptionTrack[], preferLang?: string): CaptionTrack | null {
  const usable = tracks.filter((t) => !t.isDraft);
  if (!usable.length) return null;
  const lang = (preferLang || "").toLowerCase();
  const score = (t: CaptionTrack) =>
    (t.auto ? 0 : 100) +                                             // human first
    (lang && t.language.toLowerCase().startsWith(lang) ? 10 : 0) +   // then the asked-for language
    (t.language.toLowerCase().startsWith("en") ? 1 : 0);             // then English as the tiebreak
  return [...usable].sort((a, b) => score(b) - score(a))[0];
}

async function token(brandId: string): Promise<string | null> {
  return getGoogleAccessToken(YOUTUBE_SCOPE, { brandId, requireBrand: true });
}

export async function listCaptionTracks(videoId: string, brandId: string): Promise<{ ok: true; tracks: CaptionTrack[] } | { ok: false; error: string; needsConsent?: boolean }> {
  const t = await token(brandId);
  if (!t) {
    return {
      ok: false,
      needsConsent: true,
      error: "This brand has not connected YouTube. Connect the Google account that owns the channel — each brand connects its own, and the platform's connection is never used on your behalf. It reads the captions your videos already have and never downloads the video.",
    };
  }
  const res = await fetch(`${API}/captions?part=snippet&videoId=${encodeURIComponent(videoId)}`, {
    headers: { Authorization: `Bearer ${t}` },
  }).catch(() => null);
  if (!res) return { ok: false, error: "Could not reach YouTube." };
  if (res.status === 403) {
    return { ok: false, error: "YouTube refused: this video is not on the connected channel. Captions can only be read for videos you own — connect the right account, or use the file." };
  }
  if (res.status === 404) return { ok: false, error: "YouTube has no such video, or it is private to another account." };
  if (!res.ok) return { ok: false, error: `YouTube captions list failed (HTTP ${res.status}).` };

  const data = (await res.json().catch(() => null)) as { items?: { id: string; snippet?: Record<string, unknown> }[] } | null;
  const tracks: CaptionTrack[] = (data?.items || []).map((i) => {
    const s = (i.snippet || {}) as Record<string, unknown>;
    const trackKind = String(s.trackKind || "standard");
    return {
      id: i.id,
      language: String(s.language || ""),
      trackKind,
      name: String(s.name || ""),
      isDraft: Boolean(s.isDraft),
      auto: trackKind.toUpperCase() === "ASR",
    };
  });
  return { ok: true, tracks };
}

export async function downloadCaptionSrt(captionId: string, brandId: string): Promise<{ ok: true; srt: string } | { ok: false; error: string }> {
  const t = await token(brandId);
  if (!t) return { ok: false, error: "This brand has not connected YouTube." };
  const res = await fetch(`${API}/captions/${encodeURIComponent(captionId)}?tfmt=srt`, {
    headers: { Authorization: `Bearer ${t}` },
  }).catch(() => null);
  if (!res) return { ok: false, error: "Could not reach YouTube." };
  if (res.status === 403) return { ok: false, error: "YouTube refused the download of that caption track — it belongs to another channel." };
  if (!res.ok) return { ok: false, error: `YouTube caption download failed (HTTP ${res.status}).` };
  const srt = await res.text().catch(() => "");
  if (!srt.trim()) return { ok: false, error: "YouTube returned an empty caption track." };
  return { ok: true, srt };
}

// The whole flow: id in, timed words out.
export async function captionsFor(videoId: string, brandId: string, preferLang?: string): Promise<CaptionsResult> {
  if (!(brandId || "").trim()) {
    return { ok: false, error: "No brand on the request, so there is no YouTube connection to use. Pick a brand first — captions are read with that brand's own authorisation." };
  }
  const listed = await listCaptionTracks(videoId, brandId);
  if (!listed.ok) return { ok: false, error: listed.error, needsConsent: listed.needsConsent };

  const track = pickTrack(listed.tracks, preferLang);
  if (!track) {
    return {
      ok: false,
      error: "That video has no caption track yet.",
      hint: "Turn on automatic captions in YouTube Studio (Subtitles → the video → it appears within minutes of upload), then try again. Or upload the file here and the audio will be transcribed instead.",
    };
  }

  const dl = await downloadCaptionSrt(track.id, brandId);
  if (!dl.ok) return { ok: false, error: dl.error };

  const segments = parseSrt(dl.srt);
  if (!segments.length) return { ok: false, error: "The caption track downloaded but contained no readable cues." };

  return {
    ok: true,
    segments,
    srt: dl.srt,
    track,
    note: track.auto
      ? `Read from YouTube's own AUTOMATIC captions (${track.language}), ${segments.length} cues. Auto-captions mishear names and jargon — check any clip before publishing. Nothing was downloaded and no transcription was charged.`
      : `Read from the ${track.language} caption track on your channel, ${segments.length} cues. Nothing was downloaded and no transcription was charged.`,
  };
}
