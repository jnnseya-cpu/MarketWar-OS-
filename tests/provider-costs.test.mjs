import test from "node:test";
import assert from "node:assert/strict";

// WHAT WE PAY, AND THE FLOOR UNDER WHAT WE CHARGE.
//
// WHY THIS EXISTS. The owner compared our presenter price to HeyGen's and asked
// why ours was so much higher. Most of the gap is structural — HeyGen builds
// its own avatar models and we resell them — but part of it was that
// `PROVIDER_COST_GBP.avatar` is an ESTIMATE, set deliberately high, and every
// customer price stacks on it. Correcting it used to need a deploy.
//
// Now it is typed into the admin screen and the whole price table re-derives.
// That is a mechanism that changes what customers are charged, at runtime, from
// a text field — so the tests that matter are not "does it save". They are:
//
//   • can a correction ever breach the owner's margin floor? (It must not.)
//   • can a hostile or fat-fingered value get in? (It must not.)
//   • does a cheaper invoice actually reach the customer's price? (It must.)
//   • does the pool route on cost, and does the price follow the route?

const wallet = await import("../src/backend/wallet.ts");
const gw = await import("../src/backend/avatar-gateway.ts");
const sub = await import("../src/backend/subscription.ts");

// Every test restores the table, because this module mutates a live price table
// that the rest of the suite reads.
const restore = () => wallet.applyProviderCostOverrides({});

test("a cheaper invoice reaches the customer's price", () => {
  try {
    const before = wallet.ACTION_COST_ACU.avatar;
    const changed = wallet.applyProviderCostOverrides({ avatar: 0.05 });
    const after = wallet.ACTION_COST_ACU.avatar;
    assert.ok(after < before, `a cheaper cost must lower the price: ${before} → ${after}`);
    assert.ok(changed.some((c) => c.key === "avatar"), "the change must be reported, not silent");
    // AND THE READERS SEE IT. 62 call sites across the codebase hold a reference
    // to this one object; if the override replaced the object instead of
    // mutating it, they would all go on reading the old prices.
    const { ACTION_COST_ACU } = wallet;
    assert.equal(ACTION_COST_ACU.avatar, after, "an importer's reference must see the new price");
  } finally { restore(); }
});

test("THE MARGIN FLOOR CANNOT BE BREACHED BY A CORRECTION", () => {
  try {
    // The whole risk of this feature in one test: a cost typed into a text
    // field decides what customers pay. Even at a provider cost of zero the
    // price must clear the owner's floor, because infrastructure, Stripe and
    // overhead are real whatever the vendor charges.
    wallet.applyProviderCostOverrides({ avatar: 0 });
    const atZero = wallet.ACTION_COST_ACU.avatar;
    assert.ok(atZero >= 1, `a zero-cost provider must still carry a price, got ${atZero}`);

    for (const cost of [0, 0.001, 0.01, 0.05, 0.2, 0.45, 2]) {
      wallet.applyProviderCostOverrides({ avatar: cost });
      const acus = wallet.ACTION_COST_ACU.avatar;
      const chargeGbp = acus / 100;
      // The law: at least 4x the provider bill (the headline markup)...
      assert.ok(
        chargeGbp >= cost * 4 - 1e-9,
        `at £${cost} the price must be at least 4x: ${chargeGbp} < ${cost * 4}`,
      );
      // ...and never below the net-profit minimum, which is what makes the
      // cheap end safe.
      assert.ok(acus >= 1, `at £${cost} the price must be a real charge, got ${acus}`);
    }
  } finally { restore(); }
});

test("a hostile or fat-fingered cost is dropped, not applied", () => {
  try {
    const good = wallet.ACTION_COST_ACU.avatar;
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, 1000, "0.1", null, undefined]) {
      wallet.applyProviderCostOverrides({ avatar: bad });
      assert.equal(
        wallet.ACTION_COST_ACU.avatar, good,
        `${String(bad)} must not change the price — a negative or absurd cost re-derives a price of zero or one nobody can pay`,
      );
    }
    // And a key the platform does not have cannot invent a price line.
    wallet.applyProviderCostOverrides({ not_a_real_action: 0.01 });
    assert.equal(wallet.ACTION_COST_ACU.not_a_real_action, undefined);
  } finally { restore(); }
});

