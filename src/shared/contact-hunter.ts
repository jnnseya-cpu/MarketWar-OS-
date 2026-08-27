// CONTACT HUNTER — the rules.
//
// WHAT THIS IS AND IS NOT. It is not a second lead engine. `lead-harvest.ts`
// already verifies an address against twelve checks and decides UK/EU/US lawful
// basis; `prospecting.ts` already turns a brief into an ICP and finds real
// companies; `enrich.ts` already knows a personal mailbox from a corporate one;
// `robots.ts` already decides whether a page may be fetched. All four keep their
// jobs. This file adds the six things none of them holds, and they are the six
// that decide whether a contact database is an asset or a liability:
//
//   1. PROVENANCE. Every contact point carries where it came from, and whether
//      it was CONFIRMED (a human published it) or INFERRED (we worked it out
//      from a pattern). The specification's sharpest line is that an inferred
//      address must never be presented as confirmed, and the only way to keep
//      that is to make the two different values that no code path converts
//      between. `activationStatus` refuses to read "ready" on an inferred
//      address that nothing has verified — see `readiness`.
//
//   2. THE EMAIL PATTERN, honestly. Learning that a firm uses {first}.{last} is
//      genuinely useful and genuinely not evidence. A generated candidate is
//      marked `inferred`, needs verification before it is contactable, and the
//      pattern's own confidence is the share of known addresses that fit it —
//      never a number somebody typed.
//
//   3. EMPLOYMENT CONFIDENCE. The commonest lie in this industry is a job title
//      that stopped being true in 2023. Evidence carries a publication date, a
//      record with contradicting evidence is refused rather than averaged, and
//      confidence decays with age instead of being asserted once and kept.
//
//   4. PROHIBITED CATEGORIES, refused by field name. Special-category data,
//      home addresses, credentials, anything about a child. Not "we don't
//      collect that" in a policy document — a list of names that bounce a
//      request.
//
//   5. SUPPRESSION THAT CANNOT BE OUTRUN. Objections are stored as a hash of the
//      value, checked before preview, before export and before send, and are
//      global by default. A person who says "stop" to one tenant should not have
//      to say it to the next.
//
//   6. THE READINESS SCORE, and the fact that it cannot buy its way past a
//      legal block. A compliance failure is not a deduction; it is a floor of
//      zero and an activation of NEVER.
//
// THE ONE THING NO AGENT MAY DO. Fabricate. There is no code path in this file
// that returns an address, a number, a title or a source it was not given or did
// not derive from something it was given — and where a derivation happened, the
// output says so in a field a surface has to render.

// ---------------------------------------------------------------------------
// 1. Provenance and evidence
// ---------------------------------------------------------------------------

/**
 * How we came to hold this value. Three states, and they never convert.
 *
 * `confirmed` — a human published this value in a place we read. There is a URL.
 * `inferred`  — we generated it from a pattern. Nobody has ever published it.
 * `provider`  — a licensed data supplier asserted it. Their evidence, not ours.
 */
export type Provenance = "confirmed" | "inferred" | "provider";

export type SourceEvidence = {
  /** The page the value was read from. Required for `confirmed`. */
  sourceUrl: string;
  sourceDomain: string;
  sourceType:
    | "company_website" | "company_register" | "trade_directory" | "procurement_portal"
    | "press_release" | "conference_listing" | "search_index" | "tenant_crm" | "licensed_provider";
  capturedAt: string;
  /** Was the value published in a BUSINESS context? A person's name on a staff
   *  page is; the same name in a wedding notice is not. */
  publishedBusinessContext: boolean;
  /** When the source page itself says it was written. Drives employment decay. */
  publishedAt?: string;
};

export type ContactPointType = "EMAIL" | "PHONE";

export type EmailStatus =
  | "VERIFIED" | "PROBABLE" | "CATCH_ALL" | "ROLE_ACCOUNT"
  | "UNVERIFIED" | "INVALID" | "PERSONAL_SUPPRESSED" | "DO_NOT_CONTACT";

export type PhoneStatus =
  | "VERIFIED_BUSINESS" | "PUBLISHED_UNVERIFIED" | "WRONG_NUMBER"
  | "SUPPRESSED" | "INVALID" | "UNVERIFIED";

export type PhoneKind = "landline" | "mobile" | "voip" | "unknown";

export type ContactPoint = {
  type: ContactPointType;
  value: string;
  provenance: Provenance;
  evidence: SourceEvidence[];
  emailStatus?: EmailStatus;
  phoneStatus?: PhoneStatus;
  phoneKind?: PhoneKind;
  /** E.164 where the number could be normalised. Null when it could not. */
  e164?: string | null;
  /** Only true when a source published it AS a business number. */
  businessContextConfirmed: boolean;
  lastVerifiedAt?: string;
};

/**
 * A contact point that carries no evidence is not a contact point.
 *
 * The specification's first acceptance criterion is that every contact has a
 * traceable source. Enforced here rather than checked at export, because a
 * record that reaches storage without provenance can never get it back.
 */
