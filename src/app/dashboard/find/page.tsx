"use client";

// FINDING YOUR OWN WORK (§92's surface).
//
// The other search on this platform is WEB search — competitors, local leads,
// keywords. Nothing let somebody find the campaign they wrote last month, so
// the only way was to remember which of sixty-five screens it was on.
//
// TWO THINGS THIS SCREEN DOES THAT MOST SEARCH BOXES DO NOT.
//
//   1. IT SHOWS WHY EACH RESULT MATCHED — title, an exact phrase, the body —
//      and which of your words it found. A list with no reasons is a list you
//      either trust completely or not at all, and neither is useful.
//   2. AN EMPTY RESULT SAYS WHAT IT SEARCHED. "Nothing in your 47 saved items
//      contains 'submarine'" is a different message from "no results", because
//      it tells you the account is not empty and the query is.
//
// It is free. A web search spends provider budget per query; looking through
// your own files spends nothing, and charging for it would be charging somebody
// to find their own work.

import { useCallback, useState } from "react";
import Link from "next/link";
import { Search, Loader2, AlertTriangle, FileText } from "lucide-react";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";
import { PageHeader, Pill } from "@/components/ui";

type Hit = {
  id: string; kind: string; title: string; subtitle?: string; body?: string;
  href: string; at?: string; matchedOn: string[]; matchedWords: string[];
};
type Result = { hits: Hit[]; terms: string[]; ignored: string[]; totalSearched: number; headline: string; unavailable: string[] };

const KIND_LABEL: Record<string, string> = {
  approval: "Approval", brand_fact: "Brand fact", experiment: "Experiment",
  asset: "Asset", campaign: "Campaign", publication: "Publication", contact: "Contact",
};
const WHERE: Record<string, string> = {
  exact_phrase: "exact phrase", title: "in the title", subtitle: "in the status", body: "in the text",
};

export default function FindPage() {
  const { activeBrand } = useActiveBrand();
  const [q, setQ] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!activeBrand) return;
    setLoading(true); setError(null);
    try {
      const res = await authedFetch("/api/search", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mine", brandId: activeBrand.id, query: q }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "The search could not run.");
      setResult(d as Result);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [activeBrand, q]);

  return (
    <div>
      <PageHeader
        kicker="Find"
        title="Your own work"
        subtitle="Search the things you made — approvals, brand facts, past experiments. Not the web; that is Search Intelligence."
        actions={<Pill tone="good">Free · no key needed</Pill>}
      />

      {!activeBrand ? (
        <div className="card border-emerald-500/20 p-10 text-center">
          <FileText className="mx-auto mb-2 h-7 w-7 text-emerald-500/60" />
          <h2 className="font-display text-lg font-bold text-white">Pick a brand to search its work</h2>
        </div>
      ) : (
        <>
          <form
            onSubmit={(e) => { e.preventDefault(); void run(); }}
            className="mb-5 flex flex-wrap gap-2"
          >
            <input
              className="input min-w-[240px] flex-1"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="e.g. spring hero video, free delivery, the offer that won"
              aria-label="Search your own work"
            />
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search
            </button>
          </form>

          {error && <p className="mb-4 flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300"><AlertTriangle className="h-4 w-4" /> {error}</p>}

          {result && (
            <>
              {/* The headline carries the honest part: what was searched, what
                  was ignored, and whether a source could not be read. */}
              <p className="mb-4 text-sm text-slate-300">{result.headline}</p>
              {result.ignored.length > 0 && result.hits.length > 0 && (
                <p className="mb-4 text-xs text-slate-500">Ignored as too common: {result.ignored.join(", ")}.</p>
              )}

              <div className="space-y-3">
                {result.hits.map((h) => (
                  <Link key={`${h.kind}-${h.id}`} href={h.href} className="card block p-4 transition hover:border-emerald-500/30">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="rounded-full bg-ink-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        {KIND_LABEL[h.kind] || h.kind}
                      </span>
                      <span className="font-display text-sm font-bold text-white">{h.title}</span>
                      {h.subtitle && <span className="text-xs text-slate-500">{h.subtitle}</span>}
                      {h.at && <span className="ml-auto text-[11px] text-slate-600">{h.at.slice(0, 10)}</span>}
                    </div>
                    {h.body && <p className="mt-1 line-clamp-2 text-sm text-slate-400">{h.body}</p>}
                    {/* Why it matched — never a score. */}
                    <p className="mt-1.5 text-[11px] text-slate-600">
                      Matched {h.matchedOn.map((m) => WHERE[m] || m).join(", ")}
                      {h.matchedWords.length > 0 && <> · found {h.matchedWords.map((w) => `"${w}"`).join(", ")}</>}
                    </p>
                  </Link>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
