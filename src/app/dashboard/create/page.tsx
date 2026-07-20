"use client";

// Creation Command Centre — the "Make Anything" universal command box.
// One prompt → the OS detects the goal, routes to the owned engine, asks only
// the essentials and previews ACUs before anything runs. Wired to /api/intent.

import { useState } from "react";
import Link from "next/link";
import { Loader2, Wand2, ArrowRight, Gauge, Sparkles, Hammer } from "lucide-react";
import { PageHeader, Pill, AgentMarkdown } from "@/components/ui";
import type { AgentResult } from "@/shared/types";
import { useActiveBrand } from "@/frontend/brand-context";
import { brandDefaults } from "@/shared/brand";

type Decision = {
  best: { id: string; label: string; route: string; agentId?: string; api?: string; acuClass: string; acuEstimate: number; essentialQuestions: string[]; confidence: number };
  alternatives: { id: string; label: string; route: string; confidence: number }[];
  note: string;
};

const EXAMPLES = [
  "Make a TikTok ad for my restaurant",
  "Build me a full campaign to get WhatsApp orders",
  "Design an Instagram creative with my logo and 20% off",
  "Why am I getting no customers?",
  "Reactivate my old customer list",
  "Get my business recommended by ChatGPT",
];

export default function CreatePage() {
  const { activeBrand } = useActiveBrand();
  const [prompt, setPrompt] = useState("");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  // Inline execution — the box doesn't just route, it BUILDS.
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [building, setBuilding] = useState(false);
  const [built, setBuilt] = useState<AgentResult | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);

  async function run(p?: string) {
    const q = (p ?? prompt).trim();
    if (!q) return;
    if (p) setPrompt(p);
    setBusy(true);
    setDecision(null); setBuilt(null); setBuildError(null); setAnswers({});
    try {
      const res = await fetch("/api/intent", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: q }),
      });
      setDecision(await res.json());
    } finally {
      setBusy(false);
    }
  }

  // Build it now — executes the routed OWNED agent for real (live with keys,
  // deterministic without). Reuses the real /api/agents/{id} gateway path.
  async function build() {
    if (!decision?.best.agentId) return;
    setBuilding(true); setBuildError(null); setBuilt(null);
    try {
      // Build for the ACTIVE brand: its profile seeds the agent, then any
      // answers the user typed override.
      const payload: Record<string, string> = { ...brandDefaults(activeBrand), request: prompt };
      decision.best.essentialQuestions.forEach((q, i) => { if (answers[`q${i}`]?.trim()) payload[q] = answers[`q${i}`]; });
      const res = await fetch(`/api/agents/${decision.best.agentId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Build failed (${res.status})`);
      setBuilt(data as AgentResult);
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : "Build failed");
    } finally {
      setBuilding(false);
    }
  }

  return (
    <div>
      <PageHeader
        kicker="Creation Command Centre · Make Anything"
        title="Tell the OS what you want. It builds it."
        subtitle="One command box for the whole platform. Describe your goal in plain words — an ad, a campaign, a landing page, a video, a recovery mission — and the OS detects it, routes to the right owned engine, asks only what's essential, and shows the ACU cost before anything runs."
        actions={<Pill tone="info">detects goal · routes to owned engine · previews ACUs</Pill>}
      />

      <div className="mb-6 card border-emerald-500/30 p-6">
        <div className="mb-3 flex items-center gap-2">
          <Wand2 className="h-5 w-5 text-emerald-400" />
          <h2 className="font-display text-lg font-bold text-white">Make anything</h2>
        </div>
        <textarea
          className="input min-h-[96px] resize-y"
          placeholder="e.g. Make a brand-consistent Instagram ad for my Brixton grill house with a Friday-platter offer"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run(); }}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn-primary" onClick={() => run()} disabled={busy}>
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Detecting…</> : <><Sparkles className="h-4 w-4" /> Detect & route</>}
          </button>
          <span className="text-xs text-slate-500">⌘/Ctrl + Enter</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => run(ex)} className="rounded-full border border-white/[0.07] bg-ink-900/50 px-3 py-1.5 text-xs text-slate-300 transition hover:border-emerald-500/50 hover:text-emerald-300">
              {ex}
            </button>
          ))}
        </div>
      </div>

      {decision && (
        <div className="space-y-4">
          <div className="card border-emerald-500/30 p-6">
            <p className="text-sm text-slate-400">{decision.note}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-display text-xl font-bold text-white">{decision.best.label}</p>
                <p className="text-xs text-slate-500">confidence {decision.best.confidence}% · class {decision.best.acuClass}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-sm text-amber-200">
                  <Gauge className="h-4 w-4" /> ~{decision.best.acuEstimate} ACUs
                </span>
                <Link href={decision.best.route} className="btn-ghost">
                  Open engine <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* Answer only the essentials, then build inline */}
            <div className="mt-4">
              <p className="label">Answer only the essentials{decision.best.agentId ? "" : " (then open the engine to run)"}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {decision.best.essentialQuestions.map((q, i) => (
                  <input
                    key={i}
                    className="input"
                    placeholder={q}
                    value={answers[`q${i}`] ?? ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [`q${i}`]: e.target.value }))}
                  />
                ))}
              </div>
            </div>

            {decision.best.agentId ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button className="btn-primary" onClick={build} disabled={building}>
                  {building ? <><Loader2 className="h-4 w-4 animate-spin" /> Building…</> : <><Hammer className="h-4 w-4" /> Build it now</>}
                </button>
                <span className="text-xs text-slate-500">Runs the owned engine · ~{decision.best.acuEstimate} ACUs · you approve before it runs.</span>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">This goal opens a guided engine. Estimated ~{decision.best.acuEstimate} ACUs — you approve before it runs.</p>
            )}
            {buildError && <p className="mt-3 text-sm text-rose-400">{buildError}</p>}
          </div>

          {(building || built) && (
            <div className="card p-6">
              {built ? (
                <div>
                  <div className="mb-4 flex items-center justify-between border-b border-ink-700 pb-3">
                    <p className="font-display text-sm font-bold text-white">{built.agentName}</p>
                    <Pill tone={built.mode === "live" ? "good" : "info"}>{built.mode === "live" ? "Live intelligence" : "Demo intelligence"}</Pill>
                  </div>
                  <AgentMarkdown text={built.output} />
                </div>
              ) : (
                <div className="flex min-h-[160px] items-center justify-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> The OS is building your {decision.best.label.toLowerCase()}…
                </div>
              )}
            </div>
          )}

          {decision.alternatives.length > 0 && (
            <div className="card p-5">
              <p className="label">Or did you mean</p>
              <div className="flex flex-wrap gap-2">
                {decision.alternatives.map((a) => (
                  <Link key={a.id} href={a.route} className="inline-flex items-center gap-1 rounded-full border border-white/[0.07] bg-ink-900/50 px-3 py-1.5 text-xs text-slate-300 transition hover:border-emerald-500/50 hover:text-emerald-300">
                    {a.label} <span className="text-slate-500">{a.confidence}%</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
