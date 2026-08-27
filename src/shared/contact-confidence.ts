// THREE SCORES, NOT ONE.
//
// WHY THE SPLIT IS THE WHOLE POINT. A single "contact score" of 78 tells you
// nothing about what to do next. Is the PERSON uncertain, the ROLE stale, or the
// ADDRESS unverified? Those are three different problems with three different
// fixes, and one number is the average of an answer.
//
//   IDENTITY   — is this the right human?
//   EMPLOYMENT — do they still work there, in that role?
//   EMAIL      — will this address reach them?
//
// You can be certain of the person and wrong about the job. You can have a
// perfectly deliverable address for somebody who left in 2023. Averaging those
// produces a confident middle number that is wrong in a way nobody can see.
//
// THE POINT VALUES ARE DATA, and they are the specification's, unchanged, so a
// test asserts them and a surface prints them beside the score. A weighting
// buried in an expression is a weighting nobody can audit or argue with.
//
// AND THE NEGATIVES ARE THE IMPORTANT HALF. Every scoring system in this
// industry adds points for evidence and stops there, which produces a number
// that only ever goes up. Conflicting employers, stale evidence, a catch-all
// domain and an invalid SMTP result all SUBTRACT — and a suppression match
// subtracts a hundred, which is not a penalty, it is a floor of zero however
// much else was found.

export type ConfidenceKind = "identity" | "employment" | "email";

export type ScoreFactor = {
  key: string;
  points: number;
  /** What it means, for the surface that explains the score. */
  label: string;
};

/** Is this the right person? */
export const IDENTITY_FACTORS: ScoreFactor[] = [
  { key: "exactNameMatch", points: 30, label: "Exact full-name match" },
  { key: "companyMatches", points: 25, label: "Matching current company" },
  { key: "titleMatches", points: 15, label: "Matching job title" },
  { key: "locationMatches", points: 10, label: "Matching location" },
  { key: "companyPageEvidence", points: 10, label: "Named on the company's own page" },
  { key: "twoProvidersAgree", points: 10, label: "Two providers agree" },
];

/** Do they still work there? */
export const EMPLOYMENT_FACTORS: ScoreFactor[] = [
  { key: "currentTeamPage", points: 40, label: "On the company's current team page" },
  { key: "providerFresh", points: 25, label: "Licensed provider, updated within 90 days" },
  { key: "secondSourceAgrees", points: 20, label: "A second independent source agrees" },
  { key: "corporateDomainMatches", points: 10, label: "Their address is on the company's domain" },
  { key: "conflictingEmployer", points: -30, label: "Sources disagree about the current employer" },
  { key: "evidenceOver24Months", points: -20, label: "The evidence is more than two years old" },
];

/** Will the address reach them? */
export const EMAIL_FACTORS: ScoreFactor[] = [
  { key: "mailboxDeliverable", points: 40, label: "The mailbox reported deliverable" },
  { key: "publishedByCompany", points: 20, label: "Published by the company itself" },
  { key: "knownPattern", points: 15, label: "Fits the company's known address pattern" },
  { key: "twoProvidersAgree", points: 15, label: "Two providers agree" },
  { key: "recentSuccessfulDelivery", points: 10, label: "We have delivered to it recently" },
  { key: "catchAllDomain", points: -25, label: "The domain accepts everything, so acceptance proves nothing" },
  { key: "invalidSmtp", points: -40, label: "The mail server rejected it" },
  { key: "suppressed", points: -100, label: "On a suppression list" },
];

export const FACTORS: Record<ConfidenceKind, ScoreFactor[]> = {
  identity: IDENTITY_FACTORS,
  employment: EMPLOYMENT_FACTORS,
  email: EMAIL_FACTORS,
};

export type Classification = "verified" | "high_confidence" | "review" | "do_not_export" | "blocked";

export type Score = {
  kind: ConfidenceKind;
  score: number;
  classification: Classification;
  /** Every factor that fired, positive and negative, in the order applied. */
  applied: { key: string; points: number; label: string }[];
  /** Factors that could not be evaluated because nothing was supplied. */
  unknown: string[];
  why: string;
};

/**
 * The bands, and the two that are not bands at all.
 *
 * `blocked` is not the bottom of a scale — it is a separate state reached by a
 * suppression or an invalid mailbox, and it is unreachable by scoring well
 * elsewhere. A contact that scores 98 on identity and is suppressed is blocked,
 * not "verified with a note".
 */
export function classify(score: number, hard: { suppressed?: boolean; invalid?: boolean } = {}): Classification {
  if (hard.suppressed || hard.invalid) return "blocked";
  if (score >= 90) return "verified";
  if (score >= 75) return "high_confidence";
  if (score >= 55) return "review";
  return "do_not_export";
}

/**
 * Score one dimension from the evidence actually supplied.
 *
 * A FACTOR NOT SUPPLIED IS NOT A FACTOR SCORED ZERO — it is reported in
 * `unknown`, so "we could not check this" never reads as "we checked this and
 * it failed". That distinction is the difference between a contact worth
 * enriching further and one worth discarding.
 */
