"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, Zap, Download, Image as ImageIcon } from "lucide-react";
import Link from "next/link";
import { AgentMarkdown, Pill } from "@/components/ui";
import type { AgentResult } from "@/shared/types";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";
import { brandDefaults, BRAND_FIELD_KEYS } from "@/shared/brand";
import ExportButton from "@/components/ExportButton";
import { extractAdCopy } from "@/shared/ad-copy";

// Agents whose DELIVERABLE is an image, not a description. For these the text
// output is only the creative direction — we immediately render real creatives
// through the image gateway so the user gets a finished, downloadable asset.
const VISUAL_AGENT_IDS = new Set(["brand-visual-creation", "visualstrike", "ad-creative", "creative-studio"]);

type RenderedVariant = {
  imageUrl: string; hostedUrl?: string; width: number; height: number;
  provider: string; mode: string; variantIndex: number;
};

// Copy extraction lives in shared/ad-copy — it prefers quoted values and REJECTS
// style specs, so a colour note like "white on red" can never end up printed on a
// CTA button (which is exactly what a naive grab did).

// Force a real file save (Firebase Storage blocks a direct cross-origin fetch).
async function saveImage(url: string, filename: string) {
  const proxied = `/api/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(filename)}`;
  if (url.startsWith("data:")) {
    const a = document.createElement("a"); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove(); return;
  }
  try {
    const res = await fetch(proxied);
    if (!res.ok) throw new Error(String(res.status));
    const obj = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = obj; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(obj), 2000);
  } catch { window.location.href = proxied; }
}

