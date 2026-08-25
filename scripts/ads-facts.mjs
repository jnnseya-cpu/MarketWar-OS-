// Facts for the ads bundle, READ OUT OF THE CODEBASE.
//
// An advert is the one document in this repo where a stale number is not an
// embarrassment but a liability: Meta's review checks claims, the ASA acts on
// them, and a price in an ad that does not match the price on the page is a
// rejected ad and a refund request. So nothing quotable is typed here.
//
//   prices        ← src/backend/subscription.ts (via gtm-facts.mjs)
//   tool counts   ← src/shared/included-tools.ts
//   free findings ← src/app/api/audit/route.ts
//
// Every parse throws rather than falling back to a remembered value.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PLANS } from "./gtm-facts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const read = (...p) => readFileSync(join(here, "..", ...p), "utf8");

// ---------------------------------------------------------------- prices

const plan = (id) => {
  const p = PLANS.find((x) => x.id === id);
  if (!p) throw new Error(`ads-facts: no "${id}" plan in subscription.ts — the ad copy names it, so fix the parser or the copy, not this line`);
  return p;
};

export const FREE = plan("free");
export const STARTER = plan("starter");
export const GROWTH = plan("growth");

// ---------------------------------------------------------------- tools

const tools = read("src", "shared", "included-tools.ts");
const keylessTrue = (tools.match(/keyless:\s*true/g) || []).length;
const keylessFalse = (tools.match(/keyless:\s*false/g) || []).length;
if (keylessTrue + keylessFalse < 10) {
  throw new Error(`ads-facts: parsed only ${keylessTrue + keylessFalse} tools from included-tools.ts — the shape changed, fix the parser rather than the advert`);
}

export const TOOL_TOTAL = keylessTrue + keylessFalse;
export const TOOL_KEYLESS = keylessTrue;

// ---------------------------------------------------------------- free audit

const auditRoute = read("src", "app", "api", "audit", "route.ts");
const ff = auditRoute.match(/const FREE_FINDINGS\s*=\s*([0-9]+)/);
if (!ff) throw new Error("ads-facts: could not read FREE_FINDINGS from src/app/api/audit/route.ts — the ad copy promises a specific number of free findings");
export const FREE_FINDINGS = Number(ff[1]);

const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
export const FREE_FINDINGS_WORD = words[FREE_FINDINGS] ?? String(FREE_FINDINGS);

// The audit must stay public for every advert in this bundle to be truthful.
// If somebody puts it behind a login, this build fails and the ads get pulled
// before Meta or a customer finds out instead.
if (!/crawlSite/.test(auditRoute)) {
  throw new Error("ads-facts: /api/audit no longer calls crawlSite — the adverts promise a real crawl of a real page");
}

export const ROUTES = {
  audit: "/audit",
  plans: "/choose-plan",
};

// The adverts link to these. A 404 in an advert is paid traffic thrown away, so
// the pages are confirmed to exist at build time rather than trusted.
for (const [name, route] of Object.entries(ROUTES)) {
  try {
    read("src", "app", route.replace(/^\//, ""), "page.tsx");
  } catch {
    throw new Error(`ads-facts: the adverts link to ${route} but src/app${route}/page.tsx does not exist`);
  }
}

// ---------------------------------------------------------------- pitch facts
//
// Added for the pitch-creatives bundle (scripts/pitch-content.mjs). Same rule as
// everything above: parsed, never typed. Two numbers I had quoted from memory
// were wrong before this existed — "19 agents" (it is 39) and "15 seconds for
// £2.81" (that is the EIGHT-second price; 15 seconds is £5.25). A creative
// carrying either would have been a claim the product does not honour.

const agentsSrc = read("src", "shared", "agents.ts");
// Each agent is a keyed entry in the AGENTS record: `  someId: {`.
// Keys are quoted kebab-case: `  "business-diagnosis": {`. Counting `id:` would
// be wrong — nested definitions carry one too.
const agentKeys = agentsSrc.slice(agentsSrc.indexOf("export const AGENTS")).match(/^\s{2}"[a-z0-9-]+":\s*\{/gm) || [];
if (agentKeys.length < 20) {
  throw new Error(`ads-facts: parsed only ${agentKeys.length} agents from agents.ts — the shape changed, fix the parser rather than the creative`);
}
export const AGENT_COUNT = agentKeys.length;

// Video pricing — IMPORTED, NOT RECOMPUTED.
//
// The first version of this parsed the per-second cost and the markup and did
// the arithmetic here. It produced 192 ACUs for an 8-second render; the real
// function returns 281, because `videoRenderAcus` also applies a storage floor
// (`minimumAcusFor`) that the recomputation knew nothing about. A creative
// quoting £1.92 for something the platform charges £2.81 for is a rejected ad
// and a refund request — which is the exact failure this whole file exists to
// prevent, arriving through the door marked "convenience".
//
// So the real function is imported. That is why `ads:doc` runs under tsx.
const { videoRenderAcus, DEFAULT_RENDER_SECONDS } = await import("../src/backend/video-gateway.ts");

export const VIDEO_DEFAULT_SECONDS = DEFAULT_RENDER_SECONDS;
export const VIDEO_PRICES = [8, 12, VIDEO_DEFAULT_SECONDS].map((s) => {
  const acus = videoRenderAcus(s);
  if (!Number.isFinite(acus) || acus <= 0) throw new Error(`ads-facts: videoRenderAcus(${s}) returned ${acus}`);
  return { seconds: s, acus, gbp: (acus / 100).toFixed(2) };
});
export const VIDEO_CHEAPEST = VIDEO_PRICES[0];
export const VIDEO_DEFAULT_PRICE = VIDEO_PRICES.find((p) => p.seconds === VIDEO_DEFAULT_SECONDS);

// Creator programme — the rate, and the fact there is no follower gate on cash.
const creatorSrc = read("src", "shared", "creator-program.ts");
const s2eCap = creatorSrc.match(/SHARE2EARN_RATE_CAP\s*=\s*([0-9.]+)/);
const minWd = creatorSrc.match(/MIN_WITHDRAWAL_GBP\s*=\s*([0-9]+)/);
if (!s2eCap || !minWd) {
  throw new Error("ads-facts: could not read SHARE2EARN_RATE_CAP or MIN_WITHDRAWAL_GBP — a creative states both");
}
export const SHARE2EARN_PCT = `${Number(s2eCap[1]) * 100}%`;
export const MIN_WITHDRAWAL_GBP = Number(minWd[1]);

// The creative says "no follower gate". This is what makes that true, and it
// fails the build the day somebody puts the gate back.
if (!/return "main";/.test(creatorSrc.slice(creatorSrc.indexOf("export function programmeFor")))) {
  throw new Error('ads-facts: programmeFor no longer returns "main" unconditionally — a creative promises cash with no follower gate');
}
