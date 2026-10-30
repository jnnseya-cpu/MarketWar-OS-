import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// THE KEY LIST IS BOUND TO THE CODE, OR IT IS FICTION.
//
// WHY THIS GATE EXISTS. `docs/KEYS-TO-ADD.md` tells the owner which credentials
// to go and buy. A document like that has exactly two ways to fail, and both of
// them waste somebody's afternoon:
//
//   • A NAME THAT IS WRONG. `FIREBASE_STORAGE_BUCKET_NAME` typed once, set in
//     Vercel, redeployed — and storage is still dark, with the screen correctly
//     reporting the real name as missing. The launch gate itself made this
//     mistake once: it told the owner to set
//     NEXT_PUBLIC_LEGAL_ENTITY_REGISTERED_ADDRESS while the component read
//     NEXT_PUBLIC_REGISTERED_ADDRESS, so following the instruction exactly
//     turned a legal blocker green while the footer still named no trader.
//
//   • A COUNT THAT DRIFTED. "126 catalogued variables" was true when it was
//     typed and is not now. STATE.md's own §168 entry records this defect class
//     in the document whose job is to be current, and it keeps recurring
//     because a hand-typed number has nothing holding it to the thing it
//     counts.
//
// So: every environment-variable name this document mentions must exist in the
// catalogue, and every number it states must be computed from it.

const doc = readFileSync(new URL("../docs/KEYS-TO-ADD.md", import.meta.url), "utf8");
const { ENV_CATALOGUE } = await import("../src/shared/env-catalogue.ts");
const keys = await import("../src/backend/platform-keys.ts");

const names = new Set(ENV_CATALOGUE.map((e) => e.name));
const settable = keys.settableKeys();

/** Every SCREAMING_SNAKE token in backticks — which is how the doc names a key. */
function mentioned(text) {
  const out = new Set();
  for (const m of text.matchAll(/`([A-Z][A-Z0-9_]{4,})`/g)) out.add(m[1]);
  return out;
}

test("EVERY KEY THE DOCUMENT NAMES EXISTS IN THE CATALOGUE", () => {
  // The exceptions are names that are deliberately NOT ours: a value the gate
  // accepts under an older spelling, and the shell command used to make a
  // secret. Listed rather than pattern-matched, so a typo cannot hide in a
  // pattern.
  const notOurs = new Set([
    "NEXT_PUBLIC_LEGAL_ENTITY_REGISTERED_ADDRESS", // the older accepted spelling
  ]);

  const wrong = [...mentioned(doc)].filter((n) => !names.has(n) && !notOurs.has(n));
  assert.deepEqual(
    wrong, [],
    `these names are in the document but not in the catalogue, so setting them would do nothing: ${wrong.join(", ")}`,
  );
});

test("THE COUNTS ARE THE REAL ONES", () => {
  // Stated in the document's own words, so a change to either number has to be
  // made in both places or this fails.
  assert.match(doc, new RegExp(`\\*\\*${ENV_CATALOGUE.length} environment variables\\.\\*\\*`),
    `the document must state the real catalogue size (${ENV_CATALOGUE.length})`);
  assert.match(doc, new RegExp(`${settable.length} of them can be typed into the Admin Control`),
    `the document must state how many are settable in the admin screen (${settable.length})`);
  const notSettable = ENV_CATALOGUE.length - settable.length;
  assert.match(doc, new RegExp(`\\*\\*${notSettable} cannot\\*\\*`),
    `the document must state how many are refused there (${notSettable})`);
  assert.match(doc, new RegExp(`The ${notSettable} that cannot live in the admin screen`),
    "and the section heading must carry the same number");
});

test("AND THE OTHER DOCUMENTS THAT QUOTE THE SAME COUNTS ARE BOUND TOO", () => {
  // "126 catalogued variables" was true when it was typed and was wrong by
  // three the next time the catalogue grew — in THREE documents at once,
  // including the one whose whole job is to be current. A hand-typed number
  // has nothing holding it to the thing it counts, so now it does.
  const n = ENV_CATALOGUE.length;
  const settableN = settable.length;
  for (const file of ["STATE.md", "GO-LIVE.md"]) {
    const text = readFileSync(new URL(`../docs/${file}`, import.meta.url), "utf8");
    const quoted = [...text.matchAll(/(\d+) of (?:the )?(\d+) catalogued/g)];
    assert.ok(quoted.length > 0, `${file} no longer states the catalogue counts — if that is deliberate, remove it from this list`);
    for (const [whole, a, b] of quoted) {
      assert.equal(Number(b), n, `${file} says "${whole}" but the catalogue holds ${n}`);
      assert.equal(Number(a), settableN, `${file} says "${whole}" but ${settableN} are settable in the admin screen`);
    }
  }
});

