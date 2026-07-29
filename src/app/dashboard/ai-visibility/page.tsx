"use client";

// AI Visibility — are you recommended when a buyer asks an assistant?
//
// Every number on this page traces back to an answer you can read. There is no
// vendor behind it and no score anyone has to take on trust: the platform asks
// each assistant the questions, keeps the replies, and shows you the text the
// verdict came from.

import { useCallback, useEffect, useState } from "react";
import { Loader2, Bot, Play, CheckCircle2, XCircle, AlertTriangle, TrendingUp, TrendingDown, Minus, Plus, X } from "lucide-react";
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
  id: string; ranAt: string; visibilityRate: number; mentioned: number; askedCount: number;
  assistants: string[]; results: Result[]; topCompetitors: { name: string; appearances: number }[]; note: string;
};
type Trend = { direction: "up" | "down" | "flat" | "unknown"; delta: number; note: string };

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
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Named in</p>
                  <p className="font-display text-3xl font-bold text-white">{run.visibilityRate}%</p>
                  <p className="text-[11px] text-slate-500">{run.mentioned} of {run.askedCount} answers</p>
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

          {note && <p className="text-[11px] leading-relaxed text-slate-500">{note}</p>}
        </>
      )}
    </div>
  );
}
