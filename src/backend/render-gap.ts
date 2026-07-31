// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// What did we actually see, and were we allowed to see it?
//
// Every crawl in this platform fetches raw HTML. That is the right thing to
// fetch — it is what AI answer engines read — but it means two failure modes
// where the OS can state something false about a customer's own website:
//
//   THE PAGE IS RENDERED BY JAVASCRIPT. A React or Vue app returns a mount
//   point and a bundle. The title, the copy, the headings and often the JSON-LD
//   arrive when the browser runs the script. Reading that HTML and reporting
//   "no H1, 40 words, thin content" is not a finding, it is a false statement
//   about a page that may be perfectly good — and worse, it invites the SEO
//   auto-deploy to write a title onto a page that already has one.
//
//   THE REQUEST WAS BLOCKED. A Cloudflare challenge answers 403 with a full
//   HTML page. Parse it as if it were the customer's site and you get a
//   confident, entirely fictional audit of an interstitial.
//
// This module names both, so the rest of the OS can say "we could not see it"
// instead of "it is not there". Those are different sentences and only one of
// them is true.
//
// ON THE THING THIS DELIBERATELY DOES NOT DO: the commercial answer to being
// blocked is a proxy network that solves CAPTCHAs and imitates human traffic.
// For a customer's OWN site that is not needed — they can allowlist us, which
// is why `action` below tells them exactly how. For anyone else's site it is
// evasion of a control the owner deliberately put up, and SiteRaid's own
// ingestion gate already says competitor URLs are public-analysis only. So the
// answer here is to report the block honestly, not to defeat it.

/** How much of the page is script, and is there any prose left once you remove it? */
export type RenderGap = {
  /** True when the HTML cannot tell us what the page says. */
  jsShell: boolean;
  /** The framework we recognised, or "" — a label, never the deciding factor. */
  framework: string;
  markers: string[];
  /** Visible words in the RAW HTML — what a non-rendering crawler gets. */
  words: number;
  scriptBytes: number;
  htmlBytes: number;
  /** 0–1. Script bytes as a share of the document. */
  scriptShare: number;
  note: string;
};

/** Below this, there is not enough prose in the HTML to judge the page by. */
const THIN_WORDS = 120;
/** A page whose bytes are mostly script is a delivery mechanism, not a document. */
const SCRIPT_SHARE = 0.5;
/** With no framework marker at all, we want the HTML to be genuinely empty before claiming a shell. */
const EMPTY_WORDS = 40;

