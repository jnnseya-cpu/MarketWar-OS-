import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// THE RULES FILE ITSELF, RUN BY THE REAL RULES ENGINE.
//
// WHY THIS EXISTS, AND WHAT IT CLOSES.
//
// Every isolation test in this repository until now proved the SERVER guard:
// `resolveBrandAccess` refuses a request, the API answers 403. That is the right
// first line and it is not the last one. `firestore.rules` and `storage.rules`
// are what stand between a stolen or forged client token and the database when
// the API is not in the path at all — a browser talking to Firestore directly,
// a leaked config, a future client feature somebody wires up without thinking.
//
// Nothing had ever executed them. They were read, reviewed, and deployed on the
// strength of reading — and this session already found a defect in `storage.rules`
// by reading (a write-size check on a READ, where `request.resource` is null),
// which is exactly the kind of thing that reads fine and fails closed or open in
// ways nobody predicts.
//
// So these run the ACTUAL files through Google's own rules engine in the
// emulator, as an unauthenticated client, as the owner, and as a second
// signed-in tenant. That is the deployed artefact being tested, not a paraphrase
// of it.
//
// It SKIPS ITSELF, loudly, when no emulator is running — a security suite that
// silently passes because it never ran is worse than none.
// ---------------------------------------------------------------------------

const HOST = process.env.FIRESTORE_EMULATOR_HOST || "";
const STORAGE_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST || "";
const PROJECT = `rules-${Date.now().toString(36)}`;

let rt = null;
let testEnv = null;
let reachable = false;
let missingLib = false;
let doc, getDoc, setDoc, collection, getDocs;

before(async () => {
  if (!HOST) return;
  const [host, port] = HOST.split(":");
  try {
    const res = await fetch(`http://${host}:${port}/`);
    reachable = res.status < 500;
  } catch { reachable = false; }
  if (!reachable) return;
  // IMPORTED HERE, NOT AT THE TOP. Without an emulator this whole file must
  // still be loadable — a test file that throws on import takes the entire
  // suite down, and a security suite that cannot even load is the worst of
  // both worlds.
  try { rt = await import("@firebase/rules-unit-testing"); }
  catch { reachable = false; missingLib = true; return; }
  ({ doc, getDoc, setDoc, collection, getDocs } = await import("firebase/firestore"));
  testEnv = await rt.initializeTestEnvironment({
    projectId: PROJECT,
    firestore: {
      host, port: Number(port),
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
    },
    ...(STORAGE_HOST ? { storage: {
      host: STORAGE_HOST.split(":")[0], port: Number(STORAGE_HOST.split(":")[1]),
      rules: readFileSync(new URL("../storage.rules", import.meta.url), "utf8"),
    } } : {}),
  });
});

after(async () => { if (testEnv) await testEnv.cleanup(); });

const need = () => {
  if (!HOST) return "FIRESTORE_EMULATOR_HOST is not set — start the Firestore emulator to run the rules for real: see docs/SECURITY-RULES-TESTING.md.";
  if (missingLib) return "@firebase/rules-unit-testing is not installed — npm i -D @firebase/rules-unit-testing to run the rules for real.";
  if (!reachable) return `No Firestore emulator answering on ${HOST}.`;
  return "";
};

// Seed a document the way the SERVER does — through the Admin path, which the
// rules deliberately do not govern. Reading it back as a client is the test.
const seed = async (fn) => testEnv.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));


test("a signed-OUT visitor can read nothing at all", async (t) => {
  const why = need(); if (why) return t.skip(why);
  await seed(async (db) => {
    await setDoc(doc(db, "brands", "brand-a"), { brandId: "brand-a", ownerId: "owner-a" });
    await setDoc(doc(db, "users", "owner-a"), { uid: "owner-a", email: "a@x.test" });
    await setDoc(doc(db, "settings", "brand-a"), { fromEmail: "hi@a.test" });
    await setDoc(doc(db, "tenants/tenant-a/contacts", "c1"), { email: "ann@example.com" });
  });
  const anon = testEnv.unauthenticatedContext().firestore();
  for (const path of [["brands", "brand-a"], ["users", "owner-a"], ["settings", "brand-a"]]) {
    await rt.assertFails(getDoc(doc(anon, ...path)),
      `an unauthenticated client read ${path.join("/")}`);
  }
  await rt.assertFails(getDocs(collection(anon, "tenants/tenant-a/contacts")));
});

