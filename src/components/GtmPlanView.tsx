"use client";

// THE PLAN, ON THE SCREEN.
//
// `buildGtmPlan` has been returning ninety days, five supplier routes, four
// segments and the first-hundred arithmetic inside every opportunity result,
// and this page rendered four bullets. That is this codebase's oldest defect —
// the engine is right and the last six inches are missing — and it is the
// fourth time it has appeared this month.
//
// TWO THINGS THIS SCREEN DOES ON PURPOSE.
//
// It puts the UNFINISHED arithmetic in front of the reader rather than hiding
// it. When no close rate has been observed the first-hundred maths is
// deliberately incomplete, and a screen that quietly showed nothing there would
// undo the entire reason the engine refuses to guess. It is rendered as the
// week-one task it is.
//
// And it can be taken away. A plan somebody can read and not keep is a plan
// they will not work to — the same lesson seven other surfaces in this
// repository learned the expensive way.

import { useState } from "react";
import { AlertTriangle, Boxes, CalendarDays, ChevronDown, ChevronUp, Download, Loader2, MapPin, PiggyBank, Target, Users, Wrench } from "lucide-react";
import CopyOut from "@/components/CopyOut";

type Phase = {
  window: string; title: string; exitCriterion: string;
  actions: { do: string; why: string; tool?: string }[];
  measure: string[];
};
type SupplierRoute = { route: string; bestFor: string; typicalMoq: string; leadTime: string; risk: string; firstMove: string };
type Segment = { name: string; who: string; whyFirst: string; whereTheyAre: string; objection: string; answer: string };
type BudgetLine = { phase: string; item: string; amount: number | null; sharePct: number; why: string };
type Budget = {
  supplied: boolean; totalGbp: number | null; currency: string;
  lines: BudgetLine[]; minimumViableGbp: number; minimumNote: string; rules: string[]; note: string;
};
type LaunchCity = { city: string; locked: boolean; why: string; secondCityWhen: string[]; localMoves: string[] };

export type GtmPlan = {
  business: string; headline: string; wedge: string;
  launchCity: LaunchCity;
  budget: Budget;
  phases: Phase[];
  suppliers: { applicable: boolean; routes: SupplierRoute[]; diligence: string[]; terms: string[]; note: string };
  segments: Segment[];
  firstHundred: {
    math: { target: number; closeRate: number | null; conversationsNeeded: number | null; weeklyConversations: number | null; note: string };
    channels: { channel: string; play: string; cost: string; realistic: string }[];
    sequence: string[];
  };
  acquisition: { loop: string[]; keepCost: string[]; killCriteria: string[] };
  marketing: { stack: { job: string; where: string; url: string; why: string }[]; note: string };
  economics: { line: string; value: string; how: string }[];
  risks: { risk: string; tell: string; move: string }[];
  honesty: string[];
};

function Section({ icon: Icon, title, subtitle, children, defaultOpen = false }: {
  icon: typeof Target; title: string; subtitle?: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-white/[0.06] py-4 first:border-t-0 first:pt-0">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2.5 text-left">
        <Icon className="h-4 w-4 shrink-0 text-emerald-400" />
        <span className="flex-1">
          <span className="block font-display text-sm font-bold text-white">{title}</span>
          {subtitle && <span className="mt-0.5 block text-xs text-slate-500">{subtitle}</span>}
        </span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-600" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-600" />}
      </button>
      {open && <div className="mt-3.5">{children}</div>}
    </div>
  );
}

