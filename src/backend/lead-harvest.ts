// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Lead Harvest — the COMPLIANT B2B contact-intelligence engine.
//
// Spec (Contact Extractor / "Lead Harvest AI"): discover only lawful, public
// business contacts, classify risk, verify quality, apply lawful-basis rules,
// and gate every send. This is deliberately a compliance-first engine, NOT an
// "extract every email" tool. It never invents contact data, never promises
// "0 spam", and blocks any send that fails the gate.
//
//   • Email classification   — low-risk generic mailbox vs higher-risk personal.
//   • Contact record          — the 13 fields every harvested email must carry.
//   • Verification engine      — 12 checks → risk + bounce probability + verdict.
//   • Compliance engine        — GDPR lawful basis / LIA / PECR / CAN-SPAM by region.
//   • Outreach gate            — 12 pre-send checks; a failure blocks the send.
//
// Pure + deterministic (seeded, no randomness) so it runs in demo mode and
// unit-checks. Live MX/blacklist lookups refine it post-launch.

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const seed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };

// ---------------------------------------------------------------------------
// 1. Email classification — generic corporate vs personal (= personal data).
// ---------------------------------------------------------------------------
export const GENERIC_MAILBOXES = [
  "info", "sales", "hello", "contact", "enquiries", "enquiry", "partnerships",
  "marketing", "press", "procurement", "business", "support",
];
const DISPOSABLE_DOMAINS = ["mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "trashmail.com", "yopmail.com"];

export type EmailClass = {
  email: string; local: string; domain: string;
  contactType: "generic" | "personal";
  riskCategory: "low" | "higher";
  personalData: boolean; // higher-risk personal emails are personal data under UK/EU
};

export function classifyEmail(email: string): EmailClass {
  const [local = "", domain = ""] = String(email).toLowerCase().split("@");
  const isGeneric = GENERIC_MAILBOXES.includes(local);
  return {
    email: String(email).toLowerCase(), local, domain,
    contactType: isGeneric ? "generic" : "personal",
    riskCategory: isGeneric ? "low" : "higher",
    personalData: !isGeneric, // a named-person mailbox is personal data even at a company
  };
}

// ---------------------------------------------------------------------------
// 2. Contact record — the 13 fields every harvested email must carry.
// ---------------------------------------------------------------------------
export type ContactRecord = {
  email: string;
  company: string;
  website: string;
  sourceUrl: string;      // provenance — which public page it came from
  dateExtracted: string;  // caller-supplied (deterministic; no wall-clock here)
  country: string;
  sector: string;
  department: string;
  contactType: "generic" | "personal";
  /** 0–100 from the verification engine, or null when nothing measured it. */
  confidence: number | null;
  lawfulBasisStatus: "consent" | "legitimate_interest" | "pending" | "none";
  outreachEligibility: "eligible" | "review" | "blocked";
  suppressionStatus: "clear" | "suppressed";
};

export function buildContactRecord(input: Partial<ContactRecord> & { email: string; sourceUrl: string }): ContactRecord {
  const cls = classifyEmail(input.email);
  return {
    email: cls.email,
    company: input.company ?? "",
    website: input.website ?? "",
    sourceUrl: input.sourceUrl,
    dateExtracted: input.dateExtracted ?? "",
    country: input.country ?? "GB",
    sector: input.sector ?? "",
    department: input.department ?? (cls.contactType === "generic" ? cls.local : "unknown"),
    contactType: cls.contactType,
    // NOT `clamp(60 + seed(email) % 35)`. That produced a 60–95 "confidence"
    // from the letters of the address, and a customer decides whether to email
    // a real human being on the strength of it — a stranger who never asked to
    // hear from them. A number nobody measured is the worst possible input to
    // that decision, and 60–95 reads as "probably fine" for every address ever
    // harvested, including the ones that are not.
    //
    // Null means "we did not measure this". The verification engine below runs
    // twelve real checks and produces a real verdict; that is what a confidence
    // figure should come from, and callers who have run it pass it in.
    confidence: input.confidence ?? null,
    lawfulBasisStatus: input.lawfulBasisStatus ?? "pending",
    outreachEligibility: input.outreachEligibility ?? "review",
    suppressionStatus: input.suppressionStatus ?? "clear",
  };
}

// ---------------------------------------------------------------------------
// 3. Verification engine — 12 checks → risk + bounce probability + verdict.
// ---------------------------------------------------------------------------
/**
 * A check either passed, failed, or was never run.
 *
 * `pass: null` is the third state, and it exists because two of these twelve
 * used to be decided by a hash of the address.
 */
export type Check = { name: string; pass: boolean | null; detail: string };
export type VerificationResult = {
  email: string; checks: Check[]; passedCount: number;
  riskScore: number; bounceProbability: number;
  verdict: "safe" | "risky" | "reject";
  /** Checks that were never performed. Never silently counted as passes. */
  notRun: string[];
  note: string;
};

export type VerifyContext = {
  suppressed?: Set<string>;
  blacklistedDomains?: Set<string>;
  complained?: Set<string>;
  seenEmails?: Set<string>;
  /**
   * Does this domain have a mail exchanger? Only a DNS lookup knows. Pass the
   * answer in when you have done one; leave it undefined and the check reports
   * "not run" instead of inventing a result.
   */
  mxByDomain?: Map<string, boolean>;
  /** Same for catch-all, which needs an SMTP probe nobody can do from here. */
  catchAllByDomain?: Map<string, boolean>;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function verifyEmail(email: string, ctx: VerifyContext = {}): VerificationResult {
  const cls = classifyEmail(email);
  const s = seed(cls.email);
  const syntax = EMAIL_RE.test(email);
  const domainOk = syntax && cls.domain.includes(".") && !cls.domain.endsWith(".");
  // A HASH USED TO DECIDE WHETHER A REAL DOMAIN HAD A MAIL SERVER.
  //
  //   const mx      = domainOk && (s % 100) > 8;   // "~8% no-MX (deterministic)"
  //   const catchAll = domainOk && (s % 100) > 82; // "~18% catch-all"
  //
  // s is seed(email). So "MX present" was a statement about the spelling of
  // the address, and roughly one address in twelve was declared undeliverable
  // — hard-failing to `reject` — for no reason at all, while the other eleven
  // were declared deliverable on the same non-evidence. The verdict this feeds
  // is what a customer reads before emailing a stranger who never asked to
  // hear from them, and it is also what protects the sending domain's
  // reputation, so a fabricated pass costs the owner as well as the recipient.
  //
  // Neither can be answered without a network lookup: MX needs DNS, catch-all
  // needs an SMTP probe. Undefined means NOT RUN, and a check that did not run
  // reports that rather than guessing.
  const mx = domainOk ? ctx.mxByDomain?.get(cls.domain) : false;
  const catchAll = domainOk ? ctx.catchAllByDomain?.get(cls.domain) : false;
  const disposable = DISPOSABLE_DOMAINS.includes(cls.domain);
  const roleBased = cls.contactType === "generic";
  const duplicate = Boolean(ctx.seenEmails?.has(cls.email));
  const suppressed = Boolean(ctx.suppressed?.has(cls.email));
  const blacklisted = Boolean(ctx.blacklistedDomains?.has(cls.domain));
  const priorComplaint = Boolean(ctx.complained?.has(cls.email));

  // Risk + bounce estimates (deterministic; labelled estimates, never certainties).
  let risk = 10;
  if (!syntax) risk += 60;
  // Only a MEASURED absence adds risk. "Not looked up" is not "not there".
  if (mx === false) risk += 40;
  if (disposable) risk += 50;
  if (catchAll === true) risk += 20;
  if (blacklisted) risk += 45;
  if (priorComplaint) risk += 60;
  if (roleBased) risk += 5;
  const riskScore = clamp(risk);
  const bounceProbability = Math.round((clamp((mx === false ? 55 : 0) + (disposable ? 40 : 0) + (catchAll === true ? 22 : 0) + (!syntax ? 90 : 4)) / 100) * 100) / 100;

  const checks: Check[] = [
    { name: "syntax", pass: syntax, detail: syntax ? "Valid format" : "Malformed address" },
    { name: "domain", pass: domainOk, detail: domainOk ? cls.domain : "Invalid domain" },
    { name: "mx_record", pass: mx ?? null, detail: mx === undefined ? "Not run — checking for a mail exchanger needs a DNS lookup, which has not been done for this address." : mx ? "MX present" : "No mail exchanger" },
    { name: "not_disposable", pass: !disposable, detail: disposable ? "Disposable provider" : "Not disposable" },
    { name: "role_based_flag", pass: true, detail: roleBased ? "Role-based (generic mailbox)" : "Named mailbox" },
    { name: "catch_all", pass: catchAll === undefined ? null : !catchAll, detail: catchAll === undefined ? "Not run — detecting a catch-all needs an SMTP probe, which has not been done for this domain." : catchAll ? "Catch-all domain (unverifiable)" : "Not catch-all" },
    { name: "risk_score", pass: riskScore < 50, detail: `Risk ${riskScore}/100` },
    { name: "bounce_probability", pass: bounceProbability < 0.3, detail: `~${Math.round(bounceProbability * 100)}% bounce` },
    { name: "duplicate", pass: !duplicate, detail: duplicate ? "Already in list" : "Unique" },
    { name: "suppression", pass: !suppressed, detail: suppressed ? "On suppression list" : "Not suppressed" },
    { name: "blacklist", pass: !blacklisted, detail: blacklisted ? "Domain blacklisted" : "Clean" },
    { name: "prior_complaint", pass: !priorComplaint, detail: priorComplaint ? "Prior spam complaint" : "No complaints" },
  ];
  const passedCount = checks.filter((c) => c.pass === true).length;
  const notRun = checks.filter((c) => c.pass === null).map((c) => c.name);
  // A hard fail needs a MEASURED failure. `mx === false` rejects; `undefined`
  // does not, because rejecting on a lookup nobody performed is the same
  // fabrication in the other direction.
  const hardFail = !syntax || mx === false || disposable || suppressed || blacklisted || priorComplaint;
  // "Safe" is a claim, and it needs the deliverability checks to have actually
  // run. Without them the honest verdict is "risky", not a green light.
  const verdict: VerificationResult["verdict"] =
    hardFail ? "reject" : riskScore >= 35 || catchAll === true || notRun.length ? "risky" : "safe";
  return {
    email: cls.email, checks, passedCount, riskScore, bounceProbability, verdict, notRun,
    note: notRun.length
      ? `${checks.length - notRun.length} of ${checks.length} checks ran. ${notRun.join(" and ")} need a network lookup that has not been done, so this address is 'risky' rather than 'safe' — not because anything failed, but because nothing confirmed it.`
      : `All ${checks.length} checks ran.`,
  };
}

// ---------------------------------------------------------------------------
// 4. Compliance engine — GDPR lawful basis / LIA / PECR / CAN-SPAM by region.
// ---------------------------------------------------------------------------
export const CANSPAM_REQUIREMENTS = [
  "Accurate From/header info", "Non-deceptive subject line", "Clear identification as an ad where applicable",
  "Valid physical postal address", "Clear opt-out mechanism", "Opt-out honoured promptly",
];

export type ComplianceInput = {
  record: ContactRecord;
  consentOnFile?: boolean;
  liaCompleted?: boolean;     // Legitimate Interest Assessment done + passed
  doNotContact?: boolean;
};
export type ComplianceVerdict = {
  region: "UK_EU" | "US" | "OTHER";
  personalData: boolean;
  lawfulBasis: "consent" | "legitimate_interest" | "none";
  liaRequired: boolean;
  canContact: boolean;
  requirements: string[];     // what must accompany the send
  reasons: string[];
};

const UK_EU = new Set(["GB", "UK", "IE", "FR", "DE", "ES", "IT", "NL", "BE", "PT", "SE", "DK", "FI", "PL", "AT"]);

export function assessCompliance(input: ComplianceInput): ComplianceVerdict {
  const rec = input.record;
  const region: ComplianceVerdict["region"] = UK_EU.has(rec.country.toUpperCase()) ? "UK_EU" : rec.country.toUpperCase() === "US" ? "US" : "OTHER";
  const cls = classifyEmail(rec.email);
  const reasons: string[] = [];
  const requirements: string[] = ["Unsubscribe / opt-out link", "Valid physical postal address", "Truthful sender + subject"];

  if (input.doNotContact || rec.suppressionStatus === "suppressed") {
    return { region, personalData: cls.personalData, lawfulBasis: "none", liaRequired: false, canContact: false, requirements, reasons: ["Do-not-contact / suppressed — never contact."] };
  }

  if (region === "US") {
    // CAN-SPAM is opt-out based, not consent-based — corporate outreach is lawful
    // with accurate headers, identification, a physical address and opt-out.
    requirements.push(...CANSPAM_REQUIREMENTS);
    reasons.push("US CAN-SPAM: opt-out regime — lawful with accurate headers, physical address and honoured opt-out.");
    return { region, personalData: cls.personalData, lawfulBasis: "legitimate_interest", liaRequired: false, canContact: true, requirements, reasons };
  }

  // UK/EU: corporate generic mailbox → legitimate interests (PECR softer for
  // corporate subscribers). Personal data → consent OR LI backed by a passed LIA.
  if (region === "UK_EU") {
    if (cls.contactType === "generic") {
      reasons.push("UK/EU: generic corporate mailbox — legitimate interests is available (PECR B2B).");
      return { region, personalData: false, lawfulBasis: "legitimate_interest", liaRequired: false, canContact: true, requirements, reasons };
    }
    // personal data
    if (input.consentOnFile) {
      reasons.push("UK/EU: personal data with consent on file — lawful.");
      return { region, personalData: true, lawfulBasis: "consent", liaRequired: false, canContact: true, requirements, reasons };
    }
    if (input.liaCompleted) {
      reasons.push("UK/EU: personal data — legitimate interests with a completed, passed LIA.");
      return { region, personalData: true, lawfulBasis: "legitimate_interest", liaRequired: true, canContact: true, requirements, reasons };
    }
    reasons.push("UK/EU: personal data with no consent and no completed LIA — cannot contact until a lawful basis is established.");
    return { region, personalData: true, lawfulBasis: "none", liaRequired: true, canContact: false, requirements, reasons };
  }

  // Other regions — default to the strict path.
  reasons.push("Region outside UK/EU/US — default to the strictest available basis; confirm local rules.");
  return { region, personalData: cls.personalData, lawfulBasis: input.consentOnFile ? "consent" : "none", liaRequired: cls.personalData, canContact: Boolean(input.consentOnFile) || cls.contactType === "generic", requirements, reasons };
}

// ---------------------------------------------------------------------------
// 5. Outreach gate — 12 pre-send checks; any failure blocks the send.
// ---------------------------------------------------------------------------
export type CampaignContext = {
  domainAuthenticated?: boolean; spf?: boolean; dkim?: boolean; dmarc?: boolean;
  unsubscribeLink?: boolean; physicalAddress?: boolean;
  suppressionChecked?: boolean; bounceProbability?: number;
  dailyLimitRespected?: boolean; recipientBlocked?: boolean;
  spamRiskScore?: number; // 0–100, lower is better
  purpose?: string;       // campaign purpose, matched against lawful basis
  channel?: "email" | "sms" | "whatsapp";
  optInWording?: boolean; // required for SMS/WhatsApp
};

export type OutreachGate = { checks: Check[]; cleared: boolean; blockers: string[]; note: string };

export function outreachGate(record: ContactRecord, compliance: ComplianceVerdict, ctx: CampaignContext): OutreachGate {
  const bounceOk = (ctx.bounceProbability ?? 0) < 0.3;
  const spamOk = (ctx.spamRiskScore ?? 0) < 50;
  const channelOptIn = ctx.channel === "sms" || ctx.channel === "whatsapp" ? Boolean(ctx.optInWording) : true;

  const checks: Check[] = [
    { name: "domain_authenticated", pass: Boolean(ctx.domainAuthenticated), detail: "Sending domain authenticated" },
    { name: "spf", pass: Boolean(ctx.spf), detail: "SPF configured" },
    { name: "dkim", pass: Boolean(ctx.dkim), detail: "DKIM configured" },
    { name: "dmarc", pass: Boolean(ctx.dmarc), detail: "DMARC aligned" },
    { name: "unsubscribe_link", pass: Boolean(ctx.unsubscribeLink), detail: "Opt-out present" },
    { name: "physical_address", pass: Boolean(ctx.physicalAddress), detail: "Postal address present" },
    { name: "suppression_checked", pass: Boolean(ctx.suppressionChecked) && record.suppressionStatus === "clear", detail: "Suppression list checked + clear" },
    { name: "bounce_risk_acceptable", pass: bounceOk, detail: `Bounce risk ${(Math.round((ctx.bounceProbability ?? 0) * 100))}%` },
    { name: "daily_limit_respected", pass: ctx.dailyLimitRespected !== false, detail: "Within daily send limit" },
    { name: "purpose_matches_lawful_basis", pass: compliance.canContact, detail: `Lawful basis: ${compliance.lawfulBasis}` },
    { name: "recipient_not_blocked", pass: ctx.recipientBlocked !== true, detail: "Recipient not blocked" },
    { name: "spam_risk_scan", pass: spamOk && channelOptIn, detail: channelOptIn ? `Spam risk ${ctx.spamRiskScore ?? 0}/100` : "Missing SMS/WhatsApp opt-in wording" },
  ];
  const blockers = checks.filter((c) => !c.pass).map((c) => c.name);
  const cleared = blockers.length === 0;
  return {
    checks, cleared, blockers,
    note: cleared
      ? "All 12 checks pass — send is compliant and deliverability-protected. Maximum inbox placement is the promise; nobody can guarantee 0 spam."
      : `Blocked — ${blockers.length} check(s) failed (${blockers.join(", ")}). Fix before sending.`,
  };
}

// ---------------------------------------------------------------------------
// Deterministic demo run — a few contacts through the full pipeline.
// ---------------------------------------------------------------------------
export function demoHarvest() {
  const raw = [
    { email: "info@brixtongrill.co.uk", company: "Brixton Grill House", website: "brixtongrill.co.uk", sourceUrl: "brixtongrill.co.uk/contact", country: "GB", sector: "Hospitality" },
    { email: "j.smith@acme-legal.co.uk", company: "Acme Legal", website: "acme-legal.co.uk", sourceUrl: "acme-legal.co.uk/team", country: "GB", sector: "Legal" },
    { email: "sales@peaktech.com", company: "PeakTech", website: "peaktech.com", sourceUrl: "peaktech.com/about", country: "US", sector: "SaaS" },
    { email: "bob@mailinator.com", company: "Unknown", website: "", sourceUrl: "directory/listing", country: "GB", sector: "Unknown" },
  ];
  const seen = new Set<string>();
  const contacts = raw.map((r) => {
    const record = buildContactRecord({ ...r, dateExtracted: "demo" });
    const verification = verifyEmail(r.email, { seenEmails: seen });
    seen.add(record.email);
    const compliance = assessCompliance({ record, liaCompleted: r.email.startsWith("j.smith") }); // LIA done for the one personal contact
    const gate = outreachGate(record, compliance, {
      domainAuthenticated: true, spf: true, dkim: true, dmarc: true, unsubscribeLink: true, physicalAddress: true,
      suppressionChecked: true, bounceProbability: verification.bounceProbability, dailyLimitRespected: true,
      recipientBlocked: false, spamRiskScore: 22, channel: "email", purpose: "B2B introduction",
    });
    return { record, classification: classifyEmail(r.email), verification, compliance, gate };
  });
  return {
    contacts,
    summary: {
      total: contacts.length,
      sendable: contacts.filter((c) => c.gate.cleared).length,
      rejected: contacts.filter((c) => c.verification.verdict === "reject").length,
      blockedByCompliance: contacts.filter((c) => !c.compliance.canContact).length,
    },
    doctrine: "Only lawful public business contacts; every record carries source + lawful-basis status; sends pass a 12-check gate. The promise is maximum inbox placement — never '0 spam'.",
  };
}
