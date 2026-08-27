// CONTACT FINDER — upload a list, get it filled in.
//
// "Upload names. MarketWar identifies the right businesses and people, finds
// permitted professional email and phone routes, verifies every result, fills
// the spreadsheet and turns approved records into revenue-ready leads."
//
// WHAT THIS FILE OWNS AND WHAT IT BORROWS. Every rule about whether a value may
// be held, shown or sent lives in `shared/contact-hunter.ts` — provenance,
// employment confidence, suppression, readiness, the prohibited categories. This
// file is the LIST half: working out what each row is, mapping somebody's
// headings onto ours, refusing to guess between two people with the same name,
// tracking each row's state so a restarted job neither redoes nor recharges
// finished work, and composing the workbook that comes back.
//
// THE FOUR THINGS THAT MAKE THIS DIFFERENT FROM A SCRAPER WITH A CSV READER:
//
//   1. IT REFUSES TO CHOOSE. Two people called James Wilson at two firms is not
//      a 50/50 guess to be resolved by picking the first — it is
//      MULTIPLE_CANDIDATES, and it goes to a human with both candidates
//      attached. A tool that silently picks is a tool that emails the wrong
//      person and never tells anybody it did.
//
//   2. IT NEVER OVERWRITES THE USER'S OWN DATA. Every original column comes back
//      untouched and every added column is prefixed MW_. Somebody's spreadsheet
//      is their record; we append to it, we do not correct it.
//
//   3. A ROW IS CHARGED FOR WHAT COMPLETED, NOT FOR BEING ATTEMPTED. Duplicates
//      removed before discovery, cached records still inside their verification
//      window, provider timeouts and our own failures cost nothing — and
//      `chargeFor` is where that is decided, so it cannot be decided differently
//      in two places.
//
//   4. A RESTART IS NOT A RERUN. Every row carries a state and a charge record;
//      resuming picks up only what is unfinished. A server interruption that
//      recharged a customer for ten thousand rows would be the single most
//      expensive defect this platform could ship.

import type { Provenance, SourceEvidence } from "@/shared/contact-hunter";

// ---------------------------------------------------------------------------
// 1. What is this thing?
// ---------------------------------------------------------------------------

export type InputType =
  | "PERSON" | "COMPANY" | "DOMAIN" | "EMAIL" | "PHONE"
  | "ADDRESS" | "PROFESSIONAL_PROFILE" | "UNKNOWN";

const COMPANY_SUFFIX = /\b(ltd|limited|plc|llp|llc|inc|incorporated|gmbh|sarl|sas|bv|nv|pty|ag|spa|srl|oy|ab|as|group|holdings|partners|associates|services|solutions|consulting|construction|engineering|&\s*co)\b/i;
// Words that mark a company but are not suffixes — they usually come FIRST, and
// several are not English. The owner's own example is "Groupe Nseya" beside
// "Justin Nseya": two capitalised words each, identical to any shape test, and
// separated only by knowing that "Groupe" is a company word in French.
const COMPANY_PREFIX = /^(the\s+)?(groupe|grupo|gruppe|gruppo|group|cabinet|bureau|agence|agency|studio|atelier|maison|societe|société|sociedad|compagnie|company|entreprise|empresa|firma|fondation|foundation|institut|institute|centre|center|clinic|clinique|practice|chambers|consortium|collective|works|labs?|holdings?)\b/i;
const PROFILE_HOST = /\b(linkedin\.com|xing\.com|about\.me|crunchbase\.com)\b/i;
const ADDRESS_HINT = /\b(street|st\.|road|rd\.|avenue|ave\.|lane|drive|close|court|way|suite|floor|unit|po box|industrial estate|business park)\b/i;
const UK_POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;

/**
 * Decide what a single cell of somebody's spreadsheet actually is.
 *
 * ORDER MATTERS AND IS DELIBERATE. The unambiguous shapes are tested first —
 * an email is an email, a URL is a URL — and the genuinely ambiguous decision,
 * person versus company, comes last with the least confidence. "Justin Nseya"
 * and "Groupe Nseya" differ by one word, and the honest answer when nothing
 * separates them is UNKNOWN rather than a coin toss dressed as a classification.
 */
