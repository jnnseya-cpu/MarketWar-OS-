import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// A CREDENTIAL PASTED WHERE IT SHOULD NEVER GO.
//
// A live Meta Graph API access token was pasted into chat twice. Nothing in the
// platform was wrong — but nothing in the platform would have stopped the same
// paste reaching a provider either: `looksSecret` existed in `backend/audit-log.ts`
// and redacted the audit log, and that was the whole of it.
//
// What this covers:
//   • the detector is SHARED, so every surface can use it — it was backend-only
//   • it NAMES THE VENDOR and where the key belongs, not "provider key"
//   • `certain` shapes are REFUSED at the AI gateway, before anything is sent,
//     cached or stored; `likely` shapes are only redacted
//   • a git SHA is 40 hex characters and must NOT be refused
//   • no finding, message or event ever contains the value
//
// THE TOKENS HERE ARE FAKE, built from a vendor prefix plus filler. A test that
// needs a live key to prove a guard is a test that leaks one.
//
// MUTATION TESTED: 13 mutants, all killed. TWO SURVIVED FIRST, and together they
// are the lesson: a mutant that replaced `refuseIfSecret(...)` with `null` left
// every SOURCE assertion here passing, because the `throw` was still written and
// merely unreachable. Source text proves the text. The behavioural test at the
// bottom of this file — which calls the real gateway and demands the real
// refusal — is what closes it. (The second survivor was my own vacuous mutant:
// it edited a comment rather than the order it described.)

const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const filler = (n) => "AbCd1234".repeat(Math.ceil(n / 8)).slice(0, n);
const FAKE = {
  meta: `EAA${filler(70)}`,
  stripe: `sk_live_${filler(24)}`,
  whsec: `whsec_${filler(24)}`,
  anthropic: `sk-ant-${filler(40)}`,
  openai: `sk-proj-${filler(40)}`,
  google: `AIza${filler(35)}`,
  github: `ghp_${filler(36)}`,
  pat: `github_pat_${filler(40)}`,
  slack: `xoxb-${filler(24)}`,
  aws: "AKIA" + "QZ3K7TLMNB2XYRWP",
  awsDocExample: "AKIAIOSFODNN7EXAMPLE",
  pem: "-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----",
  dbUrl: "postgres://admin:hunter2@db.example.com:5432/app",
  jwt: `eyJ${filler(20)}.eyJ${filler(20)}.${filler(30)}`,
  bearer: `Bearer ${filler(32)}`,
  gitSha: "9722553ab1c2d3e4f5061728394a5b6c7d8e9f01",
  sha256: filler(0) + "a".repeat(64),
};

test("every vendor is named, because 'provider key' is not a remedy", async () => {
  const { firstSecret } = await import("../src/shared/secret-shapes.ts");
  const expect = [
    ["meta", "Meta (Facebook / Instagram)", "meta-access-token"],
    ["stripe", "Stripe", "stripe-secret-key"],
    ["whsec", "Stripe", "stripe-webhook-secret"],
    ["anthropic", "Anthropic", "anthropic-api-key"],
    ["openai", "OpenAI", "openai-api-key"],
    ["google", "Google", "google-api-key"],
    ["github", "GitHub", "github-token"],
    ["pat", "GitHub", "github-token"],
    ["slack", "Slack", "slack-token"],
    ["aws", "AWS", "aws-access-key-id"],
  ];
  for (const [key, provider, id] of expect) {
    const f = firstSecret(FAKE[key]);
    assert.ok(f, `${key} was not detected at all`);
    assert.equal(f.shape.provider, provider, key);
    assert.equal(f.shape.id, id, key);
    assert.equal(f.shape.confidence, "certain", `${key} must be certain enough to refuse on`);
  }
  // ORDER MATTERS: `sk-ant-…` also matches the OpenAI and the generic `sk-`
  // shapes, so the specific one has to be read first or Anthropic keys get
  // reported as somebody else's.
  assert.equal(firstSecret(FAKE.anthropic).shape.provider, "Anthropic");
});

