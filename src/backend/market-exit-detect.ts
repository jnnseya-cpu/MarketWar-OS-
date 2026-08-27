// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// THE DETECTOR — the part that actually goes and looks for a closure.
//
// WHY THIS FILE EXISTS. `shared/market-exit.ts` decides what evidence is worth
// and what may be published on it, and the dashboard rendered all of that
// beautifully against a hardcoded Kingsway Plumbing. A rulebook with nothing to
// judge is a library list. This is the part that produces real signals about a
// real company, so the rules have something to refuse.
//
// THE THREE SOURCES IT CAN ACTUALLY REACH, and what each is worth:
//
//   1. THE COMPANY REGISTER — the only OFFICIAL-tier source, and the only one
//      that can publish a closure on its own. UK Companies House has a free
//      API; with COMPANIES_HOUSE_API_KEY set, a company's `company_status`
//      ("dissolved", "liquidation", "administration") is a matter of public
//      record with a legal process behind it. Without the key there is no
//      official source at all, and the two-independent-sources rule becomes the
//      only route to publishing — which is exactly what it is for.
//
//   2. THE BUSINESS'S OWN SITE — operator tier. A closure notice on a page the
//      business controls is the business saying it about itself. Read with the
//      same politeness as every other crawl here, and matched on phrases that
//      announce a closure rather than merely mention one.
//
//   3. THE PRESS — observed tier, via the search gateway. A news report is
//      second-hand by definition, and a story about difficulty is not a story
//      about closure, so the phrase list is deliberately narrow.
//
// WHAT IT WILL NOT DO. It will not invent a signal to reach a threshold, it
// will not treat its own inability to reach a page as evidence of anything, and
// it will not return a confidence it did not derive. Every signal it emits
// carries the URL it came from, because `assessClosure` refuses anything else
// and this is the file that has to satisfy it.

import { webSearch } from "@/backend/search";
import { keyFromEnv } from "@/shared/api-key-hygiene";
import { parseRobots, robotsAllows, OUR_AGENT } from "@/backend/robots";
import type { ClosureSignal, ClosureSourceId } from "@/shared/market-exit";

export type DetectionSource = {
  id: ClosureSourceId | "none";
  checked: boolean;
  /** What happened. Present whether or not a signal came out of it. */
  outcome: string;
  evidenceUrl?: string;
};

export type Detection = {
  company: string;
  website?: string;
  signals: ClosureSignal[];
  /** Every source, including the ones that found nothing or could not run. */
  sources: DetectionSource[];
  note: string;
};

const HOST = (u: string) => { try { return new URL(u.startsWith("http") ? u : `https://${u}`).hostname.replace(/^www\./, ""); } catch { return ""; } };

/**
 * PHRASES THAT ANNOUNCE A CLOSURE, not phrases that mention one.
 *
 * "We are closed on Sundays" and "our Leeds branch has closed" and "we have
 * ceased trading" are three completely different statements, and a naive search
 * for "closed" finds all three. Each pattern here has to carry the announcement
 * itself — a perfect tense, or an explicit permanence — because a false
 * positive in this engine is a live business told the world it had failed.
 */
const CLOSURE_PHRASES: { re: RegExp; what: string; permanence: "closed" | "closing" | "relocated" }[] = [
  { re: /\b(?:we\s+have|has|have)\s+(?:now\s+)?ceased\s+trading\b/i, what: "states it has ceased trading", permanence: "closed" },
  { re: /\b(?:permanently|now)\s+closed\b/i, what: "states it is permanently closed", permanence: "closed" },
  { re: /\bno\s+longer\s+(?:trading|in\s+business|operating)\b/i, what: "states it is no longer trading", permanence: "closed" },
  { re: /\b(?:we\s+)?(?:have|has)\s+closed\s+(?:our|its|the)\s+(?:doors|business)\b/i, what: "states the business has closed", permanence: "closed" },
  { re: /\bin\s+(?:liquidation|administration|receivership)\b/i, what: "states it is in liquidation or administration", permanence: "closed" },
  { re: /\bgone\s+into\s+(?:liquidation|administration)\b/i, what: "states it has gone into liquidation", permanence: "closed" },
  { re: /\b(?:will\s+be|are)\s+closing\s+(?:down|permanently|for\s+good)\b/i, what: "announces it is closing down", permanence: "closing" },
  { re: /\bfinal\s+day\s+of\s+trading\b/i, what: "announces a final day of trading", permanence: "closing" },
  { re: /\b(?:we\s+have|has)\s+(?:moved|relocated)\s+to\b/i, what: "states it has moved", permanence: "relocated" },
];

