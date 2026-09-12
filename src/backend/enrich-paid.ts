// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// THE PAID HALF OF ENRICHMENT, ON THE ONE WATERFALL.
//
// WHAT THIS REPLACES. The Customer Vault had its own chain — Apollo, then a
// scrape — and Contact Hunter had a different one: our own crawl, the company
// register, then Hunter. Two implementations of "find this company's email",
// neither screen able to use the other's supplier, and the owner holding keys
// for both. The vault could not even import the Hunter adapter: the module
// holding it imports the vault's scraper, so the cycle decided it.
//
// THE FREE PASS IS NOT ROUTED THROUGH HERE, AND THAT IS DELIBERATE. The vault's
// scraper returns a phone number, a website, a contact name and a `stage` saying
// where the row stopped — things the waterfall's candidate types do not carry.
// Sending the free pass through it would have quietly dropped all four, which is
// a downgrade wearing a refactor's clothes. So the free pass stays exactly as it
// was, and everything it could not answer comes here.
//
// ORDER CHANGES, AND THE OWNER SHOULD KNOW. Apollo used to run FIRST, before the
// free crawl. On the waterfall it runs by COST, after our own crawl, the company
// register and Hunter. Fewer Apollo credits are spent on rows a free source
// would have answered; a row that only a licensed database can answer still
// reaches it. That is the waterfall's whole doctrine and it is why the merge was
// worth asking for.

import { registerBuiltInProviders } from "@/backend/enrichment-adapters";
import { findCompanyEmail } from "@/backend/enrichment-provider";
import { isPersonalProvider } from "@/backend/enrich";
import type { EnrichInput, EnrichResult } from "@/backend/enrich";

/** Role mailboxes a business publishes to be written to. */
const ROLE = /^(info|hello|enquiries|enquiry|contact|sales|bookings|admin|office|reception|events)@/;

const hostOf = (v: string): string => {
  try { return new URL(v.startsWith("http") ? v : `https://${v}`).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return ""; }
};

/**
 * One company through the paid waterfall.
 *
 * `maxCostAcu` is the budget the CALLER has already charged for, halved to hold
 * the margin floor. Zero means free providers only, which is what the waterfall
 * defaults to — so a mistake here spends nothing rather than spending silently.
 */
