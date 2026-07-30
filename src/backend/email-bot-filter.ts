// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Was that open or click a person, or a machine?
//
// This exists because a live account reported 1,129 sent, 98 opens and 79
// clicks. Click-to-open of 81% is not a marketing result — a genuinely good
// campaign runs 10–15%. Corporate mail security (Proofpoint, Mimecast,
// Barracuda, Microsoft Safe Links) fetches EVERY url in a message the moment it
// is delivered, to check where it goes. Each fetch hit the click endpoint and
// was counted as a human pressing a button.
//
// TWO RULES:
//
//   NOTHING IS DELETED. A machine fetch is still recorded — it is evidence the
//   message was delivered and scanned, which is useful. It is flagged and
//   excluded from the rates, never dropped, so the raw ledger stays complete
//   and the decision can be revisited.
//
//   A REAL OPEN IS NOT A BOT. Gmail proxies every image through
//   GoogleImageProxy, and Apple Mail fetches through its own privacy relay.
//   Those are real people opening real mail. Classifying them as machines would
//   swing the error the other way and under-report every Gmail reader on the
//   list — which is most of them.

export type AgentVerdict = { machine: boolean; reason: string };

// Security scanners and link checkers. Each of these fetches a URL to inspect
// it, not because a person asked for it.
const SCANNERS = [
  "proofpoint", "mimecast", "barracuda", "symantec", "forcepoint", "trendmicro",
  "messagelabs", "cloudmark", "ironport", "sophos", "fireeye", "zscaler",
  "safelinks", "urldefense", "linkprotect", "safebrowsing", "virustotal",
  "bitdefender", "kaspersky", "avast", "mcafee", "netskope", "paloalto",
];

// Generic automation. A person's mail client does not identify itself as curl.
const AUTOMATION = [
  "bot", "crawler", "spider", "scrapy", "curl", "wget", "python-requests",
  "python-urllib", "java/", "okhttp", "go-http-client", "axios", "node-fetch",
  "libwww", "httpclient", "headlesschrome", "phantomjs", "puppeteer",
  "playwright", "monitoring", "uptime", "pingdom", "statuscake", "site24x7",
];

// Link PREVIEW fetchers — a chat app or search engine unfurling the URL. Not a
// scanner, not a reader either.
const PREVIEWERS = ["bingpreview", "skypeuripreview", "slackbot", "whatsapp", "telegrambot", "discordbot", "facebookexternalhit", "twitterbot", "linkedinbot", "embedly", "quora link preview"];

// Legitimate privacy relays that fetch on behalf of a REAL person opening mail.
// Listed explicitly so a future edit cannot sweep them in with the scanners.
const HUMAN_PROXIES = ["googleimageproxy", "ggpht.com", "apple mail", "yahoomailproxy"];

const has = (haystack: string, needles: string[]) => needles.find((n) => haystack.includes(n));

/**
 * Classify one tracking hit.
 *
 * Header-based and deliberately conservative: a false "machine" verdict deletes
 * a real customer's engagement from the numbers, which is worse than leaving a
 * scanner in. When in doubt, it is a person.
 */
export function classifyAgent(
  userAgent: string | null | undefined,
  headers: { get(name: string): string | null } | null = null,
  opts: { method?: string } = {},
): AgentVerdict {
  const ua = (userAgent || "").toLowerCase().trim();

  // A browser never issues HEAD for an image it is about to display.
  if ((opts.method || "GET").toUpperCase() === "HEAD") {
    return { machine: true, reason: "HEAD request — a reader's client would fetch the whole thing" };
  }

  // Explicit prefetch/preview signalling, per the Fetch and Resource Hints specs.
  const purpose = `${headers?.get("purpose") || ""} ${headers?.get("x-purpose") || ""} ${headers?.get("x-moz") || ""} ${headers?.get("sec-purpose") || ""}`.toLowerCase();
  if (/prefetch|preview|prerender/.test(purpose)) {
    return { machine: true, reason: "the request declared itself a prefetch or preview" };
  }

  if (!ua) {
    // Mail clients and image proxies all send something. An empty agent is a
    // script that did not bother.
    return { machine: true, reason: "no user agent — every real mail client sends one" };
  }

  // Checked BEFORE the scanner list: Gmail's proxy contains no scanner token
  // today, but this ordering is the guarantee that a real reader is never
  // reclassified by a later edit to the lists above.
  const human = has(ua, HUMAN_PROXIES);
  if (human) return { machine: false, reason: `${human} — a privacy relay fetching for a real reader` };

  const scanner = has(ua, SCANNERS);
  if (scanner) return { machine: true, reason: `${scanner} — mail security scanning the link on delivery` };

  const preview = has(ua, PREVIEWERS);
  if (preview) return { machine: true, reason: `${preview} — a link preview, not a reader` };

  const auto = has(ua, AUTOMATION);
  if (auto) return { machine: true, reason: `${auto} — automated client` };

  return { machine: false, reason: "no automation signature" };
}

/**
 * Is this engagement pattern physically plausible?
 *
 * Click-to-open is the tell. A strong human campaign runs 10–15%; anything past
 * ~40% means most "clicks" were never accompanied by a person reading anything,
 * which is what a scanner fetching every URL looks like.
 *
 * Reported as a suspicion with the arithmetic shown, never as a silent
 * correction — the customer should be able to check the reasoning.
 */
export function engagementSanity(input: { sent: number; opens: number; clicks: number; machineOpens?: number; machineClicks?: number }): {
  clickToOpenPct: number;
  plausible: boolean;
  note: string;
} {
  const { sent, opens, clicks } = input;
  const cto = opens > 0 ? Math.round((clicks / opens) * 1000) / 10 : 0;
  const flagged = (input.machineOpens || 0) + (input.machineClicks || 0);

  if (!sent || !opens) {
    return { clickToOpenPct: 0, plausible: true, note: "Not enough recorded activity to judge yet." };
  }

  const plausible = cto <= 40;
  return {
    clickToOpenPct: cto,
    plausible,
    note: plausible
      ? `${cto}% of openers clicked, which is within the range real people produce.`
      : [
          `${clicks} clicks from ${opens} openers is ${cto}% — a strong human campaign runs 10–15%.`,
          "Almost every 'click' arriving without a person reading the mail is what corporate security scanning looks like: Proofpoint, Mimecast, Barracuda and Microsoft Safe Links fetch every link in a message the moment it is delivered.",
          flagged
            ? `${flagged} hit(s) have already been identified as machines and excluded above.`
            : "None of these were identifiable from their user agent, so they are still counted — treat the click number as an upper bound, not a result.",
        ].join(" "),
  };
}
