"use client";

// Render Farm — the customer face of the FFmpeg job queue.
//
// Everything here produces an actual FILE, not a brief: trimmed clips, social
// cuts, burned-in captions, a watermarked video, B-roll composites, green-screen
// keying and upscales. The app cannot run FFmpeg (Vercel: 60s ceiling, read-only
// disk), so each button ENQUEUES work that the render worker claims. This panel
// polls the queue and hands back download links when the files land.
//
// Honesty: if no worker is connected the panel says so and refuses to take
// money for work nothing can perform.

import { useCallback, useEffect, useState } from "react";
import { Clapperboard, Download, Loader2, RefreshCw, Scissors, Upload } from "lucide-react";
import { authedFetch } from "@/frontend/api-client";
import { useActiveBrand } from "@/frontend/brand-context";
import { Pill } from "@/components/ui";
import { classifyMediaUrl } from "@/shared/media-url";

type Kind = "trim" | "clips" | "captions_burn" | "brand" | "broll" | "bg_remove" | "upscale";
type Job = {
  id: string; kind: Kind; status: "queued" | "running" | "done" | "failed";
  outputUrls: string[]; chargedAcu: number; attempts: number; error?: string;
  createdAt: string; progress?: number;
};

const KINDS: { key: Kind; label: string; blurb: string }[] = [
  { key: "trim", label: "Trim a clip", blurb: "Cut one section out — set the in and out point in seconds." },
  { key: "clips", label: "Cut social clips", blurb: "Many short cuts from your best moments. Rank moments in the Clip Lab first, then send them here." },
  { key: "captions_burn", label: "Burn in captions", blurb: "Paste an SRT (the Caption Engine makes one from your audio) and it is baked into the frame." },
  { key: "brand", label: "Watermark", blurb: "Your logo, bottom-right, on every frame." },
  { key: "broll", label: "Add B-roll", blurb: "Picture-in-picture a second clip over the first 8 seconds." },
  { key: "bg_remove", label: "Green-screen removal", blurb: "Chroma-keys a green background to transparent (WebM). It needs a real green screen — this is not AI matting." },
  { key: "upscale", label: "Upscale", blurb: "Raise the resolution with a Lanczos rescale, up to 4K." },
];