export function detectInputType(raw: string): { type: InputType; confidence: number; why: string } {
  const v = String(raw ?? "").trim();
  if (!v) return { type: "UNKNOWN", confidence: 0, why: "Empty." };

  if (/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(v)) return { type: "EMAIL", confidence: 1, why: "An address." };

  if (PROFILE_HOST.test(v)) return { type: "PROFESSIONAL_PROFILE", confidence: 0.95, why: "A professional-profile URL." };

  if (/^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/|$)/i.test(v) && !v.includes(" ")) {
    return { type: "DOMAIN", confidence: 0.95, why: "A website or domain." };
  }

  // A phone number: mostly digits once punctuation is removed, and long enough.
  const digits = v.replace(/[^\d]/g, "");
  if (digits.length >= 7 && digits.length <= 15 && /^[+\d][\d\s().+-]+$/.test(v)) {
    return { type: "PHONE", confidence: 0.9, why: "A telephone number." };
  }

  if (UK_POSTCODE.test(v) || (ADDRESS_HINT.test(v) && /\d/.test(v))) {
    return { type: "ADDRESS", confidence: 0.8, why: "A postal address." };
  }

  if (COMPANY_SUFFIX.test(v)) return { type: "COMPANY", confidence: 0.9, why: "Carries a company suffix." };
  if (COMPANY_PREFIX.test(v)) return { type: "COMPANY", confidence: 0.85, why: "Opens with a word that names an organisation rather than a person." };

  // Person versus company, with nothing decisive. Two to four capitalised words
  // with no company marker reads as a name — and the confidence says how much
  // that is worth, which is not much.
  const words = v.split(/\s+/).filter(Boolean);
  const capitalised = words.filter((w) => /^[A-ZÀ-ɏ]/.test(w)).length;
  if (words.length >= 2 && words.length <= 4 && capitalised >= 2) {
    return { type: "PERSON", confidence: 0.55, why: "Reads as a personal name, but a two-word company name reads the same. Treated as a person, and the low confidence is why the row keeps its alternatives." };
  }
  if (words.length === 1) {
    return { type: "UNKNOWN", confidence: 0.2, why: "One word could be a surname, a trading name or a typo. Not enough to classify." };
  }
  return { type: "COMPANY", confidence: 0.5, why: "More words than a name usually has, with no company suffix to confirm it." };
}

// ---------------------------------------------------------------------------
// 2. Column mapping
// ---------------------------------------------------------------------------

export const TARGET_FIELDS = [
  "full_name", "company_name", "job_title", "website", "email", "phone",
  "city", "country", "professional_profile_url", "registration_number",
] as const;
export type TargetField = (typeof TARGET_FIELDS)[number];

/**
 * Header synonyms, including other languages.
 *
 * People upload the spreadsheet they already have, and it says "Raison sociale"
 * or "Empresa" or "Firma". A mapper that only knows English headings makes the
 * user retype their own file, which is the moment they stop using the product.
 */
const HEADER_SYNONYMS: Record<TargetField, string[]> = {
  full_name: ["name", "full name", "contact", "contact name", "person", "person name", "nom", "nombre", "naam", "contatto", "ansprechpartner", "prenom nom", "first and last name", "attention", "lead name"],
  company_name: ["company", "company name", "organisation", "organization", "business", "business name", "account", "entreprise", "societe", "société", "raison sociale", "empresa", "firma", "azienda", "bedrijf", "employer", "client"],
  job_title: ["title", "job title", "role", "position", "job role", "poste", "fonction", "cargo", "puesto", "funktion", "ruolo", "designation"],
  website: ["website", "web", "url", "site", "web address", "domain", "homepage", "site web", "sitio web", "webseite"],
  email: ["email", "e-mail", "mail", "email address", "e mail", "correo", "courriel", "posta", "mail address"],
  phone: ["phone", "telephone", "tel", "mobile", "cell", "phone number", "contact number", "telefono", "téléphone", "telefon", "numero", "number"],
  city: ["city", "town", "location", "ville", "ciudad", "stadt", "citta", "locality"],
  country: ["country", "market", "region", "pays", "pais", "país", "land", "paese", "territory"],
  professional_profile_url: ["linkedin", "linked in", "profile", "profile url", "professional profile", "linkedin url", "perfil"],
  registration_number: ["company no", "company number", "registration number", "reg no", "companies house", "siret", "siren", "vat", "vat number", "ust-id", "cif", "nif", "ein"],
};

