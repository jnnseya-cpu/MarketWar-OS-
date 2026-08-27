// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// THE PROVIDER WATERFALL — one interface, several suppliers, a deadline.
//
// WHY AN INTERFACE AND NOT JUST CALLS. Every contact tool in this category is,
// underneath, a thin wrapper around one supplier — and when that supplier
// changes its pricing, its terms or its coverage, the product changes with it
// and its owner has no say. An adapter boundary is what keeps MarketWar's
// behaviour ours: Hunter, People Data Labs, Clearbit and our own crawler all
// answer the same four questions, and any of them can be added, disabled or
// replaced without touching a line of the engine above.
//
// THREE RULES THIS FILE EXISTS TO ENFORCE, none of which a direct call can:
//
//   1. STOP WHEN YOU KNOW ENOUGH. Every provider called after the answer is
//      already confident is money spent for nothing. `enoughFound` decides, and
//      the waterfall checks it between every step — so the common case costs one
//      provider and the hard case costs several, rather than every case costing
//      all of them.
//
//   2. A DEADLINE IS A PROMISE, AND A PARTIAL ANSWER IS AN ANSWER. A lookup
//      the user is watching has a budget in seconds. When it runs out, what has
//      been found is returned WITH the steps that did not run named — not an
//      error, and never a fabricated completion. The alternative is a spinner
//      that ends in nothing.
//
//   3. NEVER CHARGE FOR A PROVIDER YOU DID NOT CALL. Cost is accumulated from
//      what actually ran, so a waterfall that stopped early bills for what it
//      used. The temptation is to price the stack; the honest thing is to price
//      the calls.
//
// FREE SOURCES FIRST, ALWAYS. The order is cost-ascending, so our own crawl and
// a free public register are exhausted before a paid credit is spent. That is
// not only cheaper — a company's own page is better evidence than a data
// broker's copy of it.

import {
  score, enoughFound, capForCatchAll, STOP_AT,
  type Score, type Confidences,
} from "@/shared/contact-confidence";

export type CompanyInput = { name?: string; domain?: string; country?: string; registrationNumber?: string };
export type PersonInput = { fullName?: string; company?: string; domain?: string; title?: string; country?: string };
export type EmailInput = { fullName?: string; domain?: string; firstName?: string; lastName?: string };

export type CompanyCandidate = {
  legalName: string; tradingName?: string; domain?: string; companyNumber?: string;
  country?: string; industry?: string; status?: string; sourceUrl?: string;
};

export type PersonCandidate = {
  fullName: string; jobTitle?: string; company?: string; domain?: string;
  location?: string; profileUrl?: string; sourceUrl?: string;
  /** True when the ONLY source is a company register officer listing. */
  fromRegistryOnly?: boolean;
  /**
   * Which providers returned this person. AGREEMENT IS THE EVIDENCE.
   *
   * Deduplicating by name and dropping the second copy throws away the single
   * most valuable thing a second provider can tell you — that it independently
   * arrived at the same human. Identity caps at 80 without it, so a lookup
   * would pay for a second provider and get nothing for the money.
   */
  agreedBy?: string[];
  /**
   * What a surface must print INSTEAD of treating the title as a job.
   *
   * Set by any adapter whose source cannot support an operational role — the
   * company register above all. A UI that renders `jobTitle` unconditionally
   * turns "director (Companies House)" into "Director" on an export, which is
   * the exact claim this engine refuses to make.
   */
  roleNote?: string;
};

export type EmailCandidate = {
  value: string;
  /** Published somewhere, or generated from a pattern. Never converted. */
  provenance: "confirmed" | "inferred" | "provider";
  sourceUrl?: string;
  pattern?: string;
};

export type EmailVerification = {
  email: string;
  deliverable: boolean | null;   // null = could not be determined
  catchAll: boolean;
  invalid: boolean;
  why: string;
};

export type ProviderHealth = { id: string; configured: boolean; note: string };

