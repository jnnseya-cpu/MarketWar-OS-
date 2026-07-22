"use client";

// AI Engines — the unified command index. One surface that ties every backend
// intelligence engine into a single navigable platform: each card maps a shipped
// engine to its live API, and "Run demo" calls the engine's GET endpoint so the
// whole OS is demonstrable with zero config. Wired to src/shared/engine-registry.

import { useState } from "react";
import Link from "next/link";
import { Loader2, Play, ArrowUpRight, Cpu } from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";
import { ENGINE_CATEGORIES, enginesByCategory, type EngineEntry } from "@/shared/engine-registry";

function EngineCard({ engine }: { engine: EngineEntry }) {
  const [busy, setBusy] = useState(false);
  const [doctrine, setDoctrine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runDemo() {
    setBusy(true); setError(null); setDoctrine(null);
    try {
      const res = await fetch(`/api/${engine.id}`);
      const body = await res.json();
      const d = body.doctrine;
      const text =
        typeof d === "string" ? d :
        d && typeof d === "object" ? (d.summary || d.engine || JSON.stringify(d).slice(0, 180)) :
        typeof body.engine === "string" ? body.engine :
        "Live — engine responded.";
      setDoctrine(text);
    } catch {
      setError("Could not reach the engine.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flex flex-col p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="font-display text-sm font-bold text-white">{engine.name}</h3>
        <code className="shrink-0 rounded bg-ink-850 px-1.5 py-0.5 text-[10px] text-emerald-300">/api/{engine.id}</code>
      </div>
      <p className="text-xs text-slate-400">{engine.blurb}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {engine.actions.map((a) => (
          <span key={a} className="rounded bg-ink-850 px-1.5 py-0.5 text-[10px] text-slate-400">{a}</span>
        ))}
      </div>
      {doctrine && <p className="mt-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2 text-[11px] text-emerald-100">{doctrine}</p>}
      {error && <p className="mt-2 text-[11px] text-rose-300">{error}</p>}
      <div className="mt-3 flex items-center gap-2 pt-1">
        <button onClick={runDemo} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-semibold text-ink-950 hover:bg-emerald-400 disabled:opacity-60">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Run
        </button>
        {engine.dashboard && (
          <Link href={engine.dashboard} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-300 hover:text-white">
            Open module <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}

export default function EnginesPage() {
  const grouped = enginesByCategory();
  const total = ENGINE_CATEGORIES.reduce((n, c) => n + grouped[c].length, 0);
  return (
    <div>
      <PageHeader
        kicker="Unified command index"
        title="AI Engines"
        subtitle={`${total} intelligence engines — one platform, one entity. Every engine runs live behind its own API.`}
      />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Pill tone="good">{total} engines online</Pill>
        <Pill tone="neutral">provider cost never exposed</Pill>
      </div>
      <div className="space-y-8">
        {ENGINE_CATEGORIES.map((cat) => (
          <section key={cat}>
            <div className="mb-3 flex items-center gap-2">
              <Cpu className="h-4 w-4 text-emerald-400" />
              <h2 className="font-display text-base font-bold text-white">{cat}</h2>
              <span className="text-xs text-slate-500">· {grouped[cat].length}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {grouped[cat].map((e) => <EngineCard key={e.id} engine={e} />)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
