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
import { ACU_PER_GBP, USD_TO_GBP } from "@/shared/creative";
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
// 3. Hunter — the first PAID supplier, and the only one that verifies
// ---------------------------------------------------------------------------
//
// WHY THIS ONE, AND WHY LAST IN THE ORDER. Our crawl and the register answer
// "who is this company and who runs it" for nothing. Neither can answer "what is
// this person's address when the company does not publish it", and no amount of
// pattern-guessing turns an inference into a fact. Hunter can, and — the part
// that matters more — it can CHECK one against the real mailbox, which is the
// step that moves a contact out of `inferred` in `lead-harvest`.
//
// It runs after both free sources, so a lookup the crawl already answered never
// spends a credit. `enoughFound` stops the waterfall before it gets here in the
// common case; this exists for the hard one.
//
// EVERY ADDRESS IT RETURNS IS `provenance: "provider"`, INCLUDING THE ONES WITH
// SOURCES. Hunter reports where it saw an address, and it is tempting to promote
// that to `confirmed` — the codebase already had the discipline to refuse this,
// and it stands: `confirmed` in this platform means WE fetched the page and read
// it. A supplier's assertion that it once saw an address on a page is a
// different claim with a different failure mode, and the three provenances never
// convert into one another. The source URL travels with the candidate so a human
// can check it; what it does not do is upgrade the claim.
//
// COST, AND THE OWNER'S FLOOR. Hunter's Data Platform prices a Domain Search or
// Email Finder call at $0.05 and a verification at $0.011. `costAcu` is OUR
// spend, and `/api/contact-hunter` charges the customer exactly twice it, which
// is the margin floor. One number has to cover both calls, so it is the DEARER
// one: reserving for a search and spending on a verification recovers more than
// it cost, and the reverse would breach the floor. Derived from the shared
// constants rather than typed as a magic number, so a change to either moves
// this with it.
const HUNTER_SEARCH_USD = 0.05;
/** 4 ACUs at today's constants: $0.05 × 0.79 × 100 = 3.95, rounded up so the floor cannot be undercut. */
const HUNTER_COST_ACU = Math.ceil(HUNTER_SEARCH_USD * USD_TO_GBP * ACU_PER_GBP);

export const hunterKey = (): string => (process.env.HUNTER_API_KEY || "").trim();

/**
 * Read Hunter's answer WITHOUT asserting its shape.
 *
 * `scripts/check-casts.mjs` forbids a cast on external data, and this is why:
 * a supplier's JSON is the definition of data we do not control, and a cast
 * would turn a changed field into `undefined` flowing silently through the
 * engine rather than an empty result. Every field is checked and anything
 * unrecognised is simply absent.
 */
const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? { ...v } : {});
const asString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const asNumber = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The first source URL Hunter cites for an address, if it cites any. */
function firstSourceUrl(v: unknown): string | undefined {
  if (!Array.isArray(v)) return undefined;
  for (const s of v) {
    const uri = asString(asRecord(s).uri);
    if (uri) return uri;
  }
  return undefined;
}

/**
 * Hunter's own error envelope, turned into a sentence.
 *
 * It answers 4xx with `{ errors: [{ id, code, details }] }`, and the id is the
 * fact that decides what to do: `wrong_auth` is a bad key, `usage_exceeded` is
 * an empty balance, `too_many_requests` is a rate limit. Reporting "the lookup
 * failed" for all three is the failure this repository keeps writing down.
 */
export function hunterErrorNote(status: number, body: unknown): string {
  const errs = asRecord(body).errors;
  const first = Array.isArray(errs) ? asRecord(errs[0]) : {};
  const id = asString(first.id);
  const details = asString(first.details);
  if (id === "wrong_auth" || status === 401) return `Hunter rejected the API key${details ? ` — ${details}` : ""}. Check HUNTER_API_KEY on this deployment.`;
  if (id === "usage_exceeded" || status === 402) return `Hunter has no credits left${details ? ` — ${details}` : ""}. Buy more, or this provider stays dark and the free sources still run.`;
  if (id === "too_many_requests" || status === 429) return "Hunter rate-limited this deployment. Nothing was charged; try again shortly.";
  if (details) return `Hunter refused the request: ${details}`;
  return `Hunter answered HTTP ${status} with no reason given.`;
}

