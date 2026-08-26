"use client";

// Render a video (Veo/Sora, async) and attach the finished MP4 to a post.
// Wired to /api/video-render (start → poll) and PublishToChannels. Demo-safe:
// with no Veo/Sora key it shows the honest "activates with a key" state; the
// pipeline, job polling and post-attach are fully wired.

import { useEffect, useRef, useState } from "react";
import { Clapperboard, Loader2, Clock, AlertTriangle, Download, ExternalLink } from "lucide-react";
import PublishToChannels from "@/components/PublishToChannels";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";

type VideoJob = {
  jobId: string; status: "queued" | "rendering" | "ready" | "failed" | "demo";
  mode: "live" | "demo"; provider: string; videoUrl: string | null; prompt: string; note: string;
  requestedSeconds?: number; seconds?: number;
};

/** A filename a person can find again, from what they actually asked for. */
function videoFileName(prompt: string, seconds?: number): string {
  const words = String(prompt || "").split("\n")[0].toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .split("-").filter(Boolean).slice(0, 6).join("-");
  return `marketwar-${words || "video"}${seconds ? `-${seconds}s` : ""}.mp4`;
}

export default function VideoRenderAndPublish() {
  const { activeBrand } = useActiveBrand();
  const [prompt, setPrompt] = useState("");
  // Asked for, rather than assumed. The renders came back at four seconds
  // because nothing in the chain ever named a length.
  const [seconds, setSeconds] = useState(15);
  // The price list, from the server. The browser never computes a price: that
  // would be a second source of truth about money, and the two would drift.
  const [lengths, setLengths] = useState<{ requested: number; delivered: number; acus: number; acusPerSecond: number; segments: number[]; provider: string; note: string }[]>([]);
  const [maxSingle, setMaxSingle] = useState(0);
  const [saved, setSaved] = useState<"" | "saving" | "done" | "failed">("");
  /** Lengths this deployment can plan but cannot yet deliver as one file. */
  const [withheld, setWithheld] = useState<{ seconds: number; segments: number[]; why: string }[]>([]);
  const [job, setJob] = useState<VideoJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [videoLive, setVideoLive] = useState<boolean | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { setJob(null); }, [activeBrand?.id]);
  // Reflect real capability: is a Veo/Sora key actually present in this deploy?
  useEffect(() => {
    let on = true;
    fetch("/api/health/live").then((r) => r.json()).then((d) => {
      if (!on || !Array.isArray(d?.capabilities)) return;
      setVideoLive(Boolean(d.capabilities.find((c: { capability: string; ready: boolean }) => c.capability === "Video render (Veo/Sora)")?.ready));
    }).catch(() => {});
    return () => { on = false; };
  }, []);

  // What each length will really deliver, and really cost, on the provider this
  // deployment is actually configured with.
  useEffect(() => {
    let on = true;
    fetch("/api/video-render").then((r) => r.json()).then((d) => {
      if (!on || !Array.isArray(d?.lengths)) return;
      setLengths(d.lengths);
      if (typeof d.defaultSeconds === "number") setSeconds(d.defaultSeconds);
      if (typeof d.maxSingleRenderSeconds === "number") setMaxSingle(d.maxSingleRenderSeconds);
      if (Array.isArray(d.withheld)) setWithheld(d.withheld);
    }).catch(() => {});
    return () => { on = false; };
  }, []);

  const chosen = lengths.find((l) => l.delivered === seconds) || null;

  async function start() {
    if (!activeBrand || !prompt.trim()) return;
    setBusy(true); setJob(null);
    try {
      const r = await authedFetch("/api/video-render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", brandId: activeBrand.id, prompt, seconds }) });
      const j = (await r.json()) as VideoJob;
      setJob(j);
      if (j.status === "rendering") poll(j.jobId);
    } finally { setBusy(false); }
  }

  /** File the finished render in the work library by hand. */
  async function saveToLibrary() {
    if (!job?.videoUrl || !activeBrand) return;
    setSaved("saving");
    try {
      const r = await authedFetch("/api/work", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save", brandId: activeBrand.id, kind: "video",
          source: "video-creator", sourceName: "AI Video Creator",
          title: (prompt.split("\n")[0] || "Video").slice(0, 80),
          output: job.videoUrl,
          input: { prompt, seconds: String(job.seconds ?? ""), engine: job.provider ?? "", jobId: job.jobId },
        }),
      });
      setSaved(r.ok ? "done" : "failed");
    } catch { setSaved("failed"); }
  }

  function poll(jobId: string) {
    timer.current = setTimeout(async () => {
      try {
        const r = await authedFetch("/api/video-render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", jobId }) });
        const j = (await r.json()) as VideoJob;
        setJob(j);
        if (j.status === "rendering") poll(jobId);
      } catch { /* stop polling on error */ }
    }, 5000);
  }

  return (
    <div className="mb-8 card border-emerald-500/20 p-5">
      <div className="mb-1 flex items-center gap-2">
        <Clapperboard className="h-4 w-4 text-emerald-400" />
        <h2 className="font-display font-bold text-white">AI Video Creator — render &amp; publish</h2>
        {videoLive === true && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">Live now</span>}
      </div>
      <p className="mb-3 text-xs text-slate-400">
        Describe the video; the render pipeline produces an MP4 and attaches it to a post.{" "}
        {videoLive === true
          ? "Rendering is live (Veo / Sora) — press Render and the MP4 renders, hosts and is ready to publish."
          : videoLive === false
            ? "Live rendering activates the moment a Veo (GEMINI_API_KEY) or Sora (OPENAI_API_KEY) key is set."
            : "The pipeline, job polling and post-attach are fully wired."}
      </p>

      <textarea className="input min-h-[70px]" placeholder="e.g. 8-second vertical clip of the flame-grilled platter, steam rising, hands reaching in, warm cinematic lighting" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="label mb-0">Length</label>
        {/* The price is on the option, so the choice is made with the cost in
            view rather than discovered on the bill. Lengths come from the
            server for the provider actually configured here — a hard-coded list
            would go stale the day a model's limits change. */}
        {/* EVERY ROW IS A DIFFERENT VIDEO NOW. The menu used to list four
            lengths where the engine makes two, so "12 seconds — 281 ACUs
            (returns 8s)" and "15 seconds — 281 ACUs (returns 8s)" were the
            same eight-second clip under two longer names. The price was right
            for what arrived and the NAME was not, which reads as either free
            extra video or charging for what we do not deliver. The server
            de-duplicates by what actually arrives, and the per-second rate is
            printed so the proportion is checkable on the screen. */}
        <select className="input max-w-[300px]" value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
          {(lengths.length ? lengths : [{ requested: 8, delivered: 8, acus: 0, acusPerSecond: 0, segments: [8], provider: "demo", note: "" }]).map((l) => (
            <option key={l.delivered} value={l.delivered}>
              {l.delivered} seconds{l.acus ? ` — ${l.acus} ACUs (${l.acusPerSecond}/second)` : ""}
              {l.segments.length > 1 ? ` · ${l.segments.length} clips` : ""}
            </option>
          ))}
        </select>
      </div>
      {chosen && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
          {chosen.acus > 0
            ? `${chosen.acus} ACUs, charged when the render starts and refunded in full if it fails — priced at ${chosen.acusPerSecond} ACUs a second, on ${chosen.provider}, the cheapest engine that makes this length exactly.`
            : "No render engine is configured on this deployment, so nothing renders and nothing is charged."}
          {chosen.note ? ` ${chosen.note}` : ""}
          {/* WHAT ARRIVES, before the money moves. A twelve- or fifteen-second
              ad is longer than either engine renders in one call, so it is made
              of clips that sum exactly to it — and the customer is told that
              here rather than discovering it in their library. */}
          {chosen.segments && chosen.segments.length > 1 && (
            <> Rendered as {chosen.segments.length} pieces ({chosen.segments.map((n) => `${n}s`).join(" + ")}) and joined into ONE {chosen.delivered}-second file before it is handed over — no engine makes this length in a single call. Either every piece is produced and joined or the whole render is refunded; you are never handed a short video at the full price.</>
          )}
          {maxSingle > 0 && chosen.segments && chosen.segments.length === 1 && (
            <> {maxSingle} seconds is the longest single clip this engine makes.</>
          )}
        </p>
      )}
      {/* A LENGTH THAT VANISHED NEEDS A REASON. Silently dropping 15 seconds
          from the menu reads as a bug; naming the one setting that returns it
          is the difference between a limitation and a fault. */}
      {withheld.length > 0 && (
        <p className="mt-2 rounded-lg border border-white/10 bg-ink-900/50 p-3 text-[11px] leading-relaxed text-slate-400">
          <span className="font-semibold text-slate-300">
            {withheld.map((w) => `${w.seconds}s`).join(" and ")} {withheld.length === 1 ? "is" : "are"} not on the list here.
          </span>{" "}
          {withheld[0].why}
        </p>
      )}

      <button className="btn-primary mt-3" onClick={start} disabled={busy || !activeBrand || !prompt.trim()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
        Render video{chosen?.acus ? ` — ${chosen.acus} ACUs` : ""}
      </button>

      {job && (
        <div className="mt-3">
          {job.status === "rendering" && <p className="flex items-center gap-2 text-sm text-amber-300"><Loader2 className="h-4 w-4 animate-spin" /> Rendering via {job.provider}… (this can take a few minutes)</p>}
          {job.status === "demo" && <p className="flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3 text-sm text-amber-200"><Clock className="h-4 w-4" /> {job.note}</p>}
          {job.status === "failed" && <p className="flex items-center gap-2 text-sm text-rose-300"><AlertTriangle className="h-4 w-4" /> {job.note}</p>}
          {job.status === "ready" && job.videoUrl && (
            <div>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={job.videoUrl} controls playsInline preload="metadata" className="mb-2 w-full max-w-md rounded-lg border border-white/[0.08] bg-black" />
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {/* THROUGH THE SHARED DOWNLOAD PROXY.
                    Two faults, one after the other, both mine. First this was
                    `<a href={videoUrl} download>` — and `download` is ignored
                    on a cross-origin link, so the click navigated to storage
                    and the browser PLAYED the video. Then I wrote a new route
                    behind `resolveBrandAccess`, and a plain link cannot send an
                    Authorization header, so it answered "Authentication
                    required". /api/download has done this correctly since the
                    ad canvas needed it: same-origin, host-allowlisted,
                    Content-Disposition, no header required. One proxy, not
                    three. */}
                <a href={`/api/download?url=${encodeURIComponent(job.videoUrl)}&name=${encodeURIComponent(videoFileName(prompt, job.seconds))}`} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/20"><Download className="h-3.5 w-3.5" /> Download MP4</a>
                <a href={job.videoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white">Open in new tab <ExternalLink className="h-3 w-3" /></a>
                {/* A SECOND WAY INTO THE LIBRARY. The render files itself on
                    completion, but a filing that fails must not leave a paid
                    video with nowhere to live — and the owner has already lost
                    one that way. One click, and it says which it was. */}
                <button
                  onClick={() => void saveToLibrary()}
                  disabled={saved === "saving"}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-60"
                >
                  {saved === "saving" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  {saved === "done" ? "In your library" : saved === "failed" ? "Save failed — retry" : "Save to library"}
                </button>
              </div>
              <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
                {job.note} Clips are up to ~8&thinsp;s (the model&rsquo;s max per render) — stitch a few in the Video Editor for longer.{" "}
                <span className="text-slate-400">To publish:</span> use the buttons below (the video is already attached), or <span className="text-slate-400">Download MP4</span> and upload it in each app. That storage link is the source file, not a public page — don&rsquo;t share it directly.
              </p>
              <PublishToChannels defaultText={prompt} defaultMediaUrls={[job.videoUrl]} sourceLabel="video" />
            </div>
          )}
          {job.status === "ready" && !job.videoUrl && <p className="text-sm text-amber-300">{job.note}</p>}
        </div>
      )}
    </div>
  );
}
