// WHAT EACH FINDING ACTUALLY COSTS THE PERSON READING IT.
//
// THE PROBLEM THIS SOLVES. The free audit is the platform's best acquisition
// asset and it was reporting like a linter:
//
//     HTTPS · Technical · Served over HTTPS.
//     Title tag · SEO · Title present (56 chars).
//     Viewport meta · Mobile · Mobile viewport set.
//
// Three things that are FINE, in language a plumber has no use for, followed by
// a request for their email address. Nobody trades an email for that, and they
// should not: nothing there told them anything they could act on.
//
// Every finding now carries three things the technical detail never did:
//
//   COSTS  — what this does to their enquiries, in one sentence, in their words.
//   FIX    — what has to change. Specific enough to hand to whoever built it.
//   OURS   — what MarketWar does about it. This is the only honest bridge to
//            signing up: not "upgrade to see more", but "this is the thing, and
//            here is who fixes it".
//
// THE RULE THIS FILE IS BOUND BY: no invented numbers. Not "you are losing 40%
// of your traffic", not "this costs the average business £2,000 a year". Every
// line describes a MECHANISM that is true of every site with that fault. A
// mechanism can be checked by the reader against their own experience, which is
// what makes it persuasive; a fabricated statistic is checked against nothing
// and is the reason people distrust these reports. A test asserts no line in
// here contains a percentage or a currency amount.

export type FindingCopy = {
  /**
   * The crawler's own area for this check.
   *
   * Carried here so the public page can LIST what it checks — the strongest
   * thing that page can say is the actual catalogue, and a hand-typed copy of
   * it on the marketing side would be wrong within a week. A test crawls a real
   * page and asserts every finding's area matches the one here, so the two
   * cannot drift.
   */
  area: string;
  /**
   * True for a check that only appears when the page turns out to warrant it.
   *
   * It exists because the page must not claim a number it does not always run.
   * "Thirty checks" would be a better sentence and a false one on any site that
   * is not rendered by JavaScript, and the whole argument of this report is
   * that nothing in it is inflated.
   */
  conditional?: boolean;
  /** What it does to their enquiries. One sentence, no jargon, no statistics. */
  costs: string;
  /** What to change. Concrete enough to act on or delegate. */
  fix: string;
  /** What MarketWar does about it — the honest reason to sign up. */
  ours: string;
};

/**
 * Keyed by the finding's LABEL, so a check added to the crawler without copy
 * still renders — it simply falls back to its own technical detail rather than
 * breaking the page. Silence is better than a wrong explanation.
 */