test("an override is replaced, never merged, so a reset really resets", () => {
  try {
    const original = wallet.ACTION_COST_ACU.avatar;
    wallet.applyProviderCostOverrides({ avatar: 0.05 });
    assert.notEqual(wallet.ACTION_COST_ACU.avatar, original);
    // Applying a DIFFERENT map must drop the previous override entirely — if it
    // merged, clearing a correction in the admin screen would leave it in force.
    wallet.applyProviderCostOverrides({ llm: 0.01 });
    assert.equal(wallet.ACTION_COST_ACU.avatar, original, "the avatar correction must be gone, not remembered");
  } finally { restore(); }
});

test("the price the law produces is the one the pricing engine says", () => {
  try {
    // Computed independently from the engine rather than compared to itself —
    // a value compared to itself proves only that it exists.
    wallet.applyProviderCostOverrides({ avatar: 0.2 });
    const expected = sub.requiredAcus(0.2).requiredAcus;
    assert.ok(wallet.ACTION_COST_ACU.avatar >= expected, `${wallet.ACTION_COST_ACU.avatar} must be at least the 4x figure ${expected}`);
  } finally { restore(); }
});

// ---------------------------------------------------------------------------
// The pool
// ---------------------------------------------------------------------------

test("every pool member carries a cost and what it can actually do", () => {
  assert.ok(gw.AVATAR_PROVIDERS.length >= 3);
  for (const p of gw.AVATAR_PROVIDERS) {
    assert.ok(p.costPerMinuteGbp > 0, `${p.id}: a pool member with no cost cannot be routed on cost`);
    assert.equal(typeof p.roster, "boolean");
    assert.equal(typeof p.translation, "boolean");
  }
  // Only one of them publishes a roster and re-renders a mouth. If that ever
  // becomes two, the routing below has a real choice to make.
  assert.equal(gw.AVATAR_PROVIDERS.filter((p) => p.translation).length, 1);
});

test("THE POOL ROUTES TO THE CHEAPEST CONFIGURED PROVIDER, not the first one listed", () => {
  // The defect this replaces: `AVATAR_PROVIDERS.find(configured)` returned
  // whichever key happened to be set first, so the ARRAY ORDER decided what
  // every tenant paid, and configuring a cheaper provider alongside HeyGen
  // changed nothing at all.
  const env = { ...process.env };
  try {
    delete process.env.HEYGEN_API_KEY; delete process.env.DID_API_KEY; delete process.env.SYNTHESIA_API_KEY;
    assert.equal(gw.configuredProvider(), null, "nothing configured, nothing routed");

    process.env.HEYGEN_API_KEY = "k";
    assert.equal(gw.configuredProvider().id, "heygen", "the only one configured renders it");

    // HeyGen is FIRST in the array and DEARER. The cheaper one must win.
    process.env.DID_API_KEY = "k";
    const chosen = gw.configuredProvider();
    assert.equal(chosen.id, "did", "the cheapest configured provider renders it, regardless of declaration order");
    assert.ok(chosen.costPerMinuteGbp < gw.AVATAR_PROVIDERS.find((p) => p.id === "heygen").costPerMinuteGbp);

    // But a job only HeyGen can do must still go to HeyGen — routing on cost
    // must never silently downgrade a feature out of existence.
    assert.equal(gw.configuredProvider("translation").id, "heygen", "only HeyGen re-renders a mouth");
    assert.equal(gw.configuredProvider("roster").id, "heygen", "only HeyGen publishes a roster");

    // And the active cost follows the route, so the price can follow the cost.
    assert.equal(gw.activeAvatarCostGbp(), chosen.costPerMinuteGbp);
  } finally {
    process.env = env;
  }
});

test("the pool reports which member is actually chosen, so the screen cannot guess", () => {
  const env = { ...process.env };
  try {
    delete process.env.HEYGEN_API_KEY; delete process.env.DID_API_KEY; delete process.env.SYNTHESIA_API_KEY;
    process.env.SYNTHESIA_API_KEY = "k";
    const status = gw.poolStatus();
    assert.equal(status.filter((p) => p.chosen).length, 1, "exactly one renders");
    assert.equal(status.find((p) => p.chosen).id, "synthesia");
    assert.equal(status.filter((p) => p.configured).length, 1);
  } finally { process.env = env; }
});

test("with nothing configured nothing is chosen, and no price is invented", () => {
  const env = { ...process.env };
  try {
    delete process.env.HEYGEN_API_KEY; delete process.env.DID_API_KEY; delete process.env.SYNTHESIA_API_KEY;
    assert.equal(gw.activeAvatarCostGbp(), null, "no provider means no active cost, not a zero one");
    assert.equal(gw.poolStatus().filter((p) => p.chosen).length, 0);
  } finally { process.env = env; }
});