test("a private key, a database URL and a signed token are all credentials", async () => {
  const { firstSecret } = await import("../src/shared/secret-shapes.ts");
  assert.equal(firstSecret(FAKE.pem).shape.id, "pem-private-key");
  assert.equal(firstSecret(FAKE.dbUrl).shape.id, "db-url-with-password");
  assert.equal(firstSecret(FAKE.jwt).shape.id, "jwt");
  assert.equal(firstSecret(FAKE.bearer).shape.id, "bearer-header");
  // A URL with the password in it is a credential however it is labelled — and
  // it is the shape people paste most readily, because it looks like an address.
  assert.match(firstSecret(FAKE.dbUrl).shape.rotateAt, /rotate the role's password/);
  // A JWT's payload is readable by anybody holding it, which is how a Meta token
  // once arrived inside one.
  assert.match(firstSecret(FAKE.jwt).shape.rotateAt, /NOT encrypted/);
});

test("a git SHA is NOT refused — the false positive that would break trust", async () => {
  const { firstSecret, refuseIfSecret, redactSecrets } = await import("../src/shared/secret-shapes.ts");
  // 40 hex characters is a credential shape AND every commit hash in existence.
  // Refusing on it would reject an agent prompt about a release note, and a
  // guard people route around is worse than no guard.
  assert.equal(firstSecret(FAKE.gitSha).shape.confidence, "likely");
  assert.equal(refuseIfSecret(FAKE.gitSha, "your prompt"), null);
  assert.equal(firstSecret(FAKE.sha256).shape.confidence, "likely");
  assert.equal(refuseIfSecret(FAKE.sha256, "your prompt"), null);
  // But a log redacts on it, because over-redacting a log costs one diagnostic
  // line and under-redacting it stores a live key.
  assert.match(redactSecrets(FAKE.gitSha), /\[redacted\]/);

  // And ordinary writing is left completely alone.
  for (const prose of [
    "Write me a plumbing advert for Manchester, £19 a month.",
    "Our offer is 20% off until Friday — call 0161 496 0000.",
    "The address is 14 Mill Street, M1 2AB.",
  ]) {
    assert.deepEqual(firstSecret(prose), null, prose);
    assert.equal(redactSecrets(prose), prose, "redaction must not touch prose");
  }
});

test("nothing ever hands back the value — not a finding, not a message", async () => {
  const { firstSecret, refuseIfSecret, findSecrets } = await import("../src/shared/secret-shapes.ts");
  const f = firstSecret(FAKE.meta);
  assert.equal(f.prefix.length, 6, "six characters identifies it without exposing it");
  assert.equal(typeof f.length, "number");
  assert.ok(!JSON.stringify(f).includes(FAKE.meta), "a serialised finding must not carry the token");
  assert.ok(!JSON.stringify(findSecrets(`a ${FAKE.meta} b ${FAKE.stripe}`)).includes(FAKE.stripe));

  const r = refuseIfSecret(FAKE.meta, "your prompt");
  assert.ok(!r.message.includes(FAKE.meta), "the refusal shown to the person must not repeat it");
  assert.ok(!r.detail.includes(FAKE.meta), "and nor must the security event's detail");
  // The message has to be actionable: vendor, where it belongs, where to rotate.
  assert.match(r.message, /Meta \(Facebook \/ Instagram\)/);
  assert.match(r.message, /META_CAPI_ACCESS_TOKEN/);
  assert.match(r.message, /System Users/);
  assert.match(r.message, /Nothing was sent/);
});

test("one finding per shape, so ten pastes of one key are one problem", async () => {
  const { findSecrets } = await import("../src/shared/secret-shapes.ts");
  const many = `${FAKE.meta} and again ${FAKE.meta} and ${FAKE.stripe}`;
  const found = findSecrets(many);
  assert.equal(found.length, 2, "two shapes, not three matches");
  assert.deepEqual(found.map((f) => f.shape.provider).sort(), ["Meta (Facebook / Instagram)", "Stripe"]);
});

test("redaction replaces every occurrence and names what was removed", async () => {
  const { redactSecrets } = await import("../src/shared/secret-shapes.ts");
  const out = redactSecrets(`key ${FAKE.google} and again ${FAKE.google}`);
  assert.ok(!out.includes(FAKE.google), "every occurrence, not just the first");
  assert.equal((out.match(/\[redacted\] \(Google\)/g) || []).length, 2);
  // Named, so a reader (or a model) knows something was taken out and what kind.
  assert.match(redactSecrets(FAKE.stripe), /\[redacted\] \(Stripe\)/);
});

test("the AI gateway refuses before anything is sent, cached or stored", async () => {
  // The gateway is the ONE door every AI call goes through, so the check belongs
  // there: 39 agents covered at once. And the stakes are higher than a log — a
  // key in a prompt is transmitted to a third party and written into the results
  // ledger and the generation cache, where no later redaction reaches it.
  const code = codeOf(readFileSync("src/backend/gateway.ts", "utf8"));
  assert.match(code, /import \{ refuseIfSecret, redactSecrets \} from "@\/shared\/secret-shapes"/);
  assert.match(code, /class CredentialInPromptError extends Error/);
  assert.match(code, /throw new CredentialInPromptError\(refusal\.message, refusal\.finding\.shape\.id\)/);
  assert.match(code, /kind: "credential_refused"/);

  // ORDER IS A SECURITY PROPERTY. The refusal must come before the cache lookup
  // and before the provider call, or a cache hit routes around it.
  const refusalAt = code.indexOf("refuseIfSecret");
  const cacheAt = code.indexOf("const hit = lookup(key)");
  const guardAt = code.indexOf("guardPrompt({");
  assert.ok(refusalAt > 0 && cacheAt > refusalAt, "the credential check must precede the cache lookup");
  assert.ok(guardAt > refusalAt, "and precede the instruction firewall, so nothing is built from a tainted prompt");

  // THIRD-PARTY TEXT IS SCRUBBED, NOT REFUSED: it is not the customer's paste,
  // so refusing would stop their agent over a stranger's mistake.
  assert.match(code, /text: redactSecrets\(u\.text \|\| ""\)/);
  assert.match(code, /untrusted: scrubbed \|\| \[\]/,
    "the scrubbed text must be what the firewall and the provider actually see");
});

test("the agent route reports it as a 400, not as an outage", async () => {
  const code = codeOf(readFileSync("src/app/api/agents/[agentId]/route.ts", "utf8"));
  assert.match(code, /err\.name === "CredentialInPromptError"/);
  assert.match(code, /credentialRefused: true \}, \{ status: 400 \}/,
    "502 reads as 'the platform broke'; this is the request being wrong and nothing having been sent");
});

