// COMMENT → DM, AND THE REST OF THE ENTRY POINTS.
//
// The rule model and the matching, kept pure so the whole engine can be tested
// without Meta, without a network and without an approved app. What needs Meta's
// permission is DELIVERING the reply; deciding whether a reply is owed does not,
// and that decision is where every expensive mistake lives.
//
// THE THREE MISTAKES THIS FILE EXISTS TO PREVENT:
//
//   1. REPLYING TO YOURSELF. The brand's own comment on the brand's own post
//      arrives as a webhook exactly like a customer's. Without an explicit check
//      the first automation any agency writes DMs itself in a loop, in public.
//   2. DMing THE SAME PERSON REPEATEDLY. Somebody who comments "price" on four
//      posts is one interested human, not four leads. Instagram treats repeat
//      unsolicited DMs as spam and the account pays for it, not the software.
//   3. MATCHING A SUBSTRING. A keyword rule for "price" that fires on
//      "priceless" or "surprise" sends confident nonsense to a stranger. Matching
//      is on WORD BOUNDARIES, always.
//
// A trigger that is not certain does not fire. The cost of a missed DM is one
// lead; the cost of a wrong DM is the account.

export const TRIGGER_EVENTS = [
  "comment",        // a comment on a post or reel
  "dm",             // an incoming direct message
  "story_reply",    // a reply to one of the brand's stories
  "mention",        // the brand mentioned in somebody's story
  "follow",         // a new follower
  "live_comment",   // a comment during a live
] as const;
export type TriggerEvent = (typeof TRIGGER_EVENTS)[number];

export type TriggerRule = {
  id: string;
  brandId: string;
  event: TriggerEvent;
  /**
   * Words that must appear. Empty means "any event of this kind" — deliberately
   * allowed, because follow and story_reply have nothing to match on.
   */
  keywords: string[];
  /** Only fire on this post/media id. Empty means any. */
  mediaId?: string;
  enabled: boolean;
  /**
   * Hours before the same person can trigger this rule again. Defaults to a day.
   * Zero is NOT permitted — see `cooldownHours`.
   */
  cooldownHours?: number;
};

/** One inbound thing that happened, normalised away from Meta's payload shapes. */
export type SocialEvent = {
  /** Which brand's connected account this arrived on. */
  brandId: string;
  event: TriggerEvent;
  /** The platform's id for the person who did it. */
  fromUserId: string;
  /** The platform's id for the account that received it — the brand's own. */
  recipientId: string;
  /** Comment or message text. Absent for a follow. */
  text?: string;
  mediaId?: string;
  /** The platform's id for this event, used to reject redeliveries. */
  eventId: string;
  atISO: string;
};

/** The default, and the floor. A zero cooldown is a spam machine. */
export const DEFAULT_COOLDOWN_HOURS = 24;
export const MIN_COOLDOWN_HOURS = 1;

export function cooldownHours(rule: TriggerRule): number {
  const raw = rule.cooldownHours;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_COOLDOWN_HOURS;
  return Math.max(MIN_COOLDOWN_HOURS, raw);
}

/**
 * Word-boundary, case-insensitive, punctuation-tolerant keyword matching.
 *
 * "PRICE?" and "price!" match; "priceless" and "surprise" do not. Accents are
 * folded so "café" matches "cafe", because a customer typing on a phone keyboard
 * should not lose their reply to a diacritic.
 */
export function matchesKeyword(text: string, keyword: string): boolean {
  const norm = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const hay = norm(text || "");
  const needle = norm(keyword || "").trim();
  if (!needle) return false;
  // Split the haystack into words rather than building a regex from user input —
  // a keyword containing regex metacharacters would otherwise be a live pattern.
  const words = hay.split(/[^a-z0-9']+/).filter(Boolean);
  const needleWords = needle.split(/[^a-z0-9']+/).filter(Boolean);
  if (!needleWords.length) return false;
  // A multi-word keyword must appear as a consecutive run.
  for (let i = 0; i + needleWords.length <= words.length; i++) {
    let all = true;
    for (let j = 0; j < needleWords.length; j++) {
      if (words[i + j] !== needleWords[j]) { all = false; break; }
    }
    if (all) return true;
  }
  return false;
}

export type MatchRefusal = {
  fired: false;
  /** Said plainly, because these are read in an activity log by a human. */
  reason: string;
};
export type MatchHit = { fired: true; rule: TriggerRule };
export type MatchResult = MatchHit | MatchRefusal;

/**
 * What, if anything, this event should trigger.
 *
 * `recentlyTriggered` answers "has this rule already fired for this person
 * inside its cooldown?" — the caller owns the store, this owns the decision.
 */
export function matchTrigger(
  event: SocialEvent,
  rules: TriggerRule[],
  recentlyTriggered: (ruleId: string, userId: string) => boolean,
): MatchResult {
  // THE SELF-REPLY GUARD, FIRST. The brand commenting on its own post arrives
  // here identical to a customer, and an automation that answers itself does it
  // in public, repeatedly, under its own name.
  if (event.fromUserId && event.fromUserId === event.recipientId) {
    return { fired: false, reason: "The account's own activity — never replied to." };
  }
  if (!event.fromUserId) {
    return { fired: false, reason: "No sender on the event, so there is nobody to reply to." };
  }

  const candidates = rules.filter(
    (r) => r.enabled && r.brandId === event.brandId && r.event === event.event,
  );
  if (!candidates.length) return { fired: false, reason: "No enabled rule for this kind of event." };

  for (const rule of candidates) {
    if (rule.mediaId && rule.mediaId !== event.mediaId) continue;
    if (rule.keywords.length) {
      const text = event.text || "";
      if (!text.trim()) continue;
      if (!rule.keywords.some((k) => matchesKeyword(text, k))) continue;
    }
    // Matched on content — now the human-cost check.
    if (recentlyTriggered(rule.id, event.fromUserId)) {
      return {
        fired: false,
        reason: `Already messaged this person for "${rule.id}" within ${cooldownHours(rule)}h. One interested person is one lead, not four.`,
      };
    }
    return { fired: true, rule };
  }
  return { fired: false, reason: "Nothing matched — no keyword in this text, or the post did not match." };
}
