"use client";

// Reusable "Publish to channels" action — routes generated copy straight into
// the Zernio publish gateway (/api/zernio). Drop it under any generator so the
// content a user just created flows into one-click cross-posting, with the
// compliance gate + AI-content watermark applied. Demo-safe; live when
// ZERNIO_API_KEY is set. Reads the active brand.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Send, ShieldCheck } from "lucide-react";
import { Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";

type PublishResult = {
  mode: "live" | "demo";
  status: "published" | "scheduled" | "blocked";
  platforms: string[];
  compliance: { pass: boolean; reasons: string[] };
  watermarked: boolean;
  scheduledFor: string | null;
  mediaCount: number;
  droppedMedia: number;
  note: string;
};

const isHosted = (u: string) => /^https?:\/\//i.test(u);

const CHANNELS = [
  ["instagram", "Instagram"], ["facebook", "Facebook"], ["tiktok", "TikTok"],
  ["x", "X"], ["linkedin", "LinkedIn"], ["youtube", "YouTube"],
  ["pinterest", "Pinterest"], ["threads", "Threads"], ["google_business", "Google Business"],
] as const;

// Turn generated markdown into a plain-text caption seed (users can trim it).
function toCaption(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "")           // code fences
    .replace(/^#{1,6}\s+/gm, "")               // headings
    .replace(/[*_>`#]/g, "")                    // md punctuation
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")   // links → text
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 600);
}

export default function PublishToChannels({ defaultText = "", defaultMediaUrls, sourceLabel }: { defaultText?: string; defaultMediaUrls?: string[]; sourceLabel?: string }) {
  const { activeBrand } = useActiveBrand();
  const [text, setText] = useState("");
  const [media, setMedia] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(["instagram", "facebook", "tiktok"]));
  const [result, setResult] = useState<PublishResult | null>(null);
  const [busy, setBusy] = useState(false);

  // Seed the caption when new content is generated upstream.
  useEffect(() => { if (defaultText) { setText(toCaption(defaultText)); setResult(null); } }, [defaultText]);
  // Seed attached media (image/video URLs) from the generator.
  useEffect(() => { setMedia(defaultMediaUrls ?? []); setResult(null); }, [defaultMediaUrls]);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const hostedCount = media.filter(isHosted).length;
  const previewCount = media.length - hostedCount;

  async function publish() {
    if (!activeBrand || !text.trim() || selected.size === 0) return;
    setBusy(true); setResult(null);
    try {
      const r = await authedFetch("/api/zernio", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish", brandId: activeBrand.id, text, platforms: [...selected], mediaUrls: media }),
      });
      setResult(await r.json());
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-6 card border-emerald-500/20 p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Send className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Publish to channels</h3></div>
        <Link href="/dashboard/publish" className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">Connect socials / full Publish Center →</Link>
      </div>
      <p className="mb-3 text-xs text-slate-400">
        {sourceLabel ? `Send the ${sourceLabel} straight to your channels. ` : "Push this copy straight to your channels. "}
        Passes the compliance gate and carries the AI-content watermark. {!activeBrand && "Add a brand to publish."}
      </p>

      <textarea className="input min-h-[90px]" placeholder="Generate above, then edit the caption here — or write your own." value={text} onChange={(e) => setText(e.target.value)} />

      {media.length > 0 && (
        <div className="mt-2">
          <div className="flex flex-wrap gap-2">
            {media.map((url, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Attachment ${i + 1}`} className="h-16 w-16 rounded-lg border border-white/[0.08] object-cover" />
                <button type="button" onClick={() => setMedia((m) => m.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-ink-900 text-[10px] text-slate-300 ring-1 ring-white/10 hover:text-rose-400">×</button>
                {!isHosted(url) && <span className="absolute inset-x-0 bottom-0 rounded-b-lg bg-amber-500/80 py-0.5 text-center text-[8px] font-bold uppercase text-ink-950">preview</span>}
              </div>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {hostedCount > 0 && <span className="text-emerald-300">{hostedCount} hosted media will attach to the post. </span>}
            {previewCount > 0 && <span className="text-amber-300">{previewCount} demo/preview creative won&apos;t attach — it posts once live rendering returns a hosted URL.</span>}
          </p>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {CHANNELS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => toggle(id)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${selected.has(id) ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40" : "bg-ink-850 text-slate-400 hover:text-slate-200"}`}>{label}</button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={publish} disabled={busy || !activeBrand || !text.trim() || selected.size === 0}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Publish now</button>
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Compliance + watermark applied automatically</span>
      </div>

      {result && (
        <div className={`mt-3 rounded-lg border p-3 ${result.status === "blocked" ? "border-rose-500/30 bg-rose-500/[0.06]" : "border-emerald-500/25 bg-emerald-500/[0.05]"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${result.mode === "live" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>{result.mode}</span>
            <span className={`text-sm font-semibold ${result.status === "blocked" ? "text-rose-300" : "text-emerald-300"}`}>{result.status === "published" ? "Published" : result.status === "scheduled" ? `Scheduled ${result.scheduledFor}` : "Blocked"}</span>
            {result.status !== "blocked" && <span className="text-xs text-slate-400">→ {result.platforms.join(", ")}</span>}
            {result.watermarked && <Pill tone="neutral">watermarked</Pill>}
          </div>
          {!result.compliance.pass && <ul className="mt-2 list-disc pl-5 text-xs text-rose-300">{result.compliance.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
          <p className="mt-1.5 text-[11px] text-slate-500">{result.note}</p>
        </div>
      )}
    </div>
  );
}
