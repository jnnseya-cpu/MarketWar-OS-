"use client";

// Screen & Presentation Recorder — the whole screen, with you on it.
//
// WHAT WAS BROKEN, BECAUSE IT MATTERS MORE THAN WHAT WAS ADDED.
//
// "Webcam on" acquired the camera and never put it anywhere. The track was
// fetched, pushed onto a cleanup array, and left out of the recorded stream
// entirely — the comment hoped "the OS compositor shows it", which no browser
// does. So the light came on, the presenter believed they were in shot, and the
// finished file had no face in it. That is the boundary defect this repository
// keeps producing, in its most expensive form: it takes somebody's camera
// permission and their take, and gives back neither.
//
// The microphone had a quieter version of the same fault. System audio and mic
// were added as two separate tracks; MediaRecorder writes ONE audio track to
// WebM, so the second was silently dropped and a narrated demo came back with
// no narration.
//
// HOW IT WORKS NOW.
//
//   screen video ─┐
//                 ├─► <canvas> composited every frame ─► captureStream() ─┐
//   camera video ─┘                                                       ├─► MediaRecorder ─► WebM
//   system audio ─┐                                                       │
//                 ├─► AudioContext mix ─► one audio track ────────────────┘
//   microphone   ─┘
//
// The canvas is the recording, so what is drawn is what is saved — the preview
// and the file cannot disagree. Dragging the presenter moves it in the output
// too, live, mid-take, because there is only one place the position exists.
//
// Still no key, no upload, no provider. It stays on the machine until the
// person downloads it.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MonitorPlay, Mic, MicOff, Video, VideoOff, Square, Download, Loader2,
  CircleDot, AlertTriangle, Move,
} from "lucide-react";
import {
  presenterRect, cornerPlacement, coverCrop, placementFromDrag, nearestCorner, captureSize, recordingTracks,
  SIZE_FRACTION, type PresenterSize, type PresenterShape, type Corner, type Placement,
} from "@/shared/recorder-layout";

type Phase = "idle" | "recording" | "stopped";

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

const CORNERS: { id: Corner; label: string }[] = [
  { id: "top-left", label: "Top left" },
  { id: "top-right", label: "Top right" },
  { id: "bottom-left", label: "Bottom left" },
  { id: "bottom-right", label: "Bottom right" },
];

// What to actually DO about a blocked camera. "Allow the camera for this site"
// is not instructions — Chrome hides the control behind an icon most people
// have never pressed, and once blocked it never prompts again.
const CAMERA_BLOCKED_HELP =
  "Your browser is blocking the camera for this site, so nothing was recorded — your take is safe. " +
  "To fix it: click the camera or padlock icon at the left of the address bar, set Camera to Allow, reload this page, then start again. " +
  "Or turn \u201cShow me on screen\u201d off and record the screen alone.";

