// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// What MarketWar itself spends, and the ceiling on it.
//
// Every limit in this platform guards the CUSTOMER: the ACU wallet meters their
// actions, the plan caps their allowance, meterAction refuses when their balance
// runs out. Nothing guarded the platform. One live month came to $33.45 on
// Anthropic alone against zero revenue, and nothing in the code would have
// stopped it at $333 — the wallet was full of a customer's ACUs that had nothing
// to do with the bill.
//
// THE ONE RULE THAT MAKES THIS SAFE TO SHIP: a ceiling must never cut off
// someone who has paid. A customer spending their own ACUs has already covered
// the provider cost twice over under the pricing law, so their work is exempt
// and always runs. What the ceiling stops is UNPAID burn — crons, demo traffic,
// the owner's own testing, a runaway loop at 3am. Blocking a paying customer to
// protect the owner's budget would be selling something and then refusing to
// deliver it.
//
// COSTS ARE ESTIMATES AND SAY SO. Published per-million-token prices, applied to
// token counts the providers return. Close enough to run a ceiling on, not a
// substitute for the invoice, and every figure is labelled.

export type ProviderId = "anthropic" | "openai" | "gemini";

/** USD per MILLION tokens. Published list prices; override per deployment. */
type Price = { inputPerM: number; outputPerM: number };

// Matched on a prefix so a dated model id ("claude-opus-4-8-20260115") resolves
// to its family. Ordered longest-first at lookup so "haiku" never matches a rule
// meant for the family name alone.
// Deliberately listed SHORTEST-MATCH FIRST. Lookup sorts longest-first, so this
// ordering proves the sort is doing the work: relying on declaration order would
// price gpt-5-mini as gpt-5 the moment someone tidied the list alphabetically.
const PRICES: { match: string; price: Price }[] = [
  { match: "gpt-5", price: { inputPerM: 1.25, outputPerM: 10 } },
  { match: "gpt-4o", price: { inputPerM: 2.5, outputPerM: 10 } },
  { match: "gemini", price: { inputPerM: 0.3, outputPerM: 2.5 } },
  { match: "claude-opus", price: { inputPerM: 15, outputPerM: 75 } },
  { match: "claude-sonnet", price: { inputPerM: 3, outputPerM: 15 } },
  { match: "claude-haiku", price: { inputPerM: 0.8, outputPerM: 4 } },
  { match: "gpt-5-mini", price: { inputPerM: 0.25, outputPerM: 2 } },
  { match: "gpt-4o-mini", price: { inputPerM: 0.15, outputPerM: 0.6 } },
  { match: "gemini-2.5-pro", price: { inputPerM: 1.25, outputPerM: 10 } },
  { match: "gemini-2.5-flash", price: { inputPerM: 0.3, outputPerM: 2.5 } },
];

/** Unknown model: priced at the most expensive family we know, never at zero. */
const FALLBACK: Price = { inputPerM: 15, outputPerM: 75 };

export function priceOf(model: string): Price {
  const m = (model || "").toLowerCase();
  const hit = [...PRICES].sort((a, b) => b.match.length - a.match.length).find((p) => m.includes(p.match));
  // A model we do not recognise is assumed EXPENSIVE. Guessing cheap on an
  // unknown model is how a ceiling silently stops working the day someone
  // switches to something new.
  return hit?.price ?? FALLBACK;
}

/** USD for one call. An estimate — labelled as one everywhere it is shown. */
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceOf(model);
  const usd = (Math.max(0, inputTokens) / 1_000_000) * p.inputPerM + (Math.max(0, outputTokens) / 1_000_000) * p.outputPerM;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

export type SpendEntry = {
  at: string;
  provider: ProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  usd: number;
  /** True when a paying customer's ACUs covered this. Exempt from the ceiling. */
  paid: boolean;
};

// In-process ledger. Deliberately NOT Firestore: a spend guard that needs a
// database round-trip before every AI call adds latency to the hot path and
// fails open when the database is slow. Per-instance accounting under-counts
// across serverless instances, which is stated rather than hidden — the console
// limit at the provider is the hard backstop, this is the early one.
const ledger: SpendEntry[] = [];
const MAX_ENTRIES = 5_000;

