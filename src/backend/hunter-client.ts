// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// THE HUNTER CLIENT, IN ONE PLACE.
//
// WHY IT MOVED. It lived inside `enrichment-adapters.ts`, which imports
// `scrapeEnrich` from `enrich.ts` — so `enrich.ts` could not import it back
// without a cycle. That is why the Customer Vault's "Find emails" button had no
// Hunter step at all: not a decision, a module graph. The owner was paying for a
// Hunter key that the one button he presses could never reach, while a fully
// written Hunter adapter sat one import away on a different screen.
//
// Nothing about the behaviour changes here. The client is the same code, in a
// file that has no dependencies of its own, so both callers can use it.

import { ACU_PER_GBP, USD_TO_GBP } from "@/shared/creative";

// one: reserving for a search and spending on a verification recovers more than
// it cost, and the reverse would breach the floor. Derived from the shared
// constants rather than typed as a magic number, so a change to either moves
// this with it.
const HUNTER_SEARCH_USD = 0.05;
/** 4 ACUs at today's constants: $0.05 × 0.79 × 100 = 3.95, rounded up so the floor cannot be undercut. */
export const HUNTER_COST_ACU = Math.ceil(HUNTER_SEARCH_USD * USD_TO_GBP * ACU_PER_GBP);

export const hunterKey = (): string => (process.env.HUNTER_API_KEY || "").trim();

/**
 * Read Hunter's answer WITHOUT asserting its shape.
 *
 * `scripts/check-casts.mjs` forbids a cast on external data, and this is why:
 * a supplier's JSON is the definition of data we do not control, and a cast
 * would turn a changed field into `undefined` flowing silently through the
 * engine rather than an empty result. Every field is checked and anything
 * unrecognised is simply absent.
 */
export const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? { ...v } : {});
export const asString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
export const asNumber = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The first source URL Hunter cites for an address, if it cites any. */
export function firstSourceUrl(v: unknown): string | undefined {
  if (!Array.isArray(v)) return undefined;
  for (const s of v) {
    const uri = asString(asRecord(s).uri);
    if (uri) return uri;
  }
  return undefined;
}

/**
 * Hunter's own error envelope, turned into a sentence.
 *
 * It answers 4xx with `{ errors: [{ id, code, details }] }`, and the id is the
 * fact that decides what to do: `wrong_auth` is a bad key, `usage_exceeded` is
 * an empty balance, `too_many_requests` is a rate limit. Reporting "the lookup
 * failed" for all three is the failure this repository keeps writing down.
 */
export function hunterErrorNote(status: number, body: unknown): string {
  const errs = asRecord(body).errors;
  const first = Array.isArray(errs) ? asRecord(errs[0]) : {};
  const id = asString(first.id);
  const details = asString(first.details);
  if (id === "wrong_auth" || status === 401) return `Hunter rejected the API key${details ? ` — ${details}` : ""}. Check HUNTER_API_KEY on this deployment.`;
  if (id === "usage_exceeded" || status === 402) return `Hunter has no credits left${details ? ` — ${details}` : ""}. Buy more, or this provider stays dark and the free sources still run.`;
  if (id === "too_many_requests" || status === 429) return "Hunter rate-limited this deployment. Nothing was charged; try again shortly.";
  if (details) return `Hunter refused the request: ${details}`;
  return `Hunter answered HTTP ${status} with no reason given.`;
}

export async function hunterGet(path: string, params: Record<string, string>, signal: AbortSignal): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; why: string }> {
  const key = hunterKey();
  if (!key) return { ok: false, why: "Not configured." };
  const q = new URLSearchParams({ ...params, api_key: key });
  let res: Response;
  try {
    res = await fetch(`https://api.hunter.io/v2/${path}?${q.toString()}`, { signal, headers: { Accept: "application/json" } });
  } catch (e) {
    // A network failure is not a refusal, and it is not billable either.
    return { ok: false, why: `Hunter could not be reached: ${e instanceof Error ? e.message : String(e)}. Nothing was charged.` };
  }
  let body: unknown = null;
  try { body = await res.json(); } catch { /* an empty or non-JSON body is handled below */ }
  if (!res.ok) return { ok: false, why: hunterErrorNote(res.status, body) };
  return { ok: true, data: asRecord(asRecord(body).data) };
}
