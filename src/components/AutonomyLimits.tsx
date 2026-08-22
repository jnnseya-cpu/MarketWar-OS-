"use client";

// THE LIMITS, ON ONE SCREEN (§103's surface).
//
// Autopilot has had a level and a spend cap since it shipped. The rest of what
// governs it — what it is aiming at, which channels it may and may not use, the
// most a customer may cost, and the value above which it must stop and ask —
// existed nowhere, so somebody could switch autonomy on with no idea what it
// might do.
//
// THE VALIDATION IS THE POINT, AND IT RUNS AS YOU TYPE.
//
// `validateConfig` refuses contradictions rather than resolving them quietly: a
// cost-per-customer cap larger than the whole budget, money with no channel to
// spend it on, autonomy above zero with no stated goal. Showing that at the
// moment it is typed — rather than on submit, or worse, silently at 3am — is
// the whole reason the settings are together on one screen.
//
// The rules live in shared/autonomy-config.ts, so this form and any server that
// reads the config cannot disagree about what is legal.

import { useMemo } from "react";
import { AlertTriangle, Info, ShieldCheck } from "lucide-react";
import { validateConfig, type AutonomyConfig } from "@/shared/autonomy-config";

export type Limits = Pick<AutonomyConfig, "target" | "allowedChannels" | "forbiddenChannels" | "maxCpaGbp" | "approvalAboveGbp">;

const CHANNELS = ["meta", "google", "tiktok", "linkedin", "email", "whatsapp"];

export default function AutonomyLimits({
  level, budgetGbp, limits, onChange,
}: {
  level: number;
  budgetGbp: number;
  limits: Limits;
  onChange: (next: Limits) => void;
}) {
  const result = useMemo(
    () => validateConfig({ ...limits, level, budgetGbp }),
    [limits, level, budgetGbp],
  );

  const set = <K extends keyof Limits>(k: K, v: Limits[K]) => onChange({ ...limits, [k]: v });

  const toggle = (list: "allowedChannels" | "forbiddenChannels", channel: string) => {
    const cur = limits[list];
    set(list, cur.includes(channel) ? cur.filter((c) => c !== channel) : [...cur, channel]);
  };

  return (
    <div className="card mb-6 p-5">
      <div className="mb-1 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-400" />
        <h2 className="font-display font-bold text-white">What it may and may not do</h2>
      </div>
      <p className="mb-4 text-xs text-slate-400">
        Checked as you type. Settings that contradict each other are refused rather than quietly resolved — this governs spending your money.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <label className="label" htmlFor="autonomy-target">What it is aiming at</label>
          <input
            id="autonomy-target" className="input" value={limits.target}
            onChange={(e) => set("target", e.target.value)}
            placeholder="e.g. more weekend bookings from within 5 miles"
          />
          <p className="mt-1 text-[11px] text-slate-500">Autonomy with no stated goal is drift — there is nothing to judge a cycle against afterwards.</p>
        </div>

        <div>
          <label className="label" htmlFor="autonomy-cpa">Most a customer may cost (£)</label>
          <input
            id="autonomy-cpa" className="input" type="number" min="0" value={limits.maxCpaGbp || ""}
            onChange={(e) => set("maxCpaGbp", Number(e.target.value) || 0)}
            placeholder="0 = no cap"
          />
        </div>
        <div>
          <label className="label" htmlFor="autonomy-approval">Ask me above (£)</label>
          <input
            id="autonomy-approval" className="input" type="number" min="0" value={limits.approvalAboveGbp || ""}
            onChange={(e) => set("approvalAboveGbp", Number(e.target.value) || 0)}
            placeholder="0 = ask before everything"
          />
        </div>

        <div>
          <label className="label">Channels it may use</label>
          <div className="flex flex-wrap gap-1.5">
            {CHANNELS.map((c) => (
              <button
                key={c} type="button" onClick={() => toggle("allowedChannels", c)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition ${limits.allowedChannels.includes(c) ? "bg-emerald-500/15 text-emerald-200 border border-emerald-500/30" : "border border-ink-700 text-slate-400 hover:text-slate-200"}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Channels it must never use</label>
          <div className="flex flex-wrap gap-1.5">
            {CHANNELS.map((c) => (
              <button
                key={c} type="button" onClick={() => toggle("forbiddenChannels", c)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition ${limits.forbiddenChannels.includes(c) ? "bg-rose-500/15 text-rose-200 border border-rose-500/30" : "border border-ink-700 text-slate-400 hover:text-slate-200"}`}
              >
                {c}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Forbidden always wins. A channel in both lists is forbidden.</p>
        </div>
      </div>

      {/* Errors first — these are the ones that stop it running. */}
      {!result.ok && result.errors.map((e) => (
        <p key={e} className="mt-3 flex items-start gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {e}
        </p>
      ))}
      {result.warnings.map((w) => (
        <p key={w} className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-sm text-amber-100">
          <Info className="mt-0.5 h-4 w-4 shrink-0" /> {w}
        </p>
      ))}
      {result.ok && (
        <p className="mt-3 rounded-lg border border-ink-700 bg-ink-900/50 px-3 py-2 text-sm text-slate-300">{result.summary}</p>
      )}
    </div>
  );
}
