// npm run drive:keys
//
// THE ADMIN KEY SCREEN, DRIVEN THROUGH THE REAL ROUTE.
//
// WHY THIS IS A DRIVER AND NOT ONLY A UNIT TEST. This feature takes a secret
// typed into a browser and puts it into a running server's environment. The
// unit tests prove the allowlist and the refusals; what they cannot prove is
// the thing a reviewer will actually ask about:
//
//   • Does the gate hold for a request with no identity?
//   • Does a value ever come back out — in a response body, in an error
//     message, in the inventory?
//
// Both are properties of the ROUTE, and both are measured here by sending a
// recognisable sentinel value through every path and then searching every byte
// that came back for it.
//
// WHAT THIS CONTAINER ALLOWS, STATED. There are no Firebase credentials, so
// `requireAuthEnforced` refuses every request with 403 ISOLATION_REFUSAL —
// which is the correct behaviour and is itself one of the things proven. It
// also means the AUTHORISED path cannot be exercised here: storing a key,
// hydrating it and clearing it again needs a database and an admin account.
// That is the honest limit, it is printed at the end, and it is item 2 on the
// owner's action list.

import fs from "node:fs";

const say = (m) => fs.writeSync(1, m + "\n");
let proven = 0, broken = 0;
const check = (label, ok, detail) => {
  (ok ? proven++ : broken++);
  say(`  ${ok ? "PROVEN " : "BROKEN "}  ${label}${detail ? ` — ${detail}` : ""}`);
};

process.env.NODE_ENV = "test";

const { NextRequest } = await import("next/server");
const route = await import("../src/app/api/admin/keys/route.ts");
const keys = await import("../src/backend/platform-keys.ts");

const ORIGIN = "https://mw.test";
// A value that could not occur by accident, so finding it anywhere is proof of
// a leak rather than a coincidence.
const SENTINEL = "sk-SENTINEL-do-not-echo-6f2b9c41aa";

const call = async (handler, path, init) => {
  const res = await handler(new NextRequest(ORIGIN + path, init));
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body, text };
};

say("");
say("Driving /api/admin/keys in-process. The real handler, the real gate.");
say("");

// --- 1. The gate, AND THE HOLE THIS DRIVER FOUND ---------------------------
//
// The first run of this driver reported GET answering an unidentified request
// with HTTP 200 AND THE WHOLE KEY INVENTORY. `requireAuthEnforced` only refuses
// an unidentified caller when NODE_ENV is production; below that, `requireAuth`
// passes everybody through and returns before it looks at the scope, exactly as
// its own doc comment warns. So `{ scope: "platform_admin" }` was not a check
// at all on a keyless or local deployment.
//
// A refusal is now required in EVERY mode — identified admin, or nothing — and
// these assertions are what hold that. A 403 (no permission) and a 503 (nobody
// can be identified on this deployment) are both refusals; what must never
// happen is a 200 with an inventory in it.
const refused = (r) => r.status === 403 || r.status === 503;

const get = await call(route.GET, "/api/admin/keys");
check(
  "an unidentified GET is refused, not answered with the inventory",
  refused(get) && !get.body?.entries,
  `status ${get.status} — ${String(get.body?.error || "").slice(0, 70)}`,
);
check(
  "the refusal names what to do about it",
  /Firebase Admin|FIREBASE_/.test(String(get.body?.error || "")),
  "the remedy is in the message",
);

const post = await call(route.POST, "/api/admin/keys", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "ANTHROPIC_API_KEY", value: SENTINEL }),
});
check("an unidentified POST is refused BEFORE the body is even read", refused(post) && post.body?.ok !== true, `status ${post.status}`);

const del = await call(route.DELETE, "/api/admin/keys?name=ANTHROPIC_API_KEY", { method: "DELETE" });
check("an unidentified DELETE is refused", refused(del) && del.body?.ok !== true, `status ${del.status}`);