/**
 * Phrases that look like the above and are not. Checked FIRST and, when one
 * matches the same sentence, the closure phrase is discarded.
 *
 * "Our old site has closed — we have moved to a new address" is a relocation
 * that contains a closure sentence, and "we are closed over Christmas" is a
 * shop with a holiday. Both would otherwise start a defamation.
 */
const NOT_A_CLOSURE = /\b(?:closed\s+(?:on\s+\w+days?|over\s+(?:christmas|easter|the\s+\w+)|for\s+(?:lunch|the\s+(?:holidays?|bank\s+holiday|weekend)))|temporarily\s+closed|closed\s+for\s+(?:refurbishment|renovation|maintenance|stocktaking))\b/i;

/**
 * SOMEBODY ELSE'S CLOSURE, on this company's page.
 *
 * An insolvency practitioner, a solicitor, an auctioneer, a business broker —
 * their sites are FULL of sentences about companies that have ceased trading,
 * because that is their line of work. "Our client has ceased trading" on a
 * liquidator's website would otherwise mark the liquidator as closed, and the
 * engine would then aim an advertising campaign at their customers.
 *
 * A sentence naming a third party as the subject is discarded whatever else it
 * contains. This costs the occasional real closure written in the third person,
 * which is the right side to err on when the alternative is defaming a trading
 * business.
 */
const SOMEBODY_ELSE = new RegExp([
  // "our client", "the company", "their supplier" — a third party named as the
  // subject. "the company" is included deliberately even though a business
  // sometimes calls ITSELF that: on a liquidator's case study it means a client,
  // and we cannot tell the two apart from one sentence.
  String.raw`\b(?:our|a|the|this|one|another|each|their)\s+(?:client|customer|supplier|competitor|business|company|firm|tenant|debtor|partner)s?\b`,
  // "We advise firms that have gone into liquidation" — a service description,
  // which is what an insolvency practitioner's entire website is.
  String.raw`\b(?:advise|advising|advis(?:es|ed)|help(?:s|ed|ing)?|assist(?:s|ed|ing)?|support(?:s|ed|ing)?|act(?:ing)?\s+for|represent(?:s|ed|ing)?|work(?:s|ed|ing)?\s+with|specialise[sd]?\s+in)\s+(?:\w+\s+){0,3}(?:firms?|businesses|companies|clients?|customers?|directors?|traders?)\b`,
  // Bare plurals with a relative clause: "companies that have ceased trading".
  String.raw`\b(?:firms|businesses|companies|clients|customers|directors|traders)\s+(?:that|who|which)\b`,
  String.raw`\bcase\s+stud(?:y|ies)\b`,
  // "If your business has ceased trading, we can help."
  String.raw`\bif\s+(?:you|your\s+\w+|a\s+\w+)\s+(?:have|has|is|are)\b`,
].join("|"), "i");

const strip = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/**
 * Find a closure announcement in a page's text, or say there is none.
 *
 * Sentence-scoped: the exclusion has to match the SAME sentence as the phrase,
 * because "We have ceased trading. Our showroom was closed for refurbishment
 * last year." is a closure with an irrelevant second sentence, and scanning the
 * whole page together would throw the first away on the second.
 */
export function findClosureStatement(text: string): { what: string; permanence: "closed" | "closing" | "relocated"; sentence: string } | null {
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (NOT_A_CLOSURE.test(sentence)) continue;
    if (SOMEBODY_ELSE.test(sentence)) continue;
    for (const p of CLOSURE_PHRASES) {
      if (p.re.test(sentence)) return { what: p.what, permanence: p.permanence, sentence: sentence.trim().slice(0, 240) };
    }
  }
  return null;
}

