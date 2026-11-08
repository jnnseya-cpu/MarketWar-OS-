// THE DELIVERED SURFACE OF THIS PLATFORM, MEASURED FROM THE CODE.
//
// WHY THIS FILE EXISTS. The owner's standing directive is the additive-only
// law: *"Everything added builds on top of, or upgrades, what already exists.
// NEVER delete and NEVER downgrade previously delivered content, features,
// specifications, or source material."* Until now that was a rule in CLAUDE.md
// with nothing enforcing it — and a rule nothing enforces is a rule that holds
// until somebody is in a hurry.
//
// THE FAILURE IT PREVENTS IS SILENT BY NATURE. A deleted route, an agent
// dropped from the registry, a cost line removed, a plan's price edited, a
// driver quietly unhooked from `package.json` — none of those break a build and
// none of them fail a test that does not already name the thing that vanished.
// They are noticed months later, by somebody wondering where a feature went.
//
// So this module MEASURES, and nothing else. `check-lock.mjs` compares what it
// measures against the committed snapshot and fails on a removal;
// `update-lock.mjs` rewrites the snapshot, deliberately, when an addition is
// real. Keeping the measurement in one place is what stops the gate and the
// snapshot drifting apart — they are the same function.
//
// WHAT IS LOCKED, AND WHY EACH ONE:
//
//   • NAMES, not just counts. A count stays the same when one thing is swapped
//     for another; a name does not.
//   • The commercial constants. The markup floor, the net-profit floor, the
//     allowance rate, the plan prices, the top-up tiers. These are the owner's
//     pricing law expressed as numbers, and a one-character edit to any of them
//     changes what every customer pays with nothing to say so.
//   • The Stripe event lists, because §178 is the proof that getting them
//     wrong moves money twice.
//   • The data register, because an entry disappearing from it is a store that
//     silently leaves the GDPR export.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);

/** Every file under a directory, recursively, as repo-relative paths. */
function walk(dir, filter) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const here = stack.pop();
    let entries;
    try { entries = readdirSync(here, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = join(here, e.name);
      if (e.isDirectory()) { stack.push(full); continue; }
      const rel = relative(ROOT, full).split("\\").join("/");
      if (!filter || filter(rel)) out.push(rel);
    }
  }
  return out.sort();
}

const sorted = (xs) => [...new Set(xs)].sort();