const norm = (s: string) => String(s ?? "").toLowerCase().replace(/[_\-./\\]+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();

export type ColumnMapping = {
  mapped: Record<string, TargetField>;
  unmapped: string[];
  /** Two headings claiming the same field. Never silently resolved. */
  collisions: { field: TargetField; headers: string[] }[];
  warnings: string[];
};

/**
 * Map somebody's headings onto ours, and say what could not be mapped.
 *
 * AN UNMAPPED COLUMN IS NOT A PROBLEM AND IS NEVER DROPPED — "Internal Notes"
 * belongs to the user and comes back untouched. A COLLISION is a problem: two
 * columns both looking like the email means we do not know which one the user
 * means, and picking one is how the wrong address gets verified.
 */
export function mapColumns(headers: string[]): ColumnMapping {
  const mapped: Record<string, TargetField> = {};
  const unmapped: string[] = [];
  const byField = new Map<TargetField, string[]>();

  for (const header of headers) {
    const n = norm(header);
    if (!n) { unmapped.push(header); continue; }
    let hit: TargetField | null = null;
    for (const field of TARGET_FIELDS) {
      const syns = HEADER_SYNONYMS[field];
      if (syns.includes(n) || syns.some((s) => n === s || n.startsWith(`${s} `) || n.endsWith(` ${s}`))) { hit = field; break; }
    }
    if (hit) {
      mapped[header] = hit;
      byField.set(hit, [...(byField.get(hit) ?? []), header]);
    } else {
      unmapped.push(header);
    }
  }

  const collisions = [...byField.entries()]
    .filter(([, hs]) => hs.length > 1)
    .map(([field, headers]) => ({ field, headers }));

  const warnings: string[] = [];
  if (!byField.has("country")) warnings.push("No country column. Phone numbers cannot be normalised and destination rules cannot be applied without one — supply it, or set a default for the job.");
  if (!byField.has("full_name") && !byField.has("company_name")) warnings.push("Neither a name nor a company column was recognised. Nothing here can be resolved to an identity.");
  for (const c of collisions) warnings.push(`"${c.headers.join('" and "')}" both look like ${c.field}. Choose one — picking for you is how the wrong value gets verified.`);
  if (unmapped.length) warnings.push(`${unmapped.length} column${unmapped.length === 1 ? "" : "s"} not recognised. They are kept exactly as they are and returned untouched.`);

  return { mapped, unmapped, collisions, warnings };
}

/**
 * Find the real header row.
 *
 * Spreadsheets people actually send have a title in A1, a blank row, then the
 * headings. Scoring each candidate row by how many cells map to a known field
 * finds it without asking, and returns 0 when nothing looks like a header rather
 * than pretending row 1 is one.
 */
export function detectHeaderRow(rows: string[][], maxScan = 10): { headerRow: number; score: number; why: string } {
  let best = { headerRow: -1, score: 0 };
  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    const cells = (rows[i] ?? []).map((c) => String(c ?? "").trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const m = mapColumns(cells);
    const score = Object.keys(m.mapped).length;
    if (score > best.score) best = { headerRow: i, score };
  }
  if (best.headerRow < 0 || best.score < 2) {
    return { headerRow: -1, score: best.score, why: "No row looks like a header — fewer than two cells map to a known field. Say which row it is rather than having us guess." };
  }
  return { headerRow: best.headerRow, score: best.score, why: `Row ${best.headerRow + 1}: ${best.score} of its cells map to known fields.` };
}

/** Rows that are not data: blank, or a totals/subtotal line. */
export function isSkippableRow(cells: string[]): { skip: boolean; why: string } {
  const values = cells.map((c) => String(c ?? "").trim());
  if (values.every((v) => !v)) return { skip: true, why: "Blank." };
  const first = values.find(Boolean) ?? "";
  if (/^(total|totals|subtotal|sub-total|sum|grand total|count)\b/i.test(first) && values.filter(Boolean).length <= 3) {
    return { skip: true, why: "A totals line, not a record." };
  }
  return { skip: false, why: "" };
}

// ---------------------------------------------------------------------------
// 3. Deduplication
// ---------------------------------------------------------------------------

export type DedupeInput = {
  originalRow: number;
  full_name?: string;
  company_name?: string;
  website?: string;
  email?: string;
  phone?: string;
  country?: string;
  registration_number?: string;
};

const canonicalDomain = (v: string) =>
  String(v ?? "").trim().toLowerCase()
    .replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];

const canonicalName = (v: string) =>
  String(v ?? "").toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();

/**
 * The keys that make two rows the same record.
 *
 * ORDERED BY STRENGTH. An email or a registration number IS the record; a name
 * plus a domain is nearly as good; a name plus a company plus a country is a
 * reasonable bet. What is deliberately absent is a key on the NAME ALONE — two
 * James Wilsons are two people, and merging them because their names match is
 * how one person's verified address ends up attached to another person's job.
 */
export function dedupeKeys(r: DedupeInput): string[] {
  const keys: string[] = [];
  if (r.email && r.email.includes("@")) keys.push(`email:${r.email.trim().toLowerCase()}`);
  if (r.phone) {
    const d = r.phone.replace(/[^\d]/g, "");
    if (d.length >= 7) keys.push(`phone:${d}`);
  }
  if (r.registration_number) {
    const n = r.registration_number.replace(/[^\p{L}\p{N}]/gu, "").toUpperCase();
    if (n.length >= 5) keys.push(`reg:${n}`);
  }
  const name = canonicalName(r.full_name ?? "");
  const domain = canonicalDomain(r.website ?? "");
  if (name && domain) keys.push(`name+domain:${name}|${domain}`);
  if (name && r.company_name && r.country) keys.push(`name+company+country:${name}|${canonicalName(r.company_name)}|${String(r.country).trim().toLowerCase()}`);
  if (!name && domain) keys.push(`domain:${domain}`);
  return keys;
}

export type DedupeResult = {
  unique: DedupeInput[];
  /** Rows folded into an earlier one, with the row they merged into. */
  duplicates: { originalRow: number; mergedInto: number; key: string }[];
};