const rehydrate = await call(route.POST, "/api/admin/keys", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "rehydrate" }),
});
check("even the read-only rehydrate needs the admin gate", refused(rehydrate), `status ${rehydrate.status}`);
check(
  "no refusal leaks a single key name from the inventory",
  ![get.text, post.text, del.text, rehydrate.text].some((t) => /ANTHROPIC_API_KEY"|"entries"|fingerprint/.test(t)),
  "the refusals describe the deployment, never its keys",
);

// --- 2. The sentinel must not come back ------------------------------------
const everything = [get.text, post.text, del.text, rehydrate.text].join("\n");
check(
  "the value sent in never appears in any response",
  !everything.includes(SENTINEL) && !everything.includes("SENTINEL"),
  "searched every byte of all four responses",
);

// --- 3. The refusal that is NOT about identity ------------------------------
// These run at module level, so they can be driven without an account — and
// each one is a mistake the owner could actually make.
const wrongField = await keys.setPlatformKey("OPENAI_API_KEY", "sk-ant-api03-wwwwwwwwwwwwwwwwwwwwwwww", "uid:drive");
check(
  "a key pasted into the wrong provider's field is refused BY SHAPE",
  wrongField.ok === false && /Anthropic/i.test(wrongField.error) && /ANTHROPIC_API_KEY/.test(wrongField.error),
  wrongField.error?.slice(0, 80),
);

const notCatalogued = await keys.setPlatformKey("NODE_OPTIONS", "--require /tmp/evil.js", "uid:drive");
check(
  "NODE_OPTIONS cannot be set at all — it would be code execution",
  notCatalogued.ok === false && /catalogued/i.test(notCatalogued.error),
  notCatalogued.error?.slice(0, 70),
);

const bootstrap = await keys.setPlatformKey("FIREBASE_PRIVATE_KEY", "-----BEGIN PRIVATE KEY-----", "uid:drive");
check(
  "a Firebase credential is refused with the bootstrap reason, not accepted and ignored",
  bootstrap.ok === false && /Firestore|Firebase Admin/i.test(bootstrap.error),
  bootstrap.error?.slice(0, 70),
);

const buildTime = await keys.setPlatformKey("NEXT_PUBLIC_FIREBASE_API_KEY", "AIzaSyExampleExampleExampleExample", "uid:drive");
check(
  "a NEXT_PUBLIC_ value is refused because the browser bundle was built already",
  buildTime.ok === false && /BUILT|build/i.test(buildTime.error),
  buildTime.error?.slice(0, 70),
);

// --- 4. No refusal echoes the value ----------------------------------------
const refusals = [wrongField, notCatalogued, bootstrap, buildTime].map((r) => JSON.stringify(r)).join("\n");
check(
  "no refusal echoes the value it refused",
  !refusals.includes("--require") && !refusals.includes("BEGIN PRIVATE KEY") && !refusals.includes("AIzaSy"),
  "errors name the problem, never the secret",
);

// --- 5. The inventory, read directly ---------------------------------------
const inv = await keys.keyInventory();
check(
  "every catalogued key appears with exactly one source",
  inv.setInAdmin + inv.setInEnvironment + inv.unset === inv.total && inv.total > 100,
  `${inv.total} keys: ${inv.setInAdmin} here, ${inv.setInEnvironment} from the environment, ${inv.unset} unset`,
);
check(
  "the inventory has no value field of any kind",
  !/"value"|"plaintext"|"secretValue"/.test(JSON.stringify(inv)),
  "status and fingerprints only",
);
const settable = keys.settableKeys().map((e) => e.name);
const MUST = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "SERPER_API_KEY", "LEADMAGIC_API_KEY", "CRON_SECRET", "MW_SENDING_POOL", "SMTP_HOST", "SMTP_USER", "SMTP_PASS"];
const missing = MUST.filter((m) => !settable.includes(m));
check(
  "every key the owner was told to set is settable from the admin account",
  missing.length === 0,
  missing.length ? `NOT settable: ${missing.join(", ")}` : `${settable.length} of ${inv.total} settable here`,
);
check(
  "the ones that cannot be set here each say why",
  inv.entries.filter((e) => e.cannotStore).every((e) => e.cannotStore.length > 60),
  `${inv.entries.filter((e) => e.cannotStore).length} keys with a stated reason`,
);

// --- 6. The allowlist, through the pure plan -------------------------------
const plan = keys.hydrationPlan(
  { NODE_OPTIONS: { value: "--require /tmp/evil.js" }, ANTHROPIC_API_KEY: { value: "legit" } },
  (v) => v,
);
check(
  "a hostile name in the store is refused by hydration, not assigned",
  plan.apply.length === 1 && plan.apply[0].name === "ANTHROPIC_API_KEY" && plan.refused.includes("NODE_OPTIONS"),
  `applied ${plan.apply.map((a) => a.name).join(",") || "nothing"}; refused ${plan.refused.join(",")}`,
);
check(
  "NODE_OPTIONS was never written into this process",
  process.env.NODE_OPTIONS === undefined || !String(process.env.NODE_OPTIONS).includes("/tmp/evil.js"),
  "the process environment is unchanged",
);

say("");
say(`drive:keys — ${proven} proven, ${broken} broken.`);
say("");
say("NOT PROVEN BY THIS RUN: the AUTHORISED path. No Firebase credentials exist");
say("in this container, so `requireAuthEnforced` refuses every request with 403 —");
say("correctly, and that refusal is one of the things proven above. Storing a key,");
say("hydrating it into a second server instance and clearing it back to the");
say("environment value all need a database and an admin account, and remain");
say("unproven until a keyed run. The allowlist, the refusals and the no-echo");
say("property are proven here and do not depend on either.");
process.exit(broken ? 1 : 0);
