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

import { adminDb, adminConfigured } from "@/backend/firebase-admin";

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

// In-process ledger. Deliberately NOT read from Firestore on the hot path: a
// spend guard that needs a database round-trip before every AI call adds latency
// to every request and fails open when the database is slow.
//
// BUT PER-INSTANCE ACCOUNTING WAS THE WHOLE HOLE.
//
// Stating "counted per server instance, so the real total is higher" was honest
// and still left the ceiling unable to do its job: ten instances meant ten times
// the ceiling, and a cold start put the month back to zero. That is not a
// conservative under-count — it is a limit that does not exist.
//
// So the total is now SHARED, without putting a round-trip in front of anything:
//
//   • Recording stays synchronous and in-memory. The hot path is untouched.
//   • After recording, a Firestore increment is fired and NOT awaited. A slow or
//     broken database costs nothing and blocks nobody.
//   • Reading merges this instance's own rows with the last known shared total,
//     refreshed at most once every REFRESH_MS. A ceiling check therefore sees
//     what every other instance has spent, a few seconds stale at worst.
//
// Deliberately additive: with Admin unconfigured every line below is skipped and
// the module behaves exactly as it did before.
const ledger: SpendEntry[] = [];
const MAX_ENTRIES = 5_000;

const monthKey = (iso: string) => iso.slice(0, 7);

const SHARED_COLLECTION = "ai_spend_months";
const REFRESH_MS = 30_000;

/** What other instances have spent this month, and when we last asked. */
type SharedTotal = { month: string; totalUsd: number; unpaidUsd: number; calls: number; fetchedAtMs: number };
let shared: SharedTotal | null = null;
/** Everything this instance has already pushed, so a refresh does not double-count it. */
const pushed = { month: "", totalUsd: 0, unpaidUsd: 0, calls: 0 };
let refreshing = false;

/** Null whenever Firebase is unconfigured — which is every test and all of demo mode. */
function durable() {
  return adminConfigured && adminDb ? adminDb : null;
}

export function recordSpend(e: Omit<SpendEntry, "at"> & { at?: string }): SpendEntry {
  const entry: SpendEntry = { ...e, at: e.at ?? new Date().toISOString() };
  ledger.push(entry);
  if (ledger.length > MAX_ENTRIES) ledger.splice(0, ledger.length - MAX_ENTRIES);
  // Counted whether or not a shared store exists. This is bookkeeping of what
  // THIS instance recorded, and it is what gets subtracted from the shared total
  // so a refresh does not count our own calls twice. Tying it to whether
  // Firestore happens to be configured made the subtraction silently wrong.
  const month = monthKey(entry.at);
  if (pushed.month !== month) { pushed.month = month; pushed.totalUsd = 0; pushed.unpaidUsd = 0; pushed.calls = 0; }
  pushed.totalUsd += entry.usd;
  if (!entry.paid) pushed.unpaidUsd += entry.usd;
  pushed.calls += 1;
  pushSharedSpend(entry);
  return entry;
}

/**
 * Add one call to the shared total. FIRE AND FORGET — never awaited.
 *
 * `increment` is used rather than read-modify-write because two instances
 * recording at the same moment must both count. A read-then-set here would lose
 * one of them, which is the same defect as charging twice, pointed the other
 * way.
 */
function pushSharedSpend(entry: SpendEntry): void {
  const db = durable();
  if (!db) return;
  const month = monthKey(entry.at);

  void (async () => {
    try {
      const { FieldValue } = await import("firebase-admin/firestore");
      await db.collection(SHARED_COLLECTION).doc(month).set({
        month,
        totalUsd: FieldValue.increment(entry.usd),
        unpaidUsd: FieldValue.increment(entry.paid ? 0 : entry.usd),
        calls: FieldValue.increment(1),
        updatedAt: entry.at,
      }, { merge: true });
    } catch {
      // A failed push means this instance's spend is missing from the shared
      // document while still being subtracted from it, so the ceiling reads
      // slightly LOW until the next successful write. The alternative is
      // failing a customer's request to protect a bookkeeping figure, which
      // this module exists to refuse. The local ledger still holds every entry,
      // and the provider console limit is the hard backstop.
    }
  })();
}