/** The plan as plain text, so it can leave the screen and go in a document. */
function asText(p: GtmPlan): string {
  const cur = p.budget.currency;
  const L: string[] = [`${p.business.toUpperCase()} — GO TO MARKET`, "", p.headline, "", `WEDGE: ${p.wedge}`, ""];
  L.push(`LAUNCH CITY: ${p.launchCity.city}${p.launchCity.locked ? "" : " (NOT LOCKED)"}`, p.launchCity.why, "");
  if (p.launchCity.locked) L.push(...p.launchCity.localMoves.map((m) => `  - ${m}`), "");
  L.push("A SECOND CITY ONLY WHEN", ...p.launchCity.secondCityWhen.map((m) => `  - ${m}`), "");
  L.push("BUDGET", p.budget.note, "");
  for (const l of p.budget.lines) L.push(`  ${l.phase} · ${l.item} — ${l.sharePct}%${l.amount === null ? "" : ` (${cur}${l.amount.toLocaleString()})`}`, `    ${l.why}`);
  L.push("", `  Floor: ${p.budget.minimumNote}`, "", ...p.budget.rules.map((r) => `  - ${r}`), "");
  for (const ph of p.phases) {
    L.push(`${ph.window.toUpperCase()} — ${ph.title}`, `Done when: ${ph.exitCriterion}`, "");
    ph.actions.forEach((a, i) => L.push(`  ${i + 1}. ${a.do}`, `     Why: ${a.why}`, ...(a.tool ? [`     ${a.tool}`] : [])));
    L.push("", `  Measure: ${ph.measure.join(" · ")}`, "");
  }
  if (p.suppliers.applicable) {
    L.push("SUPPLIERS", p.suppliers.note, "");
    for (const r of p.suppliers.routes) {
      L.push(`  ${r.route} — ${r.bestFor}`, `    MOQ ${r.typicalMoq} · lead time ${r.leadTime}`, `    Risk: ${r.risk}`, `    First move: ${r.firstMove}`, "");
    }
    L.push("  Diligence:", ...p.suppliers.diligence.map((d) => `    - ${d}`), "", "  Terms:", ...p.suppliers.terms.map((t) => `    - ${t}`), "");
  } else {
    L.push("SUPPLIERS", p.suppliers.note, "");
  }
  L.push("WHO BUYS FIRST");
  for (const s of p.segments) {
    L.push(`  ${s.name} — ${s.who}`, `    Why first: ${s.whyFirst}`, `    Where: ${s.whereTheyAre}`, `    "${s.objection}" → ${s.answer}`, "");
  }
  L.push("THE FIRST 100", p.firstHundred.math.note, "", ...p.firstHundred.sequence.map((s) => `  ${s}`), "");
  for (const c of p.firstHundred.channels) L.push(`  ${c.channel} — ${c.play}`, `    Cost: ${c.cost} · Realistically: ${c.realistic}`);
  L.push("", "THE ACQUISITION LOOP", ...p.acquisition.loop.map((s) => `  ${s}`), "");
  L.push("KEEPING IT CHEAP", ...p.acquisition.keepCost.map((s) => `  - ${s}`), "");
  L.push("WHEN TO STOP", ...p.acquisition.killCriteria.map((s) => `  - ${s}`), "");
  L.push("UNIT ECONOMICS", ...p.economics.map((e) => `  ${e.line}: ${e.value} — ${e.how}`), "");
  L.push("RISKS", ...p.risks.map((r) => `  ${r.risk}\n    Tell: ${r.tell}\n    Move: ${r.move}`), "");
  L.push("THE STACK", ...p.marketing.stack.map((m) => `  ${m.job} → ${m.where}: ${m.url}\n    ${m.why}`), "", p.marketing.note, "");
  L.push("WHAT THIS PLAN DOES NOT CLAIM", ...p.honesty.map((h) => `  - ${h}`));
  return L.join("\n");
}

