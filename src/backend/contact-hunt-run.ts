// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// THE RUNNER — the part that actually goes and finds contacts.
//
// WHY THIS FILE EXISTS. `shared/contact-hunter.ts` decides whether a value may be
// held, shown or sent, and `/api/contact-hunter` exposed those decisions. But a
// rulebook with nothing to judge is a library list: the surface showed a
// hardcoded Amanda Brown at exampleconstruction.co.uk and there was no box to
// type a real company into. That is the gap this closes. Type "plumbers in
// Leeds" or "Groupe Nseya" and this goes out, reads real pages, and comes back
// with real contacts — each one carrying the URL it was read from.
//
// IT IS ASSEMBLY, NOT INVENTION. Every capability was already here:
//   • `search.webSearch`   — live Google through Serper.
//   • `enrich.scrapeEnrich`— finds the firm's OWN site (rejecting directories),
//                            reads home + contact pages, and takes an email only
//                            when it is on the company's own domain or plainly
//                            published there.
//   • `enrich.dropSharedEmails` — one inbox appearing on four firms is a
//                            directory's, so it is dropped from all four.
//   • `robots`             — consulted before any page this file fetches itself.
//   • `lead-harvest`       — the twelve checks and the lawful-basis decision.
//   • `contact-hunter`     — provenance, employment, readiness, suppression.
//
// WHAT IT ADDS: the decision-maker hunt (a team/about page read for a name and a
// title), the evidence record for every value, and the honest failure. Which
// leads to the rule this file is built around:
//
//   A ROW THAT FOUND NOTHING SAYS WHERE IT STOPPED.
//
// "0 contacts" is unactionable. An exhausted search quota, a company with no
// site of its own, a site with no published address and an address we refused
// as somebody else's are four different problems with four different fixes, and
// they look identical in a bare count. Every result carries its stage.

import { webSearch } from "@/backend/search";
import { scrapeEnrich, dropSharedEmails, isPersonalProvider, type EnrichResult } from "@/backend/enrich";
import { classifyEmail, verifyEmail, assessCompliance, buildContactRecord } from "@/backend/lead-harvest";
import { parseRobots, robotsAllows, OUR_AGENT } from "@/backend/robots";
import {
  assessEmployment, normalisePhone, readiness, learnPattern, suppressedBy,
  type ContactPoint, type SourceEvidence, type EmailStatus, type Readiness,
  type EmploymentFinding, type EmploymentEvidence, type Suppression,
} from "@/shared/contact-hunter";

export type HuntStage =
  | "found" | "search_unavailable" | "no_own_site" | "site_no_email"
  | "email_rejected" | "suppressed" | "no_decision_maker" | "unreachable";

export type HuntResult = {
  company: string;
  website: string | null;
  /** The email, with everything needed to judge it. Null when none was found. */
  email: ContactPoint | null;
  phone: ContactPoint | null;
  person: { name: string | null; title: string | null; employment: EmploymentFinding } | null;
  readiness: Readiness | null;
  /** Where this row stopped. Present even on success. */
  stage: HuntStage;
  /** One sentence a person can act on. */
  note: string;
  evidence: SourceEvidence[];
};

export type HuntReport = {
  mode: "live" | "demo";
  query: string;
  results: HuntResult[];
  /** What actually happened, by stage. The honest version of "we found N". */
  stages: Record<string, number>;
  sharedEmailsDropped: number;
  note: string;
};

const HOST = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

/**
 * Why a page produced nothing. The distinction that matters most.
 *
 * "" is not an answer. A page we could not load, a page a site asked us not to
 * read, and a page that genuinely has no address on it are three different
 * facts, and the first version of this file collapsed all three into "no email
 * published" — so a site that was down, or blocking us, or behind a network we
 * could not leave, came back as "Found the site but publishes no address. Use
 * the contact form." That sentence was about a page nobody had loaded.
 *
 * It is the same defect this codebase keeps producing in a new costume: a check
 * that fails for a reason unrelated to what it tests.
 */
export type FetchOutcome = { html: string; reachable: boolean; why: string };

