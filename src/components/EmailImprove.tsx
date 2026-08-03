"use client";

// The panel that answers "improve the open and click rates".
//
// Everything it renders is computed by src/backend/email-improve.ts from the
// delivery-event ledger. This component adds no arithmetic of its own — if a
// number is on screen here, it was counted on the server, which is the only way
// the figures shown and the figures used can be guaranteed to be the same ones.
//
// The panel is deliberately blunt about small samples. Below the judging volume
// it shows the headline saying so and nothing else, because a ranked list of
// "problems" derived from forty messages is a way of being confidently wrong.

import { AlertTriangle, ArrowRight, Ban, Info, Lightbulb } from "lucide-react";
import Link from "next/link";

export type ImproveFinding = {
  id: string;
  affects: "opens" | "clicks" | "both" | "trust";
  severity: "blocking" | "major" | "minor";
  title: string;
  evidence: string;
  fix: string;
  where: string;
};

export type ImproveReportView = {
  reach: {
    sent: number; pixelOpeners: number; clickers: number; knownOpeners: number;
    silentOpeners: number; openFloorPct: number; clickPct: number;
    clickToOpenPct: number; judgeable: boolean;
  };
  openGrade: "good" | "fair" | "poor" | "unknown";
  clickGrade: "good" | "fair" | "poor" | "unknown";
  findings: ImproveFinding[];
  providers: { provider: string; sent: number; opened: number; openRatePct: number; bounceRatePct: number; judgeable: boolean }[];
  campaigns: { campaign: string; sent: number; knownOpeners: number; clickers: number; openFloorPct: number; clickPct: number; judgeable: boolean }[];
  headline: string;
  measurementNote: string;
};

const SEVERITY: Record<ImproveFinding["severity"], { icon: typeof AlertTriangle; ring: string; text: string; label: string }> = {
  blocking: { icon: Ban, ring: "border-rose-500/35 bg-rose-500/[0.06]", text: "text-rose-300", label: "Blocking" },
  major: { icon: AlertTriangle, ring: "border-amber-500/35 bg-amber-500/[0.06]", text: "text-amber-300", label: "Major" },
  minor: { icon: Info, ring: "border-sky-500/25 bg-sky-500/[0.05]", text: "text-sky-300", label: "Worth knowing" },
};

const AFFECTS: Record<ImproveFinding["affects"], string> = {
  opens: "holds back opens",
  clicks: "holds back clicks",
  both: "holds back both",
  trust: "makes the number unreliable",
};

export default function EmailImprove({ report }: { report: ImproveReportView }) {
  const { reach, findings, providers, campaigns } = report;
  if (!reach.sent) return null;

  const judgeableProviders = providers.filter((p) => p.judgeable);
  const judgeableCampaigns = campaigns.filter((c) => c.judgeable);

  return (
    <div className="mb-8 card border-sky-500/25 p-5">
      <div className="mb-1 flex items-center gap-2">
        <Lightbulb className="h-5 w-5 text-sky-400" />
        <h2 className="font-display text-lg font-bold text-white">Improving the open and click rates</h2>
      </div>
      <p className="mb-4 text-sm text-slate-300">{report.headline}</p>

      {/* How to read the numbers. Always shown — it is the reason the open
          figure on the tiles is a floor and not a measurement. */}
      <p className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs leading-relaxed text-slate-400">
        {report.measurementNote}
      </p>

      {findings.length > 0 && (
        <ol className="mb-4 space-y-3">
          {findings.map((f) => {
            const s = SEVERITY[f.severity];
            const Icon = s.icon;
            return (
              <li key={f.id} className={`rounded-xl border p-4 ${s.ring}`}>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Icon className={`h-4 w-4 shrink-0 ${s.text}`} />
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${s.text}`}>{s.label}</span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">{AFFECTS[f.affects]}</span>
                </div>
                <h3 className="mb-1 text-sm font-bold text-white">{f.title}</h3>
                <p className="mb-2 text-xs leading-relaxed text-slate-400">{f.evidence}</p>
                <p className="text-xs leading-relaxed text-slate-200">
                  <span className="font-semibold text-white">Do this: </span>{f.fix}
                </p>
                {f.where && (
                  <Link href={f.where} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-300 hover:text-sky-200">
                    Go there <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {/* Where the mail went. An 8.7% open rate across the board is a mystery;
          "Gmail 22%, Microsoft 0.4%" names the filter and the company to fix it
          with. Only providers with enough volume to judge are listed. */}
      {judgeableProviders.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">By receiving provider</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="pb-1 font-semibold">Provider</th>
                  <th className="pb-1 text-right font-semibold">Sent</th>
                  <th className="pb-1 text-right font-semibold">Opened</th>
                  <th className="pb-1 text-right font-semibold">Open rate</th>
                  <th className="pb-1 text-right font-semibold">Bounced</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                {judgeableProviders.map((p) => (
                  <tr key={p.provider} className="border-t border-white/5">
                    <td className="py-1.5">{p.provider}</td>
                    <td className="py-1.5 text-right tabular-nums">{p.sent.toLocaleString()}</td>
                    <td className="py-1.5 text-right tabular-nums">{p.opened.toLocaleString()}</td>
                    <td className="py-1.5 text-right tabular-nums">{p.openRatePct}%</td>
                    <td className="py-1.5 text-right tabular-nums">{p.bounceRatePct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Open rate here counts the tracking pixel only, so it reads lower than the floor above, which also counts everyone who clicked. Compare providers with each other rather than with the tile. Providers with too few messages to judge are left out rather than shown with a percentage computed from noise.</p>
        </div>
      )}

      {/* Per-campaign, measured. No "best subject line" is declared here unless
          the server found the difference to be larger than chance. */}
      {judgeableCampaigns.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">By campaign</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="pb-1 font-semibold">Campaign</th>
                  <th className="pb-1 text-right font-semibold">Sent</th>
                  <th className="pb-1 text-right font-semibold">Opened (floor)</th>
                  <th className="pb-1 text-right font-semibold">Clicked</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                {judgeableCampaigns.map((c) => (
                  <tr key={c.campaign} className="border-t border-white/5">
                    <td className="py-1.5">{c.campaign}</td>
                    <td className="py-1.5 text-right tabular-nums">{c.sent.toLocaleString()}</td>
                    <td className="py-1.5 text-right tabular-nums">{c.openFloorPct}%</td>
                    <td className="py-1.5 text-right tabular-nums">{c.clickPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
