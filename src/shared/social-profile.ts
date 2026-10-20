// A FACEBOOK OR LINKEDIN PAGE IS A LEAD TO A WEBSITE, NOT A DEAD END.
//
// THE DEFECT THIS EXISTS TO FIX, and it cost the owner £70 of his own money.
// `enrich.ts` holds an AGGREGATOR list — directories and social networks whose
// pages are never a company's own site — and `findWebsite` refuses a `website`
// value that matches it. Correct, as far as it goes: facebook.com/acmeplumbing
// is not Acme Plumbing's website.
//
// But a list bought off LinkedIn or Facebook has social URLs in the website
// column, because that is what those platforms give you. So every row was
// DISCARDED, the enricher fell through to "needs live Google data — set
// SERPER_API_KEY", and a list the platform could have worked for nothing
// produced nothing at all.
//
// A company's Facebook page shows its website. Reading it off there costs no key
// and no credit, and the website it names is the thing the free crawl already
// knows how to turn into a published email.
//
// WHAT THIS FILE IS AND IS NOT. It is PURE: it takes HTML somebody else fetched
// and extracts candidates. The fetching, and the ownership gate that decides
// whether a candidate really belongs to the company, live in
// `backend/social-website.ts`. Splitting it that way is what makes the awkward
// half — Facebook's link shim, LinkedIn's redirector, a sign-in wall — testable
// without a network.
//
// AND IT NEVER GUESSES FROM THE HANDLE. `facebook.com/acmeplumbing` does not
// mean `acmeplumbing.co.uk` exists, and a guessed domain that resolves belongs
// to somebody. There is no inference here at all: a website is returned only
// when the page itself states one.

export type SocialNetwork = "facebook" | "linkedin" | "instagram" | "x" | "tiktok" | "youtube";

const NETWORK_HOSTS: { network: SocialNetwork; hosts: string[] }[] = [
  { network: "facebook", hosts: ["facebook.com", "fb.com", "fb.me", "m.facebook.com"] },
  { network: "linkedin", hosts: ["linkedin.com", "lnkd.in"] },
  { network: "instagram", hosts: ["instagram.com"] },
  { network: "x", hosts: ["twitter.com", "x.com"] },
  { network: "tiktok", hosts: ["tiktok.com"] },
  { network: "youtube", hosts: ["youtube.com", "youtu.be"] },
];

const hostOf = (url: string): string => {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
};

/** Which network this URL belongs to, or null when it is not a social profile. */
export function socialNetworkOf(url: string): SocialNetwork | null {
  const h = hostOf(url);
  if (!h) return null;
  for (const n of NETWORK_HOSTS) if (n.hosts.some((x) => h === x || h.endsWith(`.${x}`))) return n.network;
  return null;
}

export const isSocialProfileUrl = (url: string): boolean => socialNetworkOf(url) !== null;

/**
 * SIGNS THAT WE WERE NOT ALLOWED TO LOOK.
 *
 * WHY THIS IS A SEPARATE ANSWER FROM "no website found". Facebook and LinkedIn
 * serve a sign-in wall to a signed-out reader for a large share of pages. If a
 * wall were reported as "this page names no website", the customer would be told
 * their lead has no site — a statement about the company — when the truth is a
 * statement about us. One is a reason to drop a row; the other is a reason to
 * route the fetch differently, and they must never share a sentence.
 */
