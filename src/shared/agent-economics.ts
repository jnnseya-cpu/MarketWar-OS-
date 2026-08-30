// §100 — WHICH AGENTS EARN THEIR KEEP.
//
// THE REASON THIS COULD NOT BE ANSWERED. `meterAction` is handed the action kind
// on every single charge, and `debitAcus` — the function it calls — takes a
// wallet id and an amount and nothing else. So the wallet ends up knowing that
// 14,000 ACUs were spent and NOTHING about what spent them. Nineteen agents, one
// total. The value existed on one side of that boundary and was never carried
// across, which is this codebase's oldest defect wearing its twenty-fifth hat,
// and this time it did not cause a bug — it made a whole specification
// unbuildable, which is worse, because nobody files a bug about it.
//
// `backend/agent-spend.ts` now records one row per charge carrying the agent.
// This file turns those rows into an answer, and it is pure so every branch is
// drivable without a wallet or a database.
//
// ---------------------------------------------------------------------------
// THE ONE RULE THAT MAKES THIS HONEST RATHER THAN DAMNING
// ---------------------------------------------------------------------------
//
// REVENUE THAT NOBODY ATTRIBUTED IS `null`, NEVER ZERO.
//
// Cost is measured exactly — it is a debit we performed. Revenue is attributed
// only where a revenue event's `source` names the agent, and most revenue is not
// tagged that way: a sale that closed because the Content Engine wrote something
// six weeks ago arrives from "google/organic" and always will.
//
// So an agent with real cost and no attributed revenue is reported as
// `cost_only` — "this cost £4.10 and nothing here can say what it earned" —
// and NEVER as "earned £0", which is the same sentence a genuinely worthless
// agent gets. Printing £0 would be a fabricated number with a victim: the owner
// would switch off the agents that are hardest to attribute, which are usually
// the ones doing the upstream work.

/** One metered charge, as recorded. Pence is not used: 1 ACU = 1p, exactly. */
export type AgentSpendRow = {
  /** The agent or engine that spent it. Falls back to the action kind. */
  agent: string;
  /** `llm`, `image`, `video`, … — what was actually bought. */
  kind: string;
  acus: number;
  at: string;
  brandId: string;
};

/** One revenue event, reduced to what this calculation needs. */
export type AttributedRevenue = {
  /** The campaign or channel string on the event. */
  source: string;
  amountGbp: number;
  at: string;
};

/** 1 ACU = 1p — the conversion is stated in `backend/wallet.ts`, not invented here. */
export const PENCE_PER_ACU = 1;

/** Below this many runs, a cost-per-run is one bad day rather than a pattern. */
export const MIN_RUNS_TO_JUDGE = 5;

export type AgentVerdict = "earning" | "losing" | "cost_only" | "not_enough_runs";

export type AgentLine = {
  agent: string;
  runs: number;
  acus: number;
  costGbp: number;
  costPerRunGbp: number;
  /** What each kind of action cost, so a video-heavy agent is not a mystery. */
  byKind: { kind: string; runs: number; acus: number }[];
  /** NULL when nothing attributed revenue to this agent. Never zero. */
  attributedRevenueGbp: number | null;
  /** Null whenever revenue is null — there is no net without both halves. */
  netGbp: number | null;
  /** Null whenever revenue is null. */
  returnMultiple: number | null;
  verdict: AgentVerdict;
  /** The sentence to show. Always names which half is missing, when one is. */
  reason: string;
};

export type AgentEconomics = {
  lines: AgentLine[];
  totalAcus: number;
  totalCostGbp: number;
  /** Revenue that named an agent. Not the brand's total revenue. */
  attributedRevenueGbp: number;
  /** How much of the spend has revenue attributed to it at all, 0–100. */
  attributedCoveragePct: number;
  headline: string;
};

const gbp = (acus: number) => Math.round(acus * PENCE_PER_ACU) / 100;

/**
 * Which agent, if any, does this revenue event name?
 *
 * Matched on the whole source string, case-insensitively, and on the source
 * being exactly the agent or carrying it as a `/`-delimited segment — so
 * `content-engine` matches `content-engine` and `paid/content-engine` but NOT
 * `content-engineering-blog`. A substring match would attribute a stranger's
 * revenue to an agent whose name happens to appear inside another word, and an
 * over-credited agent is worse than an uncredited one: it survives a cull it
 * should not have survived.
 */
export function agentNamedBy(source: string, agents: string[]): string | null {
  const s = String(source || "").trim().toLowerCase();
  if (!s) return null;
  const parts = s.split(/[/|,]/).map((p) => p.trim()).filter(Boolean);
  for (const a of agents) {
    const key = a.trim().toLowerCase();
    if (!key) continue;
    if (parts.includes(key)) return a;
  }
  return null;
}

/**
 * Cost and impact per agent.
 *
 * Pure: rows in, answer out. Everything the screen shows is computed here, so
 * the screen can never quietly display a figure this did not produce.
 */
