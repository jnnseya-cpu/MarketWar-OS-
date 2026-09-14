// WHAT GOOGLE THINKS OF THE SENDING DOMAIN — over real volume, or not at all.
//
// THE OTHER HALF OF PLACEMENT. §140 measures where ONE message landed in
// mailboxes we own. That is a sample of receivers and it has no history: a seed
// mailbox has never opened anything from this domain, so it measures how Gmail
// treats a stranger. Postmaster Tools measures the opposite and larger thing —
// what Gmail thinks of the DOMAIN across everything it actually delivered, to
// real people, who did real things with it.
//
// THE RULE THAT DECIDES WHETHER ANY OF IT IS WORTH READING.
//
// **Postmaster reports nothing until a domain sends enough.** Google's own
// threshold is a few hundred authenticated messages a day, and below it the API
// returns no data at all — not zeros, no rows. A platform that renders that as
// "0% spam, reputation LOW" would be inventing the most alarming reading
// available out of an empty response, which is exactly the defect the placement
// report already had once and was fixed for.
//
// So an absence is reported as an ABSENCE, with the reason and the volume it
// would take to end it. This platform has sent one message to a prospect; a
// Postmaster dashboard is months away, and saying so is more useful than a page
// of dashes.
//
// Pure, and in `shared/`, so the client, the surface and the tests read one
// definition of what "bad reputation" means.

/** Google's own reputation ladder, worst to best. */
export type Reputation = "BAD" | "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";

export const REPUTATION_ORDER: Reputation[] = ["BAD", "LOW", "MEDIUM", "HIGH"];

/** One day, as Postmaster reports it. Every figure may legitimately be absent. */
export type PostmasterDay = {
  /** YYYY-MM-DD. */
  date: string;
  domainReputation: Reputation;
  ipReputations: { reputation: Reputation; ipCount: number }[];
  /** 0–1. NULL when Google did not report it, which is not the same as zero. */
  spamRatePct: number | null;
  dkimSuccessPct: number | null;
  spfSuccessPct: number | null;
  dmarcSuccessPct: number | null;
  /** Share of traffic over TLS. Low is a real finding; absent is not. */
  tlsInboundPct: number | null;
};

export type PostmasterVerdict = {
  domain: string;
  days: PostmasterDay[];
  /** The most recent day that actually carried figures, or null. */
  latest: PostmasterDay | null;
  /** TRUE when Google returned nothing — below the reporting threshold, or brand new. */
  belowThreshold: boolean;
  verdict: string;
  /** Most valuable first. Empty when there is nothing that needs doing. */
  advice: string[];
  /** Anything that should stop a campaign going out today. */
  blockers: string[];
};

const asPct = (v: unknown): number | null => {
  // Postmaster gives ratios (0.001 = 0.1%). A missing field and a zero are
  // different facts and must not collapse into the same number.
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.round(v * 100 * 10) / 10; // ratio → percent, one decimal: 0.001 → 0.1
};

const rep = (v: unknown): Reputation => {
  const s = String(v || "").toUpperCase();
  return (["BAD", "LOW", "MEDIUM", "HIGH"] as string[]).includes(s) ? s as Reputation : "UNKNOWN";
};

/** Normalise one `trafficStats` row. Unknown shapes become absences, never zeros. */
export function readTrafficStats(row: Record<string, unknown>): PostmasterDay {
  // The resource name carries the date: domains/{domain}/trafficStats/YYYYMMDD
  const name = String(row.name || "");
  const raw = /trafficStats\/(\d{4})(\d{2})(\d{2})$/.exec(name);
  const ips = Array.isArray(row.ipReputations) ? row.ipReputations as Record<string, unknown>[] : [];
  return {
    date: raw ? `${raw[1]}-${raw[2]}-${raw[3]}` : "",
    domainReputation: rep(row.domainReputation),
    ipReputations: ips.map((i) => ({ reputation: rep(i.reputation), ipCount: Number(i.ipCount) || 0 })),
    spamRatePct: asPct(row.userReportedSpamRatio),
    dkimSuccessPct: asPct(row.dkimSuccessRatio),
    spfSuccessPct: asPct(row.spfSuccessRatio),
    dmarcSuccessPct: asPct(row.dmarcSuccessRatio),
    tlsInboundPct: asPct(row.inboundEncryptionRatio),
  };
}

/**
 * Google's bulk-sender rule: keep user-reported spam below 0.10%, and treat
 * 0.30% as the point where mail starts being rejected outright. These are the
 * published thresholds, not an opinion about them.
 */
