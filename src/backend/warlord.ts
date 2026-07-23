// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// WARLORD — the Revenue Commander (Money Machine Doctrine §6, Law 6).
// The orchestration layer over the real engines: it takes a brand's own results
// ledger, reuses the Command briefing + Money Score, and re-orders the moves by
// the Speed-of-Money law (fastest cash first). Output is a daily War Report:
// what money moved, the ranked strike queue, and the top strike. Nothing is
// fabricated — every strike traces to a computed signal in the brand's ledger.

import { commandBriefing, type CommandBriefing, type BriefItem } from "@/backend/command-summary";
import { type ResultsSummary } from "@/shared/results";

export type SpeedClass = "reactivate" | "recover" | "multiply" | "convert" | "acquire";
export type Strike = BriefItem & { speed: SpeedClass; speedRank: number };
export type WarReport = {
  business: string;
  briefing: CommandBriefing;
  topStrike: BriefItem | null;
  speedQueue: Strike[];
  note: string;
};

// Law 6 ordering: fastest money first. Reactivating known customers and
// recovering stalled/abandoned revenue beats cold acquisition every time.
const SPEED_ORDER: Record<SpeedClass, number> = { reactivate: 1, recover: 2, multiply: 3, convert: 4, acquire: 5 };
const SPEED_LABEL: Record<SpeedClass, string> = {
  reactivate: "Reactivate", recover: "Recover", multiply: "Multiply", convert: "Convert", acquire: "Acquire",
};

function classify(item: BriefItem): SpeedClass {
  const t = `${item.title} ${item.detail}`.toLowerCase();
  if (/reactivat|dormant|win.?back|lapsed|inactive/.test(t)) return "reactivate";
  if (/recover|abandon|failed payment|stalled|unpaid|ghost|missed/.test(t)) return "recover";
  if (/upsell|cross.?sell|bundle|average order|aov|repeat|raise .*price|pricing/.test(t)) return "multiply";
  if (/convert|follow.?up|close|activate .*lead|captured lead|conversion/.test(t)) return "convert";
  return "acquire";
}

export function speedLabel(s: SpeedClass): string { return SPEED_LABEL[s]; }

export function warReport(business: string, summary: ResultsSummary): WarReport {
  const briefing = commandBriefing(business, summary);
  const pool = [...briefing.risks, ...briefing.opportunities, ...briefing.nextActions];
  const seen = new Set<string>();
  const strikes: Strike[] = [];
  for (const item of pool) {
    if (seen.has(item.title)) continue;
    seen.add(item.title);
    const speed = classify(item);
    strikes.push({ ...item, speed, speedRank: SPEED_ORDER[speed] });
  }
  // Speed-of-Money first, then priority within the same speed class.
  strikes.sort((a, b) => (a.speedRank - b.speedRank) || (b.priority - a.priority));

  return {
    business: briefing.business,
    briefing,
    topStrike: briefing.nextBestAction,
    speedQueue: strikes.slice(0, 8),
    note: "Strikes ordered by Speed-of-Money (Law 6): reactivate → recover → multiply → convert → acquire — fastest cash first. Every line is computed from your real ledger, never fabricated.",
  };
}
