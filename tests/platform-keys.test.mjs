import test from "node:test";
import assert from "node:assert/strict";

// PLATFORM KEYS SET IN THE ADMIN ACCOUNT — the invariants.
//
// This feature takes a value typed into a browser and writes it into a running
// Node server's `process.env`. That is a powerful mechanism and a short walk
// from a dangerous one: `NODE_OPTIONS` in `process.env` is arbitrary code
// execution, `PATH` is worse, and both are "just another environment variable"
// to a loop that copies a document into the process.
//
// So the tests that matter are not "does saving work". They are:
//   • an un-catalogued name is NEVER applied, whatever the store says;
//   • a value is never returned, by any function here;
//   • a key that cannot work if stored is REFUSED with the reason, instead of
//     being accepted and silently doing nothing;
//   • clearing a stored key puts the environment's own value back, rather than
//     leaving the process with nothing.
//
// The last one is the subtle one and it is why `ORIGINAL_ENV` exists: hydration
// overwrites `process.env`, so without a captured copy of what the host
// actually gave us, "remove this key" would take the platform dark until the
// next cold start while the admin screen reported the environment value as
// still present.

const keys = await import("../src/backend/platform-keys.ts");
const { ENV_CATALOGUE } = await import("../src/shared/env-catalogue.ts");

test("only catalogued names can be set, because hydration writes into the process", () => {
  for (const hostile of ["NODE_OPTIONS", "PATH", "LD_PRELOAD", "AWS_SECRET_ACCESS_KEY", "", "__proto__"]) {
    const v = keys.storeable(hostile);
    assert.equal(v.ok, false, `${hostile || "(empty)"} must not be storeable`);
    assert.ok(v.why.length > 40, `${hostile}: the refusal must explain, not label`);
  }
});

test("the Firebase credentials are refused, and the reason is the bootstrap paradox", () => {
  // The store lives in Firestore. A key needed to REACH Firestore cannot be
  // read out of it, and an admin screen that accepted it would leave the owner
  // staring at a dark platform that said "saved".
  for (const name of ["FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "FIREBASE_SERVICE_ACCOUNT", "FIREBASE_PROJECT_ID"]) {
    const v = keys.storeable(name);
    assert.equal(v.ok, false, `${name} must be refused`);
    assert.match(v.why, /Firestore|Firebase Admin|hosting environment/i);
  }
});

test("the encryption master key is refused — it is what decrypts the store", () => {
  const v = keys.storeable("FIELD_ENCRYPTION_MASTER_KEY");
  assert.equal(v.ok, false);
  assert.match(v.why, /decrypts this store/i);
});

test("a NEXT_PUBLIC_ value is refused, because it was compiled into the bundle at build time", () => {
  const publics = ENV_CATALOGUE.filter((e) => e.name.startsWith("NEXT_PUBLIC_"));
  assert.ok(publics.length > 5, "the catalogue should hold several public variables");
  for (const e of publics) {
    const v = keys.storeable(e.name);
    assert.equal(v.ok, false, `${e.name} must be refused`);
    assert.match(v.why, /BUILT|build/i, `${e.name}: the reason must be the build-time inlining`);
  }
});

test("every settable key is catalogued, storeable and not one of the three exceptions", () => {
  const settable = keys.settableKeys();
  assert.ok(settable.length > 80, `expected most of the catalogue to be settable, got ${settable.length}`);
  for (const e of settable) {
    assert.ok(ENV_CATALOGUE.some((c) => c.name === e.name), `${e.name} must come from the catalogue`);
    assert.ok(!e.name.startsWith("NEXT_PUBLIC_"), `${e.name} is a build-time value`);
    assert.equal(keys.NOT_STOREABLE[e.name], undefined, `${e.name} is in the refusal list`);
  }
  // The ones that matter most to the owner must be settable, or the feature
  // does not answer the request it was built for.
  for (const must of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "SERPER_API_KEY", "LEADMAGIC_API_KEY", "CRON_SECRET"]) {
    assert.ok(settable.some((e) => e.name === must), `${must} must be settable from the admin account`);
  }
});

test("the inventory reports status and never a value", async () => {
  const inv = await keys.keyInventory();
  assert.equal(inv.entries.length, ENV_CATALOGUE.length, "every catalogued key must appear");
  assert.equal(inv.setInAdmin + inv.setInEnvironment + inv.unset, inv.total, "every key has exactly one source");
  const text = JSON.stringify(inv);
  // No shape of a known credential may appear anywhere in the response, and no
  // field may be called anything value-like.
  // THE PATTERN NEEDS A PAYLOAD, NOT JUST A PREFIX. The first version of this
  // assertion matched the bare string `whsec_` and failed — on the catalogue's
  // own help text, "Signing secret (whsec_…)", which is documentation telling
  // the owner what to look for in Stripe. A credential is a prefix PLUS enough
  // characters to be one, and a test that cannot tell those apart fails for a
  // reason unrelated to what it tests.
  assert.ok(
    !/sk-ant-[A-Za-z0-9_-]{16,}|sk_(?:live|test)_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{30,}/.test(text),
    "the inventory must never carry a credential",
  );
  assert.ok(!/"value"|"secretValue"|"plaintext"/.test(text), "the inventory must have no value field at all");
  for (const e of inv.entries) {
    assert.ok(e.unlocks.length > 10, `${e.name}: must say what it unlocks`);
    assert.ok(["admin", "environment", "unset"].includes(e.source));
  }
});

