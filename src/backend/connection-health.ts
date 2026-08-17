// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// IS THIS CHANNEL ACTUALLY USABLE?
//
// "Connected" is not a health check. A Page token that expired last Tuesday is
// still stored, still returns a Page name, and still shows a green dot — right
// up until the moment a scheduled post fails at 3am and nobody finds out for a
// week. The dot was measuring whether a row exists in a database, which is not
// a fact anybody cares about.
//
// WHERE THE SIGNALS COME FROM, AND WHY NONE OF THEM IS INVENTED.
//
// Every state below is derived from something that was recorded when it
// happened. The publication ledger already keeps every publish attempt and its
// error — so an expired token, a missing permission and a rate limit are read
// out of real failures rather than guessed at from an age in days.
//
// This matters because the alternative is irresistible and wrong: "connected 61
// days ago, tokens last 60, therefore amber". That number would be a
// fabrication dressed as a diagnosis, it would be wrong for every deployment
// whose token does not expire, and the platform's own rule forbids it — never
// present a number as a measurement unless something counted it.
//
// So: if nothing has failed, the honest answer is that nothing has failed. The
// state is `connected` and the note says the last attempt worked, or that there
// has not been one yet. Not a prediction.

import { listPublications, type Publication } from "@/backend/publication-ledger";

export type HealthState =
  | "connected"        // green — usable
  | "action_required"  // amber — connected, but something must be fixed
  | "disconnected"     // red — not connected at all
  | "unknown";         // no channel record and nothing recorded either way

/** What actually went wrong, classified from the error the channel returned. */
export const FAULTS = ["expired_token", "insufficient_permission", "rate_limited", "publish_failing"] as const;
export type Fault = (typeof FAULTS)[number];

export const FAULT_FIX: Record<Fault, string> = {
  expired_token: "Reconnect the account — the access token is no longer valid, so nothing can be published until it is replaced.",
  insufficient_permission: "Reconnect and grant publishing permission. The account is linked but not allowed to post on your behalf.",
  rate_limited: "Nothing is broken — the platform is asking us to slow down. Scheduled posts will go out; try a manual post again shortly.",
  publish_failing: "Recent posts to this channel failed for a reason that is not a token or a permission. Open the attempt to see what the platform said.",
};

export type ChannelHealth = {
  channel: string;
  state: HealthState;
  faults: Fault[];
  /** Plain sentence for the dashboard. Never a prediction, always a report. */
  note: string;
  /** What to do, when there is something to do. */
  fix?: string;
  /** Counted from the ledger — never estimated. */
  recentFailures: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
};

/**
 * Classify a channel's error text into a fault.
 *
 * Deliberately narrow. An error that does not clearly say "token", "permission"
 * or "rate limit" is `publish_failing` — a truthful "this is failing and here is
 * what it said" rather than a confident wrong diagnosis that sends somebody to
 * reconnect an account that was never the problem.
 */
export function classifyFault(error: string): Fault {
  const e = (error || "").toLowerCase();
  if (/(expired|session has expired|token is invalid|invalid oauth|access token|reauthenticat|code 190)/.test(e)) return "expired_token";
  if (/(permission|not authoriz|unauthoriz|forbidden|scope|not allowed|code 200|code 10)\b/.test(e)) return "insufficient_permission";
  if (/(rate limit|too many requests|429|throttl|request limit reached|code 4|code 17|code 32)/.test(e)) return "rate_limited";
  return "publish_failing";
}

/** How far back a failure still counts as "recent". Older ones are history, not health. */
export const HEALTH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type HealthInput = {
  channel: string;
  /** Whether a connection record exists at all. The caller owns that check. */
  connected: boolean;
  nowMs?: number;
  /** Injected so this is testable without a store, and so the source is explicit. */
  history?: Publication[];
};

/**
 * One channel's health, from what was recorded.
 *
 * The ordering below is the whole judgement: a SUCCESS AFTER A FAILURE clears
 * it. A token that failed on Monday and worked on Tuesday was reconnected, and
 * leaving the amber dot up would train people to ignore amber dots.
 */
