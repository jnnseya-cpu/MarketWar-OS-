"use client";

// WHAT IS ACTUALLY IN FORCE (Trend Intelligence §6, §16).
//
// A brief is the contract every agent reads before it acts, and the dangerous
// thing about one is not that it might be wrong — it is that an expired,
// unapproved or re-issued brief LOOKS exactly like a live one. A list of briefs
// is therefore close to useless on its own, and this screen is deliberately not
// that list: every row asks the server, per channel, whether the brief would
// authorise work right now, and prints the refusal in the words the server used.
//
// NOTHING IS COMPUTED HERE. The window, the channel, the market, the approval
// state and the publish freeze are all decided server-side by
// `effectiveBrief`; this reads the answer. A screen that worked out validity
// for itself would be a second rulebook, and the two would disagree the first
// time either was edited — which is the defect this platform keeps finding.
//
// AND "NO BRIEF" IS NOT AN ERROR. §14.5 is explicit: no eligible brief means
// use baseline behaviour. So the empty state explains how one comes to exist
// rather than looking like something broke.

import { useCallback, useEffect, useState } from "react";
import { Loader2, AlertTriangle, FileCheck2, ShieldAlert, CheckCircle2 } from "lucide-react";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";

type Brief = {
  brief_id: string;
  brief_version: number;
  topic_id: string;
  market: string;
  locale: string;
  allowed_channels: string[];
  valid_from: string;
  expires_at: string;
  approvalId: string;
  issuedWith?: { opportunity: number; confidence: number; vetoes: string[]; band: string };
  issuedAt: string;
};

type Resolved = {
  ok: boolean;
  code?: string;
  reason?: string;
  note?: string;
  cacheForMs?: number;
  approvalState?: string;
};

export default function GrowthBriefs() {
  const { activeBrand } = useActiveBrand();
  const [briefs, setBriefs] = useState<Brief[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState<string>("");
  const [checks, setChecks] = useState<Record<string, Record<string, Resolved>>>({});

  const call = useCallback(async (body: Record<string, unknown>) => {
    if (!activeBrand) return null;
    const res = await authedFetch("/api/opportunity-radar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: activeBrand.id, ...body }),
    });
    const d = await res.json().catch(() => ({}));
    // A refusal from `effective` arrives as 200 with ok:false — that is the
    // spec's answer, not a failure, so only a real HTTP error throws.
    if (!res.ok) throw new Error(d.error || "That did not go through.");
    return d;
  }, [activeBrand]);

  const load = useCallback(async () => {
    if (!activeBrand) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const d = await call({ action: "briefs" });
      setBriefs((d?.briefs as Brief[]) ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [activeBrand, call]);

  useEffect(() => { void load(); }, [load]);

  async function check(b: Brief) {
    setChecking(b.brief_id); setError(null);
    try {
      // Asked per channel, because the answer genuinely differs per channel —
      // one list-level "valid / invalid" would be a summary of several
      // different answers and would hide the one that mattered.
      const perChannel: Record<string, Resolved> = {};
      for (const channel of b.allowed_channels) {
        const d = await call({
          action: "effective", briefId: b.brief_id, channel,
          market: b.market, locale: b.locale, topic_id: b.topic_id,
        });
        perChannel[channel] = (d as Resolved) ?? { ok: false, reason: "No answer." };
      }
      setChecks((c) => ({ ...c, [b.brief_id]: perChannel }));
    } catch (e) { setError((e as Error).message); }
    finally { setChecking(""); }
  }

  if (!activeBrand) return null;

  return (
    <div className="card mb-6 p-5">
      <div className="mb-1 flex items-center gap-2">
        <FileCheck2 className="h-4 w-4 text-emerald-400" />
        <h2 className="font-display font-bold text-white">Growth briefs</h2>
      </div>
      <p className="mb-3 text-xs text-slate-400">
        The contract your agents read before they act. A brief only directs work while it is approved,
        inside its own window, and asked for by a channel it allows — so each row asks the server
        whether it would authorise work right now, per channel, rather than showing you a date to
        interpret.
      </p>

      {error && <p className="mb-3 flex items-center gap-1.5 text-sm text-rose-400"><AlertTriangle className="h-4 w-4" /> {error}</p>}
      {loading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-emerald-400" /></div>}

      {briefs && briefs.length === 0 && (
        <div className="rounded-lg border border-ink-800 bg-ink-950/40 p-4 text-xs text-slate-400">
          <p className="text-slate-300">No briefs issued, and that is a working state, not a fault.</p>
          <p className="mt-1.5">
            With no brief in force your agents use their baseline behaviour. A brief is issued only when
            a candidate reaches <span className="text-slate-200">75 opportunity AND 75 confidence with
            no veto</span> — and confidence is capped at 69 while a single source family backs it, so a
            second <em>independent</em> family is usually what is missing rather than a stronger signal.
          </p>
        </div>
      )}

      {briefs && briefs.length > 0 && (
        <ul className="space-y-3">
          {briefs.map((b) => {
            const res = checks[b.brief_id];
            return (
              <li key={b.brief_id} className="rounded-lg border border-ink-800 bg-ink-950/40 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">
                      {b.topic_id} <span className="text-slate-500">v{b.brief_version}</span>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {b.market}/{b.locale} · {b.allowed_channels.join(", ")} · valid{" "}
                      {new Date(b.valid_from).toLocaleDateString()} → {new Date(b.expires_at).toLocaleDateString()}
                    </p>
                    {b.issuedWith && (
                      <p className="text-[11px] text-slate-600">
                        issued at opportunity {b.issuedWith.opportunity.toFixed(1)}, confidence {b.issuedWith.confidence.toFixed(1)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => void check(b)} disabled={checking === b.brief_id}
                    className="rounded border border-ink-700 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:text-white disabled:opacity-50"
                  >
                    {checking === b.brief_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Is it in force?"}
                  </button>
                </div>

                {res && (
                  <ul className="mt-2 space-y-1">
                    {Object.entries(res).map(([channel, r]) => (
                      <li key={channel} className="flex items-start gap-1.5 text-[11px]">
                        {r.ok
                          ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          : <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />}
                        <span className={r.ok ? "text-emerald-200/90" : "text-amber-100/80"}>
                          <span className="font-semibold">{channel}</span>
                          {": "}
                          {/* The server's own words. Paraphrasing a refusal here
                              is how a screen comes to name a different remedy
                              from the one the server knows about. */}
                          {r.ok ? (r.note || "In force.") : (r.reason || "Not in force.")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