test("a fingerprint identifies a key without revealing it", () => {
  const a = keys.fingerprintOf("sk-ant-example-aaaaaaaaaaaaaaaaaaaaaa");
  const b = keys.fingerprintOf("sk-ant-example-bbbbbbbbbbbbbbbbbbbbbb");
  assert.notEqual(a, b, "two keys must be distinguishable");
  assert.equal(a, keys.fingerprintOf("sk-ant-example-aaaaaaaaaaaaaaaaaaaaaa"), "the same key must fingerprint the same");
  assert.match(a, /^[0-9a-f]{12}$/, "a short hex digest, not the value");
  assert.ok(!a.includes("example"), "no part of the value may survive into the fingerprint");
});

test("without a database, setting a key is refused rather than appearing to work", async () => {
  // This suite runs with no Firebase credentials, which is exactly the state a
  // zero-config deployment is in. The honest answer is a refusal that names
  // what to do, not a success the platform cannot honour.
  const r = await keys.setPlatformKey("ANTHROPIC_API_KEY", "sk-ant-test-value-0000000000000000", "uid:test");
  assert.equal(r.ok, false);
  assert.equal(r.status, 503);
  assert.match(r.error, /database|Firebase Admin/i);
  assert.ok(!("value" in r), "a refusal must not echo the value back");
});

test("a key pasted into the wrong field is caught by its shape", async () => {
  // The likeliest owner mistake, and the one that otherwise surfaces an hour
  // later as a confusing provider error.
  const r = await keys.setPlatformKey("OPENAI_API_KEY", "sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaa", "uid:test");
  assert.equal(r.ok, false);
  assert.match(r.error, /Anthropic/i, "the refusal must name the vendor it recognised");
  assert.match(r.error, /ANTHROPIC_API_KEY/, "and the variable it belongs in");
  assert.match(r.error, /Nothing was saved/i);
});

test("a value with a NUL byte is refused", async () => {
  const r = await keys.setPlatformKey("SERPER_API_KEY", "abc\u0000def", "uid:test");
  assert.equal(r.ok, false);
  assert.match(r.error, /NUL/);
});

test("an empty value is refused with the remedy, not stored as a blank key", async () => {
  const r = await keys.setPlatformKey("SERPER_API_KEY", "   ", "uid:test");
  assert.equal(r.ok, false);
  assert.match(r.error, /delete it instead/i);
});

test("fromEnvironment reads the environment as it ARRIVED, not as hydration left it", () => {
  // The guard that makes "remove this key" reversible. If this read live
  // `process.env`, then after hydration overwrote a variable it would report
  // the stored value as the environment's own, and clearing the key would
  // restore the thing it was meant to remove.
  const name = "SERPER_API_KEY";
  const before = keys.fromEnvironment(name);
  process.env[name] = "injected-after-load";
  try {
    assert.equal(keys.fromEnvironment(name), before, "a value set after module load must not look like the host's own");
  } finally {
    delete process.env[name];
  }
});

test("hydration applies nothing when there is no store to read", async () => {
  const r = await keys.hydratePlatformKeys();
  assert.deepEqual(r.applied, [], "no database, nothing to apply");
  assert.deepEqual(r.refused, []);
  assert.ok(r.readAt.length > 10);
  assert.equal(keys.hydratedNames().length, 0, "and nothing is reported as loaded");
});

test("ensurePlatformKeys never throws, whatever the store does", async () => {
  // Its callers are the AI gateway and the sending path. A key store hiccup
  // must never be the reason a customer's action fails.
  await keys.ensurePlatformKeys();
  await keys.ensurePlatformKeys();
});

// ---------------------------------------------------------------------------
// The allowlist, driven directly — this is the part that could hurt somebody.
// ---------------------------------------------------------------------------

