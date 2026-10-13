// npm run drive:secrets
//
// A CREDENTIAL PASTED INTO A FIELD, DRIVEN ALL THE WAY TO THE WIRE.
//
// WHY IT IS DRIVEN AND NOT ONLY UNIT-TESTED. The claim is "the key never reaches
// a provider", and the only way to check that claim is to stand a provider up,
// send the paste, and look at what arrived. A unit test on the detector proves
// the detector; it does not prove the gateway consults it before the fetch, nor
// that a cache hit cannot route around it, nor that nothing was written to the
// ledger on the way.
//
// WHAT IS REAL. The real gateway, the real instruction firewall, the real
// detector, a real HTTP server standing in for Anthropic, and `fetch`
// intercepted only to rewrite the host — so the request that arrives is
// byte-for-byte what the provider would have received.
//
// THE TOKENS BELOW ARE NOT REAL AND NEVER WERE. Each is assembled from a vendor
// prefix and a run of filler so it matches the shape without being anybody's
// credential. A driver that needs a live key to prove a guard is a driver that
// leaks one.

import fs from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const say = (m) => fs.writeSync(1, m + "\n");
let proven = 0, broken = 0;
const check = (label, ok, detail) => {
  (ok ? proven++ : broken++);
  say(`  ${ok ? "PROVEN " : "BROKEN "}  ${label}${detail ? ` — ${detail}` : ""}`);
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const R = (p) => join(root, p);

// ---------------------------------------------------------------------------
// FAKE CREDENTIALS, built from prefixes. Shapes only.
// ---------------------------------------------------------------------------
const filler = (n) => "AbCd1234".repeat(Math.ceil(n / 8)).slice(0, n);
const FAKE = {
  meta: `EAA${filler(70)}`,
  stripe: `sk_live_${filler(24)}`,
  anthropic: `sk-ant-${filler(40)}`,
  google: `AIza${filler(35)}`,
  github: `ghp_${filler(36)}`,
  pem: "-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----",
  dbUrl: "postgres://admin:hunter2@db.example.com:5432/app",
  // A git SHA, which is 40 hex and is NOT a credential. The guard must not
  // refuse this: it is the false positive that would make people route around it.
  gitSha: "9722553ab1c2d3e4f5061728394a5b6c7d8e9f01",
};

// ---------------------------------------------------------------------------
// A stand-in provider, so "nothing was sent" is observed rather than asserted.
// ---------------------------------------------------------------------------
const received = [];
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    received.push({ url: req.url, body });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      content: [{ type: "text", text: "ok" }],
      usage: { input_tokens: 10, output_tokens: 5 },
      model: "stand-in",
    }));
  });
});
const port = await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));

process.env.ANTHROPIC_API_KEY = "sk-ant-stand-in-not-a-real-credential-0000";
process.env.AI_GATEWAY_ORDER = "anthropic";

// Only the HOST is rewritten. Everything the gateway builds — headers, body,
// system prompt — is untouched, which is the whole point of the interception.
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input?.url ?? String(input);
  if (/api\.anthropic\.com/.test(url)) {
    return realFetch(url.replace(/^https:\/\/api\.anthropic\.com/, `http://127.0.0.1:${port}`), init);
  }
  return realFetch(input, init);
};

const secrets = await import(R("src/shared/secret-shapes.ts"));
const gateway = await import(R("src/backend/gateway.ts"));
const audit = await import(R("src/backend/audit-log.ts"));
const sentinel = await import(R("src/backend/sentinel.ts"));

say(`\nStand-in provider on 127.0.0.1:${port}\n`);

