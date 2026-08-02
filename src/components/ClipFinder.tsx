"use client";

import { useRef, useState } from "react";
import { Check, Copy, Download, Film, Loader2, Scissors, Upload } from "lucide-react";
import { Pill, ScoreBar } from "@/components/ui";
import { authedFetch } from "@/frontend/api-client";
import { extFor, parseSrt, renderClip, renderSupported } from "@/frontend/clip-render";

// Paste one long video, get the clips out.
//
// The Clip Intelligence Lab below this could rank moments and score them
// across eight commercial dimensions — but only moments the customer typed in
// by hand, which meant watching their own two-hour recording and noting the
// timestamps of the good bits first. That is the job they came here for.
//
// This does it: the video's speech is transcribed, sentences are rebuilt so a
// clip never starts mid-word, and every candidate is scored on seven signals
// counted off the actual words. Each count is shown under its score, because a
// clip score decides what someone publishes under their own name and "trust
// me" is not a reason to publish anything.
//
// Usable with no render worker at all: every clip comes back with exact in/out
// timestamps and its own .srt already rebased to start at zero, which is what
// YouTube, LinkedIn, Meta and TikTok all accept on upload.

type Signal = { name: string; score: number; evidence: string };
type Clip = {
  id: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  text: string;
  hookLine: string;
  signals: Signal[];
  score: number;
  srt: string;
  commercial: { scores: { dimension: string; score: number | null }[]; headline: string; note: string };
};
type Result = {
  ok?: boolean;
  clips?: Clip[];
  sentences?: number;
  durationSec?: number;
  genre?: { genre: string; confidence: number; runnerUp: string };
  renderJob?: { queued: boolean; jobId?: string; error?: string } | null;
  renderingAvailable?: boolean;
  chargedAcu?: number;
  note?: string;
  error?: string;
  refundedAcu?: number;
};

const mmss = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

const pretty = (s: string) => s.replace(/_/g, " ");

