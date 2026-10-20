// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// TURN A FACEBOOK OR LINKEDIN PAGE INTO THE COMPANY'S OWN WEBSITE, FOR NOTHING.
//
// WHY THIS IS WORTH A MODULE. The free crawl in `enrich.ts` already finds a
// published email on a company's own site, with no key and no credit — driven,
// it reads `/` and `/contact` and returns `info@…` while refusing the web
// designer's address. It needs one thing: the domain. And `findWebsite` could
// only get a domain two ways — the caller supplying one, or a paid search.
//
// A list bought off LinkedIn or Facebook supplies neither. It supplies social
// URLs, which the AGGREGATOR list correctly refuses as "not the company's own
// site" — and the row then dies at "needs live Google data". The company's own
// Facebook page states its website; following that link is free, and it hands
// the free crawl the one input it was missing.
//
// THE GATE IS THE POINT, NOT THE FETCH. A social page links to all sorts of
// things: the page's own network, a booking platform, a franchise head office,
// whoever built the site. So every candidate goes through
// `domainMatchesCompany` — the same ownership rule the crawl already uses to
// decide whether an address belongs to the company — and a candidate that
// cannot be tied to the company's name is refused rather than returned with a
// caveat. A wrong domain here does not produce a bad guess; it produces a real
// email at a real stranger's company.
//
// AND A WALL IS REPORTED AS A WALL. Both networks serve a sign-in page to a
// signed-out reader for much of their content. "This page names no website" is a
// statement about the company; "we were not allowed to read the page" is a
// statement about us. Reporting the second as the first would have the customer
// delete a good lead.

import { isSocialProfileUrl, socialNetworkOf, websiteCandidatesFrom, authWallSigns, type SocialNetwork } from "@/shared/social-profile";
import { domainMatchesCompany, scraperProxyConfigured } from "@/backend/enrich";

export type SocialWebsiteVerdict = {
  /** The company's own site, or null. Origin only — the crawl adds the paths. */
  website: string | null;
  network: SocialNetwork | null;
  /**
   * `found`      — the page named a site and it is the company's.
   * `rejected`   — it named sites, none of which belong to this company.
   * `none`       — the page was readable and named no site at all.
   * `walled`     — we were not allowed to read it. NOT the same as `none`.
   * `unfetchable`— the request failed outright.
   * `not-social` — the URL given was not a social profile.
   */
  outcome: "found" | "rejected" | "none" | "walled" | "unfetchable" | "not-social";
  /** Where on the page the answer came from, when there is one. */
  evidence: string;
  /** One sentence, in the customer's terms. Never implies more than was seen. */
  why: string;
  /** Candidates that were refused, with the reason. Useful and never guessed at. */
  rejected: { url: string; why: string }[];
  /** Always 0. Kept so a caller can sum a run's cost without special-casing. */
  costAcu: 0;
};

export type FetchLike = (url: string) => Promise<string>;

/**
 * Read the website off a social page.
 *
 * `fetchImpl` is injectable for the driver and the tests. The default routes
 * through `enrich.ts`'s own `fetchText`, so a deployment with `SCRAPER_API_URL`
 * set gets the same higher hit rate here as it does on the email crawl — which
 * matters more on this path than anywhere else, because it is the difference
 * between reading a Facebook page and being shown a wall.
 */
export async function websiteFromSocialPage(input: {
  url: string;
  /** The company's name. Without it nothing can be gated, so nothing is returned. */
  company: string;
  fetchImpl?: FetchLike;
}): Promise<SocialWebsiteVerdict> {
  const url = String(input.url ?? "").trim();
  const company = String(input.company ?? "").trim();
  const base: Omit<SocialWebsiteVerdict, "outcome" | "why"> = {
    website: null, network: socialNetworkOf(url), evidence: "", rejected: [], costAcu: 0,
  };

  if (!isSocialProfileUrl(url)) {
    return { ...base, outcome: "not-social", why: "That is not a Facebook or LinkedIn page, so there is nothing to follow." };
  }
  if (!company) {
    // NO NAME, NO GATE, NO ANSWER. Returning the first outbound link on a
    // social page without being able to check whose it is would hand back the
    // page's own network, a booking platform, or the agency that built the site.
    return { ...base, outcome: "rejected", why: "The company's name is needed to tell its own website apart from everything else the page links to. Without it nothing is returned, rather than a guess." };
  }

  const read: FetchLike = input.fetchImpl ?? (async (u) => {
    const { fetchTextForSocial } = await import("@/backend/enrich");
    return fetchTextForSocial(u);
  });

  let html = "";
  try { html = await read(url); } catch { html = ""; }
  if (!html) {
    return {
      ...base, outcome: "unfetchable",
      why: `${label(base.network)} did not answer the request at all. Nothing is known about this page — which is not the same as the company having no website.`,
    };
  }

  const wall = authWallSigns(html);
  if (wall.walled) {
    return {
      ...base, outcome: "walled",
      why: `${label(base.network)} served ${wall.sign} instead of the page, so its website could not be read. `
        + `This says nothing about the company — only that we were signed out. `
        + (scraperProxyConfigured()
          ? "The scraping endpoint is configured and still got a wall, so this page needs a signed-in session we do not have."
          : "Setting SCRAPER_API_URL raises the share of these pages that can be read; supplying the website column skips the problem entirely."),
    };
  }

  const candidates = websiteCandidatesFrom(html);
  if (!candidates.length) {
    return {
      ...base, outcome: "none",
      why: `${label(base.network)} page was readable and names no website at all. That is a fact about the page, so this row needs a different source — not a guessed domain.`,
    };
  }

  const rejected: { url: string; why: string }[] = [];
  for (const c of candidates) {
    let host = "";
    try { host = new URL(c.url).hostname.replace(/^www\./, "").toLowerCase(); } catch { continue; }
    if (!domainMatchesCompany(company, host)) {
      rejected.push({ url: c.url, why: `${host} cannot be tied to "${company}" by name — it may be a supplier, a booking platform or whoever built the site.` });
      continue;
    }
    return {
      ...base, website: c.url, outcome: "found", evidence: c.from, rejected,
      why: `Read off the company's own ${label(base.network)} page (${describe(c.from)}), and the domain matches the company name. Free: no key, no credit.`,
    };
  }

  return {
    ...base, outcome: "rejected", rejected,
    why: `The ${label(base.network)} page names ${candidates.length} site(s), and none of them can be tied to "${company}" by name. `
      + `A domain that cannot be shown to be theirs is refused: the cost of being wrong here is a real email at a real stranger's company.`,
  };
}

const label = (n: SocialNetwork | null): string =>
  n === "facebook" ? "Facebook" : n === "linkedin" ? "LinkedIn"
    : n === "instagram" ? "Instagram" : n === "x" ? "X" : n === "tiktok" ? "TikTok"
      : n === "youtube" ? "YouTube" : "That page";

const describe = (from: string): string =>
  from === "json-ld" ? "its own structured data"
    : from === "link-shim" ? "the outbound link the page renders"
      : from === "meta" ? "a meta tag"
        : from === "href" ? "a link in the page"
          : "the site written in the page text";