export function evidenceComplete(p: ContactPoint): { ok: boolean; why: string } {
  if (p.provenance === "confirmed" && p.evidence.length === 0) {
    return { ok: false, why: "Marked confirmed with no source URL. Confirmed means somebody published it and we can point at where." };
  }
  if (p.provenance === "provider" && !p.evidence.some((e) => e.sourceType === "licensed_provider")) {
    return { ok: false, why: "Marked as coming from a provider with no provider evidence record." };
  }
  if (p.provenance === "inferred" && p.evidence.length > 0 && p.evidence.some((e) => e.sourceUrl)) {
    // Not an error — an inferred address may cite the pages the pattern was
    // learned from — but it must never be silently upgraded by their presence.
    return { ok: true, why: "Inferred from a pattern; the cited pages are where the pattern was learned, not where this address was published." };
  }
  return { ok: true, why: "" };
}

// ---------------------------------------------------------------------------
// 2. Email patterns — useful, and never evidence
// ---------------------------------------------------------------------------

export type EmailPattern =
  | "{first}.{last}" | "{first}{last}" | "{f}{last}" | "{first}_{last}"
  | "{first}" | "{last}" | "{f}.{last}" | "{first}-{last}";

export const EMAIL_PATTERNS: EmailPattern[] = [
  "{first}.{last}", "{first}{last}", "{f}{last}", "{first}_{last}",
  "{f}.{last}", "{first}-{last}", "{first}", "{last}",
];

export type PatternFinding = {
  pattern: EmailPattern | null;
  /** Share of the known addresses that fit. Counted, never asserted. */
  confidence: number;
  /** How many known addresses the finding rests on. Two is not a pattern. */
  sampleSize: number;
  fits: string[];
  why: string;
};

/** The minimum number of known addresses before a pattern is offered at all. */
export const MIN_PATTERN_SAMPLE = 3;

function localOf(email: string): string { return String(email || "").split("@")[0].toLowerCase(); }

function render(pattern: EmailPattern, first: string, last: string): string {
  const f = first.slice(0, 1);
  return pattern
    .replace("{first}", first).replace("{last}", last)
    .replace("{f}", f);
}

/**
 * Learn a firm's convention from addresses it has already published.
 *
 * Requires MIN_PATTERN_SAMPLE known addresses WITH KNOWN NAMES — because a
 * pattern derived from two addresses is a coincidence, and this is the step
 * where a coincidence becomes a hundred generated addresses landing in
 * strangers' inboxes.
 */
export function learnPattern(known: { email: string; first: string; last: string }[]): PatternFinding {
  const usable = (known || []).filter((k) => k.email.includes("@") && k.first.trim() && k.last.trim());
  if (usable.length < MIN_PATTERN_SAMPLE) {
    return {
      pattern: null, confidence: 0, sampleSize: usable.length, fits: [],
      why: `${usable.length} known ${usable.length === 1 ? "address" : "addresses"} with names attached. A convention needs ${MIN_PATTERN_SAMPLE}: below that a match is a coincidence, and a coincidence here becomes a hundred generated addresses.`,
    };
  }

  let best: { pattern: EmailPattern; fits: string[] } | null = null;
  for (const pattern of EMAIL_PATTERNS) {
    const fits = usable.filter((k) =>
      localOf(k.email) === render(pattern, k.first.toLowerCase().trim(), k.last.toLowerCase().trim()),
    ).map((k) => k.email);
    if (!best || fits.length > best.fits.length) best = { pattern, fits };
  }
  if (!best || best.fits.length === 0) {
    return { pattern: null, confidence: 0, sampleSize: usable.length, fits: [], why: "No consistent convention across the known addresses." };
  }
  const confidence = Math.round((best.fits.length / usable.length) * 100) / 100;
  return {
    pattern: best.pattern, confidence, sampleSize: usable.length, fits: best.fits,
    why: `${best.fits.length} of ${usable.length} published addresses fit ${best.pattern}.`,
  };
}

/**
 * Generate ONE candidate from a learned pattern.
 *
 * Returns a ContactPoint whose provenance is `inferred` and whose status is
 * UNVERIFIED. Both are the point. Nothing downstream may present this as an
 * address the company published, and `readiness` will not activate it until
 * something has actually verified it.
 */
export function candidateFromPattern(input: {
  finding: PatternFinding;
  first: string;
  last: string;
  domain: string;
  learnedFrom?: SourceEvidence[];
}): { ok: false; why: string } | { ok: true; candidate: ContactPoint; why: string } {
  const { finding, first, last, domain } = input;
  if (!finding.pattern) return { ok: false, why: finding.why };
  if (!first.trim() || !last.trim()) return { ok: false, why: "A candidate needs both a first and a last name." };
  if (!/^[^@\s.]+\.[^@\s]{2,}$/.test(domain.trim())) return { ok: false, why: "A candidate needs the company's confirmed mail domain." };

  const local = render(finding.pattern, first.toLowerCase().trim(), last.toLowerCase().trim());
  return {
    ok: true,
    candidate: {
      type: "EMAIL",
      value: `${local}@${domain.trim().toLowerCase()}`,
      provenance: "inferred",
      evidence: input.learnedFrom ?? [],
      emailStatus: "UNVERIFIED",
      businessContextConfirmed: false,
    },
    why: `Generated from ${finding.pattern} (${finding.confidence} of ${finding.sampleSize} published addresses). NOT published anywhere — it is a guess with arithmetic behind it, and it stays unverified until something checks it.`,
  };
}