export default function ClipFinder({ onCutList }: { onCutList?: (moments: { startSec: number; endSec: number }[]) => void }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [minSec, setMinSec] = useState(15);
  const [maxSec, setMaxSec] = useState(75);
  const [limit, setLimit] = useState(8);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ---- cutting the clips, here, on this machine ---------------------------
  // No vendor and no queue: the browser already has the video, so it does the
  // work. The source is picked locally on purpose — drawing a cross-origin
  // video onto a canvas taints it and the recording fails, and a local file
  // also sidesteps the 25MB transcription limit, because only the audio ever
  // needed to be small.
  const [source, setSource] = useState<File | null>(null);
  const [focusX, setFocusX] = useState(0.5);
  const [burn, setBurn] = useState(true);
  const [cutting, setCutting] = useState<string | null>(null);
  const [cutPct, setCutPct] = useState(0);
  const [cutErr, setCutErr] = useState<string | null>(null);
  const [cut, setCut] = useState<Record<string, { url: string; ext: string }>>({});
  const sourceRef = useRef<HTMLInputElement>(null);
  const canRender = typeof window !== "undefined" && renderSupported();

  async function cutOne(clip: Clip) {
    if (!source) return;
    setCutErr(null); setCutting(clip.id); setCutPct(0);
    try {
      const out = await renderClip(source, {
        startSec: clip.startSec, endSec: clip.endSec,
        cues: parseSrt(clip.srt), burnCaptions: burn, focusX,
        onProgress: setCutPct,
      });
      setCut((c) => ({ ...c, [clip.id]: { url: URL.createObjectURL(out.blob), ext: extFor(out.mimeType) } }));
    } catch (e) {
      setCutErr(e instanceof Error ? e.message : "The cut failed.");
    } finally {
      setCutting(null);
    }
  }

  async function run(file?: File) {
    setBusy(true); setResult(null); setCopied(null);
    try {
      let res: Response;
      if (file) {
        const form = new FormData();
        form.append("file", file);
        form.append("title", title);
        form.append("minSec", String(minSec));
        form.append("maxSec", String(maxSec));
        form.append("limit", String(limit));
        res = await authedFetch("/api/video/clips", { method: "POST", body: form });
      } else {
        res = await authedFetch("/api/video/clips", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim(), title, minSec, maxSec, limit }),
        });
      }
      setResult(await res.json());
    } catch {
      setResult({ error: "Network error — the request never reached the server." });
    } finally {
      setBusy(false);
    }
  }

  function download(clip: Clip) {
    const blob = new Blob([clip.srt], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${clip.id}.srt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const clips = result?.clips ?? [];

  return (
    <div className="mb-8 card border-emerald-500/30 p-6">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Scissors className="h-5 w-5 text-emerald-400" />
        <h2 className="font-display text-lg font-bold text-white">Clip Finder — one long video in, shorts out</h2>
        <Pill tone="good">live</Pill>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-slate-500">
        Paste a hosted video or upload one. Its speech is transcribed, sentences are rebuilt so a clip never starts mid-word,
        and every candidate is scored on seven signals counted off the actual words — you can see every count. Each clip comes
        back with exact in/out times and its own subtitle file, usable in any editor immediately.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Video URL <span className="text-slate-500">(a direct link to the file — not a YouTube page)</span></label>
          <input className="input" placeholder="https://…/episode-42.mp4" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Title <span className="text-slate-500">(optional — helps detect the genre)</span></label>
          <input className="input" placeholder="Episode 42 — pricing, and why yours is wrong" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div><label className="label">Shortest clip (s)</label><input className="input" type="number" min={5} max={300} value={minSec} onChange={(e) => setMinSec(Number(e.target.value) || 15)} /></div>
        <div><label className="label">Longest clip (s)</label><input className="input" type="number" min={10} max={600} value={maxSec} onChange={(e) => setMaxSec(Number(e.target.value) || 75)} /></div>
        <div><label className="label">How many</label><input className="input" type="number" min={1} max={30} value={limit} onChange={(e) => setLimit(Number(e.target.value) || 8)} /></div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="btn-primary" onClick={() => run()} disabled={busy || !url.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />} Find the clips
        </button>
        <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Upload className="h-4 w-4" /> Upload instead
        </button>
        <input
          ref={fileRef} type="file" accept="video/*,audio/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) run(f); e.target.value = ""; }}
        />
        <span className="text-[11px] text-slate-500">25MB per request — export audio-only from a long recording; the timings still line up with the video.</span>
      </div>

      {result?.error && (
        <p className="mt-4 rounded-lg bg-rose-500/10 px-3 py-2 text-xs leading-relaxed text-rose-300">
          {result.error}
          {result.refundedAcu ? ` Your ${result.refundedAcu} ACUs were refunded.` : ""}
        </p>
      )}

      {result?.ok && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            {result.genre && <Pill tone="info">{pretty(result.genre.genre)}</Pill>}
            <span>{result.sentences} sentences · {mmss(result.durationSec ?? 0)} of transcript · {clips.length} clip(s)</span>
            {onCutList && clips.length > 0 && (
              <button
                className="ml-auto rounded-lg border border-white/15 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/[0.06]"
                onClick={() => onCutList(clips.map((c) => ({ startSec: c.startSec, endSec: c.endSec })))}
              >
                Send all {clips.length} to the Render Farm
              </button>
            )}
          </div>

          {/* Cut them here. Nothing is uploaded and nothing is queued — the
              machine that already has the video does the work, which is why
              this costs neither of us anything. */}
          <div className="rounded-lg border border-white/[0.07] bg-ink-900/40 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Film className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-semibold text-white">Cut them to 9:16, here in your browser</span>
              <Pill tone={canRender ? "good" : "warn"}>{canRender ? "no upload, no vendor" : "not supported in this browser"}</Pill>
            </div>
            {canRender ? (
              <>
                <p className="mb-2 text-[11px] leading-relaxed text-slate-400">
                  Pick the same video file from your machine. It never leaves it — the cropping, the captions and the
                  recording all happen here, so there is no render bill and no queue. It runs in real time, so a
                  40-second clip takes about 40 seconds.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button className="rounded-lg border border-white/15 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/[0.06]" onClick={() => sourceRef.current?.click()}>
                    <Upload className="mr-1 inline h-3.5 w-3.5" />{source ? "Change file" : "Choose the video file"}
                  </button>
                  <input ref={sourceRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setSource(f); e.target.value = ""; }} />
                  {source && <span className="text-[11px] text-slate-400">{source.name}</span>}
                  <label className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-400">
                    <input type="checkbox" checked={burn} onChange={(e) => setBurn(e.target.checked)} /> burn captions in
                  </label>
                </div>
                {source && (
                  <div className="mt-2">
                    <label className="text-[11px] text-slate-400">
                      Where the 9:16 column sits: <span className="text-slate-300">{focusX === 0.5 ? "centre" : focusX < 0.5 ? "left" : "right"}</span>
                    </label>
                    <input type="range" min={0} max={1} step={0.05} value={focusX} onChange={(e) => setFocusX(Number(e.target.value))} className="w-full" />
                    {/* Said plainly rather than sold as tracking. */}
                    <p className="text-[10px] leading-relaxed text-slate-500">
                      You place this, we do not guess it. Following a speaker automatically needs per-frame face
                      detection, and a guess that crops someone out of their own video is worse than a crop that never
                      pretended to be clever.
                    </p>
                  </div>
                )}
                {cutErr && <p className="mt-2 text-[11px] text-rose-300">{cutErr}</p>}
              </>
            ) : (
              <p className="text-[11px] leading-relaxed text-slate-400">
                This browser cannot record a canvas. Chrome, Edge or Firefox on a desktop can. The timecodes and
                subtitle files below work in any editor either way.
              </p>
            )}
          </div>

          {clips.map((c, i) => (
            <div key={c.id} className="rounded-lg border border-white/[0.07] bg-ink-900/50 p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-display text-sm font-bold text-white">#{i + 1}</span>
                <code className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[11px] text-sky-300">{mmss(c.startSec)} → {mmss(c.endSec)}</code>
                <span className="text-[11px] text-slate-500">{Math.round(c.durationSec)}s</span>
                <span className="ml-auto font-display text-sm font-bold text-white">{c.score}<span className="text-xs text-slate-500">/100</span></span>
              </div>

              {/* The opening line on its own, because it decides whether the
                  rest is ever seen. */}
              <p className="mb-2 text-sm font-medium leading-relaxed text-white">&ldquo;{c.hookLine}&rdquo;</p>
              <p className="mb-3 text-xs leading-relaxed text-slate-400">{c.text}</p>

              <div className="mb-3 grid gap-2 sm:grid-cols-2">
                {c.signals.map((s) => (
                  <div key={s.name}>
                    <ScoreBar label={s.name} score={s.score} />
                    {/* The count the score came from. A number you can check
                        beats a better number you cannot. */}
                    <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">{s.evidence}</p>
                  </div>
                ))}
              </div>

              {/* Commercial dimensions, with the unmeasured ones stated rather
                  than filled in. */}
              <div className="mb-3 flex flex-wrap gap-1.5">
                {c.commercial.scores.map((s) => (
                  <span
                    key={s.dimension}
                    className={`rounded px-1.5 py-0.5 text-[10px] ${s.score === null ? "bg-white/[0.04] text-slate-500" : "bg-emerald-500/10 text-emerald-300"}`}
                    title={s.score === null ? "Not measured for this clip" : undefined}
                  >
                    {pretty(s.dimension)} {s.score === null ? "—" : s.score}
                  </span>
                ))}
              </div>
              <p className="mb-3 text-[10px] leading-relaxed text-slate-500">{c.commercial.note}</p>

              <div className="flex flex-wrap gap-2">
                <button className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-white/[0.06]" onClick={() => download(c)}>
                  <Download className="h-3.5 w-3.5" /> Subtitles (.srt)
                </button>
                <button
                  className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-white/[0.06]"
                  onClick={() => { navigator.clipboard?.writeText(`${mmss(c.startSec)} - ${mmss(c.endSec)}\n\n${c.text}`); setCopied(c.id); }}
                >
                  {copied === c.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />} Copy timecode + text
                </button>
                {canRender && source && (
                  cut[c.id] ? (
                    <a
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/15"
                      href={cut[c.id].url} download={`${c.id}.${cut[c.id].ext}`}
                    >
                      <Download className="h-3.5 w-3.5" /> Download the 9:16 clip
                    </a>
                  ) : (
                    <button
                      className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-white/[0.06] disabled:opacity-50"
                      onClick={() => cutOne(c)} disabled={Boolean(cutting)}
                    >
                      {cutting === c.id
                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Cutting… {cutPct}%</>
                        : <><Film className="h-3.5 w-3.5" /> Cut this to 9:16</>}
                    </button>
                  )
                )}
                {onCutList && (
                  <button
                    className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-white/[0.06]"
                    onClick={() => onCutList([{ startSec: c.startSec, endSec: c.endSec }])}
                    title="Send to the Render Farm queue instead — needs a render worker"
                  >
                    <Scissors className="h-3.5 w-3.5" /> Queue on the farm
                  </button>
                )}
              </div>
            </div>
          ))}

          <p className="text-[11px] leading-relaxed text-slate-500">{result.note}</p>
        </div>
      )}
    </div>
  );
}
