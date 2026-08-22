"use client";

// WHAT HAPPENED WHILE YOU WERE AWAY (§70).
//
// The audit log has recorded every change since it shipped and NOTHING RENDERED
// IT. `/dashboard/audit` is the website audit, which is a different thing with a
// confusingly similar name, so the trail was reachable only by calling the API
// by hand.
//
// The unattended column is first and is the point of the page. "What did the AI
// do" and "what did I do" are different questions, and the one people open this
// screen to answer is the first.
//
// Nothing here is computed in the browser: `buildFeed` runs server-side on the
// same entries the forensic view returns, so the feed and the trail can never
// disagree about what happened.

import { useCallback, useEffect, useState } from "react";
import { Loader2, Bot, User, AlertTriangle, RefreshCw, History } from "lucide-react";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";
import { PageHeader, Pill } from "@/components/ui";
import CopyOut from "@/components/CopyOut";

type FeedEntry = {
  ids: string[];
  at: string;
  actorType: "user" | "agent" | "system";
  actor: string;
  action: string;
  count: number;
  text: string;
  unattended: boolean;
  reason?: string;
  recognised: boolean;
};

type Feed = { unattended: FeedEntry[]; yours: FeedEntry[]; headline: string; unmappedActions: string[] };

function Line({ e }: { e: FeedEntry }) {
  return (
    <li className="flex gap-3 border-b border-ink-800/70 py-2.5 last:border-0">
      <span className="mt-0.5 shrink-0 text-[11px] tabular-nums text-slate-600">
        {new Date(e.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
      </span>
      <span className="min-w-0">
        <span className="text-sm text-slate-200">{e.text}</span>
        {e.count > 1 && <span className="ml-1.5 rounded bg-ink-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">×{e.count}</span>}
        {!e.recognised && (
          // Shown rather than hidden. A feed that drops what it cannot phrase
          // hides the one thing that went wrong last night.
          <span className="ml-1.5 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300/90" title={e.action}>
            no plain-English name yet
          </span>
        )}
        {e.reason && <span className="block text-xs text-slate-500">{e.reason}</span>}
        <span className="block text-[11px] text-slate-600">{e.actor}</span>
      </span>
    </li>
  );
}

export default function ActivityPage() {
  const { activeBrand } = useActiveBrand();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeBrand) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const res = await authedFetch(`/api/audit-log?brandId=${encodeURIComponent(activeBrand.id)}&view=feed&limit=200`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not load the activity.");
      setFeed(d as Feed);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [activeBrand]);

  useEffect(() => { load(); }, [load]);

  const asText = feed
    ? [
      feed.headline, "",
      "RAN ON ITS OWN", ...feed.unattended.map((e) => `${e.at.slice(0, 16).replace("T", " ")}  ${e.text}${e.count > 1 ? ` (x${e.count})` : ""}`),
      "", "YOU", ...feed.yours.map((e) => `${e.at.slice(0, 16).replace("T", " ")}  ${e.text}${e.count > 1 ? ` (x${e.count})` : ""}`),
    ].join("\n")
    : "";

  return (
    <div>
      <PageHeader
        kicker="Activity"
        title="What happened"
        subtitle="Everything this platform did for this brand, with the work that ran on its own kept separate from your own."
        actions={<Pill tone="good">Live · no key needed</Pill>}
      />

      {!activeBrand && (
        <div className="card border-emerald-500/20 p-10 text-center">
          <History className="mx-auto mb-2 h-7 w-7 text-emerald-500/60" />
          <h2 className="font-display text-lg font-bold text-white">Pick a brand to see its activity</h2>
          <p className="mt-1 text-sm text-slate-400">Activity is scoped to a brand — a trail is always somebody&rsquo;s.</p>
        </div>
      )}

      {activeBrand && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-ink-800 disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            {feed && <CopyOut text={asText} label="Copy the log" />}
          </div>

          {error && <p className="mb-4 flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300"><AlertTriangle className="h-4 w-4" /> {error}</p>}

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-emerald-400" /></div>
          ) : feed ? (
            <>
              <p className="mb-5 text-sm text-slate-300">{feed.headline}</p>

              <div className="grid gap-5 lg:grid-cols-2">
                {/* First, and deliberately. This is the question people open the page to answer. */}
                <div className="card p-5">
                  <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold text-white">
                    <Bot className="h-4 w-4 text-emerald-400" /> Ran on its own
                  </h2>
                  {feed.unattended.length === 0 ? (
                    <p className="text-sm text-slate-500">Nothing has run unattended for this brand.</p>
                  ) : (
                    <ul>{feed.unattended.map((e) => <Line key={e.ids.join("-")} e={e} />)}</ul>
                  )}
                </div>

                <div className="card p-5">
                  <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold text-white">
                    <User className="h-4 w-4 text-sky-400" /> You and your team
                  </h2>
                  {feed.yours.length === 0 ? (
                    <p className="text-sm text-slate-500">Nothing recorded from a person yet.</p>
                  ) : (
                    <ul>{feed.yours.map((e) => <Line key={e.ids.join("-")} e={e} />)}</ul>
                  )}
                </div>
              </div>

              {feed.unmappedActions.length > 0 && (
                <p className="mt-5 text-[11px] text-slate-600">
                  {feed.unmappedActions.length} kind{feed.unmappedActions.length === 1 ? "" : "s"} of event have no plain-English name yet and are shown from their own verb rather than hidden: {feed.unmappedActions.join(", ")}.
                </p>
              )}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