export default function GtmPlanView({
  plan, onDownload, downloading,
}: { plan: GtmPlan; onDownload?: () => void; downloading?: boolean }) {
  const math = plan.firstHundred.math;
  const cur = plan.budget.currency;

  return (
    <div className="card p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">Go to market · 90 days</p>
          <p className="font-display text-base font-bold leading-snug text-white">{plan.headline}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{plan.wedge}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-ink-950 disabled:opacity-50"
            >
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Download GO-TO-MARKET
            </button>
          )}
          <CopyOut text={asText(plan)} label="Copy" compact />
        </div>
      </div>

      {/* THE UNFINISHED ARITHMETIC, IN FRONT RATHER THAN HIDDEN.
          When no close rate has been observed this is deliberately incomplete,
          and quietly rendering nothing would undo the whole reason the engine
          refuses to guess one. */}
      <div className={`mb-4 rounded-xl border p-4 ${math.closeRate === null ? "border-amber-500/25 bg-amber-500/[0.05]" : "border-emerald-500/25 bg-emerald-500/[0.05]"}`}>
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
          <Target className="h-3.5 w-3.5" /> The first {math.target}
        </p>
        {math.closeRate === null ? (
          <p className="text-sm leading-relaxed text-amber-100/85">{math.note}</p>
        ) : (
          <>
            <p className="text-sm text-slate-200">
              <strong className="text-white">{math.conversationsNeeded?.toLocaleString()}</strong> conversations ·{" "}
              <strong className="text-white">{math.weeklyConversations}</strong> a week for 12 weeks
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{math.note}</p>
          </>
        )}
      </div>

      <Section
        icon={MapPin}
        title={plan.launchCity.locked ? `Launch city — ${plan.launchCity.city}` : "Launch city — not locked"}
        subtitle={plan.launchCity.locked ? "Everything below is written for this one place" : "The most expensive gap in this plan"}
        defaultOpen={!plan.launchCity.locked}
      >
        <p className={`text-sm leading-relaxed ${plan.launchCity.locked ? "text-slate-400" : "text-amber-100/85"}`}>{plan.launchCity.why}</p>
        {plan.launchCity.locked && (
          <>
            <p className="mb-1.5 mt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">Do these here specifically</p>
            <ul className="space-y-1">{plan.launchCity.localMoves.map((m) => <li key={m} className="text-xs leading-relaxed text-slate-400">· {m}</li>)}</ul>
          </>
        )}
        <p className="mb-1.5 mt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">A second city only when</p>
        <ul className="space-y-1">{plan.launchCity.secondCityWhen.map((m) => <li key={m} className="text-xs leading-relaxed text-slate-400">· {m}</li>)}</ul>
      </Section>

      <Section
        icon={PiggyBank}
        title={plan.budget.supplied && plan.budget.totalGbp !== null ? `Budget — ${cur}${plan.budget.totalGbp.toLocaleString()} across 90 days` : "Budget — shares, until you supply a number"}
        subtitle={plan.budget.supplied ? "Adds to exactly what you supplied; a fifth is never allocated" : "Nothing here is invented for you to spend"}
        defaultOpen
      >
        <p className={`mb-3 text-sm leading-relaxed ${plan.budget.supplied ? "text-slate-400" : "text-amber-100/85"}`}>{plan.budget.note}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.08] text-slate-500">
                <th className="pb-1.5 font-semibold">Phase</th>
                <th className="pb-1.5 font-semibold">Line</th>
                <th className="pb-1.5 text-right font-semibold">Share</th>
                <th className="pb-1.5 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {plan.budget.lines.map((l) => (
                <tr key={l.item} className="border-b border-white/[0.04]">
                  <td className="py-1.5 pr-2 align-top text-slate-500">{l.phase}</td>
                  <td className="py-1.5 pr-2 align-top text-slate-300">
                    {l.item}
                    <span className="block text-[11px] leading-relaxed text-slate-600">{l.why}</span>
                  </td>
                  <td className="py-1.5 pl-2 text-right align-top text-slate-400">{l.sharePct}%</td>
                  <td className="py-1.5 pl-2 text-right align-top font-semibold text-white">
                    {l.amount === null ? <span className="text-amber-300">—</span> : `${cur}${l.amount.toLocaleString()}`}
                  </td>
                </tr>
              ))}
              {plan.budget.supplied && plan.budget.totalGbp !== null && (
                <tr>
                  <td className="pt-2 font-semibold text-slate-400" colSpan={2}>Total</td>
                  <td className="pt-2 text-right font-semibold text-slate-400">100%</td>
                  <td className="pt-2 text-right font-bold text-emerald-300">{cur}{plan.budget.totalGbp.toLocaleString()}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-400"><span className="font-semibold text-slate-300">The floor:</span> {plan.budget.minimumNote}</p>
        <p className="mb-1.5 mt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">Rules the money obeys</p>
        <ul className="space-y-1">{plan.budget.rules.map((r) => <li key={r} className="text-xs leading-relaxed text-slate-400">· {r}</li>)}</ul>
      </Section>

      <Section icon={CalendarDays} title="30 · 60 · 90" subtitle="Each phase ends on something that can be failed" defaultOpen>
        <div className="space-y-4">
          {plan.phases.map((ph) => (
            <div key={ph.window} className="rounded-xl border border-white/[0.07] bg-ink-900/40 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-400">{ph.window}</p>
              <p className="mt-0.5 font-display text-sm font-bold text-white">{ph.title}</p>
              <p className="mt-1.5 rounded-lg border border-white/[0.07] bg-ink-950/50 px-3 py-2 text-xs leading-relaxed text-slate-300">
                <span className="font-semibold text-slate-400">Done when:</span> {ph.exitCriterion}
              </p>
              <ol className="mt-3 space-y-2.5">
                {ph.actions.map((a, i) => (
                  <li key={i} className="text-sm">
                    <p className="text-slate-200">{i + 1}. {a.do}</p>
                    <p className="mt-0.5 pl-4 text-xs leading-relaxed text-slate-500">{a.why}</p>
                    {a.tool && (
                      <a href={a.tool} className="ml-4 mt-0.5 inline-block text-xs font-semibold text-emerald-400 hover:underline">
                        Do it here →
                      </a>
                    )}
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-slate-500">
                <span className="font-semibold text-slate-400">Count at the end:</span> {ph.measure.join(" · ")}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        icon={Boxes}
        title={plan.suppliers.applicable ? "Suppliers & sourcing" : "Suppliers"}
        subtitle={plan.suppliers.applicable ? `${plan.suppliers.routes.length} routes, worst margin first — on purpose` : "Not applicable to this model"}
      >
        <p className="mb-3 text-sm leading-relaxed text-slate-400">{plan.suppliers.note}</p>
        {plan.suppliers.applicable && (
          <>
            <div className="space-y-2.5">
              {plan.suppliers.routes.map((r) => (
                <div key={r.route} className="rounded-lg border border-white/[0.07] bg-ink-900/40 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold text-white">{r.route}</p>
                    <p className="text-[11px] text-slate-500">MOQ {r.typicalMoq} · {r.leadTime}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{r.bestFor}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-amber-200/70"><span className="font-semibold">Risk:</span> {r.risk}</p>
                  <p className="mt-1 text-xs leading-relaxed text-emerald-300/80"><span className="font-semibold">First move:</span> {r.firstMove}</p>
                </div>
              ))}
            </div>
            <p className="mb-1.5 mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">Before you order</p>
            <ul className="space-y-1">{plan.suppliers.diligence.map((d) => <li key={d} className="text-xs leading-relaxed text-slate-400">· {d}</li>)}</ul>
            <p className="mb-1.5 mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">Terms</p>
            <ul className="space-y-1">{plan.suppliers.terms.map((t) => <li key={t} className="text-xs leading-relaxed text-slate-400">· {t}</li>)}</ul>
          </>
        )}
      </Section>

      <Section icon={Users} title="Who buys first" subtitle={`${plan.segments.length} segments, each with the objection and its answer`}>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {plan.segments.map((s) => (
            <div key={s.name} className="rounded-lg border border-white/[0.07] bg-ink-900/40 p-3">
              <p className="font-semibold text-white">{s.name}</p>
              <p className="mt-0.5 text-xs text-slate-400">{s.who}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-emerald-300/80"><span className="font-semibold">Why first:</span> {s.whyFirst}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500"><span className="font-semibold">Find them:</span> {s.whereTheyAre}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-300">&ldquo;{s.objection}&rdquo; → {s.answer}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section icon={Target} title="Getting the first 100" subtitle="Sequenced — paid comes last, deliberately">
        <ol className="mb-3 space-y-1.5">
          {plan.firstHundred.sequence.map((s) => <li key={s} className="text-sm leading-relaxed text-slate-300">{s}</li>)}
        </ol>
        <div className="space-y-2">
          {plan.firstHundred.channels.map((c) => (
            <div key={c.channel} className="rounded-lg border border-white/[0.07] bg-ink-900/40 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-white">{c.channel}</p>
                <p className="text-[11px] text-slate-500">{c.cost}</p>
              </div>
              <p className="mt-1 text-xs text-slate-400">{c.play}</p>
              <p className="mt-1 text-xs text-slate-500"><span className="font-semibold">Realistically:</span> {c.realistic}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section icon={Wrench} title="The acquisition loop" subtitle="And the rules for when to stop">
        <ol className="space-y-1.5">
          {plan.acquisition.loop.map((s, i) => <li key={s} className="text-sm text-slate-300">{i + 1}. {s}</li>)}
        </ol>
        <p className="mb-1.5 mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">Keeping it cheap</p>
        <ul className="space-y-1">{plan.acquisition.keepCost.map((s) => <li key={s} className="text-xs leading-relaxed text-slate-400">· {s}</li>)}</ul>
        <p className="mb-1.5 mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-rose-400/70">Stop when</p>
        <ul className="space-y-1">{plan.acquisition.killCriteria.map((s) => <li key={s} className="text-xs leading-relaxed text-rose-200/70">· {s}</li>)}</ul>
      </Section>

      <Section icon={Target} title="Unit economics" subtitle="What has to be true for any of this to work">
        <div className="space-y-1.5">
          {plan.economics.map((e) => (
            <div key={e.line} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/[0.05] pb-1.5">
              <span className="text-sm text-slate-300">{e.line}</span>
              <span className={`text-sm font-semibold ${/cannot|unknown|not supplied/i.test(e.value) ? "text-amber-300" : "text-white"}`}>{e.value}</span>
              <span className="w-full text-xs text-slate-500">{e.how}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section icon={AlertTriangle} title="What kills this" subtitle={`${plan.risks.length} risks, each with its early warning`}>
        <div className="space-y-2">
          {plan.risks.map((r) => (
            <div key={r.risk} className="rounded-lg border border-white/[0.07] bg-ink-900/40 p-3">
              <p className="font-semibold text-white">{r.risk}</p>
              <p className="mt-1 text-xs text-amber-200/70"><span className="font-semibold">Tell:</span> {r.tell}</p>
              <p className="mt-1 text-xs text-emerald-300/80"><span className="font-semibold">Move:</span> {r.move}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section icon={Wrench} title="Run it here" subtitle={`${plan.marketing.stack.length} engines, and which of them cost nothing`}>
        <div className="space-y-1.5">
          {plan.marketing.stack.map((m) => (
            <div key={m.where} className="border-b border-white/[0.05] pb-1.5">
              <p className="text-sm text-slate-300">
                {m.job} → <a href={m.url} className="font-semibold text-emerald-400 hover:underline">{m.where}</a>
              </p>
              <p className="text-xs leading-relaxed text-slate-500">{m.why}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-400">{plan.marketing.note}</p>
      </Section>

      {/* Last and never collapsed. What a plan does NOT claim is the part a
          person about to spend their savings most needs to read. */}
      <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-4">
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300/80">What this plan does not claim</p>
        <ul className="space-y-1.5">
          {plan.honesty.map((h) => <li key={h} className="text-xs leading-relaxed text-amber-100/75">· {h}</li>)}
        </ul>
      </div>
    </div>
  );
}
