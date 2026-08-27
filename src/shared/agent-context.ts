// WHAT THE PAGE ALREADY KNOWS, WRITTEN FOR THE AGENT BELOW IT.
//
// THE DEFECT THIS EXISTS TO CLOSE. The segmentation page rendered "88
// customers, 100% consented, 1 segment" from the live Customer Vault, and
// directly beneath it the agent answered: "Cannot generate specific segments
// without customer data. Integrate your customer database." Both on one screen.
//
// The agent was not wrong. It had been handed a business name and an industry
// and nothing else, because a form field is what the USER types and there was
// no channel for what the PAGE had already computed. Every module surface that
// does real work above an agent had the same hole — the eighteenth instance of
// this repository's oldest defect: a value on one side of a boundary that is
// never carried across.
//
// THE THREE STATES THAT MUST STAY DISTINCT, and the reason this is a file
// rather than three inline object literals:
//
//   NOT LOADED   — the fetch has not returned. The agent should say what it
//                  would need, not assume there is nothing.
//   GENUINELY EMPTY — the fetch returned and there is nothing. The agent must
//                  NOT ask for an integration; the integration is connected and
//                  the answer was zero.
//   POPULATED    — real counted numbers, and an explicit instruction to stop
//                  asking for what it has just been given.
//
// Collapsing those three into "no data" is what produced the contradiction on
// screen. They are pure functions here so a test can drive them, which the
// first version could not: a page in this framework may not export anything but
// the page, so the assertions had to grep the source, and a grep passes happily
// when the branch producing the string has been disabled.

// ---------------------------------------------------------------------------
// Audience segmentation — the Customer Vault
// ---------------------------------------------------------------------------

export type SegmentView = {
  key: string; label: string; size: number; consentedSize: number;
  revenuePotentialGbp: number; recommendedOffer: string; recommendedChannel: string;
  recommendedFollowUp: string; campaignPriority: number;
};
export type SegmentReportView = {
  business: string; totalCustomers: number; consentedShare: number;
  segments: SegmentView[]; note: string;
};

export function segmentContext(report: SegmentReportView | null): Record<string, string> {
  if (!report) {
    return {
      customerVault: "NOT READ YET — the vault has not returned for this brand. Say what you would need rather than assuming the customer base is empty.",
    };
  }
  if (report.totalCustomers === 0) {
    return {
      customerVault: "READ, AND GENUINELY EMPTY — this brand has zero contacts in its Customer Vault. Do not ask for a database integration; the integration exists and there is nothing in it. The next action is importing or capturing contacts.",
    };
  }
  const lines = report.segments.map((sg) =>
    `${sg.label}: ${sg.size} contacts (${sg.consentedSize} consented), revenue potential £${sg.revenuePotentialGbp}, priority ${sg.campaignPriority}, current plan — offer: ${sg.recommendedOffer}; channel: ${sg.recommendedChannel}; follow-up: ${sg.recommendedFollowUp}`,
  );
  return {
    customerVault: `READ FROM THE LIVE VAULT — do NOT ask for a customer database, it is already connected and these are its real numbers. ${report.totalCustomers} contacts, ${Math.round(report.consentedShare * 100)}% marketing-consented.`,
    existingSegments: lines.length
      ? `The deterministic engine already produced ${lines.length} segment${lines.length === 1 ? "" : "s"} from this data:\n${lines.join("\n")}\nYour job is to improve on these — sharpen the offers, question the channels, name what the RFM engine cannot see — NOT to re-derive them or ask for the data again.`
      : `The deterministic engine produced NO segments from these ${report.totalCustomers} contacts, which usually means no purchase history has been recorded. Say what would unlock segmentation, given the contacts exist.`,
    vaultNote: report.note,
  };
}

// ---------------------------------------------------------------------------
// Email — the sending record
// ---------------------------------------------------------------------------

export type EmailStatsView = {
  sent: number; open: number; click: number; bounce: number; complaint: number;
  unsubscribe: number; openRate: number; clickRate: number; suppressed: number;
  warmup?: { day: number; dailyCap: number; sentToday: number; remaining: number };
};

/**
 * ZERO SENDS IS NOT A BAD OPEN RATE.
 *
 * An open rate of 0% from 0 sends is not poor deliverability, it is no
 * information — and an agent handed "0%" writes a rescue plan for a domain that
 * has never sent anything. The zero case therefore reports NO rates at all
 * rather than reporting them as zero.
 */
