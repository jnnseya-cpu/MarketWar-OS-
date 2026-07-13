import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import { PageHeader } from "@/components/ui";
import { demoActions } from "@/shared/demo";

export default function BriefingPage() {
  return (
    <div>
      <PageHeader
        kicker="AI Growth Strategist"
        title="Daily strategic briefing"
        subtitle="The senior officer above all agents reads every module and issues today's orders — ranked by £ impact, capped at five."
      />

      <div className="mb-8 card p-5">
        <h2 className="mb-4 font-display font-bold text-white">Today&apos;s orders</h2>
        <div className="space-y-3">
          {demoActions.map((a, i) => (
            <Link
              key={a.id}
              href={a.href}
              className="flex items-start gap-3 rounded-lg border border-ink-700 bg-ink-850 p-4 transition hover:border-emerald-500/50"
            >
              <span className="font-display text-lg font-bold text-emerald-500/70">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-white">{a.action}</p>
                  {a.priority === "critical" && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[11px] font-bold text-rose-400">
                      <AlertTriangle className="h-3 w-3" /> CRITICAL
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-slate-400">{a.reason}</p>
                <p className="mt-1 text-xs font-semibold text-emerald-400">{a.impact} · {a.module}</p>
              </div>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-600" />
            </Link>
          ))}
        </div>
      </div>

      <h2 className="mb-4 font-display text-lg font-bold text-white">Generate a fresh briefing</h2>
      <AgentRunner
        agentId="growth-strategist"
        buttonLabel="Issue today's briefing"
        fields={[
          { key: "business", label: "Business", defaultValue: "Brixton Grill House" },
          { key: "goal", label: "Current goal", defaultValue: "40 new weekly orders and 15 office catering contracts" },
          { key: "situation", label: "Situation notes", defaultValue: "One 7.3x ROAS winner, £1,240 dormant in the vault, rival pushing £15 meal deal into SW9.", textarea: true },
        ]}
      />
    </div>
  );
}