test("a second signed-in tenant cannot read the first tenant's data", async (t) => {
  const why = need(); if (why) return t.skip(why);
  await seed(async (db) => {
    await setDoc(doc(db, "brands", "brand-a"), { brandId: "brand-a", ownerId: "owner-a" });
    await setDoc(doc(db, "tenants/tenant-a/contacts", "c1"), { email: "ann@example.com" });
  });
  // THE ATTACKER IS SIGNED IN AND LEGITIMATE — just not this tenant. That is the
  // realistic case: a paying customer of the same platform, with a valid token.
  const intruder = testEnv.authenticatedContext("owner-b", { tenantId: "tenant-b" }).firestore();
  await rt.assertFails(getDoc(doc(intruder, "brands", "brand-a")),
    "another signed-in account read a brand ownership record that is not theirs");
  await rt.assertFails(getDocs(collection(intruder, "tenants/tenant-a/contacts")),
    "another signed-in account read a tenant's contact list");

  const owner = testEnv.authenticatedContext("owner-a", { tenantId: "tenant-a" }).firestore();
  await rt.assertSucceeds(getDoc(doc(owner, "brands", "brand-a")));
  await rt.assertSucceeds(getDocs(collection(owner, "tenants/tenant-a/contacts")));
});

test("ownership cannot be re-assigned from a client, even by the owner", async (t) => {
  const why = need(); if (why) return t.skip(why);
  await seed(async (db) => {
    await setDoc(doc(db, "brands", "brand-a"), { brandId: "brand-a", ownerId: "owner-a" });
  });
  const owner = testEnv.authenticatedContext("owner-a", { tenantId: "tenant-a" }).firestore();
  // Reading their own record is allowed; rewriting who owns it is not. A client
  // that could write this could hand itself any brand on the platform.
  await rt.assertSucceeds(getDoc(doc(owner, "brands", "brand-a")));
  await rt.assertFails(setDoc(doc(owner, "brands", "brand-a"), { brandId: "brand-a", ownerId: "owner-b" }),
    "a client rewrote a brand's ownerId — that is the whole tenancy model");
  const intruder = testEnv.authenticatedContext("owner-b", {}).firestore();
  await rt.assertFails(setDoc(doc(intruder, "brands", "brand-c"), { brandId: "brand-c", ownerId: "owner-b" }),
    "a client claimed a brand directly, bypassing the server's atomic claim");
});

test("server-only ledgers are unreachable from any client", async (t) => {
  const why = need(); if (why) return t.skip(why);
  // These hold money, spend and delivery history. No client, however
  // authenticated, has any business reading or writing them.
  const serverOnly = ["settings", "audits", "agent_runs"];
  await seed(async (db) => {
    for (const c of serverOnly) await setDoc(doc(db, c, "x"), { v: 1 });
  });
  const signedIn = testEnv.authenticatedContext("owner-a", { tenantId: "tenant-a" }).firestore();
  for (const c of serverOnly) {
    await rt.assertFails(getDoc(doc(signedIn, c, "x")), `a signed-in client read ${c}`);
    await rt.assertFails(setDoc(doc(signedIn, c, "y"), { v: 2 }), `a signed-in client wrote ${c}`);
  }
});

test("a collection nobody wrote a rule for is denied, not allowed", async (t) => {
  const why = need(); if (why) return t.skip(why);
  // DENY BY DEFAULT, PROVEN. The header of the rules file claims it; a rules
  // file is only deny-by-default until somebody adds a match block with a
  // generous condition, and the collection added next year is the one nobody
  // writes a test for.
  const signedIn = testEnv.authenticatedContext("owner-a", { tenantId: "tenant-a" }).firestore();
  await rt.assertFails(getDoc(doc(signedIn, "a_collection_invented_in_this_test", "x")));
  await rt.assertFails(setDoc(doc(signedIn, "a_collection_invented_in_this_test", "x"), { v: 1 }));
});

// ---------------------------------------------------------------------------
// STORAGE — the rules this session already fixed one defect in, by reading.
// ---------------------------------------------------------------------------
test("storage: a tenant's files are readable by that tenant and nobody else", async (t) => {
  const why = need(); if (why) return t.skip(why);
  if (!STORAGE_HOST) return t.skip("FIREBASE_STORAGE_EMULATOR_HOST is not set — start the storage emulator to run storage.rules.");
  const { ref, getDownloadURL, uploadBytes } = await import("firebase/storage");
  const path = "tenants/tenant-a/creatives/poster.png";
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), path), new Uint8Array([1, 2, 3]), { contentType: "image/png" });
  });
  const owner = testEnv.authenticatedContext("owner-a", { tenantId: "tenant-a" }).storage();
  const intruder = testEnv.authenticatedContext("owner-b", { tenantId: "tenant-b" }).storage();
  const anon = testEnv.unauthenticatedContext().storage();

  // THE READ IS THE CASE THAT WAS BROKEN. `request.resource` is null on a read,
  // so a size condition written across read AND write made every read fail.
  await rt.assertSucceeds(getDownloadURL(ref(owner, path)));
  await rt.assertFails(getDownloadURL(ref(intruder, path)), "another tenant downloaded a file");
  await rt.assertFails(getDownloadURL(ref(anon, path)), "an unauthenticated visitor downloaded a file");
});