test("THE THREE BLOCKERS IN THE DOCUMENT ARE THE THREE THE GATE REPORTS", async () => {
  // COMPUTED BY THE SHIPPED GATE, not read back off the document. The first
  // version of this test asserted that the catalogue was non-empty, which is
  // a check that passes for a reason unrelated to what it tests — the exact
  // fault this file exists to prevent elsewhere.
  const lc = await import("../src/backend/launch-check.ts");
  const empty = lc.launchReport(lc.readLaunchEnv({ VERCEL_ENV: "production" }));
  const blockers = empty.findings.filter((f) => f.severity === "blocker");

  assert.equal(blockers.length, 3, `the gate reports ${blockers.length} blockers on an empty production environment: ${blockers.map((b) => b.id).join(", ")}`);
  assert.match(doc, /\*\*3 blockers\*\*/, "the document must state the number the gate actually reports");

  // Each blocker's own remedy names at least one key, and the document must
  // name that key too — a tier-0 list missing one of them is a launch that
  // stays NO-GO for a reason nobody wrote down.
  const inDoc = mentioned(doc);
  for (const b of blockers) {
    const named = [...(b.fix || "").matchAll(/\b([A-Z][A-Z0-9_]{4,})\b/g)].map((m) => m[1]).filter((n) => names.has(n));
    assert.ok(named.length > 0, `blocker ${b.id} names no catalogued key in its fix`);
    assert.ok(
      named.some((n) => inDoc.has(n)),
      `blocker "${b.title}" is fixed by ${named.join(" or ")}, and the document names none of them`,
    );
  }

  // And once those three are set, the gate says GO. Driven with the state
  // docs/STATE.md records as already live, so this is the real remaining gap.
  const asLive = {
    VERCEL_ENV: "production",
    STRIPE_SECRET_KEY: "sk_live_placeholder", STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
    FIREBASE_CLIENT_EMAIL: "a@b.iam.gserviceaccount.com", FIREBASE_PRIVATE_KEY: "-----BEGIN-----",
    ANTHROPIC_API_KEY: "placeholder",
    FIELD_ENCRYPTION_MASTER_KEY: "x".repeat(64),
    NEXT_PUBLIC_LEGAL_ENTITY_NAME: "A Company Ltd",
    NEXT_PUBLIC_REGISTERED_ADDRESS: "1 Street, London",
  };
  const ready = lc.launchReport(lc.readLaunchEnv(asLive, {
    adminConfigured: true, stripeWebhookVerifiedAt: new Date().toISOString(),
  }));
  assert.equal(ready.blockers, 0, `still blocked by: ${ready.findings.filter((f) => f.severity === "blocker").map((f) => f.title).join("; ")}`);
  assert.equal(ready.goPublic, true);
});

test("a key the document says is admin-settable really is, and vice versa", () => {
  // The document's two claims about WHERE a key goes are load-bearing: send
  // somebody to the wrong screen and they set it, see it saved, and nothing
  // changes. These are the ones it names explicitly as Vercel-only.
  const vercelOnly = [
    "FIELD_ENCRYPTION_MASTER_KEY",
    "NEXT_PUBLIC_LEGAL_ENTITY_NAME",
    "NEXT_PUBLIC_REGISTERED_ADDRESS",
    "NEXT_PUBLIC_COMPANY_NUMBER",
    "NEXT_PUBLIC_VAT_NUMBER",
    "FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_META_PIXEL_ID",
    "NEXT_PUBLIC_GTM_ID",
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_PRODUCTION_URL",
  ];
  for (const name of vercelOnly) {
    assert.equal(keys.storeable(name).ok, false, `${name} is described as Vercel-only but the admin screen would accept it`);
  }

  const adminSettable = [
    "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY",
    "CRON_SECRET", "HUMAN_CHECK_SECRET", "PLATFORM_ADMIN_EMAILS",
    "AI_MONTHLY_CEILING_USD", "EMAIL_TRACKING_SECRET",
    "HEYGEN_API_KEY", "ELEVENLABS_API_KEY", "SYNTHESIA_API_KEY", "DID_API_KEY",
    "SERPER_API_KEY", "LEADMAGIC_API_KEY", "HUNTER_API_KEY", "APOLLO_API_KEY",
    "COMPANIES_HOUSE_API_KEY", "META_CAPI_ACCESS_TOKEN", "REQUIRE_LIVE",
    "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
  ];
  for (const name of adminSettable) {
    assert.equal(keys.storeable(name).ok, true, `${name} is described as admin-settable but the screen refuses it: ${keys.storeable(name).why}`);
  }
});

test("THE SENDING LAW HOLDS IN THIS DOCUMENT TOO", () => {
  // MarketWar OS is the email service provider. A key list is exactly the kind
  // of document where an outside sender gets suggested as a convenience, and
  // the owner's directive is that it never is — on any surface.
  for (const banned of ["Resend", "SendGrid", "Mailgun", "Postmark", "Brevo", "Mandrill", "Sendinblue", "SparkPost"]) {
    assert.ok(!new RegExp(banned, "i").test(doc), `${banned} is named in the key list — MarketWar OS is the sending service`);
  }
  assert.match(doc, /MarketWar OS is the email service provider/i,
    "and the document must say so where sending is discussed");
});

test("NO VALUE IS EVER IN THIS DOCUMENT, only names and where to get them", () => {
  // A credential pasted into a document is a credential in git history for
  // ever. The same scan the credential guard uses, with a payload required so
  // the catalogue's own help text ("a whsec_… signing secret") is not a hit.
  const shapes = /sk-ant-[A-Za-z0-9_-]{16,}|sk_(?:live|test)_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{30,}|EAA[A-Za-z0-9]{30,}/;
  assert.ok(!shapes.test(doc), "the key list contains something shaped like a real credential");
});

test("it points at the live diagnostic rather than claiming to know the live state", () => {
  // THE HONEST LIMIT. This container has no DNS, so nothing written here can
  // know what is set on marketwaros.com. A document that implied otherwise
  // would send somebody to buy a key they already have.
  assert.match(doc, /\/api\/health\/live/, "the document must name the one surface that answers what is actually set");
  assert.match(doc, /\/api\/capabilities/, "and the one that says which capabilities are live");
  assert.match(doc, /no DNS/i, "and must say why it cannot answer that itself");
});
