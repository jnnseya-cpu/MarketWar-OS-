// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// THE ADAPTERS.
//
// TWO ARE REAL AND THE REST ARE HONESTLY ABSENT. This file implements the two
// suppliers this platform can actually reach and test — its own crawler and the
// UK company register — and declares nothing it cannot run. Writing a Hunter or
// a People Data Labs adapter without a key to test it against would produce code
// that compiles, ships, and fails the first time somebody pays for it: the
// mapping is guesswork, the error shapes are guesswork, and nothing here could
// tell the difference. When a key exists, the adapter is thirty lines against
// the interface beside this comment.
//
// THE ORDER IS THE POINT. Our own crawl runs first and costs nothing — and it
// is also the BEST evidence, because a company's own page is the primary source
// a data broker is selling a copy of. A paid provider exists to fill what the
// free ones could not, which is the opposite of how these stacks are usually
// assembled.

import { scrapeEnrich, isPersonalProvider } from "@/backend/enrich";
import { verifyEmail as harvestVerify, classifyEmail } from "@/backend/lead-harvest";
import { extractDecisionMaker, learnSitePattern } from "@/backend/contact-hunt-run";
import { companiesHouseKey, firstRegisterHit } from "@/backend/market-exit-detect";
import { parseRobots, robotsAllows, OUR_AGENT } from "@/backend/robots";
import { candidateFromPattern, learnPattern } from "@/shared/contact-hunter";
import { readTitle } from "@/shared/contact-confidence";
import {
  registerProvider,
  type EnrichmentProvider, type CompanyCandidate, type PersonCandidate,
  type EmailCandidate, type EmailVerification, type ProviderHealth,
} from "@/backend/enrichment-provider";

const HOST = (u: string) => { try { return new URL(u.startsWith("http") ? u : `https://${u}`).hostname.replace(/^www\./, ""); } catch { return ""; } };

async function readPage(url: string, signal: AbortSignal): Promise<string> {
  const host = HOST(url);
  if (!host) return "";
  try {
    const r = await fetch(`https://${host}/robots.txt`, { signal });
    const txt = r.ok ? await r.text() : "";
    if (!robotsAllows(parseRobots(txt, r.ok), new URL(url).pathname, OUR_AGENT).allowed) return "";
  } catch { /* permissive default */ }
  try {
    const res = await fetch(url, {
      signal, redirect: "follow",
      headers: { "User-Agent": `Mozilla/5.0 (compatible; ${OUR_AGENT}/1.0; +https://marketwaros.com)`, Accept: "text/html" },
    });
    if (!res.ok) return "";
    const buf = await res.arrayBuffer();
    return new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, 400_000));
  } catch { return ""; }
}

const strip = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------
// 1. MarketWar's own crawl — free, and the strongest evidence there is
// ---------------------------------------------------------------------------