export default function ScreenRecorder() {
  const [supported, setSupported] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [withMic, setWithMic] = useState(true);
  const [withCam, setWithCam] = useState(false);
  const [size, setSize] = useState<PresenterSize>("medium");
  const [shape, setShape] = useState<PresenterShape>("circle");
  const [placement, setPlacement] = useState<Placement>({ x: 0.025, y: 0.72 });
  const [dragging, setDragging] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [sizeKb, setSizeKb] = useState(0);
  const [starting, setStarting] = useState(false);
  const [camLive, setCamLive] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamsRef = useRef<MediaStream[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenVidRef = useRef<HTMLVideoElement | null>(null);
  const camVidRef = useRef<HTMLVideoElement | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const playbackRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeRef = useRef<string>("");

  // The compositor reads these every frame. Refs, not state, because a value
  // captured in the animation closure would freeze at whatever it was when the
  // recording started — the drag would move the on-screen box and not the file.
  const layoutRef = useRef({ size, shape, placement, withCam });
  useEffect(() => { layoutRef.current = { size, shape, placement, withCam }; }, [size, shape, placement, withCam]);

  useEffect(() => {
    const ok = typeof navigator !== "undefined"
      && !!navigator.mediaDevices
      && typeof navigator.mediaDevices.getDisplayMedia === "function"
      && typeof MediaRecorder !== "undefined"
      && typeof HTMLCanvasElement !== "undefined"
      && typeof HTMLCanvasElement.prototype.captureStream === "function";
    setSupported(ok);
    mimeRef.current = pickMime();
  }, []);

  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  const stopRaf = () => { if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } };

  const cleanupStreams = useCallback(() => {
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streamsRef.current = [];
    if (screenVidRef.current) screenVidRef.current.srcObject = null;
    if (camVidRef.current) camVidRef.current.srcObject = null;
    if (audioCtxRef.current) { try { void audioCtxRef.current.close(); } catch { /* already closed */ } audioCtxRef.current = null; }
    setCamLive(false);
  }, []);

  useEffect(() => () => {
    stopTimer(); stopRaf(); cleanupStreams();
    if (recorderRef.current && recorderRef.current.state !== "inactive") { try { recorderRef.current.stop(); } catch { /* noop */ } }
    if (url) URL.revokeObjectURL(url);
  }, [cleanupStreams, url]);

  /** One composited frame: the screen, then the presenter on top of it. */
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const screenVid = screenVidRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !screenVid) return;

    const { w, h } = { w: canvas.width, h: canvas.height };
    ctx.clearRect(0, 0, w, h);

    // The screen, letterboxed rather than stretched — the canvas is sized from
    // the display track, but a track can change resolution mid-share when the
    // user switches which window they are presenting.
    if (screenVid.videoWidth > 0) {
      const crop = coverCrop(screenVid.videoWidth, screenVid.videoHeight, w, h);
      ctx.drawImage(screenVid, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
    }

    const { size: s, shape: sh, placement: p, withCam: cam } = layoutRef.current;
    const camVid = camVidRef.current;
    if (cam && camVid && camVid.videoWidth > 0) {
      const box = presenterRect({ canvasW: w, canvasH: h, camW: camVid.videoWidth, camH: camVid.videoHeight, size: s, placement: p });
      const crop = coverCrop(camVid.videoWidth, camVid.videoHeight, box.w, box.h);

      ctx.save();
      ctx.beginPath();
      if (sh === "circle") {
        const r = Math.min(box.w, box.h) / 2;
        ctx.arc(box.x + box.w / 2, box.y + box.h / 2, r, 0, Math.PI * 2);
      } else {
        const r = Math.round(Math.min(box.w, box.h) * 0.12);
        ctx.moveTo(box.x + r, box.y);
        ctx.arcTo(box.x + box.w, box.y, box.x + box.w, box.y + box.h, r);
        ctx.arcTo(box.x + box.w, box.y + box.h, box.x, box.y + box.h, r);
        ctx.arcTo(box.x, box.y + box.h, box.x, box.y, r);
        ctx.arcTo(box.x, box.y, box.x + box.w, box.y, r);
      }
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(camVid, crop.x, crop.y, crop.w, crop.h, box.x, box.y, box.w, box.h);
      ctx.restore();

      // A rim, so a dark shirt against a dark slide is still a person and not a
      // smudge.
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = Math.max(2, Math.round(w * 0.0022));
      ctx.beginPath();
      if (sh === "circle") {
        ctx.arc(box.x + box.w / 2, box.y + box.h / 2, Math.min(box.w, box.h) / 2, 0, Math.PI * 2);
      } else {
        const r = Math.round(Math.min(box.w, box.h) * 0.12);
        ctx.moveTo(box.x + r, box.y);
        ctx.arcTo(box.x + box.w, box.y, box.x + box.w, box.y + box.h, r);
        ctx.arcTo(box.x + box.w, box.y + box.h, box.x, box.y + box.h, r);
        ctx.arcTo(box.x, box.y + box.h, box.x, box.y, r);
        ctx.arcTo(box.x, box.y, box.x + box.w, box.y, r);
      }
      ctx.stroke();
      ctx.restore();
    }

    // The on-screen preview is a scaled copy of the very same canvas, so what is
    // watched is what is written. Two independent renderers is how a preview
    // starts telling a comfortable lie about the file.
    const pv = previewRef.current;
    const pctx = pv?.getContext("2d");
    if (pv && pctx) {
      if (pv.width !== w || pv.height !== h) { pv.width = w; pv.height = h; }
      pctx.drawImage(canvas, 0, 0);
    }
  }, []);

  const loop = useCallback(() => {
    drawFrame();
    rafRef.current = requestAnimationFrame(loop);
  }, [drawFrame]);

  async function start() {
    setError(null); setNote(null);
    if (!supported) { setError("This browser can't capture the screen. Use a recent desktop Chrome, Edge or Firefox."); return; }
    setStarting(true);
    try {
      if (url) { URL.revokeObjectURL(url); setUrl(null); }
      chunksRef.current = [];
      setSizeKb(0);

      // `displaySurface: "monitor"` asks the picker to offer the WHOLE screen
      // first, which is what a demo or a training video almost always wants —
      // it is a hint, not a lock, so choosing a single window still works.
      // `selfBrowserSurface: "exclude"` keeps this tab out of the list, because
      // recording the recorder produces the infinite-mirror effect and a
      // confusing first take.
      // THE CAMERA IS ASKED FOR FIRST, AND THAT ORDER IS THE WHOLE FIX.
      //
      // It used to be requested AFTER the screen picker, which meant: the user
      // chose a screen, sharing started, and only then did the camera fail —
      // and if permission had been blocked on a previous visit, Chrome shows no
      // prompt at all, so it failed silently. The person recorded a whole take
      // before discovering they were not in it.
      //
      // Asking first means a block is discovered while nothing is being
      // recorded, and the take is never wasted.
      let camStream: MediaStream | null = null;
      let camDenied = false;
      if (withCam) {
        try {
          camStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
        } catch {
          camDenied = true;
        }
        if (camDenied) {
          // Stop BEFORE the screen picker. Recording a take the person is not in,
          // when they asked to be in it, is the failure this whole component was
          // rewritten to prevent.
          setPhase("idle");
          setNote(CAMERA_BLOCKED_HELP);
          return;
        }
      }

      const display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, displaySurface: "monitor" },
        audio: true,
        selfBrowserSurface: "exclude",
        surfaceSwitching: "include",
      } as DisplayMediaStreamOptions);
      streamsRef.current = [display];

      const track = display.getVideoTracks()[0];
      const settings = track?.getSettings?.() || {};
      const { w, h } = captureSize(Number(settings.width) || 1280, Number(settings.height) || 720);

      const canvas = canvasRef.current || document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvasRef.current = canvas;

      const screenVid = screenVidRef.current!;
      screenVid.srcObject = display;
      screenVid.muted = true;
      await screenVid.play().catch(() => { /* autoplay is allowed here — this is a user gesture */ });

      // THE CAMERA, ACTUALLY IN THE RECORDING. Already acquired above, so by
      // this point it is known to work — there is no failure left to discover.
      if (camStream) {
        streamsRef.current.push(camStream);
        const camVid = camVidRef.current!;
        camVid.srcObject = camStream;
        camVid.muted = true;
        await camVid.play().catch(() => { /* same */ });
        setCamLive(true);
      }

      // ONE audio track, mixed. Two tracks means the second is dropped.
      const audioSources: MediaStream[] = [];
      if (display.getAudioTracks().length) audioSources.push(display);
      if (withMic) {
        try {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamsRef.current.push(mic);
          audioSources.push(mic);
        } catch { /* declined — the screen still records */ }
      }

      let mixedAudio: MediaStreamTrack[] = [];
      if (audioSources.length) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        const dest = ctx.createMediaStreamDestination();
        for (const s of audioSources) {
          if (!s.getAudioTracks().length) continue;
          ctx.createMediaStreamSource(s).connect(dest);
        }
        mixedAudio = dest.stream.getAudioTracks();
      }

      // Start compositing BEFORE captureStream, so the first frame is a picture
      // rather than a blank canvas.
      drawFrame();
      stopRaf();
      rafRef.current = requestAnimationFrame(loop);

      const canvasStream = canvas.captureStream(30);
      // The COMPOSITED canvas, never the raw display capture — the display
      // stream cannot contain the presenter, and that swap was the original bug.
      const chosen = recordingTracks({ canvasVideo: canvasStream.getVideoTracks(), mixedAudio });
      if (!chosen.ok) {
        stopRaf(); cleanupStreams();
        setError(chosen.error);
        return;
      }
      const combined = new MediaStream(chosen.tracks);

      const mime = mimeRef.current;
      const rec = new MediaRecorder(combined, mime ? { mimeType: mime } : undefined);
      recorderRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) { chunksRef.current.push(e.data); setSizeKb((k) => k + Math.round(e.data.size / 1024)); }
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime || "video/webm" });
        setUrl(URL.createObjectURL(blob));
        setPhase("stopped");
        stopRaf(); cleanupStreams(); stopTimer();
      };
      track?.addEventListener("ended", () => { if (recorderRef.current?.state === "recording") stop(); });

      rec.start(1000);
      setSeconds(0);
      setPhase("recording");
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);

      // Said plainly and at the start, not discovered afterwards. A recording
      // that quietly lacks the thing somebody switched on is the whole defect
      // this rewrite exists to remove.
      // THE INFINITE MIRROR. Choosing "Entire Screen" while this page is on that
      // screen records the recorder recording itself, forever. `selfBrowserSurface`
      // excludes this TAB from the picker but cannot exclude it from a whole
      // monitor. Said here rather than left to be discovered in playback.
      if ((settings as { displaySurface?: string }).displaySurface === "monitor") {
        setNote("Recording the whole screen — including this window, which is why the preview looks like a hall of mirrors. To avoid it, stop and choose the single window or tab you are demonstrating instead.");
      }
    } catch (e) {
      const msg = (e as Error).name === "NotAllowedError"
        ? "Screen capture was cancelled or blocked."
        : `Couldn't start recording: ${(e as Error).message}`;
      setError(msg);
      stopRaf();
      cleanupStreams();
    } finally {
      setStarting(false);
    }
  }

  function stop() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") { try { recorderRef.current.stop(); } catch { /* noop */ } }
    stopTimer();
  }

  // --- dragging the presenter, on the preview, live -------------------------
  const grabRef = useRef({ x: 0, y: 0 });

  function boxOnPreview(): { x: number; y: number; w: number; h: number } | null {
    const pv = previewRef.current;
    const camVid = camVidRef.current;
    if (!pv || !camVid || camVid.videoWidth === 0) return null;
    const shown = pv.getBoundingClientRect();
    const box = presenterRect({
      canvasW: shown.width, canvasH: shown.height,
      camW: camVid.videoWidth, camH: camVid.videoHeight,
      size, placement,
    });
    return box;
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!withCam || !camLive) return;
    const pv = previewRef.current;
    const box = boxOnPreview();
    if (!pv || !box) return;
    const r = pv.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    if (px < box.x || px > box.x + box.w || py < box.y || py > box.y + box.h) return;
    grabRef.current = { x: px - box.x, y: py - box.y };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragging) return;
    const pv = previewRef.current;
    const box = boxOnPreview();
    if (!pv || !box) return;
    const r = pv.getBoundingClientRect();
    setPlacement(placementFromDrag({
      pointerX: e.clientX - r.left, pointerY: e.clientY - r.top,
      previewW: r.width, previewH: r.height,
      boxW: box.w, boxH: box.h,
      grabX: grabRef.current.x, grabY: grabRef.current.y,
    }));
  }

  function endDrag(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragging) return;
    setDragging(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  }

  function snapTo(corner: Corner) {
    const camVid = camVidRef.current;
    setPlacement(cornerPlacement({
      corner, canvasW: 1600, canvasH: 900,
      camW: camVid?.videoWidth || 640, camH: camVid?.videoHeight || 480,
      size,
    }));
  }

  const ext = (mimeRef.current || "video/webm").includes("mp4") ? "mp4" : "webm";
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const activeCorner = nearestCorner(placement);

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
      <p className="mb-4 text-[13px] text-slate-400">
        Record your whole screen with yourself in the corner — for demos, training, help videos and social clips. Drag your picture anywhere on the frame, during the take. It stays on your device; download it when you&rsquo;re done. Nothing is uploaded.{" "}
        <span className="text-slate-500">Desktop browser (Chrome/Edge/Firefox) — phones can&rsquo;t capture the screen.</span>
      </p>

      {/* Sources */}
      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setWithMic((v) => !v)} disabled={phase === "recording"} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${withMic ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-ink-700 text-slate-400"}`}>
          {withMic ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />} Microphone {withMic ? "on" : "off"}
        </button>
        <button type="button" onClick={() => setWithCam((v) => !v)} disabled={phase === "recording"} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${withCam ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-ink-700 text-slate-400"}`}>
          {withCam ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5" />} Show me on screen {withCam ? "on" : "off"}
        </button>
      </div>

      {/* Presenter placement — usable before AND during a take. */}
      {withCam && (
        <div className="mb-4 rounded-lg border border-ink-800 bg-ink-950/50 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
            <Move className="h-3 w-3" /> Where you appear
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-1.5">
              {CORNERS.map((c) => (
                <button
                  key={c.id} type="button" onClick={() => snapTo(c.id)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition ${activeCorner === c.id ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-ink-700 text-slate-400 hover:text-slate-200"}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              {(Object.keys(SIZE_FRACTION) as PresenterSize[]).map((s) => (
                <button
                  key={s} type="button" onClick={() => setSize(s)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold capitalize transition ${size === s ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-ink-700 text-slate-400 hover:text-slate-200"}`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              {(["circle", "rounded"] as PresenterShape[]).map((s) => (
                <button
                  key={s} type="button" onClick={() => setShape(s)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold capitalize transition ${shape === s ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-ink-700 text-slate-400 hover:text-slate-200"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Or drag yourself straight onto the frame below — it moves in the recording as you drag, mid-take.</p>
        </div>
      )}

      {/* The frame. This canvas IS the recording, scaled down. */}
      <div className="relative overflow-hidden rounded-lg border border-ink-800 bg-ink-950">
        {phase === "stopped" && url ? (
          <video ref={playbackRef} src={url} controls className="aspect-video w-full bg-black" />
        ) : (
          <canvas
            ref={previewRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className={`aspect-video w-full bg-black object-contain ${withCam && camLive ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""}`}
          />
        )}
        {phase === "recording" && (
          <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-rose-600/90 px-2.5 py-1 text-[11px] font-bold text-white">
            <CircleDot className="h-3 w-3 animate-pulse" /> REC {fmt(seconds)} · {sizeKb.toLocaleString()} KB
          </div>
        )}
        {phase === "idle" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-600">Your screen appears here while recording</div>
        )}
      </div>

      {/* Off-screen sources for the compositor. Never shown: the canvas above is
          what anyone looks at, and these are its inputs. */}
      <video ref={screenVidRef} className="hidden" playsInline muted />
      <video ref={camVidRef} className="hidden" playsInline muted />

      {error && <p className="mt-3 flex items-center gap-1.5 text-sm text-rose-400"><AlertTriangle className="h-4 w-4" /> {error}</p>}
      {note && <p className="mt-3 flex items-center gap-1.5 text-sm text-amber-300"><AlertTriangle className="h-4 w-4" /> {note}</p>}

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