try {
  // -------------------------------------------------------------------------
  say("1. THE DETECTOR NAMES THE VENDOR, AND NEVER RETURNS THE VALUE");
  // -------------------------------------------------------------------------
  for (const [name, expected] of [
    ["meta", "Meta (Facebook / Instagram)"],
    ["stripe", "Stripe"],
    ["anthropic", "Anthropic"],
    ["google", "Google"],
    ["github", "GitHub"],
  ]) {
    const f = secrets.firstSecret(FAKE[name]);
    check(`${name} → "${expected}"`, f?.shape.provider === expected, f?.shape.provider || "(not detected)");
  }
  check("a PEM private key is recognised", secrets.firstSecret(FAKE.pem)?.shape.id === "pem-private-key");
  check("a database URL with a password is recognised",
    secrets.firstSecret(FAKE.dbUrl)?.shape.id === "db-url-with-password");

  // THE VALUE NEVER COMES BACK. A detector that returns what it found has moved
  // the problem, and its own error messages become the next leak.
  const f = secrets.firstSecret(FAKE.meta);
  const asJson = JSON.stringify(f);
  check("a finding carries only a 6-char prefix and a length",
    f.prefix.length === 6 && typeof f.length === "number" && !asJson.includes(FAKE.meta),
    `prefix=${f.prefix}… length=${f.length}`);
  check("and the refusal message does not contain the secret either",
    !secrets.refuseIfSecret(FAKE.meta, "your prompt").message.includes(FAKE.meta));

  // -------------------------------------------------------------------------
  say("\n2. A GIT SHA IS NOT A CREDENTIAL — the false positive that would break trust");
  // -------------------------------------------------------------------------
  check("40 hex characters is detected as LIKELY, not certain",
    secrets.firstSecret(FAKE.gitSha)?.shape.confidence === "likely",
    secrets.firstSecret(FAKE.gitSha)?.shape.confidence);
  check("so it is NOT refused", secrets.refuseIfSecret(FAKE.gitSha, "your prompt") === null);
  check("but it IS redacted in a log, where over-redacting costs only a diagnostic",
    secrets.redactSecrets(FAKE.gitSha).includes("[redacted]"));
  check("and ordinary prose is untouched",
    secrets.refuseIfSecret("Write me a plumbing advert for Manchester, £19 a month.", "your prompt") === null
    && secrets.findSecrets("Write me a plumbing advert for Manchester.").length === 0);

  // -------------------------------------------------------------------------
  say("\n3. THE PASTE NEVER REACHES THE PROVIDER — observed on the wire");
  // -------------------------------------------------------------------------
  {
    const before = received.length;
    let thrown = null;
    try {
      await gateway.gatewayComplete({
        system: "You are a helpful marketing assistant.",
        prompt: `Set up my conversions API with this token: ${FAKE.meta}`,
        maxTokens: 64,
      });
    } catch (e) { thrown = e; }
    check("the call was refused", thrown?.name === "CredentialInPromptError", thrown?.name || "(no throw)");
    check("NOTHING reached the provider", received.length === before,
      `${received.length - before} request(s) arrived`);
    check("the message names the vendor", /Meta \(Facebook \/ Instagram\)/.test(thrown?.message || ""));
    check("it says where the key belongs on this platform",
      /META_CAPI_ACCESS_TOKEN/.test(thrown?.message || ""));
    check("it says where to rotate it", /System Users/.test(thrown?.message || ""));
    check("it says nothing was sent", /Nothing was sent/.test(thrown?.message || ""));
    check("and the message does NOT contain the token",
      !(thrown?.message || "").includes(FAKE.meta), (thrown?.message || "").slice(0, 80));
  }

  // A key in the SYSTEM instruction is caught too — a caller assembling the
  // system text from a stored setting is the likelier route in practice.
  {
    const before = received.length;
    let thrown = null;
    try {
      await gateway.gatewayComplete({
        system: `Use the key ${FAKE.stripe} when pricing.`,
        prompt: "Write a pricing paragraph.", maxTokens: 64,
      });
    } catch (e) { thrown = e; }
    check("a credential in the SYSTEM instruction is refused too", thrown?.name === "CredentialInPromptError");
    check("nothing reached the provider", received.length === before);
    check("and it is named as Stripe, with the roll-key remedy",
      /Stripe/.test(thrown?.message || "") && /Roll key/.test(thrown?.message || ""));
  }

  // -------------------------------------------------------------------------
  say("\n4. THE EVENT RECORDS THE SHAPE AND NEVER THE VALUE");
  // -------------------------------------------------------------------------
  {
    // `recent` takes a WINDOW IN MILLISECONDS, not a count — my first version
    // passed 50 and happened to pass because the events were 50ms old. A check
    // that works by accident is not a check.
    const events = sentinel.recent(60_000);
    const ours = (events || []).filter((e) => e.kind === "credential_refused");
    check("a credential_refused event was recorded", ours.length >= 2, `${ours.length} event(s)`);
    check("the detail names the shape and the length, not the token",
      ours.every((e) => /chars, starts/.test(e.detail || "") && !(e.detail || "").includes(FAKE.meta)),
      ours[0]?.detail);
    check("and the kind is in the catalogue, so the Sentinel screen can explain it",
      sentinel.EVENT_KINDS.some((k) => k.kind === "credential_refused"));
  }

  // -------------------------------------------------------------------------
  say("\n5. A LEGITIMATE PROMPT STILL GOES THROUGH — the guard is not an obstacle");
  // -------------------------------------------------------------------------
  {
    const before = received.length;
    const res = await gateway.gatewayComplete({
      system: "You are a helpful marketing assistant.",
      prompt: `Summarise what changed in commit ${FAKE.gitSha} for a release note.`,
      maxTokens: 64,
    });
    check("a prompt containing a commit SHA is sent", received.length === before + 1 && Boolean(res.text),
      `${received.length - before} request(s) arrived`);
    const sent = received[received.length - 1].body;
    check("and the SHA arrives intact — nothing was mangled on the way",
      sent.includes(FAKE.gitSha));
  }

  // -------------------------------------------------------------------------
  say("\n6. THIRD-PARTY TEXT IS SCRUBBED, NOT REFUSED");
  // -------------------------------------------------------------------------
  {
    // A crawled page carrying somebody else's key must not stop the agent — it
    // is not the customer's mistake — and must not be forwarded to a model.
    const before = received.length;
    const res = await gateway.gatewayComplete({
      system: "You are a helpful marketing assistant.",
      prompt: "Summarise the page below.",
      untrusted: [{ label: "their website", text: `Contact us. Internal note: api key ${FAKE.google} do not share.` }],
      maxTokens: 64,
    });
    check("the agent still ran", received.length === before + 1 && Boolean(res.text));
    const sent = received[received.length - 1].body;
    check("the stranger's key did NOT go to the model", !sent.includes(FAKE.google));
    check("and it was replaced by a named redaction, so the model knows something was removed",
      /\[redacted\] \(Google\)/.test(sent), (sent.match(/\[redacted\][^"]{0,24}/) || [""])[0]);
  }

  // -------------------------------------------------------------------------
  say("\n7. THE AUDIT LOG STILL REDACTS, AND NOW SAYS WHICH VENDOR");
  // -------------------------------------------------------------------------
  {
    check("looksSecret names the vendor rather than 'provider key'",
      audit.looksSecret(FAKE.stripe) === "Stripe secret API key", audit.looksSecret(FAKE.stripe));
    check("a value is replaced in a logged field",
      audit.redactValue("note", `token is ${FAKE.meta}`).includes("[redacted]"));
    check("a field NAMED like a secret is redacted whatever is in it",
      audit.redactValue("api_key", "not-actually-a-key") === audit.REDACTED);
    check("and ordinary values survive, or the log stops being readable",
      audit.redactValue("campaign", "spring-offer") === "spring-offer");
  }
} finally {
  globalThis.fetch = realFetch;
  server.close();
}

say(`\n${proven} proven / ${broken} broken`);
process.exit(broken ? 1 : 0);
