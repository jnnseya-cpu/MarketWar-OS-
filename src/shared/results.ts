// Per-brand results ledger (client-safe, pure data).
//
// The money proof: every lead/order/sale a brand gets THROUGH MarketWar is
// recorded here and attributed to the campaign/source that produced it, so a
// brand sees its own real "Revenue attributed to MarketWar" — never a fabricated
// figure. Empty until real events are logged (owned capture + manual logging;
// Stripe adds automatic payment revenue later). No third party required.

export type ResultType = "lead" | "order" | "sale";

export type RevenueEvent = {
  id: string;
  brandId: string;
  type: ResultType;
  source: string;    // the campaign / channel that produced it
  amountGbp: number; // 0 for a lead; the order/sale value otherwise
  note?: string;
  at: string;        // ISO timestamp (set by the client when logged)
};

export type SourceRollup = { source: string; revenueGbp: number; orders: number; leads: number };
export type DayPoint = { day: string; revenueGbp: number };

export type ResultsSummary = {
  events: number;
  leads: number;
  orders: number;        // orders + sales
  revenueGbp: number;    // attributed revenue
  avgOrderGbp: number;
  bySource: SourceRollup[];
  byDay: DayPoint[];     // days that have activity, ascending
  isEmpty: boolean;
};

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

export function summarize(events: RevenueEvent[]): ResultsSummary {
  const leads = events.filter((e) => e.type === "lead").length;
  const orderEvents = events.filter((e) => e.type === "order" || e.type === "sale");
  const orders = orderEvents.length;
  const revenueGbp = round(orderEvents.reduce((a, e) => a + Math.max(0, e.amountGbp || 0), 0));
  const avgOrderGbp = orders > 0 ? round(revenueGbp / orders) : 0;

  const bySourceMap = new Map<string, SourceRollup>();
  for (const e of events) {
    const key = e.source?.trim() || "Untagged";
    const r = bySourceMap.get(key) ?? { source: key, revenueGbp: 0, orders: 0, leads: 0 };
    if (e.type === "lead") r.leads += 1;
    else { r.orders += 1; r.revenueGbp = round(r.revenueGbp + Math.max(0, e.amountGbp || 0)); }
    bySourceMap.set(key, r);
  }
  const bySource = [...bySourceMap.values()].sort((a, b) => b.revenueGbp - a.revenueGbp);

  const byDayMap = new Map<string, number>();
  for (const e of orderEvents) {
    const day = (e.at || "").slice(0, 10); // YYYY-MM-DD
    if (!day) continue;
    byDayMap.set(day, round((byDayMap.get(day) ?? 0) + Math.max(0, e.amountGbp || 0)));
  }
  const byDay = [...byDayMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, revenueGbp]) => ({ day, revenueGbp }));

  return { events: events.length, leads, orders, revenueGbp, avgOrderGbp, bySource, byDay, isEmpty: events.length === 0 };
}