export const AUDIT_COPY: Record<string, FindingCopy> = {
  "HTTPS": {
    area: "Technical",
    costs: "Browsers put a “Not secure” warning next to your address. People who see it on a trades or services site assume the business is either abandoned or dodgy, and they leave before reading a word.",
    fix: "Install a TLS certificate and redirect every http:// address to https://. Most hosts do it free in a click.",
    ours: "We re-check it on every crawl and tell you the day it lapses, which is the day it usually breaks — certificates expire quietly.",
  },
  "Reachable (2xx)": {
    area: "Technical",
    costs: "The page answered with an error. Anyone arriving from a search result, an advert or a business card is seeing that error instead of your business.",
    fix: "Find out why the server is refusing. A 404 means the page moved; a 5xx means the server or the host is failing.",
    ours: "The site watch checks it on a schedule and tells you when it changes, rather than you finding out from a customer.",
  },
  "Load time": {
    area: "Technical",
    costs: "People give a page a couple of seconds on a phone, on mobile data, standing in a shop. A slow first response is the most common reason somebody never sees your offer at all — they are already back on the results page.",
    fix: "Cut page weight, turn on caching, and move to a faster host. The first byte is the number to attack.",
    ours: "Every crawl records it, so you can see whether a change made it better or worse instead of guessing.",
  },
  "Title tag": {
    area: "SEO",
    costs: "This is the blue line somebody clicks in Google. It is the single biggest influence on whether they choose you or the business under you, and it is the one line most sites never write on purpose.",
    fix: "Write 15–65 characters that name what you do and where you do it — not just the company name.",
    ours: "The SEO engine writes and tests titles per page, and the approval queue means nothing goes live that you have not read.",
  },
  "Meta description": {
    area: "SEO",
    costs: "Without one, Google writes your search listing for you out of whatever text it finds first — often a cookie notice or a menu. That sentence is your advert, and right now somebody else is writing it.",
    fix: "Write 50–165 characters that give a reason to click: the outcome, the area you cover, and what to do next.",
    ours: "Written per page by the content engine, with the same approval step, so your listing says what you would have said.",
  },
  "Single H1": {
    area: "SEO",
    costs: "The main heading tells both a visitor and a search engine what the page is for. Missing it, or having several, makes the page read as unfocused to both — and unfocused pages get skipped.",
    fix: "One H1 per page, saying what the page is about in plain words.",
    ours: "The page builder enforces it, so it cannot drift back the next time somebody edits the site.",
  },
  "Canonical tag": {
    area: "SEO",
    costs: "Without it, the same page reachable at two addresses can compete with itself in search, splitting whatever authority it has between two versions.",
    fix: "Add a canonical link naming the one address you want indexed.",
    ours: "Set automatically on every page we publish for you.",
  },
  "Indexable": {
    area: "SEO",
    costs: "This page tells search engines not to list it. However good it is, it cannot be found by anybody searching for what you sell. This is the most expensive fault a website can have and it is usually left on by accident after a rebuild.",
    fix: "Remove the noindex tag. Then ask Google Search Console to re-crawl.",
    ours: "We check it on every crawl and treat it as an emergency, because it is one.",
  },
  "robots.txt": {
    area: "SEO",
    costs: "Search engines look for this file first. Its absence will not stop you being found, but it means you have no say over what gets crawled and no place to point at your sitemap.",
    fix: "Add a robots.txt at the root, and reference your sitemap in it.",
    ours: "Generated and kept current for the pages we publish.",
  },
  "sitemap.xml": {
    area: "SEO",
    costs: "A sitemap is how you hand search engines a list of your pages instead of hoping they find them by following links. Without one, new pages can sit unindexed for weeks.",
    fix: "Publish a sitemap.xml and submit it in Google Search Console.",
    ours: "Built and updated automatically whenever a page changes.",
  },
  "Viewport meta": {
    area: "Mobile",
    costs: "Most people find a local business on a phone. Without this tag the page loads at desktop width and they get a wall of tiny text — the pinch-and-zoom experience nobody stays for.",
    fix: "Add the viewport meta tag, then look at the page on an actual phone.",
    ours: "Every page we build is checked at phone width before it can be approved.",
  },
  "Lang attribute": {
    area: "Mobile",
    costs: "Screen readers and search engines use it to know what language the page is in. Small on its own; it is one of the signals that separates a maintained site from an abandoned one.",
    fix: "Set lang on the html element.",
    ours: "Set for you on every published page.",
  },
  "Content depth": {
    area: "Content",
    costs: "A page with very little text gives search engines almost nothing to match a search against. It is the commonest reason a good local business never appears for the thing it actually does.",
    fix: "Say what you do, who for, where, and what happens next — in the words customers use rather than industry terms.",
    ours: "The content engine drafts it from your business, and you approve every word before it publishes.",
  },
  "Image alt text": {
    area: "Content",
    costs: "Alt text is what a blind visitor hears and what Google reads. Missing it loses you image search entirely and is a genuine accessibility problem — one with legal weight for a business serving the public.",
    fix: "Describe each image in a few words. Decorative images can take an empty alt.",
    ours: "Drafted for every image we publish, and flagged on images we did not.",
  },
  "Open Graph": {
    area: "Social",
    costs: "When somebody shares your link on WhatsApp, Facebook or LinkedIn, these tags decide whether it appears as a proper card with a picture or as a bare grey link. A bare link gets a fraction of the clicks — and word of mouth is how most local work arrives.",
    fix: "Add og:title, og:description and an og:image at least 1200×630.",
    ours: "Set on every page, and the ad canvas makes the image.",
  },
  "Twitter card": {
    area: "Social",
    costs: "Links to your site posted on X appear as a bare address rather than a card with a picture and a headline. It matters only as much as X matters to you — but it is a two-line fix, and a bare link in a feed of cards is the one nobody taps.",
    fix: "Add twitter:card and twitter:image alongside your Open Graph tags.",
    ours: "Set automatically whenever a page is published, using the same image as the social preview.",
  },
  "Schema.org": {
    area: "Structured data",
    costs: "Structured data is how you get stars, prices, opening hours and FAQs shown directly in search results. Without it your listing is a plain blue line next to competitors who have all of that.",
    fix: "Add LocalBusiness or Organization markup, plus Product or Service where it applies.",
    ours: "Generated per page and validated before it publishes.",
  },
  "AI crawler access": {
    area: "AI search",
    costs: "When somebody asks an assistant who does this near them, the answer is built from pages its crawler was allowed to fetch and could actually read. A site can rank perfectly in Google and be missing from that conversation entirely — most often because a line in robots.txt names the AI crawlers, which usually arrived in a template rather than as a decision. Google-Extended is the one worth checking first: it does not affect your Google ranking at all, only whether you can appear in Gemini and AI Overviews, so blocking it costs you the new thing and protects nothing.",
    fix: "Remove the AI crawlers from any site-wide Disallow in robots.txt, make sure your text is in the HTML rather than loaded by scripts, and add structured data so what you do and where is stated rather than inferred.",
    ours: "We keep robots.txt correct, publish server-rendered pages, and generate the structured data. Whether you are actually being cited, and for which questions, is measured inside the platform — that needs asking the assistants, which costs AI calls, so it is not part of the free audit.",
  },
  "Rendered by JavaScript": {
    area: "Technical",
    conditional: true,
    costs: "The page arrives nearly empty and fills in once scripts run. Google can usually cope, but it is slower to index, and anything that fails to load leaves a blank page rather than a slow one.",
    fix: "Server-render the important text, or pre-render the pages that matter for search.",
    ours: "Every page we publish is server-rendered, so what a search engine sees is what a visitor sees.",
  },

  // ---- the checks added to make this deep enough to be worth reading ----

  "Phone number": {
    area: "Content",
    costs: "For a local business the phone number is the conversion. If it is not a number a phone can dial, somebody standing in the rain has to copy it by hand — and most will simply ring whoever is easier to ring.",
    fix: "Put the number in the header as a tel: link so it dials on a tap.",
    ours: "The page builder puts a tappable number in the header of every page, and the call tracking tells you which page produced the call.",
  },
  "Contact route": {
    area: "Content",
    costs: "No phone link, no email link and no form — on the page they landed on or on the contact pages we followed from it. Every visitor who wanted to hire you had to go looking, and looking is where they stop.",
    fix: "Give one clear way to make contact, visible without scrolling.",
    ours: "Every page we build carries a contact route above the fold, and the enquiries land in one inbox.",
  },
  "Local address": {
    area: "SEO",
    costs: "No address or postcode on the page. Google needs to see where you are to show you in local results and the map pack, and customers need to see it before they trust a trade they have never used.",
    fix: "Put the full address and postcode in the footer of every page, matching your Google Business Profile exactly.",
    ours: "Kept consistent across every page automatically, which is the part that usually drifts.",
  },
  "Local business schema": {
    area: "Structured data",
    costs: "You have no LocalBusiness markup, so search engines have to guess your address, hours and phone from prose. Guessing is why competitors with the markup appear in the map pack and you do not.",
    fix: "Add LocalBusiness structured data with name, address, phone and opening hours.",
    ours: "Generated from your business details and kept in step with them.",
  },
  "Mixed content": {
    area: "Technical",
    costs: "The page is secure but loads some images or scripts insecurely. Browsers block them or downgrade the padlock, so the page can look broken and untrustworthy at the same time.",
    fix: "Change every http:// asset reference to https://.",
    ours: "Flagged on every crawl, because it usually appears months after launch when somebody pastes in an old embed.",
  },
  "Page weight": {
    area: "Technical",
    costs: "The page is heavy. On a phone on mobile data that is money out of your visitor's data allowance and seconds off their patience — and seconds are what you have.",
    fix: "Compress images, drop unused scripts, and stop loading things above the fold that nobody sees.",
    ours: "Measured every crawl so you can see whether last month's change helped.",
  },
  "Render-blocking scripts": {
    area: "Technical",
    costs: "Scripts in the head stop the page drawing until they finish. The visitor is looking at nothing while they load, which is the part of the wait they actually feel.",
    fix: "Move scripts to the end of the body, or mark them async or defer.",
    ours: "Our pages ship without render-blocking scripts by default.",
  },
  "Favicon": {
    area: "Technical",
    costs: "No icon in the browser tab or the bookmark. Trivial alone, but it is one of the handful of small signals people read — unconsciously — as “this business is looked after”.",
    fix: "Add a favicon and an apple-touch-icon.",
    ours: "Taken from your brand kit and applied everywhere.",
  },
  "Heading structure": {
    area: "Content",
    costs: "The page has no subheadings, so it reads as one block. People scan before they read; a block of text with no way in gets scrolled past.",
    fix: "Break the page with H2s that answer the questions a customer actually asks.",
    ours: "The content engine writes to that shape, because it is the shape people read.",
  },
  "Social profiles": {
    area: "Social",
    costs: "No links to your social profiles. It costs you the second-easiest way to be checked out by somebody deciding whether to trust you with their house or their money.",
    fix: "Link your active profiles in the footer — the active ones only.",
    ours: "Kept in step with the accounts you actually post to, so a dead profile is not the one you advertise.",
  },
  "Copyright year": {
    area: "Content",
    costs: "The footer year is out of date. It is the first thing a careful customer checks to see whether a business is still trading, and getting it wrong makes a busy company look closed.",
    fix: "Make the year render from the date rather than being typed in.",
    ours: "It renders from the date on every page we publish, so it can never go stale.",
  },
  "www and root both work": {
    area: "Technical",
    costs: "One of the two versions of your address does not answer. Anyone who types it the other way, or has the old one saved, or printed it on a van, gets nothing.",
    fix: "Serve both, with one redirecting permanently to the other.",
    ours: "Checked on every crawl. It is also the fault that silently breaks payment and delivery webhooks, which is how it usually gets discovered.",
  },
};

