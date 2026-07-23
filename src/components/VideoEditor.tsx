"use client";

// In-browser Video Editor (trim/clip) — REAL, no external key, no ffmpeg.
// Loads a local video, lets you set in/out points, and exports the trimmed
// segment by capturing the <video> element's stream (captureStream) into a
// MediaRecorder while it plays the chosen range. Output is a downloadable WebM.
// Nothing is uploaded — the file never leaves the browser.

import { useCallback, useEffect, useRef, useState } from "react";
import { Scissors, Upload, Download, Loader2, Play, AlertTriangle } from "lucide-react";

type Phase = "empty" | "ready" | "exporting" | "done";
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function supported(): boolean {
  if (typeof document === "undefined" || typeof MediaRecorder === "undefined") return false;
  const v = document.createElement("video") as HTMLVideoElement & { captureStream?: () => MediaStream };
  return typeof v.captureStream === "function" || typeof (v as unknown as { mozCaptureStream?: () => MediaStream }).mozCaptureStream === "function";
}

export default function VideoEditor() {
  const [ok, setOk] = useState(true);
  const [phase, setPhase] = useState<Phase>("empty");
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  const [outUrl, setOutUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => { setOk(supported()); }, []);
  useEffect(() => () => {
    if (srcUrl) URL.revokeObjectURL(srcUrl);
    if (outUrl) URL.revokeObjectURL(outUrl);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, [srcUrl, outUrl]);

  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    if (outUrl) { URL.revokeObjectURL(outUrl); setOutUrl(null); }
    if (srcUrl) URL.revokeObjectURL(srcUrl);
    const url = URL.createObjectURL(f);
    setSrcUrl(url); setPhase("ready");
  }, [srcUrl, outUrl]);

  function onLoaded() {
    const v = videoRef.current; if (!v) return;
    const d = Number.isFinite(v.duration) ? v.duration : 0;
    setDuration(d); setStart(0); setEnd(d);
  }

  function pickMime(): string {
    const c = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    return c.find((t) => MediaRecorder.isTypeSupported(t)) || "video/webm";
  }

  async function exportClip() {
    const v = videoRef.current as (HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }) | null;
    if (!v) return;
    if (end <= start) { setError("Set an end point after the start point."); return; }
    setError(null); setPhase("exporting"); setProgress(0);
    if (outUrl) { URL.revokeObjectURL(outUrl); setOutUrl(null); }
    try {
      const capture = v.captureStream ? v.captureStream() : v.mozCaptureStream!();
      const mime = pickMime();
      chunksRef.current = [];
      const rec = new MediaRecorder(capture, { mimeType: mime });
      recRef.current = rec;
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      const done = new Promise<void>((resolve) => { rec.onstop = () => resolve(); });

      v.currentTime = start;
      await new Promise<void>((r) => { const h = () => { v.removeEventListener("seeked", h); r(); }; v.addEventListener("seeked", h); });
      rec.start(200);
      await v.play();

      const tick = () => {
        const cur = v.currentTime;
        setProgress(Math.min(100, Math.round(((cur - start) / (end - start)) * 100)));
        if (cur >= end || v.ended) {
          v.pause();
          if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      await done;
      const blob = new Blob(chunksRef.current, { type: mime });
      setOutUrl(URL.createObjectURL(blob));
      setProgress(100); setPhase("done");
    } catch (e) {
      setError(`Export failed: ${(e as Error).message}`);
      setPhase("ready");
    }
  }

  if (!ok) {
    return (
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-5">
        <div className="flex items-center gap-2 text-amber-300"><AlertTriangle className="h-4 w-4" /><h3 className="font-display text-sm font-bold">Editor needs a desktop browser</h3></div>
        <p className="mt-2 text-sm text-slate-400">The trim/export tool uses the browser&rsquo;s native media-capture API (Chrome, Edge or Firefox on desktop). Open this page there — nothing to install.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-ink-900/50 p-5">
      <div className="mb-1 flex items-center gap-2">
        <Scissors className="h-5 w-5 text-emerald-400" />
        <h3 className="font-display text-base font-bold text-white">Video Editor — trim &amp; clip</h3>
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">Live now</span>
      </div>
      <p className="mb-4 text-[13px] text-slate-400">Load a video, set the in/out points, export the trimmed clip. Runs entirely in your browser — nothing uploaded.</p>

      {phase === "empty" ? (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-700 bg-ink-950/40 py-10 text-center hover:border-emerald-500/40">
          <Upload className="h-6 w-6 text-emerald-400" />
          <span className="text-sm font-semibold text-white">Choose a video file</span>
          <span className="text-xs text-slate-500">MP4, WebM, MOV — stays on your device</span>
          <input type="file" accept="video/*" className="hidden" onChange={onFile} />
        </label>
      ) : (
        <>
          <video ref={videoRef} src={srcUrl || undefined} onLoadedMetadata={onLoaded} controls playsInline className="mb-3 aspect-video w-full rounded-lg bg-black" />
          {duration > 0 && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 flex justify-between text-xs font-semibold text-slate-400"><span>Start</span><span className="text-emerald-300">{fmt(start)}</span></span>
                  <input type="range" min={0} max={duration} step={0.1} value={start} onChange={(e) => setStart(Math.min(Number(e.target.value), end))} className="w-full accent-emerald-500" />
                </label>
                <label className="block">
                  <span className="mb-1 flex justify-between text-xs font-semibold text-slate-400"><span>End</span><span className="text-emerald-300">{fmt(end)}</span></span>
                  <input type="range" min={0} max={duration} step={0.1} value={end} onChange={(e) => setEnd(Math.max(Number(e.target.value), start))} className="w-full accent-emerald-500" />
                </label>
              </div>
              <p className="text-xs text-slate-500">Clip length: <span className="font-semibold text-slate-300">{fmt(Math.max(0, end - start))}</span> · export plays the range once to capture it, so it takes about that long.</p>

              {error && <p className="flex items-center gap-1.5 text-sm text-rose-400"><AlertTriangle className="h-4 w-4" /> {error}</p>}

              <div className="flex flex-wrap items-center gap-3">
                <button onClick={exportClip} disabled={phase === "exporting"} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-bold text-ink-950 hover:bg-emerald-400 disabled:opacity-60">
                  {phase === "exporting" ? <><Loader2 className="h-4 w-4 animate-spin" /> Exporting {progress}%</> : <><Scissors className="h-4 w-4" /> Trim &amp; export</>}
                </button>
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-emerald-300 hover:text-emerald-200">
                  <Upload className="h-3.5 w-3.5" /> Load another
                  <input type="file" accept="video/*" className="hidden" onChange={onFile} />
                </label>
                {phase === "done" && outUrl && (
                  <a href={outUrl} download="marketwar-clip.webm" className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-5 py-2.5 text-sm font-bold text-emerald-200 hover:bg-emerald-500/20"><Download className="h-4 w-4" /> Download clip</a>
                )}
              </div>

              {phase === "done" && outUrl && (
                <div>
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-300"><Play className="h-3.5 w-3.5" /> Your trimmed clip</p>
                  <video src={outUrl} controls className="aspect-video w-full rounded-lg bg-black" />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