export function score(kind: ConfidenceKind, evidence: Record<string, boolean | undefined>): Score {
  const factors = FACTORS[kind];
  const applied: Score["applied"] = [];
  const unknown: string[] = [];
  let total = 0;

  for (const f of factors) {
    const v = evidence[f.key];
    if (v === undefined) { unknown.push(f.label); continue; }
    if (v === true) { total += f.points; applied.push({ key: f.key, points: f.points, label: f.label }); }
    // An explicit `false` on a NEGATIVE factor is good news and scores nothing,
    // which is correct: not being suppressed is not a credential.
  }

  const bounded = Math.max(0, Math.min(100, total));
  const hard = { suppressed: evidence.suppressed === true, invalid: evidence.invalidSmtp === true };
  const classification = classify(bounded, kind === "email" ? hard : {});

  const negatives = applied.filter((a) => a.points < 0);
  const why = classification === "blocked"
    ? `Blocked: ${hard.suppressed ? "this contact is on a suppression list" : "the mail server rejected this address"}. No score clears that.`
    : applied.length === 0
      ? `Nothing was supplied to score ${kind} on, so it is 0 rather than assumed. ${unknown.length} factor${unknown.length === 1 ? "" : "s"} unchecked.`
      : `${bounded}/100 from ${applied.length - negatives.length} positive${negatives.length ? ` and ${negatives.length} negative` : ""} factor${applied.length === 1 ? "" : "s"}${unknown.length ? `, ${unknown.length} unchecked` : ""}.`;

  return { kind, score: bounded, classification, applied, unknown, why };
}

/**
 * A CATCH-ALL DOMAIN IS NEVER "VERIFIED".
 *
 * A catch-all server accepts every address, so acceptance is not evidence the
 * mailbox exists — and a verifier reporting "deliverable" against one is
 * reporting its own success, not the address's. The -25 is not enough on its
 * own to stop a well-evidenced address reaching 90, so this caps it explicitly.
 *
 * The specification states this as a rule rather than a weight, and a rule that
 * arithmetic can outvote is not a rule.
 */
export function capForCatchAll(s: Score, isCatchAll: boolean): Score {
  if (!isCatchAll || s.classification === "blocked") return s;
  if (s.classification !== "verified") return s;
  return {
    ...s,
    classification: "high_confidence",
    why: `${s.why} Capped below "verified" because the domain is catch-all: it accepts every address, so the server accepting this one proves nothing about the mailbox.`,
  };
}

// ---------------------------------------------------------------------------
// The waterfall's stop rules
// ---------------------------------------------------------------------------

/**
 * When there is no longer any reason to spend money.
 *
 * The specification's thresholds, unchanged. This is the arithmetic that makes
 * a provider waterfall affordable: without it, every lookup calls every
 * provider, and the per-contact cost is the sum of the whole stack whether or
 * not the first source already answered.
 */
export const STOP_AT = { identity: 90, employment: 85, email: 85 } as const;

export type Confidences = { identity: Score; employment: Score; email: Score };

export function enoughFound(c: Partial<Confidences>): { stop: boolean; why: string } {
  const i = c.identity?.score ?? 0;
  const e = c.employment?.score ?? 0;
  const m = c.email?.score ?? 0;
  const stop = i >= STOP_AT.identity && e >= STOP_AT.employment && m >= STOP_AT.email;
  return {
    stop,
    why: stop
      ? `Identity ${i}, employment ${e}, email ${m} — all above the thresholds, so no further provider is called and no further credit is spent.`
      : `Identity ${i}/${STOP_AT.identity}, employment ${e}/${STOP_AT.employment}, email ${m}/${STOP_AT.email} — ${
          [i < STOP_AT.identity && "identity", e < STOP_AT.employment && "employment", m < STOP_AT.email && "email"].filter(Boolean).join(" and ")
        } still short, so the waterfall continues.`,
  };
}

// ---------------------------------------------------------------------------
// A director is not a buyer
// ---------------------------------------------------------------------------

/**
 * Departments and seniority a title actually supports.
 *
 * THE REFUSAL THIS ENCODES, and the specification calls it out by name: a
 * person listed as a DIRECTOR at Companies House is a company officer — a legal
 * role about liability and filings. They are very often not the person who buys
 * anything, and in a firm of any size they are certainly not the Procurement
 * Director.
 *
 * Presenting a registered officer as an operational buyer is the single most
 * common lie in this industry, and it is the one that makes outreach read as
 * spam: the recipient knows they do not hold the job the email addresses them
 * by. So a registry officer gets `department: null` and a seniority of
 * `officer`, and `claimsOperationalRole` refuses the upgrade unless something
 * OTHER than the register says so.
 */
export type Department = "procurement" | "commercial" | "projects" | "operations" | "finance" | "marketing" | "sales" | "technology" | "hr" | "legal" | "executive";
export type Seniority = "c_suite" | "director" | "head" | "manager" | "officer" | "unknown";

