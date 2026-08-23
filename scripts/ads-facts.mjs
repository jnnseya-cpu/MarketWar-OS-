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
