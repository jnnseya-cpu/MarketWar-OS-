// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Revenue Forecast Engine — next-30-day money, computed from the REAL ledger.
//
// Phase 7 promises "Revenue Intelligence forecasts next month's money." This is
// that forecast: a deterministic projection derived only from the brand's own
// attributed-revenue ledger (run-rate + open-lead upside), NOT an LLM narrative
// and NOT a hardcoded figure. Three honest scenarios — base (current run-rate
// repeats), push (convert some open leads), stretch (convert more + a small AOV
// lift) — each with its basis stated. Empty until the ledger has activity; every
// figure is a labelled estimate. No wall-clock / randomness (span is derived by
// parsing the ledger's own day strings, so the same events always forecast the
// same money).

import { type ResultsSummary } from "@/shared/results";

export type ForecastScenario = { label: string; revenueGbp: number; basis: string };

export type RevenueForecast = {
  isEmpty: boolean;
  horizonDays: 30;
  observedRevenueGbp: number;
  observedSpanDays: number;
  dailyRunRateGbp: number;
  openLeads: number;
  avgOrderGbp: number;
  scenarios: { base: ForecastScenario; push: ForecastScenario; stretch: ForecastScenario };
  assumptions: string[];
  note: string;
};

const round = (n: number) => Math.round(n);

// Deterministic ordinal day-number from a "YYYY-MM-DD" string (no Date object,
// so no wall-clock dependence) — good enough to measure the observed span.
function ordinal(day: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const cum = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12) return null;
  return y * 365 + cum[mo - 1] + d;
}

function safe(s: Partial<ResultsSummary> | null | undefined): ResultsSummary {
  return {
    events: typeof s?.events === "number" ? s!.events : 0,
    leads: typeof s?.leads === "number" ? s!.leads : 0,
    orders: typeof s?.orders === "number" ? s!.orders : 0,
    revenueGbp: typeof s?.revenueGbp === "number" ? s!.revenueGbp : 0,
    avgOrderGbp: typeof s?.avgOrderGbp === "number" ? s!.avgOrderGbp : 0,
    bySource: Array.isArray(s?.bySource) ? s!.bySource : [],
    byDay: Array.isArray(s?.byDay) ? s!.byDay : [],
    isEmpty: s?.isEmpty ?? (typeof s?.events === "number" ? s!.events === 0 : true),
  };
}

export function forecastRevenue(rawSummary: ResultsSummary): RevenueForecast {
  const summary = safe(rawSummary);
  const { revenueGbp, orders, leads, avgOrderGbp, byDay } = summary;

  if (summary.isEmpty || (revenueGbp === 0 && leads === 0)) {
    return {
      isEmpty: true,
      horizonDays: 30,
      observedRevenueGbp: 0,
      observedSpanDays: 0,
      dailyRunRateGbp: 0,
      openLeads: 0,
      avgOrderGbp: 0,
      scenarios: {
        base: { label: "Base", revenueGbp: 0, basis: "No attributed revenue yet — the forecast starts the moment real results land." },
        push: { label: "Push", revenueGbp: 0, basis: "Needs leads or orders in the ledger to project upside." },
        stretch: { label: "Stretch", revenueGbp: 0, basis: "Needs a proven run-rate to model an aggressive scenario." },
      },
      assumptions: ["Nothing is fabricated — this forecast is empty because the ledger is empty."],
      note: "Forecast computes from your own attributed-revenue ledger as soon as leads/orders are logged.",
    };
  }

  // Observed span in days from the ledger's own day points.
  const ords = byDay.map((p) => ordinal(p.day)).filter((n): n is number => n !== null);
  const observedSpanDays = ords.length >= 2 ? Math.max(1, Math.max(...ords) - Math.min(...ords) + 1) : 0;

  // Daily run-rate: revenue over the observed span. With <2 dated points we
  // can't measure a rate, so the base case conservatively repeats the observed
  // revenue over the next 30 days rather than inventing a trend.
  const dailyRunRateGbp = observedSpanDays >= 2 ? round((revenueGbp / observedSpanDays) * 100) / 100 : 0;
  const base30 = observedSpanDays >= 2 ? round(dailyRunRateGbp * 30) : round(revenueGbp);

  // Average order value drives the open-lead upside; fall back to a conservative
  // £25 basket only when there is no realised AOV yet.
  const aov = avgOrderGbp > 0 ? avgOrderGbp : orders > 0 ? round(revenueGbp / orders) : 25;
  const openLeads = leads;

  // Push: convert 20% of open leads at AOV on top of the base run-rate.
  const pushUpside = round(openLeads * aov * 0.2);
  // Stretch: convert 35% of open leads AND a 10% AOV lift across the base.
  const stretchUpside = round(openLeads * aov * 0.35 + base30 * 0.1);

  const spanBasis = observedSpanDays >= 2
    ? `current run-rate £${dailyRunRateGbp}/day over the ${observedSpanDays} observed day${observedSpanDays === 1 ? "" : "s"}, projected across 30 days`
    : `repeats the £${base30} already attributed (not enough dated activity to measure a daily trend yet)`;

  return {
    isEmpty: false,
    horizonDays: 30,
    observedRevenueGbp: round(revenueGbp),
    observedSpanDays,
    dailyRunRateGbp,
    openLeads,
    avgOrderGbp: round(aov),
    scenarios: {
      base: { label: "Base", revenueGbp: base30, basis: `Base — ${spanBasis}.` },
      push: { label: "Push", revenueGbp: base30 + pushUpside, basis: `Push — base + converting 20% of your ${openLeads} open lead${openLeads === 1 ? "" : "s"} at £${round(aov)} AOV (+£${pushUpside}).` },
      stretch: { label: "Stretch", revenueGbp: base30 + stretchUpside, basis: `Stretch — base + converting 35% of open leads and a 10% AOV lift (+£${stretchUpside}).` },
    },
    assumptions: [
      observedSpanDays >= 2
        ? `Run-rate measured from ${observedSpanDays} days of dated results.`
        : "Too few dated results to measure a trend — base repeats observed revenue conservatively.",
      `Open-lead upside uses your realised AOV (£${round(aov)}) and fixed conversion assumptions (Push 20%, Stretch 35%).`,
      "Every figure is an estimate derived from your ledger — not booked revenue.",
    ],
    note: "Computed from this brand's own attributed-revenue ledger (run-rate + open-lead upside). Deterministic — the same events always produce the same forecast.",
  };
}
