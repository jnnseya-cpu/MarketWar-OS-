// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// robots.txt — obeyed, not merely detected.
//
// The crawler has been CHECKING that robots.txt exists and scoring the site on
// it, while never reading a word of what it says. That is defensible for a
// single page someone pastes in about a site they own; it stops being
// defensible the moment we follow links, because then we are choosing which
// pages to fetch and the file exists precisely to answer that.
//
// This implements RFC 9309, which is narrower than most people assume:
//
//   ONE GROUP APPLIES, NOT ALL OF THEM. The most specific matching user-agent
//   group wins, and "*" is the fallback only when no named group matches. A
//   crawler that unions every group it can see obeys rules meant for Googlebot
//   and ignores the ones written for it.
//
//   LONGEST MATCH WINS, AND A TIE GOES TO ALLOW. "Disallow: /admin" plus
//   "Allow: /admin/public" permits the second, because it is the longer rule.
//   Reading top-to-bottom and taking the first hit gets this backwards.
//
//   AN EMPTY DISALLOW IS PERMISSION. "Disallow:" with nothing after it means
//   allow everything — the opposite of the same line with a slash.
//
// WHAT IT DOES NOT DO: robots.txt is not an access control, and reading it is
// not the same as being authorised. SiteRaid's ingestion gate is what
// establishes that the customer owns or may act for the site. This answers the
// narrower question of whether the site's own published rules invite us onto a
// given path.

export type RobotsGroup = {
  agents: string[];
  /** [pathPattern, isAllow] in file order; precedence is by length, not order. */
  rules: { path: string; allow: boolean }[];
  crawlDelaySec?: number;
};

export type RobotsFile = {
  /** False when there was no robots.txt at all — everything is permitted by default. */
  present: boolean;
  groups: RobotsGroup[];
  sitemaps: string[];
};

export const OUR_AGENT = "MarketWarBot";

export function parseRobots(text: string, present = true): RobotsFile {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  if (!text || !text.trim()) return { present, groups, sitemaps };

  let current: RobotsGroup | null = null;
  // Consecutive User-agent lines share one group; a rule line closes the header.
  let acceptingAgents = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      if (!current || !acceptingAgents) {
        current = { agents: [], rules: [] };
        groups.push(current);
        acceptingAgents = true;
      }
      if (value) current.agents.push(value.toLowerCase());
      continue;
    }
    if (field === "sitemap") { if (value) sitemaps.push(value); continue; }
    if (!current) continue;
    acceptingAgents = false;

    if (field === "disallow") {
      // "Disallow:" with an empty value is an explicit ALLOW-ALL, not a block.
      if (value) current.rules.push({ path: value, allow: false });
      continue;
    }
    if (field === "allow") { if (value) current.rules.push({ path: value, allow: true }); continue; }
    if (field === "crawl-delay") {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) current.crawlDelaySec = n;
    }
  }
  return { present, groups, sitemaps };
}

/**
 * The one group that applies to us.
 *
 * Exact token match on the agent name, case-insensitively, falling back to "*".
 * Substring matching would be worse than useless: a group for "BadBot" would
 * capture "MarketWarBot" and we would obey rules written for someone else.
 */
export function groupFor(file: RobotsFile, agent = OUR_AGENT): RobotsGroup | null {
  const want = agent.toLowerCase();
  const named = file.groups.find((g) => g.agents.includes(want));
  if (named) return named;
  return file.groups.find((g) => g.agents.includes("*")) || null;
}

/** Does a robots path pattern match this path? Supports "*" and a "$" end anchor. */
function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const parts = body.split("*");
  let at = 0;
  for (let i = 0; i < parts.length; i++) {
    const piece = parts[i];
    if (!piece) continue;
    if (i === 0) {
      if (!path.startsWith(piece)) return false;
      at = piece.length;
      continue;
    }
    const found = path.indexOf(piece, at);
    if (found < 0) return false;
    at = found + piece.length;
  }
  if (anchored) {
    // With no wildcard the whole path must equal the pattern; with one, the
    // last literal piece has to land exactly at the end.
    return body.includes("*") ? at === path.length : path === body;
  }
  return true;
}

export type RobotsDecision = { allowed: boolean; rule: string; reason: string };

/**
 * May we fetch this path?
 *
 * Default is YES. A missing or empty robots.txt is permission by long-standing
 * convention, and refusing to crawl a site that said nothing would break the
 * audit for most customers to enforce a rule nobody wrote.
 */
export function robotsAllows(file: RobotsFile, path: string, agent = OUR_AGENT): RobotsDecision {
  if (!file.present) return { allowed: true, rule: "", reason: "No robots.txt — crawlers are permitted by default." };
  const group = groupFor(file, agent);
  if (!group || group.rules.length === 0) {
    return { allowed: true, rule: "", reason: `robots.txt has no rules that apply to ${agent}.` };
  }

  const p = path || "/";
  let best: { path: string; allow: boolean } | null = null;
  for (const r of group.rules) {
    if (!matches(r.path, p)) continue;
    if (!best || r.path.length > best.path.length) { best = r; continue; }
    // Equal length: Allow wins, per RFC 9309.
    if (r.path.length === best.path.length && r.allow) best = r;
  }
  if (!best) return { allowed: true, rule: "", reason: `No rule in robots.txt covers ${p}.` };
  return {
    allowed: best.allow,
    rule: `${best.allow ? "Allow" : "Disallow"}: ${best.path}`,
    reason: best.allow
      ? `robots.txt explicitly allows ${p} ("${best.path}").`
      : `robots.txt disallows ${p} ("${best.path}") for ${group.agents.join(", ")}. We do not fetch it.`,
  };
}

/** How long the site asked us to wait between requests, in ms. Capped so one hostile value cannot stall a crawl. */
export function crawlDelayMs(file: RobotsFile, agent = OUR_AGENT, capMs = 5_000): number {
  const g = groupFor(file, agent);
  const sec = g?.crawlDelaySec;
  if (!sec || sec <= 0) return 0;
  return Math.min(capMs, Math.round(sec * 1000));
}