/** The copy for a finding, or null when we have nothing honest to add. */
export const copyFor = (label: string): FindingCopy | null => AUDIT_COPY[label] ?? null;

/**
 * ONE check the crawler runs, listed for the public page.
 *
 * The single most persuasive thing the audit page can put in front of a
 * stranger is the actual catalogue — not "we check your SEO" but the
 * twenty-nine named things, each with the sentence explaining why it costs
 * them money. Every competitor's landing page makes the claim; almost none of
 * them show the list, because showing the list is only possible when the list
 * is real.
 */
export type AuditCheck = { label: string; area: string; costs: string };

/**
 * Every check, grouped by area, in the order the areas are worth reading.
 *
 * Derived from AUDIT_COPY rather than typed out beside it, so a check added to
 * the crawler tomorrow appears on the marketing page the same day and one
 * removed cannot linger there as a promise nothing keeps.
 */
export const AUDIT_AREAS = ["Technical", "SEO", "Content", "Mobile", "Structured data", "Social", "AI search"] as const;

export function checksByArea(): { area: string; checks: AuditCheck[] }[] {
  const all: AuditCheck[] = Object.entries(AUDIT_COPY).map(([label, c]) => ({ label, area: c.area, costs: c.costs }));
  const known = new Set<string>(AUDIT_AREAS);
  // An area added to the crawler and not to AUDIT_AREAS still appears, at the
  // end, rather than silently vanishing from the page.
  const areas = [...AUDIT_AREAS, ...[...new Set(all.map((c) => c.area))].filter((a) => !known.has(a))];
  return areas
    .map((area) => ({ area, checks: all.filter((c) => c.area === area) }))
    .filter((g) => g.checks.length > 0);
}