test("a log redacts rather than refusing, and the direction is deliberate", async () => {
  const code = codeOf(readFileSync("src/app/api/client-error/route.ts", "utf8"));
  // A browser stack can carry a token out of a URL, and this is a store. But
  // losing the crash report is the worse failure — the one on the sign-up page
  // is exactly the one worth hearing about.
  assert.match(code, /const message = redactSecrets\(str\("message", 500\)\)/);
  assert.match(code, /stack: redactSecrets\(str\("stack", 4000\)\)/);
  assert.match(code, /route: redactSecrets\(str\("route", 200\)\)/);
});

test("the shapes live in ONE place, and the audit log reads them", async () => {
  // They were declared in `backend/audit-log.ts`, so a shared module could not
  // import them and the rule reached that log and nothing else.
  const audit = codeOf(readFileSync("src/backend/audit-log.ts", "utf8"));
  assert.match(audit, /from "@\/shared\/secret-shapes"/);
  assert.doesNotMatch(audit, /const SECRET_VALUE/, "the second copy must be gone, not merely unused");

  const { looksSecret, redactValue, REDACTED } = await import("../src/backend/audit-log.ts");
  // Behaviour preserved, and improved where it was vague.
  assert.equal(looksSecret(FAKE.stripe), "Stripe secret API key");
  assert.equal(looksSecret("spring-offer"), null);
  assert.match(redactValue("note", `token is ${FAKE.meta}`), /\[redacted\]/);
  assert.equal(redactValue("api_key", "not-actually-a-key"), REDACTED,
    "a field NAMED like a secret is redacted whatever is in it");
  assert.equal(redactValue("campaign", "spring-offer"), "spring-offer",
    "and ordinary values survive, or the log stops being readable");
});

test("every envVar the shapes name is a real catalogued variable", async () => {
  // A remedy that names a variable the platform does not read is a remedy that
  // sends somebody to set the wrong thing.
  const { SECRET_SHAPES } = await import("../src/shared/secret-shapes.ts");
  const { ENV_CATALOGUE } = await import("../src/shared/env-catalogue.ts");
  const known = new Set(ENV_CATALOGUE.map((e) => e.name));
  for (const s of SECRET_SHAPES) {
    if (!s.envVar) continue;
    assert.ok(known.has(s.envVar), `${s.id} names ${s.envVar}, which is not in ENV_CATALOGUE`);
  }
  // And every shape has somewhere to send the person.
  for (const s of SECRET_SHAPES) {
    assert.ok(s.rotateAt.length > 30, `${s.id} has no usable rotation instruction`);
    assert.ok(s.provider && s.what, `${s.id} must name a vendor and a kind`);
  }
});