test("a hostile store cannot inject an environment variable into the server", () => {
  // THE ATTACK THIS STOPS. Hydration assigns into `process.env` — the running
  // process's own configuration. Anybody who could write arbitrary NAMES into
  // the key document would be setting arbitrary environment variables on a live
  // Node server, and `NODE_OPTIONS` alone makes that remote code execution.
  //
  // So the plan is driven with a document full of exactly those names. None of
  // them may reach `apply`, whatever the document says.
  const plain = (v) => v; // the cipher is the caller's job, not the allowlist's
  const hostile = {
    NODE_OPTIONS: { value: "--require /tmp/evil.js" },
    PATH: { value: "/tmp/evil:/usr/bin" },
    LD_PRELOAD: { value: "/tmp/evil.so" },
    NODE_TLS_REJECT_UNAUTHORIZED: { value: "0" },
    HTTPS_PROXY: { value: "http://attacker.example" },
    FIELD_ENCRYPTION_MASTER_KEY: { value: "an-attacker-chosen-key-aaaaaaaaaaaa" },
    FIREBASE_PRIVATE_KEY: { value: "-----BEGIN PRIVATE KEY-----" },
    NEXT_PUBLIC_FIREBASE_API_KEY: { value: "AIzaSyExample" },
    ANTHROPIC_API_KEY: { value: "sk-ant-legitimate-value-0000000000" },
  };
  const plan = keys.hydrationPlan(hostile, plain);

  assert.deepEqual(
    plan.apply.map((a) => a.name), ["ANTHROPIC_API_KEY"],
    "only the one catalogued, storeable key may be applied",
  );
  for (const name of ["NODE_OPTIONS", "PATH", "LD_PRELOAD", "NODE_TLS_REJECT_UNAUTHORIZED", "HTTPS_PROXY", "FIELD_ENCRYPTION_MASTER_KEY", "FIREBASE_PRIVATE_KEY", "NEXT_PUBLIC_FIREBASE_API_KEY"]) {
    assert.ok(plan.refused.includes(name), `${name} must be refused by name`);
    assert.ok(!plan.apply.some((a) => a.name === name), `${name} must never be applied`);
  }
});

test("a value that will not decrypt is refused, not applied as ciphertext", () => {
  const plan = keys.hydrationPlan(
    { ANTHROPIC_API_KEY: { value: "not-really-ciphertext" } },
    () => { throw new Error("bad ciphertext"); },
  );
  assert.deepEqual(plan.apply, [], "a key that cannot be decrypted must not be applied");
  assert.deepEqual(plan.refused, ["ANTHROPIC_API_KEY"]);
});

test("a blank or malformed record is refused rather than clearing a working key", () => {
  const plan = keys.hydrationPlan(
    { ANTHROPIC_API_KEY: { value: "" }, OPENAI_API_KEY: {}, GEMINI_API_KEY: { value: "x" } },
    () => "",
  );
  assert.deepEqual(plan.apply, [], "an empty decrypted value must not overwrite anything");
  assert.equal(plan.refused.length, 3);
});

test("an override of the hosting environment is reported, never silent", () => {
  // The split brain this feature creates has to be visible, because two sources
  // of truth that disagree without saying so is how an afternoon disappears.
  const name = "SERPER_API_KEY";
  const wasSet = keys.fromEnvironment(name);
  const plan = keys.hydrationPlan({ [name]: { value: "stored-value" } }, (v) => v);
  assert.equal(plan.apply.length, 1);
  assert.equal(
    plan.overriding.includes(name), wasSet,
    wasSet ? "a stored key over an environment value must be reported as overriding"
           : "with nothing in the environment there is nothing to override",
  );
});

// ---------------------------------------------------------------------------
// The route's gate — the hole a driver found, held shut by a test.
// ---------------------------------------------------------------------------

test("the admin keys route refuses an unidentified caller in EVERY mode, not only production", async () => {
  // THE DEFECT THIS LOCKS DOWN. `requireAuthEnforced` refuses an unidentified
  // caller only when NODE_ENV is production — below that `requireAuth` passes
  // everybody through and returns BEFORE looking at the scope, exactly as its
  // own doc comment warns. So `{ scope: "platform_admin" }` was not a check at
  // all here, and GET answered an anonymous request with the whole inventory:
  // every credential the platform reads, which ones are set, and a fingerprint
  // for each. Found by driving the route, not by reading it.
  const { NextRequest } = await import("next/server");
  const route = await import("../src/app/api/admin/keys/route.ts");
  const refusal = (status) => status === 403 || status === 503;

  const get = await route.GET(new NextRequest("https://mw.test/api/admin/keys"));
  assert.ok(refusal(get.status), `GET must refuse an unidentified caller, got ${get.status}`);
  const getBody = await get.json();
  assert.equal(getBody.entries, undefined, "the inventory must never be served to an unidentified caller");
  assert.match(getBody.error, /Firebase Admin|identified/i, "the refusal must say why and what to do");

  const post = await route.POST(new NextRequest("https://mw.test/api/admin/keys", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "ANTHROPIC_API_KEY", value: "sk-ant-should-never-be-stored-0000" }),
  }));
  assert.ok(refusal(post.status), `POST must refuse an unidentified caller, got ${post.status}`);
  const postText = await post.text();
  assert.ok(!postText.includes("sk-ant-should-never-be-stored"), "a refusal must never echo the value");

  const del = await route.DELETE(new NextRequest("https://mw.test/api/admin/keys?name=ANTHROPIC_API_KEY", { method: "DELETE" }));
  assert.ok(refusal(del.status), `DELETE must refuse an unidentified caller, got ${del.status}`);
});
