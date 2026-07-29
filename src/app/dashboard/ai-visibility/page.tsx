"use client";

// AI Visibility — are you recommended when a buyer asks an assistant?
//
// Every number on this page traces back to an answer you can read. There is no
// vendor behind it and no score anyone has to take on trust: the platform asks
// each assistant the questions, keeps the replies, and shows you the text the
// verdict came from.

import { useCallback, useEffect, useState } from "react";
import { Loader2, Bot, Play, CheckCircle2, XCircle, AlertTriangle, TrendingUp, TrendingDown, Minus, Plus, X, Target, Wrench, FileText, Search, ExternalLink, Check, PenLine, CalendarClock } from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";

type Question = { id: string; text: string; intent: string };
type Verdict = {
  assistant: string; model?: string; mentioned: boolean; rank: number | null;
  competitors: string[]; evidence: string; answer: string; error?: string; asked: boolean;
};
type Result = { question: Question; verdicts: Verdict[] };
type Run = {
  id: string; brand?: string; ranAt: string; visibilityRate: number; mentioned: number; askedCount: number;
  unpromptedRate?: number; unpromptedMentions?: number; unpromptedAnswers?: number;
  assistants: string[]; results: Result[]; topCompetitors: { name: string; appearances: number }[]; note: string;
};
type Trend = { direction: "up" | "down" | "flat" | "unknown"; delta: number; note: string };
type Action = {
  id: string; title: string; mechanism: string; evidence: string; source: string;
  detail: string; effort: string; priority: number; runIn?: string;
};
type Brief = { question: string; angle: string; outline: string[]; proofNeeded: string[] };
type Playbook = {
  brand: string; unpromptedRate: number; unpromptedMentions: number; unpromptedAnswers: number;
  incumbents: { name: string; appearances: number; share: number }[];
  actions: Action[]; briefs: Brief[]; headline: string; note: string;
};

type SourcePage = {
  url: string; domain: string; title: string; kind: string;
  namesRivals: string[]; namesYou: boolean; fetched: boolean;
  forQuestion: string; strength: number; route: string;
};
type SourcesReport = {
  pages: SourcePage[];
  priorityDomains: { domain: string; pages: number; rivalsNamed: number; youNamed: boolean }[];
  searched: number; fetched: number; live: boolean; note: string;
};

type PageDraft = {
  title: string; excerpt: string; content: string;
  blockers: { excerpt: string; reason: string; fix: string }[];
  warnings: { excerpt: string; reason: string; fix: string }[];
  unanswered: string[]; safeToPublish: boolean; note: string;
};

const KIND_LABEL: Record<string, string> = {
  "review-platform": "Review platform", directory: "Directory", roundup: "Round-up",
  comparison: "Comparison", forum: "Community thread", social: "Written by a person",
  explainer: "Explainer", "vendor-site": "A competitor's own site",
  unknown: "Unclassified",
};

const MECHANISM_LABEL: Record<string, string> = {
  retrieval: "Can a model reach it",
  "training-corpus": "What the models learned from",
  extractability: "Can a model quote it",
  measurement: "Knowing if it worked",
};

const ASSISTANT_LABEL: Record<string, string> = { anthropic: "Claude", openai: "ChatGPT", gemini: "Gemini" };