export function channelHealth(input: HealthInput): ChannelHealth {
  const now = input.nowMs ?? Date.now();
  const since = now - HEALTH_WINDOW_MS;
  const rows = (input.history || []).filter((p) => p.channel === input.channel);

  const at = (p: Publication) => Date.parse(p.settledAt || p.claimedAt) || 0;
  const successes = rows.filter((p) => p.state === "published").sort((a, b) => at(b) - at(a));
  const failures = rows.filter((p) => (p.state === "failed" || p.state === "uncertain") && at(p) >= since).sort((a, b) => at(b) - at(a));

  const lastSuccessAt = successes[0] ? (successes[0].settledAt || successes[0].claimedAt) : undefined;
  const lastFailureAt = failures[0] ? (failures[0].settledAt || failures[0].claimedAt) : undefined;

  if (!input.connected) {
    return {
      channel: input.channel, state: "disconnected", faults: [],
      note: `${input.channel} is not connected, so nothing can be published to it.`,
      fix: `Connect ${input.channel} in the Integration Hub.`,
      recentFailures: failures.length, lastSuccessAt, lastFailureAt,
    };
  }

  // A success after the last failure means it was fixed. Reporting the old
  // fault anyway is how a warning becomes wallpaper.
  const clearedBySuccess = Boolean(lastSuccessAt && lastFailureAt && Date.parse(lastSuccessAt) > Date.parse(lastFailureAt));

  if (!failures.length || clearedBySuccess) {
    return {
      channel: input.channel, state: "connected", faults: [],
      note: lastSuccessAt
        ? `Connected. The last post to ${input.channel} went out on ${lastSuccessAt.slice(0, 10)}.`
        : `Connected. Nothing has been published to ${input.channel} yet, so there is nothing to report either way.`,
      recentFailures: 0, lastSuccessAt, lastFailureAt,
    };
  }

  const faults = Array.from(new Set(failures.map((f) => classifyFault(f.error || "")))) as Fault[];
  // Order the list so the most actionable fault leads.
  const ranked = FAULTS.filter((f) => faults.includes(f));
  const lead = ranked[0];

  return {
    channel: input.channel,
    // A rate limit on its own is not a fault to fix — the platform is asking us
    // to wait, scheduled work still goes out, and turning that amber teaches
    // people that amber means nothing.
    state: ranked.length === 1 && lead === "rate_limited" ? "connected" : "action_required",
    faults: ranked,
    note: `${failures.length} attempt${failures.length === 1 ? "" : "s"} to post to ${input.channel} failed in the last 7 days. Most recent: ${(failures[0].error || "no message recorded").slice(0, 160)}`,
    fix: FAULT_FIX[lead],
    recentFailures: failures.length,
    lastSuccessAt, lastFailureAt,
  };
}

/** Health for every channel a brand has, from one read of the ledger. */
export async function brandChannelHealth(
  brandId: string,
  connectedChannels: string[],
  nowMs = Date.now(),
): Promise<ChannelHealth[]> {
  const history = await listPublications(brandId, 500);
  // Channels with recorded history but no live connection still get a row —
  // a channel that silently disconnected is exactly the one worth surfacing.
  const seen = new Set<string>([...connectedChannels, ...history.map((h) => h.channel)]);
  return Array.from(seen).sort().map((channel) =>
    channelHealth({ channel, connected: connectedChannels.includes(channel), nowMs, history }));
}

export const CONNECTION_HEALTH_DOCTRINE = [
  "\"Connected\" means a row exists in a database, which is not a fact anybody cares about. Health means the last thing we tried actually worked.",
  "Every state is derived from a recorded attempt. Nothing is inferred from an age in days — a token-expiry countdown would be a fabrication dressed as a diagnosis, and wrong on every deployment whose token does not expire.",
  "A success after a failure clears it. Leaving the old warning up is how a warning becomes wallpaper.",
  "A rate limit is not a fault to fix. The platform is asking us to wait, scheduled work still goes out, and turning that amber teaches people that amber means nothing.",
  "An error that does not clearly name a token, a permission or a rate limit is reported as \"failing, and here is what it said\" — a truthful unknown beats a confident wrong diagnosis that sends somebody to reconnect an account that was never the problem.",
];
