"use client";

// Per-brand results ledger context. Records real leads/orders/sales attributed
// to MarketWar and rolls them up for the ACTIVE brand, so the Revenue dashboard
// shows that brand's own money — empty until real events are logged. Persisted
// to localStorage (survives refresh, zero config); same shape syncs to Firestore
// (results/{brandId}) when wired, without changing consumers.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { type RevenueEvent, type ResultType, type ResultsSummary, summarize } from "@/shared/results";
import { useActiveBrand } from "@/frontend/brand-context";

type LogInput = { type: ResultType; source: string; amountGbp: number; note?: string; at?: string };

type ResultsContextValue = {
  events: RevenueEvent[];      // for the ACTIVE brand
  summary: ResultsSummary;     // for the ACTIVE brand
  logEvent: (input: LogInput) => void;
  removeEvent: (id: string) => void;
  ready: boolean;
};

const STORAGE_KEY = "mw.results.v1";

const emptySummary = summarize([]);
const fallback: ResultsContextValue = {
  events: [],
  summary: emptySummary,
  logEvent: () => {},
  removeEvent: () => {},
  ready: false,
};

const ResultsContext = createContext<ResultsContextValue>(fallback);

function makeId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch { /* fall through */ }
  return `evt_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function ResultsProvider({ children }: { children: ReactNode }) {
  const { activeBrand } = useActiveBrand();
  const [all, setAll] = useState<RevenueEvent[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as RevenueEvent[];
        if (Array.isArray(parsed)) setAll(parsed);
      }
    } catch { /* corrupt → empty */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch { /* quota */ }
  }, [all, ready]);

  const value = useMemo<ResultsContextValue>(() => {
    const brandId = activeBrand?.id ?? null;
    const events = brandId ? all.filter((e) => e.brandId === brandId) : [];
    return {
      events,
      summary: summarize(events),
      ready,
      logEvent: (input) => {
        if (!brandId) return; // no active brand → nothing to attribute to
        const event: RevenueEvent = {
          id: makeId(),
          brandId,
          type: input.type,
          source: input.source?.trim() || "Untagged",
          amountGbp: Math.max(0, Number(input.amountGbp) || 0),
          note: input.note?.trim() || undefined,
          at: input.at || new Date().toISOString(),
        };
        setAll((prev) => [event, ...prev]);
      },
      removeEvent: (id) => setAll((prev) => prev.filter((e) => e.id !== id)),
    };
  }, [all, activeBrand?.id, ready]);

  return <ResultsContext.Provider value={value}>{children}</ResultsContext.Provider>;
}

export function useResults(): ResultsContextValue {
  return useContext(ResultsContext);
}
