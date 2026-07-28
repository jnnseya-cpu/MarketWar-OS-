"use client";

// Audio Studio & Dubbing — the last two studios that needed a model.
//
// Left: write a script, pick a voice, get an MP3 you can play and download.
// Right: point at a hosted video, pick a language, and get that video back
// re-voiced in it. Both produce real files; neither describes what a voiceover
// "would" sound like.

import { useCallback, useEffect, useState } from "react";
import { Download, Globe2, Loader2, Mic, Play } from "lucide-react";
import { authedFetch } from "@/frontend/api-client";
import { Pill } from "@/components/ui";

type Voice = { id: string; name: string; category?: string; labels?: Record<string, string> };
type Lang = { code: string; name: string };

export default function AudioStudio() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [languages, setLanguages] = useState<Lang[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);

  // --- voiceover ---
  const [script, setScript] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [speed, setSpeed] = useState(1);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [ttsBusy, setTtsBusy] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [ttsCharged, setTtsCharged] = useState<string | null>(null);

  // --- dubbing ---
  const [sourceUrl, setSourceUrl] = useState("");
  const [lang, setLang] = useState("es");
  const [minutes, setMinutes] = useState("2");
  const [dubId, setDubId] = useState<string | null>(null);
  const [dubState, setDubState] = useState<string | null>(null);
  const [dubBusy, setDubBusy] = useState(false);
  const [dubError, setDubError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/voice").then((r) => r.json()).then((d) => {
      setConfigured(Boolean(d?.configured));
      setLanguages(Array.isArray(d?.languages) ? d.languages : []);
    }).catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    if (configured !== true) return;
    authedFetch("/api/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "voices" }) })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d?.voices)) { setVoices(d.voices); setVoiceId((v) => v || d.voices[0]?.id || ""); } })
      .catch(() => {});
  }, [configured]);

  // Cost is quoted from the same rule the server charges on: per 1,000 chars.
  const ttsUnits = Math.max(1, Math.ceil(script.trim().length / 1000));

  async function speak() {
    setTtsBusy(true); setTtsError(null); setTtsCharged(null);
    try {
      const res = await authedFetch("/api/voice", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "speak", text: script.trim(), voiceId, speed }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string })?.error || "Speech generation failed.");
      const charged = res.headers.get("X-Charged-Acu");
      const balance = res.headers.get("X-Balance-Acu");
      if (charged && charged !== "0") setTtsCharged(`${charged} ACUs charged — ${balance} left.`);
      const blob = await res.blob();
      setAudioUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
    } catch (e) {
      setTtsError(e instanceof Error ? e.message : "Speech generation failed.");
    } finally {
      setTtsBusy(false);
    }
  }

  const pollDub = useCallback(async (id: string) => {
    const res = await authedFetch("/api/voice", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dubStatus", dubbingId: id }),
    });
    const d = await res.json();
    setDubState(d?.status || null);
    if (d?.status === "failed") setDubError(d?.error || "The dub failed at the provider.");
  }, []);

  useEffect(() => {
    if (!dubId || dubState === "dubbed" || dubState === "failed") return;
    const t = setInterval(() => pollDub(dubId), 10_000);
    return () => clearInterval(t);
  }, [dubId, dubState, pollDub]);

  async function dub() {
    setDubBusy(true); setDubError(null); setDubState(null); setDubId(null);
    try {
      const res = await authedFetch("/api/voice", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dub", sourceUrl: sourceUrl.trim(), targetLang: lang, minutes: Number(minutes) || 1 }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Could not start the dub.");
      setDubId(d.dubbingId);
      setDubState("dubbing");
      pollDub(d.dubbingId);
    } catch (e) {
      setDubError(e instanceof Error ? e.message : "Could not start the dub.");
    } finally {
      setDubBusy(false);
    }
  }

  async function downloadDub() {
    if (!dubId) return;
    const res = await authedFetch("/api/voice", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dubResult", dubbingId: dubId, lang }),
    });
    if (!res.ok) { setDubError(((await res.json().catch(() => ({}))) as { error?: string })?.error || "Not ready yet."); return; }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url; a.download = `dubbed-${lang}.mp4`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mb-8 card border-emerald-500/30 p-6">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Mic className="h-5 w-5 text-emerald-400" />
        <h2 className="font-display text-lg font-bold text-white">Audio Studio &amp; Dubbing</h2>
        {configured === true && <Pill tone="good">voice engine connected</Pill>}
        {configured === false && <Pill tone="warn">needs a voice key</Pill>}
      </div>
      <p className="mb-4 text-xs leading-relaxed text-slate-500">
        Narrate an ad, a demo or a course module in a real voice, and take one finished video into another language without
        re-shooting it. Speech is billed per 1,000 characters and dubbing per minute — the same units the provider bills us on.
      </p>

      {configured === false && (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-amber-200">
          No voice engine is connected. Set <code className="text-amber-100">ELEVENLABS_API_KEY</code> and this panel produces
          real audio — until then it stays off rather than inventing a voiceover.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---------------- voiceover ---------------- */}
        <div>
          <h3 className="mb-2 font-display text-sm font-bold text-white">Voiceover</h3>
          <label className="label">Script</label>
          <textarea
            className="input min-h-[120px]"
            placeholder="Paste a script — the one your Campaign Video agent just wrote works."
            value={script}
            onChange={(e) => setScript(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-slate-500">{script.trim().length} characters · billed as {ttsUnits} unit{ttsUnits === 1 ? "" : "s"} of 1,000</p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Voice</label>
              <select className="input" value={voiceId} onChange={(e) => setVoiceId(e.target.value)} disabled={!voices.length}>
                {voices.length === 0 && <option>Loading voices…</option>}
                {voices.map((v) => <option key={v.id} value={v.id}>{v.name}{v.labels?.accent ? ` — ${v.labels.accent}` : ""}</option>)}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">Voices you clone in ElevenLabs appear here automatically.</p>
            </div>
            <div>
              <label className="label">Pace — {speed.toFixed(2)}×</label>
              <input type="range" min={0.7} max={1.2} step={0.05} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-full" />
            </div>
          </div>

          <button className="btn-primary mt-4" onClick={speak} disabled={ttsBusy || configured !== true || !script.trim()}>
            {ttsBusy ? <><Loader2 className="h-4 w-4 animate-spin" /> Recording…</> : <><Play className="h-4 w-4" /> Generate voiceover</>}
          </button>
          {ttsCharged && <p className="mt-2 text-[11px] text-slate-500">{ttsCharged}</p>}
          {ttsError && <p className="mt-3 text-xs text-rose-400">{ttsError}</p>}

          {audioUrl && (
            <div className="mt-4">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio className="w-full" controls src={audioUrl} />
              <a className="btn-ghost mt-2 text-xs" href={audioUrl} download="voiceover.mp3"><Download className="h-3.5 w-3.5" /> Download MP3</a>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                Drop this onto your video in the editor of your choice, or use it as the narration track for a screen recording.
              </p>
            </div>
          )}
        </div>

        {/* ---------------- dubbing ---------------- */}
        <div className="lg:border-l lg:border-white/[0.06] lg:pl-6">
          <h3 className="mb-2 flex items-center gap-2 font-display text-sm font-bold text-white"><Globe2 className="h-4 w-4 text-emerald-400" /> Translate &amp; dub a video</h3>
          <label className="label">Video URL (https)</label>
          <input className="input" placeholder="https://…/my-video.mp4" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Into</label>
              <select className="input" value={lang} onChange={(e) => setLang(e.target.value)}>
                {languages.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Length (minutes)</label>
              <input className="input" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </div>
          </div>

          <button className="btn-primary mt-4" onClick={dub} disabled={dubBusy || configured !== true || !/^https:\/\//i.test(sourceUrl.trim())}>
            {dubBusy ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting…</> : <><Globe2 className="h-4 w-4" /> Dub this video</>}
          </button>
          {dubError && <p className="mt-3 text-xs text-rose-400">{dubError}</p>}

          {dubId && (
            <div className="mt-4 rounded-lg border border-white/[0.08] p-3">
              <p className="text-xs text-slate-300">
                {dubState === "dubbed" ? "Ready." : dubState === "failed" ? "Failed at the provider." : "Dubbing — transcribing, translating, re-voicing and re-timing. A few minutes for a short video."}
              </p>
              {dubState !== "dubbed" && dubState !== "failed" && <Loader2 className="mt-2 h-4 w-4 animate-spin text-emerald-400" />}
              {dubState === "dubbed" && (
                <button className="btn-ghost mt-2 text-xs" onClick={downloadDub}><Download className="h-3.5 w-3.5" /> Download the dubbed video</button>
              )}
            </div>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            One customer story, re-voiced into every market you sell in, without booking a studio or re-shooting. Watch the
            result before you publish it — dubbing is very good, not infallible, and a wrong product name in a new language
            is worse than no video.
          </p>
        </div>
      </div>
    </div>
  );
}
