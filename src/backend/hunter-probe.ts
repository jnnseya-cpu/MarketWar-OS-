// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// DOES THE HUNTER ADAPTER'S MAPPING MATCH THE REAL API? — asked FROM the deployment.
//
// WHY THIS EXISTS RATHER THAN JUST THE SCRIPT. `enrichment-adapters.ts` carries a
// rule this repository wrote for itself and has been right about: an adapter that
// has never been run against the real API is worse than an absence, because it
// looks like coverage and fails the first time somebody pays for it. The Hunter
// adapter is in exactly that state — the environment it was written in cannot
// reach api.hunter.io at all, so its field mapping is REASONED, not OBSERVED.
//
// `scripts/check-hunter.mjs` converts one into the other, and needs a terminal
// and a clone. This does the same work from the deployment, which already has the
// key and the network — the pattern that ended a day of guesswork earlier today:
// when a question can only be answered where the code is running, make the code
// answer it rather than asking somebody to relay evidence.
//
// ONE IMPLEMENTATION, TWO CALLERS. The script imports this. A second copy of the
// field list would drift from the first, and the drift would be invisible —
// exactly the "one source of truth per concept" rule that keeps being the thing
// this codebase gets bitten by.
//
// IT SPENDS REAL CREDITS: one domain search, one email finder, one verification,
// about $0.11 at list price. Every caller of this must therefore be authorised;
// the route that exposes it gates on a platform-admin session or the scheduler
// bearer, for the same reason `/api/health/email?send=` does.
//
// IT RETURNS NO CONTACT DATA. Field PRESENCE, statuses and counts — never an
// address, never a name. A diagnostic that leaks the thing it is diagnosing is
// the defect this codebase already fixed once on the mail report.

import { hunterKey, hunterErrorNote } from "@/backend/enrichment-adapters";

export type FieldCheck = {
  /** The path the adapter reads, exactly as it reads it. */
  field: string;
  present: boolean;
  /** What was there, when it is safe to show — a type, a count, a status. Never a value. */
  saw: string;
};

export type ProbeSection = {
  endpoint: "account" | "domain-search" | "email-finder" | "email-verifier";
  ran: boolean;
  status: number | null;
  checks: FieldCheck[];
  /** What the ADAPTER would have produced from this response. */
  wouldProduce: string;
  error?: string;
};

export type HunterProbe = {
  configured: boolean;
  ok: boolean;
  /** Credits remaining, so "no results" and "no balance" are never confused. */
  searchCreditsLeft: number | null;
  verifyCreditsLeft: number | null;
  sections: ProbeSection[];
  verdict: string;
  costNote: string;
};

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? { ...v } : {});
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Hunter's documented verifier statuses. Anything else is information the adapter loses. */
export const KNOWN_VERIFIER_STATUSES = ["valid", "invalid", "accept_all", "webmail", "disposable", "unknown"] as const;

