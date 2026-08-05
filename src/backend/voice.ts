// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Voice & dubbing — ElevenLabs.
//
// This closes the last two studios that genuinely could not be built without a
// model: the Audio Studio (voiceovers, narration, voice cloning) and Translation
// & Dubbing (one video re-voiced into another language, lips and timing intact).
//
// Everything here returns REAL AUDIO BYTES. Nothing describes a voiceover; it
// speaks one. Dubbing is asynchronous on ElevenLabs' side (they transcribe,
// translate, re-voice and re-time), so it is exposed as start → poll → fetch,
// the same shape as the video render queue.
//
// Money: speech is billed per character and dubbing per minute, so callers meter
// with the unit count (ceil(chars/1000), ceil(minutes)) rather than a flat 1.

const API = "https://api.elevenlabs.io/v1";

// Flash is ~half the credit cost of the multilingual model at broadcast quality
// for narration, which is what almost every marketing voiceover is.
const DEFAULT_MODEL = process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5";
// "Rachel" — ElevenLabs' default stock voice, present on every account.
const DEFAULT_VOICE = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

export const MAX_TTS_CHARS = 5000;

export type Voice = { id: string; name: string; category?: string; previewUrl?: string; labels?: Record<string, string> };
export type DubStatus = "dubbing" | "dubbed" | "failed";

function key(): string { return (process.env.ELEVENLABS_API_KEY || "").trim(); }
export function voiceConfigured(): boolean { return Boolean(key()); }

// Characters actually billed. Callers use this for metering so the price the
// customer is quoted and the price they are charged come from one function.
export function billableUnits(text: string): number {
  return Math.max(1, Math.ceil(text.length / 1000));
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: { "xi-api-key": key(), ...(init.headers || {}) },
  });
}

// WHAT A 401 ACTUALLY MEANS HERE, WHICH IS FOUR DIFFERENT THINGS.
//
// This used to answer every 401 with "ElevenLabs rejected the API key. Check
// ELEVENLABS_API_KEY." — and then throw away the reason ElevenLabs had just
// given. Three of the four common causes are not a bad key, so the customer was
// sent to regenerate a credential that was working:
//
//   • invalid_api_key        — the key really is wrong or revoked.
//   • missing_permissions    — the key is valid but was created without the
//                              scope this endpoint needs. Editing the key fixes
//                              it; replacing it does not.
//   • detected_unusual_activity — the FREE tier refusing traffic from a cloud
//                              IP. Extremely common on Vercel, and the key is
//                              fine. Only a paid plan clears it.
//   • quota_exceeded         — the allowance is spent, which is a 401 on some
//                              endpoints and a 429 on others.
//
// Telling somebody to check a key that is not the problem costs them an
// afternoon and teaches them to distrust the next message too.
const XI_401: Record<string, string> = {
  invalid_api_key: "ElevenLabs says the key itself is invalid or revoked — generate a new one and replace ELEVENLABS_API_KEY.",
  missing_permissions: "The key is VALID but was created without the permission this action needs. Edit the key's scopes in ElevenLabs (text-to-speech, voices, dubbing as applicable) — replacing the key will not help.",
  detected_unusual_activity: "ElevenLabs has flagged the traffic as unusual. This is their free tier refusing requests from a cloud IP — the key is fine, and it clears on any paid plan. Nothing is wrong with your configuration.",
  quota_exceeded: "The character allowance on this account is spent. The key is fine; the plan needs topping up or the period needs to roll over.",
};

async function errorFrom(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { detail?: { message?: string; status?: string } | string };
  const detail = typeof body.detail === "string" ? body.detail : body.detail?.message || body.detail?.status;
  const status = typeof body.detail === "object" && body.detail ? (body.detail.status || "") : "";

  if (res.status === 401) {
    const known = XI_401[status];
    if (known) return known;
    // Unrecognised reason: pass ElevenLabs' own words through rather than
    // substituting a guess for them.
    return detail
      ? `ElevenLabs refused the request (401): ${detail}. That may or may not be the key — check the key's PERMISSIONS as well as its value.`
      : "ElevenLabs refused the request (401) without saying why. Check the key's value and its permissions — a key with the wrong scopes fails exactly like a wrong one.";
  }
  if (res.status === 429) return `ElevenLabs rate limit or quota reached — your character allowance is spent for this period.${detail ? ` (${detail})` : ""}`;
  return detail || `ElevenLabs returned HTTP ${res.status}`;
}