// ---------------------------------------------------------------------------
// 3. Employment confidence — a title that stopped being true is a lie
// ---------------------------------------------------------------------------

export type EmploymentEvidence = {
  sourceUrl: string;
  sourceType: SourceEvidence["sourceType"];
  jobTitle: string;
  publishedAt?: string;
  /** True where the source explicitly presents the role as CURRENT. */
  statesCurrent: boolean;
};

export type EmploymentFinding = {
  jobTitle: string | null;
  confidence: number;
  status: "current" | "conflicting" | "stale" | "unknown";
  /** Titles that disagree. Non-empty means a person decides, not the engine. */
  conflicts: string[];
  why: string;
};

/** Past this, a published role is old enough that it needs re-confirming. */
export const EMPLOYMENT_STALE_DAYS = 365;

function daysBetween(a: string, b: string): number | null {
  const t1 = Date.parse(a), t2 = Date.parse(b);
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null;
  return Math.abs(t2 - t1) / 86_400_000;
}

/**
 * Decide whether we believe somebody still holds a role.
 *
 * CONFLICTS ARE NOT AVERAGED. Two sources giving different current titles is the
 * one case where more data makes the answer worse: averaging produces a
 * confident wrong title, and a wrong title in an opening line is the fastest way
 * to be reported as spam. It returns `conflicting` and no title.
 *
 * Age decays confidence rather than being ignored, because a staff page from
 * 2019 is a fact about 2019.
 */
export function assessEmployment(evidence: EmploymentEvidence[], asOf: string): EmploymentFinding {
  const usable = (evidence || []).filter((e) => e.jobTitle.trim() && e.sourceUrl.trim());
  if (usable.length === 0) {
    return { jobTitle: null, confidence: 0, status: "unknown", conflicts: [], why: "No evidence of a role, so no role is claimed." };
  }

  const norm = (t: string) => t.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
  const titles = [...new Set(usable.filter((e) => e.statesCurrent).map((e) => norm(e.jobTitle)))];
  if (titles.length > 1) {
    return {
      jobTitle: null, confidence: 0, status: "conflicting",
      conflicts: titles,
      why: `${titles.length} sources give different current titles (${titles.join("; ")}). A conflict is not averaged — averaging produces a confident wrong title, and this goes to a person.`,
    };
  }

  const current = usable.filter((e) => e.statesCurrent);
  if (current.length === 0) {
    return {
      jobTitle: null, confidence: 0, status: "unknown", conflicts: [],
      why: "Every source mentions the person without stating the role is current. A mention is not employment.",
    };
  }

  // The freshest dated source decides the age. An undated source cannot make a
  // record fresh — it simply does not count toward freshness.
  const ages = current.map((e) => (e.publishedAt ? daysBetween(e.publishedAt, asOf) : null)).filter((d): d is number => d !== null);
  const youngest = ages.length ? Math.min(...ages) : null;

  const sourceWeight = current.some((e) => e.sourceType === "company_website" || e.sourceType === "company_register") ? 0.9 : 0.7;
  const freshness = youngest === null ? 0.6 : Math.max(0.3, 1 - youngest / (EMPLOYMENT_STALE_DAYS * 2));
  const corroboration = Math.min(1, 0.75 + (current.length - 1) * 0.125);
  const confidence = Math.round(sourceWeight * freshness * corroboration * 100) / 100;

  const stale = youngest !== null && youngest > EMPLOYMENT_STALE_DAYS;
  return {
    jobTitle: current[0].jobTitle.trim(),
    confidence,
    status: stale ? "stale" : "current",
    conflicts: [],
    why: youngest === null
      ? `${current.length} undated ${current.length === 1 ? "source states" : "sources state"} the role is current. Undated evidence cannot make a record fresh, so confidence is capped.`
      : stale
        ? `The freshest source stating this role is ${Math.round(youngest)} days old, past the ${EMPLOYMENT_STALE_DAYS}-day mark. It needs re-confirming before use.`
        : `${current.length} ${current.length === 1 ? "source" : "sources"}, freshest ${Math.round(youngest)} days old.`,
  };
}

// ---------------------------------------------------------------------------
// 4. What may never be collected
// ---------------------------------------------------------------------------

