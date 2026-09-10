// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// INDEXNOW — telling search engines a page changed, instead of waiting to be asked.
//
// WHAT IT IS. One HTTP POST to a shared endpoint notifies Bing, Yandex, Seznam and
// Naver at once that a URL is new or changed. It does not make a page rank; it
// removes the delay between publishing and being crawled, which on a new domain
// with no crawl history is the difference between hours and weeks.
//
// GOOGLE IS NOT A PARTICIPANT and this file will not pretend otherwise. Anything
// claiming IndexNow makes you visible in Google is selling something.
//
// THE KEY IS OWNERSHIP PROOF, NOT A SECRET. The protocol asks you to publish the
// key as a text file on the same host, so the endpoint can confirm whoever
// submitted the URL controls the site. It is therefore public by design — served
// at a route in this app — and there is no point treating it as a credential.
// What it must be is STABLE: a key that changes on every deploy is a key the
// endpoint cannot verify.
//
// AND SUBMISSION IS NOT SUCCESS. The endpoint answers 200 for "accepted for
// processing", 403 for a key it could not verify, 422 for a URL that does not
// belong to the host. Reporting "submitted" for a 403 would be this platform's
// oldest defect — a success message for something that did not happen — so every
// caller gets the status and the meaning of it.

import { siteOrigin } from "@/shared/site";

/** The shared endpoint. One POST reaches every participating engine. */
const ENDPOINT = "https://api.indexnow.org/indexnow";

/** Where this app serves the ownership-proof file. */
export const KEY_PATH = "/indexnow-key.txt";

/** The key, or "" when none is configured. Public by design — see the note above. */
export const indexNowKey = (): string => (process.env.INDEXNOW_KEY || "").trim();

/**
 * A key must be 8–128 hexadecimal-ish characters. Checked because a key the
 * endpoint rejects produces a 403 that reads like a server fault, and the cause
 * is usually a value pasted with quotes or a newline.
 */
export const keyLooksValid = (k: string): boolean => /^[A-Za-z0-9-]{8,128}$/.test(k);

export type SubmitResult = {
  ok: boolean;
  /** How many URLs were sent. Zero when nothing was eligible. */
  submitted: number;
  status?: number;
  note: string;
};

/**
 * Only URLs on this deployment's own host may be submitted.
 *
 * The endpoint rejects the whole batch if one URL belongs elsewhere, so a single
 * stray link would silently cost every other URL in the request. Filtering here
 * makes that impossible rather than merely unlikely.
 */
export function ownUrlsOnly(urls: string[], origin = siteOrigin()): string[] {
  let host = "";
  try { host = new URL(origin).host.toLowerCase(); } catch { return []; }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls || []) {
    let u: URL;
    try { u = new URL(String(raw), origin); } catch { continue; }
    if (u.protocol !== "https:" && u.protocol !== "http:") continue;
    if (u.host.toLowerCase() !== host) continue;
    const s = u.toString();
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * Submit URLs. `fetchImpl` is injectable so the contract can be tested without
 * the network — the live call cannot be made from this container, and saying so
 * is better than a test that pretends.
 */
export async function submitUrls(
  urls: string[],
  deps: { fetchImpl?: typeof fetch; origin?: string } = {},
): Promise<SubmitResult> {
  const origin = deps.origin || siteOrigin();
  const key = indexNowKey();

  if (!key) {
    return { ok: false, submitted: 0, note: `No INDEXNOW_KEY is set, so nothing is being announced to search engines. Generate any 8-128 character key, set it, and this deployment serves it at ${KEY_PATH} as the ownership proof the protocol asks for.` };
  }
  if (!keyLooksValid(key)) {
    return { ok: false, submitted: 0, note: "INDEXNOW_KEY is not a valid key — it must be 8-128 letters, digits or hyphens. A value pasted with quotes or a trailing newline produces a 403 that reads like a server fault." };
  }

  const list = ownUrlsOnly(urls, origin);
  if (!list.length) {
    return { ok: true, submitted: 0, note: "Nothing to announce: no URL on this host was supplied." };
  }

  let host = "";
  try { host = new URL(origin).host; } catch { /* checked by ownUrlsOnly */ }

  const doFetch = deps.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key,
        keyLocation: `${origin.replace(/\/$/, "")}${KEY_PATH}`,
        // The protocol caps a batch at 10,000.
        urlList: list.slice(0, 10_000),
      }),
    });
  } catch (e) {
    return { ok: false, submitted: 0, note: `The IndexNow endpoint could not be reached: ${e instanceof Error ? e.message : String(e)}. Nothing was announced; the pages are unaffected and the next publish will try again.` };
  }

  // EVERY STATUS SAYS SOMETHING DIFFERENT, and reporting them all as "submitted"
  // is the failure this codebase keeps producing.
  const status = res.status;
  if (status === 200 || status === 202) {
    return { ok: true, submitted: list.length, status, note: `${list.length} URL(s) announced to the IndexNow engines (Bing, Yandex, Seznam, Naver). Accepted for crawling — which is not the same as indexed, and neither is a ranking.` };
  }
  if (status === 403) {
    return { ok: false, submitted: 0, status, note: `The engines refused the key (403). They fetch ${origin}${KEY_PATH} to prove this site is yours — check that address serves the key and nothing else.` };
  }
  if (status === 422) {
    return { ok: false, submitted: 0, status, note: "The engines rejected the URLs (422): they do not belong to the host that submitted them, or the key does not match the one published on it." };
  }
  if (status === 429) {
    return { ok: false, submitted: 0, status, note: "Rate-limited by the IndexNow endpoint (429). Announce less often — a page does not need announcing twice." };
  }
  return { ok: false, submitted: 0, status, note: `The IndexNow endpoint answered ${status}. Nothing was announced.` };
}
