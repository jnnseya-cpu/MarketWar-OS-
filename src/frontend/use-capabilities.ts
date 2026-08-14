"use client";

// What this deployment can actually do, for any surface that needs to know
// BEFORE it takes somebody's work.
//
// Fetched once and shared, because every AI screen asking the same question on
// mount would be a self-inflicted load spike on the one endpoint that exists to
// say the platform is under strain.

import { useEffect, useState } from "react";

export type CapabilityState = {
  id: string; label: string; live: boolean; because: string;
  whenDark: string; stillWorks: string; oneAction: string;
};

let cache: CapabilityState[] | null = null;
let inflight: Promise<CapabilityState[]> | null = null;

async function load(): Promise<CapabilityState[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch("/api/capabilities")
      .then((r) => (r.ok ? r.json() : { capabilities: [] }))
      .then((d) => { cache = (d.capabilities || []) as CapabilityState[]; return cache; })
      .catch(() => [])
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function useCapability(id: string): { known: boolean; live: boolean; cap: CapabilityState | null } {
  const [caps, setCaps] = useState<CapabilityState[] | null>(cache);
  useEffect(() => { let on = true; void load().then((c) => { if (on) setCaps(c); }); return () => { on = false; }; }, []);
  const cap = caps?.find((c) => c.id === id) || null;
  return {
    // Until we know, nothing is claimed either way — a screen must not shout
    // "unavailable" at somebody while the answer is still in flight.
    known: caps !== null,
    live: cap ? cap.live : true,
    cap,
  };
}