// Mount points and hydration payloads. Presence alone proves nothing — a
// server-rendered Next.js page carries __NEXT_DATA__ *and* all its content —
// so these only ever add a label and a little confidence.
const MARKERS: { needle: RegExp; framework: string; label: string }[] = [
  { needle: /__NEXT_DATA__/, framework: "Next.js", label: "__NEXT_DATA__" },
  { needle: /window\.__NUXT__/, framework: "Nuxt", label: "__NUXT__" },
  { needle: /window\.__remixContext/, framework: "Remix", label: "__remixContext" },
  { needle: /data-reactroot/, framework: "React", label: "data-reactroot" },
  { needle: /\bng-version\s*=/, framework: "Angular", label: "ng-version" },
  { needle: /<app-root[\s>]/, framework: "Angular", label: "<app-root>" },
  { needle: /data-server-rendered\s*=/, framework: "Vue", label: "data-server-rendered" },
  { needle: /<div[^>]+id\s*=\s*["'](?:root|app|__next|q-app)["']/i, framework: "", label: "empty mount element" },
  { needle: /window\.__INITIAL_STATE__/, framework: "", label: "__INITIAL_STATE__" },
];

const scriptBytesOf = (html: string) =>
  (html.match(/<script[\s\S]*?<\/script>/gi) || []).reduce((n, s) => n + s.length, 0);

const visibleWords = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;

/**
 * Can this HTML be judged, or only the bundle that will replace it?
 *
 * Deliberately conservative in one direction: a false "shell" verdict SILENCES
 * real findings on a genuinely thin page, which is the more damaging error. So
 * a page is only called a shell when there is almost no prose AND the bytes are
 * mostly script AND either a framework mount point is present or the HTML is
 * close to empty.
 */
export function detectRenderGap(html: string): RenderGap {
  const doc = html || "";
  const htmlBytes = doc.length;
  const scriptBytes = scriptBytesOf(doc);
  const words = visibleWords(doc);
  const scriptShare = htmlBytes > 0 ? scriptBytes / htmlBytes : 0;

  const hits = MARKERS.filter((m) => m.needle.test(doc));
  const markers = [...new Set(hits.map((m) => m.label))];
  const framework = hits.find((m) => m.framework)?.framework || "";

  const thin = words < THIN_WORDS;
  const scriptHeavy = scriptShare >= SCRIPT_SHARE;
  const jsShell = thin && scriptHeavy && (markers.length > 0 || words < EMPTY_WORDS);

  const what = framework ? `a ${framework} app` : "a JavaScript app";
  return {
    jsShell, framework, markers, words, scriptBytes, htmlBytes,
    scriptShare: Math.round(scriptShare * 100) / 100,
    note: jsShell
      ? [
          `This page is delivered as ${what}: the HTML carries ${words} word(s) and ${Math.round(scriptShare * 100)}% of it is script.`,
          "Google runs JavaScript, so it will see the finished page on a later pass — the checks below that depend on page content are marked unknown rather than failed, because we genuinely cannot read them from this response.",
          "What CANNOT run your JavaScript: social link unfurlers, non-rendering crawlers, and the AI assistants your visibility check asks. Whatever is missing from this HTML is missing from their view of you too — which makes this the single most valuable thing on the page to fix, by rendering the title, copy and JSON-LD on the server.",
        ].join(" ")
      : "",
  };
}

// ---------------------------------------------------------------------------
// Blocked, and by what
// ---------------------------------------------------------------------------

export type BlockKind = "none" | "unreachable" | "rate-limited" | "captcha" | "bot-protection" | "forbidden" | "server-error";

export type BlockVerdict = {
  blocked: boolean;
  kind: BlockKind;
  /** The protection product we recognised, or "" — never guessed from the status alone. */
  vendor: string;
  status: number;
  /** What happened, in the customer's words. */
  message: string;
  /** What the OWNER of the site can do about it. Empty when there is nothing honest to suggest. */
  action: string;
};

const VENDORS: { name: string; server?: RegExp; header?: string; body?: RegExp }[] = [
  { name: "Cloudflare", server: /cloudflare/i, header: "cf-ray", body: /cf-browser-verification|__cf_chl|cf_chl_opt|Attention Required!\s*\|\s*Cloudflare|Just a moment\.\.\./i },
  { name: "Akamai", server: /akamai/i, body: /Reference #\d+\.\w+|akamai/i },
  { name: "Imperva / Incapsula", header: "x-iinfo", body: /_Incapsula_Resource|incapsula/i },
  { name: "Sucuri", server: /sucuri/i, body: /sucuri|cloudproxy/i },
  { name: "AWS WAF", body: /awswaf|aws-waf-token/i },
  { name: "PerimeterX / HUMAN", body: /perimeterx|_pxhd|px-captcha/i },
  { name: "DataDome", header: "x-datadome", body: /datadome/i },
];

const CAPTCHA = /recaptcha|hcaptcha|g-recaptcha|turnstile|captcha-delivery|are you a robot|verify you are human/i;

/**
 * Why did that request not come back with the page?
 *
 * A 403 with a Cloudflare challenge body is not "the site is down" and it is
 * not a page to audit — it is a door with a lock on it, and the customer who
 * owns the door can unlock it. Naming the product is the difference between an
 * error the customer can act on and one they can only feel bad about.
 */
export function classifyBlock(
  status: number,
  html: string,
  headers: { get(name: string): string | null } | null = null,
): BlockVerdict {
  const body = (html || "").slice(0, 20_000);
  const server = headers?.get("server") || "";

  let vendor = "";
  for (const v of VENDORS) {
    const byServer = v.server && v.server.test(server);
    const byHeader = v.header && headers?.get(v.header);
    // The body pattern is only trusted on a response that is ALREADY a failure —
    // a marketing page that mentions Cloudflare is not a Cloudflare block.
    const byBody = v.body && status >= 400 && v.body.test(body);
    if (byServer || byHeader || byBody) { vendor = v.name; break; }
  }

  const allowlist = vendor
    ? `You own this site, so the fix is to let us through rather than to sneak past: in ${vendor}, add a rule that skips bot protection for the user agent "MarketWarBot/1.0". We do not solve CAPTCHAs or disguise our traffic — a check the owner put up should be removed by the owner.`
    : `If this is your site, allowlist the user agent "MarketWarBot/1.0" in whatever sits in front of it — a WAF, a bot-protection rule, or a rate limit.`;

  if (status === 0) {
    return { blocked: true, kind: "unreachable", vendor, status, message: "Nothing came back — the request timed out, the host refused the connection, or the address does not resolve.", action: "Check the address, then that the site answers over HTTPS from outside your own network." };
  }
  if (status === 429) {
    return { blocked: true, kind: "rate-limited", vendor, status, message: `Rate limited (HTTP 429)${vendor ? ` by ${vendor}` : ""} — we asked too often, or the host counts our shared address alongside everyone else's.`, action: `Wait a few minutes and run it again. ${allowlist}` };
  }
  if (CAPTCHA.test(body) && status >= 400) {
    return { blocked: true, kind: "captcha", vendor, status, message: `The response was a CAPTCHA challenge${vendor ? ` from ${vendor}` : ""}, not your page. Everything an audit could say about it would be about the challenge screen.`, action: allowlist };
  }
  if ((status === 403 || status === 503) && vendor) {
    return { blocked: true, kind: "bot-protection", vendor, status, message: `${vendor} bot protection answered HTTP ${status} instead of your page.`, action: allowlist };
  }
  if (status === 401 || status === 403) {
    return { blocked: true, kind: "forbidden", vendor, status, message: `The host refused the request (HTTP ${status}). Something in front of your site is turning away automated requests.`, action: allowlist };
  }
  if (status >= 500) {
    return { blocked: true, kind: "server-error", vendor, status, message: `The site answered HTTP ${status} — a server error, not a block. There is nothing to audit in that response.`, action: "Try again shortly; if it persists it is worth telling whoever hosts the site." };
  }
  if (status >= 400) {
    return { blocked: true, kind: "forbidden", vendor, status, message: `The page answered HTTP ${status}, so there is no content to audit.`, action: status === 404 ? "Check the address — this one does not exist." : allowlist };
  }
  return { blocked: false, kind: "none", vendor, status, message: "", action: "" };
}