// ---------------------------------------------------------------------------
// Voices — the customer's own cloned voices appear here alongside the stock ones.
// ---------------------------------------------------------------------------
export async function listVoices(): Promise<{ ok: boolean; voices: Voice[]; error?: string }> {
  if (!voiceConfigured()) return { ok: false, voices: [], error: "No ELEVENLABS_API_KEY configured." };
  try {
    const res = await call("/voices");
    if (!res.ok) return { ok: false, voices: [], error: await errorFrom(res) };
    const data = (await res.json()) as { voices?: { voice_id: string; name: string; category?: string; preview_url?: string; labels?: Record<string, string> }[] };
    return {
      ok: true,
      voices: (data.voices || []).map((v) => ({ id: v.voice_id, name: v.name, category: v.category, previewUrl: v.preview_url, labels: v.labels })),
    };
  } catch (e) {
    return { ok: false, voices: [], error: e instanceof Error ? e.message : "Could not reach ElevenLabs." };
  }
}

// ---------------------------------------------------------------------------
// Text to speech — real MP3 bytes.
// ---------------------------------------------------------------------------
export async function textToSpeech(input: {
  text: string;
  voiceId?: string;
  modelId?: string;
  stability?: number;      // 0-1, lower = more expressive
  similarityBoost?: number;
  speed?: number;          // 0.7-1.2
}): Promise<{ ok: boolean; audio?: ArrayBuffer; contentType?: string; chars?: number; error?: string }> {
  if (!voiceConfigured()) return { ok: false, error: "Voiceovers need ELEVENLABS_API_KEY. Nothing is faked — connect the key to generate real speech." };
  const text = (input.text || "").trim();
  if (!text) return { ok: false, error: "Nothing to say — write the script first." };
  if (text.length > MAX_TTS_CHARS) {
    return { ok: false, error: `That script is ${text.length} characters — the limit is ${MAX_TTS_CHARS} per request. Split it into sections and generate each.` };
  }

  try {
    const res = await call(`/text-to-speech/${encodeURIComponent(input.voiceId || DEFAULT_VOICE)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: input.modelId || DEFAULT_MODEL,
        voice_settings: {
          stability: typeof input.stability === "number" ? input.stability : 0.4,
          similarity_boost: typeof input.similarityBoost === "number" ? input.similarityBoost : 0.75,
          speed: typeof input.speed === "number" ? input.speed : 1.0,
        },
      }),
    });
    if (!res.ok) return { ok: false, error: await errorFrom(res) };
    return { ok: true, audio: await res.arrayBuffer(), contentType: "audio/mpeg", chars: text.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Speech generation failed." };
  }
}

// ---------------------------------------------------------------------------
// Dubbing — start, poll, fetch. ElevenLabs does the transcribe → translate →
// re-voice → re-time pipeline; we only carry the job.
// ---------------------------------------------------------------------------
export async function startDub(input: {
  sourceUrl: string;
  targetLang: string;         // ISO 639-1, e.g. "fr", "es", "de"
  sourceLang?: string;        // omit to auto-detect
  numSpeakers?: number;
  watermark?: boolean;
}): Promise<{ ok: boolean; dubbingId?: string; expectedDurationSec?: number; error?: string }> {
  if (!voiceConfigured()) return { ok: false, error: "Dubbing needs ELEVENLABS_API_KEY." };
  if (!/^https:\/\//i.test(input.sourceUrl || "")) return { ok: false, error: "Give a hosted https URL for the video to dub." };
  if (!input.targetLang) return { ok: false, error: "Pick a target language." };

  const form = new FormData();
  form.append("source_url", input.sourceUrl);
  form.append("target_lang", input.targetLang);
  if (input.sourceLang) form.append("source_lang", input.sourceLang);
  if (input.numSpeakers) form.append("num_speakers", String(input.numSpeakers));
  form.append("watermark", input.watermark ? "true" : "false");

  try {
    const res = await call("/dubbing", { method: "POST", body: form });
    if (!res.ok) return { ok: false, error: await errorFrom(res) };
    const data = (await res.json()) as { dubbing_id?: string; expected_duration_sec?: number };
    if (!data.dubbing_id) return { ok: false, error: "ElevenLabs accepted the request but returned no job id." };
    return { ok: true, dubbingId: data.dubbing_id, expectedDurationSec: data.expected_duration_sec };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not start dubbing." };
  }
}

export async function dubStatus(dubbingId: string): Promise<{ ok: boolean; status?: DubStatus; targetLanguages?: string[]; error?: string }> {
  if (!voiceConfigured()) return { ok: false, error: "Dubbing needs ELEVENLABS_API_KEY." };
  try {
    const res = await call(`/dubbing/${encodeURIComponent(dubbingId)}`);
    if (!res.ok) return { ok: false, error: await errorFrom(res) };
    const data = (await res.json()) as { status?: DubStatus; target_languages?: string[]; error?: string };
    return { ok: true, status: data.status, targetLanguages: data.target_languages, error: data.error };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read the dubbing job." };
  }
}

// The finished dubbed media. Only available once status is "dubbed".
export async function dubResult(dubbingId: string, lang: string): Promise<{ ok: boolean; media?: ArrayBuffer; contentType?: string; error?: string }> {
  if (!voiceConfigured()) return { ok: false, error: "Dubbing needs ELEVENLABS_API_KEY." };
  try {
    const res = await call(`/dubbing/${encodeURIComponent(dubbingId)}/audio/${encodeURIComponent(lang)}`);
    if (!res.ok) return { ok: false, error: await errorFrom(res) };
    return { ok: true, media: await res.arrayBuffer(), contentType: res.headers.get("content-type") || "video/mp4" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not fetch the dubbed file." };
  }
}

// ---------------------------------------------------------------------------
// Voice isolation — strips room noise/music from a recording. This is what makes
// a phone-recorded testimonial usable, so it is worth its own action.
// ---------------------------------------------------------------------------
export async function isolateVoice(bytes: ArrayBuffer, filename = "audio.mp3"): Promise<{ ok: boolean; audio?: ArrayBuffer; error?: string }> {
  if (!voiceConfigured()) return { ok: false, error: "Audio cleanup needs ELEVENLABS_API_KEY." };
  const form = new FormData();
  form.append("audio", new Blob([bytes]), filename);
  try {
    const res = await call("/audio-isolation", { method: "POST", body: form });
    if (!res.ok) return { ok: false, error: await errorFrom(res) };
    return { ok: true, audio: await res.arrayBuffer() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Audio cleanup failed." };
  }
}

// The languages ElevenLabs dubs into. Kept explicit so the UI never offers a
// language the provider will reject.
export const DUB_LANGUAGES: { code: string; name: string }[] = [
  { code: "en", name: "English" }, { code: "es", name: "Spanish" }, { code: "fr", name: "French" },
  { code: "de", name: "German" }, { code: "it", name: "Italian" }, { code: "pt", name: "Portuguese" },
  { code: "pl", name: "Polish" }, { code: "nl", name: "Dutch" }, { code: "tr", name: "Turkish" },
  { code: "ru", name: "Russian" }, { code: "ar", name: "Arabic" }, { code: "hi", name: "Hindi" },
  { code: "ja", name: "Japanese" }, { code: "ko", name: "Korean" }, { code: "zh", name: "Chinese" },
  { code: "sv", name: "Swedish" }, { code: "da", name: "Danish" }, { code: "no", name: "Norwegian" },
  { code: "fi", name: "Finnish" }, { code: "id", name: "Indonesian" }, { code: "uk", name: "Ukrainian" },
  { code: "cs", name: "Czech" }, { code: "ro", name: "Romanian" }, { code: "el", name: "Greek" },
  { code: "hu", name: "Hungarian" }, { code: "ms", name: "Malay" }, { code: "fil", name: "Filipino" },
  { code: "vi", name: "Vietnamese" }, { code: "ta", name: "Tamil" },
];