async function call(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<{ status: number | null; body: unknown; error?: string }> {
  const key = hunterKey();
  const q = new URLSearchParams({ ...params, api_key: key });
  try {
    const res = await fetch(`https://api.hunter.io/v2/${path}?${q.toString()}`, { signal, headers: { Accept: "application/json" } });
    let body: unknown = null;
    try { body = await res.json(); } catch { /* a non-JSON body is reported by status alone */ }
    return { status: res.status, body };
  } catch (e) {
    return { status: null, body: null, error: `Could not reach api.hunter.io: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Run the three calls the adapter makes and report whether every field it reads
 * was actually there.
 *
 * `domain` is the site to search; the finder and verifier use fixed, well-known
 * targets so the check is comparable between runs and cannot be steered at a
 * third party by whoever opens the URL.
 */
export async function probeHunter(domain = "stripe.com", signal?: AbortSignal): Promise<HunterProbe> {
  const configured = Boolean(hunterKey());
  const sections: ProbeSection[] = [];
  if (!configured) {
    return {
      configured: false, ok: false, searchCreditsLeft: null, verifyCreditsLeft: null, sections,
      verdict: "HUNTER_API_KEY is not set on this deployment, so nothing was called and no credit was spent. Set it, redeploy, and open this again.",
      costNote: "Nothing was spent.",
    };
  }

  // 0. THE ACCOUNT FIRST. An empty balance and a broken mapping both look like
  //    "no results", and they need opposite actions — so the balance is
  //    established before any result below is interpreted.
  const acct = await call("account", {}, signal);
  const acctData = rec(rec(acct.body).data);
  const requests = rec(acctData.requests);
  const searchLeft = num(rec(requests.searches).available);
  const verifyLeft = num(rec(requests.verifications).available);
  sections.push({
    endpoint: "account",
    ran: acct.status !== null,
    status: acct.status,
    checks: [
      { field: "data.plan_name", present: Boolean(str(acctData.plan_name)), saw: str(acctData.plan_name) || "—" },
      { field: "data.requests.searches.available", present: searchLeft !== null, saw: searchLeft === null ? "—" : String(searchLeft) },
      { field: "data.requests.verifications.available", present: verifyLeft !== null, saw: verifyLeft === null ? "—" : String(verifyLeft) },
    ],
    wouldProduce: acct.status === 200 ? "The key is live." : "Every result below would be meaningless.",
    ...(acct.status !== 200 ? { error: acct.error ?? hunterErrorNote(acct.status ?? 0, acct.body) } : {}),
  });

  if (acct.status !== 200) {
    return {
      configured: true, ok: false, searchCreditsLeft: searchLeft, verifyCreditsLeft: verifyLeft, sections,
      verdict: `The key was refused, so nothing else was attempted. ${acct.error ?? hunterErrorNote(acct.status ?? 0, acct.body)}`,
      costNote: "No search or verification credit was spent.",
    };
  }

  // 1. DOMAIN SEARCH — findPeople and findEmails both read this shape.
  const ds = await call("domain-search", { domain, limit: "10" }, signal);
  const d = rec(rec(ds.body).data);
  const rows = Array.isArray(d.emails) ? d.emails : [];
  const first = rec(rows[0]);
  const named = rows.filter((r) => str(rec(r).first_name) || str(rec(r).last_name)).length;
  const withValue = rows.filter((r) => str(rec(r).value)).length;
  sections.push({
    endpoint: "domain-search",
    ran: ds.status !== null,
    status: ds.status,
    checks: [
      { field: "data.organization", present: "organization" in d, saw: str(d.organization) ? "a name" : "empty" },
      { field: "data.pattern", present: "pattern" in d, saw: str(d.pattern) ? "a pattern" : "empty" },
      { field: "data.emails[]", present: Array.isArray(d.emails), saw: `${rows.length} rows` },
      { field: "emails[].value", present: rows.length === 0 || "value" in first, saw: `${withValue} with an address` },
      { field: "emails[].first_name", present: rows.length === 0 || "first_name" in first, saw: `${named} named` },
      { field: "emails[].position", present: rows.length === 0 || "position" in first, saw: "position" in first ? "present" : "absent" },
      { field: "emails[].sources[].uri", present: rows.length === 0 || Array.isArray(first.sources), saw: Array.isArray(first.sources) ? `${first.sources.length} sources` : "absent" },
    ],
    wouldProduce: `${named} people (rows with a name) and ${withValue} emails, every one provenance "provider".`,
    ...(ds.status !== 200 ? { error: ds.error ?? hunterErrorNote(ds.status ?? 0, ds.body) } : {}),
  });

  // 2. EMAIL FINDER — a different endpoint with a different shape, so it is
  //    checked rather than assumed to match the one above.
  const ef = await call("email-finder", { domain: "reddit.com", first_name: "Alexis", last_name: "Ohanian" }, signal);
  const f = rec(rec(ef.body).data);
  sections.push({
    endpoint: "email-finder",
    ran: ef.status !== null,
    status: ef.status,
    checks: [
      { field: "data.email", present: "email" in f, saw: str(f.email) ? "an address" : "null" },
      { field: "data.sources[]", present: Array.isArray(f.sources), saw: Array.isArray(f.sources) ? `${f.sources.length} sources` : "absent" },
    ],
    wouldProduce: str(f.email) ? "1 email, provenance \"provider\"." : "[] — no address for that person.",
    ...(ef.status !== 200 ? { error: ef.error ?? hunterErrorNote(ef.status ?? 0, ef.body) } : {}),
  });

  // 3. VERIFIER — the reason this provider is worth paying for, and the one place
  //    a wrong mapping deletes a real contact.
  const ev = await call("email-verifier", { email: "patrick@stripe.com" }, signal);
  const v = rec(rec(ev.body).data);
  const status = str(v.status).toLowerCase();
  const acceptAll = v.accept_all === true || status === "accept_all";
  const recognised = KNOWN_VERIFIER_STATUSES.some((s) => s === status);
  sections.push({
    endpoint: "email-verifier",
    ran: ev.status !== null,
    status: ev.status,
    checks: [
      { field: "data.status", present: Boolean(status), saw: status || "—" },
      { field: "data.status is one the adapter knows", present: recognised, saw: recognised ? "recognised" : `UNRECOGNISED "${status}"` },
      { field: "data.score", present: num(v.score) !== null, saw: num(v.score) === null ? "—" : String(num(v.score)) },
      { field: "data.accept_all", present: "accept_all" in v, saw: String(acceptAll) },
    ],
    wouldProduce: status === "valid" ? "deliverable: true"
      : status === "invalid" ? "deliverable: false, invalid: true"
      : acceptAll ? "deliverable: null, catchAll: true"
      : "deliverable: null — an unknown, NOT a rejection.",
    ...(ev.status !== 200 ? { error: ev.error ?? hunterErrorNote(ev.status ?? 0, ev.body) } : {}),
  });

  const missing = sections.flatMap((s) => s.checks.filter((c) => !c.present).map((c) => `${s.endpoint}.${c.field}`));
  const failedCalls = sections.filter((s) => s.status !== 200).map((s) => s.endpoint);
  const ok = missing.length === 0 && failedCalls.length === 0;

  return {
    configured: true,
    ok,
    searchCreditsLeft: searchLeft,
    verifyCreditsLeft: verifyLeft,
    sections,
    verdict: ok
      ? "Every field the adapter reads was present and every verifier status was recognised. The mapping is now OBSERVED rather than reasoned, and the waterfall will use Hunter after the free sources."
      : [
          failedCalls.length ? `${failedCalls.join(", ")} did not answer 200.` : "",
          missing.length ? `Hunter has changed a shape — the adapter reads ${missing.length} field(s) that were not there: ${missing.join(", ")}. Send this report; each one is a line in the adapter.` : "",
        ].filter(Boolean).join(" "),
    costNote: "This spent one domain search, one email finder and one verification — about $0.11 at list price. It is the cheapest possible way to find out the integration is wrong.",
  };
}