async function hunterGet(path: string, params: Record<string, string>, signal: AbortSignal): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; why: string }> {
  const key = hunterKey();
  if (!key) return { ok: false, why: "Not configured." };
  const q = new URLSearchParams({ ...params, api_key: key });
  let res: Response;
  try {
    res = await fetch(`https://api.hunter.io/v2/${path}?${q.toString()}`, { signal, headers: { Accept: "application/json" } });
  } catch (e) {
    // A network failure is not a refusal, and it is not billable either.
    return { ok: false, why: `Hunter could not be reached: ${e instanceof Error ? e.message : String(e)}. Nothing was charged.` };
  }
  let body: unknown = null;
  try { body = await res.json(); } catch { /* an empty or non-JSON body is handled below */ }
  if (!res.ok) return { ok: false, why: hunterErrorNote(res.status, body) };
  return { ok: true, data: asRecord(asRecord(body).data) };
}

export const hunter: EnrichmentProvider = {
  id: "hunter",
  costAcu: HUNTER_COST_ACU,
  // After both free sources. The order is the product decision this whole file
  // is built around: a paid credit is spent only on what free evidence missed.
  order: 2,

  health(): ProviderHealth {
    const key = hunterKey();
    return {
      id: this.id,
      configured: Boolean(key),
      note: key
        ? `Email finder and verifier. ${HUNTER_COST_ACU} ACUs a call, charged only when it returns something, and only after the free sources have run.`
        : "Not configured. Set HUNTER_API_KEY for an email finder and a real mailbox verifier — the one thing the crawl and the register cannot do.",
    };
  },

  async findPeople(input, signal): Promise<PersonCandidate[]> {
    const domain = HOST(input.domain || "");
    if (!domain) return [];
    const got = await hunterGet("domain-search", { domain, limit: "10" }, signal);
    if (!got.ok) return [];

    const organization = asString(got.data.organization);
    const rows = Array.isArray(got.data.emails) ? got.data.emails : [];
    const people: PersonCandidate[] = [];
    for (const row of rows) {
      const r = asRecord(row);
      const first = asString(r.first_name), last = asString(r.last_name);
      const fullName = [first, last].filter(Boolean).join(" ");
      // NO NAME, NO PERSON. A generic `info@` row carries an address and nobody
      // to address — it belongs in findEmails, not here, and inventing a name
      // from the local part is the fabrication this platform refuses.
      if (!fullName) continue;
      people.push({
        fullName,
        jobTitle: asString(r.position) || undefined,
        company: organization || input.company,
        domain,
        sourceUrl: firstSourceUrl(r.sources),
      });
    }
    return people;
  },

  async findEmails(input, signal): Promise<EmailCandidate[]> {
    const domain = HOST(input.domain || "");
    if (!domain) return [];

    // A NAME MAKES THIS A DIFFERENT, CHEAPER QUESTION. Email Finder answers one
    // person; Domain Search returns the mailbox list. Asking the broad one when
    // the narrow one would do spends the same credit for a worse answer.
    if (input.firstName && input.lastName) {
      const got = await hunterGet("email-finder", { domain, first_name: input.firstName, last_name: input.lastName }, signal);
      if (!got.ok) return [];
      const value = asString(got.data.email);
      if (!value) return [];
      return [{ value, provenance: "provider", sourceUrl: firstSourceUrl(got.data.sources) }];
    }

    const got = await hunterGet("domain-search", { domain, limit: "10" }, signal);
    if (!got.ok) return [];
    const rows = Array.isArray(got.data.emails) ? got.data.emails : [];
    const out: EmailCandidate[] = [];
    for (const row of rows) {
      const r = asRecord(row);
      const value = asString(r.value);
      if (!value) continue;
      out.push({
        value,
        provenance: "provider",
        sourceUrl: firstSourceUrl(r.sources),
        // Hunter reports the firm's convention. Carried as evidence, never used
        // to generate an address here — `candidateFromPattern` owns that, from a
        // pattern WE learned, and two pattern engines would disagree eventually.
        pattern: asString(asRecord(got.data).pattern) || undefined,
      });
    }
    return out;
  },

  async verifyEmail(email, signal): Promise<EmailVerification> {
    const got = await hunterGet("email-verifier", { email }, signal);
    if (!got.ok) {
      // COULD NOT ASK IS NOT INVALID. Returning `invalid: true` here would let a
      // rate limit or an empty balance delete a real contact — the exact defect
      // this codebase has written down four times, in a place where the cost is
      // a customer's data rather than a screen.
      return { email, deliverable: null, catchAll: false, invalid: false, why: got.why };
    }
    const status = asString(got.data.status).toLowerCase();
    const score = asNumber(got.data.score);
    const acceptAll = got.data.accept_all === true || status === "accept_all";
    const scoreNote = score === null ? "" : ` Hunter's confidence: ${score}/100.`;
    if (status === "valid") return { email, deliverable: true, catchAll: acceptAll, invalid: false, why: `Hunter's mailbox check accepted this address.${scoreNote}` };
    if (status === "invalid") return { email, deliverable: false, catchAll: acceptAll, invalid: true, why: `Hunter's mailbox check REFUSED this address — it does not exist.${scoreNote}` };
    if (acceptAll) return { email, deliverable: null, catchAll: true, invalid: false, why: `This domain accepts mail for every address, so no verifier on earth can tell whether this mailbox exists.${scoreNote}` };
    if (status === "disposable") return { email, deliverable: null, catchAll: false, invalid: false, why: "A disposable-mail domain. Deliverable today and gone next week; not worth outreach." };
    if (status === "webmail") return { email, deliverable: null, catchAll: false, invalid: false, why: `A personal webmail address rather than a company mailbox.${scoreNote}` };
    return { email, deliverable: null, catchAll: acceptAll, invalid: false, why: `Hunter could not determine this address${status ? ` (${status})` : ""} — which is an unknown, not a rejection.${scoreNote}` };
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
  { id: "people-data-labs", needs: "PDL_API_KEY", wouldProvide: "Person enrichment from a name plus an employer, which is what fills in the people our crawl cannot find on a team page." },
  { id: "abstract-phone", needs: "ABSTRACT_PHONE_KEY", wouldProvide: "Carrier lookup, so a number can move from PUBLISHED_UNVERIFIED to verified — which nothing here can do today." },
];

let registered = false;
/** Register the adapters that actually exist. Idempotent. */
export function registerBuiltInProviders(): void {
  if (registered) return;
  registerProvider(marketwarWeb);
  registerProvider(companiesHouse);
  // Registered unconditionally. `health()` reports whether it is configured and
  // every call returns [] without a key, so a deployment with no key behaves
  // exactly as it did before — and one that adds the key needs no redeploy of
  // this list. Registering only when configured would read the environment at
  // module load, which is the thing that makes a variable set later invisible.
  registerProvider(hunter);
  registered = true;
}

/** Test seam. Never called by product code. */
export function __resetRegistration(): void { registered = false; }

// Unused-import guard: `learnPattern` and `classifyEmail` are part of the same
// family and are deliberately NOT re-exported — the pattern engine lives in
// shared/contact-hunter.ts and lead-harvest owns classification. Referenced here
// so a future editor sees they were considered rather than forgotten.
void learnPattern; void classifyEmail;