export function dedupe(rows: DedupeInput[]): DedupeResult {
  const seen = new Map<string, number>();
  const unique: DedupeInput[] = [];
  const duplicates: DedupeResult["duplicates"] = [];

  for (const r of rows) {
    const keys = dedupeKeys(r);
    const hit = keys.map((k) => [k, seen.get(k)] as const).find(([, row]) => row !== undefined);
    if (hit && hit[1] !== undefined) {
      duplicates.push({ originalRow: r.originalRow, mergedInto: hit[1], key: hit[0] });
      continue;
    }
    for (const k of keys) seen.set(k, r.originalRow);
    unique.push(r);
  }
  return { unique, duplicates };
}

/**
 * Merging two records for the same person.
 *
 * ONE RULE ABOVE ALL: a verified value is never replaced by an inferred one.
 * Recency decides between two values of the SAME provenance; provenance decides
 * between values of different provenance, always, regardless of which is newer.
 * A freshly generated guess is not an improvement on last month's confirmed
 * address, and that is exactly the mistake a plain "newest wins" merge makes.
 */
const PROVENANCE_RANK: Record<Provenance, number> = { confirmed: 3, provider: 2, inferred: 1 };

export function mergeValue(
  a: { value: string; provenance: Provenance; verifiedAt?: string } | null,
  b: { value: string; provenance: Provenance; verifiedAt?: string } | null,
): { winner: typeof a; why: string } {
  if (!a) return { winner: b, why: b ? "Only one value held." : "No value held." };
  if (!b) return { winner: a, why: "Only one value held." };
  const ra = PROVENANCE_RANK[a.provenance], rb = PROVENANCE_RANK[b.provenance];
  if (ra !== rb) {
    const winner = ra > rb ? a : b;
    return { winner, why: `${winner.provenance} beats ${(ra > rb ? b : a).provenance}. A verified value is never replaced by an inferred one, however recent the guess is.` };
  }
  const ta = Date.parse(a.verifiedAt ?? ""), tb = Date.parse(b.verifiedAt ?? "");
  if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) {
    return { winner: ta > tb ? a : b, why: "Same provenance, so the more recently verified one wins." };
  }
  return { winner: a, why: "Same provenance and nothing to separate them by date — the first is kept and both sources are preserved." };
}

// ---------------------------------------------------------------------------
// 4. Identity resolution — and the refusal to choose
// ---------------------------------------------------------------------------

export type IdentityStatus =
  | "EXACT_MATCH" | "HIGH_CONFIDENCE_MATCH" | "MULTIPLE_CANDIDATES"
  | "INSUFFICIENT_INFORMATION" | "NO_MATCH" | "CONFLICTING_INFORMATION";

export type Candidate = {
  fullName: string;
  company: string;
  jobTitle?: string;
  location?: string;
  /** 0–1, from whatever evidence was actually compared. */
  score: number;
  evidence: SourceEvidence[];
};

export type IdentityResolution = {
  status: IdentityStatus;
  chosen: Candidate | null;
  candidates: Candidate[];
  confidence: number;
  why: string;
};

/** Two candidates this close together are not separable by score. */
export const CANDIDATE_SEPARATION = 0.15;

/**
 * Pick the person, or refuse to.
 *
 * THE REFUSAL IS THE FEATURE. When the best two candidates are within
 * CANDIDATE_SEPARATION of each other, this returns MULTIPLE_CANDIDATES with
 * both attached and `chosen: null`. There is no threshold at which it decides
 * anyway. A tool that silently picks between two people with the same name emails
 * the wrong one and never tells anybody it did — and the user finds out when a
 * stranger replies asking who they are.
 */
export function resolveIdentity(input: {
  candidates: Candidate[];
  minimumConfidence?: number;
  /** True where two candidates give the same person different current employers. */
  conflicting?: boolean;
}): IdentityResolution {
  const min = input.minimumConfidence ?? 0.8;
  const sorted = [...(input.candidates ?? [])].sort((a, b) => b.score - a.score);

  if (input.conflicting) {
    return { status: "CONFLICTING_INFORMATION", chosen: null, candidates: sorted, confidence: 0,
      why: "Sources disagree about where this person currently works. That goes to a person, not to a campaign." };
  }
  if (sorted.length === 0) {
    return { status: "NO_MATCH", chosen: null, candidates: [], confidence: 0, why: "Nothing matched." };
  }

  const top = sorted[0];
  const second = sorted[1];

  if (second && top.score - second.score < CANDIDATE_SEPARATION) {
    return {
      status: "MULTIPLE_CANDIDATES", chosen: null, candidates: sorted.slice(0, 3), confidence: top.score,
      why: `${sorted.length} people fit, and the best two are ${Math.round((top.score - second.score) * 100)} points apart — not enough to tell them apart. Both are returned; choosing between them is a person's job.`,
    };
  }
  if (top.score < min) {
    return {
      status: "INSUFFICIENT_INFORMATION", chosen: null, candidates: sorted.slice(0, 3), confidence: top.score,
      why: `The best candidate scores ${top.score}, below the ${min} this job requires. More identifying information would settle it — a company, a location or a domain.`,
    };
  }
  return {
    status: top.score >= 0.97 ? "EXACT_MATCH" : "HIGH_CONFIDENCE_MATCH",
    chosen: top, candidates: sorted.slice(0, 3), confidence: top.score,
    why: `${top.fullName} at ${top.company}, ${Math.round(top.score * 100)}% — clear of the next candidate by ${second ? Math.round((top.score - second.score) * 100) : 100} points.`,
  };
}