async function politeFetch(url: string, timeoutMs = 9_000): Promise<{ html: string; reachable: boolean; why: string }> {
  const host = HOST(url);
  if (!host) return { html: "", reachable: false, why: "Not a URL." };
  try {
    const r = await fetch(`https://${host}/robots.txt`, { signal: AbortSignal.timeout(4_000) });
    const txt = r.ok ? await r.text() : "";
    if (!robotsAllows(parseRobots(txt, r.ok), new URL(url).pathname, OUR_AGENT).allowed) {
      return { html: "", reachable: true, why: `${host} asks crawlers not to read this path.` };
    }
  } catch { /* permissive default */ }
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs), redirect: "follow",
      headers: { "User-Agent": `Mozilla/5.0 (compatible; ${OUR_AGENT}/1.0; +https://marketwaros.com)`, Accept: "text/html" },
    });
    if (!res.ok) {
      const answered = res.status === 404 || res.status === 410;
      return { html: "", reachable: answered, why: answered ? `${url} returned ${res.status}.` : `${host} returned ${res.status}.` };
    }
    const buf = await res.arrayBuffer();
    return { html: new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, 400_000)), reachable: true, why: "" };
  } catch (e) {
    return { html: "", reachable: false, why: e instanceof Error && /abort|timeout/i.test(e.message) ? `${host} did not answer in time.` : `${host} could not be reached.` };
  }
}

// ---------------------------------------------------------------------------
// 1. The company register — the only source that can publish on its own
// ---------------------------------------------------------------------------

export function companiesHouseKey(): string { return keyFromEnv(process.env.COMPANIES_HOUSE_API_KEY); }

/**
 * Map a register status onto a signal.
 *
 * `active` IS RECORDED, as a counter-signal. A register saying a company is
 * trading is the strongest possible evidence against a closure, and dropping it
 * because it is not what we were looking for is how a detector only ever finds
 * what it hunts. `assessClosure` reads contradictions and stops.
 */
const REGISTER_STATUS: Record<string, { type: string; source: ClosureSourceId; confidence: number } | undefined> = {
  dissolved: { type: "dissolution", source: "company_register", confidence: 0.97 },
  liquidation: { type: "insolvency_filing", source: "insolvency_register", confidence: 0.96 },
  administration: { type: "insolvency_filing", source: "insolvency_register", confidence: 0.95 },
  receivership: { type: "insolvency_filing", source: "insolvency_register", confidence: 0.95 },
  "voluntary-arrangement": { type: "insolvency_filing", source: "insolvency_register", confidence: 0.9 },
  "insolvency-proceedings": { type: "insolvency_filing", source: "insolvency_register", confidence: 0.94 },
  closed: { type: "dissolution", source: "company_register", confidence: 0.95 },
  active: { type: "trading_normally", source: "company_register", confidence: 0.95 },
};

/**
 * Read the register's reply, or refuse it.
 *
 * `await res.json()` is `any`, so an annotation on it is a promise nobody
 * verified — and this is the response that decides whether a named company gets
 * published as closed. A missing status or a missing company number means we do
 * not know, and "we do not know" must not arrive downstream wearing the shape of
 * an answer.
 */
export function firstRegisterHit(data: unknown): { companyNumber: string; title: string; status: string } | null {
  if (!data || typeof data !== "object") return null;
  const items = (data as { items?: unknown }).items;
  if (!Array.isArray(items) || items.length === 0) return null;
  const first = items[0];
  if (!first || typeof first !== "object") return null;
  const r = first as Record<string, unknown>;
  const companyNumber = typeof r.company_number === "string" ? r.company_number : "";
  const status = typeof r.company_status === "string" ? r.company_status : "";
  if (!companyNumber || !status) return null;
  return { companyNumber, title: typeof r.title === "string" ? r.title : companyNumber, status };
}