/** Read a page, having first asked the site whether we may. */
async function politeFetchDetailed(url: string, timeoutMs = 9_000): Promise<FetchOutcome> {
  const host = HOST(url);
  if (!host) return { html: "", reachable: false, why: "Not a URL." };
  // ROBOTS FIRST, EVERY TIME. `enrich` fetches its own pages; the ones THIS file
  // reads on top of that (team, leadership, our-people) go through the check,
  // because a page a site has asked us not to read is one we do not read.
  try {
    const r = await fetch(`https://${host}/robots.txt`, { signal: AbortSignal.timeout(4_000) });
    const txt = r.ok ? await r.text() : "";
    const decision = robotsAllows(parseRobots(txt, r.ok), new URL(url).pathname, OUR_AGENT);
    // REACHABLE BUT REFUSED. The site was contacted and said no, which is a
    // different fact from being unreachable and must not read as one.
    if (!decision.allowed) return { html: "", reachable: true, why: `${host} asks crawlers not to read ${new URL(url).pathname} (${decision.rule}).` };
  } catch { /* no robots.txt reachable — the default in robots.ts is permissive */ }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
      headers: { "User-Agent": `Mozilla/5.0 (compatible; ${OUR_AGENT}/1.0; +https://marketwaros.com)`, Accept: "text/html" },
    });
    if (!res.ok) {
      // A 404 on /team is a page that is not there — the site answered. A 403 or
      // a 5xx is the site or something between us refusing, which is not the
      // same as a company with nothing published.
      const answered = res.status === 404 || res.status === 410;
      return { html: "", reachable: answered, why: answered ? `No page at ${url}.` : `${host} returned ${res.status}.` };
    }
    const buf = await res.arrayBuffer();
    return { html: new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, 500_000)), reachable: true, why: "" };
  } catch (e) {
    return { html: "", reachable: false, why: e instanceof Error && /abort|timeout/i.test(e.message) ? `${host} did not answer in time.` : `${host} could not be reached.` };
  }
}

async function politeFetch(url: string, timeoutMs = 9_000): Promise<string> {
  return (await politeFetchDetailed(url, timeoutMs)).html;
}

/**
 * Could we reach this site at all?
 *
 * Called before a "no address published" verdict is allowed to stand. One
 * request to the root: if that cannot be reached, nothing downstream knows
 * anything about this company and the row says so instead of blaming them for
 * a page it never read.
 */
export async function reachable(website: string): Promise<{ ok: boolean; why: string }> {
  const r = await politeFetchDetailed(website, 8_000);
  return { ok: r.reachable, why: r.why };
}

const strip = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

const SENIOR = [
  "managing director", "chief executive", "ceo", "cfo", "coo", "cto", "founder", "co-founder",
  "owner", "proprietor", "partner", "director", "head of", "commercial manager",
  "procurement", "operations manager", "general manager", "practice manager", "principal",
];

/**
 * Find a decision-maker on the company's own pages.
 *
 * WHAT IT WILL AND WILL NOT DO. It looks for a NAME IMMEDIATELY BESIDE A TITLE —
 * "Amanda Brown, Procurement Director" or a heading followed by one. It does not
 * take a name from a page and a title from another page and put them together,
 * because that is how somebody becomes a director of a company they left in
 * 2019. If the two are not adjacent, this returns nothing and the row says
 * `no_decision_maker` rather than a plausible pairing.
 */
/**
 * Find a name sitting NEXT TO a title, in one piece of text.
 *
 * WHAT IT WILL AND WILL NOT DO. It wants the two ADJACENT — "Amanda Brown,
 * Procurement Director" or "Managing Director: John Smith". It will not take a
 * name from one part of a page and a title from another and put them together,
 * because that is how somebody becomes a director of a company they left in
 * 2019. When the two are not adjacent it returns nothing, and the row says
 * `no_decision_maker` rather than a plausible pairing.
 *
 * THE MATCH IS CASE-INSENSITIVE AND THE NAME CHECK IS NOT. The first version put
 * `[A-Z]` in a pattern with no `i` flag and then compared it against a
 * lower-cased title list, so "Amanda Brown, Procurement Director" — the exact
 * case it exists to catch — matched nothing at all. Now the regex ignores case
 * and `looksLikeName` does the capitalisation check afterwards, where it can
 * also strip the "and" that the old pattern swallowed into "John Smith and".
 */
