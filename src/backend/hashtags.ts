// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Hashtags, taken from the post rather than from the air.
//
// THE THING THIS REFUSES TO DO. Every hashtag tool on the market prints a
// number next to each tag — "#summertravel · 2.4M posts · reach 180K". Nobody
// selling that tool has access to those figures for the account using it, and
// the reach number in particular is a projection dressed as a measurement. This
// engine prints no volume, no reach and no difficulty score, because it cannot
// count any of them. What it can do is honest and more useful than a fabricated
// number: pull the tags out of the words the customer actually wrote, add the
// ones their brand and their market justify, and enforce what each platform
// really does with them.
//
// THE PLATFORM RULES ARE THE PRODUCT. "Depending on the platform" is not a
// nicety: thirty tags is normal on Instagram and looks like spam on LinkedIn,
// and on X every tag eats characters from a hard limit. A generator that emits
// one list for all of them is wrong four times out of five. Caps documented by
// the platform are marked as limits; the smaller numbers people actually use are
// marked as convention, because that is what they are.

import { GENERIC_PROFILE, INDUSTRY_PROFILES } from "@/shared/industry";

export type Platform = "instagram" | "tiktok" | "x" | "linkedin" | "facebook" | "youtube" | "threads" | "pinterest";

export type PlatformRule = {
  platform: Platform;
  /** The platform's own documented ceiling, where it publishes one. */
  hardCap: number | null;
  /** What actually performs there. Convention, and labelled as such. */
  suggested: number;
  note: string;
};

export const PLATFORM_RULES: PlatformRule[] = [
  { platform: "instagram", hardCap: 30, suggested: 5, note: "Instagram allows 30 per post and says 3–5 relevant ones do more than a wall of them. The wall is also the oldest spam signal on the platform." },
  { platform: "tiktok", hardCap: null, suggested: 4, note: "Hashtags share the caption's character budget, so every extra tag costs you a word of the hook that makes someone stay." },
  { platform: "x", hardCap: null, suggested: 2, note: "Every tag spends characters from a hard post limit. One or two that a real conversation is happening under; never a row of them." },
  { platform: "linkedin", hardCap: null, suggested: 3, note: "Three is the working convention. LinkedIn surfaces posts by topic, and a long tag list reads as a broadcast rather than a person talking." },
  { platform: "facebook", hardCap: null, suggested: 2, note: "Hashtags do very little on Facebook. Use one or two for a campaign you want to be able to search for later, not for reach." },
  { platform: "youtube", hardCap: 15, suggested: 3, note: "YouTube ignores everything past 15 tags on a video, and only the first three appear above the title." },
  { platform: "threads", hardCap: 1, suggested: 1, note: "Threads attaches one topic tag per post — the rest of your list will simply not be applied." },
  { platform: "pinterest", hardCap: 20, suggested: 6, note: "Pinterest treats tags as search terms on the description, so plain descriptive words matter more here than clever ones." },
];

export const ruleFor = (p: Platform): PlatformRule =>
  PLATFORM_RULES.find((r) => r.platform === p) ?? PLATFORM_RULES[0];

export type TagKind = "from-post" | "brand" | "industry" | "place" | "campaign";

export type Hashtag = {
  tag: string;              // "#boilerrepair"
  kind: TagKind;
  /** Where this came from — every tag can be traced to something real. */
  because: string;
};

export type HashtagSet = {
  platform: Platform;
  rule: PlatformRule;
  /** What to actually paste, already cut to the platform's suggested count. */
  use: Hashtag[];
  /** The rest, in case the customer wants a wider net. Never auto-included. */
  alsoConsidered: Hashtag[];
  warnings: string[];
  note: string;
};

// Words that are never a useful tag on their own.
const STOP = new Set([
  "the", "and", "for", "you", "your", "with", "that", "this", "from", "have", "has", "are", "was", "were",
  "not", "but", "how", "why", "what", "when", "who", "will", "can", "get", "got", "its", "our", "out",
  "into", "about", "than", "then", "them", "they", "their", "there", "here", "more", "most", "less", "just",
  "one", "two", "all", "any", "own", "new", "now", "off", "per", "via", "use", "used", "using", "today",
  "very", "really", "make", "made", "want", "need", "like", "know", "time", "day", "week", "still", "back",
]);

// Tags that buy engagement from people who will never buy anything. They are
// also the clearest signal to a platform's own spam classifier that an account
// is gaming reach, which is the opposite of what a customer is paying for.
const ENGAGEMENT_BAIT = [
  "follow4follow", "followforfollow", "f4f", "like4like", "likeforlike", "l4l", "spam4spam",
  "followme", "followback", "tagsforlikes", "likesforlikes", "instafollow", "teamfollowback",
  "commentforcomment", "sub4sub", "viral", "fyp", "foryou", "foryoupage", "explorepage", "trending",
];

const slug = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");

const words = (s: string): string[] =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).filter(Boolean);

/** Two words that sit next to each other more than once are the post's subject. */
function repeatedPhrases(text: string): string[] {
  const w = words(text).filter((x) => x.length > 2 && !STOP.has(x));
  const counts = new Map<string, number>();
  for (let i = 0; i < w.length - 1; i++) {
    const pair = `${w[i]} ${w[i + 1]}`;
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).map(([p]) => p);
}

function frequentWords(text: string, limit: number): { word: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const w of words(text)) {
    if (w.length < 4 || STOP.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([word, n]) => ({ word, n }))
    .sort((a, b) => b.n - a.n || a.word.localeCompare(b.word))
    .slice(0, limit);
}

