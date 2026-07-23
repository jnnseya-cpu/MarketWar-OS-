"use client";

// Render a video (Veo/Sora, async) and attach the finished MP4 to a post.
// Wired to /api/video-render (start → poll) and PublishToChannels. Demo-safe:
// with no Veo/Sora key it shows the honest "activates with a key" state; the
// pipeline, job polling and post-attach are fully wired.

import { useEffect, useRef, useState } from "react";
import { Clapperboard, Loader2, Clock, AlertTriangle } from "lucide-react";
import PublishToChannels from "@/components/PublishToChannels";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";

type VideoJob = {
  jobId: string; status: "queued" | "rendering" | "ready" | "failed" | "demo";
  mode: "live" | "demo"; provider: string; videoUrl: string | null; prompt: string; note: string;
};

export default function VideoRenderAndPublish() {
  const { activeBrand } = useActiveBrand();
  const [prompt, setPrompt] = useState("");
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

  async function start() {
    if (!activeBrand || !prompt.trim()) return;
    setBusy(true); setJob(null);
    try {
      const r = await authedFetch("/api/video-render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", brandId: activeBrand.id, prompt }) });
      const j = (await r.json()) as VideoJob;
      setJob(j);
      if (j.status === "rendering") poll(j.jobId);
    } finally { setBusy(false); }
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
      <button className="btn-primary mt-3" onClick={start} disabled={busy || !activeBrand || !prompt.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />} Render video</button>

      {job && (
        <div className="mt-3">
          {job.status === "rendering" && <p className="flex items-center gap-2 text-sm text-amber-300"><Loader2 className="h-4 w-4 animate-spin" /> Rendering via {job.provider}… (this can take a few minutes)</p>}
          {job.status === "demo" && <p className="flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3 text-sm text-amber-200"><Clock className="h-4 w-4" /> {job.note}</p>}
          {job.status === "failed" && <p className="flex items-center gap-2 text-sm text-rose-300"><AlertTriangle className="h-4 w-4" /> {job.note}</p>}
          {job.status === "ready" && job.videoUrl && (
            <div>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={job.videoUrl} controls className="mb-2 w-full max-w-sm rounded-lg border border-white/[0.08]" />
              <PublishToChannels defaultText={prompt} defaultMediaUrls={[job.videoUrl]} sourceLabel="video" />
            </div>
          )}
          {job.status === "ready" && !job.videoUrl && <p className="text-sm text-amber-300">{job.note}</p>}
        </div>
      )}
    </div>
  );
}
