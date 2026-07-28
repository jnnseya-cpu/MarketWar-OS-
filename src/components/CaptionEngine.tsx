"use client";

// Caption Engine — real subtitles from the actual audio.
//
// This transcribes with Whisper and returns a real .srt / .vtt with real
// timestamps. Nothing is written by a model pretending to know what was said:
// if there is no audio there are no captions. The .srt downloads here are the
// file YouTube, LinkedIn, Meta and TikTok all accept on upload, so this is
// usable on its own — burning captions into the frame is a separate render job.

import { useState } from "react";
import { Captions, Download, Loader2, Upload } from "lucide-react";
import { authedFetch } from "@/frontend/api-client";
import { Pill } from "@/components/ui";

type Segment = { start: number; end: number; text: string };
type Result = { srt: string; vtt: string; text: string; segments: Segment[]; language?: string; durationSec?: number; wordCount: number };

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export default function CaptionEngine({ onSrt }: { onSrt?: (srt: string) => void }) {
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [translate, setTranslate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function run() {
    setBusy(true); setError(null); setResult(null);
    try {
      let res: Response;
      if (file) {
        const form = new FormData();
        form.append("file", file);
        if (translate) form.append("translate", "true");
        res = await authedFetch("/api/video/captions", { method: "POST", body: form });
      } else {
        res = await authedFetch("/api/video/captions", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim(), translate }),
        });
      }
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Transcription failed.");
      setResult(d);
      onSrt?.(d.srt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transcription failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-8 card border-emerald-500/30 p-6">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Captions className="h-5 w-5 text-emerald-400" />
        <h2 className="font-display text-lg font-bold text-white">Caption Engine</h2>
        <Pill tone="good">real transcription</Pill>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-slate-500">
        Upload a clip (or point at a hosted one) and this transcribes the actual audio into a real .srt with real timestamps.
        Upload that file alongside your video on YouTube, LinkedIn, Facebook, Instagram or TikTok — every one of them accepts
        it, and captioned video is watched far longer on mute. 25MB per clip; trim longer videos first.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Upload a video or audio file</label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/15 px-3 py-2.5 text-xs text-slate-400 hover:border-emerald-500/40">
            <Upload className="h-4 w-4" />
            {file ? `${file.name} (${(file.size / 1048576).toFixed(1)}MB)` : "Choose a file…"}
            <input type="file" accept="video/*,audio/*" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setUrl(""); }} />
          </label>
        </div>
        <div>
          <label className="label">…or a hosted URL (https)</label>
          <input className="input" placeholder="https://…/clip.mp4" value={url} onChange={(e) => { setUrl(e.target.value); setFile(null); }} />
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 text-xs text-slate-300">
        <input type="checkbox" checked={translate} onChange={(e) => setTranslate(e.target.checked)} />
        Translate to English while transcribing
      </label>

      <button className="btn-primary mt-4" onClick={run} disabled={busy || (!file && !/^https:\/\//i.test(url.trim()))}>
        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Transcribing…</> : <><Captions className="h-4 w-4" /> Transcribe</>}
      </button>
      {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}

      {result && (
        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span>{result.segments.length} caption lines</span>
            <span>{result.wordCount} words</span>
            {result.durationSec ? <span>{clock(result.durationSec)} long</span> : null}
            {result.language ? <span>detected: {result.language}</span> : null}
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            <button className="btn-ghost text-xs" onClick={() => download("captions.srt", result.srt, "text/plain")}><Download className="h-3.5 w-3.5" /> Download .srt</button>
            <button className="btn-ghost text-xs" onClick={() => download("captions.vtt", result.vtt, "text/vtt")}><Download className="h-3.5 w-3.5" /> Download .vtt</button>
            <button className="btn-ghost text-xs" onClick={() => download("transcript.txt", result.text, "text/plain")}><Download className="h-3.5 w-3.5" /> Transcript</button>
            {onSrt && <button className="btn-ghost text-xs" onClick={() => onSrt(result.srt)}>Send to Render Farm →</button>}
          </div>
          <div className="max-h-60 overflow-y-auto rounded-lg border border-white/[0.08] p-3">
            {result.segments.slice(0, 60).map((s, i) => (
              <p key={i} className="mb-1.5 text-xs leading-relaxed text-slate-300">
                <span className="mr-2 font-mono text-[10px] text-slate-500">{clock(s.start)}</span>{s.text}
              </p>
            ))}
            {result.segments.length > 60 && <p className="text-[11px] text-slate-500">…{result.segments.length - 60} more lines in the download.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