test("the Meta shape is long enough not to fire on ordinary base64", async () => {
  const { findSecrets, SECRET_SHAPES } = await import("../src/shared/secret-shapes.ts");
  // THE FIRST VERSION USED {20,} AND MATCHED FONT DATA. `src/backend/font-data.ts`
  // is a base64 blob containing runs that start `EAA`, so a 20-character rule
  // would report the embedded typeface as a Meta credential. 60 keeps it clear
  // while staying far below the ~200 characters a real token runs to.
  const fontish = "AAEAAAATAQAABAAwRkZUTYXIkLUABlNMAAAAHEdERUbiP";
  assert.ok(!findSecrets(fontish).some((f) => f.shape.id === "meta-access-token"),
    "a base64 blob must not be reported as a Meta token");
  assert.ok(findSecrets(FAKE.meta).some((f) => f.shape.id === "meta-access-token"),
    "but a real-length Meta token still matches");
  const meta = SECRET_SHAPES.find((s) => s.id === "meta-access-token");
  assert.match(meta.re.source, /\{60,\}/);
  // The blob IS still an opaque run, which is `likely` — so a log redacts it and
  // nothing refuses on it. Over-redacting a log is the cheap mistake.
  assert.equal(findSecrets(fontish).every((f) => f.shape.confidence === "likely"), true);
});

test("documentation placeholders are detected but never refused", async () => {
  // Docs get pasted into agent fields constantly. Refusing "Bearer
  // YOUR_TOKEN_HERE" teaches people the guard is noise, and a guard people route
  // around protects nothing. Detected (so a log still redacts) — not refused.
  const { firstSecret, refuseIfSecret, looksLikePlaceholder } = await import("../src/shared/secret-shapes.ts");
  for (const fake of [
    "Bearer YOUR_TOKEN_HERE_REPLACE_THIS_VALUE",
    FAKE.awsDocExample,
    `sk_live_${"x".repeat(24)}`,
    "sk-ant-api03-REPLACE-WITH-YOUR-OWN-KEY-VALUE",
  ]) {
    assert.ok(firstSecret(fake), `${fake.slice(0, 20)} should still be DETECTED`);
    assert.equal(refuseIfSecret(fake, "your prompt"), null, `${fake.slice(0, 20)} must not be refused`);
  }
  assert.equal(looksLikePlaceholder(FAKE.meta), false, "a real-shaped token is not a placeholder");
  assert.ok(refuseIfSecret(FAKE.meta, "your prompt"), "and it is still refused");
});

test("the gateway REFUSES in fact, not only in source", async () => {
  // SOURCE ASSERTIONS ARE NOT ENOUGH, and mutation testing is what said so. A
  // mutant that replaced `refuseIfSecret(...)` with `null` left every text
  // assertion above passing — the `throw` was still written, merely unreachable.
  // So this calls the real function and demands the real refusal.
  //
  // No network and no provider key needed: the credential check runs before the
  // cache, before the firewall and long before any fetch, so the refusal happens
  // whatever else is unconfigured.
  const { gatewayComplete } = await import("../src/backend/gateway.ts");

  let thrown = null;
  try {
    await gatewayComplete({
      system: "You are a helpful assistant.",
      prompt: `Set up conversions with ${FAKE.meta}`,
      maxTokens: 32,
    });
  } catch (e) { thrown = e; }
  assert.ok(thrown, "a prompt carrying a credential must not succeed");
  assert.equal(thrown.name, "CredentialInPromptError", `threw ${thrown.name}: ${thrown.message.slice(0, 90)}`);
  assert.equal(thrown.shapeId, "meta-access-token");
  assert.match(thrown.message, /META_CAPI_ACCESS_TOKEN/);
  assert.ok(!thrown.message.includes(FAKE.meta), "and the refusal must not repeat the token");

  // THE SYSTEM INSTRUCTION TOO — a caller assembling it from a stored setting is
  // the likelier route in practice than a customer typing a key into a prompt.
  let fromSystem = null;
  try {
    await gatewayComplete({ system: `Use ${FAKE.stripe} for pricing.`, prompt: "Write a paragraph.", maxTokens: 32 });
  } catch (e) { fromSystem = e; }
  assert.equal(fromSystem?.name, "CredentialInPromptError");
  assert.equal(fromSystem.shapeId, "stripe-secret-key");

  // AND THE REFUSAL IS SPECIFIC. A clean prompt may fail for other reasons here
  // (no provider configured), but it must never fail as a credential — otherwise
  // this test would pass against a gateway that refuses everything.
  let clean = null;
  try {
    await gatewayComplete({
      system: "You are a helpful assistant.",
      prompt: `Summarise commit ${FAKE.gitSha} for a release note.`,
      maxTokens: 32,
    });
  } catch (e) { clean = e; }
  assert.notEqual(clean?.name, "CredentialInPromptError",
    "a commit SHA is not a credential and must not be refused as one");
});