export function extractDecisionMaker(pageText: string, wanted: string[] = []): { name: string; title: string } | null {
  const titles = (wanted.length ? wanted : SENIOR).map((t) => t.toLowerCase());

  // A NAME IS TWO OR THREE CAPITALISED WORDS, captured greedily and then
  // trimmed. Greedy-then-trim beats trying two words before three: "Leadership
  // Jean-Pierre Dubois" and "Management Mary Jane Watson" both start with a
  // capitalised section heading, and a narrow-first pass answers the second one
  // with "Jane Watson" — a wrong name, which is worse than none.
  const NAME = `[\\p{Lu}][\\p{L}'’-]+(?:\\s+[\\p{Lu}][\\p{L}'’-]+){1,2}`;

  for (const title of titles) {
    // NO `i` FLAG. With it, `\p{Lu}` matches lower case too, so the pattern stops
    // distinguishing a name from any two words. `looksLikeName` is the check
    // that actually REJECTS a lower-case match, and it would still catch it —
    // this keeps the pattern from finding the wrong span in the first place,
    // which is cheaper and keeps the two rules agreeing. The keyword is made
    // case-insensitive letter by letter instead, so the role still matches
    // however the page capitalises it.
    // WORD BOUNDARIES, OR AN ABBREVIATION MATCHES INSIDE A WORD. "cto" is on the
    // seniority list and sits inside "Dire-cto-r", so "Commercial Director, Tom
    // Blake" came back with a job title of "ctor". \b at both ends is the fix.
    const ROLE = `(?:[\\p{Lu}][\\p{L}&-]*\\s+){0,2}\\b${anyCase(title)}\\b[^.,;|]{0,24}`;
    const after = new RegExp(`(${NAME})\\s*[,–—-]\\s*(${ROLE})`, "u");   // "Amanda Brown, Procurement Director"
    const before = new RegExp(`(${ROLE})\\s*[:,–—-]\\s*(${NAME})`, "u"); // "Managing Director: John Smith"

    for (const [re, nameIdx, titleIdx] of [[after, 1, 2], [before, 2, 1]] as const) {
      const m = pageText.match(re);
      if (!m) continue;
      const name = tidyName(m[nameIdx]);
      const foundTitle = tidyTitle(m[titleIdx]);
      if (name && foundTitle && looksLikeName(name) && !looksLikeCompany(name)) return { name, title: foundTitle };
    }
  }
  return null;
}

/** "director" -> "[dD][iI][rR][eE][cC][tT][oO][rR]", so no `i` flag is needed. */
function anyCase(word: string): string {
  return [...word].map((c) => {
    if (!/\p{L}/u.test(c)) return escapeRe(c);
    const lo = c.toLowerCase(), up = c.toUpperCase();
    return lo === up ? escapeRe(c) : `[${escapeRe(lo)}${escapeRe(up)}]`;
  }).join("");
}

/**
 * Page furniture is not part of anybody's name.
 *
 * Leading section headings ("Leadership", "Management") and trailing joining
 * words ("and", "&") both sit flush against a name and are both capitalised
 * like one, so they are removed from either end rather than being defended
 * against in the pattern.
 */
function tidyName(raw: string): string {
  let n = raw.trim().replace(/\s+(and|&|or|with|of|the)$/i, "").trim();
  const words = n.split(/\s+/);
  while (words.length > 2 && NOT_A_NAME.has(words[0].toLowerCase())) words.shift();
  n = words.join(" ");
  return n;
}

/** Trim a leading heading word off a title the same way. */
function tidyTitle(raw: string): string {
  const words = raw.trim().split(/\s+/);
  while (words.length > 1 && NOT_A_NAME.has(words[0].toLowerCase())) words.shift();
  return words.join(" ").trim();
}

/**
 * Does this read as a person's name?
 *
 * Two or three words, every one starting with a capital, none of them a word
 * that only ever appears in page furniture.
 *
 * DELIBERATELY REDUNDANT with the pattern, which already refuses lower case by
 * carrying no `i` flag. Two independent checks means a change to either one
 * alone cannot let a non-name through — and each is pinned by its own test,
 * because a mutation of one survives a suite that only exercises the other.
 */
const NOT_A_NAME = new Set([
  "our", "the", "meet", "team", "contact", "about", "home", "welcome", "read", "more", "view", "we", "us",
  "leadership", "management", "staff", "people", "board", "directors", "founders", "partners", "senior",
]);
export function looksLikeName(name: string): boolean {
  const words = name.split(/\s+/);
  if (words.length < 2 || words.length > 3) return false;
  return words.every((w) => /^[\p{Lu}]/u.test(w) && !NOT_A_NAME.has(w.toLowerCase()));
}

