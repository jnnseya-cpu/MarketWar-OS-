"use client";

// Creation Command Centre — the "Make Anything" universal command box.
// One prompt → the OS detects the goal, routes to the owned engine, asks only
// the essentials and previews ACUs before anything runs. Wired to /api/intent.

import { useState } from "react";
import Link from "next/link";
import { Loader2, Wand2, ArrowRight, Gauge, Sparkles } from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";

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
  const [prompt, setPrompt] = useState("");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(p?: string) {
    const q = (p ?? prompt).trim();
    if (!q) return;
    if (p) setPrompt(p);
    setBusy(true);
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
                <Link href={decision.best.route} className="btn-primary">
                  Open engine <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="mt-4">
              <p className="label">The OS will only ask you</p>
              <ol className="space-y-1 text-sm text-slate-300">
                {decision.best.essentialQuestions.map((q, i) => <li key={i}>{i + 1}. {q}</li>)}
              </ol>
            </div>
            <p className="mt-3 text-xs text-slate-500">This task will consume ~{decision.best.acuEstimate} ACUs. You approve before it runs — no surprise spending.</p>
          </div>

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
