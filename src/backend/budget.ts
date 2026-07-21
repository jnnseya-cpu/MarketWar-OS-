// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Budget Protection Engine (The Financial Shield).
//
// Given a brand + monthly budget (+ optional live campaign figures), this engine
// COMPUTES the protection board the dashboard renders: per-campaign efficiency,
// a Stop / Fix / Scale verdict, the waste identified, the projected saving from
// killing that waste, the reroute return from moving it to the leading winner,
// and standing-order style rules. No hardcoded absolutes — every figure is
// derived from the inputs and clearly labelled as demo intelligence / an
// ESTIMATE. Deterministic + demo-safe (FNV-1a seed only; no Date.now / new Date
// / Math.random) so it renders with zero config, then live ad-platform spend
// replaces the modelled campaigns in place.
//
// profit-guard.ts is a per-clip PRE-SCALE gate (nine safety checks before one
// clip scales); this engine governs spend ALLOCATION across campaigns — a
// distinct concern, so it lives here rather than reusing that gate.

const seed = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

const round = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;

// Verdict uses the shared CampaignVerdict vocabulary so the page can reuse the
// existing VerdictBadge. STOP = kill/reroute, FIX = cap + improve, SCALE = feed.
export type BudgetVerdict = "SCALE" | "FIX" | "STOP";

export type BudgetCampaignInput = {
  name: string;
  spendGbp: number;
  revenueGbp?: number;
  orders?: number;
};

export type ProtectedCampaign = {
  name: string;
  spendGbp: number;
  revenueGbp: number;
  roas: number; // revenue / spend
  verdict: BudgetVerdict;
  reason: string;
  // Money the shield protects on THIS campaign (waste to reroute, or 0 for winners).
  protectedGbp: number;
};

export type StandingOrder = { rule: string; detail: string };

// The weekly "money saved" receipt (spec Phase 6) — the shield's protection
// expressed at a weekly cadence, the artifact a user gets emailed each week.
export type WeeklyReceipt = {
  weekProtectedGbp: number;    // waste stopped this week (monthly ÷ 4.33)
  weekRerouteReturnGbp: number; // projected extra revenue from rerouting it
  campaignsPaused: number;
  headline: string;
  cadence: "weekly";
};

export type BudgetReport = {
  business: string;
  monthlyBudgetGbp: number;
  totalSpendGbp: number;
  campaigns: ProtectedCampaign[];
  killedCount: number;
  protectedGbp: number; // total waste stopped + rerouted
  rerouteReturnGbp: number; // projected extra revenue from reroute into top winner
  projectedRoas: number;
  standingOrders: StandingOrder[];
  weeklyReceipt: WeeklyReceipt;
  note: string;
  isEstimate: true;
};

// Weeks per month (365.25 / 12 / 7) — a constant, keeps the receipt deterministic.
const WEEKS_PER_MONTH = 4.348;

// Deterministic modelled campaign set when the caller supplies none — a realistic
// SMB mix (one winner, one middling, one waster) scaled to the budget.
function modelCampaigns(business: string, monthlyBudgetGbp: number): BudgetCampaignInput[] {
  const s = seed(business || "brand");
  const b = Math.max(60, monthlyBudgetGbp || 600);
  const templates = [
    { name: "Best-seller — retargeting", spendShare: 0.28, roas: 3.6 + ((s >> 2) % 20) / 10 },
    { name: "Prospecting — core audience", spendShare: 0.24, roas: 2.1 + ((s >> 5) % 12) / 10 },
    { name: "Seasonal offer push", spendShare: 0.2, roas: 1.4 + ((s >> 8) % 10) / 10 },
    { name: "Brand awareness", spendShare: 0.16, roas: ((s >> 11) % 6) / 10 }, // 0–0.5 → waster
    { name: "New-format test", spendShare: 0.12, roas: 1.0 + ((s >> 14) % 14) / 10 },
  ];
  return templates.map((t) => {
    const spendGbp = round(b * t.spendShare);
    const revenueGbp = round(spendGbp * t.roas);
    return { name: t.name, spendGbp, revenueGbp, orders: revenueGbp > 0 ? Math.max(1, round(revenueGbp / 24)) : 0 };
  });
}

function verdictFor(spend: number, revenue: number): { verdict: BudgetVerdict; roas: number } {
  const roas = spend > 0 ? revenue / spend : 0;
  if (spend > 0 && roas < 1) return { verdict: "STOP", roas };
  if (roas >= 3) return { verdict: "SCALE", roas };
  return { verdict: "FIX", roas };
}

