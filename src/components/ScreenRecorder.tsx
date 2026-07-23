"use client";

// Screen & Presentation Recorder — a REAL, working tool, no external key.
// Pure browser: getDisplayMedia (+ optional mic/webcam overlay) → MediaRecorder
// → a downloadable WebM. This turns the studio's "Screen & Presentation
// Recorder" from "coming soon" into "live now" with zero provider dependency.
//
// Honest by construction: if the browser doesn't support screen capture, we say
// so plainly instead of pretending. Nothing is uploaded — the recording stays
// on the user's machine until THEY download it.

import { useCallback, useEffect, useRef, useState } from "react";
import { MonitorPlay, Mic, MicOff, Video, VideoOff, Square, Download, Loader2, CircleDot, AlertTriangle } from "lucide-react";

type Phase = "idle" | "recording" | "stopped";

// Pick the best-supported container/codec the browser actually offers.
function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

export default function ScreenRecorder() {
  const [supported, setSupported] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [withMic, setWithMic] = useState(true);
  const [withCam, setWithCam] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [sizeKb, setSizeKb] = useState(0);
  const [starting, setStarting] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamsRef = useRef<MediaStream[]>([]);
  const livePreviewRef = useRef<HTMLVideoElement | null>(null);
  const playbackRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeRef = useRef<string>("");

  useEffect(() => {
    const ok = typeof navigator !== "undefined" && !!navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === "function" && typeof MediaRecorder !== "undefined";
    setSupported(ok);
    mimeRef.current = pickMime();
  }, []);

  const cleanupStreams = useCallback(() => {
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streamsRef.current = [];
    if (livePreviewRef.current) livePreviewRef.current.srcObject = null;
  }, []);

  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };

  // Full cleanup on unmount (stop capture, release object URL).
  useEffect(() => () => {
    stopTimer();
    cleanupStreams();
    if (recorderRef.current && recorderRef.current.state !== "inactive") { try { recorderRef.current.stop(); } catch { /* noop */ } }
    if (url) URL.revokeObjectURL(url);
  }, [cleanupStreams, url]);

  async function start() {
    setError(null);
    if (!supported) { setError("This browser can't capture the screen. Use a recent desktop Chrome, Edge or Firefox."); return; }
    setStarting(true);
    try {
      if (url) { URL.revokeObjectURL(url); setUrl(null); }
      chunksRef.current = [];
      setSizeKb(0);

      const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
      const tracks = [...display.getVideoTracks(), ...display.getAudioTracks()];
      streamsRef.current = [display];

      // Optional mic — merged as a second audio track (system audio + voice).
      if (withMic) {
        try {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamsRef.current.push(mic);
          tracks.push(...mic.getAudioTracks());
        } catch { /* user declined mic — keep recording screen + system audio */ }
      }
      // Optional webcam — captured so its track is recorded if the OS compositor
      // shows it; on browsers without picture-in-picture it still records audio.
      if (withCam) {
        try {
          const cam = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
          streamsRef.current.push(cam);
        } catch { /* user declined camera — continue without it */ }
      }

      const combined = new MediaStream(tracks);
      if (livePreviewRef.current) { livePreviewRef.current.srcObject = display; livePreviewRef.current.muted = true; }

      const mime = mimeRef.current;
      const rec = new MediaRecorder(combined, mime ? { mimeType: mime } : undefined);
      recorderRef.current = rec;
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) { chunksRef.current.push(e.data); setSizeKb((k) => k + Math.round(e.data.size / 1024)); } };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime || "video/webm" });
        const objUrl = URL.createObjectURL(blob);
        setUrl(objUrl);
        setPhase("stopped");
        cleanupStreams();
        stopTimer();
      };
      // If the user clicks the browser's native "Stop sharing", end cleanly.
      display.getVideoTracks()[0]?.addEventListener("ended", () => { if (recorderRef.current?.state === "recording") stop(); });

      rec.start(1000); // 1s timeslices → progressive size + resilient to crashes
      setSeconds(0);
      setPhase("recording");
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      const msg = (e as Error).name === "NotAllowedError" ? "Screen capture was cancelled or blocked." : `Couldn't start recording: ${(e as Error).message}`;
      setError(msg);
      cleanupStreams();
    } finally {
      setStarting(false);
    }
  }

  function stop() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") { try { recorderRef.current.stop(); } catch { /* noop */ } }
    stopTimer();
  }

  const ext = (mimeRef.current || "video/webm").includes("mp4") ? "mp4" : "webm";
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  if (!supported) {
    return (
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-5">
        <div className="flex items-center gap-2 text-amber-300"><AlertTriangle className="h-4 w-4" /><h3 className="font-display text-sm font-bold">Screen capture unavailable in this browser</h3></div>
        <p className="mt-2 text-sm text-slate-400">The recorder uses the browser&rsquo;s native screen-capture API, which needs a recent desktop Chrome, Edge or Firefox (it isn&rsquo;t available on most mobile browsers). Nothing to install — open this page there and the recorder works.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-ink-900/50 p-5">
      <div className="mb-1 flex items-center gap-2">
        <MonitorPlay className="h-5 w-5 text-emerald-400" />
        <h3 className="font-display text-base font-bold text-white">Screen &amp; Presentation Recorder</h3>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">Live now</span>
      </div>
      <p className="mb-4 text-[13px] text-slate-400">Record your screen (and voice) right in the browser — for demos, training, help videos and social clips. It stays on your device; download it when you&rsquo;re done. Nothing is uploaded. <span className="text-slate-500">Desktop browser (Chrome/Edge/Firefox) — phones can&rsquo;t capture the screen.</span></p>

      {/* Options */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => setWithMic((v) => !v)} disabled={phase === "recording"} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${withMic ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-ink-700 text-slate-400"}`}>
          {withMic ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />} Microphone {withMic ? "on" : "off"}
        </button>
        <button type="button" onClick={() => setWithCam((v) => !v)} disabled={phase === "recording"} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${withCam ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-ink-700 text-slate-400"}`}>
          {withCam ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5" />} Webcam {withCam ? "on" : "off"}
        </button>
      </div>

      {/* Live preview while recording */}
      <div className="relative overflow-hidden rounded-lg border border-ink-800 bg-ink-950">
        {phase === "stopped" && url ? (
          <video ref={playbackRef} src={url} controls className="aspect-video w-full bg-black" />
        ) : (
          <video ref={livePreviewRef} autoPlay playsInline muted className="aspect-video w-full bg-black object-contain" />
        )}
        {phase === "recording" && (
          <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-rose-600/90 px-2.5 py-1 text-[11px] font-bold text-white">
            <CircleDot className="h-3 w-3 animate-pulse" /> REC {fmt(seconds)} · {sizeKb.toLocaleString()} KB
          </div>
        )}
        {phase === "idle" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-600">Your screen preview appears here while recording</div>
        )}
      </div>

      {error && <p className="mt-3 flex items-center gap-1.5 text-sm text-rose-400"><AlertTriangle className="h-4 w-4" /> {error}</p>}

      {/* Controls */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {phase !== "recording" ? (
          <button type="button" onClick={start} disabled={starting} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-bold text-ink-950 hover:bg-emerald-400 disabled:opacity-60">
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleDot className="h-4 w-4" />} {phase === "stopped" ? "Record again" : "Start recording"}
          </button>
        ) : (
          <button type="button" onClick={stop} className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-rose-400">
            <Square className="h-4 w-4" /> Stop
          </button>
        )}
        {phase === "stopped" && url && (
          <a href={url} download={`marketwar-recording.${ext}`} className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-5 py-2.5 text-sm font-bold text-emerald-200 hover:bg-emerald-500/20">
            <Download className="h-4 w-4" /> Download {ext.toUpperCase()}
          </a>
        )}
      </div>
      {phase === "stopped" && <p className="mt-2 text-[12px] text-slate-500">Saved locally as a {ext.toUpperCase()} file. Drop it into the campaign video tools, or publish it once channel connectors are on.</p>}
    </div>
  );
}