export async function inventory() {
  // ---- the shipped surface, from the tree -------------------------------
  const routes = walk(join(ROOT, "src/app"), (p) => p.endsWith("/route.ts"))
    .map((p) => p.replace(/^src\/app/, "").replace(/\/route\.ts$/, "") || "/");
  const pages = walk(join(ROOT, "src/app"), (p) => p.endsWith("/page.tsx"))
    .map((p) => p.replace(/^src\/app/, "").replace(/\/page\.tsx$/, "") || "/");
  const backend = walk(join(ROOT, "src/backend"), (p) => p.endsWith(".ts")).map((p) => p.replace("src/backend/", ""));
  const shared = walk(join(ROOT, "src/shared"), (p) => p.endsWith(".ts")).map((p) => p.replace("src/shared/", ""));
  const frontend = walk(join(ROOT, "src/frontend"), (p) => p.endsWith(".ts") || p.endsWith(".tsx")).map((p) => p.replace("src/frontend/", ""));
  const components = walk(join(ROOT, "src/components"), (p) => p.endsWith(".tsx")).map((p) => p.replace("src/components/", ""));
  const tests = walk(join(ROOT, "tests"), (p) => p.endsWith(".test.mjs")).map((p) => p.replace("tests/", ""));
  const docs = walk(join(ROOT, "docs"), (p) => p.endsWith(".md")).map((p) => p.replace("docs/", ""));

  // ---- the npm surface ---------------------------------------------------
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const scripts = sorted(Object.keys(pkg.scripts || {}));
  const dependencies = sorted(Object.keys(pkg.dependencies || {}));

  // ---- the registries and the laws, from the modules themselves ----------
  //
  // Imported rather than parsed, so a value computed from other values (every
  // ACU price is) is locked at the figure the platform will actually charge.
  const wallet = await import("../src/backend/wallet.ts");
  const sub = await import("../src/backend/subscription.ts");
  const ue = await import("../src/backend/unit-economics.ts");
  const stripe = await import("../src/backend/stripe-billing.ts");
  const caps = await import("../src/backend/capabilities.ts");
  const privacy = await import("../src/backend/privacy.ts");
  const gw = await import("../src/backend/avatar-gateway.ts");
  const integrations = await import("../src/backend/integrations.ts");
  const costs = await import("../src/backend/provider-costs.ts");
  const envCat = await import("../src/shared/env-catalogue.ts");
  const agents = await import("../src/shared/agents.ts");
  const engines = await import("../src/shared/engine-registry.ts");
  const story = await import("../src/shared/storyboard.ts");
  const effort = await import("../src/shared/ai-effort.ts");

  const acuPrices = {};
  for (const k of Object.keys(wallet.ACTION_COST_ACU).sort()) acuPrices[k] = wallet.ACTION_COST_ACU[k];
  const providerCosts = {};
  for (const [k, v] of Object.entries(wallet.providerCostGbp()).sort(([a], [b]) => a.localeCompare(b))) providerCosts[k] = v;

  const plans = {};
  for (const p of sub.PLANS) plans[p.id] = { monthlyGbp: p.monthlyGbp, brands: String(p.brands), users: String(p.users), storageGb: p.storageGb };

  return {
    // THE LAWS AS NUMBERS. A one-character edit here changes what every
    // customer pays, so each one is named and locked.
    laws: {
      STANDARD_MARKUP: sub.STANDARD_MARKUP,
      MARKUP_FLOOR: sub.MARKUP_FLOOR,
      ACU_PER_GBP: sub.ACU_PER_GBP,
      ACU_ALLOCATION_RATE: sub.ACU_ALLOCATION_RATE,
      NET_PROFIT_FLOOR: ue.NET_PROFIT_FLOOR,
      MIN_TOPUP_GBP: sub.MIN_TOPUP_GBP,
      FLEXIBLE_TOPUPS_GBP: sub.FLEXIBLE_TOPUPS_GBP,
      MAX_COST_GBP: costs.MAX_COST_GBP,
      WORDS_PER_MINUTE: story.WORDS_PER_MINUTE,
      BEAT_SECONDS: story.BEAT_SECONDS,
      MAX_COMMERCIAL_SECONDS: story.MAX_COMMERCIAL_SECONDS,
      EFFORT_LAW_PRESENT: typeof effort.EFFORT_LAW === "string" && effort.EFFORT_LAW.length > 40,
    },
    prices: { acu: acuPrices, providerCostGbp: providerCosts, plans },
    stripe: {
      subscribeEvents: [...stripe.SUBSCRIBE_EVENTS].sort(),
      handledEvents: [...stripe.HANDLED_EVENTS].sort(),
    },
    registries: {
      capabilities: caps.CAPABILITIES.map((c) => c.id).sort(),
      dataStores: privacy.DATA_STORES.map((s) => s.collection).sort(),
      envCatalogue: envCat.ENV_CATALOGUE.map((e) => e.name).sort(),
      agents: sorted(Object.keys(agents.AGENTS)),
      engines: engines.ENGINE_REGISTRY.map((e) => e.id).sort(),
      integrations: integrations.INTEGRATIONS.map((i) => i.provider).sort(),
      avatarProviders: gw.AVATAR_PROVIDERS
        .map((p) => `${p.id}:roster=${p.roster},translation=${p.translation},scenes=${p.scenes}`)
        .sort(),
    },
    surface: { routes, pages, backend, shared, frontend, components, tests, docs },
    npm: { scripts, dependencies },
  };
}

/**
 * Every leaf of the inventory as `path → value`, so two inventories can be
 * compared without knowing their shape.
 *
 * An array of strings becomes one entry per element (`a.b[name]`), because the
 * question this gate answers is "has this NAMED thing gone", not "is the list
 * the same length".
 */
export function flatten(node, prefix = "", out = new Map()) {
  if (Array.isArray(node)) {
    for (const v of node) out.set(`${prefix}[${String(v)}]`, String(v));
    return out;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
    return out;
  }
  out.set(prefix, node);
  return out;
}

/** Count the leaves, for a one-line summary. */
export function leafCount(inv) {
  return flatten(inv).size;
}

export const LOCK_PATH = join(ROOT, "docs/DELIVERED.lock.json");
export { ROOT };
