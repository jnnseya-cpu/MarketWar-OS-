"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, Zap, Download, Image as ImageIcon, ShieldAlert, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { AgentMarkdown, Pill } from "@/components/ui";
import type { AgentResult } from "@/shared/types";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";
import { mdToHtml } from "@/frontend/markdown";
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
  context,
}: {
  agentId: string;
  buttonLabel: string;
  fields: AgentField[];
  autoRunLabel?: string;
  // Optional: surfaces the agent's result to a parent (e.g. to seed a Publish
  // action with the freshly generated copy). Non-breaking — most callers omit it.
  onResult?: (result: AgentResult) => void;
  /**
   * WHAT THE PAGE ALREADY KNOWS.
   *
   * THE DEFECT THIS CLOSES. The segmentation page rendered "88 customers, 100%
   * consented, 1 segment" from the real Customer Vault, and directly beneath it
   * the agent answered: "Cannot generate specific segments without customer
   * data. Integrate your customer database." Both were on one screen. The agent
   * was right — it had been handed a business name and an industry and nothing
   * else — and the platform looked like it could not see its own data.
   *
   * A form field is what the USER types. This is what the PAGE has already
   * computed, and until now there was no way to send it, so every module page
   * that does real work above an agent was asking that agent to reason without
   * it. A function is accepted as well as an object so the value is read at the
   * moment of the run rather than at render, and a page whose data arrives after
   * mount still sends it.
   */
  context?: Record<string, string> | (() => Record<string, string>);
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
  // Autosave state. Work is kept without being asked — a customer who paid for
  // a plan should not lose it by clicking a link, which is what happened when
  // the output lived only in this component.
  const [saved, setSaved] = useState<{ id: string; durable: boolean; note: string } | null>(null);
  const [restored, setRestored] = useState<{ title: string; at: string } | null>(null);
  // The follow-on engine named by the agent's closing "Next:" line, run in
  // place with the work just produced carried into it.
  const [nextResult, setNextResult] = useState<AgentResult | null>(null);
  const [nextRunning, setNextRunning] = useState(false);
  const [nextError, setNextError] = useState<string | null>(null);

  // Re-skin the form when the active brand changes.
  useEffect(() => {
    setValues(fillFor(brandDefaults(activeBrand)));
    setResult(null);
    setSaved(null);
    setRestored(null);
    setNextResult(null);
    setNextError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand?.id]);

  // Bring back the last run for THIS agent and THIS brand. Returning to a page
  // and finding it blank is indistinguishable from the work never existing.
  useEffect(() => {
    if (!activeBrand) return;
    let on = true;
    (async () => {
      try {
        const r = await authedFetch(`/api/work?brandId=${encodeURIComponent(activeBrand.id)}&source=${encodeURIComponent(agentId)}&latest=1`);
        const d = await r.json().catch(() => ({}));
        if (!on || !d?.item?.output) return;
        // Never overwrite something generated in this session.
        setResult((cur) => cur ?? ({
          agentId,
          agentName: d.item.sourceName || agentId,
          mode: "live",
          output: d.item.output,
          generatedAt: d.item.createdAt,
        } as AgentResult));
        setRestored({ title: d.item.title || "", at: d.item.updatedAt || d.item.createdAt || "" });
      } catch { /* a missing library must never block the page */ }
    })();
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand?.id, agentId]);

  // Save the moment a run completes. Fire-and-forget: a save that fails must
  // never swallow the output the customer is looking at.
  // Run the engine the agent pointed at, carrying the work forward.
  //
  // The context matters more than the routing: without the plan that was just
  // produced, the follow-on engine starts from scratch and writes something that
  // does not match it — which is why "do this next" has to pass the output on,
  // not just open another form.
  async function runNext(nextAgentId: string) {
    if (!result || nextRunning) return;
    setNextRunning(true); setNextError(null); setNextResult(null);
    try {
      const res = await authedFetch(`/api/agents/${nextAgentId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...values,
          previousEngine: result.agentName,
          previousWork: result.output.slice(0, 12_000),
          instruction: result.nextStep?.text || "",
          continuity: "This continues work already done for this brand. Build ON the previous output above — do not restate it, do not contradict it, and keep the same offer, tone and audience.",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setNextResult(data as AgentResult);
      void autosave(data as AgentResult, { ...values, from: agentId }, nextAgentId);
    } catch (err) {
      setNextError(err instanceof Error ? err.message : "That step could not be run.");
    } finally { setNextRunning(false); }
  }

  async function autosave(data: AgentResult, input: Record<string, string>, sourceId = agentId) {
    if (!activeBrand || !data?.output?.trim()) return;
    try {
      const r = await authedFetch("/api/work", {
        method: "POST",
        headers: { "content-type": "application/json", "x-now": new Date().toISOString() },
        body: JSON.stringify({
          action: "save",
          brandId: activeBrand.id,
          source: sourceId,
          sourceName: data.agentName || sourceId,
          kind: "agent",
          output: data.output,
          input,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d?.item?.id) setSaved({ id: d.item.id, durable: Boolean(d.persisted), note: String(d.note || "") });
    } catch { /* the output stays on screen either way */ }
  }

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

      // READ AT RUN TIME, not at render. A page that loads its data after mount
      // would otherwise send the empty version it had when the button appeared.
      const pageContext = typeof context === "function" ? context() : (context ?? {});

      const res = await authedFetch(`/api/agents/${agentId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...values, ...assetContext, ...pageContext }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setResult(data as AgentResult);
      setRestored(null);
      setNextResult(null);
      setNextError(null);
      onResult?.(data as AgentResult);
      void autosave(data as AgentResult, { ...values });
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
            {/* Where this went. An autosave nobody can see is indistinguishable
                from no autosave at all — the customer still assumes it is lost. */}
            {(saved || restored) && (
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                {restored && !saved && (
                  <span className="text-slate-400">
                    Showing your last run{restored.at ? ` from ${new Date(restored.at).toLocaleString()}` : ""} — generate again to replace it.
                  </span>
                )}
                {saved && (
                  <span className={saved.durable ? "text-emerald-300" : "text-amber-300"}>
                    {saved.durable ? "Saved to your Library." : saved.note}
                  </span>
                )}
                <a href="/dashboard/library" className="text-sky-300 underline decoration-sky-400/40 underline-offset-2 hover:text-sky-200">
                  Open Library →
                </a>
              </div>
            )}

            {/* Claim Guard — what must NOT be published as written. Shown ABOVE
                the output so it is read before anything is copied out. */}
            {result.claims && !result.claims.clean && (
              <div className={`mb-4 rounded-lg border p-3 ${result.claims.blocking ? "border-rose-500/40 bg-rose-500/[0.07]" : "border-amber-500/30 bg-amber-500/[0.06]"}`}>
                <p className={`flex items-center gap-1.5 text-sm font-bold ${result.claims.blocking ? "text-rose-300" : "text-amber-300"}`}>
                  <ShieldAlert className="h-4 w-4 shrink-0" /> Check before you publish
                </p>
                <p className="mt-1 text-xs text-slate-300">{result.claims.summary}</p>
                <ul className="mt-2 space-y-2">
                  {result.claims.findings.map((f, i) => (
                    <li key={i} className="rounded-md bg-ink-950/50 p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${f.severity === "block" ? "bg-rose-500/20 text-rose-300" : "bg-amber-500/20 text-amber-300"}`}>
                          {f.severity === "block" ? "do not publish" : "check"}
                        </span>
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{f.kind}</span>
                      </div>
                      <p className="mt-1 text-xs italic text-slate-200">&ldquo;{f.excerpt}&rdquo;</p>
                      <p className="mt-1 text-[11px] text-slate-400">{f.reason}</p>
                      <p className="mt-0.5 text-[11px] text-emerald-300">{f.fix}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

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

            {/* "Next:" — made pressable. The agent names the next move; without a
                button the plan stalls one step from being used. */}
            {result.nextStep?.text && (
              <div className="mt-5 rounded-lg border border-sky-500/25 bg-sky-500/[0.06] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-300">Next</p>
                <p className="mt-0.5 text-sm text-slate-200">{result.nextStep.text}</p>
                {result.nextStep.agentId ? (
                  <>
                    <button
                      onClick={() => runNext(result.nextStep!.agentId!)}
                      disabled={nextRunning}
                      className="btn-primary mt-2 !bg-sky-500 hover:!bg-sky-400 disabled:opacity-60"
                    >
                      {nextRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {nextRunning ? "Running…" : `Do this with ${result.nextStep.agentName}`}
                    </button>
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      Runs with everything above carried over, so it builds on this plan instead of starting again. Costs ACUs like any AI action, and lands in your Library.
                    </p>
                  </>
                ) : (
                  <p className="mt-1.5 text-[11px] text-slate-500">{result.nextStep.reason}</p>
                )}
                {nextError && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-rose-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {nextError}
                  </p>
                )}
              </div>
            )}

            {nextResult && (
              <div className="mt-4 rounded-lg border border-ink-700 bg-ink-850/40 p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-ink-700 pb-2">
                  <p className="font-display text-sm font-bold text-white">{nextResult.agentName}</p>
                  <span className="text-[11px] text-emerald-300">Saved to your Library</span>
                </div>
                <AgentMarkdown text={nextResult.output} />
              </div>
            )}
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