// ---------------------------------------------------------------------------
// 5. Row state, and charging for what completed
// ---------------------------------------------------------------------------

export const ROW_STATES = [
  "UPLOADED", "NORMALISED", "DEDUPLICATED", "IDENTITY_SEARCHING", "IDENTITY_MATCHED",
  "CONTACT_SEARCHING", "VERIFYING", "COMPLIANCE_REVIEW",
  "COMPLETED", "PARTIAL", "MANUAL_REVIEW", "NOT_FOUND", "BLOCKED",
] as const;
export type RowState = (typeof ROW_STATES)[number];

/** States a row never leaves. Resuming skips these — and never recharges them. */
export const TERMINAL_ROW_STATES: RowState[] = ["COMPLETED", "PARTIAL", "MANUAL_REVIEW", "NOT_FOUND", "BLOCKED"];

export function isFinished(state: RowState): boolean { return TERMINAL_ROW_STATES.includes(state); }

export const BILLABLE_OPERATIONS = {
  import_clean: 0.25,
  company_resolution: 1,
  person_resolution: 2,
  email_discovery: 2,
  email_candidate: 1,
  email_verification: 4,
  phone_discovery: 5,
  company_enrichment: 8,
  person_enrichment: 10,
} as const;
export type BillableOperation = keyof typeof BILLABLE_OPERATIONS;

export type ChargeOutcome = "completed" | "duplicate_removed" | "cached" | "provider_timeout" | "platform_failure" | "technical_failure";

/**
 * What a row costs, and — more importantly — what it does not.
 *
 * ONE PLACE. The specification lists five things that must never be charged for,
 * and the way that promise gets broken is that four of them are handled here and
 * the fifth is handled somewhere else, six months later, by somebody who never
 * read this list. A caller passes the outcome; this decides the money.
 *
 * REVERIFICATION IS 25% because the expensive part — finding the person, the
 * company and the route — was done the first time. Charging full price to check
 * an address we already hold would be charging for our own record-keeping.
 */
export function chargeFor(input: {
  operation: BillableOperation;
  outcome: ChargeOutcome;
  isReverification?: boolean;
  /** Already charged in this job for this row and operation. */
  alreadyCharged?: boolean;
}): { acus: number; why: string } {
  if (input.alreadyCharged) {
    return { acus: 0, why: "Already charged for this row and operation in this job. A resumed job never charges twice — that is the most expensive defect this engine could have." };
  }
  switch (input.outcome) {
    case "duplicate_removed":
      return { acus: 0, why: "Removed as a duplicate before any discovery ran. Nothing was spent, so nothing is charged." };
    case "cached":
      return { acus: 0, why: "Answered from this tenant's own record, still inside its verification window. No provider was called." };
    case "provider_timeout":
      return { acus: 0, why: "The provider did not answer. Their failure is not the customer's cost." };
    case "platform_failure":
      return { acus: 0, why: "Repeated because of a failure on our side. Never charged." };
    case "technical_failure":
      return { acus: 0, why: "The request failed technically and returned nothing." };
    case "completed": {
      const base = BILLABLE_OPERATIONS[input.operation];
      const acus = input.isReverification ? Math.round(base * 0.25 * 100) / 100 : base;
      return {
        acus,
        why: input.isReverification
          ? `Reverification within the window: ${acus} ${acus === 1 ? "ACU" : "ACUs"}, a quarter of ${base} — the expensive part, finding the person and the route, was done the first time.`
          : `${acus} ${acus === 1 ? "ACU" : "ACUs"} for a completed ${input.operation.replace(/_/g, " ")}.`,
      };
    }
  }
}

/** What a job would cost at most, before it runs. Shown before the button. */
export function estimateJob(input: {
  rows: number;
  fields: BillableOperation[];
}): { maxAcus: number; perRow: number; breakdown: { operation: BillableOperation; acus: number }[]; note: string } {
  const breakdown = input.fields.map((operation) => ({ operation, acus: BILLABLE_OPERATIONS[operation] }));
  const perRow = Math.round((BILLABLE_OPERATIONS.import_clean + breakdown.reduce((s, b) => s + b.acus, 0)) * 100) / 100;
  return {
    maxAcus: Math.ceil(perRow * Math.max(0, input.rows)),
    perRow,
    breakdown,
    note: "The ceiling, not the expectation. Rows that duplicate, cache, time out or fail cost nothing, so the actual charge is normally well under this — and the job stops rather than exceeding it.",
  };
}