export type HashtagInput = {
  /** The post itself. Without it there is nothing to be relevant to. */
  text: string;
  platform: Platform;
  brandName?: string;
  /** The brand's industry, in their words — matched to a profile. */
  industry?: string;
  /** Cities and countries they actually sell to. */
  places?: string[];
  /** A campaign tag they already use, kept as theirs. */
  campaign?: string;
};

/**
 * Build the tag set.
 *
 * Candidates are gathered in order of how defensible they are — the words the
 * customer actually wrote, then their own brand and campaign, then the
 * industry's vocabulary, then the places they sell in — and every one carries
 * the reason it is there. The cut to the platform's count then interleaves them
 * (see below) so a short list is still a mix rather than five words lifted off
 * the top of the caption.
 */
export function hashtagsFor(input: HashtagInput): HashtagSet {
  const platform = input.platform;
  const rule = ruleFor(platform);
  const text = String(input.text ?? "");
  const warnings: string[] = [];
  const out: Hashtag[] = [];
  const seen = new Set<string>();

  const add = (raw: string, kind: TagKind, because: string) => {
    const s = slug(raw);
    if (!s || s.length < 3 || s.length > 30) return;
    if (seen.has(s)) return;
    seen.add(s);
    out.push({ tag: `#${s}`, kind, because });
  };

  // 1. The post's own subject. A phrase said twice is what the post is about.
  for (const phrase of repeatedPhrases(text).slice(0, 4)) {
    add(phrase, "from-post", `"${phrase}" appears more than once in the post — it is what this is about`);
  }
  for (const { word, n } of frequentWords(text, 8)) {
    add(word, "from-post", n > 1 ? `"${word}" is used ${n} times in the post` : `"${word}" is in the post`);
  }

  // 2. Theirs: the brand, and any campaign tag they already run.
  if (input.campaign) add(input.campaign, "campaign", "your own campaign tag — this is the one that lets you find the posts again later");
  if (input.brandName) add(input.brandName, "brand", "your brand name, so a mention is findable and yours to own");

  // 3. The industry's vocabulary, from the profile that matched their words.
  const profile = matchIndustry(input.industry);
  for (const c of profile.categories) add(c, "industry", `a ${profile.label.toLowerCase()} topic people search under`);

  // 4. Where they sell. A local tag is small and that is the point — a plumber
  //    in Croydon does not want the whole of #plumbing.
  for (const place of (input.places ?? []).slice(0, 4)) {
    add(place, "place", "somewhere you actually sell — a smaller tag reaches fewer people and more customers");
    if (profile.key !== "generic" && input.industry) {
      add(`${input.industry} ${place}`, "place", `the combination people actually search: ${input.industry} in ${place}`);
    }
  }

  // --- what the customer is warned about ---------------------------------
  const bait = out.filter((h) => ENGAGEMENT_BAIT.includes(h.tag.slice(1)));
  if (bait.length) {
    warnings.push(`${bait.map((b) => b.tag).join(", ")} buys engagement from people who will never buy anything, and tells the platform's own spam classifier that this account is gaming reach. Removed.`);
  }
  const kept = out.filter((h) => !ENGAGEMENT_BAIT.includes(h.tag.slice(1)));

  if (!text.trim()) {
    warnings.push("There is no post text, so nothing here came from what you are actually saying — these are brand, industry and place tags only. Paste the post and the list gets specific.");
  }
  if (rule.hardCap && kept.length > rule.hardCap) {
    warnings.push(`${platform} applies at most ${rule.hardCap} — anything past that is simply ignored.`);
  }

  // WHAT SURVIVES THE CUT. Taking the first N in build order would fill an
  // Instagram set with five words lifted from the caption and never reach the
  // town the business actually serves — and for a local trade the town is the
  // tag that brings a customer rather than an audience. So the cut interleaves:
  // the post's own subject first, then the place, then the campaign and brand,
  // then back to the post. A one-tag platform still gets the subject.
  const byKind = (k: TagKind) => kept.filter((h) => h.kind === k);
  const fromPost = byKind("from-post");
  const order = [
    ...fromPost.slice(0, 2),
    ...byKind("place").slice(0, 1),
    ...byKind("campaign"),
    ...byKind("brand"),
    ...fromPost.slice(2),
    ...byKind("place").slice(1),
    ...byKind("industry"),
  ];
  const ordered = [...order, ...kept.filter((h) => !order.includes(h))];

  const use = ordered.slice(0, Math.min(rule.suggested, rule.hardCap ?? rule.suggested));
  const alsoConsidered = ordered.filter((h) => !use.includes(h));

  return {
    platform,
    rule,
    use,
    alsoConsidered,
    warnings,
    note: `${use.length} tag(s) for ${platform}. ${rule.note} No volume or reach figures are shown here: nobody selling a hashtag tool can measure either for your account, and a number that cannot be measured is a number that was invented.`,
  };
}

function matchIndustry(industry?: string) {
  const q = String(industry ?? "").toLowerCase();
  if (!q) return GENERIC_PROFILE;
  return INDUSTRY_PROFILES.find((p) => p.match.some((m) => q.includes(m))) ?? GENERIC_PROFILE;
}

/** The same post, tagged for several platforms at once. */
export function hashtagsForAll(input: Omit<HashtagInput, "platform">, platforms: Platform[] = ["instagram", "tiktok", "linkedin", "x"]): HashtagSet[] {
  return platforms.map((platform) => hashtagsFor({ ...input, platform }));
}