async function findDecisionMaker(website: string, wanted: string[]): Promise<{
  name: string | null; title: string | null; evidence: SourceEvidence[];
}> {
  const paths = ["/about", "/about-us", "/team", "/our-team", "/meet-the-team", "/people", "/our-people", "/leadership", "/management", "/staff", "/contact"];
  const evidence: SourceEvidence[] = [];

  for (const p of paths) {
    const url = website.replace(/\/$/, "") + p;
    const html = await politeFetch(url, 7_000);
    if (!html) continue;
    const hit = extractDecisionMaker(strip(html), wanted);
    if (hit) {
      evidence.push({
        sourceUrl: url, sourceDomain: HOST(url), sourceType: "company_website",
        capturedAt: new Date().toISOString(), publishedBusinessContext: true,
      });
      return { ...hit, evidence };
    }
  }
  return { name: null, title: null, evidence };
}

function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/** "Nseya Group" is not a person, however capitalised it is. */
function looksLikeCompany(name: string): boolean {
  return /\b(ltd|limited|plc|llp|group|holdings|services|solutions|team|department|office)\b/i.test(name);
}

/** Map the scraper's own confidence onto an EmailStatus, then verify it. */
function statusFor(r: EnrichResult, verified: ReturnType<typeof verifyEmail>, personal: boolean): EmailStatus {
  if (personal) return "PERSONAL_SUPPRESSED";
  if (verified.verdict === "reject") return "INVALID";
  const catchAll = verified.checks.find((c) => c.name === "catch_all")?.pass === false;
  if (catchAll) return "CATCH_ALL";
  const generic = classifyEmail(r.email || "").contactType === "generic";
  if (verified.verdict === "safe") return generic ? "ROLE_ACCOUNT" : "VERIFIED";
  return "PROBABLE";
}

const STAGE_NOTE: Record<HuntStage, string> = {
  found: "",
  search_unavailable: "Live search is not available, so no company could be located. Nothing was invented.",
  no_own_site: "No website of their own — only directory listings. Scraping those would attach somebody else's inbox to this company.",
  site_no_email: "Their site was found and read, but publishes no address. Use the contact form, or the number if one was found.",
  email_rejected: "An address was on the page but belongs to somebody else — a designer, a supplier, an embedded widget. Refused rather than handed over.",
  suppressed: "This contact has objected. It is not returned, and it never will be.",
  no_decision_maker: "No named decision-maker is published beside a title on their own pages. The company route was still found.",
  unreachable: "Their site could not be read from here, so nothing is known about what it publishes. This is OUR side of the connection failing, not a company with no contact details — the difference matters, and guessing which one it was is how a working business gets marked as having no address.",
};

/**
 * Hunt one company.
 *
 * `wantedTitles` narrows the decision-maker search; empty means any senior role.
 */