export function protectBudget(
  business: string,
  monthlyBudgetGbp: number,
  campaigns?: BudgetCampaignInput[]
): BudgetReport {
  const budget = Math.max(0, round(monthlyBudgetGbp || 600));
  const base = campaigns && campaigns.length ? campaigns : modelCampaigns(business, budget);

  const scored: ProtectedCampaign[] = base.map((c) => {
    const spendGbp = Math.max(0, round(c.spendGbp || 0));
    const revenueGbp = Math.max(0, round(c.revenueGbp || 0));
    const { verdict, roas } = verdictFor(spendGbp, revenueGbp);
    let reason: string;
    let protectedGbp = 0;
    if (verdict === "STOP") {
      protectedGbp = spendGbp; // the whole spend is waste to reroute
      reason =
        revenueGbp === 0
          ? `£${spendGbp} spent, £0 returned — burning budget with no capture. Kill and reroute.`
          : `ROAS ${round1(roas)}× is below break-even (1×) — losing money on every £. Kill and reroute.`;
    } else if (verdict === "FIX") {
      // Cap the overspend above break-even efficiency — the excess is protected.
      protectedGbp = round(Math.max(0, spendGbp - revenueGbp / 3));
      reason = `ROAS ${round1(roas)}× is positive but under the 3× scale floor — cap spend and fix the funnel before feeding it.`;
    } else {
      reason = `ROAS ${round1(roas)}× clears the 3× scale floor — proven winner, safe to feed rerouted budget.`;
    }
    return { name: c.name, spendGbp, revenueGbp, roas: round1(roas), verdict, reason, protectedGbp };
  });

  const totalSpendGbp = scored.reduce((a, c) => a + c.spendGbp, 0);
  const totalRevenueGbp = scored.reduce((a, c) => a + c.revenueGbp, 0);
  const killedCount = scored.filter((c) => c.verdict === "STOP").length;
  const protectedGbp = round(scored.reduce((a, c) => a + c.protectedGbp, 0));

  // Reroute return: move the protected waste into the strongest SCALE campaign at
  // its own ROAS — a projected additional-revenue ESTIMATE.
  const topWinner = [...scored].filter((c) => c.verdict === "SCALE").sort((a, b) => b.roas - a.roas)[0];
  const rerouteRoas = topWinner ? topWinner.roas : totalSpendGbp > 0 ? round1(totalRevenueGbp / totalSpendGbp) : 0;
  const rerouteReturnGbp = round(protectedGbp * rerouteRoas);
  const projectedRoas = totalSpendGbp > 0 ? round1(totalRevenueGbp / totalSpendGbp) : 0;

  const standingOrders: StandingOrder[] = [
    {
      rule: "Auto-pause zero-capture spend",
      detail: `Any campaign that spends without producing revenue is flagged to pause — and auto-pauses the moment your ad accounts connect. The shield caught ${killedCount} this cycle.`,
    },
    {
      rule: "Cap FIX campaigns at break-even",
      detail: "Campaigns above break-even but under the 3× scale floor are capped, not scaled, until the funnel is fixed.",
    },
    {
      rule: topWinner ? `Reroute saved budget into “${topWinner.name}”` : "Hold rerouted budget until a winner clears 3×",
      detail: topWinner
        ? `£${protectedGbp} of protected budget flows to the leading winner (ROAS ${rerouteRoas}×) — projected +£${rerouteReturnGbp}.`
        : "No campaign clears the 3× scale floor yet — protected budget is held rather than fed to an unproven winner.",
    },
    {
      rule: "Budget guardrail",
      detail: `Total modelled spend £${totalSpendGbp} is ${totalSpendGbp <= budget ? "within" : "OVER"} the £${budget} monthly budget.`,
    },
  ];

  // Weekly "money saved" receipt — the protection expressed at a weekly cadence.
  const weekProtectedGbp = round(protectedGbp / WEEKS_PER_MONTH);
  const weekRerouteReturnGbp = round(rerouteReturnGbp / WEEKS_PER_MONTH);
  const weeklyReceipt: WeeklyReceipt = {
    weekProtectedGbp,
    weekRerouteReturnGbp,
    campaignsPaused: killedCount,
    headline:
      weekProtectedGbp > 0
        ? `This week the shield protected £${weekProtectedGbp} of wasted spend${killedCount ? ` across ${killedCount} paused campaign${killedCount === 1 ? "" : "s"}` : ""}${weekRerouteReturnGbp > 0 ? `, rerouted for a projected +£${weekRerouteReturnGbp}` : ""}.`
        : "This week no wasted spend was detected — every campaign is clearing break-even.",
    cadence: "weekly",
  };

  return {
    business: business || "your brand",
    monthlyBudgetGbp: budget,
    totalSpendGbp,
    campaigns: scored.sort((a, b) => {
      const order: Record<BudgetVerdict, number> = { STOP: 0, FIX: 1, SCALE: 2 };
      return order[a.verdict] - order[b.verdict] || b.spendGbp - a.spendGbp;
    }),
    killedCount,
    protectedGbp,
    rerouteReturnGbp,
    projectedRoas,
    standingOrders,
    weeklyReceipt,
    note:
      "Demo intelligence — the protection board is modelled from your budget and typical campaign efficiency; every figure is an ESTIMATE, not booked spend. Connect your ad accounts and live spend/return replaces these modelled campaigns in place.",
    isEstimate: true,
  };
}