/**
 * What every supplier must answer, including ours.
 *
 * A provider that cannot do something returns an empty array rather than
 * throwing — "this supplier has no people data" is a normal state, not an
 * error, and a waterfall that treats it as one stops on its first free source.
 */
export interface EnrichmentProvider {
  readonly id: string;
  /** ACUs a single call costs. Zero for our own crawl and free registers. */
  readonly costAcu: number;
  /** Lower runs first. Free sources are cheapest AND better evidence. */
  readonly order: number;
  health(): ProviderHealth;
  findCompany?(input: CompanyInput, signal: AbortSignal): Promise<CompanyCandidate[]>;
  findPeople?(input: PersonInput, signal: AbortSignal): Promise<PersonCandidate[]>;
  findEmails?(input: EmailInput, signal: AbortSignal): Promise<EmailCandidate[]>;
  verifyEmail?(email: string, signal: AbortSignal): Promise<EmailVerification>;
}

export type WaterfallStep = {
  provider: string;
  capability: "company" | "people" | "emails" | "verify";
  ran: boolean;
  ms: number;
  found: number;
  costAcu: number;
  outcome: string;
};

export type WaterfallResult = {
  company: CompanyCandidate | null;
  people: PersonCandidate[];
  emails: EmailCandidate[];
  verification: EmailVerification | null;
  confidence: Partial<Confidences>;
  steps: WaterfallStep[];
  /** Only what actually ran. */
  costAcu: number;
  deadlineHit: boolean;
  /** What a surface shows while it waits, and keeps afterwards. */
  progress: string[];
  note: string;
};

const now = () => Date.now();

/** Registered providers, cheapest first. */
const registry: EnrichmentProvider[] = [];

export function registerProvider(p: EnrichmentProvider): void {
  const at = registry.findIndex((x) => x.id === p.id);
  if (at >= 0) registry[at] = p; else registry.push(p);
  registry.sort((a, b) => a.order - b.order || a.costAcu - b.costAcu);
}

export function providers(): EnrichmentProvider[] { return [...registry]; }
export function providerHealth(): ProviderHealth[] { return registry.map((p) => p.health()); }
/** Test seam. Never called by product code. */
export function __clearProviders(): void { registry.length = 0; }

/**
 * Run one provider call with the remaining time, and never let it hang the run.
 *
 * A provider that does not answer costs the deadline, not the result. The abort
 * is passed down so an adapter can stop its own fetch rather than being
 * abandoned while it keeps running.
 */
async function step<T>(
  p: EnrichmentProvider,
  capability: WaterfallStep["capability"],
  remainingMs: number,
  fn: (signal: AbortSignal) => Promise<T[]>,
): Promise<{ items: T[]; step: WaterfallStep }> {
  const t0 = now();
  if (remainingMs <= 0) {
    return { items: [], step: { provider: p.id, capability, ran: false, ms: 0, found: 0, costAcu: 0, outcome: "Not run — the deadline had already passed." } };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), remainingMs);
  try {
    const items = await fn(ctrl.signal);
    return {
      items,
      step: {
        provider: p.id, capability, ran: true, ms: now() - t0, found: items.length,
        // CHARGED ONLY WHEN IT ANSWERED. A provider that timed out or returned
        // nothing has not earned a credit, whatever its price list says.
        costAcu: items.length > 0 ? p.costAcu : 0,
        outcome: items.length > 0 ? `${items.length} result${items.length === 1 ? "" : "s"}.` : "Nothing found. Not charged.",
      },
    };
  } catch (e) {
    const aborted = (e as Error).name === "AbortError";
    return {
      items: [],
      step: {
        provider: p.id, capability, ran: true, ms: now() - t0, found: 0, costAcu: 0,
        outcome: aborted ? "Ran out of time before it answered. Not charged." : `Failed: ${(e as Error).message}. Not charged.`,
      },
    };
  } finally { clearTimeout(timer); }
}