// ---------------------------------------------------------------------------
// 6. The workbook
// ---------------------------------------------------------------------------

/** The columns MarketWar appends. Every one is prefixed so nothing collides. */
export const MW_COLUMNS = [
  "MW_Record_ID", "MW_Original_Row", "MW_Input_Type", "MW_Match_Status", "MW_Matched_Name",
  "MW_Company_Legal_Name", "MW_Company_Trading_Name", "MW_Current_Job_Title", "MW_Department",
  "MW_Seniority", "MW_Website", "MW_Company_Number", "MW_Company_Status", "MW_Industry",
  "MW_Location", "MW_Email", "MW_Email_Type", "MW_Email_Verification", "MW_Email_Confidence",
  "MW_Phone", "MW_Phone_Type", "MW_Phone_Verification", "MW_Phone_Confidence",
  "MW_Professional_Profile", "MW_Primary_Source_URL", "MW_Secondary_Source_URL", "MW_Source_Date",
  "MW_Last_Verified", "MW_Compliance_Status", "MW_Outreach_Eligibility", "MW_Lead_Score",
  "MW_AI_Recommendation", "MW_Failure_Reason",
] as const;

export type ResultRow = {
  /** The user's original row, EXACTLY as supplied. Never edited. */
  original: Record<string, string>;
  originalRow: number;
  state: RowState;
  mw: Partial<Record<(typeof MW_COLUMNS)[number], string>>;
};

export type Sheet = { name: string; columns: string[]; rows: Record<string, string>[] };
export type Workbook = { sheets: Sheet[] };

export const NOT_FOUND_REASONS = [
  "Company not identified",
  "Domain unavailable",
  "Person no longer employed",
  "No permitted business email found",
  "No published business phone found",
  "Insufficient identifying information",
  "Source access prohibited",
  "Record suppressed",
] as const;

/**
 * Compose the six sheets.
 *
 * SHEET 2 IS THE PRODUCT. "Ready for Outreach" is the only sheet somebody should
 * be able to paste into a sending tool without thinking, so a row reaches it only
 * by passing every gate — identity, verification, evidence, compliance,
 * suppression. Everything uncertain has its own sheet with the reason attached,
 * rather than sitting in the main list with a subtle flag nobody filters on.
 */
export function buildWorkbook(input: {
  rows: ResultRow[];
  originalColumns: string[];
  duplicatesRemoved: number;
  acusConsumed: number;
  processingMs: number;
  sourceAudit?: { recordId: string; field: string; sourceUrl: string; sourceType: string; capturedAt: string; verificationMethod: string; confidence: string; policyDecision: string }[];
}): Workbook {
  const cols = [...input.originalColumns, ...MW_COLUMNS];
  const flat = (r: ResultRow): Record<string, string> => ({ ...r.original, ...r.mw });

  const completed = input.rows.filter((r) => r.state === "COMPLETED");
  const review = input.rows.filter((r) => r.state === "MANUAL_REVIEW");
  const notFound = input.rows.filter((r) => r.state === "NOT_FOUND" || r.state === "BLOCKED");
  const partial = input.rows.filter((r) => r.state === "PARTIAL");

  // READY FOR OUTREACH is narrower than COMPLETED on purpose: completed means we
  // finished looking, eligible means it may actually be contacted.
  const ready = completed.filter((r) => r.mw.MW_Outreach_Eligibility === "ELIGIBLE");

  const summary: Record<string, string>[] = [
    { Metric: "Rows received", Value: String(input.rows.length + input.duplicatesRemoved) },
    { Metric: "Duplicates removed", Value: String(input.duplicatesRemoved) },
    { Metric: "Unique records processed", Value: String(input.rows.length) },
    { Metric: "Completed", Value: String(completed.length) },
    { Metric: "Ready for outreach", Value: String(ready.length) },
    { Metric: "Partially completed", Value: String(partial.length) },
    { Metric: "Awaiting manual review", Value: String(review.length) },
    { Metric: "Not found or blocked", Value: String(notFound.length) },
    { Metric: "ACUs consumed", Value: String(input.acusConsumed) },
    {
      Metric: "Cost per completed record (ACUs)",
      // A denominator of zero is a dash, not Infinity and not a fabricated 0.
      Value: completed.length > 0 ? String(Math.round((input.acusConsumed / completed.length) * 100) / 100) : "—",
    },
    { Metric: "Processing time (seconds)", Value: String(Math.round(input.processingMs / 1000)) },
  ];

  return {
    sheets: [
      { name: "Completed Results", columns: cols, rows: input.rows.map(flat) },
      { name: "Ready for Outreach", columns: cols, rows: ready.map(flat) },
      { name: "Manual Review", columns: cols, rows: review.map(flat) },
      { name: "Not Found", columns: cols, rows: notFound.map(flat) },
      { name: "Job Summary", columns: ["Metric", "Value"], rows: summary },
      {
        name: "Source Audit",
        columns: ["Record ID", "Field", "Source URL", "Source type", "Collected", "Verification method", "Confidence", "Policy decision"],
        rows: (input.sourceAudit ?? []).map((a) => ({
          "Record ID": a.recordId, Field: a.field, "Source URL": a.sourceUrl, "Source type": a.sourceType,
          Collected: a.capturedAt, "Verification method": a.verificationMethod, Confidence: a.confidence, "Policy decision": a.policyDecision,
        })),
      },
    ],
  };
}