/**
 * How many checks run on EVERY page. Counted, never typed.
 *
 * Conditional checks are excluded on purpose: a number on a page that promises
 * nothing is inflated has to be the number that is true of every visitor.
 */
export const auditCheckCount = (): number =>
  Object.values(AUDIT_COPY).filter((c) => !c.conditional).length;

/** The checks that only appear when the page warrants them. */
export const conditionalChecks = (): string[] =>
  Object.entries(AUDIT_COPY).filter(([, c]) => c.conditional).map(([label]) => label);

/**
 * The one-line verdict at the top, built from what was actually counted.
 *
 * NO INVENTED NUMBERS. It states the counts and names the worst thing found.
 * "You are losing 40% of your enquiries" would be a stronger sentence and a
 * fabricated one, and this platform does not print those.
 */
export function auditHeadline(input: { failures: number; warnings: number; worst?: string; score: number }): string {
  const { failures, warnings, worst, score } = input;
  if (failures === 0 && warnings === 0) {
    return `Nothing on this page is broken — it scored ${score} out of 100. That is rarer than it sounds, and it means the next gain is not on this page but in what you publish next.`;
  }
  if (failures === 0) {
    return `Nothing here is broken, but ${warnings} thing${warnings === 1 ? "" : "s"} ${warnings === 1 ? "is" : "are"} working against you${worst ? `, starting with “${worst}”` : ""}.`;
  }
  return `${failures} thing${failures === 1 ? "" : "s"} on this page ${failures === 1 ? "is" : "are"} actively costing you enquiries${warnings ? `, and ${warnings} more ${warnings === 1 ? "is" : "are"} working against you` : ""}${worst ? `. The most expensive is “${worst}”` : ""}.`;
}

/**
 * What to do about it — the bridge to signing up, without a lie in it.
 *
 * The honest argument is not "pay to see the rest". It is that the findings are
 * a list of jobs, and the platform is the thing that does them and keeps them
 * done. Anybody can take this list to their web developer instead, and the copy
 * says so — a report that pretends there is no alternative is a report nobody
 * believes.
 */
export function auditNextStep(input: { failures: number; warnings: number; free: boolean }): string {
  const actionable = input.failures + input.warnings;
  if (actionable === 0) {
    return "There is nothing to fix here, so the useful next step is publishing more of what already works. That is what the platform does day to day.";
  }
  const body = `Every one of these is a job with a known fix, and they are all listed above with what to change. Take the list to whoever built your site — it is yours, and that is a perfectly good outcome.`;
  const ours = `Or start free and MarketWar does them: the pages, the titles, the structured data, the images, and then keeps publishing so the list does not grow back. No card, and the free tier is not a trial that expires.`;
  return input.free ? `${body} ${ours}` : `${body} ${ours}`;
}