/** Refresh the shared total, at most every REFRESH_MS. Never awaited by a caller. */
function refreshShared(month: string): void {
  const db = durable();
  if (!db || refreshing) return;
  if (shared && shared.month === month && Date.now() - shared.fetchedAtMs < REFRESH_MS) return;
  refreshing = true;
  void (async () => {
    try {
      const snap = await db.collection(SHARED_COLLECTION).doc(month).get();
      const v = (snap.data() || {}) as Partial<SharedTotal>;
      shared = {
        month,
        totalUsd: Number(v.totalUsd) || 0,
        unpaidUsd: Number(v.unpaidUsd) || 0,
        calls: Number(v.calls) || 0,
        fetchedAtMs: Date.now(),
      };
    } catch {
      // Leave the previous figure in place. A ceiling that resets to zero
      // because a read failed is worse than one a few minutes stale.
    } finally { refreshing = false; }
  })();
}

/**
 * What OTHER instances have spent this month.
 *
 * The shared document includes this instance's own pushes, so they are taken
 * back out — otherwise every call would be counted twice the moment a refresh
 * landed, and the ceiling would trip at half its stated value.
 */
function othersSpend(month: string): { totalUsd: number; unpaidUsd: number; calls: number } {
  if (!shared || shared.month !== month) return { totalUsd: 0, unpaidUsd: 0, calls: 0 };
  const mine = pushed.month === month ? pushed : { totalUsd: 0, unpaidUsd: 0, calls: 0 };
  return {
    totalUsd: Math.max(0, shared.totalUsd - mine.totalUsd),
    unpaidUsd: Math.max(0, shared.unpaidUsd - mine.unpaidUsd),
    calls: Math.max(0, shared.calls - mine.calls),
  };
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
  refreshShared(month);
  const rows = ledger.filter((e) => monthKey(e.at) === month);
  const by = new Map<ProviderId, { usd: number; calls: number }>();
  let totalUsd = 0, unpaidUsd = 0;
  for (const r of rows) {
    totalUsd += r.usd;
    if (!r.paid) unpaidUsd += r.usd;
    const cur = by.get(r.provider) ?? { usd: 0, calls: 0 };
    by.set(r.provider, { usd: cur.usd + r.usd, calls: cur.calls + 1 });
  }
  // Everything the other instances have spent. Zero when Firebase is
  // unconfigured, so demo mode and every test see exactly the old behaviour.
  const others = othersSpend(month);
  const round = (n: number) => Math.round(n * 100) / 100;
  const sharedKnown = others.calls > 0 || others.totalUsd > 0;
  return {
    month,
    totalUsd: round(totalUsd + others.totalUsd),
    unpaidUsd: round(unpaidUsd + others.unpaidUsd),
    calls: rows.length + others.calls,
    byProvider: [...by.entries()].map(([provider, v]) => ({ provider, usd: round(v.usd), calls: v.calls })).sort((a, b) => b.usd - a.usd),
    note: `Estimated from published token prices and the counts the providers returned — close enough to run a ceiling on, not a substitute for the invoice. ${
      sharedKnown
        ? `Includes $${round(others.totalUsd).toFixed(2)} recorded by other server instances (refreshed at most every ${Math.round(REFRESH_MS / 1000)}s, so it can be seconds stale). The per-provider split below is this instance's own calls only.`
        : durable()
          ? "Shared across server instances; no spend from another instance has been read yet."
          : "Counted per server instance, because no shared store is configured — the real total across instances is higher. The console limit at the provider is the hard backstop."
    }`,
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
export function __resetSpend(): void {
  ledger.length = 0;
  shared = null;
  pushed.month = ""; pushed.totalUsd = 0; pushed.unpaidUsd = 0; pushed.calls = 0;
}

/** Test seam. Stands in for what other instances have recorded, without a database. */
export function __setSharedSpend(v: { month: string; totalUsd: number; unpaidUsd: number; calls: number } | null): void {
  shared = v ? { ...v, fetchedAtMs: Date.now() } : null;
}
