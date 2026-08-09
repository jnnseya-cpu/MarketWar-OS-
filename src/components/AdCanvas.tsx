"use client";

// The ad canvas — the panel where a generated ad stops being a flat picture.
//
// Every number shown here is computed in src/backend/ad-canvas.ts. The browser
// renders the SVG the server produced and posts edits back; it does not
// re-implement contrast, safe areas or wrapping, because a second copy of a
// rule is a second place for it to drift — and the whole value of this panel is
// that the check and the artwork agree.

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Ban, Check, Download, Info, Layers, Loader2, Ruler, Wand2 } from "lucide-react";
import { Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";

type Finding = {
  severity: "blocking" | "warning" | "note";
  layerId?: string; title: string; detail: string;
  fix?: { action: string; label: string };
};
type Check = {
  findings: Finding[]; publishable: boolean;
  measured: { label: string; value: string }[];
  claims: unknown[]; doctrine: string;
};
type Layer = { id: string; kind: "text" | "image" | "shape"; role: string; text?: string; hidden?: boolean; pinned?: boolean };
type Doc = { id: string; brandId: string; placementId: string; layers: Layer[] };
type PlacementRow = { id: string; label: string; ratio: string; usedFor: string; safeNote: string };

const SEV: Record<Finding["severity"], { icon: typeof Ban; cls: string }> = {
  blocking: { icon: Ban, cls: "border-rose-500/35 bg-rose-500/[0.06] text-rose-300" },
  warning: { icon: AlertTriangle, cls: "border-amber-500/35 bg-amber-500/[0.06] text-amber-300" },
  note: { icon: Info, cls: "border-sky-500/25 bg-sky-500/[0.05] text-sky-300" },
};

export default function AdCanvas({ imageUrl }: { imageUrl?: string }) {
  const { activeBrand } = useActiveBrand();
  const [placements, setPlacements] = useState<PlacementRow[]>([]);
  const [headline, setHeadline] = useState("");
  const [subhead, setSubhead] = useState("");
  const [offer, setOffer] = useState("");
  const [cta, setCta] = useState("");
  const [placementId, setPlacementId] = useState("feed-square");
  const [doc, setDoc] = useState<Doc | null>(null);
  const [svg, setSvg] = useState("");
  const [check, setCheck] = useState<Check | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sizes, setSizes] = useState<{ placement: PlacementRow; svg: string; check: Check }[]>([]);

  useEffect(() => {
    fetch("/api/ad-canvas")
      .then((r) => r.json())
      .then((d) => setPlacements(Array.isArray(d?.placements) ? d.placements : []))
      .catch(() => { /* the form still works; the table is context */ });
  }, []);

  const post = useCallback(async (body: Record<string, unknown>) => {
    if (!activeBrand?.id) { setError("Pick a brand first."); return null; }
    setBusy(true); setError("");
    try {
      const res = await authedFetch("/api/ad-canvas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: activeBrand.id, ...body }),
      });
      const data = await res.json();
      if (!res.ok) { setError([data?.error, data?.hint].filter(Boolean).join(" — ")); return null; }
      return data;
    } catch {
      setError("Could not reach the canvas."); return null;
    } finally { setBusy(false); }
  }, [activeBrand?.id]);

  const take = (d: Record<string, unknown> | null) => {
    if (!d) return;
    if (d.doc) setDoc(d.doc as Doc);
    if (typeof d.svg === "string") setSvg(d.svg);
    if (d.check) setCheck(d.check as Check);
    setNote(typeof d.note === "string" ? d.note : "");
    setSizes([]);
  };

  const build = async () => take(await post({
    action: "build", placementId, headline, subhead, offer, cta,
    imageUrl: imageUrl || activeBrand?.productImageUrl || undefined,
    logoUrl: activeBrand?.logoUrl || undefined,
    colours: (activeBrand?.brandColours || []).concat(activeBrand?.color ? [activeBrand.color] : []),
  }));

  const edit = async (e: Record<string, unknown>) => take(await post({ action: "edit", doc, edit: e }));
  const fix = async (finding: Finding) => take(await post({ action: "fix", doc, finding }));
  const reshape = async (id: string) => { setPlacementId(id); take(await post({ action: "refit", doc, placementId: id })); };

  const exportAll = async () => {
    const d = await post({ action: "export", doc });
    if (d) { setSizes(d.sizes as { placement: PlacementRow; svg: string; check: Check }[]); setNote(String(d.note || "")); }
  };

  const textLayers = (doc?.layers || []).filter((l) => l.kind === "text");

  return (
    <div className="mb-6 card border-sky-500/25 p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Layers className="h-5 w-5 text-sky-400" />
        <h2 className="font-display text-lg font-bold text-white">Ad canvas — change the ad without regenerating it</h2>
      </div>
      <p className="mb-4 text-sm text-slate-400">
        A generated ad here is a document, not a picture. Retype the headline, move the logo, resize it for a story — the artwork underneath never changes, so no model runs and nothing is charged. What is checked is what can be measured: contrast to the WCAG ratio, and each platform&rsquo;s own safe area.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Headline</label>
          <input className="input" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="The one thing this ad is for" />
        </div>
        <div>
          <label className="label">Subhead</label>
          <input className="input" value={subhead} onChange={(e) => setSubhead(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label className="label">Offer</label>
          <input className="input" value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label className="label">Call to action</label>
          <input className="input" value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Book a survey" />
        </div>
        <div>
          <label className="label">Placement</label>
          <select className="input" value={placementId} onChange={(e) => setPlacementId(e.target.value)}>
            {placements.map((p) => <option key={p.id} value={p.id}>{p.label} — {p.ratio}</option>)}
          </select>
        </div>
      </div>

      <button className="btn-primary mt-4" onClick={build} disabled={busy || !headline.trim()}>
        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Laying it out…</> : <><Wand2 className="h-4 w-4" /> Build the canvas</>}
      </button>

      {error && <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-3 text-sm text-rose-200">{error}</p>}

      {doc && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          <div>
            <div
              className="overflow-hidden rounded-xl border border-white/10 bg-ink-900 [&>svg]:h-auto [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {placements.map((p) => (
                <button
                  key={p.id}
                  onClick={() => reshape(p.id)}
                  disabled={busy}
                  className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${p.id === doc.placementId ? "border-sky-500/50 bg-sky-500/10 text-sky-200" : "border-ink-700 text-slate-400 hover:border-sky-500/40"}`}
                  title={p.safeNote}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button className="btn-secondary mt-2 w-full" onClick={exportAll} disabled={busy}>
              <Download className="h-4 w-4" /> Lay it out for every placement
            </button>
          </div>

          <div className="space-y-4">
            {check && (
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={check.publishable ? "good" : "bad"}>{check.publishable ? "Nothing blocking" : "Fix before publishing"}</Pill>
                {note && <span className="text-xs text-slate-400">{note}</span>}
              </div>
            )}

            {textLayers.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">The words — edit them here</p>
                {textLayers.map((l) => (
                  <div key={l.id} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-[11px] uppercase tracking-wide text-slate-500">{l.role}</span>
                    <input
                      className="input flex-1"
                      defaultValue={l.text || ""}
                      onBlur={(e) => { if (e.target.value !== l.text) edit({ op: "set-text", layerId: l.id, text: e.target.value }); }}
                    />
                  </div>
                ))}
                <p className="text-[11px] text-slate-600">Changing a word costs nothing — no provider is called.</p>
              </div>
            )}

            {check && check.findings.length > 0 && (
              <ul className="space-y-2">
                {check.findings.map((f, i) => {
                  const s = SEV[f.severity]; const Icon = s.icon;
                  return (
                    <li key={i} className={`rounded-lg border p-3 ${s.cls}`}>
                      <p className="flex items-center gap-1.5 text-xs font-bold"><Icon className="h-3.5 w-3.5" /> {f.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-300">{f.detail}</p>
                      {f.fix && f.fix.action !== "edit-text" && (
                        <button className="mt-2 rounded-md border border-ink-700 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:border-emerald-500/40" onClick={() => fix(f)} disabled={busy}>
                          {f.fix.label}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {check && check.measured.length > 0 && (
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500"><Ruler className="h-3.5 w-3.5" /> Measured</p>
                <ul className="space-y-1">
                  {check.measured.map((m, i) => (
                    <li key={i} className="text-xs text-slate-400"><span className="text-slate-500">{m.label}:</span> {m.value}</li>
                  ))}
                </ul>
              </div>
            )}

            {check && <p className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-[11px] leading-relaxed text-slate-500">{check.doctrine}</p>}
          </div>
        </div>
      )}

      {sizes.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            Every placement — {sizes.filter((s) => s.check.publishable).length} of {sizes.length} with nothing blocking
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {sizes.map((s) => (
              <div key={s.placement.id} className="rounded-lg border border-white/10 bg-ink-900/50 p-2">
                <div className="overflow-hidden rounded [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: s.svg }} />
                <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-slate-300">
                  {s.check.publishable ? <Check className="h-3 w-3 text-emerald-400" /> : <AlertTriangle className="h-3 w-3 text-amber-400" />}
                  {s.placement.label}
                </p>
                <p className="text-[10px] text-slate-600">{s.placement.ratio}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