export const marketwarWeb: EnrichmentProvider = {
  id: "marketwar-web",
  costAcu: 0,
  order: 0,
  health(): ProviderHealth {
    return { id: this.id, configured: true, note: "Always available. Reads only the company's own public pages, robots.txt first, and costs nothing." };
  },

  async findPeople(input, signal): Promise<PersonCandidate[]> {
    const domain = input.domain;
    if (!domain) return [];
    const base = `https://${HOST(domain)}`;
    const wanted = input.title ? [input.title] : [];
    for (const path of ["/about", "/about-us", "/team", "/our-team", "/meet-the-team", "/people", "/leadership", "/management", "/contact"]) {
      if (signal.aborted) return [];
      const html = await readPage(base + path, signal);
      if (!html) continue;
      const hit = extractDecisionMaker(strip(html), wanted);
      if (hit) {
        return [{
          fullName: hit.name, jobTitle: hit.title, company: input.company, domain,
          sourceUrl: base + path,
          // NOT from a register. This is the company describing its own staff,
          // which is what makes the operational role claimable at all.
          fromRegistryOnly: false,
        }];
      }
    }
    return [];
  },

  async findEmails(input, signal): Promise<EmailCandidate[]> {
    const domain = input.domain;
    if (!domain) return [];
    const out: EmailCandidate[] = [];

    // PUBLISHED ADDRESSES FIRST. `scrapeEnrich` already refuses an address that
    // belongs to somebody else — a designer, a supplier, an embedded widget.
    const enriched = await scrapeEnrich({ company: input.fullName ? `${input.fullName}` : domain, website: `https://${HOST(domain)}` });
    if (enriched.email && !isPersonalProvider(enriched.email)) {
      out.push({ value: enriched.email, provenance: "confirmed", sourceUrl: enriched.website ?? undefined });
    }
    if (signal.aborted || !input.firstName || !input.lastName) return out;

    // THEN, AND ONLY THEN, A GENERATED CANDIDATE. It needs the firm's own
    // convention learned from addresses it has already published — three of
    // them, because below that a match is a coincidence — and what comes out is
    // marked `inferred` and is never presented as published.
    const pattern = await learnSitePattern(`https://${HOST(domain)}`);
    const made = candidateFromPattern({
      finding: pattern.finding, first: input.firstName, last: input.lastName, domain: HOST(domain),
    });
    if (made.ok) out.push({ value: made.candidate.value, provenance: "inferred", pattern: pattern.finding.pattern ?? undefined });
    return out;
  },

  async verifyEmail(email): Promise<EmailVerification> {
    // The twelve-check verifier that already exists. It reports what it could
    // NOT run rather than counting an unrun check as a pass, which is why a
    // "deliverable" here is null rather than false when no SMTP probe happened.
    const v = harvestVerify(email, {});
    const catchAllCheck = v.checks.find((c) => c.name === "catch_all");
    const mx = v.checks.find((c) => c.name === "mx_record");
    return {
      email,
      deliverable: v.verdict === "reject" ? false : v.verdict === "safe" && mx?.pass === true ? true : null,
      catchAll: catchAllCheck?.pass === false,
      invalid: v.verdict === "reject",
      why: `${v.note} ${v.notRun.length ? `Not run without a live probe: ${v.notRun.join(", ")}. Those are reported, never counted as passes.` : ""}`.trim(),
    };
  },
};

// ---------------------------------------------------------------------------
// 2. The UK company register — free, official, and NOT a source of buyers
// ---------------------------------------------------------------------------

type Officer = { name: string; role: string; resignedOn?: string };

/** Read the officers list, or refuse it. `await res.json()` is `any`. */
export function officersFrom(data: unknown): Officer[] {
  if (!data || typeof data !== "object") return [];
  const items = (data as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const out: Officer[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name : "";
    const role = typeof r.officer_role === "string" ? r.officer_role : "";
    if (!name || !role) continue;
    // A RESIGNED OFFICER IS NOT AN OFFICER. The register keeps them forever,
    // and a list that includes them is a list of people who used to be there.
    if (typeof r.resigned_on === "string" && r.resigned_on) continue;
    out.push({ name, role });
  }
  return out;
}

/** "SMITH, John Andrew" — the register's format, not a person's name. */
export function tidyOfficerName(raw: string): string {
  const m = raw.match(/^([^,]+),\s*(.+)$/);
  if (!m) return raw.trim();
  const surname = m[1].trim();
  const rest = m[2].trim();
  // Cased on every word boundary, INCLUDING after an apostrophe or a hyphen.
  // Naive title case turns "O'BRIEN" into "O'brien" and "SMITH-JONES" into
  // "Smith-jones", and a name rendered wrong is the first thing its owner sees.
  const cased = (s: string) =>
    s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_m, sep, ch) => sep + ch.toUpperCase());
  return `${cased(rest)} ${cased(surname)}`;
}

