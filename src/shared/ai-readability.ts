// CAN AN AI ASSISTANT READ THIS PAGE AT ALL?
//
// THE QUESTION, AND WHY IT IS A DIFFERENT ONE FROM SEO. When somebody asks an
// assistant "who does bathroom fitting in Coventry", the answer is assembled from
// pages the assistant's crawler was allowed to fetch and could actually read. A
// site can rank perfectly in Google and be invisible there, for three reasons
// that have nothing to do with search ranking:
//
//   1. robots.txt blocks the AI crawlers by name. Very often this was never a
//      decision — it arrived in a template, or somebody pasted a "block AI
//      scrapers" snippet from a forum without connecting it to "and therefore we
//      cannot be recommended".
//   2. The page arrives empty and fills in with JavaScript. Google renders; most
//      assistant crawlers take the HTML as it comes.
//   3. There is no structured data, so what the page is ABOUT has to be inferred
//      from prose rather than read from a machine-readable statement.
//
// WHAT THIS DELIBERATELY DOES NOT CLAIM. It does not say whether anybody is
// being cited, or for which questions, or how often. That needs asking the
// assistants, which costs real AI calls and belongs to the paid engines. Saying
// "you are invisible to AI search" from a robots.txt read would be exactly the
// fabricated claim this platform refuses to print.
//
// It answers the narrow, measurable question — CAN they read it — and says so in
// those words. That is a real finding from a fetch we already made, rather than
// a teaser for something the free audit did not do.
//
// Pure and separate from the crawler, so every rule below is tested against real
// robots.txt bodies without a network.

/**
 * The crawlers that actually feed assistant answers, by the token they honour in
 * robots.txt.
 *
 * `Google-Extended` is the odd one and the one most often blocked by accident:
 * it does NOT affect Google Search ranking at all — it controls only whether the
 * page may be used in Gemini and AI Overviews. Sites block it believing they are
 * protecting their search position, and the effect is the opposite of intended.
 */
export const AI_CRAWLERS = [
  { token: "gptbot", name: "GPTBot", feeds: "ChatGPT" },
  { token: "oai-searchbot", name: "OAI-SearchBot", feeds: "ChatGPT search" },
  { token: "chatgpt-user", name: "ChatGPT-User", feeds: "ChatGPT browsing" },
  { token: "claudebot", name: "ClaudeBot", feeds: "Claude" },
  { token: "claude-web", name: "Claude-Web", feeds: "Claude browsing" },
  { token: "perplexitybot", name: "PerplexityBot", feeds: "Perplexity" },
  { token: "google-extended", name: "Google-Extended", feeds: "Gemini and AI Overviews" },
  { token: "applebot-extended", name: "Applebot-Extended", feeds: "Apple Intelligence" },
  { token: "bingbot", name: "Bingbot", feeds: "Copilot" },
  { token: "ccbot", name: "CCBot", feeds: "Common Crawl, which many models train on" },
] as const;

export type BlockedCrawler = { name: string; feeds: string };

/**
 * Which named AI crawlers this robots.txt refuses.
 *
 * ROBOTS.TXT IS PARSED, NOT PATTERN-MATCHED. A `Disallow:` line belongs to the
 * `User-agent` group above it, and a naive search for "gptbot" plus "disallow"
 * anywhere in the file reports a block on a file that only mentions GPTBot to
 * ALLOW it. That is a false accusation in a report the platform is sold on, and
 * this codebase has already shipped one of those.
 *
 * Only a root disallow (`Disallow: /`) counts. A site that keeps GPTBot out of
 * `/admin` has made a sensible decision, not an accident, and reporting it as
 * "invisible to AI search" would be wrong.
 */