/**
 * Every alternative here is a WHOLE WORD, never a stem.
 *
 * The first version of this table wrote stems — `financ`, `technolog`,
 * `treasur`, `recruit` — inside `\b(...)\b`. A trailing word boundary after
 * `financ` requires the next character to be a non-word one, so the pattern
 * matched neither "Finance" nor "Financial": a Chief Financial Officer came
 * back with no department at all. Anchored stems match only the words nobody
 * writes. Spell the endings out.
 */
const DEPARTMENT_WORDS: Record<Department, RegExp> = {
  procurement: /\b(procurement|purchasing|buyer|sourcing|supply\s*chain)\b/i,
  commercial: /\b(commercial|estimating|estimator|quantity\s+surveyor?|bid|tender)\b/i,
  projects: /\b(projects?|programmes?|programs?|site|contracts?\s+manager|delivery)\b/i,
  operations: /\b(operations?|operating|ops|production|logistics|facilities)\b/i,
  // "Account Manager" is deliberately NOT finance — it is the sales title, and
  // it is caught below. Only the accountancy words land here.
  finance: /\b(financ(?:e|es|ial)|accounts|accountant|accounting|accountancy|treasur(?:y|er)|controller|cfo)\b/i,
  marketing: /\b(marketing|brand|communications?|growth|demand\s+gen)\b/i,
  sales: /\b(sales|business\s+development|account\s+(?:executive|manager)|revenue)\b/i,
  technology: /\b(technolog(?:y|ies)|engineering|software|it|cto|developer|architect)\b/i,
  hr: /\b(hr|human\s+resources|people|talent|recruit(?:ment|er|ing)?)\b/i,
  legal: /\b(legal|counsel|compliance|company\s+secretary)\b/i,
  executive: /\b(chief\s+executive|ceo|managing\s+director|founder|owner|proprietor|president)\b/i,
};

const SENIORITY_WORDS: [RegExp, Seniority][] = [
  [/\b(chief\s+\w+\s+officer|ceo|cfo|coo|cto|cmo|managing\s+director|founder|owner|proprietor|president)\b/i, "c_suite"],
  [/\bdirector\b/i, "director"],
  [/\bhead\s+of\b/i, "head"],
  [/\b(manager|lead|supervisor|controller)\b/i, "manager"],
];

export type TitleReading = {
  department: Department | null;
  seniority: Seniority;
  /** True when the ONLY evidence is a company-register officer listing. */
  registryOnly: boolean;
  why: string;
};

/**
 * Read a job title, or refuse to.
 *
 * `fromRegistryOnly` is the important argument. A Companies House officer role
 * ("Director", "Secretary") says what somebody is legally, not what they do —
 * so when that is the only source, the department stays NULL however much the
 * word "director" looks like a seniority.
 */
export function readTitle(title: string, opts: { fromRegistryOnly?: boolean } = {}): TitleReading {
  const t = String(title ?? "").trim();
  if (!t) return { department: null, seniority: "unknown", registryOnly: Boolean(opts.fromRegistryOnly), why: "No title given." };

  let seniority: Seniority = "unknown";
  for (const [re, s] of SENIORITY_WORDS) if (re.test(t)) { seniority = s; break; }

  if (opts.fromRegistryOnly) {
    return {
      department: null,
      // An officer is an officer. The register's "Director" is a filing role,
      // and reading it as a seniority in an operational hierarchy is the error.
      seniority: "officer",
      registryOnly: true,
      why: `"${t}" comes from the company register, which records legal officers rather than operational roles. They may or may not buy anything, and this engine will not claim they do. Confirm the operational role from the company's own pages before treating them as a decision-maker.`,
    };
  }

  let department: Department | null = null;
  for (const [d, re] of Object.entries(DEPARTMENT_WORDS) as [Department, RegExp][]) {
    if (re.test(t)) { department = d; break; }
  }

  return {
    department, seniority, registryOnly: false,
    why: department
      ? `"${t}" reads as ${department}, ${seniority.replace(/_/g, "-")}.`
      : `"${t}" does not match any department this engine recognises, so the department is left null rather than guessed.`,
  };
}

/**
 * May this person be presented as holding an operational role?
 *
 * Requires evidence that is NOT the register. One line, and it is the line that
 * stops "Director at Companies House" becoming "Procurement Director" in an
 * export somebody sends five hundred emails from.
 */
export function claimsOperationalRole(reading: TitleReading, hasNonRegistryEvidence: boolean): { ok: boolean; why: string } {
  if (!reading.registryOnly) return { ok: true, why: "" };
  if (hasNonRegistryEvidence) return { ok: true, why: "The operational role is supported by a source other than the register." };
  return {
    ok: false,
    why: "Refused: the only evidence is a company-register officer listing. A registered director is a legal officer, not necessarily a buyer — and addressing somebody by a job they do not hold is how outreach reads as spam to the one person who knows for certain.",
  };
}
