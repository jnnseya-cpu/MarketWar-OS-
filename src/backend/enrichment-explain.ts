// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// WHY DID THIS ROW FIND NOTHING? ONE COMPANY, EVERY STEP, IN ONE ANSWER.
//
// WHAT THIS REPLACES. "I have Apollo, Hunter and Serper keys and it still does
// not work" is a sentence the platform could not answer. `/api/health/enrichment`
// says which keys EXIST. `/api/health/live` says which build is running. Neither
// says what happened to a row — and "it found nothing" has at least seven
// distinct causes that look identical from the outside:
//
//   1. The running build is older than the fix.
//   2. The search key is set and REJECTED, so no website is ever found.
//   3. A website is found but publishes no address anywhere.
//   4. An address is found and belongs to a directory, so it is refused.
//   5. The paid suppliers were never reached because the wallet said no.
//   6. A supplier was reached, and its own answer was empty.
//   7. A supplier refused us — bad key, no credit, rate limit.
//
// Every one of those needs a different action, and the vault's summary line
// cannot tell them apart. So this runs ONE named company through the real chain
// and reports each step with the reason it did or did not run.
//
// IT IS FREE BY DEFAULT. The free pass costs nothing but a crawl, and that is
// where most failures are. Reaching the paid suppliers spends real credit, so it
// is opt-in and authorised — the same rule `/api/health/email?send=` follows.

import { scrapeEnrich } from "@/backend/enrich";
import { serperKey, webSearch } from "@/backend/search";
import { hunterKey } from "@/backend/hunter-client";
import { apolloConfigured, apolloUsable } from "@/backend/enrich";
import { buildIdentity, type BuildIdentity } from "@/shared/build-identity";

export type ExplainStep = {
  stage: string;
  ok: boolean;
  detail: string;
  /** What to do about it, when there is something to do. */
  fix?: string;
};

export type ExplainResult = {
  company: string;
  /** Which code is answering. A fix that is not deployed is the commonest cause of "still not working". */
  build: BuildIdentity;
  keys: { serper: boolean; hunter: boolean; apollo: boolean; apolloBreakerTripped: boolean };
  steps: ExplainStep[];
  email: string | null;
  website: string | null;
  verdict: string;
};

/**
 * Run one company through the chain and say what happened at every stage.
 *
 * `allowPaid` is the budget in ACUs. Zero, the default, runs the free half only:
 * a diagnostic that spends money every time somebody opens it is one nobody is
 * allowed to run twice.
 */