export function blockedAiCrawlers(robotsBody: string): BlockedCrawler[] {
  if (!robotsBody.trim()) return [];

  // Group the file: a run of User-agent lines, then the rules that apply to all
  // of them. A blank line ends a group.
  const groups: { agents: string[]; disallowAll: boolean }[] = [];
  let agents: string[] = [];
  let disallowAll = false;
  let readingAgents = false;

  const flush = () => {
    if (agents.length) groups.push({ agents, disallowAll });
    agents = [];
    disallowAll = false;
  };

  for (const raw of robotsBody.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) { flush(); readingAgents = false; continue; }
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === "user-agent") {
      // A new agent block after rules have started is a NEW group.
      if (!readingAgents && agents.length) flush();
      agents.push(value.toLowerCase());
      readingAgents = true;
      continue;
    }
    readingAgents = false;
    // Only a root disallow shuts a crawler out of the site. `Disallow:` with an
    // empty value is the explicit "allow everything", and must never read as a block.
    if (field === "disallow" && (value === "/" || value === "/*")) disallowAll = true;
  }
  flush();

  const blocked: BlockedCrawler[] = [];
  for (const crawler of AI_CRAWLERS) {
    // The LAST group naming this agent wins, which is how a file that blocks
    // everything and then re-allows one crawler is read correctly.
    const mine = groups.filter((g) => g.agents.includes(crawler.token));
    const wildcard = groups.filter((g) => g.agents.includes("*"));
    const applicable = mine.length ? mine : wildcard;
    if (applicable.length && applicable[applicable.length - 1].disallowAll) {
      blocked.push({ name: crawler.name, feeds: crawler.feeds });
    }
  }
  return blocked;
}

export type AiReadability = {
  /** True only when nothing stops an assistant reading and understanding the page. */
  readable: boolean;
  blocked: BlockedCrawler[];
  /** The page's own text arrived in the HTML rather than needing scripts to run. */
  textInHtml: boolean;
  /** A machine-readable statement of what this page is. */
  hasStructuredData: boolean;
  /** One sentence, in the terms of what to do about it. */
  detail: string;
};

/**
 * The verdict, from three signals the crawl already has.
 *
 * ORDERED BY HOW BADLY EACH ONE HURTS. A blocked crawler is absolute — nothing
 * else matters if the fetch never happens. Empty HTML is next. Missing structured
 * data is a handicap rather than a wall, so it warns rather than fails.
 */
export function aiReadability(input: {
  robotsBody: string;
  wordCount: number;
  hasStructuredData: boolean;
}): AiReadability {
  const blocked = blockedAiCrawlers(input.robotsBody);
  // The same threshold the crawler uses for "the page arrived essentially empty".
  const textInHtml = input.wordCount >= 100;

  if (blocked.length) {
    const names = blocked.map((b) => b.name).join(", ");
    return {
      readable: false, blocked, textInHtml, hasStructuredData: input.hasStructuredData,
      detail: `Your robots.txt blocks ${blocked.length} AI crawler${blocked.length === 1 ? "" : "s"} from the whole site: ${names}. ${blocked.some((b) => b.name === "Google-Extended") ? "Google-Extended is the one to look at first — it does not affect your Google ranking at all, only whether you can appear in Gemini and AI Overviews. " : ""}Assistants cannot recommend a page they were told not to read.`,
    };
  }
  if (!textInHtml) {
    return {
      readable: false, blocked, textInHtml, hasStructuredData: input.hasStructuredData,
      detail: `Only ${input.wordCount} words arrived in the HTML — the page fills in once scripts run. Google renders pages; most assistant crawlers read the HTML as it comes, so they see almost nothing.`,
    };
  }
  if (!input.hasStructuredData) {
    return {
      readable: true, blocked, textInHtml, hasStructuredData: false,
      detail: "Assistants can read the page, but there is no structured data, so what you do and where you do it has to be inferred from prose rather than read from a machine-readable statement.",
    };
  }
  return {
    readable: true, blocked, textInHtml, hasStructuredData: true,
    detail: "Nothing blocks the AI crawlers, the text is in the HTML, and structured data says what the page is. An assistant can read and understand this page.",
  };
}