export const PROHIBITED_CATEGORIES = [
  "password", "passwords", "credential", "credentials", "apiKey", "authToken", "sessionCookie",
  "homeAddress", "personalAddress", "residentialAddress", "dateOfBirth", "nationalInsurance",
  "health", "medicalRecord", "ethnicity", "race", "religion", "sexuality", "sexualOrientation",
  "politicalOpinion", "tradeUnion", "biometric", "geneticData", "criminalRecord",
  "childData", "minorData", "privateMessages", "breachedData", "leakedDataset",
] as const;

export const PROHIBITED_SOURCES = [
  "Anything behind a login, paywall or access control we were not given permission to pass.",
  "Private social profiles and private messages.",
  "Leaked, breached, hacked or illegally purchased datasets.",
  "Any source reached by defeating a CAPTCHA, a rate limit or a block.",
] as const;

export type Refusal = { field: string; why: string };

/**
 * Screen an inbound payload for things that must never enter the system.
 *
 * By FIELD NAME, at the door, before anything is stored — the same shape as the
 * market-exit customer-list refusal, and for the same reason: a rule that is
 * checked deep inside a handler is a rule a new handler will not check.
 */
export function screenIntake(payload: Record<string, unknown>): { ok: boolean; refusals: Refusal[] } {
  const refusals: Refusal[] = [];
  const seen = new Set<string>();
  const walk = (o: unknown, path: string, depth: number) => {
    if (depth > 6 || !o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      const lower = k.toLowerCase();
      const hit = PROHIBITED_CATEGORIES.find((p) => lower === p.toLowerCase());
      if (hit && !seen.has(hit)) {
        seen.add(hit);
        refusals.push({ field: path ? `${path}.${k}` : k, why: `"${hit}" is a category this engine never collects, whatever its provenance is said to be.` });
      }
      walk(v, path ? `${path}.${k}` : k, depth + 1);
    }
  };
  walk(payload, "", 0);
  return { ok: refusals.length === 0, refusals };
}

// ---------------------------------------------------------------------------
// 5. Suppression — hashed, global by default, checked three times
// ---------------------------------------------------------------------------

export type SuppressionScope = "TENANT" | "PLATFORM";
export type SuppressionChannel = "EMAIL" | "PHONE" | "ALL";

export type Suppression = {
  valueHash: string;
  scope: SuppressionScope;
  tenantId?: string;
  channel: SuppressionChannel;
  reason: string;
  requestedAt: string;
  permanent: boolean;
};

/**
 * A stable, non-reversible key for a contact value.
 *
 * Suppression lists hold HASHES, never addresses. A "do not contact me" list of
 * plaintext addresses is a marketing list with a sad name — the most valuable
 * one in the building and the one nobody thinks to protect. The hash is
 * deterministic so duplicates and objections still match.
 *
 * FNV-1a: the same function this repository already uses for stable ids, chosen
 * because it must produce identical output in the browser and on the server with
 * no dependency. It is not a security hash and is not used as one — the values
 * themselves are stored encrypted elsewhere.
 */