export function agentEconomics(input: {
  spend: AgentSpendRow[];
  revenue?: AttributedRevenue[];
  sinceISO?: string;
}): AgentEconomics {
  const since = input.sinceISO ? Date.parse(input.sinceISO) : NaN;
  const inWindow = (at: string) => {
    if (!Number.isFinite(since)) return true;
    const t = Date.parse(at);
    return Number.isFinite(t) && t >= since;
  };

  const spend = input.spend.filter((r) => inWindow(r.at));
  const byAgent = new Map<string, { acus: number; runs: number; kinds: Map<string, { runs: number; acus: number }> }>();

  for (const row of spend) {
    const agent = String(row.agent || "").trim() || "unattributed";
    const acus = Math.max(0, Number(row.acus) || 0);
    const kind = String(row.kind || "").trim() || "unknown";
    const cur = byAgent.get(agent) ?? { acus: 0, runs: 0, kinds: new Map() };
    cur.acus += acus;
    cur.runs += 1;
    const k = cur.kinds.get(kind) ?? { runs: 0, acus: 0 };
    k.runs += 1; k.acus += acus;
    cur.kinds.set(kind, k);
    byAgent.set(agent, cur);
  }

  const agents = [...byAgent.keys()];
  const revenueByAgent = new Map<string, number>();
  let attributedRevenueGbp = 0;
  for (const ev of input.revenue ?? []) {
    if (!inWindow(ev.at)) continue;
    const named = agentNamedBy(ev.source, agents);
    if (!named) continue;
    const amt = Math.max(0, Number(ev.amountGbp) || 0);
    revenueByAgent.set(named, (revenueByAgent.get(named) ?? 0) + amt);
    attributedRevenueGbp += amt;
  }

  const lines: AgentLine[] = agents.map((agent) => {
    const a = byAgent.get(agent)!;
    const costGbp = gbp(a.acus);
    // `has`, not `?? 0`: an agent with a revenue event of £0 attributed to it
    // (a logged lead) is a DIFFERENT state from one nothing has attributed, and
    // collapsing them is exactly the fabrication this module exists to avoid.
    const hasRevenue = revenueByAgent.has(agent);
    const revenue = hasRevenue ? revenueByAgent.get(agent)! : null;
    const net = revenue === null ? null : Math.round((revenue - costGbp) * 100) / 100;
    const multiple = revenue === null || costGbp <= 0 ? null : Math.round((revenue / costGbp) * 100) / 100;

    const byKind = [...a.kinds.entries()]
      .map(([kind, k]) => ({ kind, runs: k.runs, acus: k.acus }))
      .sort((x, y) => y.acus - x.acus);

    let verdict: AgentVerdict;
    let reason: string;
    if (a.runs < MIN_RUNS_TO_JUDGE) {
      verdict = "not_enough_runs";
      reason = `${a.runs} run${a.runs === 1 ? "" : "s"} and £${costGbp.toFixed(2)} spent. Below ${MIN_RUNS_TO_JUDGE} runs a cost per run is one bad day, not a pattern — this is not being judged yet.`;
    } else if (revenue === null) {
      verdict = "cost_only";
      reason = `£${costGbp.toFixed(2)} over ${a.runs} runs. No revenue names this agent, so what it earned is unknown — not zero. Tag a campaign source with "${agent}" to close the loop.`;
    } else if (net !== null && net >= 0) {
      verdict = "earning";
      reason = `£${revenue.toFixed(2)} attributed against £${costGbp.toFixed(2)} spent — ${multiple}×, £${net.toFixed(2)} clear over ${a.runs} runs.`;
    } else {
      verdict = "losing";
      reason = `£${revenue.toFixed(2)} attributed against £${costGbp.toFixed(2)} spent over ${a.runs} runs — £${Math.abs(net!).toFixed(2)} down. Only the revenue that NAMES this agent is counted, so check the tagging before switching it off.`;
    }

    return {
      agent, runs: a.runs, acus: a.acus, costGbp,
      costPerRunGbp: a.runs > 0 ? Math.round((costGbp / a.runs) * 100) / 100 : 0,
      byKind, attributedRevenueGbp: revenue, netGbp: net, returnMultiple: multiple,
      verdict, reason,
    };
  });

  // Most expensive first — the question this answers is "where is the money
  // going", and an alphabetical list buries it.
  lines.sort((a, b) => b.acus - a.acus);

  const totalAcus = lines.reduce((s, l) => s + l.acus, 0);
  const totalCostGbp = Math.round(gbp(totalAcus) * 100) / 100;
  const coveredAcus = lines.filter((l) => l.attributedRevenueGbp !== null).reduce((s, l) => s + l.acus, 0);
  const attributedCoveragePct = totalAcus > 0 ? Math.round((coveredAcus / totalAcus) * 1000) / 10 : 0;

  const headline = totalAcus === 0
    ? "Nothing has been metered yet, so there is nothing to judge."
    : attributedCoveragePct === 0
      ? `£${totalCostGbp.toFixed(2)} spent across ${lines.length} agent${lines.length === 1 ? "" : "s"}. No revenue names any of them, so this is a cost report — tag your campaign sources with the agent that produced them and it becomes a profit report.`
      : `£${totalCostGbp.toFixed(2)} spent across ${lines.length} agent${lines.length === 1 ? "" : "s"}, with £${Math.round(attributedRevenueGbp * 100) / 100} attributed back. ${attributedCoveragePct}% of the spend has revenue tracking against it.`;

  return {
    lines, totalAcus, totalCostGbp,
    attributedRevenueGbp: Math.round(attributedRevenueGbp * 100) / 100,
    attributedCoveragePct, headline,
  };
}

export const AGENT_ECONOMICS_DOCTRINE = [
  "Cost is measured exactly — it is a debit we performed. Revenue is only counted where an event's source NAMES the agent.",
  "Revenue nobody attributed is null, never zero. \"This cost £4.10 and nothing can say what it earned\" and \"this earned nothing\" are different sentences, and printing the second would switch off the agents that are hardest to attribute — usually the ones doing the upstream work.",
  "An event of £0 attributed to an agent (a logged lead) is a different state from no event at all, and the two never collapse.",
  "Source matching is on whole segments, never substrings. `content-engine` must not claim revenue tagged `content-engineering-blog`; an over-credited agent survives a cull it should not have.",
  "Below five runs nothing is judged. A cost per run over two runs is one bad day.",
  "Most expensive first. The question is where the money is going, and an alphabetical list buries the answer.",
];
