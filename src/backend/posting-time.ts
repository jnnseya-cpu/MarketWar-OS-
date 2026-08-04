// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// When to post — and the discipline of saying "we do not know yet".
//
// "Best time to post" is the single most fabricated number in marketing
// software. Every tool has one, almost none of them measured it on the account
// they are advising, and the ones quoting an industry study are quoting somebody
// else's audience on somebody else's platform in a different decade.
//
// So this engine has three tiers and it always says which one it is on.
//
//   MEASURED. This brand's own delivery ledger carries a timestamp on every
//   click and open. A click is a person doing something at a moment — the
//   cleanest signal of when this specific audience is awake and paying
//   attention. Given enough of them, the busiest hours are a fact about this
//   list and are reported as one.
//
//   MARKET HOURS. With too little data, the honest fallback is not a guess
//   about behaviour, it is arithmetic about time zones: the customer told us
//   which countries they sell to, so we can say when those places are awake.
//   That is a starting point for a test, and it is labelled as one — never as
//   a finding.
//
//   NOTHING. No data and no market set: say so, and say what to set. An
//   invented "Tuesday 10am" is worse than an empty panel, because the customer
//   acts on it and never learns it was decoration.
//
// A NOTE ON THE OPEN PIXEL. Apple Mail Privacy Protection fetches images on the
// reader's behalf near delivery rather than at the moment the person reads, so
// open timestamps cluster around when the send went out and describe OUR
// sending schedule rather than their habits. Clicks do not have that problem.
// Clicks are therefore weighted, and when only opens exist the report says the
// pattern may be an echo of the send time.

import { offsetMinutesAt, type TargetMarket } from "@/shared/market";

export type TimedEvent = { type: string; at: string; meta?: Record<string, string> };

export type HourBucket = { hour: number; clicks: number; opens: number; score: number };

export type PostingWindow = {
  /** Local hour in the market being described, 0–23. */
  hour: number;
  label: string;        // "18:00–19:00"
  clicks: number;
  opens: number;
};

export type PostingAdvice = {
  basis: "measured" | "market-hours" | "unknown";
  /** Which market these local hours are in — a time means nothing without one. */
  timezone: string;
  windows: PostingWindow[];
  days: { day: string; clicks: number; opens: number }[];
  sampleClicks: number;
  sampleOpens: number;
  headline: string;
  caveat: string;
};

/** Below this many clicks, an hourly breakdown is noise with a chart on it. */
export const MIN_CLICKS_TO_JUDGE = 40;
/** Opens alone are weaker evidence, so they have to be far more numerous. */
export const MIN_OPENS_TO_JUDGE = 300;

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const two = (n: number) => String(n).padStart(2, "0");
const label = (h: number) => `${two(h)}:00–${two((h + 1) % 24)}:00`;

/**
 * Bucket a brand's engagement by local hour.
 *
 * Timestamps are stored in UTC; a customer thinks in their market's clock, so
 * every event is shifted by that market's offset ON THE DAY IT HAPPENED —
 * `offsetMinutesAt` is DST-correct, which matters because half a year of events
 * is an hour out otherwise and the answer lands in the wrong bucket.
 */
export function hourBuckets(events: TimedEvent[], timezone: string): HourBucket[] {
  const buckets: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({ hour, clicks: 0, opens: 0, score: 0 }));
  for (const e of events) {
    if (e.type !== "click" && e.type !== "open") continue;
    if (e.meta?.machine === "true") continue;   // a scanner is not an audience
    const at = new Date(e.at);
    if (Number.isNaN(at.getTime())) continue;
    let local = at;
    try {
      local = new Date(at.getTime() + offsetMinutesAt(timezone, at) * 60_000);
    } catch { /* fall back to UTC rather than dropping the event */ }
    const h = local.getUTCHours();
    if (e.type === "click") buckets[h].clicks++;
    else buckets[h].opens++;
  }
  // A click is somebody acting; an open may be a privacy relay fetching an image
  // near delivery. So when there are enough clicks to judge, clicks decide the
  // ranking OUTRIGHT and opens are context — a weighted blend lets one hour with
  // a pile of relay-fetched opens outrank the hour people actually clicked in,
  // which is the exact error the weighting was meant to prevent.
  const totalClicks = buckets.reduce((n, b) => n + b.clicks, 0);
  const clicksDecide = totalClicks >= MIN_CLICKS_TO_JUDGE;
  for (const b of buckets) b.score = clicksDecide ? b.clicks : b.opens;
  return buckets;
}

export function dayBuckets(events: TimedEvent[], timezone: string): { day: string; clicks: number; opens: number }[] {
  const rows = DAYS.map((day) => ({ day, clicks: 0, opens: 0 }));
  for (const e of events) {
    if (e.type !== "click" && e.type !== "open") continue;
    if (e.meta?.machine === "true") continue;
    const at = new Date(e.at);
    if (Number.isNaN(at.getTime())) continue;
    let local = at;
    try { local = new Date(at.getTime() + offsetMinutesAt(timezone, at) * 60_000); } catch { /* UTC */ }
    const row = rows[local.getUTCDay()];
    if (e.type === "click") row.clicks++;
    else row.opens++;
  }
  return rows;
}

/**
 * When should this brand post?
 *
 * @param events   The brand's delivery ledger. Opens and clicks carry the time.
 * @param market   Where they sell — supplies the clock the answer is given in.
 * @param timezone Override, when the caller already knows the market's zone.
 */