export default function RenderFarm({
  presetMoments,
  presetSrt,
}: {
  presetMoments?: { startSec: number; endSec: number }[];
  presetSrt?: string;
}) {
  const { activeBrand } = useActiveBrand();
  const [kind, setKind] = useState<Kind>("trim");
  const [sourceUrl, setSourceUrl] = useState("");
  const [startSec, setStartSec] = useState("0");
  const [endSec, setEndSec] = useState("15");
  const [srt, setSrt] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [brollUrl, setBrollUrl] = useState("");
  const [height, setHeight] = useState("1080");
  const [vertical, setVertical] = useState(true);

  const [costs, setCosts] = useState<Record<string, number>>({});
  const [workerUp, setWorkerUp] = useState<boolean | null>(null);
  const [renderVia, setRenderVia] = useState<string[]>([]);
  // Kinds that composite a second source need the self-hosted worker; the
  // hosted API cannot do them. Read from the server, never assumed.
  const [hostedUnsupported, setHostedUnsupported] = useState<string[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);

  // The Caption Engine can hand its transcript straight over — arriving captions
  // switch this panel to the burn-in job so the next click is the right one.
  useEffect(() => {
    if (!presetSrt) return;
    setSrt(presetSrt);
    setKind("captions_burn");
  }, [presetSrt]);

  useEffect(() => {
    fetch("/api/video/jobs")
      .then((r) => r.json())
      .then((d) => {
        setCosts(d?.costs || {});
        setWorkerUp(Boolean(d?.workerConfigured));
        setRenderVia(Array.isArray(d?.renderVia) ? d.renderVia : []);
        setHostedUnsupported(Array.isArray(d?.hostedUnsupported) ? d.hostedUnsupported : []);
      })
      .catch(() => setWorkerUp(false));
  }, []);

  const refresh = useCallback(async () => {
    if (!activeBrand) return;
    try {
      const r = await authedFetch("/api/video/jobs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list", brandId: activeBrand.id }),
      });
      const d = await r.json();
      if (Array.isArray(d?.jobs)) setJobs(d.jobs);
    } catch { /* the list is a convenience — never break the panel over it */ }
  }, [activeBrand]);

  useEffect(() => { setJobs([]); refresh(); }, [refresh]);

  // Poll while anything is still in flight, then stop.
  useEffect(() => {
    const pending = jobs.some((j) => j.status === "queued" || j.status === "running");
    if (!pending) return;
    const t = setInterval(refresh, 6000);
    return () => clearInterval(t);
  }, [jobs, refresh]);

  function params(): Record<string, unknown> {
    switch (kind) {
      case "trim": return { startSec: Number(startSec) || 0, endSec: Number(endSec) || 15 };
      case "clips": return {
        aspect: vertical ? "9:16" : "16:9",
        moments: presetMoments?.length ? presetMoments : [{ startSec: Number(startSec) || 0, endSec: Number(endSec) || 15 }],
      };
      case "captions_burn": return { srt };
      case "brand": return { logoUrl: logoUrl || activeBrand?.logoUrl || "" };
      case "broll": return { brollUrl };
      case "upscale": return { height: Number(height) || 1080 };
      default: return {};
    }
  }

  // Upload a local file STRAIGHT to storage. It never passes through our server
  // — a serverless function cannot receive a video — so size is limited by the
  // storage vendor rather than by us.
  async function upload(file: File) {
    if (!activeBrand) { setError("Pick a brand first."); return; }
    setError(null); setMsg(null); setUploadPct(0); setUploadedName(null);
    try {
      const signRes = await authedFetch("/api/video/upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sign", brandId: activeBrand.id, filename: file.name, fileSize: file.size }),
      });
      const signed = await signRes.json();
      if (!signRes.ok) throw new Error(signed?.error || "Could not start the upload.");

      // XHR rather than fetch: it reports progress, and a 200MB upload with no
      // progress bar looks broken.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", signed.uploadUrl);
        xhr.setRequestHeader("Content-Type", signed.contentType);
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (HTTP ${xhr.status}).`)));
        xhr.onerror = () => reject(new Error("The upload was interrupted."));
        xhr.send(file);
      });

      const confRes = await authedFetch("/api/video/upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", brandId: activeBrand.id, filename: signed.filename, fileSize: file.size }),
      });
      const confirmed = await confRes.json();
      if (!confRes.ok) throw new Error(confirmed?.error || "The upload could not be confirmed.");

      setSourceUrl(confirmed.fileUrl);
      setUploadedName(file.name);
      setMsg(`${file.name} uploaded — choose what to do with it and press Render.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploadPct(null);
    }
  }

  async function enqueue() {
    if (!activeBrand) { setError("Pick a brand first."); return; }
    setBusy(true); setError(null); setMsg(null);
    try {
      const r = await authedFetch("/api/video/jobs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enqueue", brandId: activeBrand.id, kind, sourceUrl: sourceUrl.trim(), params: params() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "Could not queue that render.");
      setMsg(`Queued — ${d.chargedAcu} ACUs charged, ${d.balanceAcu} left. If it fails you are refunded in full.`);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not queue that render.");
    } finally {
      setBusy(false);
    }
  }

  const active = KINDS.find((k) => k.key === kind)!;
  const cost = costs[kind];
  // Only the hosted renderer connected AND this kind needs the worker → it
  // cannot run. Say so instead of taking the money and failing.
  const needsWorker = hostedUnsupported.includes(kind) && renderVia.length > 0 && !renderVia.includes("worker");
  // Tell the customer a YouTube/page link is unusable as they type it, not after
  // they have clicked Render.
  const source = sourceUrl.trim() ? classifyMediaUrl(sourceUrl.trim()) : null;
  const sourceBad = Boolean(source && !source.usable);
  const canSubmit = Boolean(activeBrand) && !sourceBad && Boolean(source?.usable) && !busy && workerUp !== false && !needsWorker
    && (kind !== "captions_burn" || srt.trim().length > 0)
    && (kind !== "broll" || /^https:\/\//i.test(brollUrl.trim()));

  return (
    <div className="mb-8 card border-emerald-500/30 p-6">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Scissors className="h-5 w-5 text-emerald-400" />
        <h2 className="font-display text-lg font-bold text-white">Render Farm</h2>
        {workerUp === true && (
          <Pill tone="good">
            {renderVia.includes("cloud") && renderVia.includes("worker")
              ? "hosted + self-hosted rendering"
              : renderVia.includes("cloud") ? "hosted rendering live" : "render worker connected"}
          </Pill>
        )}
        {workerUp === false && <Pill tone="warn">no renderer connected</Pill>}
      </div>
      <p className="mb-4 text-xs leading-relaxed text-slate-500">
        This is the panel that produces actual video files. Upload a video (or paste a direct link), choose what to do, and
        the renderer hands back a download. Rendering burns real machine time, so each job costs ACUs — and a job that fails
        refunds you in full, automatically.
      </p>

      {workerUp === false && (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-amber-200">
          No render worker is connected to this deployment, so these jobs cannot run and the panel will not charge you for
          them. <strong className="text-amber-100">You probably do not need one.</strong> Cutting clips to 9:16 with the
          captions burned in, your logo in the corner and picture-in-picture B-roll all happen in your own browser from the
          Clip Finder above — no upload, no queue, no render bill. The worker is for unattended batches and for background
          removal and upscaling, which a browser genuinely cannot do.
          When you do want it: deploy <code className="text-amber-100">worker/</code> to Cloud Run on the Google Cloud
          account this platform already uses and set <code className="text-amber-100">VIDEO_WORKER_SECRET</code> on both
          sides — that is your own container, not a new supplier. The hosted alternative
          (<code className="text-amber-100">FFMPEG_CLOUD_API_KEY</code>) <em>is</em> a new supplier and a new bill.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Your video</label>
          <label className={`flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-xs ${uploadedName ? "border-emerald-500/40 text-emerald-300" : "border-white/15 text-slate-400 hover:border-emerald-500/40"}`}>
            <Upload className="h-4 w-4" />
            {uploadPct !== null ? `Uploading… ${uploadPct}%` : uploadedName ? `${uploadedName} — uploaded` : "Upload a video file…"}
            <input
              type="file" accept="video/*" className="hidden" disabled={uploadPct !== null}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
            />
          </label>
          {uploadPct !== null && (
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${uploadPct}%` }} />
            </div>
          )}
          <label className="label mt-3">…or paste a direct link</label>
          <input className="input" placeholder="https://…/my-video.mp4" value={sourceUrl} onChange={(e) => { setSourceUrl(e.target.value); setUploadedName(null); }} />
          {sourceBad ? (
            <p className="mt-1 text-[11px] leading-relaxed text-amber-300">{source!.reason}</p>
          ) : (
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              Uploading is free — you are only charged for the render. The file goes straight to storage and never passes
              through our servers, so there is no size limit from us. A direct link works too, but YouTube and Vimeo page
              links do not: those are web pages, not files.
            </p>
          )}
        </div>
        <div>
          <label className="label">What to do</label>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {KINDS.map((k) => {
              const blocked = hostedUnsupported.includes(k.key) && renderVia.length > 0 && !renderVia.includes("worker");
              return (
                <option key={k.key} value={k.key}>
                  {k.label}{costs[k.key] ? ` — ${costs[k.key]} ACUs` : ""}{blocked ? " (needs the render worker)" : ""}
                </option>
              );
            })}
          </select>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{active.blurb}</p>
        </div>
      </div>

      {/* Per-kind inputs — only what this job actually needs. */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {(kind === "trim" || (kind === "clips" && !presetMoments?.length)) && (
          <>
            <div><label className="label">Start (seconds)</label><input className="input" value={startSec} onChange={(e) => setStartSec(e.target.value)} /></div>
            <div><label className="label">End (seconds)</label><input className="input" value={endSec} onChange={(e) => setEndSec(e.target.value)} /></div>
          </>
        )}
        {kind === "clips" && (
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={vertical} onChange={(e) => setVertical(e.target.checked)} />
              Reframe to 9:16 for TikTok / Reels / Shorts
            </label>
            {Boolean(presetMoments?.length) && (
              <p className="mt-1 text-[11px] text-emerald-300/80">
                Using the {presetMoments!.length} moments ranked in the Clip Lab — one clip each.
              </p>
            )}
          </div>
        )}
        {kind === "captions_burn" && (
          <div className="sm:col-span-2">
            <label className="label">SRT subtitles</label>
            <textarea className="input min-h-[120px] font-mono text-[11px]" placeholder={"1\n00:00:00,000 --> 00:00:02,400\nYour first line"} value={srt} onChange={(e) => setSrt(e.target.value)} />
            <p className="mt-1 text-[11px] text-slate-500">Run the Caption Engine below on this video and paste the .srt it transcribes.</p>
          </div>
        )}
        {kind === "brand" && (
          <div className="sm:col-span-2">
            <label className="label">Logo URL</label>
            <input className="input" placeholder={activeBrand?.logoUrl || "https://…/logo.png"} value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
            <p className="mt-1 text-[11px] text-slate-500">Leave blank to use your brand logo.</p>
          </div>
        )}
        {kind === "broll" && (
          <div className="sm:col-span-2">
            <label className="label">B-roll video URL (https)</label>
            <input className="input" placeholder="https://…/broll.mp4" value={brollUrl} onChange={(e) => setBrollUrl(e.target.value)} />
          </div>
        )}
        {kind === "upscale" && (
          <div><label className="label">Target height (px)</label><input className="input" value={height} onChange={(e) => setHeight(e.target.value)} /></div>
        )}
      </div>

      {needsWorker && (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-amber-200">
          {active.label} lays a second image or video over the frame, which the hosted render service cannot do. It needs
          the self-hosted render worker (<code className="text-amber-100">worker/</code>). Every other render on this list
          works right now — you have not been charged for this one.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={enqueue} disabled={!canSubmit}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Queuing…</> : <><Clapperboard className="h-4 w-4" /> Render{cost ? ` — ${cost} ACUs` : ""}</>}
        </button>
        <button className="btn-ghost text-xs" onClick={refresh} type="button"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </div>
      {msg && <p className="mt-3 text-xs text-emerald-300">{msg}</p>}
      {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}

      {jobs.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 font-display text-sm font-bold text-white">Your renders</h3>
          <div className="space-y-2">
            {jobs.map((j) => (
              <div key={j.id} className="card flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white">
                    {KINDS.find((k) => k.key === j.kind)?.label ?? j.kind}
                    <span className="ml-2 font-normal text-slate-500">{new Date(j.createdAt).toLocaleString()}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {j.status === "queued" && "Waiting for a worker…"}
                    {j.status === "running" && `Rendering… ${j.progress ?? 0}%${j.attempts > 1 ? ` (attempt ${j.attempts})` : ""}`}
                    {j.status === "done" && `${j.outputUrls.length} file${j.outputUrls.length === 1 ? "" : "s"} ready`}
                    {j.status === "failed" && `Failed — ${j.error || "render error"}. ${j.chargedAcu} ACUs refunded.`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {j.status === "failed" ? <Pill tone="bad">refunded</Pill> : <Pill tone={j.status === "done" ? "good" : "info"}>{j.status}</Pill>}
                  {j.outputUrls.map((u, i) => (
                    <a key={u} className="btn-ghost text-xs" href={u} target="_blank" rel="noreferrer" download>
                      <Download className="h-3.5 w-3.5" /> {j.outputUrls.length > 1 ? `Clip ${i + 1}` : "Download"}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