export function valueHash(value: string): string {
  const v = String(value || "").trim().toLowerCase();
  let h1 = 2166136261, h2 = 4187803725;
  for (let i = 0; i < v.length; i++) {
    h1 ^= v.charCodeAt(i); h1 = Math.imul(h1, 16777619);
    h2 ^= v.charCodeAt(v.length - 1 - i); h2 = Math.imul(h2, 16777619);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * Is this value suppressed for this tenant and channel?
 *
 * PLATFORM scope beats tenant scope, always. Somebody who told one MarketWar
 * customer to stop should not have to tell the next one, and a tenant cannot
 * clear a platform suppression — there is no argument to `suppressedBy` that
 * lets them.
 */
export function suppressedBy(
  value: string,
  list: Suppression[],
  ctx: { tenantId: string; channel: Exclude<SuppressionChannel, "ALL"> },
): Suppression | null {
  const h = valueHash(value);
  const applies = (s: Suppression) =>
    s.valueHash === h &&
    (s.channel === "ALL" || s.channel === ctx.channel) &&
    (s.scope === "PLATFORM" || s.tenantId === ctx.tenantId);
  // Platform first, so the strongest match is the one reported.
  return list.find((s) => applies(s) && s.scope === "PLATFORM") ?? list.find(applies) ?? null;
}

// ---------------------------------------------------------------------------
// 6. Phone — a valid format is not a verified number
// ---------------------------------------------------------------------------

const DIALLING = new Map<string, string>([
  ["GB", "44"], ["IE", "353"], ["US", "1"], ["CA", "1"], ["FR", "33"], ["DE", "49"],
  ["ES", "34"], ["IT", "39"], ["NL", "31"], ["BE", "32"], ["PT", "351"], ["AU", "61"],
  ["NZ", "64"], ["ZA", "27"], ["NG", "234"], ["KE", "254"], ["CD", "243"], ["CI", "225"],
]);

export type PhoneFinding = {
  e164: string | null;
  kind: PhoneKind;
  status: PhoneStatus;
  why: string;
};

/**
 * Normalise a published number, and refuse to call that verification.
 *
 * The specification is explicit: a phone is never marked verified solely because
 * its format is valid. So the best this function can return without a carrier
 * lookup is PUBLISHED_UNVERIFIED — and it says why, rather than quietly leaving
 * a field blank that a surface will render as a tick.
 */
export function normalisePhone(raw: string, countryCode: string, opts: {
  businessContextConfirmed?: boolean;
  carrierChecked?: boolean;
  carrierKind?: PhoneKind;
  suppressed?: boolean;
  knownWrongNumber?: boolean;
} = {}): PhoneFinding {
  if (opts.suppressed) return { e164: null, kind: "unknown", status: "SUPPRESSED", why: "On a suppression list — never dialled, and the number is not returned." };
  if (opts.knownWrongNumber) return { e164: null, kind: "unknown", status: "WRONG_NUMBER", why: "Reported as a wrong number. It stays recorded so it is never rediscovered as new." };

  const digits = String(raw || "").replace(/[^\d+]/g, "");
  const cc = DIALLING.get(String(countryCode || "").toUpperCase());
  let e164: string | null = null;

  if (digits.startsWith("+") && digits.length >= 8 && digits.length <= 16) {
    e164 = digits;
  } else if (cc) {
    const national = digits.replace(/^0+/, "");
    if (national.length >= 6 && national.length <= 13) e164 = `+${cc}${national}`;
  }

  if (!e164) {
    return { e164: null, kind: "unknown", status: "INVALID", why: cc ? "Not enough digits for a usable number." : `No dialling code known for "${countryCode}", so this cannot be normalised. Add the country rather than guessing.` };
  }

  const kind: PhoneKind = opts.carrierChecked && opts.carrierKind ? opts.carrierKind : "unknown";

  if (!opts.businessContextConfirmed) {
    return { e164, kind, status: "UNVERIFIED", why: "Normalised, but no source published this as a business number. A number found next to a person's name is not a business line." };
  }
  if (!opts.carrierChecked) {
    return { e164, kind, status: "PUBLISHED_UNVERIFIED", why: "Published as a business number and correctly formatted. NOT verified — that needs a carrier lookup, and a valid format is not a working line." };
  }
  return { e164, kind, status: "VERIFIED_BUSINESS", why: `Published as a business number and confirmed live by a carrier lookup${kind !== "unknown" ? ` (${kind})` : ""}.` };
}

// ---------------------------------------------------------------------------
// 7. Readiness — explainable, and unable to buy past a legal block
// ---------------------------------------------------------------------------

export const READINESS_WEIGHTS = [
  { key: "icpFit", weight: 25, label: "ICP fit" },
  { key: "roleConfidence", weight: 15, label: "Current-role confidence" },
  { key: "emailVerification", weight: 15, label: "Email verification" },
  { key: "phoneVerification", weight: 10, label: "Phone verification" },
  { key: "sourceQuality", weight: 10, label: "Source quality" },
  { key: "freshness", weight: 10, label: "Data freshness" },
  { key: "intent", weight: 10, label: "Buying intent" },
  { key: "complianceEligibility", weight: 5, label: "Compliance eligibility" },
] as const;

export type ReadinessFactor = (typeof READINESS_WEIGHTS)[number]["key"];

export type Activation = "READY" | "REVIEW" | "EMAIL_ONLY" | "ENRICH" | "DO_NOT_ACTIVATE" | "BLOCKED";

export type Readiness = {
  score: number;
  activation: Activation;
  factors: Record<ReadinessFactor, number>;
  reasons: string[];
  restrictions: string[];
  /** Non-empty means the score is irrelevant — see `activation: "BLOCKED"`. */
  blocks: string[];
};

const EMAIL_SCORE: Record<EmailStatus, number> = {
  VERIFIED: 100, ROLE_ACCOUNT: 75, PROBABLE: 55, CATCH_ALL: 35,
  UNVERIFIED: 10, INVALID: 0, PERSONAL_SUPPRESSED: 0, DO_NOT_CONTACT: 0,
};
const PHONE_SCORE: Record<PhoneStatus, number> = {
  VERIFIED_BUSINESS: 100, PUBLISHED_UNVERIFIED: 55, UNVERIFIED: 20,
  INVALID: 0, WRONG_NUMBER: 0, SUPPRESSED: 0,
};
const SOURCE_SCORE: Record<SourceEvidence["sourceType"], number> = {
  company_register: 100, company_website: 95, procurement_portal: 85, press_release: 75,
  trade_directory: 65, conference_listing: 60, tenant_crm: 90, licensed_provider: 70,
  search_index: 50,
};

export type ReadinessInput = {
  icpFit: number;                     // 0–100, from the ICP engine
  employment: EmploymentFinding;
  email?: ContactPoint;
  phone?: ContactPoint;
  evidence: SourceEvidence[];
  /** Counted buying signals with dates. No signals is 0, not "average". */
  intentSignals?: { signal: string; observedAt: string }[];
  /** From lead-harvest's assessCompliance. */
  compliance: { canContact: boolean; lawfulBasis: string; reasons: string[] };
  suppression?: Suppression | null;
  refreshedAt?: string;
  asOf: string;
};

/** Past this many days a record is refreshed before it is used again. */
export const FRESHNESS_STALE_DAYS = 90;

export function readiness(input: ReadinessInput): Readiness {
  const blocks: string[] = [];
  const restrictions: string[] = [];
  const reasons: string[] = [];

  // THE BLOCKS. Each is absolute: no score clears them, and there is no
  // parameter anywhere in this function that lets a caller override one.
  if (input.suppression) {
    blocks.push(`Suppressed (${input.suppression.scope.toLowerCase()}, ${input.suppression.channel.toLowerCase()}): ${input.suppression.reason}`);
  }
  if (!input.compliance.canContact) {
    blocks.push(`No lawful basis to contact: ${input.compliance.reasons[0] ?? "compliance refused"}`);
  }
  if (input.email?.emailStatus === "DO_NOT_CONTACT" || input.email?.emailStatus === "PERSONAL_SUPPRESSED") {
    blocks.push(`The address is ${input.email.emailStatus.replace(/_/g, " ").toLowerCase()}.`);
  }
  if (input.employment.status === "conflicting") {
    blocks.push("Conflicting evidence about this person's current role. A wrong title in an opening line is the fastest route to a complaint.");
  }
  for (const p of [input.email, input.phone]) {
    if (!p) continue;
    const e = evidenceComplete(p);
    if (!e.ok) blocks.push(e.why);
  }

  const emailScore = input.email?.emailStatus ? EMAIL_SCORE[input.email.emailStatus] : 0;
  const phoneScore = input.phone?.phoneStatus ? PHONE_SCORE[input.phone.phoneStatus] : 0;
  const bestSource = input.evidence.length
    ? Math.max(...input.evidence.map((e) => (e.publishedBusinessContext ? SOURCE_SCORE[e.sourceType] : Math.round(SOURCE_SCORE[e.sourceType] * 0.5))))
    : 0;

  const ageDays = input.refreshedAt ? daysBetween(input.refreshedAt, input.asOf) : null;
  const freshness = ageDays === null ? 0 : Math.max(0, Math.round(100 - (ageDays / FRESHNESS_STALE_DAYS) * 100));

  // Intent counts SIGNALS, and none is zero rather than a midpoint. A record
  // with no observed buying signal has no buying signal.
  const recentSignals = (input.intentSignals ?? []).filter((s) => {
    const d = daysBetween(s.observedAt, input.asOf);
    return d !== null && d <= 180;
  });
  const intent = Math.min(100, recentSignals.length * 34);

  const factors: Record<ReadinessFactor, number> = {
    icpFit: Math.max(0, Math.min(100, Math.round(input.icpFit))),
    roleConfidence: Math.round(input.employment.confidence * 100),
    emailVerification: emailScore,
    phoneVerification: phoneScore,
    sourceQuality: bestSource,
    freshness,
    intent,
    complianceEligibility: input.compliance.canContact ? 100 : 0,
  };

  const score = Math.round(READINESS_WEIGHTS.reduce((s, w) => s + factors[w.key] * (w.weight / 100), 0));

  // Explanations, from what was actually counted.
  if (input.employment.jobTitle) reasons.push(`Role "${input.employment.jobTitle}" — ${input.employment.why}`);
  if (input.email?.provenance === "confirmed") reasons.push(`Address published at ${input.email.evidence[0]?.sourceDomain ?? "a cited source"}.`);
  if (input.email?.provenance === "inferred") restrictions.push("The address was generated from the firm's pattern and published nowhere. It cannot be used until it is verified.");
  if (input.email?.provenance === "provider") restrictions.push("The address came from a licensed provider. The evidence is theirs, not ours.");
  if (recentSignals.length) reasons.push(`${recentSignals.length} buying ${recentSignals.length === 1 ? "signal" : "signals"} in the last 180 days: ${recentSignals.map((s) => s.signal).join(", ")}.`);
  if (ageDays === null) restrictions.push("Never refreshed since capture, so freshness scores zero rather than being assumed.");
  else if (ageDays > FRESHNESS_STALE_DAYS) restrictions.push(`Last refreshed ${Math.round(ageDays)} days ago — past the ${FRESHNESS_STALE_DAYS}-day mark.`);
  if (phoneScore < 60 && input.phone) restrictions.push("Telephone outreach not cleared: the number is not carrier-verified as a live business line.");
  if (!input.phone) restrictions.push("No business number held, so this is an email-only contact.");

  const activation: Activation =
    blocks.length > 0 ? "BLOCKED"
    // AN INFERRED ADDRESS IS NEVER READY. This is the specification's sharpest
    // line made into a branch: a pattern-generated address that nothing has
    // verified cannot reach outreach however well it scores on everything else.
    : input.email?.provenance === "inferred" && input.email.emailStatus !== "VERIFIED" ? "ENRICH"
    : score >= 85 ? "READY"
    : score >= 70 ? (phoneScore >= 60 ? "REVIEW" : "EMAIL_ONLY")
    : score >= 50 ? "ENRICH"
    : "DO_NOT_ACTIVATE";

  return { score, activation, factors, reasons, restrictions, blocks };
}

// ---------------------------------------------------------------------------
// 8. Source governance — a source that performs badly turns itself off
// ---------------------------------------------------------------------------

export type SourceQuality = {
  sourceDomain: string;
  contactsProduced: number;
  bounces: number;
  wrongNumbers: number;
  complaints: number;
};

export type SourceVerdict = {
  sourceDomain: string;
  bounceRate: number | null;
  complaintRate: number | null;
  wrongNumberRate: number | null;
  enabled: boolean;
  why: string;
};

/**
 * The volume below which none of these rates means anything.
 *
 * Disabling a source on two bounces out of three is how a good source gets
 * switched off in its first week. The same lesson as the payout trust check:
 * every threshold carries a minimum sample.
 */
export const MIN_QUALITY_SAMPLE = 25;

/** Industry-standard tolerances for a cold B2B programme. Exceed one and stop. */
export const MAX_BOUNCE_RATE = 0.05;
export const MAX_COMPLAINT_RATE = 0.001;
export const MAX_WRONG_NUMBER_RATE = 0.15;

export function judgeSource(q: SourceQuality): SourceVerdict {
  const n = q.contactsProduced;
  if (n < MIN_QUALITY_SAMPLE) {
    return {
      sourceDomain: q.sourceDomain, bounceRate: null, complaintRate: null, wrongNumberRate: null,
      enabled: true,
      why: `${n} contacts so far — below ${MIN_QUALITY_SAMPLE}, no rate from this is worth acting on. Disabling a source on a handful of results switches off good sources in their first week.`,
    };
  }
  const bounceRate = Math.round((q.bounces / n) * 1000) / 1000;
  const complaintRate = Math.round((q.complaints / n) * 10000) / 10000;
  const wrongNumberRate = Math.round((q.wrongNumbers / n) * 1000) / 1000;

  const failures: string[] = [];
  if (bounceRate > MAX_BOUNCE_RATE) failures.push(`bounce rate ${(bounceRate * 100).toFixed(1)}% over the ${(MAX_BOUNCE_RATE * 100)}% limit`);
  if (complaintRate > MAX_COMPLAINT_RATE) failures.push(`complaint rate ${(complaintRate * 100).toFixed(2)}% over the ${(MAX_COMPLAINT_RATE * 100)}% limit`);
  if (wrongNumberRate > MAX_WRONG_NUMBER_RATE) failures.push(`wrong-number rate ${(wrongNumberRate * 100).toFixed(1)}% over the ${(MAX_WRONG_NUMBER_RATE * 100)}% limit`);

  return {
    sourceDomain: q.sourceDomain, bounceRate, complaintRate, wrongNumberRate,
    enabled: failures.length === 0,
    why: failures.length
      ? `Disabled on ${n} contacts: ${failures.join("; ")}. A source producing bad data costs the sending reputation that every other source depends on.`
      : `${n} contacts, within tolerance on all three rates.`,
  };
}

// ---------------------------------------------------------------------------
// 9. The activation gate — the specification's boolean, as a code path
// ---------------------------------------------------------------------------

export type ActivationCheck = { name: string; pass: boolean; detail: string };

/**
 * CONTACT_ALLOWED, exactly as specified, with every term visible.
 *
 * Checked before PREVIEW, before EXPORT and before SEND — three times, on
 * purpose. The commonest way these systems leak is that the list was compliant
 * when it was built and something changed before it was used.
 */
export function activationGate(input: {
  sourcePermitted: boolean;
  collectionLawful: boolean;
  purposeCompatible: boolean;
  destinationRulePassed: boolean;
  suppression: Suppression | null;
  channelAllowed: boolean;
  tenantIdentityComplete: boolean;
}): { allowed: boolean; checks: ActivationCheck[]; blockers: string[] } {
  const checks: ActivationCheck[] = [
    { name: "source_permitted", pass: input.sourcePermitted, detail: input.sourcePermitted ? "The source allows this use." : "The source's policy record does not permit this." },
    { name: "collection_lawful", pass: input.collectionLawful, detail: input.collectionLawful ? "Collection had a lawful basis." : "No lawful basis was recorded for collecting this." },
    { name: "purpose_compatible", pass: input.purposeCompatible, detail: input.purposeCompatible ? "The campaign's purpose matches the basis it was collected under." : "The campaign's purpose is not the one this was collected for." },
    { name: "destination_rule", pass: input.destinationRulePassed, detail: input.destinationRulePassed ? "The destination country's rules are satisfied." : "The destination country's rules are not satisfied." },
    { name: "suppression", pass: !input.suppression, detail: input.suppression ? `Suppressed: ${input.suppression.reason}` : "Not suppressed." },
    { name: "channel_rule", pass: input.channelAllowed, detail: input.channelAllowed ? "This channel is permitted for this contact." : "This channel is not permitted for this contact." },
    { name: "tenant_identity", pass: input.tenantIdentityComplete, detail: input.tenantIdentityComplete ? "The sender's legal identity is on file." : "The sender's legal identity and postal address are required before any outreach." },
  ];
  const blockers = checks.filter((c) => !c.pass).map((c) => c.detail);
  return { allowed: blockers.length === 0, checks, blockers };
}

// ---------------------------------------------------------------------------
// 10. Demo — and it demonstrates the refusals, not only the happy path
// ---------------------------------------------------------------------------

export function demoContactHunter() {
  const asOf = "2026-08-27T12:00:00.000Z";
  const evidence: SourceEvidence[] = [{
    sourceUrl: "https://exampleconstruction.co.uk/about/team",
    sourceDomain: "exampleconstruction.co.uk",
    sourceType: "company_website",
    capturedAt: asOf,
    publishedBusinessContext: true,
    publishedAt: "2026-07-02T00:00:00.000Z",
  }];

  const pattern = learnPattern([
    { email: "john.smith@exampleconstruction.co.uk", first: "John", last: "Smith" },
    { email: "sarah.jones@exampleconstruction.co.uk", first: "Sarah", last: "Jones" },
    { email: "david.okafor@exampleconstruction.co.uk", first: "David", last: "Okafor" },
  ]);
  const thin = learnPattern([{ email: "a.b@x.co.uk", first: "A", last: "B" }]);

  const candidate = candidateFromPattern({
    finding: pattern, first: "Amanda", last: "Brown",
    domain: "exampleconstruction.co.uk", learnedFrom: evidence,
  });

  const employment = assessEmployment([
    { sourceUrl: evidence[0].sourceUrl, sourceType: "company_website", jobTitle: "Procurement Director", publishedAt: "2026-07-02T00:00:00.000Z", statesCurrent: true },
  ], asOf);

  const conflicted = assessEmployment([
    { sourceUrl: "https://a.example/1", sourceType: "company_website", jobTitle: "Procurement Director", statesCurrent: true },
    { sourceUrl: "https://b.example/2", sourceType: "press_release", jobTitle: "Head of Estates", statesCurrent: true },
  ], asOf);

  const confirmedEmail: ContactPoint = {
    type: "EMAIL", value: "procurement@exampleconstruction.co.uk",
    provenance: "confirmed", evidence, emailStatus: "ROLE_ACCOUNT",
    businessContextConfirmed: true, lastVerifiedAt: asOf,
  };

  const phone = normalisePhone("0113 496 0000", "GB", { businessContextConfirmed: true });

  const compliance = { canContact: true, lawfulBasis: "legitimate_interest", reasons: ["UK: generic corporate mailbox — legitimate interests is available (PECR B2B)."] };

  const ready = readiness({
    icpFit: 88, employment, email: confirmedEmail,
    phone: { type: "PHONE", value: "0113 496 0000", provenance: "confirmed", evidence, phoneStatus: phone.status, e164: phone.e164, businessContextConfirmed: true },
    evidence, intentSignals: [{ signal: "Two contract awards announced", observedAt: "2026-08-01T00:00:00.000Z" }],
    compliance, refreshedAt: "2026-08-19T00:00:00.000Z", asOf,
  });

  // The same record with the INFERRED address — same company, same person, and
  // it cannot be activated. This is the pair worth showing.
  const inferredReady = candidate.ok ? readiness({
    icpFit: 88, employment, email: candidate.candidate, evidence,
    compliance, refreshedAt: "2026-08-19T00:00:00.000Z", asOf,
  }) : null;

  return {
    pattern, thinPattern: thin,
    candidate: candidate.ok ? candidate.candidate : null,
    candidateWhy: candidate.ok ? candidate.why : candidate.why,
    employment, conflicted,
    phone,
    unverifiedPhone: normalisePhone("0113 496 0000", "GB", {}),
    readyContact: ready,
    inferredContact: inferredReady,
    intake: screenIntake({ person: { fullName: "A", jobTitle: "B", homeAddress: "12 Elm Row", health: "n/a" } }),
    sourceQuality: [
      judgeSource({ sourceDomain: "goodsource.example", contactsProduced: 400, bounces: 8, wrongNumbers: 20, complaints: 0 }),
      judgeSource({ sourceDomain: "badsource.example", contactsProduced: 300, bounces: 45, wrongNumbers: 10, complaints: 2 }),
      judgeSource({ sourceDomain: "newsource.example", contactsProduced: 6, bounces: 3, wrongNumbers: 0, complaints: 0 }),
    ],
    gate: activationGate({
      sourcePermitted: true, collectionLawful: true, purposeCompatible: true,
      destinationRulePassed: true, suppression: null, channelAllowed: true,
      tenantIdentityComplete: false,
    }),
  };
}