export function bestPostingTimes(input: {
  events?: TimedEvent[];
  market?: TargetMarket | null;
  timezone?: string;
  limit?: number;
}): PostingAdvice {
  const events = input.events ?? [];
  const tz = input.timezone || primaryZone(input.market) || "";
  const limit = input.limit ?? 3;

  if (!tz) {
    return {
      basis: "unknown", timezone: "", windows: [], days: [], sampleClicks: 0, sampleOpens: 0,
      headline: "No best time can be given yet, and inventing one would be worse than saying so.",
      caveat: "Set the countries or cities you sell to in Target Market. A time of day means nothing until we know whose clock it is in — 9am is the middle of the night to half your list otherwise.",
    };
  }

  const buckets = hourBuckets(events, tz);
  const days = dayBuckets(events, tz);
  const sampleClicks = buckets.reduce((n, b) => n + b.clicks, 0);
  const sampleOpens = buckets.reduce((n, b) => n + b.opens, 0);

  const enough = sampleClicks >= MIN_CLICKS_TO_JUDGE || sampleOpens >= MIN_OPENS_TO_JUDGE;
  if (enough) {
    const onlyOpens = sampleClicks < MIN_CLICKS_TO_JUDGE;
    // An hour with nothing in it is not a recommendation. Asking for three
    // windows when only two have any activity returns two.
    const top = [...buckets]
      .filter((b) => b.score > 0)
      .sort((a, b) => b.score - a.score || a.hour - b.hour)
      .slice(0, limit);
    return {
      basis: "measured",
      timezone: tz,
      windows: top.map((b) => ({ hour: b.hour, label: label(b.hour), clicks: b.clicks, opens: b.opens })),
      days: [...days].sort((a, b) => (onlyOpens ? b.opens - a.opens : b.clicks - a.clicks)),
      sampleClicks, sampleOpens,
      headline: `Your audience is most active around ${top.map((b) => label(b.hour)).join(", ")} ${tz} time — measured from ${sampleClicks.toLocaleString()} click(s) and ${sampleOpens.toLocaleString()} open(s) of your own.`,
      caveat: onlyOpens
        ? `This is built mostly on opens, and an open is recorded when the image loads — Apple Mail Privacy Protection fetches that image near delivery rather than when the person reads. The pattern may be an echo of when you sent rather than when they read. It firms up at ${MIN_CLICKS_TO_JUDGE} clicks.`
        : "Ranked on clicks alone. An open can be a privacy relay fetching an image near delivery, so it describes when we sent as much as when they read; a click is a person doing something at that moment. Open counts are shown beside each window as context. Machine-flagged hits are excluded.",
    };
  }

  // Not enough of their own data. Arithmetic about their market, said plainly.
  const working = [9, 12, 18].slice(0, limit);
  return {
    basis: "market-hours",
    timezone: tz,
    windows: working.map((hour) => ({ hour, label: label(hour), clicks: 0, opens: 0 })),
    days,
    sampleClicks, sampleOpens,
    headline: `Not enough of your own activity to measure a best time yet — ${sampleClicks} click(s) and ${sampleOpens} open(s), against the ${MIN_CLICKS_TO_JUDGE} clicks it takes before an hourly pattern is anything but noise.`,
    caveat: `These windows are the waking hours of ${tz}, not a finding about your audience: morning, midday and early evening local time. Use them as the first test rather than an answer, and this panel replaces them with your own numbers as soon as there are enough.`,
  };
}

/** The clock the answer is given in: the first primary country's zone. */
function primaryZone(market?: TargetMarket | null): string {
  const first = (market?.countries ?? []).find((c) => c.tier === "primary") ?? (market?.countries ?? [])[0];
  return first ? ZONES[first.code] || "" : "";
}

// One representative zone per country we can name. Deliberately a lookup rather
// than a guess: a country that is not here returns nothing and the report says
// it does not know, which is the correct answer.
const ZONES: Record<string, string> = {
  GB: "Europe/London", IE: "Europe/Dublin", FR: "Europe/Paris", DE: "Europe/Berlin",
  ES: "Europe/Madrid", IT: "Europe/Rome", NL: "Europe/Amsterdam", BE: "Europe/Brussels",
  PT: "Europe/Lisbon", CH: "Europe/Zurich", AT: "Europe/Vienna", SE: "Europe/Stockholm",
  NO: "Europe/Oslo", DK: "Europe/Copenhagen", FI: "Europe/Helsinki", PL: "Europe/Warsaw",
  US: "America/New_York", CA: "America/Toronto", MX: "America/Mexico_City", BR: "America/Sao_Paulo",
  AU: "Australia/Sydney", NZ: "Pacific/Auckland", JP: "Asia/Tokyo", CN: "Asia/Shanghai",
  IN: "Asia/Kolkata", PK: "Asia/Karachi", BD: "Asia/Dhaka", AE: "Asia/Dubai", SA: "Asia/Riyadh",
  ZA: "Africa/Johannesburg", NG: "Africa/Lagos", KE: "Africa/Nairobi", GH: "Africa/Accra",
  EG: "Africa/Cairo", MA: "Africa/Casablanca", CD: "Africa/Kinshasa", CI: "Africa/Abidjan",
  SG: "Asia/Singapore", MY: "Asia/Kuala_Lumpur", ID: "Asia/Jakarta", PH: "Asia/Manila",
  TH: "Asia/Bangkok", VN: "Asia/Ho_Chi_Minh", TR: "Europe/Istanbul", IL: "Asia/Jerusalem",
};