/**
 * Serialise the workbook as SpreadsheetML — multi-sheet, with no dependency.
 *
 * WHY NOT .xlsx. A modern xlsx is a ZIP of XML parts, and writing one needs a
 * zip library this repository does not have. Adding a dependency to a platform
 * that already ships is a decision with a security surface and a mirroring cost
 * across two branches, and it is not mine to make quietly for a file format.
 *
 * SpreadsheetML 2003 is Microsoft's own published XML spreadsheet format: plain
 * text and genuinely multi-sheet.
 *
 * WHAT WAS AND WAS NOT VERIFIED. The output is well-formed XML — parsed with a
 * real XML parser in the test suite, six named worksheets, every cell escaped.
 * It has NOT been opened in a spreadsheet application: the only one available
 * here is a Writer-only LibreOffice build with no Calc import filters, which
 * refuses a plain CSV as readily as it refuses this. So the format is correct
 * against the published schema and unproven against a real application, and
 * saying otherwise would be exactly the kind of unverified claim this codebase
 * has a rule about.
 *
 * `workbookToCsv` exists beside it for that reason: CSV needs no filter, no
 * schema and no faith, and every tool on earth reads it. A caller who wants
 * certainty rather than tabs takes that one.
 */
export function workbookToSpreadsheetML(wb: Workbook): string {
  const esc = (v: string) => String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Control characters are not valid XML at any escaping — strip rather than
    // emit a file that will not open.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

  const sheetXml = (s: Sheet) => {
    const head = `<Row>${s.columns.map((c) => `<Cell><Data ss:Type="String">${esc(c)}</Data></Cell>`).join("")}</Row>`;
    const body = s.rows.map((r) =>
      `<Row>${s.columns.map((c) => `<Cell><Data ss:Type="String">${esc(r[c] ?? "")}</Data></Cell>`).join("")}</Row>`,
    ).join("");
    // Sheet names cannot contain : \ / ? * [ ] and cap at 31 characters.
    const name = esc(s.name.replace(/[:\\/?*[\]]/g, " ").slice(0, 31));
    return `<Worksheet ss:Name="${name}"><Table>${head}${body}</Table></Worksheet>`;
  };

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${wb.sheets.map(sheetXml).join("\n")}
</Workbook>`;
}

/**
 * The same workbook as one CSV per sheet.
 *
 * The dependable half of the pair. RFC 4180 quoting — double the quotes, wrap
 * anything containing a comma, a quote or a newline — and a leading apostrophe
 * on a cell that starts with =, +, - or @, because a spreadsheet treats those as
 * formulas and a CSV that hands somebody's cell to a formula engine is a
 * well-documented way to get a customer's machine to run a command. That risk is
 * not theoretical for this engine in particular: every value here came off
 * somebody else's website.
 */
export function workbookToCsv(wb: Workbook): { name: string; csv: string }[] {
  const cell = (v: string) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return wb.sheets.map((s) => ({
    name: s.name,
    csv: [s.columns.map(cell).join(","), ...s.rows.map((r) => s.columns.map((c) => cell(r[c] ?? "")).join(","))].join("\r\n"),
  }));
}

// ---------------------------------------------------------------------------
// 7. Demo
// ---------------------------------------------------------------------------

export function demoContactFinder() {
  const headers = ["Contact Name", "Business", "Web Address", "Telephone", "Internal Notes"];
  const mapping = mapColumns(headers);

  const rows: string[][] = [
    ["Prospect list — Q3", "", "", "", ""],
    ["", "", "", "", ""],
    headers,
    ["Amanda Brown", "ABC Construction", "", "", "call back"],
    ["", "Delta Engineering", "delta.example", "", ""],
    ["James Wilson", "", "", "", ""],
    ["Total", "3", "", "", ""],
  ];
  const header = detectHeaderRow(rows);

  const inputs = ["Justin Nseya", "Groupe Nseya", "examplecompany.com", "a@b.co.uk", "0113 496 0000", "Unit 4, Elm Industrial Estate, LS6 2AB", "https://linkedin.com/in/someone", "Wilson"]
    .map((v) => ({ value: v, ...detectInputType(v) }));

  const deduped = dedupe([
    { originalRow: 4, full_name: "Amanda Brown", company_name: "ABC Construction", country: "GB" },
    { originalRow: 5, company_name: "Delta Engineering", website: "https://www.delta.example/" },
    { originalRow: 6, full_name: "Amanda Brown", company_name: "ABC Construction", country: "GB" },
    { originalRow: 7, company_name: "Delta Engineering", website: "delta.example" },
  ]);

  // The refusal that matters: two James Wilsons, and no way to tell them apart.
  const ambiguous = resolveIdentity({
    candidates: [
      { fullName: "James Wilson", company: "Wilson Build Ltd", jobTitle: "Director", score: 0.72, evidence: [] },
      { fullName: "James Wilson", company: "JW Groundworks", jobTitle: "Owner", score: 0.68, evidence: [] },
    ],
  });
  const clear = resolveIdentity({
    candidates: [
      { fullName: "Amanda Brown", company: "ABC Construction Ltd", jobTitle: "Procurement Director", score: 0.94, evidence: [] },
      { fullName: "Amanda Browne", company: "Unrelated Ltd", score: 0.41, evidence: [] },
    ],
  });

  const merge = mergeValue(
    { value: "confirmed@abc.example", provenance: "confirmed", verifiedAt: "2026-06-01T00:00:00.000Z" },
    { value: "guessed@abc.example", provenance: "inferred", verifiedAt: "2026-08-26T00:00:00.000Z" },
  );

  const resultRows: ResultRow[] = [
    {
      originalRow: 4, state: "COMPLETED",
      original: { "Contact Name": "Amanda Brown", Business: "ABC Construction", "Web Address": "", Telephone: "", "Internal Notes": "call back" },
      mw: {
        MW_Record_ID: "rec_1", MW_Original_Row: "4", MW_Input_Type: "PERSON", MW_Match_Status: "HIGH_CONFIDENCE_MATCH",
        MW_Matched_Name: "Amanda Brown", MW_Company_Legal_Name: "ABC Construction Ltd",
        MW_Current_Job_Title: "Procurement Director", MW_Email_Verification: "VERIFIED",
        MW_Phone_Verification: "PUBLISHED_UNVERIFIED", MW_Compliance_Status: "legitimate_interest",
        MW_Outreach_Eligibility: "ELIGIBLE", MW_Lead_Score: "88",
        MW_Primary_Source_URL: "https://abc.example/team",
      },
    },
    {
      originalRow: 6, state: "MANUAL_REVIEW",
      original: { "Contact Name": "James Wilson", Business: "", "Web Address": "", Telephone: "", "Internal Notes": "" },
      mw: {
        MW_Record_ID: "rec_2", MW_Original_Row: "6", MW_Input_Type: "PERSON", MW_Match_Status: "MULTIPLE_CANDIDATES",
        MW_Outreach_Eligibility: "REVIEW", MW_Failure_Reason: ambiguous.why,
      },
    },
    {
      originalRow: 5, state: "NOT_FOUND",
      original: { "Contact Name": "", Business: "Delta Engineering", "Web Address": "delta.example", Telephone: "", "Internal Notes": "" },
      mw: {
        MW_Record_ID: "rec_3", MW_Original_Row: "5", MW_Input_Type: "COMPANY", MW_Match_Status: "NO_MATCH",
        MW_Outreach_Eligibility: "BLOCKED", MW_Failure_Reason: "No permitted business email found",
      },
    },
  ];

  const workbook = buildWorkbook({
    rows: resultRows, originalColumns: headers,
    duplicatesRemoved: deduped.duplicates.length, acusConsumed: 34, processingMs: 12_400,
    sourceAudit: [{ recordId: "rec_1", field: "email", sourceUrl: "https://abc.example/contact", sourceType: "company_website", capturedAt: "2026-08-27T09:00:00.000Z", verificationMethod: "12-check verification", confidence: "0.91", policyDecision: "legitimate_interest" }],
  });

  return {
    mapping, header,
    skipped: rows.map((r, i) => ({ row: i + 1, ...isSkippableRow(r) })).filter((r) => r.skip),
    inputs, deduped, ambiguous, clear, merge,
    estimate: estimateJob({ rows: 1854, fields: ["company_resolution", "person_resolution", "email_discovery", "email_verification"] }),
    charges: [
      chargeFor({ operation: "email_verification", outcome: "completed" }),
      chargeFor({ operation: "email_verification", outcome: "completed", isReverification: true }),
      chargeFor({ operation: "person_resolution", outcome: "duplicate_removed" }),
      chargeFor({ operation: "person_resolution", outcome: "provider_timeout" }),
      chargeFor({ operation: "person_resolution", outcome: "completed", alreadyCharged: true }),
    ],
    workbook: { sheets: workbook.sheets.map((s) => ({ name: s.name, columns: s.columns.length, rows: s.rows.length })) },
  };
}