export default function AiVisibilityPage() {
  const { activeBrand, ready } = useActiveBrand();
  const [questions, setQuestions] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [trend, setTrend] = useState<Trend | null>(null);
  const [assistants, setAssistants] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<Playbook | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [planErr, setPlanErr] = useState<string | null>(null);
  const [planNote, setPlanNote] = useState("");
  const [sources, setSources] = useState<SourcesReport | null>(null);
  const [srcBusy, setSrcBusy] = useState(false);
  const [srcErr, setSrcErr] = useState<string | null>(null);
  const [srcNote, setSrcNote] = useState("");
  // Page writing: which brief is open, the facts typed for it, and the draft.
  const [writing, setWriting] = useState<string | null>(null);
  const [facts, setFacts] = useState<Record<string, string>>({});
  const [pageBusy, setPageBusy] = useState(false);
  const [pageErr, setPageErr] = useState<string | null>(null);
  const [draftOut, setDraftOut] = useState<PageDraft | null>(null);
  // Weekly schedule.
  const [sched, setSched] = useState<{ enabled: boolean; cadenceDays: number; notifyEmail?: string } | null>(null);
  const [schedEmail, setSchedEmail] = useState("");
  const [schedBusy, setSchedBusy] = useState(false);
  const [schedNote, setSchedNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async (brandId: string, b: { name: string; product?: string; location?: string; audience?: string }) => {
    const qs = new URLSearchParams({
      brandId, business: b.name, product: b.product || "", location: b.location || "", audience: b.audience || "",
    });
    try {
      const r = await authedFetch(`/api/ai-visibility?${qs}`);
      const d = await r.json().catch(() => ({}));
      setQuestions((cur) => (cur.length ? cur : (d.suggested || []).map((q: Question) => q.text)));
      setRuns(Array.isArray(d.runs) ? d.runs : []);
      setRun(d.latest ?? null);
      setTrend(d.trend ?? null);
      setAssistants(Array.isArray(d.assistants) ? d.assistants : []);
      setNote(typeof d.note === "string" ? d.note : "");
    } catch { /* an empty page is better than a wrong one */ }
  }, []);

  useEffect(() => {
    if (ready && activeBrand) load(activeBrand.id, activeBrand);
  }, [ready, activeBrand, load]);

  async function check() {
    if (!activeBrand || busy) return;
    setBusy(true); setErr(null);
    // The server keeps itself under its own ceiling, but a spinner that can never
    // stop is the worst possible failure: it looks like work. Give up here too.
    const ctl = new AbortController();
    const giveUp = setTimeout(() => ctl.abort(), 75_000);
    try {
      const r = await authedFetch("/api/ai-visibility", {
        method: "POST",
        headers: { "content-type": "application/json", "x-now": new Date().toISOString() },
        signal: ctl.signal,
        body: JSON.stringify({
          brandId: activeBrand.id, business: activeBrand.name,
          domain: activeBrand.website, questions,
          product: activeBrand.product, location: activeBrand.location, audience: activeBrand.audience,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        // 502/504 mean the function was killed before it could answer — nothing was
        // recorded and nothing was charged for the calls it never made.
        setErr(d.error || (r.status === 504 || r.status === 502
          ? `The check took too long and the server cut it off (HTTP ${r.status}). Nothing was recorded. Try again with fewer questions — each one is asked of every assistant, so removing two questions removes ${assistants.length * 2} calls.`
          : `Check failed (HTTP ${r.status})`));
        return;
      }
      setRun(d.run); setTrend(d.trend); setRuns(d.runs || []); setNote(d.note || "");
    } catch (e) {
      const aborted = (e as Error).name === "AbortError";
      setErr(aborted
        ? "Gave up waiting after 75 seconds. Nothing was recorded. Run it again with fewer questions."
        : `Couldn't run the check: ${(e as Error).message || "network error"}.`);
    } finally { clearTimeout(giveUp); setBusy(false); }
  }

  // The other half of the module: what to DO about the score. Works from the
  // run already recorded rather than asking the assistants again, so the advice
  // matches the number on screen instead of a slightly different one.
  async function buildPlan() {
    if (!activeBrand || planBusy) return;
    setPlanBusy(true); setPlanErr(null);
    const ctl = new AbortController();
    const giveUp = setTimeout(() => ctl.abort(), 75_000);
    try {
      const r = await authedFetch("/api/ai-citation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: ctl.signal,
        body: JSON.stringify({
          brandId: activeBrand.id,
          domain: activeBrand.website,
          category: activeBrand.product,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setPlanErr(d.error || (r.status === 504 || r.status === 502
          ? `The plan took too long and the server cut it off (HTTP ${r.status}). Nothing was charged for work that did not happen — try again.`
          : `Could not build the plan (HTTP ${r.status})`));
        return;
      }
      setPlan(d.playbook); setPlanNote(d.note || "");
    } catch (e) {
      setPlanErr((e as Error).name === "AbortError"
        ? "Gave up waiting after 75 seconds. Nothing was charged for work that did not finish."
        : `Could not build the plan: ${(e as Error).message || "network error"}.`);
    } finally { clearTimeout(giveUp); setPlanBusy(false); }
  }

  // Turns the plan's top action from homework into a worklist: search the
  // questions, read the pages that rank, report which name the same rivals.
  async function findSources() {
    if (!activeBrand || srcBusy) return;
    setSrcBusy(true); setSrcErr(null);
    const ctl = new AbortController();
    const giveUp = setTimeout(() => ctl.abort(), 75_000);
    try {
      const r = await authedFetch("/api/ai-citation/sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: ctl.signal,
        body: JSON.stringify({ brandId: activeBrand.id, domain: activeBrand.website, location: activeBrand.location }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setSrcErr(d.error || `Could not look up the sources (HTTP ${r.status})`); return; }
      setSources(d.report); setSrcNote(d.note || "");
    } catch (e) {
      setSrcErr((e as Error).name === "AbortError"
        ? "Gave up waiting after 75 seconds. Nothing was charged for searches that did not run."
        : `Could not look up the sources: ${(e as Error).message || "network error"}.`);
    } finally { clearTimeout(giveUp); setSrcBusy(false); }
  }

  // Write the page a brief describes. The facts the customer types are the ONLY
  // things the model may state about them — that constraint is enforced server
  // side and re-checked against the output.
  async function writePage(b: Brief) {
    if (!activeBrand || pageBusy) return;
    setPageBusy(true); setPageErr(null); setDraftOut(null);
    try {
      const r = await authedFetch("/api/ai-citation/page", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brandId: activeBrand.id, business: activeBrand.name, domain: activeBrand.website,
          category: activeBrand.product, question: b.question, angle: b.angle, outline: b.outline,
          proof: b.proofNeeded.map((q) => ({ question: q, answer: facts[q] || "" })),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setPageErr(d.error || `Could not write the page (HTTP ${r.status})`); return; }
      setDraftOut(d.draft);
    } catch (e) {
      setPageErr(`Could not write the page: ${(e as Error).message || "network error"}.`);
    } finally { setPageBusy(false); }
  }

  const loadSchedule = useCallback(async (brandId: string) => {
    try {
      const r = await authedFetch(`/api/ai-visibility/scheduled?brandId=${encodeURIComponent(brandId)}`);
      const d = await r.json().catch(() => ({}));
      if (d.schedule) { setSched(d.schedule); setSchedEmail(d.schedule.notifyEmail || ""); }
      setSchedNote(d.note || "");
    } catch { /* the page works without it */ }
  }, []);

  useEffect(() => { if (ready && activeBrand) loadSchedule(activeBrand.id); }, [ready, activeBrand, loadSchedule]);

  async function saveSchedule(enabled: boolean) {
    if (!activeBrand || schedBusy) return;
    setSchedBusy(true);
    try {
      const r = await authedFetch("/api/ai-visibility/scheduled", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brandId: activeBrand.id, business: activeBrand.name, domain: activeBrand.website,
          enabled, questions, notifyEmail: schedEmail, cadenceDays: sched?.cadenceDays ?? 7,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.schedule) setSched(d.schedule);
      setSchedNote(d.error || d.note || "");
    } catch (e) {
      setSchedNote(`Could not save the schedule: ${(e as Error).message || "network error"}.`);
    } finally { setSchedBusy(false); }
  }

  const TrendIcon = trend?.direction === "up" ? TrendingUp : trend?.direction === "down" ? TrendingDown : Minus;

  return (
    <div>
      <PageHeader
        kicker="AI Visibility"
        title="Are you recommended when someone asks an AI?"
        subtitle="Buyers ask assistants before they search. This asks Claude, ChatGPT and Gemini the questions your customers actually ask, records what they answer, and shows whether you were named — and who was named instead. No third-party subscription: it uses the AI already connected here, so the answers and the history are yours."
        actions={<Pill tone="info">{assistants.length} assistant{assistants.length === 1 ? "" : "s"} connected</Pill>}
      />

      {ready && !activeBrand && (
        <div className="card p-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10 text-violet-300"><Bot className="h-5 w-5" /></span>
          <h2 className="mt-4 font-display text-lg font-bold text-white">Pick a brand first</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">Visibility is measured per brand, so choose one in the switcher.</p>
        </div>
      )}

      {activeBrand && (
        <>
          {!assistants.length && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/[0.07] p-3 text-xs text-rose-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{note || "No AI provider is configured, so no assistant can be asked. That is a configuration problem, not a visibility result."}</p>
            </div>
          )}

          {/* The questions. This is the whole method: ask what a BUYER asks. */}
          <div className="mb-6 card p-5">
            <h3 className="font-display text-sm font-bold text-white">The questions we ask</h3>
            <p className="mt-1 text-xs text-slate-500">
              Written as a customer would type them — not as questions about you. Asking &ldquo;tell me about {activeBrand.name}&rdquo; proves nothing: an assistant will discuss whatever it is handed. Being named unprompted is the thing worth measuring.
            </p>
            <div className="mt-3 space-y-1.5">
              {questions.map((q, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-850/40 px-3 py-1.5">
                  <span className="flex-1 text-sm text-slate-200">{q}</span>
                  <button onClick={() => setQuestions((c) => c.filter((_, k) => k !== i))} className="rounded p-1 text-slate-500 hover:text-rose-300" title="Remove">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                className="input flex-1" value={draft} onChange={(e) => setDraft(e.target.value)}
                placeholder="Add a question your customers actually ask…"
                onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { setQuestions((c) => [...c, draft.trim()].slice(0, 8)); setDraft(""); } }}
              />
              <button
                className="btn-ghost"
                onClick={() => { if (draft.trim()) { setQuestions((c) => [...c, draft.trim()].slice(0, 8)); setDraft(""); } }}
              ><Plus className="h-4 w-4" /> Add</button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button className="btn-primary !bg-violet-500 hover:!bg-violet-400" onClick={check} disabled={busy || !questions.length || !assistants.length}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {busy ? "Asking…" : `Ask ${assistants.length} assistant${assistants.length === 1 ? "" : "s"}`}
              </button>
              <span className="text-[11px] text-slate-500">
                {questions.length} question{questions.length === 1 ? "" : "s"} × {assistants.length} assistant{assistants.length === 1 ? "" : "s"} = {questions.length * assistants.length} AI calls, charged in ACUs.
              </span>
            </div>
            {err && <p className="mt-2 flex items-start gap-1.5 text-xs text-rose-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {err}</p>}
          </div>

          {run && run.askedCount > 0 && (
            <>
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <div className="card p-4">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Named unprompted</p>
                  <p className="font-display text-3xl font-bold text-white">{run.unpromptedRate ?? run.visibilityRate}%</p>
                  <p className="text-[11px] leading-relaxed text-slate-500">
                    {run.unpromptedMentions ?? run.mentioned} of {run.unpromptedAnswers ?? run.askedCount} buying answers.
                    {typeof run.unpromptedAnswers === "number" && run.unpromptedAnswers !== run.askedCount
                      ? ` The "what is ${run.brand ?? "your brand"}?" question is excluded — being named when you were handed the name measures nothing.`
                      : ""}
                  </p>
                </div>
                <div className="card p-4">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Since last run</p>
                  <p className={`flex items-center gap-1.5 font-display text-3xl font-bold ${trend?.direction === "up" ? "text-emerald-300" : trend?.direction === "down" ? "text-rose-300" : "text-slate-300"}`}>
                    <TrendIcon className="h-6 w-6" />{trend && trend.direction !== "unknown" ? `${trend.delta > 0 ? "+" : ""}${trend.delta}` : "—"}
                  </p>
                  <p className="text-[11px] text-slate-500">{runs.length} run{runs.length === 1 ? "" : "s"} recorded</p>
                </div>
                <div className="card p-4">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Recommended instead</p>
                  <p className="font-display text-3xl font-bold text-white">{run.topCompetitors.length}</p>
                  <p className="truncate text-[11px] text-slate-500">{run.topCompetitors.slice(0, 3).map((c) => c.name).join(", ") || "none named"}</p>
                </div>
              </div>

              {trend && (
                <p className="mb-4 rounded-lg border border-ink-700 bg-ink-850/40 px-3 py-2 text-[11px] text-slate-400">{trend.note}</p>
              )}

              <div className="mb-4 space-y-2">
                {run.results.map((r) => (
                  <div key={r.question.id} className="card p-4">
                    <p className="font-display text-sm font-bold text-white">{r.question.text}</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {r.verdicts.map((v) => (
                        <button
                          key={v.assistant}
                          onClick={() => setOpen(open === `${r.question.id}:${v.assistant}` ? null : `${r.question.id}:${v.assistant}`)}
                          className={`rounded-lg border p-2.5 text-left ${
                            !v.asked ? "border-ink-700 bg-ink-900/40"
                              : v.mentioned ? "border-emerald-500/30 bg-emerald-500/[0.07]" : "border-rose-500/25 bg-rose-500/[0.05]"}`}
                        >
                          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                            {!v.asked ? <AlertTriangle className="h-3.5 w-3.5 text-slate-500" />
                              : v.mentioned ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                              : <XCircle className="h-3.5 w-3.5 text-rose-400" />}
                            {ASSISTANT_LABEL[v.assistant] || v.assistant}
                            {v.rank ? <span className="ml-auto text-[10px] text-slate-400">#{v.rank}</span> : null}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {!v.asked ? (v.error || "not asked") : v.mentioned ? "named you" : "did not name you"}
                          </p>
                        </button>
                      ))}
                    </div>
                    {r.verdicts.map((v) => open === `${r.question.id}:${v.assistant}` && (
                      <div key={`o-${v.assistant}`} className="mt-2 rounded-lg border border-ink-700 bg-ink-950/60 p-3">
                        <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                          What {ASSISTANT_LABEL[v.assistant] || v.assistant} actually said{v.model ? ` · ${v.model}` : ""}
                        </p>
                        {v.evidence && <p className="mb-2 rounded bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">{v.evidence}</p>}
                        <p className="whitespace-pre-wrap text-xs text-slate-300">{v.answer || v.error}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {Boolean(run.topCompetitors.length) && (
                <div className="mb-4 card p-4">
                  <h3 className="font-display text-sm font-bold text-white">Named instead of you</h3>
                  <p className="mt-0.5 text-[11px] text-slate-500">Read out of the answers themselves — only from lists, because guessing which words in a paragraph are companies would invent rivals you do not have.</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {run.topCompetitors.map((c) => (
                      <span key={c.name} className="rounded-full border border-ink-700 bg-ink-850 px-2.5 py-1 text-[11px] text-slate-300">
                        {c.name} <span className="text-slate-500">×{c.appearances}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ---- How to actually get cited -------------------------------- */}
          {run && run.askedCount > 0 && (
            <div className="mb-4 card p-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300"><Target className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-sm font-bold text-white">How to get cited</h3>
                  <p className="text-[11px] text-slate-500">
                    Built from this run and from your live site. Every action names the fact it came from — nothing here is a score we invented.
                  </p>
                </div>
                <button className="btn-primary !bg-violet-500 hover:!bg-violet-400" onClick={buildPlan} disabled={planBusy}>
                  {planBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                  {planBusy ? "Building…" : plan ? "Rebuild the plan" : "Build my plan"}
                </button>
              </div>

              {planErr && (
                <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/[0.07] px-3 py-2 text-xs text-rose-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{planErr}
                </p>
              )}

              {plan && (
                <div className="mt-4">
                  <p className="rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2.5 text-xs leading-relaxed text-slate-200">{plan.headline}</p>

                  {/* The honest score, separated from the vanity one. */}
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-ink-700 bg-ink-850 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">Named unprompted</p>
                      <p className="font-display text-2xl font-bold text-white">{plan.unpromptedRate}%</p>
                      <p className="text-[11px] text-slate-500">
                        {plan.unpromptedMentions} of {plan.unpromptedAnswers} buying answers. The &ldquo;what is {plan.brand}?&rdquo; question is excluded — being named when you were handed the name measures nothing.
                      </p>
                    </div>
                    {Boolean(plan.incumbents.length) && (
                      <div className="rounded-lg border border-ink-700 bg-ink-850 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-slate-500">Recommended instead</p>
                        <div className="mt-1.5 space-y-1">
                          {plan.incumbents.slice(0, 4).map((c) => (
                            <p key={c.name} className="flex items-baseline gap-2 text-[11px] text-slate-300">
                              <span className="truncate">{c.name}</span>
                              <span className="ml-auto shrink-0 text-slate-500">{c.share}% of answers</span>
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 space-y-2">
                    {plan.actions.map((a, i) => (
                      <div key={a.id} className="rounded-lg border border-ink-700 bg-ink-950/50 p-3">
                        <div className="flex items-start gap-2.5">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-violet-500/15 text-[10px] font-bold text-violet-300">{i + 1}</span>
                          <div className="min-w-0">
                            <p className="font-display text-sm font-bold text-white">{a.title}</p>
                            <p className="mt-1 text-[11px] italic text-emerald-300/90">
                              Because: {a.evidence} <span className="not-italic text-slate-500">({a.source})</span>
                            </p>
                            <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{a.detail}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <span className="rounded-full border border-ink-700 bg-ink-850 px-2 py-0.5 text-[10px] text-slate-400">{MECHANISM_LABEL[a.mechanism] || a.mechanism}</span>
                              <span className="rounded-full border border-ink-700 bg-ink-850 px-2 py-0.5 text-[10px] text-slate-400">{a.effort}</span>
                              {a.runIn && <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-200">Do this in {a.runIn}</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {Boolean(plan.briefs.length) && (
                    <div className="mt-4">
                      <h4 className="flex items-center gap-1.5 font-display text-xs font-bold text-white">
                        <FileText className="h-3.5 w-3.5 text-violet-300" />
                        Page briefs for the questions you were absent from
                      </h4>
                      <div className="mt-2 space-y-2">
                        {plan.briefs.map((b) => (
                          <div key={b.question} className="rounded-lg border border-ink-700 bg-ink-950/50 p-3">
                            <p className="font-display text-xs font-bold text-white">{b.question}</p>
                            <p className="mt-1 text-[11px] text-slate-400">{b.angle}</p>
                            <ul className="mt-2 space-y-0.5">
                              {b.outline.map((h) => (
                                <li key={h} className="text-[11px] text-slate-300">— {h}</li>
                              ))}
                            </ul>
                            {Boolean(b.proofNeeded.length) && (
                              <p className="mt-2 rounded bg-amber-500/[0.07] px-2 py-1.5 text-[10px] leading-relaxed text-amber-200/90">
                                You must supply: {b.proofNeeded.join("; ")}. These are left blank on purpose — inventing them would put claims on your site that you cannot stand behind.
                              </p>
                            )}

                            <button
                              onClick={() => { setWriting(writing === b.question ? null : b.question); setDraftOut(null); setPageErr(null); }}
                              className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-violet-300 hover:text-violet-200"
                            >
                              <PenLine className="h-3 w-3" />
                              {writing === b.question ? "Close" : "Write this page"}
                            </button>

                            {writing === b.question && (
                              <div className="mt-2 rounded-lg border border-ink-700 bg-ink-950/70 p-3">
                                <p className="text-[11px] leading-relaxed text-slate-400">
                                  Fill in what you can. The writer is given <strong className="text-slate-200">only</strong> what you type here and is forbidden from stating anything else about your business — anything left blank comes back marked <code className="text-amber-200">[NEEDS: …]</code> rather than invented. A page carrying a claim you cannot stand behind is the worst outcome of this whole exercise: the assistants would learn it.
                                </p>
                                <div className="mt-2 space-y-2">
                                  {b.proofNeeded.map((q) => (
                                    <label key={q} className="block">
                                      <span className="mb-0.5 block text-[10px] text-slate-500">{q}</span>
                                      <textarea
                                        rows={2}
                                        value={facts[q] || ""}
                                        onChange={(e) => setFacts((f) => ({ ...f, [q]: e.target.value }))}
                                        placeholder="Leave blank if you cannot evidence it"
                                        className="w-full rounded border border-ink-700 bg-ink-900 px-2 py-1.5 text-[11px] text-white placeholder-slate-600 outline-none focus:border-violet-500/50"
                                      />
                                    </label>
                                  ))}
                                </div>
                                <button className="btn-primary !bg-violet-500 hover:!bg-violet-400 mt-2" onClick={() => writePage(b)} disabled={pageBusy}>
                                  {pageBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
                                  {pageBusy ? "Writing…" : "Write the draft"}
                                </button>

                                {pageErr && <p className="mt-2 rounded border border-rose-500/30 bg-rose-500/[0.07] px-2 py-1.5 text-[11px] text-rose-200">{pageErr}</p>}

                                {draftOut && (
                                  <div className="mt-3">
                                    <p className={`rounded px-2 py-1.5 text-[11px] ${draftOut.safeToPublish ? "bg-emerald-500/10 text-emerald-200" : "bg-rose-500/10 text-rose-200"}`}>
                                      {draftOut.safeToPublish ? "No unsupported claims found. Saved as a draft." : `${draftOut.blockers.length} claim(s) here are not backed by anything you supplied — fix these before publishing.`}
                                    </p>
                                    {draftOut.blockers.map((f, i) => (
                                      <p key={`b${i}`} className="mt-1.5 rounded border border-rose-500/25 bg-rose-500/[0.06] px-2 py-1.5 text-[10px] leading-relaxed text-rose-100">
                                        <strong>&ldquo;{f.excerpt}&rdquo;</strong> — {f.reason} {f.fix}
                                      </p>
                                    ))}
                                    {draftOut.warnings.map((f, i) => (
                                      <p key={`w${i}`} className="mt-1.5 rounded border border-amber-500/25 bg-amber-500/[0.06] px-2 py-1.5 text-[10px] leading-relaxed text-amber-100">
                                        <strong>&ldquo;{f.excerpt}&rdquo;</strong> — {f.reason} {f.fix}
                                      </p>
                                    ))}
                                    <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded border border-ink-700 bg-ink-950 p-2.5 text-[11px] leading-relaxed text-slate-300">{draftOut.content}</pre>
                                    <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">{draftOut.note}</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* The top action, done for you rather than assigned to you. */}
                  <div className="mt-4 rounded-lg border border-violet-500/25 bg-violet-500/[0.05] p-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <h4 className="flex items-center gap-1.5 font-display text-xs font-bold text-white">
                          <Search className="h-3.5 w-3.5 text-violet-300" />
                          Find the pages the answers came from
                        </h4>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                          Action 1 says to search your questions and get onto the pages that rank. This does it: searches them, reads the results, and shows which pages carry the same companies the assistants named.
                        </p>
                      </div>
                      <button className="btn-secondary" onClick={findSources} disabled={srcBusy}>
                        {srcBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        {srcBusy ? "Searching…" : sources ? "Search again" : "Find the source pages"}
                      </button>
                    </div>

                    {srcErr && (
                      <p className="mt-2 flex items-start gap-1.5 rounded border border-rose-500/30 bg-rose-500/[0.07] px-2.5 py-1.5 text-[11px] text-rose-200">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{srcErr}
                      </p>
                    )}

                    {sources && Boolean(sources.priorityDomains.length) && (
                      <div className="mt-3">
                        <p className="text-[10px] uppercase tracking-wide text-slate-500">Worth the effort first — these carry your rivals across more than one question</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {sources.priorityDomains.map((d) => (
                            <span key={d.domain} className={`rounded-full border px-2.5 py-1 text-[11px] ${d.youNamed ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-ink-700 bg-ink-850 text-slate-300"}`}>
                              {d.youNamed && <Check className="mr-1 inline h-3 w-3" />}
                              {d.domain} <span className="text-slate-500">· {d.pages} page{d.pages === 1 ? "" : "s"}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {sources && Boolean(sources.pages.length) && (
                      <div className="mt-3 space-y-1.5">
                        {sources.pages.slice(0, 12).map((p) => (
                          <div key={p.url} className="rounded border border-ink-700 bg-ink-950/60 p-2.5">
                            <div className="flex items-start gap-2">
                              <span className="mt-0.5 w-8 shrink-0 text-center font-display text-[11px] font-bold text-violet-300">{p.strength}</span>
                              <div className="min-w-0 flex-1">
                                <a href={p.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-1 text-xs font-semibold text-slate-100 hover:text-white">
                                  <span className="truncate">{p.title}</span>
                                  <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" />
                                </a>
                                <p className="mt-0.5 text-[10px] text-slate-500">
                                  {p.domain} · {KIND_LABEL[p.kind] || p.kind}
                                  {!p.fetched && " · could not be read, judged on its search result only"}
                                </p>
                                {Boolean(p.namesRivals.length) && (
                                  <p className="mt-1 text-[11px] text-amber-200/90">Names {p.namesRivals.join(", ")}</p>
                                )}
                                <p className={`mt-1 text-[11px] leading-relaxed ${p.namesYou ? "text-emerald-300" : "text-slate-400"}`}>{p.route}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {srcNote && <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{srcNote}</p>}
                  </div>

                  {planNote && <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{planNote}</p>}
                </div>
              )}
            </div>
          )}

          {/* ---- Weekly runs ------------------------------------------------ */}
          {Boolean(questions.length) && (
            <div className="mb-4 card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300"><CalendarClock className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-sm font-bold text-white">Run this every week automatically</h3>
                  <p className="text-[11px] leading-relaxed text-slate-500">
                    One run is a sample. The trend only exists if the runs keep happening — on the <em>same</em> questions, because changing them restarts the comparison.
                  </p>
                </div>
                <button
                  className={sched?.enabled ? "btn-secondary" : "btn-primary !bg-violet-500 hover:!bg-violet-400"}
                  onClick={() => saveSchedule(!sched?.enabled)}
                  disabled={schedBusy}
                >
                  {schedBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                  {sched?.enabled ? "Turn off weekly runs" : "Run weekly"}
                </button>
              </div>

              <label className="mt-3 block">
                <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Email me when it actually moves (optional)</span>
                <input
                  type="email"
                  value={schedEmail}
                  onChange={(e) => setSchedEmail(e.target.value)}
                  onBlur={() => { if (sched?.enabled) saveSchedule(true); }}
                  placeholder="you@business.com"
                  className="w-full max-w-sm rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-violet-500/50"
                />
              </label>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                Alerts fire <strong className="text-slate-300">only</strong> when the movement is bigger than these models produce on their own. A run that drifts within the noise is recorded silently — an email every week regardless of what you did is one nobody reads.
              </p>
              {schedNote && <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{schedNote}</p>}
            </div>
          )}

          {note && <p className="text-[11px] leading-relaxed text-slate-500">{note}</p>}
        </>
      )}
    </div>
  );
}