/**
 * Find one person, within a deadline, spending as little as possible.
 *
 * The order is fixed and the reason is not only cost: our own crawl of a
 * company's own page is BETTER EVIDENCE than a broker's copy of it, so the
 * cheapest source is also the one whose provenance is strongest. Paid providers
 * exist to fill what the free ones could not.
 */
export async function findPerson(input: {
  person: PersonInput;
  deadlineMs?: number;
  /**
   * The most this lookup may spend. THE OTHER HALF OF THE STOP RULE.
   *
   * The confidence thresholds are deliberately unreachable from a single
   * source: identity caps at 80 without corroboration, because two independent
   * sources agreeing is what makes an identity certain and no amount of one
   * source repeating itself substitutes. That is correct — and it means a
   * waterfall governed by confidence ALONE always pays for a second provider,
   * on every contact, forever.
   *
   * So the budget is the second gate. A paid provider is called only when its
   * cost fits inside what the caller allowed, and when it does not, the result
   * says so rather than quietly spending or quietly stopping. Zero means free
   * sources only.
   */
  maxCostAcu?: number;
  /** Evidence already held, so a re-run does not re-buy what is known. */
  known?: Partial<Confidences>;
}): Promise<WaterfallResult> {
  const budget = Math.max(1_000, Math.min(input.deadlineMs ?? 14_000, 60_000));
  const started = now();
  const remaining = () => budget - (now() - started);

  const steps: WaterfallStep[] = [];
  const progress: string[] = [];
  let company: CompanyCandidate | null = null;
  let people: PersonCandidate[] = [];
  let emails: EmailCandidate[] = [];
  let verification: EmailVerification | null = null;
  const confidence: Partial<Confidences> = { ...input.known };

  const record = (s: WaterfallStep) => { steps.push(s); };

  // SCORED AFTER EVERY STEP, because the stop rule is worthless otherwise.
  //
  // The first version of this computed the confidences at the END and reported
  // "the waterfall continues" about a waterfall that had already finished —
  // each capability loop broke on the first provider that returned anything,
  // so a paid provider was never reached even when the free one had left the
  // scores far short. The rule was described and never enforced, which is this
  // codebase's oldest failure wearing a new hat.
  const rescore = () => {
    const target = people[0];
    const best = emails.find((e) => e.provenance === "confirmed") ?? emails[0];
    confidence.identity = score("identity", {
      exactNameMatch: target?.fullName && input.person.fullName
        ? target.fullName.toLowerCase() === input.person.fullName.toLowerCase() : undefined,
      companyMatches: target?.company && company?.legalName
        ? target.company.toLowerCase().includes(company.legalName.toLowerCase().slice(0, 12)) : undefined,
      titleMatches: input.person.title && target?.jobTitle
        ? target.jobTitle.toLowerCase().includes(input.person.title.toLowerCase()) : undefined,
      companyPageEvidence: target?.sourceUrl ? true : undefined,
      // TWO PROVIDERS ON THE SAME PERSON, not two different people found.
      twoProvidersAgree: (target?.agreedBy?.length ?? 0) > 1 ? true : undefined,
    });
    confidence.employment = score("employment", {
      currentTeamPage: target?.sourceUrl && !target.fromRegistryOnly ? true : undefined,
      corporateDomainMatches: best && domain ? best.value.endsWith(`@${domain}`) : undefined,
      secondSourceAgrees: (target?.agreedBy?.length ?? 0) > 1 ? true : undefined,
    });
    const emailScore = score("email", {
      mailboxDeliverable: verification ? verification.deliverable === true : undefined,
      publishedByCompany: best ? best.provenance === "confirmed" : undefined,
      knownPattern: best?.pattern ? true : undefined,
      twoProvidersAgree: emails.length > 1 ? true : undefined,
      catchAllDomain: verification ? verification.catchAll : undefined,
      invalidSmtp: verification ? verification.invalid : undefined,
    });
    confidence.email = capForCatchAll(emailScore, verification?.catchAll === true);
    return enoughFound(confidence);
  };

  let stoppedEarly = false;
  let budgetStopped = false;
  const maxCost = typeof input.maxCostAcu === "number" ? Math.max(0, input.maxCostAcu) : 0;
  const spent = () => steps.reduce((n, x) => n + x.costAcu, 0);

  /**
   * May this provider be called?
   *
   * Free providers always. A paid one only when its price fits what is left of
   * the budget — and a refusal is RECORDED as a step rather than silently
   * skipped, because "we did not call the provider that would have found this"
   * is something the person reading the result needs to know.
   */
  const affordable = (p: EnrichmentProvider, capability: WaterfallStep["capability"]): boolean => {
    if (p.costAcu === 0) return true;
    if (spent() + p.costAcu <= maxCost) return true;
    budgetStopped = true;
    steps.push({
      provider: p.id, capability, ran: false, ms: 0, found: 0, costAcu: 0,
      outcome: maxCost === 0
        ? `Not called — this lookup was allowed no paid providers, and ${p.id} costs ${p.costAcu} ACUs.`
        : `Not called — ${p.costAcu} ACUs would take this lookup past the ${maxCost}-ACU limit it was given (${spent()} already spent).`,
    });
    return false;
  };

  // 1. The company and its domain. Everything downstream keys off the domain,
  //    so this runs first even when a domain was supplied — a supplied domain
  //    that belongs to a different company poisons every later step.
  for (const p of registry) {
    if (!p.findCompany || !p.health().configured) continue;
    if (remaining() <= 0) break;
    if (!affordable(p, "company")) continue;
    const r = await step(p, "company", remaining(), (sig) => p.findCompany!({ name: input.person.company, domain: input.person.domain, country: input.person.country }, sig));
    record(r.step);
    if (r.items.length > 0) { company = r.items[0]; progress.push(`✓ Company identified — ${company.legalName}`); break; }
  }
  if (!company && input.person.domain) {
    company = { legalName: input.person.company || input.person.domain, domain: input.person.domain };
    progress.push("• Company taken from the domain you supplied — no register confirmed it");
  }

  const domain = company?.domain || input.person.domain;

  // 2. The people. Free sources first, and the loop CONTINUES to the next
  //    provider while identity or employment is short — that is the difference
  //    between a waterfall and a list of fallbacks.
  for (const p of registry) {
    if (!p.findPeople || !p.health().configured) continue;
    if (remaining() <= 0) break;
    if (!affordable(p, "people")) continue;
    const r = await step(p, "people", remaining(), (sig) => p.findPeople!({ ...input.person, domain }, sig));
    record(r.step);
    if (r.items.length > 0) {
      // Merged, not replaced, and AGREEMENT IS RECORDED. A second provider
      // naming the same person is corroboration worth points; dropping the
      // duplicate silently is how a paid call buys nothing.
      for (const c of r.items) {
        const same = people.find((x) => x.fullName.toLowerCase() === c.fullName.toLowerCase());
        if (same) {
          same.agreedBy = [...new Set([...(same.agreedBy ?? []), p.id])];
          // Fill gaps from the newcomer without overwriting what is held: a
          // source that adds a job title should add it, never replace one.
          same.jobTitle ??= c.jobTitle;
          same.profileUrl ??= c.profileUrl;
          same.location ??= c.location;
          // A person confirmed by anything OTHER than the register is no longer
          // registry-only, and that is what unlocks the operational role.
          if (same.fromRegistryOnly && c.fromRegistryOnly === false) same.fromRegistryOnly = false;
        } else {
          people.push({ ...c, agreedBy: [p.id] });
        }
      }
      progress.push(`✓ ${people.length} decision-maker${people.length === 1 ? "" : "s"} discovered`);
    }
    const enoughNow = rescore();
    if (enoughNow.stop) { stoppedEarly = true; break; }
    // Somebody found and identity satisfied is enough to move on to addresses;
    // a second people-provider would be spending on a question already answered.
    if (people.length > 0 && (confidence.identity?.score ?? 0) >= STOP_AT.identity) break;
  }

  // 3. Addresses.
  const target = people[0];
  const nameParts = String(target?.fullName || input.person.fullName || "").trim().split(/\s+/);
  if (!stoppedEarly) {
    for (const p of registry) {
      if (!p.findEmails || !p.health().configured) continue;
      if (remaining() <= 0) break;
      if (!affordable(p, "emails")) continue;
      const r = await step(p, "emails", remaining(), (sig) => p.findEmails!({
        fullName: target?.fullName || input.person.fullName, domain,
        firstName: nameParts[0], lastName: nameParts[nameParts.length - 1],
      }, sig));
      record(r.step);
      if (r.items.length > 0) {
        for (const c of r.items) if (!emails.some((x) => x.value.toLowerCase() === c.value.toLowerCase())) emails.push(c);
        const confirmed = emails.filter((e) => e.provenance === "confirmed").length;
        progress.push(`✓ ${emails.length} address${emails.length === 1 ? "" : "es"} found${confirmed ? ` (${confirmed} published)` : " (all generated — none published)"}`);
      }
      // A PUBLISHED ADDRESS ENDS THE SEARCH. A generated one does not: it is a
      // guess, and paying a provider to replace a guess with a real address is
      // exactly what the next provider is for.
      if (emails.some((e) => e.provenance === "confirmed")) break;
    }
  }

  // 4. Verify — but ONLY the strongest candidate, and only if there is time.
  //    Verifying six generated addresses to find one that works is how the
  //    per-contact cost quietly triples; the pattern engine exists so that the
  //    first candidate is usually the right one.
  const best = emails.find((e) => e.provenance === "confirmed") ?? emails[0];
  if (best && !stoppedEarly) {
    for (const p of registry) {
      if (!p.verifyEmail || !p.health().configured) continue;
      if (remaining() <= 0) break;
      if (!affordable(p, "verify")) continue;
      const t0 = now();
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), remaining());
        verification = await p.verifyEmail(best.value, ctrl.signal);
        clearTimeout(timer);
        record({ provider: p.id, capability: "verify", ran: true, ms: now() - t0, found: 1, costAcu: p.costAcu, outcome: verification.why });
        progress.push(verification.deliverable ? "✓ Address verified" : verification.invalid ? "✗ Address rejected by the mail server" : "• Address could not be verified");
        // A definite answer either way ends it. Only an inconclusive result is
        // worth a second opinion.
        if (verification.deliverable !== null) break;
      } catch (e) {
        record({ provider: p.id, capability: "verify", ran: true, ms: now() - t0, found: 0, costAcu: 0, outcome: `Verification failed: ${(e as Error).message}. Not charged.` });
      }
    }
  }

  const enough = rescore();

  const deadlineHit = remaining() <= 0;
  const costAcu = steps.reduce((s, x) => s + x.costAcu, 0);
  const skipped = steps.filter((s) => !s.ran).length;

  return {
    company, people, emails, verification, confidence, steps, costAcu, deadlineHit, progress,
    note: deadlineHit
      ? `The ${Math.round(budget / 1000)}-second budget ran out with ${skipped} step${skipped === 1 ? "" : "s"} unrun. What is above is what was actually established — nothing has been filled in to make it look complete. ${enough.why}`
      : budgetStopped
        ? `${enough.why.replace(/, so the waterfall continues\.$/, ".")} A paid provider that might have settled it was not called, because it would have taken this lookup past its ${maxCost}-ACU limit. Raise the limit to go further.`
        : stoppedEarly
        ? enough.why
        : enough.stop
          ? enough.why
          // NOT "the waterfall continues" — it has finished. Saying otherwise
          // described a loop that had already exited, which is how a stop rule
          // gets reported for years without ever being enforced.
          : `${enough.why.replace(/, so the waterfall continues\.$/, ".")} Every configured provider has now been tried; what is short is short because nothing available could settle it.`,
  };
}
