"use client";

// Automation Lab — the No-Code Revenue Automation Builder command surface.
// Pick a journey template, see its steps, validate (frequency/consent) and
// dry-run the timeline. Wired to /api/automation. Every marketing step is
// consent-gated + frequency-capped; opt-out and conversion end the journey.

import { useEffect, useState } from "react";
import { Loader2, Workflow as WorkflowIcon, ShieldCheck, Play, AlertTriangle } from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import { PageHeader, Pill } from "@/components/ui";

type Step = { kind: string; delayHours?: number; label?: string; action?: string; channel?: string; detail?: string; check?: string };
type Wf = { id: string; name: string; trigger: string; goal: string; description: string; steps: Step[] };
type Validation = { valid: boolean; touchesIn7d: number; warnings: string[]; guarantees: string[] };
type SimEvent = { when: string; kind: string; detail: string; sent: boolean; reason?: string };

export default function AutomationPage() {
  const [templates, setTemplates] = useState<{ id: string; name: string; trigger: string; goal: string }[]>([]);
  const [wf, setWf] = useState<Wf | null>(null);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [sim, setSim] = useState<SimEvent[] | null>(null);
  const [consented, setConsented] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/automation").then((r) => r.json()).then((d) => setTemplates(d.templates || [])).catch(() => {});
  }, []);

  async function load(id: string) {
    setBusy(true); setSim(null);
    try {
      const res = await fetch("/api/automation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "template", id }) });
      const data = await res.json();
      setWf(data.workflow); setValidation(data.validation);
    } finally { setBusy(false); }
  }
  async function simulate() {
    if (!wf) return;
    setBusy(true);
    try {
      const res = await fetch("/api/automation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "simulate", workflow: wf, consented }) });
      const data = await res.json();
      setSim(data.timeline);
    } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader
        kicker="Automation Lab · No-Code Builder"
        title="Autonomous customer journeys — that can't spam"
        subtitle="Wire the owned engines (WhatsApp / SMS / email / offers / segments) into revenue journeys: welcome, abandoned-cart recovery, win-back, booking reminders, review requests. Every marketing step is consent-gated and capped at 5 touches / 7 days; opt-out and conversion end the journey. Transactional confirmations are exempt."
        actions={<Pill tone="info">trigger → condition → action → delay → branch</Pill>}
      />

      <div className="mb-6 card border-emerald-500/30 p-6">
        <div className="mb-3 flex items-center gap-2"><WorkflowIcon className="h-5 w-5 text-emerald-400" /><h2 className="font-display text-lg font-bold text-white">Journey templates</h2></div>
        <div className="flex flex-wrap gap-2">
          {templates.map((t) => (
            <button key={t.id} onClick={() => load(t.id)} disabled={busy} className={`rounded-lg border px-3 py-2 text-sm transition ${wf?.id === t.id ? "border-emerald-500/50 bg-emerald-500/[0.08] text-emerald-200" : "border-white/[0.07] bg-ink-900/50 text-slate-300 hover:border-emerald-500/40"}`}>
              {t.name} <span className="text-xs text-slate-500">· {t.trigger}</span>
            </button>
          ))}
        </div>
      </div>

      {wf && (
        <div className="mb-6 card p-6">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="font-display font-bold text-white">{wf.name}</h3>
            {validation && <Pill tone={validation.valid ? "good" : "bad"}>{validation.touchesIn7d} touches/7d {validation.valid ? "· within cap" : "· over cap"}</Pill>}
          </div>
          <p className="mb-3 text-sm text-slate-400">{wf.description} <span className="text-slate-500">Trigger: {wf.trigger} · Goal: {wf.goal}</span></p>
          <ol className="space-y-1.5">
            {wf.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 w-16 shrink-0 text-xs text-slate-500">{s.kind === "wait" ? `wait ${s.delayHours}h` : s.kind}</span>
                <span className={s.kind === "condition" ? "text-amber-200/90" : "text-slate-300"}>
                  {s.kind === "wait" ? s.label : s.kind === "condition" ? `${s.label} (${s.check})` : `${s.channel ? s.channel + ": " : ""}${s.detail}`}
                </span>
              </li>
            ))}
          </ol>
          {validation && validation.warnings.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-2.5">
              {validation.warnings.map((w, i) => <p key={i} className="flex items-center gap-1.5 text-xs text-amber-200/80"><AlertTriangle className="h-3.5 w-3.5" /> {w}</p>)}
            </div>
          )}
          {validation && (
            <div className="mt-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-300"><ShieldCheck className="h-3.5 w-3.5" /> Guardrails</p>
              {validation.guarantees.map((g, i) => <p key={i} className="text-xs text-slate-500">· {g}</p>)}
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={consented} onChange={(e) => setConsented(e.target.checked)} className="accent-emerald-500" /> Contact is consented</label>
            <button className="btn-primary" onClick={simulate} disabled={busy}>
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Simulating…</> : <><Play className="h-4 w-4" /> Dry-run timeline</>}
            </button>
          </div>
        </div>
      )}

      {sim && (
        <div className="mb-6 card p-6">
          <h3 className="mb-3 font-display font-bold text-white">Simulated timeline {consented ? "" : "(non-consented)"}</h3>
          <div className="space-y-1.5">
            {sim.map((e, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="w-20 shrink-0 text-xs text-slate-500">{e.when}</span>
                <span className={e.sent ? "text-slate-300" : "text-slate-600 line-through"}>{e.kind}: {e.detail}</span>
                {!e.sent && <Pill tone="warn">{e.reason}</Pill>}
              </div>
            ))}
          </div>
        </div>
      )}

      <AgentRunner agentId="automation-architect" buttonLabel="Design a journey" fields={[
        { key: "business", label: "Business", defaultValue: "Brixton Grill House" },
        { key: "goal", label: "What journey do you need?", defaultValue: "recover abandoned orders" },
      ]} />
    </div>
  );
}
