"use client";

// Per-brand results ledger context — server-backed so ALL three sources (manual
// "Log a result", owned form captures, Stripe payment webhooks) feed the same
// ledger the Revenue dashboard reads. Fetches the active brand's events from
// /api/results and applies optimistic updates on log/remove. The server persists
// to Firestore when configured, else in-memory for the test.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { type RevenueEvent, type ResultType, type ResultsSummary, summarize } from "@/shared/results";
import { useActiveBrand } from "@/frontend/brand-context";

type LogInput = { type: ResultType; source: string; amountGbp: number; note?: string; at?: string };

type ResultsContextValue = {
  events: RevenueEvent[];
  summary: ResultsSummary;
  logEvent: (input: LogInput) => Promise<void>;
  removeEvent: (id: string) => Promise<void>;
  refresh: () => void;
  ready: boolean;
};

const emptySummary = summarize([]);
const fallback: ResultsContextValue = {
  events: [],
  summary: emptySummary,
  logEvent: async () => {},
  removeEvent: async () => {},
  refresh: () => {},
  ready: false,
};

const ResultsContext = createContext<ResultsContextValue>(fallback);

function makeId(): string {
  try { if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID(); } catch { /* noop */ }
  return `evt_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function ResultsProvider({ children }: { children: ReactNode }) {
  const { activeBrand } = useActiveBrand();
  const brandId = activeBrand?.id ?? null;
  const [events, setEvents] = useState<RevenueEvent[]>([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async (id: string | null) => {
    if (!id) { setEvents([]); setReady(true); return; }
    try {
      const res = await fetch(`/api/results?brandId=${encodeURIComponent(id)}`);
      const data = await res.json();
      setEvents(Array.isArray(data.events) ? data.events : []);
    } catch {
      setEvents([]); // network error → show empty rather than stale/fake
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { setReady(false); load(brandId); }, [brandId, load]);

  const value = useMemo<ResultsContextValue>(() => ({
    events,
    summary: summarize(events),
    ready,
    refresh: () => load(brandId),
    logEvent: async (input) => {
      if (!brandId) return;
      const event: RevenueEvent = {
        id: makeId(), brandId, type: input.type,
        source: input.source?.trim() || "Untagged",
        amountGbp: input.type === "lead" ? 0 : Math.max(0, Number(input.amountGbp) || 0),
        note: input.note?.trim() || undefined,
        at: input.at || new Date().toISOString(),
      };
      setEvents((prev) => [event, ...prev]); // optimistic
      try {
        await fetch("/api/results", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event) });
      } catch {
        load(brandId); // reconcile on failure
      }
    },
    removeEvent: async (id) => {
      if (!brandId) return;
      setEvents((prev) => prev.filter((e) => e.id !== id)); // optimistic
      try {
        await fetch(`/api/results?brandId=${encodeURIComponent(brandId)}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
      } catch {
        load(brandId);
      }
    },
  }), [events, brandId, ready, load]);

  return <ResultsContext.Provider value={value}>{children}</ResultsContext.Provider>;
}

export function useResults(): ResultsContextValue {
  return useContext(ResultsContext);
}