export async function explainEnrichment(company: string, allowPaid = 0): Promise<ExplainResult> {
  const steps: ExplainStep[] = [];
  const name = String(company || "").trim();

  const out: ExplainResult = {
    company: name,
    build: buildIdentity(),
    keys: {
      serper: Boolean(serperKey()),
      hunter: Boolean(hunterKey()),
      apollo: apolloConfigured(),
      // SET AND STILL NOT USABLE IS A REAL STATE, and it is invisible in a
      // presence check. Apollo answers 403 when the plan has no API access, and
      // the client trips a one-hour breaker so the rest of a batch skips it. A
      // deployment in that state reports the key as present and Apollo as doing
      // nothing, which reads as the platform ignoring it.
      apolloBreakerTripped: apolloConfigured() && !apolloUsable(),
    },
    steps, email: null, website: null, verdict: "",
  };

  if (!name) {
    out.verdict = "No company name was given, so there is nothing to look up.";
    return out;
  }

  // 1. THE SEARCH KEY, ASKED RATHER THAN ASSUMED. A key that is present and
  //    rejected is the single likeliest cause of a whole list finding nothing,
  //    and it is indistinguishable from a missing key in every existing report.
  if (!out.keys.serper) {
    steps.push({
      stage: "search key", ok: false,
      detail: "SERPER_API_KEY is not set on this deployment, so no business name can be turned into a website.",
      fix: "Set SERPER_API_KEY in the hosting environment and redeploy. Without it every row must buy its domain from a paid supplier first.",
    });
  } else {
    const probe = await webSearch({ query: `${name} official site`, type: "search" });
    if (probe.mode === "demo") {
      steps.push({
        stage: "search key", ok: false,
        detail: `SERPER_API_KEY is SET and the provider refused it: ${probe.providerError?.reason || "no reason given"} (HTTP ${probe.providerError?.status ?? "?"}).`,
        fix: "A rejected key is not a missing key. Check the value is the current one and that the account has search credit left.",
      });
    } else {
      steps.push({ stage: "search key", ok: true, detail: `Live search answered with ${probe.results.length} result(s) for "${name}".` });
    }
  }

  // 2. THE FREE PASS, RUN FOR REAL. This is the same call the vault makes, so
  //    its `stage` is the row's real stopping point rather than a re-enactment.
  const free = await scrapeEnrich({ company: name });
  out.website = free.website;
  out.email = free.email;
  const STAGE_MEANING: Record<string, { detail: string; fix?: string }> = {
    found: { detail: "The company's own website published an address and it passed the ownership check." },
    search_unavailable: {
      detail: "The crawl could not run because live search was unavailable, so no website was even looked for.",
      fix: "Fix the search key above. Everything below depends on having a website to read.",
    },
    no_own_site: {
      detail: "No website of this company's own was found — only directory pages about it.",
      fix: "This is normal for very small businesses. A paid supplier can still resolve a domain; run this with ?paid=1 to see whether one does.",
    },
    site_no_email: {
      detail: "A website was found and it publishes no email address anywhere the crawler could read — usually a contact form only.",
      fix: "This is exactly what the paid suppliers are for. Run with ?paid=1, or press Find emails, and Hunter is asked about the domain.",
    },
    email_rejected: {
      detail: "An address was found and REFUSED because it does not belong to this company — a directory or agency inbox.",
      fix: "Nothing to fix. Sending to it would have reached the wrong business.",
    },
  };
  const meaning = STAGE_MEANING[free.stage || ""] ?? { detail: free.note || "The free pass finished with no recorded stage." };
  steps.push({
    stage: "free crawl", ok: Boolean(free.email),
    detail: `${meaning.detail}${free.website ? ` Website: ${free.website}.` : ""}`,
    fix: meaning.fix,
  });

  // 3. THE PAID CHAIN. Not run unless asked, and said plainly either way — a
  //    report that quietly skips the half somebody is asking about is worse than
  //    no report.
  if (free.email) {
    out.verdict = `Found ${free.email} from the company's own site, free. Nothing was charged and no supplier was needed.`;
    return out;
  }
  if (allowPaid <= 0) {
    steps.push({
      stage: "paid suppliers", ok: false,
      detail: "Not run. This check is free by default, so Hunter and Apollo were not asked.",
      fix: "Add &paid=1 to spend the budget of one row and see exactly what each supplier answers.",
    });
    out.verdict = `The free sources found no address for ${name}. Add &paid=1 to this URL to see what Hunter and Apollo say — that is the half a list like this depends on.`;
    return out;
  }

  const { enrichPaid } = await import("@/backend/enrich-paid");
  const paid = await enrichPaid({ company: name, website: free.website || undefined }, { maxCostAcu: allowPaid });
  out.email = paid.email;
  out.website = paid.website || out.website;
  steps.push({
    stage: "paid suppliers", ok: Boolean(paid.email),
    detail: paid.note,
    fix: paid.email ? undefined
      : "If a supplier answered nothing, this business is genuinely not in their data. If one refused us, the reason is in the detail above — that is a key or a credit problem, not a data one.",
  });

  out.verdict = paid.email
    ? `Found ${paid.email}. ${paid.note}`
    : `No address could be found for ${name} by the free crawl or by the paid suppliers. Read each step above: they fail for different reasons and only one of them is ever about the data.`;
  return out;
}