export async function huntCompany(input: {
  company: string;
  town?: string;
  trade?: string;
  website?: string;
  country?: string;
  wantedTitles?: string[];
  suppressions?: Suppression[];
  tenantId?: string;
}): Promise<HuntResult> {
  const asOf = new Date().toISOString();
  const enriched = await scrapeEnrich({
    company: input.company, town: input.town, trade: input.trade, website: input.website,
  });

  const evidence: SourceEvidence[] = [];
  if (enriched.website) {
    evidence.push({
      sourceUrl: enriched.website, sourceDomain: HOST(enriched.website),
      sourceType: "company_website", capturedAt: asOf, publishedBusinessContext: true,
    });
  }

  const base: HuntResult = {
    company: enriched.company, website: enriched.website,
    email: null, phone: null, person: null, readiness: null,
    stage: (enriched.stage as HuntStage) ?? "site_no_email",
    note: enriched.note, evidence,
  };

  if (enriched.mode === "demo" || enriched.stage === "search_unavailable") {
    return { ...base, stage: "search_unavailable", note: enriched.note || STAGE_NOTE.search_unavailable };
  }
  if (!enriched.website) return { ...base, stage: "no_own_site", note: enriched.note || STAGE_NOTE.no_own_site };

  // SUPPRESSION BEFORE ANYTHING IS RETURNED. Checked here as well as at export
  // and at send, because a list compliant when it was built is not necessarily
  // compliant when it is used.
  const supList = input.suppressions ?? [];
  const tenant = input.tenantId ?? "";
  if (enriched.email && suppressedBy(enriched.email, supList, { tenantId: tenant, channel: "EMAIL" })) {
    return { ...base, stage: "suppressed", note: STAGE_NOTE.suppressed };
  }

  // The number, if the site published one. Never called "verified".
  let phone: ContactPoint | null = null;
  if (enriched.phone) {
    const suppressedPhone = Boolean(suppressedBy(enriched.phone, supList, { tenantId: tenant, channel: "PHONE" }));
    const f = normalisePhone(enriched.phone, input.country || "GB", {
      businessContextConfirmed: true, suppressed: suppressedPhone,
    });
    if (f.e164) {
      phone = {
        type: "PHONE", value: enriched.phone, provenance: "confirmed", evidence,
        phoneStatus: f.status, e164: f.e164, businessContextConfirmed: true, lastVerifiedAt: asOf,
      };
    }
  }

  // The decision-maker, if one is published beside a title.
  const dm = await findDecisionMaker(enriched.website, input.wantedTitles ?? []);
  const employmentEvidence: EmploymentEvidence[] = dm.name && dm.title
    ? [{ sourceUrl: dm.evidence[0].sourceUrl, sourceType: "company_website", jobTitle: dm.title, statesCurrent: true }]
    : [];
  const employment = assessEmployment(employmentEvidence, asOf);
  const person = dm.name ? { name: dm.name, title: dm.title, employment } : null;
  if (dm.evidence.length) evidence.push(...dm.evidence);

  if (!enriched.email) {
    // BEFORE BLAMING THE COMPANY, CHECK IT WAS US THAT COULD READ THE PAGE.
    // Without this, a site that is down, blocking us, or simply outside the
    // network this process can leave comes back as "publishes no address" — a
    // statement about a page nobody loaded.
    if (!enriched.phone && !dm.name) {
      const reach = await reachable(enriched.website);
      if (!reach.ok) {
        return { ...base, person: null, evidence, stage: "unreachable", note: `${reach.why} ${STAGE_NOTE.unreachable}` };
      }
    }
    return {
      ...base, phone, person, evidence,
      stage: enriched.stage === "email_rejected" ? "email_rejected" : "site_no_email",
      note: enriched.note || STAGE_NOTE.site_no_email,
    };
  }

  // Verification, by the engine that already does it.
  const verified = verifyEmail(enriched.email, {});
  const personal = isPersonalProvider(enriched.email);
  const emailStatus = statusFor(enriched, verified, personal);

  const email: ContactPoint = {
    type: "EMAIL", value: enriched.email, provenance: "confirmed", evidence,
    emailStatus, businessContextConfirmed: true, lastVerifiedAt: asOf,
  };

  const record = buildContactRecord({
    email: enriched.email,
    sourceUrl: enriched.website,
    country: input.country || "GB",
    company: enriched.company,
    dateExtracted: asOf,
  });
  const verdict = assessCompliance({ record });

  const score = readiness({
    // ICP fit is only known when the caller supplied criteria to fit AGAINST.
    // A single-company lookup has none, so it is scored on what was measured
    // rather than given a flattering default.
    icpFit: input.trade || input.town ? 70 : 50,
    employment, email, phone: phone ?? undefined, evidence,
    compliance: { canContact: verdict.canContact, lawfulBasis: verdict.lawfulBasis, reasons: verdict.reasons },
    suppression: null, refreshedAt: asOf, asOf,
  });

  return {
    company: enriched.company, website: enriched.website,
    email, phone, person, readiness: score,
    stage: "found", evidence,
    note: enriched.note,
  };
}

/**
 * Hunt from criteria — "plumbers in Leeds", "construction companies Birmingham".
 *
 * Finds companies with a live search, then hunts each. Sequential on purpose:
 * these are other people's servers, and a burst of parallel requests to a small
 * firm's site is the behaviour that gets a crawler blocked for everybody.
 */
