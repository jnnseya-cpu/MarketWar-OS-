"use client";

import { useState } from "react";
import AgentRunner from "@/components/AgentRunner";
import { PageHeader } from "@/components/ui";

const GOALS = [
  "Get customers",
  "Get WhatsApp messages",
  "Get bookings",
  "Get app downloads",
  "Get event ticket sales",
  "Get email leads",
  "Get restaurant partners",
  "Get investors",
];

export default function CampaignBuilderPage() {
  const [goal, setGoal] = useState(GOALS[0]);
  const [tab, setTab] = useState<"campaign" | "creative">("campaign");

  return (
    <div>
      <PageHeader
        kicker="One-Click Campaign Builder"
        title="Build a complete campaign"
        subtitle="Pick the goal. The Campaign Commander designs the objective, audience, budget split and kill criteria; the Ad Creative Agent produces channel-native assets."
      />

      <div className="mb-6">
        <p className="label">Campaign goal</p>
        <div className="flex flex-wrap gap-2">
          {GOALS.map((g) => (
            <button
              key={g}
              onClick={() => setGoal(g)}
              className={`rounded-lg border px-3.5 py-2 text-sm font-semibold transition ${
                goal === g
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                  : "border-ink-600 bg-ink-850 text-slate-400 hover:border-slate-500"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 flex gap-2 border-b border-ink-700">
        {(
          [
            ["campaign", "Campaign plan"],
            ["creative", "Ad creative"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              tab === key
                ? "border-emerald-500 text-emerald-300"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "campaign" ? (
        <AgentRunner
          key={`commander-${goal}`}
          agentId="campaign-commander"
          buttonLabel="Design the campaign"
          fields={[
            { key: "goal", label: "Goal", defaultValue: goal },
            { key: "business", label: "Business", placeholder: "Brixton Grill House", defaultValue: "Brixton Grill House" },
            { key: "location", label: "Target location", placeholder: "Brixton, London", defaultValue: "Brixton, London" },
            { key: "offer", label: "Offer to promote", placeholder: "Feed 4 for £25, Fridays only", defaultValue: "Feed 4 for £25, Fridays only" },
            { key: "budget", label: "Test budget (£)", placeholder: "100", defaultValue: "100" },
          ]}
        />
      ) : (
        <AgentRunner
          key={`creative-${goal}`}
          agentId="ad-creative"
          buttonLabel="Generate ad creative"
          fields={[
            { key: "goal", label: "Goal", defaultValue: goal },
            { key: "business", label: "Business", defaultValue: "Brixton Grill House" },
            { key: "location", label: "Target location", defaultValue: "Brixton, London" },
            { key: "offer", label: "Offer", defaultValue: "Feed 4 for £25, Fridays only" },
            { key: "audience", label: "Audience", defaultValue: "Families 25–44 within 2 miles", textarea: true },
          ]}
        />
      )}
    </div>
  );
}
