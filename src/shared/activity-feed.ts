// WHAT DID IT DO WHILE I WASN'T LOOKING? (§70)
//
// `audit-log.ts` records everything, and it is a FORENSIC record: dotted verbs,
// before-and-after values, redacted fields. That is the right shape for an
// investigation and the wrong shape for the question a customer actually asks,
// which is "the platform ran overnight — what happened?".
//
// This turns those entries into a feed. It is pure, so it can render anywhere
// and be tested without a database, and it takes the entries rather than
// fetching them — the audit log stays the one place that owns them.
//
// THREE DECISIONS WORTH DEFENDING.
//
//   1. UNATTENDED WORK IS SEPARATED FROM YOUR OWN. "What did the AI do" and
//      "what did I do" are different questions and mixing them answers neither.
//      An agent or the scheduler acting alone is the column people actually
//      came to read.
//   2. AN UNKNOWN ACTION IS SHOWN, NOT HIDDEN. A feed that silently drops the
//      events it has no phrasing for is a feed that hides the one thing that
//      went wrong last night. Anything unmapped is rendered plainly from its own
//      verb rather than omitted.
//   3. RUNS ARE GROUPED, COUNTS ARE REAL. Four publishes become "published 4
//      posts" — a count of four things that happened, never a rounded or
//      estimated figure, and never grouped across different days.

export type FeedActorType = "user" | "agent" | "system";

/** The subset of an audit entry a feed needs. Structurally the audit log's own. */
export type FeedSource = {
  id: string;
  at: string;
  actorType: FeedActorType;
  actor: string;
  action: string;
  resource: string;
  resourceId?: string;
  brandId?: string;
  reason?: string;
};

export type FeedEntry = {
  ids: string[];
  at: string;
  actorType: FeedActorType;
  actor: string;
  action: string;
  /** How many identical actions were folded into this line. Always a real count. */
  count: number;
  /** Plain English. Never invented detail — only what the entry carried. */
  text: string;
  /** True when nobody asked for it at that moment. */
  unattended: boolean;
  reason?: string;
  /** False when the verb had no phrasing and the line was built from the verb itself. */
  recognised: boolean;
};

// Verb → how to say it. `{n}` is the real count.
const PHRASES: Record<string, { one: string; many: string }> = {
  "campaign.created": { one: "Created a campaign", many: "Created {n} campaigns" },
  "campaign.launched": { one: "Launched a campaign", many: "Launched {n} campaigns" },
  "content.generated": { one: "Wrote a piece of content", many: "Wrote {n} pieces of content" },
  "content.regenerated": { one: "Rewrote a piece of content", many: "Rewrote {n} pieces of content" },
  "publication.claimed": { one: "Published a post", many: "Published {n} posts" },
  "publication.failed": { one: "A publish failed", many: "{n} publishes failed" },
  "email.sent": { one: "Sent an email", many: "Sent {n} emails" },
  "budget.updated": { one: "Changed a budget", many: "Changed {n} budgets" },
  "creative.paused": { one: "Paused a worn-out creative", many: "Paused {n} worn-out creatives" },
  "approval.requested": { one: "Sent something for approval", many: "Sent {n} things for approval" },
  "portal.approve": { one: "A client approved something", many: "A client approved {n} things" },
  "portal.request_changes": { one: "A client asked for a change", many: "A client asked for {n} changes" },
  "portal.reject": { one: "A client rejected something", many: "A client rejected {n} things" },
  "portal_link.revoked": { one: "Withdrew an approval link", many: "Withdrew {n} approval links" },
  "agent.run": { one: "Ran an agent", many: "Ran {n} agents" },
  "emergency_stop.engaged": { one: "The emergency stop was engaged", many: "The emergency stop was engaged {n} times" },
  "emergency_stop.released": { one: "The emergency stop was released", many: "The emergency stop was released {n} times" },
};

/** Same verb, same actor, same DAY. Never grouped across days — that would hide when it happened. */
const groupKey = (e: FeedSource) => `${e.at.slice(0, 10)}|${e.actorType}|${e.actor}|${e.action}`;

function phraseFor(action: string, count: number): { text: string; recognised: boolean } {
  const p = PHRASES[action];
  if (p) return { text: count === 1 ? p.one : p.many.replace("{n}", String(count)), recognised: true };
  // NOT DROPPED. The verb is shown as it is, so an unmapped event is visible
  // rather than silently absent — the unmapped one is often the interesting one.
  const readable = action.replace(/[._]/g, " ");
  return { text: count === 1 ? `Did: ${readable}` : `Did: ${readable} (${count} times)`, recognised: false };
}

export type Feed = {
  unattended: FeedEntry[];
  yours: FeedEntry[];
  headline: string;
  /** Verbs with no phrasing, so the gap is visible rather than guessed at. */
  unmappedActions: string[];
};

export function buildFeed(entries: FeedSource[], opts: { limit?: number } = {}): Feed {
  const limit = opts.limit ?? 50;

  // Newest first, then folded. Sorting before grouping keeps a group's `at` the
  // most recent moment it happened rather than whichever one arrived first.
  const sorted = [...entries].sort((a, b) => b.at.localeCompare(a.at));

  const groups = new Map<string, FeedSource[]>();
  for (const e of sorted) {
    const k = groupKey(e);
    const g = groups.get(k);
    if (g) g.push(e);
    else groups.set(k, [e]);
  }

  const built: FeedEntry[] = [];
  for (const g of groups.values()) {
    const first = g[0];
    const { text, recognised } = phraseFor(first.action, g.length);
    built.push({
      ids: g.map((e) => e.id),
      at: first.at,
      actorType: first.actorType,
      actor: first.actor,
      action: first.action,
      count: g.length,
      text,
      unattended: first.actorType !== "user",
      // A reason is carried only when exactly one entry had one — a reason
      // attached to a fold of four would be describing the wrong thing.
      reason: g.length === 1 ? first.reason : undefined,
      recognised,
    });
  }

  built.sort((a, b) => b.at.localeCompare(a.at));
  const unattended = built.filter((e) => e.unattended).slice(0, limit);
  const yours = built.filter((e) => !e.unattended).slice(0, limit);

  const unmappedActions = [...new Set(built.filter((e) => !e.recognised).map((e) => e.action))];

  const acted = unattended.reduce((n, e) => n + e.count, 0);
  const headline = entries.length === 0
    ? "Nothing has happened yet."
    : acted === 0
      ? "Nothing ran on its own — everything here was done by somebody."
      : `${acted} thing${acted === 1 ? "" : "s"} happened without anyone asking. ${unattended[0].text} was the most recent.`;

  return { unattended, yours, headline, unmappedActions };
}

export const FEED_DOCTRINE = [
  "Unattended work is separated from your own. 'What did the AI do' and 'what did I do' are different questions, and mixing them answers neither.",
  "An action with no phrasing is SHOWN from its own verb, never dropped. A feed that hides what it does not understand hides the thing that went wrong last night.",
  "Runs are grouped and the count is real — four publishes is four things that happened, never a rounded figure, and never grouped across days.",
  "A reason is carried only when a single entry had one. A reason attached to a fold of four would be describing the wrong thing.",
  "The audit log owns the entries. This takes them and renders them; it never fetches or stores.",
];