export async function huntByCriteria(input: {
  what: string;
  where?: string;
  count?: number;
  wantedTitles?: string[];
  country?: string;
  suppressions?: Suppression[];
  tenantId?: string;
}): Promise<HuntReport> {
  const count = Math.max(1, Math.min(input.count ?? 5, 15));
  const query = [input.what, input.where].filter(Boolean).join(" ");
  const search = await webSearch({ query, type: "search", gl: (input.country || "GB").toLowerCase() });

  if (search.mode !== "live") {
    return {
      mode: "demo", query, results: [], stages: { search_unavailable: 1 }, sharedEmailsDropped: 0,
      note: search.providerError?.reason
        || "Live search is not configured, so there is nothing real to return. Set SERPER_API_KEY. No company, address or number is invented here — an empty result is the honest one.",
    };
  }

  // Company names from the result titles, deduplicated by host so five pages of
  // one company's site are one company.
  const seenHosts = new Set<string>();
  const targets: { company: string; website?: string }[] = [];
  for (const r of search.results) {
    if (!r.title || !r.link) continue;
    const host = HOST(String(r.link));
    if (!host || seenHosts.has(host)) continue;
    seenHosts.add(host);
    targets.push({
      company: String(r.title).replace(/\s*[|\-–—:].*$/, "").trim().slice(0, 80) || String(r.title),
      website: String(r.link),
    });
    if (targets.length >= count) break;
  }

  const results: HuntResult[] = [];
  for (const t of targets) {
    results.push(await huntCompany({
      company: t.company, website: t.website, town: input.where, trade: input.what,
      country: input.country, wantedTitles: input.wantedTitles,
      suppressions: input.suppressions, tenantId: input.tenantId,
    }));
  }

  // ONE INBOX ON FOUR FIRMS IS A DIRECTORY'S. Dropped from all of them, because
  // there is no way to know which row it was ever right for.
  const asEnrich: EnrichResult[] = results.map((r) => ({
    company: r.company, website: r.website, email: r.email?.value ?? null,
    emailConfidence: "medium", phone: r.phone?.value ?? null, source: "site", mode: "live", note: "",
  }));
  const { results: cleaned, dropped } = dropSharedEmails(asEnrich);
  const final = results.map((r, i) => cleaned[i].email ? r : {
    ...r, email: null, readiness: null,
    stage: "email_rejected" as HuntStage,
    note: "The same address came back for several companies here, so it is a directory's own inbox rather than any of theirs. Dropped from all of them.",
  });

  const stages: Record<string, number> = {};
  for (const r of final) stages[r.stage] = (stages[r.stage] ?? 0) + 1;
  const found = stages.found ?? 0;

  return {
    mode: "live", query, results: final, stages, sharedEmailsDropped: dropped,
    note: `${targets.length} ${targets.length === 1 ? "company" : "companies"} read, ${found} with a usable contact route.${
      found < targets.length ? ` The rest stopped somewhere specific — see each row.` : ""}`,
  };
}

/**
 * Learn a firm's email convention from what its own site publishes.
 *
 * Only called when asked, and only reports a pattern the published addresses
 * actually support. It generates nothing on its own — `candidateFromPattern` is
 * a separate, deliberate step, because a pattern found is not permission to
 * write to everybody in the building.
 */
export async function learnSitePattern(website: string): Promise<{
  finding: ReturnType<typeof learnPattern>; addressesFound: number; readFrom: string[];
}> {
  const paths = ["", "/contact", "/contact-us", "/about", "/about-us", "/team", "/our-team", "/people"];
  const found = new Map<string, string>();
  const readFrom: string[] = [];
  const host = HOST(website);

  for (const p of paths) {
    const url = website.replace(/\/$/, "") + p;
    const html = await politeFetch(url, 7_000);
    if (!html) continue;
    readFrom.push(url);
    const text = strip(html);
    for (const m of html.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)) {
      const e = m[0].toLowerCase();
      if (!e.endsWith(host) && !e.includes(host.split(".")[0])) continue;
      // A pattern needs the NAME behind the address. Look for it in the visible
      // text near the address, and skip the address entirely when it is absent —
      // guessing which of "j.smith" is first and which is last is how the
      // convention comes out backwards.
      const local = e.split("@")[0];
      const parts = local.split(/[._-]/).filter((x) => x.length > 1);
      if (parts.length !== 2) continue;
      const [a, b] = parts;
      const re = new RegExp(`\\b${escapeRe(a)}\\s+${escapeRe(b)}\\b`, "i");
      if (re.test(text)) found.set(e, `${a}|${b}`);
    }
  }

  const known = [...found.entries()].map(([email, names]) => {
    const [first, last] = names.split("|");
    return { email, first, last };
  });
  return { finding: learnPattern(known), addressesFound: known.length, readFrom };
}
