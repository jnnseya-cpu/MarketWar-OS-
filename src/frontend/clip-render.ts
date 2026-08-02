// Cut a clip to 9:16 with its captions burned in — in the browser, no vendor.
//
// The render step was described as needing FFMPEG_CLOUD_API_KEY or
// VIDEO_WORKER_SECRET. Only the first of those is a vendor (api.ffmpeg-micro.com);
// the second is a shared secret for a container in worker/ that MarketWar runs
// itself. But the honest answer to "we are not signing up for a new vendor" is
// that this particular job needs neither, because the machine that already has
// the video is the customer's own.
//
// VideoEditor.tsx has cut segments in-browser for a while: captureStream() on a
// <video> into a MediaRecorder. This adds the two things that make the output a
// SHORT rather than a trimmed landscape file — a 9:16 crop and burned captions —
// by drawing each frame to a canvas and recording the canvas instead.
//
// WHAT THIS COSTS: nothing, to anyone. No upload, no queue, no per-minute
// render bill, and the video never leaves the machine it is already on. Under
// the pricing law that makes it a nominal-charge action rather than a metered
// one — we are not passing on a cost we do not bear.
//
// WHAT IT COSTS THE CUSTOMER: real time. MediaRecorder records a playing
// element, so a forty-second clip takes forty seconds. A server farm is faster.
// This is stated on the screen rather than discovered, because a progress bar
// that looks stuck is worse than a wait somebody expected.
//
// WHY A LOCAL FILE AND NOT THE URL: drawing a cross-origin video onto a canvas
// taints it, and a tainted canvas refuses to produce a stream — silently, in
// some browsers, and with a security error in others. A file the customer picks
// is same-origin by construction. It also sidesteps the 25MB transcription
// limit entirely: only the AUDIO has to be small enough for Whisper, while the
// cutting happens against the full-quality original.

export type CaptionCue = { start: number; end: number; text: string };

/** Parse an .srt into cues. Times are already clip-relative from srtForClip(). */
export function parseSrt(srt: string): CaptionCue[] {
  const cues: CaptionCue[] = [];
  for (const block of (srt || "").trim().split(/\n\s*\n/)) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    const timing = lines.find((l) => l.includes("-->"));
    if (!timing) continue;
    const [from, to] = timing.split("-->").map((s) => s.trim());
    const text = lines.slice(lines.indexOf(timing) + 1).join(" ");
    if (!text) continue;
    cues.push({ start: srtSeconds(from), end: srtSeconds(to), text });
  }
  return cues;
}

function srtSeconds(stamp: string): number {
  const m = stamp.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
}

export type RenderOptions = {
  startSec: number;
  endSec: number;
  /** Clip-relative cues, as srtForClip() produces them. */
  cues?: CaptionCue[];
  /**
   * Where the 9:16 column sits across the source frame. 0 = hard left,
   * 0.5 = centre, 1 = hard right.
   *
   * This is the honest version of "auto-reframe": a person moves it while
   * watching the preview. Tracking a speaker's face needs per-frame detection
   * that would either be a model call per frame or a guess, and a guess that
   * crops someone out of their own video is worse than a centre crop that
   * never pretends to be clever.
   */
  focusX?: number;
  /** Burn the captions into the frame. Off keeps the .srt as a sidecar file. */
  burnCaptions?: boolean;
  captionStyle?: { fontPx?: number; bottomPad?: number };
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
};

export type RenderResult = { blob: Blob; mimeType: string; durationSec: number };

/** Is in-browser rendering possible here at all? */
export function renderSupported(): boolean {
  if (typeof document === "undefined" || typeof MediaRecorder === "undefined") return false;
  const c = document.createElement("canvas") as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream };
  const v = document.createElement("video") as HTMLVideoElement & { captureStream?: () => MediaStream };
  return typeof c.captureStream === "function" && (typeof v.captureStream === "function" || typeof (v as unknown as { mozCaptureStream?: () => MediaStream }).mozCaptureStream === "function");
}

export function pickMime(): string {
  // Safari's MediaRecorder produces MP4; Chrome and Firefox produce WebM. Both
  // upload fine everywhere, so we take whatever the browser actually supports
  // rather than insisting on one container.
  const candidates = [
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "video/webm";
}

/**
 * The 9:16 source rectangle for a given frame, and where it lands on the canvas.
 *
 * Pulled out and exported because it is the one piece of real geometry here and
 * it is worth being able to test without a browser. A source that is ALREADY
 * taller than 9:16 (someone's phone footage) must be cropped top-and-bottom
 * instead of left-and-right, or the output gets pillarboxed black bars that no
 * amount of "vertical video" labelling makes acceptable.
 */
export function cropRect(
  srcW: number, srcH: number, focusX = 0.5,
): { sx: number; sy: number; sw: number; sh: number } {
  const targetAspect = 9 / 16;
  const srcAspect = srcW / srcH;

  if (srcAspect > targetAspect) {
    // Wider than 9:16 — take a full-height column and slide it horizontally.
    const sw = srcH * targetAspect;
    const sx = Math.max(0, Math.min(srcW - sw, (srcW - sw) * clamp01(focusX)));
    return { sx, sy: 0, sw, sh: srcH };
  }
  // Taller than 9:16 — take a full-width band from the middle.
  const sh = srcW / targetAspect;
  return { sx: 0, sy: Math.max(0, (srcH - sh) / 2), sw: srcW, sh: Math.min(sh, srcH) };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0.5));

