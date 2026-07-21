// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// M-34 Email Deliverability Posture Engine (Email Command Center intelligence).
//
// The sending facade + hygiene pipeline live in src/backend/email.ts (untouched).
// This engine computes the Command Center's HEADLINE POSTURE from the active
// brand + optional list size: list-hygiene composition, a projected
// inbox/spam/bounce split and a sendable count, plus an N-day delivery
// PROJECTION series. Every figure here is a clearly-labelled ESTIMATE derived
// deterministically from the inputs — it is NOT actual sent history and is never
// presented as booked delivery. Deterministic + demo-safe: FNV-1a seed only, no
// Date.now / new Date / Math.random, renders with zero config. When real send
// telemetry lands (provider webhooks), it replaces these estimates in place.

const seed = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

// Default modelled list size when the caller doesn't supply one — a mid-sized
// SMB list. Kept modest so the posture reads as a realistic estimate, not a boast.
const DEFAULT_LIST_SIZE = 1240;

export type ListComposition = {
  label: string;
  count: number;
  // "healthy" (sendable) vs "filtered" (removed pre-send — a prevented bounce).
  kind: "healthy" | "filtered";
};

export type DeliveryPoint = { label: string; delivered: number; filtered: number };

export type EmailPostureReport = {
  business: string;
  listSize: number;
  // Hygiene composition of the modelled list (counts sum to listSize).
  composition: ListComposition[];
  sendableCount: number;
  filteredCount: number;
  listHealthPct: number; // sendable / total, 0–100
  // Projected inbox split — ESTIMATES, not measured telemetry.
  projectedInboxRatePct: number;
  projectedSpamRatePct: number;
  projectedBounceRatePct: number;
  projectedComplaintRatePct: number;
  // N-day delivery PROJECTION (not sent history).
  days: number;
  series: DeliveryPoint[];
  estimateNote: string;
  isEstimate: true;
};

// Deterministic per-brand hygiene rates. Derived from the brand seed so each
// brand shows a stable, distinct-but-plausible posture with zero config.
function hygieneProfile(business: string) {
  const s = seed(business || "brand");
  // Filtered fractions of the raw list (bounded to realistic SMB ranges).
  const invalidPct = round2(1.4 + ((s >> 2) % 240) / 100); // 1.40–3.79%
  const disposablePct = round2(0.5 + ((s >> 6) % 130) / 100); // 0.50–1.79%
  const rolePct = round2(1.0 + ((s >> 9) % 200) / 100); // 1.00–2.99%
  const suppressedPct = round2(0.6 + ((s >> 12) % 180) / 100); // 0.60–2.39%
  return { s, invalidPct, disposablePct, rolePct, suppressedPct };
}

export function emailPosture(business: string, listSize?: number, days = 14): EmailPostureReport {
  const size = Math.max(0, Math.round(listSize && listSize > 0 ? listSize : DEFAULT_LIST_SIZE));
  const nDays = clamp(Math.round(days), 5, 30);
  const { s, invalidPct, disposablePct, rolePct, suppressedPct } = hygieneProfile(business);

  const invalid = Math.round((size * invalidPct) / 100);
  const disposable = Math.round((size * disposablePct) / 100);
  const role = Math.round((size * rolePct) / 100);
  const suppressed = Math.round((size * suppressedPct) / 100);
  const filteredCount = Math.min(size, invalid + disposable + role + suppressed);
  const sendableCount = Math.max(0, size - filteredCount);
  const listHealthPct = size ? Math.round((sendableCount / size) * 100) : 0;

  const composition: ListComposition[] = [
    { label: "Sendable, consented", count: sendableCount, kind: "healthy" },
    { label: "Role addresses", count: role, kind: "filtered" },
    { label: "Disposable / burner", count: disposable, kind: "filtered" },
    { label: "Invalid syntax", count: invalid, kind: "filtered" },
    { label: "Suppressed (bounce/complaint/unsub)", count: suppressed, kind: "filtered" },
  ];

  // Projected inbox split — clean list + authenticated warmed reputation earns
  // inbox placement. These are ESTIMATES scaled by the list's own health, never
  // measured provider telemetry.
  const healthFactor = listHealthPct / 100; // 0–1
  const projectedBounceRatePct = round2(clamp(0.6 - healthFactor * 0.35 + ((s >> 15) % 20) / 100, 0.1, 0.9));
  const projectedComplaintRatePct = round2(clamp(0.09 - healthFactor * 0.04 + ((s >> 17) % 6) / 100, 0.01, 0.15));
  const projectedSpamRatePct = round1(clamp(4.5 - healthFactor * 3.2 + ((s >> 19) % 15) / 10, 0.6, 6));
  const projectedInboxRatePct = round1(clamp(100 - projectedBounceRatePct - projectedSpamRatePct, 90, 99.6));

  // N-day delivery PROJECTION. A deterministic weekday-shaped send cadence
  // scaled to the sendable base — labelled as an estimate, NOT actual history.
  const WK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekdayWeight = [0.7, 0.9, 1.0, 1.3, 1.5, 0.6, 0.4]; // send more mid/end week
  // Roughly a fifth of the sendable base is touched on a peak day; deterministic jitter.
  const peakSend = Math.max(20, Math.round(sendableCount * 0.18));
  const series: DeliveryPoint[] = Array.from({ length: nDays }, (_, i) => {
    const dow = i % 7;
    const jitter = 0.82 + (((s >> (i % 24)) + i * 2654435761) % 36) / 100; // 0.82–1.17
    const delivered = Math.max(0, Math.round(peakSend * weekdayWeight[dow] * jitter));
    const filtered = Math.round(delivered * (filteredCount / (size || 1)));
    return { label: WK[dow], delivered, filtered };
  });

  return {
    business: business || "your brand",
    listSize: size,
    composition,
    sendableCount,
    filteredCount,
    listHealthPct,
    projectedInboxRatePct,
    projectedSpamRatePct,
    projectedBounceRatePct,
    projectedComplaintRatePct,
    days: nDays,
    series,
    estimateNote:
      "Demo intelligence — projected posture, not booked send history. Figures are ESTIMATES modelled from your list size and the hygiene pipeline; they are replaced in place by real provider telemetry (delivered/bounce/complaint webhooks) once sends go live.",
    isEstimate: true,
  };
}
