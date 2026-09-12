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

export type RunDiagnosis = {
  /** One line naming the cause, for the top of the screen. */
  headline: string;
  /** The exact thing to change, or "" when there is nothing to change. */
  fix: string;
  /** True when this is a configuration fault rather than a fact about the data. */
  actionable: boolean;
};

/**
 * WHY DID THIS RUN FIND NOTHING? DECIDED HERE, SHOWN ON THE SCREEN.
 *
 * WHAT THIS REPLACES, AND IT WAS MY MISTAKE. I built the explain endpoint above
 * and then told the owner to open a URL and read JSON. That is precisely the
 * rule this repository holds me to — never tell the owner to do by hand what the
 * platform should do for them; when the answer is "go and look", the defect is
 * that nothing is looking. A diagnostic somebody has to go and run is a
 * diagnostic that does not exist.
 *
 * So the run diagnoses ITSELF. Pure, and it costs nothing: every fact below is
 * already in the results the batch just produced, plus the key states. No second
 * crawl, no second search, nothing to authorise.
 *
 * IT NAMES ONE CAUSE. The old note listed four counts and left the reader to
 * work out which mattered — and when the answer is "your search key is being
 * refused", a breakdown of website coverage is noise sitting on top of it.
 */
export function diagnoseRun(input: {
  results: { email: string | null; mode: string; stage?: string; providerError?: string }[];
  keys: { serper: boolean; hunter: boolean; apollo: boolean; apolloBreakerTripped: boolean };
  paidWasRun: boolean;
  paidRefusedReason?: string;
}): RunDiagnosis | null {
  const rows = input.results || [];
  if (!rows.length) return null;
  const found = rows.filter((r) => r.email).length;
  if (found > 0) return null; // Something worked. A diagnosis would be noise.

  const providerError = rows.find((r) => r.providerError)?.providerError;
  const demo = rows.filter((r) => r.mode === "demo").length;

  // 1. THE SEARCH KEY, FIRST, because everything else depends on it and because
  //    a key that is SET and being refused is invisible in every other report.
  if (!input.keys.serper) {
    return {
      headline: "No search key, so no website could be found for any of these businesses.",
      fix: "Set SERPER_API_KEY on the deployment and redeploy. It turns a business name into a website, which every other step needs.",
      actionable: true,
    };
  }
  if (providerError || demo === rows.length) {
    return {
      headline: `The search provider refused this deployment's key, so no website was looked up. ${providerError || ""}`.trim(),
      fix: "SERPER_API_KEY is SET and being rejected — it is wrong, revoked, or out of credit. Replacing the value is the fix; setting it again is not.",
      actionable: true,
    };
  }

  // 2. THE PAID SUPPLIERS, when they were the ones that could have answered.
  if (!input.paidWasRun) {
    return {
      headline: "These businesses publish no address a crawler can read, and the paid suppliers were not asked.",
      fix: input.paidRefusedReason
        || "Top up the ACU balance. Rows the free crawl cannot answer go to Hunter and then Apollo, charged only for the rows that reach them.",
      actionable: true,
    };
  }
  if (input.keys.apolloBreakerTripped) {
    return {
      headline: "Apollo refused this deployment and was skipped for the rest of the run.",
      fix: "Apollo answers 403 when the plan does not include API access. Check the Apollo plan — the key itself is set and is not the problem.",
      actionable: true,
    };
  }

  // 3. NOT A FAULT. Saying so matters: the commonest wrong conclusion after a
  //    run like this is that the feature is broken, and it is not.
  const noSite = rows.filter((r) => r.stage === "no_own_site").length;
  const rejected = rows.filter((r) => r.stage === "email_rejected").length;
  if (rejected && rejected >= rows.length / 2) {
    return {
      headline: `${rejected} address(es) were found and refused for belonging to a directory rather than to the business.`,
      fix: "",
      actionable: false,
    };
  }
  if (noSite && noSite >= rows.length / 2) {
    return {
      headline: `${noSite} of these businesses have no website of their own — only directory pages about them.`,
      fix: "",
      actionable: false,
    };
  }
  return {
    headline: "Every source was asked and none of these businesses has a published email address.",
    fix: "",
    actionable: false,
  };
}