const monthKey = (iso: string) => iso.slice(0, 7);

export function recordSpend(e: Omit<SpendEntry, "at"> & { at?: string }): SpendEntry {
  const entry: SpendEntry = { ...e, at: e.at ?? new Date().toISOString() };
  ledger.push(entry);
  if (ledger.length > MAX_ENTRIES) ledger.splice(0, ledger.length - MAX_ENTRIES);
  return entry;
}

export type SpendSummary = {
  month: string;
  totalUsd: number;
  /** Spend NOT covered by a paying customer — the number the ceiling watches. */
  unpaidUsd: number;
  calls: number;
  byProvider: { provider: ProviderId; usd: number; calls: number }[];
  note: string;
};

export function spendThisMonth(now = new Date()): SpendSummary {
  const month = monthKey(now.toISOString());
  const rows = ledger.filter((e) => monthKey(e.at) === month);
  const by = new Map<ProviderId, { usd: number; calls: number }>();
  let totalUsd = 0, unpaidUsd = 0;
  for (const r of rows) {
    totalUsd += r.usd;
    if (!r.paid) unpaidUsd += r.usd;
    const cur = by.get(r.provider) ?? { usd: 0, calls: 0 };
    by.set(r.provider, { usd: cur.usd + r.usd, calls: cur.calls + 1 });
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    month, totalUsd: round(totalUsd), unpaidUsd: round(unpaidUsd), calls: rows.length,
    byProvider: [...by.entries()].map(([provider, v]) => ({ provider, usd: round(v.usd), calls: v.calls })).sort((a, b) => b.usd - a.usd),
    note: `Estimated from published token prices and the counts the providers returned — close enough to run a ceiling on, not a substitute for the invoice. Counted per server instance, so the real total across instances is higher; the console limit at the provider is the hard backstop.`,
  };
}

/** Monthly ceiling on UNPAID spend, in USD. 0 or unset = no ceiling. */
export const MONTHLY_CEILING_USD = Number(process.env.AI_MONTHLY_CEILING_USD || 0);

export type SpendVerdict = { allowed: boolean; reason: string; spentUsd: number; ceilingUsd: number };

/**
 * May this call run?
 *
 * @param paid Whether a paying customer's ACUs cover it. Paid work ALWAYS runs:
 *             they have covered the provider cost twice over under the pricing
 *             law, and blocking them to protect the owner's budget would be
 *             selling something and then refusing to deliver it.
 */
export function spendVerdict(paid: boolean, now = new Date(), ceilingUsd?: number): SpendVerdict {
  // Injectable so the exemption is testable. With the env unset the ceiling is
  // 0, every call is allowed for that reason alone, and a test of "paid work is
  // exempt" would pass without ever reaching the exemption.
  const ceiling = ceilingUsd ?? MONTHLY_CEILING_USD;
  const s = spendThisMonth(now);
  if (paid) {
    return { allowed: true, reason: "", spentUsd: s.unpaidUsd, ceilingUsd: ceiling };
  }
  if (!ceiling || ceiling <= 0) {
    return { allowed: true, reason: "", spentUsd: s.unpaidUsd, ceilingUsd: 0 };
  }
  if (s.unpaidUsd >= ceiling) {
    return {
      allowed: false,
      spentUsd: s.unpaidUsd, ceilingUsd: ceiling,
      reason: `The platform's own monthly AI budget is spent: about $${s.unpaidUsd.toFixed(2)} of unpaid work against a $${ceiling} ceiling (AI_MONTHLY_CEILING_USD). Work paid for with a customer's ACUs is unaffected and still runs — this only stops free and internal calls. Raise the ceiling or wait for the month to roll over.`,
    };
  }
  return { allowed: true, reason: "", spentUsd: s.unpaidUsd, ceilingUsd: ceiling };
}

/** Test seam — the ledger is process state and would otherwise leak between cases. */
export function __resetSpend(): void { ledger.length = 0; }