export const SPAM_WARN_PCT = 0.1;
export const SPAM_HALT_PCT = 0.3;

export function postmasterVerdict(domain: string, days: PostmasterDay[]): PostmasterVerdict {
  const sorted = [...days].filter((d) => d.date).sort((a, b) => a.date.localeCompare(b.date));
  // "Latest" means the latest day with SOMETHING in it. A run of empty days at
  // the end is common and reading the last one would report an absence as the
  // current state.
  const latest = [...sorted].reverse().find((d) =>
    d.domainReputation !== "UNKNOWN" || d.spamRatePct !== null || d.dkimSuccessPct !== null) ?? null;
  const belowThreshold = !latest;

  const advice: string[] = [];
  const blockers: string[] = [];

  if (belowThreshold) {
    return {
      domain, days: sorted, latest: null, belowThreshold: true,
      verdict: `Google has no data for ${domain}. That is not a bad score — it is no score: Postmaster Tools reports `
        + `nothing until a domain sends a few hundred authenticated messages a day, and stays quiet below that.`,
      advice: [
        "Nothing here will change until real volume goes out. Until then the answer to 'where does our mail land' "
        + "comes from the seed probe (docs/INBOX-PLACEMENT.md), which works at any volume because we own the mailboxes.",
      ],
      blockers: [],
    };
  }

  if (latest.spamRatePct !== null) {
    if (latest.spamRatePct >= SPAM_HALT_PCT) {
      blockers.push(
        `${latest.spamRatePct}% of recipients marked this domain as spam on ${latest.date}. Google's threshold for `
        + `rejecting mail outright is ${SPAM_HALT_PCT}%. Stop sending campaigns from this domain until it comes down — `
        + `every further send makes it worse and the recovery is measured in weeks.`,
      );
    } else if (latest.spamRatePct >= SPAM_WARN_PCT) {
      advice.push(
        `${latest.spamRatePct}% spam complaints on ${latest.date}, against Google's ${SPAM_WARN_PCT}% limit. `
        + `That is the list, not the message: send to people who asked recently, and cut anyone who has not opened in months.`,
      );
    }
  }

  if (latest.domainReputation === "BAD" || latest.domainReputation === "LOW") {
    (latest.domainReputation === "BAD" ? blockers : advice).push(
      `Google rates this domain's reputation ${latest.domainReputation} on ${latest.date}. `
      + `Reputation follows complaints and engagement; it recovers by sending less, to better addresses, consistently.`,
    );
  }

  // AUTHENTICATION IS THE ONE THING THAT IS ENTIRELY OURS TO FIX.
  for (const [label, pctValue, fix] of [
    ["DKIM", latest.dkimSuccessPct, "Check the per-brand selector is published and the key matches (Sending Domains)."],
    ["SPF", latest.spfSuccessPct, "The From domain and the authenticated account must line up — MW_SENDING_POOL with a node per domain."],
    ["DMARC", latest.dmarcSuccessPct, "Alignment, not just presence: DMARC passes only when SPF or DKIM aligns with the From domain."],
  ] as const) {
    if (pctValue !== null && pctValue < 95) {
      advice.push(`${label} passed on only ${pctValue}% of mail on ${latest.date}. ${fix}`);
    }
  }

  if (latest.tlsInboundPct !== null && latest.tlsInboundPct < 90) {
    advice.push(`Only ${latest.tlsInboundPct}% of mail to Gmail used TLS on ${latest.date}. That is a relay setting, not a content one.`);
  }

  const worstIp = latest.ipReputations
    .filter((i) => i.reputation === "BAD" || i.reputation === "LOW")
    .sort((a, b) => b.ipCount - a.ipCount)[0];
  if (worstIp) {
    advice.push(
      `${worstIp.ipCount} sending IP(s) rated ${worstIp.reputation}. On a shared relay that is somebody else's traffic; `
      + `on our own nodes it is ours, and the fix is the warm-up ramp rather than more volume.`,
    );
  }

  return {
    domain, days: sorted, latest, belowThreshold: false,
    verdict: blockers.length
      ? `${domain} is in trouble at Gmail as of ${latest.date}: ${blockers.length} thing(s) should stop a send today.`
      : advice.length
        ? `${domain} is delivering, with ${advice.length} thing(s) worth fixing as of ${latest.date}.`
        : `${domain} is healthy at Gmail as of ${latest.date}: reputation ${latest.domainReputation}`
          + (latest.spamRatePct !== null ? `, ${latest.spamRatePct}% complaints` : "") + ".",
    advice, blockers,
  };
}
