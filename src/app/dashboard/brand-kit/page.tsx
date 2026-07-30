"use client";

// Brand Launch Kit — the eight day-one documents, done for you.
//
// Everything is written from the brand you already set up. The extras box is
// for the things the platform genuinely does not hold — typefaces, a phone
// number, a tagline — because the alternative is a guessed hex code that a
// designer builds to, or a made-up number that gets printed on five hundred
// cards. Anything still missing comes back marked, never filled in.

import { useCallback, useEffect, useState } from "react";
import { Loader2, Palette, Download, Copy, Check, AlertTriangle, Plus, X } from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";

type Finding = { excerpt: string; reason: string; fix: string };
type Limit = { label: string; used: number; max: number; ok: boolean };
type Asset = {
  id: string; title: string; content: string; needs: string[];
  blockers: Finding[]; warnings: Finding[]; limits: Limit[]; truncated?: boolean; note: string;
};

const ASSET_LABEL: Record<string, string> = {
  guidelines: "Brand guidelines (1 page)",
  signature: "Email signature + business card",
  "social-profiles": "Social profile kit",
  pitch: "Spoken pitch (30s + 10s)",
  "website-copy": "Website copy (4 pages)",
  moodboard: "Moodboard brief",
  "content-calendar": "Launch week calendar",
  "launch-post": "Launch announcement post",
};
const ORDER = Object.keys(ASSET_LABEL);