export async function enrichPaid(
  input: EnrichInput,
  opts: { maxCostAcu: number; deadlineMs?: number } = { maxCostAcu: 0 },
): Promise<EnrichResult> {
  registerBuiltInProviders();

  const base: EnrichResult = {
    company: input.company, website: input.website || null, email: null,
    emailConfidence: "none", phone: null, source: "none", mode: "live", note: "",
  };
  const domain = hostOf(input.website || "");

  // NO DOMAIN IS THE NORMAL CASE, NOT A DEAD END — and treating it as one made
  // this useless on exactly the list it was built for.
  //
  // A prospecting import is a column of business NAMES. The free crawl turns a
  // name into a website through live search, and when that search has no key or
  // a rejected one, every row reaches here with nothing. An earlier version
  // returned at this point, which meant a licensed database that can answer
  // "what domain is Wembley Stadium" was never asked the one question it is best
  // at. The chain resolves the domain itself now, cost-checked as a pair with
  // the address lookup that follows, so a credit is never spent on a domain the
  // budget could not then use.
  const run = await findCompanyEmail({
    company: input.company,
    domain,
    maxCostAcu: Math.max(0, opts.maxCostAcu),
    deadlineMs: opts.deadlineMs ?? 14_000,
  });

  const spent = run.costAcu;
  const paidRan = run.steps.filter((s) => s.ran && s.costAcu > 0).map((s) => s.provider);
  const who = paidRan.length ? [...new Set(paidRan)].join(" and ") : "";

  // THE OWNERSHIP GATE APPLIES TO A SUPPLIER EXACTLY AS IT APPLIES TO A CRAWL.
  // An address on somebody else's domain is a directory inbox, and paying for it
  // does not make it this company's. This is the defect the vault has already
  // been burned by once, and a paid result is the likeliest place for it to
  // return, because a broker's row carries no page for anyone to check.
  // The domain the chain ended up with, which may be one a supplier resolved.
  const companyDomain = run.domain || domain;
  const usable = run.emails
    .map((e) => ({ ...e, value: e.value.toLowerCase() }))
    .filter((e) => {
      const host = e.value.split("@")[1] || "";
      if (!host) return false;
      if (isPersonalProvider(e.value)) return false;
      if (!companyDomain) return false;
      return host === companyDomain || host.endsWith(`.${companyDomain}`);
    });

  // A PUBLISHED ADDRESS BEATS A BOUGHT ONE, and a role mailbox beats a named row
  // from a broker's list: info@ exists to be written to, while the named contact
  // on a licensed database is the one most likely to be stale or the wrong
  // person. Confirmed first, then role, then whatever is left.
  const picked =
    usable.find((e) => e.provenance === "confirmed" && ROLE.test(e.value)) ??
    usable.find((e) => e.provenance === "confirmed") ??
    usable.find((e) => ROLE.test(e.value)) ??
    usable[0];

  const website = base.website || (run.domain ? `https://${run.domain}` : null);
  const person = run.person;

  if (!picked) {
    return {
      ...base,
      website,
      contactName: person?.fullName ?? null,
      contactTitle: person?.jobTitle ?? null,
      supplierRefusals: run.refusals,
      stage: "site_no_email",
      note: spent > 0
        ? `${who || "A paid supplier"} was asked and returned no address that belongs to ${input.company}. ${spent} ACU(s) of supplier cost.`
        : run.note || "No paid supplier was affordable or configured, so only the free sources ran.",
    };
  }

  return {
    ...base,
    website,
    email: picked.value,
    // CONFIRMED MEANS WE READ THE PAGE. A supplier citing a source is a weaker
    // claim, and collapsing the two turns a bought guess into a fact downstream.
    emailConfidence: picked.provenance === "confirmed" ? "high" : "medium",
    contactName: person?.fullName ?? null,
    contactTitle: person?.jobTitle ?? null,
    // THE SUPPLIER THAT FOUND THE ADDRESS, not merely one that was paid on this
    // row. Apollo resolving a domain and Hunter finding the address on it is the
    // ordinary case now, and crediting Apollo for it is the field somebody reads
    // when deciding which key is worth renewing.
    source: run.emailProvider[picked.value] === "apollo" ? "apollo"
      : run.emailProvider[picked.value] === "hunter" ? "hunter"
      : "search",
    stage: "found",
    supplierRefusals: run.refusals,
    note: `${picked.value} via ${who || "the free sources"}${spent ? ` — ${spent} ACU(s) of supplier cost` : ""}.`,
  };
}

/** The same, for a batch, with a small concurrency so one slow supplier cannot stall the rest. */
export async function enrichPaidBatch(
  inputs: EnrichInput[],
  opts: { maxCostAcu: number; concurrency?: number },
): Promise<EnrichResult[]> {
  const out: EnrichResult[] = new Array(inputs.length);
  const limit = Math.max(1, Math.min(opts.concurrency ?? 4, 8));
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, inputs.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= inputs.length) return;
      try {
        out[i] = await enrichPaid(inputs[i], { maxCostAcu: opts.maxCostAcu });
      } catch (e) {
        // ONE ROW'S SUPPLIER FAILURE IS NOT THE BATCH'S. The vault charges per
        // row; throwing here would lose every other row's result along with it.
        out[i] = {
          company: inputs[i].company, website: inputs[i].website || null, email: null,
          emailConfidence: "none", phone: null, source: "none", mode: "live",
          note: `This row could not be looked up: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    }
  });
  await Promise.all(workers);
  return out;
}