export function emailContext(stats: EmailStatsView | null): Record<string, string> {
  if (!stats) {
    return { sendingRecord: "NOT LOADED — the sending stats have not returned. Say what you would need rather than assuming there is no history." };
  }
  if (stats.sent === 0) {
    return {
      sendingRecord: `NOTHING HAS BEEN SENT YET from this account — 0 sends, so there are NO rates. Do not read this as poor deliverability and do not write a rescue plan: there is nothing to rescue. ${
        stats.suppressed > 0 ? `${stats.suppressed} addresses are already suppressed. ` : ""
      }The task is a first-send plan and a warm-up.`,
    };
  }
  const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
  return {
    sendingRecord: [
      "THE REAL SENDING RECORD — these are counted, do not ask for them:",
      `${stats.sent} sent, ${stats.open} opens (${pct(stats.openRate)}), ${stats.click} clicks (${pct(stats.clickRate)}).`,
      `${stats.bounce} bounces, ${stats.complaint} complaints, ${stats.unsubscribe} unsubscribes, ${stats.suppressed} on the suppression list.`,
      stats.warmup
        ? `Warm-up is on day ${stats.warmup.day}: cap ${stats.warmup.dailyCap} a day, ${stats.warmup.sentToday} sent today, ${stats.warmup.remaining} remaining. Any plan must fit inside that cap.`
        : "",
    ].filter(Boolean).join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Website intelligence — the crawl that already ran
// ---------------------------------------------------------------------------

export type AuditSectionView = { area: string; overall: number | null; verdict: string; measured: number };
export type BusinessDnaView = {
  marketCategory: string; businessModel: string; revenueModel: string; valueProposition: string;
  mainConversionAction: string; competitiveAdvantages: string[];
  trustGaps: string[]; contentGaps: string[]; conversionGaps: string[];
  seoGaps: string[]; geoGaps: string[]; socialGaps: string[];
};
export type AttackMoveView = { gap: string; opportunity: number | null; priority: string };
export type AuditReportView = {
  audit: { sections: AuditSectionView[] };
  dna: BusinessDnaView;
  attack: { moves: AttackMoveView[] };
};

const GAP_KEYS = ["trustGaps", "contentGaps", "conversionGaps", "seoGaps", "geoGaps", "socialGaps"] as const;

export function auditContext(report: AuditReportView | null): Record<string, string> {
  if (!report) {
    return { siteAudit: "NOT RUN — no crawl has been performed on this page yet. Work from the URL on the form and say what a crawl would settle." };
  }
  // `not measured` is carried through rather than smoothed away. It is the one
  // verdict an agent must never read as "fine".
  const sections = (report.audit?.sections ?? [])
    .map((sec) => `${sec.area}: ${sec.verdict}${sec.overall === null ? " (nothing measurable on this page)" : ` — scored ${sec.overall} from ${sec.measured} measured checks`}`)
    .join("\n");
  const dna = report.dna;
  const moves = (report.attack?.moves ?? []).filter((m) => m.gap);
  return {
    siteAudit: `A REAL CRAWL OF THIS SITE HAS ALREADY RUN — do not ask for access or a URL, and do not speculate about what the site might contain. These are its measured findings:\n${sections || "(the crawl returned no scored sections)"}`,
    businessDna: dna
      ? [
          `Read from the site's own content: ${dna.marketCategory} / ${dna.businessModel}, revenue model ${dna.revenueModel}.`,
          `Value proposition as the site itself states it: ${dna.valueProposition}`,
          `Main conversion action on the site: ${dna.mainConversionAction}`,
          (dna.competitiveAdvantages ?? []).length ? `Advantages the site claims: ${dna.competitiveAdvantages.join("; ")}` : "",
          // THE GAPS ARE THE VALUABLE HALF — what the crawl found MISSING. An
          // agent that re-derives them wastes the crawl and finds fewer.
          ...GAP_KEYS.map((k) => ((dna[k] ?? []).length ? `${k.replace("Gaps", "")} gaps already found: ${dna[k].join("; ")}` : "")),
        ].filter(Boolean).join("\n")
      : "",
    attackMap: moves.length
      ? `The attack map already names these gaps: ${moves.map((m) => `${m.gap} (${m.priority}${m.opportunity === null ? ", unranked — nothing read shows whether it is open" : `, ${m.opportunity}`})`).join("; ")}. Improve on these rather than restating them.`
      : "",
  };
}