/**
 * What a register status means, or nothing.
 *
 * Exported so it can be driven. A test that greps the source for
 * "trading_normally" passes even after the ACTIVE row is deleted, because the
 * comparison against that string is still in the file — which is exactly what
 * happened.
 */
export function registerStatusSignal(status: string): { type: string; source: ClosureSourceId; confidence: number } | null {
  return REGISTER_STATUS[String(status ?? "").toLowerCase()] ?? null;
}

export async function checkRegister(company: string, at: string): Promise<{ signals: ClosureSignal[]; source: DetectionSource }> {
  const key = companiesHouseKey();
  if (!key) {
    return {
      signals: [],
      source: {
        id: "company_register", checked: false,
        outcome: "No COMPANIES_HOUSE_API_KEY, so the official register was not consulted. Without it there is no official-tier source at all, and a closure can only publish on two independent non-official sources — which is the rule working, not a gap to route around.",
      },
    };
  }
  try {
    const res = await fetch(`https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(company)}&items_per_page=1`, {
      signal: AbortSignal.timeout(10_000),
      // Companies House uses HTTP Basic with the key as the username.
      headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` },
    });
    if (!res.ok) {
      return {
        signals: [],
        source: {
          id: "company_register", checked: false,
          outcome: res.status === 401 || res.status === 403
            ? `The register refused the key (HTTP ${res.status}). Not a fact about the company — check COMPANIES_HOUSE_API_KEY.`
            : `The register answered HTTP ${res.status}, so nothing was learned from it.`,
        },
      };
    }
    const hit = firstRegisterHit(await res.json());
    if (!hit) {
      return { signals: [], source: { id: "company_register", checked: true, outcome: `No company matching "${company}" is on the register. That is not evidence of closure — it is evidence the name did not match.` } };
    }
    const mapped = REGISTER_STATUS[hit.status.toLowerCase()];
    const evidenceUrl = `https://find-and-update.company-information.service.gov.uk/company/${hit.companyNumber}`;
    if (!mapped) {
      return { signals: [], source: { id: "company_register", checked: true, evidenceUrl, outcome: `The register lists "${hit.title}" as "${hit.status}", which this engine does not map to a closure or to trading. Recorded, not interpreted.` } };
    }
    return {
      signals: [{
        businessId: company, source: mapped.source, signalType: mapped.type,
        observedAt: at, evidenceUrl, confidence: mapped.confidence,
      }],
      source: {
        id: mapped.source, checked: true, evidenceUrl,
        outcome: mapped.type === "trading_normally"
          ? `The register lists "${hit.title}" as ACTIVE. That is evidence AGAINST a closure and is recorded as such — a detector that only keeps what it is hunting finds a closure everywhere.`
          : `The register lists "${hit.title}" as "${hit.status}".`,
      },
    };
  } catch (e) {
    return { signals: [], source: { id: "company_register", checked: false, outcome: `The register could not be reached: ${(e as Error).message}. Our side of the connection, not a fact about the company.` } };
  }
}

// ---------------------------------------------------------------------------
// 2. The business's own site
// ---------------------------------------------------------------------------

export async function checkOwnSite(company: string, website: string | undefined, at: string): Promise<{ signals: ClosureSignal[]; source: DetectionSource }> {
  if (!website) {
    return { signals: [], source: { id: "business_website", checked: false, outcome: "No website given, so the business's own pages were not read." } };
  }
  const base = website.startsWith("http") ? website.replace(/\/$/, "") : `https://${website.replace(/\/$/, "")}`;
  let anyReachable = false;
  const whys: string[] = [];

  for (const path of ["", "/", "/contact", "/about", "/news"]) {
    const r = await politeFetch(base + path, 8_000);
    if (r.reachable) anyReachable = true;
    if (!r.html) { if (r.why) whys.push(r.why); continue; }
    const found = findClosureStatement(strip(r.html));
    if (found) {
      return {
        signals: [{
          businessId: company, source: "business_website",
          signalType: found.permanence === "relocated" ? "relocation_notice" : found.permanence === "closing" ? "closure_announcement" : "closure_announcement",
          observedAt: at, evidenceUrl: base + path, confidence: 0.9,
        }],
        source: { id: "business_website", checked: true, evidenceUrl: base + path, outcome: `Their own site ${found.what}: “${found.sentence}”` },
      };
    }
  }

  // A SITE WE COULD NOT READ IS NOT A CLOSED BUSINESS. The distinction the
  // contact hunter had to learn the hard way, applied here before it can do
  // damage — because here the wrong answer is published about a named company.
  if (!anyReachable) {
    return {
      signals: [],
      source: { id: "none", checked: false, outcome: `Their site could not be read (${whys[0] ?? "no response"}). That is OUR side of the connection failing. A site that does not answer is NOT a domain-inactive signal — a working business behind a firewall looks identical from here.` },
    };
  }
  return { signals: [], source: { id: "business_website", checked: true, outcome: "Their site is up and says nothing about closing. Recorded as read-and-clear rather than as nothing." } };
}

// ---------------------------------------------------------------------------
// 3. The press
// ---------------------------------------------------------------------------

export async function checkPress(company: string, where: string | undefined, at: string): Promise<{ signals: ClosureSignal[]; source: DetectionSource }> {
  const q = `"${company}"${where ? ` ${where}` : ""} (ceased trading OR liquidation OR administration OR "closes for good" OR "permanently closed")`;
  const res = await webSearch({ query: q, type: "news", gl: "gb" });
  if (res.mode !== "live") {
    return { signals: [], source: { id: "news_report", checked: false, outcome: res.providerError?.reason ?? "Live search is not configured, so the press was not checked." } };
  }
  for (const r of res.results) {
    const text = `${r.title ?? ""}. ${r.snippet ?? ""}`;
    // THE COMPANY MUST BE NAMED IN THE STORY. A search for a closure returns
    // closure stories; without this, any closure anywhere becomes this
    // company's, which is the single most dangerous false positive here.
    if (!text.toLowerCase().includes(company.toLowerCase().slice(0, Math.min(company.length, 24)))) continue;
    const found = findClosureStatement(text);
    if (found && r.link) {
      return {
        signals: [{
          businessId: company, source: "news_report", signalType: "closure_announcement",
          observedAt: at, evidenceUrl: String(r.link), confidence: 0.7,
        }],
        source: { id: "news_report", checked: true, evidenceUrl: String(r.link), outcome: `A news report naming this company ${found.what}: “${found.sentence}”` },
      };
    }
  }
  return { signals: [], source: { id: "news_report", checked: true, outcome: `${res.results.length} news results read; none both names this company and announces a closure.` } };
}

// ---------------------------------------------------------------------------
// The detector
// ---------------------------------------------------------------------------

/**
 * Look for closure evidence about one company, from every source available.
 *
 * Sequential, and every source reports whether it ran. What comes back is
 * evidence, NOT a verdict — `assessClosure` decides, and it is entitled to
 * refuse everything here. This file's only job is to make sure that when it
 * refuses, it is refusing real evidence rather than an empty array.
 */
export async function detectClosure(input: {
  company: string;
  website?: string;
  where?: string;
  at: string;
}): Promise<Detection> {
  const { company, website, where, at } = input;
  const signals: ClosureSignal[] = [];
  const sources: DetectionSource[] = [];

  for (const check of [
    () => checkRegister(company, at),
    () => checkOwnSite(company, website, at),
    () => checkPress(company, where, at),
  ]) {
    const r = await check();
    signals.push(...r.signals);
    sources.push(r.source);
  }

  const ran = sources.filter((s) => s.checked).length;
  return {
    company, website, signals, sources,
    note: signals.length === 0
      ? `${ran} of ${sources.length} sources could be checked, and none produced a closure signal. That is the honest answer: no evidence found, which is not the same as evidence of trading.`
      : `${signals.length} signal${signals.length === 1 ? "" : "s"} from ${ran} checked source${ran === 1 ? "" : "s"}. Whether that is enough to publish is not this step's decision.`,
  };
}
