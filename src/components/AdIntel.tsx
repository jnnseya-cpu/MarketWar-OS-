"use client";

// Ad intelligence — what shape the ads in your category take.
//
// The competitor pitch is "browse thousands of winning ads and generate your
// own version". Half of that is a good product and the other half is a lawsuit,
// so this panel is built as the first half only: it counts what the ads you
// collected have in common, and it will not reproduce one.
//
// Nothing here is called a winner either. An ad running for a long time is
// evidence of a budget, not of a result.

import { useEffect, useState } from "react";
import { BarChart3, ExternalLink, Loader2, Search, Shield } from "lucide-react";
import { Pill } from "@/components/ui";
import { authedFetch } from "@/frontend/api-client";

type PatternCount = { id: string; label: string; soWhat: string; matched: number; of: number; pct: number };
type Report = {
  advertisers: number; ads: number; judgeable: boolean;
  patterns: PatternCount[]; normsToMatch: string[]; openGround: string[];
  formats: { format: string; count: number }[];
  headline: string; doctrine: string; notes: string[];
};
type Where = { platform: string; where: string; note: string };

// One ad per block, blank line between. Anything the customer can paste out of
// an ad library without reformatting it first.
function parseAds(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, i) => {
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      const advertiser = lines.length > 1 && lines[0].length < 60 ? lines[0] : `Advertiser ${i + 1}`;
      const rest = lines.length > 1 && lines[0].length < 60 ? lines.slice(1) : lines;
      return {
        id: `ad-${i + 1}`,
        advertiser,
        source: "observed" as const,
        headline: rest[0] || "",
        body: rest.slice(1, -1).join(" ") || rest.slice(1).join(" "),
        cta: rest.length > 2 ? rest[rest.length - 1] : undefined,
      };
    });
}

export default function AdIntel() {
  const [where, setWhere] = useState<Where[]>([]);
  const [minAds, setMinAds] = useState(8);
  const [text, setText] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    authedFetch("/api/ad-intel")
      .then((r) => r.json())
      .then((d) => { setWhere(Array.isArray(d?.whereToLook) ? d.whereToLook : []); setMinAds(Number(d?.minAdsToJudge) || 8); })
      .catch(() => { /* the form still posts */ });
  }, []);

  const parsed = parseAds(text);

  async function analyse() {
    setBusy(true); setError(""); setReport(null);
    try {
      const res = await authedFetch("/api/ad-intel", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyse", ads: parsed }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || data?.reason || "Could not analyse."); return; }
      setReport(data);
    } catch {
      setError("Could not reach the ad-intelligence engine.");
    } finally { setBusy(false); }
  }

  return (
    <div className="mb-6 card border-emerald-500/25 p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <BarChart3 className="h-5 w-5 text-emerald-400" />
        <h2 className="font-display text-lg font-bold text-white">Ad intelligence — the shape of the ads in your category</h2>
      </div>
      <p className="mb-4 text-sm text-slate-400">
        Paste the ads you can see running in your category — from the platforms&rsquo; own public libraries below — and this counts what they have in common. Every figure comes with its denominator. Nothing is labelled a winner, because an ad running for a long time is evidence of a budget, not of a result.
      </p>

      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        {where.map((w) => (
          <div key={w.platform} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-white"><ExternalLink className="h-3 w-3 text-slate-500" /> {w.platform}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{w.where}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{w.note}</p>
          </div>
        ))}
      </div>

      <label className="label">The ads — one per block, a blank line between them</label>
      <textarea
        className="input min-h-[160px] font-mono text-xs"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Rival Roofing Ltd\nTired of chasing builders?\nFixed price, fixed date, written down before we start.\nGet a free quote\n\nAnother Firm\n50% off this month only\n…"}
      />
      <p className="mt-1 text-[11px] text-slate-600">
        {parsed.length} ad{parsed.length === 1 ? "" : "s"} read. Below {minAds} nothing is called a pattern — a percentage over four ads is noise wearing a decimal point.
      </p>

      <button className="btn-primary mt-3" onClick={analyse} disabled={busy || parsed.length === 0}>
        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Counting…</> : <><Search className="h-4 w-4" /> Count what they have in common</>}
      </button>

      {error && <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-3 text-sm text-rose-200">{error}</p>}

      {report && (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={report.judgeable ? "good" : "warn"}>{report.judgeable ? "Enough to call a pattern" : `Below ${minAds} ads`}</Pill>
            <span className="text-sm text-slate-300">{report.headline}</span>
          </div>

          {report.notes.map((n, i) => (
            <p key={i} className="rounded-lg border border-amber-500/25 bg-amber-500/[0.05] p-3 text-xs leading-relaxed text-amber-200/90">{n}</p>
          ))}

          <div className="rounded-lg border border-white/10 bg-ink-900/50 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Counted</p>
            <ul className="space-y-1.5">
              {report.patterns.map((p) => (
                <li key={p.id} className="flex items-baseline gap-2">
                  <span className="w-16 shrink-0 text-right font-mono text-xs text-slate-300">{p.matched}/{p.of}</span>
                  <span className="text-xs text-slate-400">{p.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {report.normsToMatch.length > 0 && (
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.05] p-3">
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-emerald-300">What most of them do — match it without copying anybody</p>
              <ul className="space-y-1.5">
                {report.normsToMatch.map((n, i) => <li key={i} className="text-xs leading-relaxed text-slate-300">· {n}</li>)}
              </ul>
            </div>
          )}

          {report.openGround.length > 0 && (
            <div className="rounded-lg border border-sky-500/25 bg-sky-500/[0.05] p-3">
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-sky-300">What almost none of them do — the open ground</p>
              <ul className="space-y-1.5">
                {report.openGround.map((n, i) => <li key={i} className="text-xs leading-relaxed text-slate-300">· {n}</li>)}
              </ul>
            </div>
          )}

          <p className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-[11px] leading-relaxed text-slate-500">
            <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600" /> {report.doctrine}
          </p>
        </div>
      )}
    </div>
  );
}