const WALL_SIGNS: { re: RegExp; sign: string }[] = [
  { re: /log in to continue|log in or sign up|you must log in to continue/i, sign: "a log-in-to-continue page" },
  { re: /sign in to see|join linkedin|sign up to see/i, sign: "a sign-in-to-see page" },
  { re: /authwall|\/uas\/login|checkpoint\/block/i, sign: "an auth wall" },
  { re: /this content isn.t available|content isn't available right now/i, sign: "a content-unavailable page" },
  { re: /enable javascript|you need to enable javascript/i, sign: "a page that renders only with JavaScript" },
];

export type WallVerdict = { walled: boolean; sign: string };

export function authWallSigns(html: string): WallVerdict {
  const body = String(html ?? "");
  // A SHORT BODY IS ITSELF A SIGN. A real page runs to tens of thousands of
  // characters; a wall is a few hundred. Checked first, because the sign
  // phrases are often inside the JavaScript a wall ships instead of content.
  if (body.trim().length > 0 && body.trim().length < 2_000) {
    return { walled: true, sign: `a ${body.trim().length}-character stub, which is a wall rather than a page` };
  }
  for (const { re, sign } of WALL_SIGNS) if (re.test(body)) return { walled: true, sign };
  return { walled: false, sign: "" };
}

/**
 * Facebook and LinkedIn do not publish an outbound link as a plain href — they
 * wrap it in their own click tracker. Unwrapping is not a trick; it is reading
 * the URL the page itself put in the query string.
 *
 *   l.facebook.com/l.php?u=https%3A%2F%2Facme.co.uk%2F&h=…
 *   linkedin.com/redir/redirect?url=https%3A%2F%2Facme.co.uk&urlhash=…
 */
export function unwrapRedirect(url: string): string {
  let current = String(url ?? "");
  // Bounded: a shim inside a shim is possible, an infinite chain is not.
  for (let hop = 0; hop < 3; hop++) {
    let parsed: URL;
    try { parsed = new URL(current); } catch { return current; }
    const h = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const isShim = /^(l|lm)\.facebook\.com$/.test(h) || (h === "linkedin.com" && /\/redir\//.test(parsed.pathname))
      || h === "away.vk.com" || /^t\.co$/.test(h) === false && parsed.searchParams.has("u") && /facebook/.test(h);
    const target = parsed.searchParams.get("u") || parsed.searchParams.get("url");
    if (!isShim || !target) return current;
    try { current = decodeURIComponent(target); } catch { return target; }
  }
  return current;
}

export type WebsiteCandidate = {
  url: string;
  /** Where on the page it was found. Printed, so a verdict can be checked. */
  from: "json-ld" | "link-shim" | "meta" | "href" | "text";
};

/**
 * Every website this social page NAMES, in the order they are worth trusting.
 *
 * ORDER IS EVIDENCE, not preference. A `sameAs` in the page's own structured
 * data is the company stating its site; a bare link in the body might be
 * anything the page happens to mention. The caller gates each one against the
 * company name and takes the first that holds, so the ordering decides which
 * evidence wins when a page names several.
 */
export function websiteCandidatesFrom(html: string): WebsiteCandidate[] {
  const body = String(html ?? "");
  const out: WebsiteCandidate[] = [];
  const seen = new Set<string>();
  const push = (raw: string, from: WebsiteCandidate["from"]) => {
    let url = unwrapRedirect(String(raw ?? "").trim().replace(/&amp;/g, "&"));
    if (!/^https?:\/\//i.test(url)) {
      if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(url)) url = `https://${url}`;
      else return;
    }
    let origin = "";
    try { const u = new URL(url); origin = u.origin; } catch { return; }
    // A social URL is never the answer here — that is where we started.
    if (isSocialProfileUrl(origin)) return;
    const key = origin.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ url: origin, from });
  };

  // 1. STRUCTURED DATA — the company describing itself.
  for (const block of body.match(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || []) {
    const json = block.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/i, "");
    try {
      const walk = (node: unknown): void => {
        if (!node) return;
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (typeof node !== "object") return;
        const o = node as Record<string, unknown>;
        for (const field of ["sameAs", "url"]) {
          const v = o[field];
          if (typeof v === "string") push(v, "json-ld");
          else if (Array.isArray(v)) v.forEach((x) => { if (typeof x === "string") push(x, "json-ld"); });
        }
        Object.values(o).forEach(walk);
      };
      walk(JSON.parse(json));
    } catch { /* a malformed block is not a website */ }
  }

  // 2. THE LINK SHIM — how both networks actually render an outbound link.
  for (const m of body.matchAll(/https?:\/\/(?:l|lm)\.facebook\.com\/l\.php\?[^"'\s<>]+/gi)) push(m[0], "link-shim");
  for (const m of body.matchAll(/https?:\/\/(?:www\.)?linkedin\.com\/redir\/redirect\?[^"'\s<>]+/gi)) push(m[0], "link-shim");

  // 3. META tags that some public views still carry.
  for (const tag of body.match(/<meta\b[^>]*>/gi) || []) {
    if (!/property\s*=\s*["']?(og:see_also|website)["']?/i.test(tag)) continue;
    const content = tag.match(/content\s*=\s*["']([^"']+)["']/i)?.[1];
    if (content) push(content, "meta");
  }

  // 4. PLAIN OUTBOUND HREFS, last because they are the weakest evidence.
  for (const tag of body.match(/<a\b[^>]*href\s*=\s*["'][^"']+["'][^>]*>/gi) || []) {
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (href && /^https?:\/\//i.test(href)) push(href, "href");
  }

  // 5. A BARE DOMAIN IN THE TEXT. Many pages write their site in the About
  //    blurb without linking it. Deliberately last and deliberately narrow: a
  //    real TLD, no path, and never an email's domain.
  const withoutTags = body.replace(/<[^>]+>/g, " ");
  for (const m of withoutTags.matchAll(/(?<![@\w.])((?:[a-z0-9][a-z0-9-]*\.)+(?:co\.uk|org\.uk|ac\.uk|com|net|org|uk|io|ie|shop|店))(?![\w.@])/gi)) {
    push(m[1], "text");
  }

  return out;
}