// Light, safe markdown → HTML for the branded export report. Escapes first
// (no HTML injection from agent output), then applies a small subset: ##/###
// headings, **bold**, and •/- bullets. The report body is white-space:pre-wrap,
// so remaining line breaks render as-is.
function mdToHtml(md: string): string {
  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
  return esc(md || "")
    .replace(/^###\s+(.+)$/gm, "<h2>$1</h2>")
    .replace(/^##\s+(.+)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^\s*[-•]\s+(.+)$/gm, "• $1");
}

export interface AgentField {
  key: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  textarea?: boolean;
}

// Generic client harness: renders an intake form for an agent, POSTs to the
// agent API and renders the markdown result. Used across every module page.
export default function AgentRunner({
  agentId,
  buttonLabel,
  fields,
  autoRunLabel,
  onResult,
}: {
  agentId: string;
  buttonLabel: string;
  fields: AgentField[];
  autoRunLabel?: string;
  // Optional: surfaces the agent's result to a parent (e.g. to seed a Publish
  // action with the freshly generated copy). Non-breaking — most callers omit it.
  onResult?: (result: AgentResult) => void;
}) {
  const { activeBrand } = useActiveBrand();
  // A field is filled from the ACTIVE brand when its key is a known brand field
  // (business/product/audience/location/offer/industry/goal/website); otherwise
  // the page's own default stands. Switching brand refills the form below.
  // Brand fields fill from the active brand; on a clean slate (no brand) they
  // stay BLANK rather than showing a sample business. Non-brand fields keep
  // their page default (budgets, toggles, etc.).
  const fillFor = (brandFill: Record<string, string>) =>
    Object.fromEntries(
      fields.map((f) => [f.key, brandFill[f.key] ?? (BRAND_FIELD_KEYS.has(f.key) ? "" : f.defaultValue ?? "")])
    );
  const [values, setValues] = useState<Record<string, string>>(() => fillFor(brandDefaults(activeBrand)));
  const [result, setResult] = useState<AgentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isVisual = VISUAL_AGENT_IDS.has(agentId);
  const [variants, setVariants] = useState<RenderedVariant[]>([]);
  const [rendering, setRendering] = useState(false);

  // Re-skin the form when the active brand changes.
  useEffect(() => {
    setValues(fillFor(brandDefaults(activeBrand)));
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand?.id]);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      // Send the brand's REAL assets alongside the form fields. Without these the
      // agent can't know a logo/palette exists and defaults to "Assumed: no logo
      // uploaded — using a generic palette", which is wrong whenever the brand
      // HAS assets. Every key here lands in the prompt as business context.
      const assetContext: Record<string, string> = {};
      if (activeBrand?.logoUrl) assetContext.brandLogo = `UPLOADED — use this exact logo, do not redraw it: ${activeBrand.logoUrl}`;
      else assetContext.brandLogo = "NOT uploaded — derive a palette, and say one line inviting them to upload the logo.";
      if (activeBrand?.productImageUrl) assetContext.brandProductImage = `UPLOADED — feature this product photo: ${activeBrand.productImageUrl}`;
      if (activeBrand?.brandColours?.length) assetContext.brandColours = `USE THESE EXACT brand colours: ${activeBrand.brandColours.join(", ")}`;
      if (activeBrand?.website) assetContext.brandWebsite = activeBrand.website;

      const res = await authedFetch(`/api/agents/${agentId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...values, ...assetContext }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setResult(data as AgentResult);
      onResult?.(data as AgentResult);
      // A visual agent's deliverable is the IMAGE. Its text is only the creative
      // direction — so immediately render real, downloadable creatives from it.
      if (isVisual) renderCreatives((data as AgentResult).output);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Agent execution failed");
    } finally {
      setLoading(false);
    }
  }

  async function renderCreatives(brief: string) {
    if (!activeBrand) return;
    setRendering(true); setVariants([]);
    try {
      const copy = extractAdCopy(brief);
      const res = await authedFetch("/api/image", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          business: activeBrand.name,
          brandId: activeBrand.id,
          prompt: brief.slice(0, 1200),
          headline: copy.headline || values.headline || values.offer || activeBrand.name,
          offerText: copy.offerText || values.offer || "",
          cta: copy.cta || values.cta || "Learn more",
          quality: "standard",
          variants: 3,
          logoUrl: activeBrand.logoUrl,
          productImageUrl: activeBrand.productImageUrl,
          brandColours: activeBrand.brandColours,
          product: activeBrand.product,
          industry: activeBrand.industry,
          audience: activeBrand.audience,
        }),
      });
      const d = await res.json();
      if (res.ok && Array.isArray(d.variants)) setVariants(d.variants as RenderedVariant[]);
    } catch { /* the brief still stands on its own */ }
    finally { setRendering(false); }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="card p-5 lg:col-span-2">
        <div className="space-y-4">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="label" htmlFor={`${agentId}-${f.key}`}>
                {f.label}
              </label>
              {f.textarea ? (
                <textarea
                  id={`${agentId}-${f.key}`}
                  className="input min-h-[84px]"
                  placeholder={f.placeholder}
                  value={values[f.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              ) : (
                <input
                  id={`${agentId}-${f.key}`}
                  className="input"
                  placeholder={f.placeholder}
                  value={values[f.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              )}
            </div>
          ))}
          <button className="btn-primary w-full" onClick={run} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {loading ? "Agent working…" : buttonLabel}
          </button>
          {activeBrand && (
            <p className="text-center text-[11px] text-slate-500">
              Running for <span className="font-semibold" style={{ color: activeBrand.color }}>{activeBrand.name}</span> · switch brand in the sidebar
            </p>
          )}
          {error && <p className="text-sm text-rose-400">{error}</p>}
        </div>
      </div>

      <div className="card p-5 lg:col-span-3">
        {result ? (
          <div>
            <div className="mb-4 flex items-center justify-between gap-2 border-b border-ink-700 pb-3">
              <p className="font-display text-sm font-bold text-white">{result.agentName}</p>
              <div className="flex items-center gap-2">
                <Pill tone={result.mode === "live" ? "good" : "info"}>
                  {result.mode === "live" ? "Live intelligence" : "Demo intelligence"}
                </Pill>
                <ExportButton
                  dataset={agentId}
                  label="Export"
                  report={{ title: result.agentName, bodyHtml: mdToHtml(result.output) }}
                  json={{ agent: result.agentName, mode: result.mode, output: result.output }}
                />
              </div>
            </div>
            {/* Visual agents: the FINISHED creatives come first — the brief below
                is the reasoning, not the deliverable. */}
            {isVisual && (
              <div className="mb-4">
                {rendering && (
                  <p className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2 text-sm text-emerald-300">
                    <Loader2 className="h-4 w-4 animate-spin" /> Rendering your finished creatives from this direction…
                  </p>
                )}
                {!rendering && variants.length > 0 && (
                  <>
                    <div className="mb-2 flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-emerald-400" />
                      <h3 className="font-display text-sm font-bold text-white">Finished creatives — ready to post</h3>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {variants.map((v, i) => {
                        const dl = v.hostedUrl || v.imageUrl;
                        return (
                          <div key={i} className="overflow-hidden rounded-xl border border-white/10 bg-ink-950">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={v.imageUrl} alt={`Creative ${i + 1}`} className="w-full" style={{ aspectRatio: `${v.width}/${v.height}` }} />
                            <button onClick={() => saveImage(dl, `${activeBrand?.name || "creative"}-${i + 1}.png`)}
                              className="flex w-full items-center justify-center gap-1.5 border-t border-white/10 px-2 py-2 text-xs font-semibold text-slate-200 hover:text-emerald-300">
                              <Download className="h-3.5 w-3.5" /> Download
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">
                      Download and post, or <Link href="/dashboard/studio" className="font-semibold text-emerald-400 hover:text-emerald-300">open Studio</Link> to fine-tune size, logo position and publish direct.
                    </p>
                  </>
                )}
                {!rendering && variants.length === 0 && !activeBrand && (
                  <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200">Add a brand to render finished creatives from this direction.</p>
                )}
              </div>
            )}
            <AgentMarkdown text={result.output} />
          </div>
        ) : (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center">
            <Sparkles className="mb-3 h-8 w-8 text-emerald-500/60" />
            <p className="max-w-xs text-sm text-slate-500">
              {autoRunLabel ??
                "Fill in the mission parameters and deploy the agent. Output renders here."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