export const companiesHouse: EnrichmentProvider = {
  id: "companies-house",
  costAcu: 0,
  order: 1,
  health(): ProviderHealth {
    const key = companiesHouseKey();
    return {
      id: this.id, configured: Boolean(key),
      note: key
        ? "UK company register — official company status and current officers. Free."
        : "Not configured. Set COMPANIES_HOUSE_API_KEY (free from Companies House) for official company identity and officers.",
    };
  },

  async findCompany(input, signal): Promise<CompanyCandidate[]> {
    const key = companiesHouseKey();
    const q = input.name || input.domain;
    if (!key || !q) return [];
    const res = await fetch(`https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(q)}&items_per_page=1`, {
      signal, headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` },
    });
    if (!res.ok) return [];
    const hit = firstRegisterHit(await res.json());
    if (!hit) return [];
    return [{
      legalName: hit.title, companyNumber: hit.companyNumber, country: "GB",
      status: hit.status, domain: input.domain,
      sourceUrl: `https://find-and-update.company-information.service.gov.uk/company/${hit.companyNumber}`,
    }];
  },

  async findPeople(input, signal): Promise<PersonCandidate[]> {
    const key = companiesHouseKey();
    if (!key || !input.company) return [];
    // Resolve the number first — officers are keyed on it, not on a name.
    const found = await this.findCompany!({ name: input.company, domain: input.domain }, signal);
    const number = found[0]?.companyNumber;
    if (!number) return [];

    const res = await fetch(`https://api.company-information.service.gov.uk/company/${number}/officers?register_type=directors&items_per_page=20`, {
      signal, headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` },
    });
    if (!res.ok) return [];
    const officers = officersFrom(await res.json());
    const sourceUrl = `https://find-and-update.company-information.service.gov.uk/company/${number}/officers`;

    // EVERY ONE OF THESE IS MARKED `fromRegistryOnly`, and that flag is what
    // stops the engine calling a company officer a Procurement Director.
    //
    // A register "Director" is a legal role about filings and liability. In a
    // firm of any size the person who buys things is not on this list, and
    // addressing somebody by a job they do not hold is how outreach reads as
    // spam to the one person who knows for certain. `readTitle` refuses the
    // department, `claimsOperationalRole` refuses the upgrade, and the surface
    // shows them as officers who need confirming.
    return officers.map((o) => {
      const reading = readTitle(o.role, { fromRegistryOnly: true });
      return {
        fullName: tidyOfficerName(o.name),
        jobTitle: o.role,
        company: found[0]?.legalName ?? input.company,
        domain: input.domain,
        sourceUrl,
        fromRegistryOnly: true,
        // Carried so a surface prints the refusal rather than the title. Without
        // this the UI has the flag but not the sentence, and what gets rendered
        // is the register's word "director" with no qualification at all.
        roleNote: reading.why,
      };
    });
  },
};

// ---------------------------------------------------------------------------
// Providers this platform does NOT have, stated rather than stubbed
// ---------------------------------------------------------------------------

/**
 * The suppliers the specification names, and why none of them is here.
 *
 * A stub that compiles and has never been run against the real API is worse
 * than an absence: it looks like coverage in a code review, it passes a type
 * check, and it fails the first time somebody pays for it — with a mapping
 * nobody verified and error shapes nobody has seen. When a key exists, each is
 * a small adapter against `EnrichmentProvider` and the waterfall picks it up by
 * registration order with no other change.
 */
export const NOT_IMPLEMENTED: { id: string; needs: string; wouldProvide: string }[] = [
  { id: "hunter", needs: "HUNTER_API_KEY", wouldProvide: "Domain search, email finder and a second verifier — the strongest single addition, because it verifies against real mailboxes rather than inferring." },
  { id: "people-data-labs", needs: "PDL_API_KEY", wouldProvide: "Person enrichment from a name plus an employer, which is what fills in the people our crawl cannot find on a team page." },
  { id: "abstract-phone", needs: "ABSTRACT_PHONE_KEY", wouldProvide: "Carrier lookup, so a number can move from PUBLISHED_UNVERIFIED to verified — which nothing here can do today." },
];

let registered = false;
/** Register the adapters that actually exist. Idempotent. */
export function registerBuiltInProviders(): void {
  if (registered) return;
  registerProvider(marketwarWeb);
  registerProvider(companiesHouse);
  registered = true;
}

/** Test seam. Never called by product code. */
export function __resetRegistration(): void { registered = false; }

// Unused-import guard: `learnPattern` and `classifyEmail` are part of the same
// family and are deliberately NOT re-exported — the pattern engine lives in
// shared/contact-hunter.ts and lead-harvest owns classification. Referenced here
// so a future editor sees they were considered rather than forgotten.
void learnPattern; void classifyEmail;
