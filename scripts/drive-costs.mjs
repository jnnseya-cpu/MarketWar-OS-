// npm run drive:costs
//
// WHAT A PRESENTER MINUTE COSTS, AND WHAT WOULD MOVE IT.
//
// THE QUESTION THIS ANSWERS, in the owner's words: *"HeyGen using the same AI
// provider as us but they are very very cheap compared to the price you are
// telling me."*
//
// Half the answer is structural and no code can change it: HeyGen BUILDS its
// avatar models and we resell them, so we pay their retail API and they pay
// GPU-seconds. A reseller cannot undercut the manufacturer.
//
// The other half is ours, and this driver measures it. Every provider cost in
// this platform is an ESTIMATE, set deliberately high so the margin floor can
// never be breached silently — and a high estimate is a high price. So this
// prints the price at the estimate, the price at a real invoice rate, and the
// price when a cheaper provider is configured, all computed by the live pricing
// law rather than by arithmetic in a comment.
//
// It also proves the two mechanisms behave: a correction cannot breach the
// floor, and the admin route refuses an unidentified caller.

import fs from "node:fs";

const say = (m) => fs.writeSync(1, m + "\n");
let proven = 0, broken = 0;
const check = (label, ok, detail) => {
  (ok ? proven++ : broken++);
  say(`  ${ok ? "PROVEN " : "BROKEN "}  ${label}${detail ? ` — ${detail}` : ""}`);
};

process.env.NODE_ENV = "test";

const { NextRequest } = await import("next/server");
const route = await import("../src/app/api/admin/costs/route.ts");
const wallet = await import("../src/backend/wallet.ts");
const gw = await import("../src/backend/avatar-gateway.ts");
const costs = await import("../src/backend/provider-costs.ts");

const gbp = (acu) => `£${(acu / 100).toFixed(2)}`;

say("");
say("What a presenter minute costs, and what would move it.");
say("");

// --- 1. The gate -----------------------------------------------------------
const get = await route.GET(new NextRequest("https://mw.test/api/admin/costs"));
const getBody = await get.json();
check(
  "an unidentified caller cannot read the platform's cost base",
  (get.status === 403 || get.status === 503) && !getBody.lines,
  `status ${get.status}`,
);
const post = await route.POST(new NextRequest("https://mw.test/api/admin/costs", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ key: "avatar", costGbp: 0.01 }),
}));
check("and cannot change what customers are charged", post.status === 403 || post.status === 503, `status ${post.status}`);

// --- 2. The inventory ------------------------------------------------------
const inv = await costs.costInventory();
const avatarLine = inv.lines.find((l) => l.key === "avatar");
check("every cost line says what unit it is per", inv.lines.every((l) => l.unit && l.unit.length > 5), `${inv.lines.length} lines`);
check("and whether the number is an invoice or a guess", inv.lines.every((l) => typeof l.corrected === "boolean"), inv.note.slice(0, 60));
check("the presenter line is there with its markup", Boolean(avatarLine) && avatarLine.markup >= 4, `${avatarLine?.markup}x markup`);

// --- 3. THE NUMBER THE QUESTION WAS ABOUT ----------------------------------
say("");
say("  A PRESENTER MINUTE, AT DIFFERENT TRUTHS ABOUT WHAT WE PAY:");
say("");
say("    what we pay   what the customer pays   markup");
const rows = [];
for (const cost of [0.45, 0.30, 0.18, 0.12, 0.05]) {
  wallet.applyProviderCostOverrides({ avatar: cost });
  const acu = wallet.ACTION_COST_ACU.avatar;
  rows.push({ cost, acu });
  const markup = (acu / 100 / cost).toFixed(1);
  const label = cost === 0.45 ? "  ← today's ESTIMATE" : "";
  say(`    £${cost.toFixed(2)}/min      ${String(acu).padStart(4)} ACU = ${gbp(acu).padEnd(6)}   ${markup}x${label}`);
}
wallet.applyProviderCostOverrides({});
say("");

check(
  "a cheaper invoice really does reach the customer's price",
  rows[0].acu > rows[rows.length - 1].acu,
  `${gbp(rows[0].acu)}/min at the estimate → ${gbp(rows[rows.length - 1].acu)}/min at £0.05`,
);
check(
  "and the floor holds all the way down — no cost produces a free action",
  rows.every((r) => r.acu >= 1),
  `cheapest price is ${gbp(rows[rows.length - 1].acu)}`,
);

// --- 4. The pool, which is the other lever ---------------------------------
const env = { ...process.env };
try {
  delete process.env.HEYGEN_API_KEY; delete process.env.DID_API_KEY; delete process.env.SYNTHESIA_API_KEY;

  process.env.HEYGEN_API_KEY = "k";
  const heygenOnly = gw.configuredProvider();
  wallet.applyProviderCostOverrides({ avatar: heygenOnly.costPerMinuteGbp });
  const heygenPrice = wallet.ACTION_COST_ACU.avatar;

  process.env.DID_API_KEY = "k";
  const routed = gw.configuredProvider();
  wallet.applyProviderCostOverrides({ avatar: routed.costPerMinuteGbp });
  const routedPrice = wallet.ACTION_COST_ACU.avatar;

  say("  ADDING A SECOND SUPPLIER TO THE POOL:");
  say("");
  say(`    HeyGen alone        £${heygenOnly.costPerMinuteGbp.toFixed(2)}/min cost  →  ${gbp(heygenPrice)}/min to the customer`);
  say(`    + D-ID configured   £${routed.costPerMinuteGbp.toFixed(2)}/min cost  →  ${gbp(routedPrice)}/min to the customer`);
  say("");

  check(
    "configuring a cheaper supplier lowers the CUSTOMER's price, not just our margin",
    routedPrice < heygenPrice,
    `${gbp(heygenPrice)} → ${gbp(routedPrice)} per minute`,
  );
  check(
    "the cheapest configured supplier is the one that renders",
    routed.id === "did",
    `${routed.label} renders, though HeyGen is listed first`,
  );
  check(
    "but the two jobs only HeyGen can do still go to HeyGen",
    gw.configuredProvider("translation").id === "heygen" && gw.configuredProvider("roster").id === "heygen",
    "routing on cost never silently removes a feature",
  );
} finally {
  process.env = env;
  wallet.applyProviderCostOverrides({});
}

say("");
say(`drive:costs — ${proven} proven, ${broken} broken.`);
say("");
say("WHAT THIS DOES NOT CHANGE: HeyGen builds its own avatar models and we buy");
say("them, so on presenter video alone we are their reseller and cannot undercut");
say("them. The levers that are ours are the two measured above — correct the cost");
say("from a real invoice, and put a cheaper supplier in the pool. Every rate used");
say("here is still an ESTIMATE until an invoice replaces it.");
process.exit(broken ? 1 : 0);