/** Which cue is on screen at this clip-relative time, or "". */
export function cueAt(cues: CaptionCue[], t: number): string {
  for (const c of cues) if (t >= c.start && t <= c.end) return c.text;
  return "";
}

/**
 * Break a caption line to fit the frame.
 *
 * Two lines maximum. A caption that fills half the screen covers the thing the
 * viewer came to see, and every platform puts its own UI over the bottom fifth.
 */
export function wrapCaption(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 2): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !line) { line = next; continue; }
    lines.push(line); line = w;
    // The cap lives here, not in a slice on the way out: once two lines are
    // full the rest of the sentence is dropped rather than measured and thrown
    // away, and the trailing push below cannot overflow because it checks.
    if (lines.length === maxLines) return lines;
  }
  if (lines.length < maxLines && line) lines.push(line);
  return lines;
}

const OUT_W = 1080, OUT_H = 1920;

export async function renderClip(file: File, opts: RenderOptions): Promise<RenderResult> {
  if (!renderSupported()) {
    throw new Error("This browser cannot record a canvas. Chrome, Edge or Firefox on a desktop can; download the subtitles and the timecodes and cut it in any editor instead.");
  }
  const start = Math.max(0, opts.startSec);
  const end = Math.max(start + 0.1, opts.endSec);
  const span = end - start;
  const cues = opts.cues ?? [];
  const fontPx = opts.captionStyle?.fontPx ?? 54;
  const bottomPad = opts.captionStyle?.bottomPad ?? 320;

  const url = URL.createObjectURL(file);
  const video = document.createElement("video") as HTMLVideoElement & {
    captureStream?: () => MediaStream;
    mozCaptureStream?: () => MediaStream;
  };
  video.src = url;
  video.playsInline = true;
  video.preload = "auto";

  const canvas = document.createElement("canvas");
  canvas.width = OUT_W; canvas.height = OUT_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) { URL.revokeObjectURL(url); throw new Error("Could not open a drawing surface."); }

  let raf = 0;
  const cleanup = () => {
    if (raf) cancelAnimationFrame(raf);
    video.pause();
    URL.revokeObjectURL(url);
  };

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("That file could not be decoded as video in this browser."));
    });

    if (video.duration && start >= video.duration) {
      throw new Error(`The clip starts at ${Math.round(start)}s but this file is only ${Math.round(video.duration)}s long — it looks like a different video from the one that was transcribed.`);
    }

    const crop = cropRect(video.videoWidth || 1920, video.videoHeight || 1080, opts.focusX ?? 0.5);

    // Video comes from the canvas (cropped, captioned); audio comes from the
    // element. Combining them is what makes the recording a clip rather than a
    // silent animation.
    const canvasStream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
    const elementStream = video.captureStream ? video.captureStream() : video.mozCaptureStream!();
    const mixed = new MediaStream([...canvasStream.getVideoTracks(), ...elementStream.getAudioTracks()]);

    const mimeType = pickMime();
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(mixed, { mimeType });
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise<void>((resolve) => { rec.onstop = () => resolve(); });

    video.currentTime = start;
    await new Promise<void>((r) => {
      const h = () => { video.removeEventListener("seeked", h); r(); };
      video.addEventListener("seeked", h);
    });

    rec.start(200);
    await video.play();

    const draw = () => {
      const t = video.currentTime;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, OUT_W, OUT_H);
      ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, OUT_W, OUT_H);

      if (opts.burnCaptions !== false && cues.length) {
        const line = cueAt(cues, t - start);
        if (line) {
          ctx.font = `700 ${fontPx}px system-ui, -apple-system, "Segoe UI", sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "alphabetic";
          const rows = wrapCaption(ctx, line, OUT_W - 120);
          const lineH = fontPx * 1.25;
          rows.forEach((row, i) => {
            const y = OUT_H - bottomPad + i * lineH;
            // Stroke behind fill so the words stay readable over any footage —
            // white-on-white is the most common way a burned caption vanishes.
            ctx.lineWidth = Math.max(6, fontPx / 6);
            ctx.strokeStyle = "rgba(0,0,0,0.85)";
            ctx.strokeText(row, OUT_W / 2, y);
            ctx.fillStyle = "#fff";
            ctx.fillText(row, OUT_W / 2, y);
          });
        }
      }

      opts.onProgress?.(Math.min(100, Math.round(((t - start) / span) * 100)));

      if (opts.signal?.aborted || t >= end || video.ended) {
        video.pause();
        if (rec.state !== "inactive") rec.stop();
        return;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    await stopped;
    if (opts.signal?.aborted) throw new Error("Cancelled.");
    opts.onProgress?.(100);
    return { blob: new Blob(chunks, { type: mimeType }), mimeType, durationSec: span };
  } finally {
    cleanup();
  }
}

/** File extension matching whatever the browser actually recorded. */
export function extFor(mimeType: string): string {
  return mimeType.includes("mp4") ? "mp4" : "webm";
}
