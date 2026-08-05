// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// The crawl, kept — so everything downstream can use it.
//
// THE DEFECT THIS EXISTS TO FIX. On the SiteRaid page a customer runs the deep
// crawl: eight pages read, five hundred and thirty things pulled out of the
// HTML — the tagline, seven calls to action, six prices, four trust signals,
// the colours, the fonts. Then they press "Run instant audit" directly below it
// and get **nothing measured, thirty-six times over**, an unranked attack map,
// and a strategy agent that opens with "I have zero verified facts about what
// this business actually sells".
//
// Every one of those statements was true of the request that produced it. The
// audit was called with a business name and no evidence, so it correctly
// refused to score. The crawl result was sitting in the browser's memory, four
// hundred pixels above, and nothing carried it across.
//
// That is the difference between a platform that reads your site and a platform
// that shows you it read your site. So the crawl is stored against the brand
// the moment it runs, and the audit, the attack map, the agents and the
// campaign engine all read it from here.
//
// TWO RULES.
//
//  1. STORED FACTS ARE STILL MEASUREMENTS, AND STILL AGE. A crawl from March is
//     evidence about March. Everything returned carries how old it is, and the
//     audit says which crawl it scored rather than implying it just looked.
//
//  2. NOTHING IS INFERRED ON THE WAY IN. What goes in is what the crawler read.
//     The audience, the vertical, the value proposition are inferences and are
//     labelled as such by the engines that make them — never promoted here.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import type { DeepCrawlResult } from "@/backend/deep-crawl";
import type { CrawlReport } from "@/backend/crawler";
import type { SiteExtraction } from "@/backend/site-extract";

export type SiteFacts = {
  brandId: string;
  url: string;
  host: string;
  at: string;                 // when the crawl ran
  pagesRead: number;
  partial: boolean;
  audit: CrawlReport;
  extraction: SiteExtraction | null;
};

export type AgedSiteFacts = SiteFacts & { ageDays: number; stale: boolean };

// A site changes, but not usually in a fortnight. Past this the facts are still
// used — refusing to score because the crawl is three weeks old would be the
// same unhelpfulness in a different coat — but the age is stated.
export const STALE_AFTER_DAYS = 14;

const COLLECTION = "site_facts";
const mem = new Map<string, SiteFacts>();
const useDb = () => Boolean(adminConfigured && adminDb);

export function factsAreDurable(): boolean { return useDb(); }

export async function saveSiteFacts(brandId: string, crawl: DeepCrawlResult, nowISO: string): Promise<SiteFacts | null> {
  const id = (brandId || "").trim();
  if (!id || !crawl) return null;
  // A crawl that read nothing is not a fact about the site, it is a fact about
  // the request. Storing it would let a blocked fetch overwrite a good crawl.
  const readable = crawl.pages.filter((p) => p.ok).length;
  if (!readable) return null;

  const facts: SiteFacts = {
    brandId: id,
    url: crawl.startUrl,
    host: crawl.host,
    at: nowISO,
    pagesRead: readable,
    partial: crawl.partial,
    audit: crawl.audit,
    extraction: crawl.extraction,
  };
  mem.set(id, facts);
  if (useDb()) {
    try { await adminDb!.collection(COLLECTION).doc(id.replace(/\//g, "_")).set(facts); } catch { /* memory copy serves this instance */ }
  }
  return facts;
}

export async function latestSiteFacts(brandId: string, nowISO = new Date().toISOString()): Promise<AgedSiteFacts | null> {
  const id = (brandId || "").trim();
  if (!id) return null;
  let facts = mem.get(id) || null;
  if (!facts && useDb()) {
    try {
      const snap = await adminDb!.collection(COLLECTION).doc(id.replace(/\//g, "_")).get();
      facts = snap.exists ? (snap.data() as SiteFacts) : null;
    } catch { facts = null; }
  }
  if (!facts) return null;
  const t = new Date(facts.at).getTime();
  const now = new Date(nowISO).getTime();
  const ageDays = Number.isNaN(t) || Number.isNaN(now) ? 0 : Math.max(0, Math.floor((now - t) / 86_400_000));
  return { ...facts, ageDays, stale: ageDays > STALE_AFTER_DAYS };
}

// How to describe the evidence in one line, so a score never implies a crawl
// that did not happen just now.
export function provenance(f: AgedSiteFacts): string {
  const when = f.ageDays === 0 ? "today" : f.ageDays === 1 ? "yesterday" : `${f.ageDays} days ago`;
  return `Measured from the crawl of ${f.host} ${when} — ${f.pagesRead} page(s) read${f.partial ? ", a sample of the site rather than all of it" : ""}.`;
}

// ---------------------------------------------------------------------------
// What the crawl proves, as facts the agent network can read
//
// These go into Brand Memory as `measured`, because a count of what is in the
// HTML is a count of what is in the HTML. Anything requiring judgement — who
// the audience is, what vertical this is, whether the offer is any good — is
// NOT written here. Those are inferences, and the modules that make them label
// them as inferences.
// ---------------------------------------------------------------------------
export type MemoryFact = { key: string; value: string; note?: string };

export function memoryFactsFrom(f: SiteFacts): MemoryFact[] {
  const out: MemoryFact[] = [];
  const x = f.extraction;
  const push = (key: string, value: string | number | undefined | null, note?: string) => {
    if (value === undefined || value === null || value === "") return;
    out.push({ key, value: String(value), note });
  };

  push("brand.website", f.url);
  push("brand.pages-read", f.pagesRead, "from the deep crawl");
  if (!x) return out;

  push("brand.name-on-site", x.brand?.name);
  push("brand.tagline", x.brand?.tagline);
  if (x.products?.values?.length) push("offer.products", x.products.values.slice(0, 12).join("; "), `${x.products.values.length} found in the markup`);
  if (x.services?.values?.length) push("offer.services", x.services.values.slice(0, 12).join("; "), `${x.services.values.length} found in the markup`);
  if (x.ctas?.length) push("brand.ctas", x.ctas.slice(0, 8).join(" · "), `${x.ctas.length} calls to action on the pages read`);
  if (x.trustSignals?.length) push("reputation.trust-signals", x.trustSignals.slice(0, 6).join(" · "), `${x.trustSignals.length} published on the site`);

  // Prices are split deliberately. A price in structured data is declared by
  // the business and can be quoted; a number that merely appears in body text
  // might be a phone number, a year or a competitor's price.
  const declared = (x.pricing || []).filter((p) => p.declared).map((p) => `${p.value}${p.currency ? ` ${p.currency}` : ""}`);
  const seen = (x.pricing || []).filter((p) => !p.declared).map((p) => p.value);
  if (declared.length) push("offer.prices-declared", declared.slice(0, 8).join(", "), "declared in structured data — quotable");
  if (seen.length) push("offer.prices-seen", seen.slice(0, 8).join(", "), "seen in page text only — NOT quotable as their price");

  const rated = (x.reviews || []).filter((r) => r.rating);
  if (rated.length) push("reputation.rating-on-site", rated.map((r) => `${r.rating}${r.count ? ` from ${r.count}` : ""}`).join("; "), "published on their own site — their claim, not a verified aggregate");
  if (x.faqs?.length) push("content.faqs", String(x.faqs.length), "questions their own FAQ answers");
  const contact = [x.contact?.address, ...(x.contact?.phones || []).slice(0, 2), ...(x.contact?.emails || []).slice(0, 2)].filter(Boolean);
  if (contact.length) push("brand.contact", contact.join(" · "));
  return out;
}

export function __resetSiteFacts(): void { mem.clear(); }