export default function BrandKitPage() {
  const { activeBrand, ready } = useActiveBrand();
  const [picked, setPicked] = useState<string[]>(ORDER);
  const [extras, setExtras] = useState<{ label: string; value: string }[]>([
    { label: "Typefaces (heading / body)", value: "" },
    { label: "Tagline", value: "" },
    { label: "Contact email", value: "" },
    { label: "Phone", value: "" },
  ]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [failed, setFailed] = useState<{ id: string; error: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const [hint, setHint] = useState("");
  const load = useCallback(async () => {
    try {
      const r = await authedFetch("/api/brand-kit");
      const d = await r.json().catch(() => ({}));
      setHint(d.note || "");
    } catch { /* the page works without it */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const colours = activeBrand?.brandColours?.filter(Boolean) ?? [];

  async function build() {
    if (!activeBrand || busy || !picked.length) return;
    setBusy(true); setErr(null); setAssets([]); setFailed([]);
    try {
      const r = await authedFetch("/api/brand-kit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brandId: activeBrand.id, name: activeBrand.name,
          product: activeBrand.product, audience: activeBrand.audience,
          location: activeBrand.location, industry: activeBrand.industry,
          website: activeBrand.website, offer: activeBrand.offer, goal: activeBrand.goal,
          colours, logoUrl: activeBrand.logoUrl,
          extras: extras.filter((e) => e.value.trim()),
          assets: picked,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || `Could not build the kit (HTTP ${r.status})`); return; }
      setAssets(d.assets || []); setFailed(d.failed || []); setNote(d.note || "");
    } catch (e) {
      setErr(`Could not build the kit: ${(e as Error).message || "network error"}.`);
    } finally { setBusy(false); }
  }

  function copy(a: Asset) {
    navigator.clipboard?.writeText(a.content).then(() => {
      setCopied(a.id);
      setTimeout(() => setCopied((c) => (c === a.id ? null : c)), 1600);
    }).catch(() => {});
  }

  function downloadAll() {
    const body = assets.map((a) => `# ${a.title}\n\n${a.content}`).join("\n\n---\n\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/markdown" }));
    const el = document.createElement("a");
    el.href = url;
    el.download = `${(activeBrand?.name || "brand").replace(/[^\w-]+/g, "-").toLowerCase()}-brand-kit.md`;
    el.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        kicker="Brand Launch Kit"
        title="The eight documents a new brand needs on day one"
        subtitle="Written from the brand you already set up, in your language — guidelines, signature and card, social profiles, spoken pitch, website copy, moodboard brief, launch-week calendar and the announcement post. Anything the platform does not actually hold is marked for you to supply, never invented: a guessed hex code becomes your brand the moment a designer builds to it."
        actions={<Pill tone="info">{picked.length} of {ORDER.length} selected</Pill>}
      />

      {ready && !activeBrand && (
        <div className="card p-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10 text-violet-300"><Palette className="h-5 w-5" /></span>
          <h2 className="mt-4 font-display text-lg font-bold text-white">Pick a brand first</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">Every document is written about one named business, so choose one in the switcher.</p>
        </div>
      )}

      {activeBrand && (
        <>
          <div className="mb-6 card p-5">
            <h3 className="font-display text-sm font-bold text-white">What to build</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ORDER.map((id) => {
                const on = picked.includes(id);
                return (
                  <button
                    key={id}
                    onClick={() => setPicked((p) => (on ? p.filter((x) => x !== id) : [...p, id]))}
                    className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                      on ? "border-violet-500/40 bg-violet-500/15 text-violet-100" : "border-ink-700 bg-ink-850 text-slate-400"}`}
                  >
                    {on && <Check className="mr-1 inline h-3 w-3" />}{ASSET_LABEL[id]}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-lg border border-ink-700 bg-ink-950/50 p-3">
              <p className="text-[11px] leading-relaxed text-slate-400">
                {colours.length ? (
                  <>Using your saved brand colours: {colours.map((c) => (
                    <span key={c} className="mx-0.5 inline-flex items-center gap-1 rounded border border-ink-700 px-1.5 py-0.5 font-mono text-[10px] text-slate-200">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{c}
                    </span>
                  ))}</>
                ) : (
                  <>No brand colours are saved, so the guidelines cannot state your hex codes. Add them in brand settings, or type them below — they will otherwise come back marked <span className="text-amber-200">[TO SUPPLY]</span>, which is the honest answer rather than a guess a designer would build to.</>
                )}
              </p>
            </div>

            <h4 className="mt-4 text-[10px] uppercase tracking-wide text-slate-500">Details the platform does not hold</h4>
            <div className="mt-2 space-y-2">
              {extras.map((e, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={e.label}
                    onChange={(ev) => setExtras((x) => x.map((v, j) => (j === i ? { ...v, label: ev.target.value } : v)))}
                    className="w-1/3 rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-2 text-xs text-slate-300 outline-none focus:border-violet-500/50"
                  />
                  <input
                    value={e.value}
                    onChange={(ev) => setExtras((x) => x.map((v, j) => (j === i ? { ...v, value: ev.target.value } : v)))}
                    placeholder="Leave blank if you do not have it"
                    className="flex-1 rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-2 text-xs text-white placeholder-slate-600 outline-none focus:border-violet-500/50"
                  />
                  <button onClick={() => setExtras((x) => x.filter((_, j) => j !== i))} className="rounded p-1.5 text-slate-500 hover:text-slate-300" aria-label="Remove">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button onClick={() => setExtras((x) => [...x, { label: "", value: "" }])} className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-300 hover:text-violet-200">
                <Plus className="h-3 w-3" />Add a detail
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button className="btn-primary !bg-violet-500 hover:!bg-violet-400" onClick={build} disabled={busy || !picked.length}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Palette className="h-4 w-4" />}
                {busy ? "Writing…" : `Build ${picked.length} document${picked.length === 1 ? "" : "s"}`}
              </button>
              <span className="text-[11px] text-slate-500">{picked.length} AI call{picked.length === 1 ? "" : "s"}, charged in ACUs. Anything that fails is refunded.</span>
            </div>

            {err && (
              <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/[0.07] px-3 py-2 text-xs text-rose-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{err}
              </p>
            )}
            {hint && !assets.length && <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{hint}</p>}
          </div>

          {Boolean(assets.length) && (
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <button className="btn-secondary" onClick={downloadAll}>
                <Download className="h-4 w-4" />Download the whole kit (.md)
              </button>
              {note && <p className="text-[11px] leading-relaxed text-slate-500">{note}</p>}
            </div>
          )}

          <div className="space-y-3">
            {assets.map((a) => (
              <div key={a.id} className="card p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-sm font-bold text-white">{a.title}</h3>
                  <button onClick={() => copy(a)} className="ml-auto inline-flex items-center gap-1 rounded border border-ink-700 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:text-white">
                    {copied === a.id ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    {copied === a.id ? "Copied" : "Copy"}
                  </button>
                </div>

                {a.truncated && (
                  <p className="mt-2 flex items-start gap-1.5 rounded border border-rose-500/30 bg-rose-500/[0.08] px-2.5 py-2 text-[11px] leading-relaxed text-rose-100">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span><strong>Incomplete.</strong> The model ran out of output budget and this stops mid-thought. It has been refunded — rebuild this one on its own to give it the whole budget.</span>
                  </p>
                )}

                {Boolean(a.limits.length) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {a.limits.map((l) => (
                      <span key={l.label} className={`rounded-full border px-2 py-0.5 text-[10px] ${l.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-rose-500/30 bg-rose-500/10 text-rose-200"}`}>
                        {l.label} {l.used}/{l.max}
                      </span>
                    ))}
                  </div>
                )}

                {a.blockers.map((f, i) => (
                  <p key={`b${i}`} className="mt-2 rounded border border-rose-500/25 bg-rose-500/[0.06] px-2 py-1.5 text-[10px] leading-relaxed text-rose-100">
                    <strong>&ldquo;{f.excerpt}&rdquo;</strong> — {f.reason} {f.fix}
                  </p>
                ))}
                {a.warnings.map((f, i) => (
                  <p key={`w${i}`} className="mt-2 rounded border border-amber-500/25 bg-amber-500/[0.06] px-2 py-1.5 text-[10px] leading-relaxed text-amber-100">
                    <strong>&ldquo;{f.excerpt}&rdquo;</strong> — {f.reason} {f.fix}
                  </p>
                ))}

                {Boolean(a.needs.length) && (
                  <p className="mt-2 rounded bg-amber-500/[0.07] px-2 py-1.5 text-[10px] leading-relaxed text-amber-200/90">
                    You must supply: {a.needs.join("; ")}. Left blank on purpose — fill them in above and rebuild rather than deleting the markers.
                  </p>
                )}

                <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg border border-ink-700 bg-ink-950 p-3 text-[11px] leading-relaxed text-slate-300">{a.content}</pre>
                <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{a.note}</p>
              </div>
            ))}

            {failed.map((f) => (
              <div key={f.id} className="card border-rose-500/25 p-4">
                <p className="text-xs font-semibold text-rose-200">{ASSET_LABEL[f.id] || f.id} — not written</p>
                <p className="mt-1 text-[11px] text-slate-400">{f.error}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
