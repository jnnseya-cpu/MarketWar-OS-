"use client";

// THIRTY-NINE CARDS IS AN INVENTORY, NOT AN ARGUMENT.
//
// The landing page rendered every agent, in full, in one grid. Read as a
// prospect, that is not a demonstration of power — it is a wall, and it says
// "this will take you three weeks to learn and you will use four of them." The
// only people who read all thirty-nine are competitors and other builders.
//
// Nothing is removed. The additive rule holds and the full list is right there
// behind one press, which is where it belongs: comprehensiveness is a
// second-visit argument, and the first visit has about nine seconds.
//
// WHAT SHOWS FIRST IS EIGHT, AND WHICH EIGHT IS NOT A GUESS — they are the ones
// whose job a business owner can name without being taught a vocabulary first:
// find out what is broken, find the customers, build the offer, make the ads,
// stop the waste, get the money that is already yours. The remaining thirty-one
// are one click away and counted honestly in the button.

import { useState } from "react";
import { Bot, ChevronDown } from "lucide-react";
import { SERIES } from "@/shared/palette";

export type AgentCard = { id: string; name: string; role: string; description: string };

/** Shown before the fold of this section. Chosen by "can a customer name the job?". */
const HEADLINE_AGENTS = [
  "business-diagnosis", "customer-pain", "offer-builder", "ad-creative",
  "budget-protection", "revenue-intelligence", "lead-capture", "local-growth",
];

export default function AgentCorps({ agents }: { agents: AgentCard[] }) {
  const [all, setAll] = useState(false);

  // Preserve the roster's own order; only the SELECTION is opinionated.
  const featured = agents.filter((a) => HEADLINE_AGENTS.includes(a.id));
  // If the ids ever drift, fall back to the first eight rather than showing an
  // empty section — a curated list that silently empties is worse than an
  // arbitrary one.
  const first = featured.length >= 4 ? featured : agents.slice(0, 8);
  const shown = all ? agents : first;
  const hidden = agents.length - first.length;

  return (
    <>
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map((a) => {
          // Colour by the agent's own index in the full roster, so a card keeps
          // its colour whether the list is collapsed or expanded.
          const i = agents.findIndex((x) => x.id === a.id);
          return (
            <div
              key={a.id}
              className="group rounded-lg border border-white/10 bg-ink-900/70 p-5 transition hover:-translate-y-0.5 hover:border-white/20"
            >
              <span
                className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md"
                style={{ background: `${SERIES[i % SERIES.length]}22`, color: SERIES[i % SERIES.length] }}
              >
                <Bot className="h-5 w-5" />
              </span>
              <h3 className="font-display text-sm font-bold text-white">{a.name}</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">{a.role}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">{a.description}</p>
            </div>
          );
        })}
      </div>

      {hidden > 0 && (
        <div className="mt-8 text-center">
          <button type="button" onClick={() => setAll(!all)} className="btn-ghost">
            {all ? "Show fewer" : `Show all ${agents.length} — the other ${hidden}`}
            <ChevronDown className={`h-4 w-4 transition ${all ? "rotate-180" : ""}`} />
          </button>
        </div>
      )}
    </>
  );
}
