"use client";

// Ad formats — the shapes short-form advertising actually comes in.
//
// The competitor version of this screen puts a predicted score beside each
// format. That number is generated, not measured — nobody outside the
// advertiser knows what a format returned. So this screen ranks nothing and
// gives you the thing that does transfer: a shot list you can film, and the
// specific way each format goes wrong.

import { useEffect, useState } from "react";
import { Camera, Clapperboard, Loader2, TriangleAlert } from "lucide-react";
import { Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";
import CopyOut from "@/components/CopyOut";
// The shape the API actually sends. Imported rather than re-declared: the
// hand-written version of this type is what crashed /dashboard/video.
import type { AdStyleView as Style } from "@/shared/ad-style-view";


type Brief = {
  style: Style; prompt: string; seconds: number;
  checklist: string[]; disclosure: string; warnings: string[];
  factsUsed?: number; factsNote?: string;
};

export default function AdFormats() {
  const { activeBrand } = useActiveBrand();
  const [styles, setStyles] = useState<Style[]>([]);
  const [note, setNote] = useState("");
  const [styleId, setStyleId] = useState("");
  const [product, setProduct] = useState("");
  const [problem, setProblem] = useState("");
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/ad-styles")
      .then((r) => r.json())
      .then((d) => {
        const list: Style[] = Array.isArray(d?.styles) ? d.styles : [];
        setStyles(list); setNote(d?.note || "");
        if (list.length && !styleId) setStyleId(list[0].id);
      })
      .catch(() => { /* the list is context; the form still posts */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (activeBrand?.product && !product) setProduct(activeBrand.product); }, [activeBrand?.product, product]);

  const selected = styles.find((s) => s.id === styleId) || null;

  async function makeBrief() {
    setBusy(true); setError(""); setBrief(null);
    try {
      const res = await authedFetch("/api/ad-styles", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styleId, product, problem: problem || undefined, brandId: activeBrand?.id, audience: activeBrand?.audience }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || "Could not build the brief."); return; }
      setBrief(data);
    } catch {
      setError("Could not reach the format engine.");
    } finally { setBusy(false); }
  }

  return (
    <div className="mb-6 card border-violet-500/25 p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Clapperboard className="h-5 w-5 text-violet-400" />
        <h2 className="font-display text-lg font-bold text-white">Ad formats — UGC, street interview, podcast clip, founder-to-camera</h2>
      </div>
      <p className="mb-4 text-sm text-slate-400">{note || "Pick by what you can actually film. Each format comes back as a shot list with timings, the camera and lighting it needs, and the specific way it goes wrong."}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Format</label>
          <select className="input" value={styleId} onChange={(e) => { setStyleId(e.target.value); setBrief(null); }}>
            {styles.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">What is being advertised</label>
          <input className="input" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Loft conversions" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">The problem it removes (optional)</label>
          <input className="input" value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="Builders who disappear halfway through" />
        </div>
      </div>

      {selected && (
        <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white">{selected.label}</span>
            <Pill tone="info">{selected.idealSeconds}s</Pill>
            {selected.platforms.slice(0, 4).map((p) => <Pill key={p}>{p}</Pill>)}
          </div>
          <p className="mb-2 text-xs leading-relaxed text-slate-400">{selected.looksLike}</p>
          <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">You need</p>
          <p className="mb-2 text-xs text-slate-400">{selected.needs.join(" · ")}</p>
          <p className="mb-1 flex items-center gap-1 text-[11px] uppercase tracking-wide text-amber-400/80"><TriangleAlert className="h-3 w-3" /> It fails when</p>
          <p className="text-xs leading-relaxed text-slate-500">{selected.failsWhen}</p>
        </div>
      )}

      <button className="btn-primary mt-4" onClick={makeBrief} disabled={busy || !styleId || !product.trim()}>
        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Writing the shot list…</> : <><Camera className="h-4 w-4" /> Build the shot list</>}
      </button>

      {error && <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-3 text-sm text-rose-200">{error}</p>}

      {brief && (
        <div className="mt-5 space-y-3">
          {brief.warnings.map((w, i) => (
            <p key={i} className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-amber-200">{w}</p>
          ))}
          <div className="rounded-lg border border-white/10 bg-ink-900/50 p-3">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">The shot list — {brief.seconds}s</p>
            <ol className="space-y-1.5">
              {brief.style.shots.map((s, i) => (
                <li key={i} className="text-sm leading-relaxed text-slate-300">{s}</li>
              ))}
            </ol>
          </div>
          <div className="rounded-lg border border-white/10 bg-ink-900/50 p-3">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">Before you publish, check</p>
            <ul className="space-y-1">
              {brief.checklist.map((c, i) => <li key={i} className="text-xs leading-relaxed text-slate-400">· {c}</li>)}
            </ul>
          </div>
          {brief.factsNote && <p className="text-[11px] leading-relaxed text-slate-500">{brief.factsNote}</p>}
          <CopyOut
            text={[
              brief.prompt,
              brief.checklist?.length ? `Shot checklist:\n${brief.checklist.map((c) => `- ${c}`).join("\n")}` : "",
              brief.disclosure,
            ].filter(Boolean).join("\n\n")}
            filename="ad-brief.txt" label="Copy the whole brief"
          />
          <details className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-slate-500">The prompt, if you want to render it</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-slate-400">{brief.prompt}</pre>
            {/* The prompt's entire purpose is to be used somewhere else. */}
            <div className="mt-2"><CopyOut text={brief.prompt} filename="prompt.txt" label="Copy the prompt" compact /></div>
          </details>
          {brief.disclosure && <p className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-[11px] leading-relaxed text-slate-500">{brief.disclosure}</p>}
        </div>
      )}
    </div>
  );
}
