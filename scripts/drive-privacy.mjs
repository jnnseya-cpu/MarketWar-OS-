import fs from "node:fs";

const say = (m) => fs.writeSync(1, m + "\n");

let proven = 0, broken = 0;
const check = (label, ok, detail) => {
  (ok ? proven++ : broken++);
  say(`  ${ok ? "PROVEN " : "BROKEN "}  ${label}${detail ? ` — ${detail}` : ""}`);
};

// NODE_ENV=test, set BEFORE the handlers are imported: the ownership gate reads
// it at call time, but the modules under it read env at import time.
process.env.NODE_ENV = "test";

const { NextRequest } = await import("next/server");
const privacy = await import("../src/app/api/privacy/route.ts");
const contactsRoute = await import("../src/app/api/contacts/route.ts");
const unsubRoute = await import("../src/app/api/track/unsubscribe/route.ts");

const ORIGIN = "https://mw.test";

/** Call a handler and read the response the way a browser would. */
const call = async (handler, path, init) => {
  const res = await handler(new NextRequest(ORIGIN + path, init));
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* html or empty */ }
  return { status: res.status, body, text, headers: res.headers };
};

const getPrivacy = (path) => call(privacy.GET, path);
const postPrivacy = (payload) => call(privacy.POST, "/api/privacy", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
});

say("");
say("Driving the route handlers in-process. No network, no build — the real");
say("handlers, the real guard, the real stores.");
say("");

const BRAND = `drv-privacy-${Date.now().toString(36)}`;

// --- 0. The register answers with no brand and no credential --------------
const reg = await getPrivacy("/api/privacy");
const r = reg.body?.register;
check("the data register answers publicly", reg.status === 200 && r?.stores > 80, `${r?.stores} stores, ${r?.personalStores} holding personal data`);
check("every store is accounted for", Boolean(r) && r.brandScoped + r.unreachable === r.stores, `${r?.brandScoped} brand-scoped + ${r?.unreachable} unreachable = ${r?.stores}`);
check("every store declares what it holds", Boolean(r) && r.entries.every((e) => typeof e.holds === "string" && e.holds.length > 15), `${r?.entries?.length} entries`);
check("every store kept or anonymised states a legal basis", Boolean(r) && r.entries.filter((e) => e.onErasure !== "deleted" && e.onErasure !== "not reachable from a brand id").every((e) => typeof e.basis === "string" && e.basis.length > 40), `${r?.retain} retained + ${r?.anonymise} anonymised, each with a basis`);
check("the register carries no tenant data", !/"email"\s*:/.test(reg.text), "no address field in the transparency answer");

// --- 1. Put real data in through the platform's own front door -----------
const imported = await call(contactsRoute.POST, "/api/contacts", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    brandId: BRAND,
    business: "Analytical Engines Ltd",
    contacts: [
      { name: "Ada Lovelace", email: "ada@example-erasure.test", company: "Analytical Engines Ltd" },
      { name: "Grace Hopper", email: "grace@example-erasure.test", company: "Compilers Inc" },
    ],
  }),
});
check("two contacts stored through the contacts API", imported.status === 200, `status ${imported.status}${imported.status === 200 ? "" : ` — ${imported.body?.error || imported.text.slice(0, 80)}`}`);

// A SUPPRESSION — the record that must SURVIVE an erasure. Created the way a
// recipient creates one: a real signed unsubscribe token through the public
// one-click endpoint, not by poking the store.
const { signToken } = await import("../src/backend/email-events.ts");
const unsubToken = signToken(BRAND, "ada@example-erasure.test");
const unsub = await call(unsubRoute.GET, `/api/track/unsubscribe?t=${encodeURIComponent(unsubToken)}`);
const suppressed = unsub.status === 200 && /unsubscribed/i.test(unsub.text);
check("a recipient's one-click unsubscribe was recorded", suppressed, `status ${unsub.status}`);

// --- 2+3. Export ---------------------------------------------------------
const exp = await getPrivacy(`/api/privacy?brandId=${encodeURIComponent(BRAND)}`);
const ok = exp.status === 200;
const contacts = exp.body?.stores?.find((s) => s.collection === "contacts");
check("the export route answers for an owned brand", ok, `status ${exp.status}${ok ? "" : ` — ${exp.body?.error}`}`);
// EVERY ASSERTION BELOW IS GATED ON `ok`. The first run of this driver reported
// three of them as PROVEN while the route was answering 503 — "the export no
// longer contains the address" passes beautifully when there is no export at
// all. A check that passes because the request failed is this repository's
// second defect class, and a driver is the last place it belongs.
check("the export contains the contacts that were stored", ok && contacts?.count === 2, `contacts.count=${contacts?.count}`);
check("the export carries the real values, not a summary", ok && exp.text.includes("ada@example-erasure.test"), "the address is in the file");
check("the export is sent as a downloadable file", ok && /attachment; filename=/.test(exp.headers.get("content-disposition") || ""), exp.headers.get("content-disposition")?.slice(0, 70));
check("the export names what it cannot reach", ok && Array.isArray(exp.body?.notReachable) && exp.body.notReachable.length > 20 && exp.body.notReachable.every((s) => s.why?.length > 30), `${exp.body?.notReachable?.length} stores listed, each with a reason`);
check("the export states which persistence it read", ok && (exp.body?.persistence === "memory" || exp.body?.persistence === "live"), exp.body?.persistence);

// --- 4. A preview must change nothing -----------------------------------
const prev = await postPrivacy({ brandId: BRAND, action: "preview" });
check("preview reports what would be deleted", prev.status === 200 && prev.body?.dryRun === true && prev.body.documentsErased >= 2, `${prev.body?.documentsErased} documents`);
const afterPreview = await getPrivacy(`/api/privacy?brandId=${encodeURIComponent(BRAND)}`);
const stillThere = afterPreview.body?.stores?.find((s) => s.collection === "contacts")?.count;
check("preview DELETED NOTHING", stillThere === 2, `contacts still ${stillThere} after the preview`);

// --- 5. No confirmation, no erasure -------------------------------------
const noConfirm = await postPrivacy({ brandId: BRAND, action: "erase" });
check("an erasure with no confirmation is refused", noConfirm.status === 400 && /ERASE/.test(noConfirm.body?.error || ""), noConfirm.body?.error?.slice(0, 60));
const afterRefusal = await getPrivacy(`/api/privacy?brandId=${encodeURIComponent(BRAND)}`);
check("the refused erasure left the data alone", afterRefusal.body?.stores?.find((s) => s.collection === "contacts")?.count === 2, "contacts intact");

// --- 6+7+8. The erasure itself ------------------------------------------
const erased = await postPrivacy({ brandId: BRAND, action: "erase", confirm: "ERASE" });
const erasedOk = erased.status === 200 && erased.body?.dryRun === false;
const retained = (erased.body?.stores || []).filter((s) => s.action === "retained");
const skipped = (erased.body?.stores || []).filter((s) => s.action === "skipped");
check("the erasure runs and returns a receipt", erasedOk, `${erased.body?.documentsErased} deleted, ${erased.body?.storesRetained} stores retained`);
check("the receipt states a basis for everything it kept", erasedOk && retained.length > 5 && retained.every((s) => typeof s.basis === "string" && s.basis.length > 40), `${retained.length} retained stores, each with a basis`);
// A SKIPPED STORE IS NOT AUTOMATICALLY A FAILURE, and conflating the two sent
// this assertion red over correct behaviour. With no database configured, a
// store whose only copy is in the running process and which owns no in-memory
// eraser CANNOT be erased — and the receipt saying so is the fix that was just
// made, not a regression. What must never happen is a store skipped because
// something ERRORED, or skipped without a reason a person can read.
const errored = skipped.filter((s) => /^Failed:/.test(s.note || ""));
const unexplained = skipped.filter((s) => !s.note || s.note.length < 60);
check("no store failed with an error", erasedOk && errored.length === 0, errored.map((s) => s.collection).join(",") || "none errored");
check("every store NOT erased says why", erasedOk && unexplained.length === 0, `${skipped.length} skipped, all with a stated reason`);

const after = await getPrivacy(`/api/privacy?brandId=${encodeURIComponent(BRAND)}`);
const afterOk = after.status === 200;
const contactsAfter = after.body?.stores?.find((s) => s.collection === "contacts")?.count;
check("the contacts are GONE after the erasure", afterOk && contactsAfter === 0, `contacts.count=${contactsAfter}`);
// THE ADDRESS IS GONE FROM EVERYWHERE EXCEPT THE SUPPRESSION LIST, and that
// exception is the point rather than a leak. This assertion first read "the
// export no longer contains the address" and FAILED — correctly. A lawful
// erasure keeps the unsubscribe record, and an unsubscribe record is an
// address; deleting it would permit contact again, which is the opposite of
// honouring the objection. So the test now says what the law says: no store
// but the suppression list may still hold it.
const stillHolding = (after.body?.stores || [])
  .filter((st) => JSON.stringify(st.records || []).includes("ada@example-erasure.test"))
  .map((st) => st.collection);
check(
  "the address survives ONLY in the suppression list",
  afterOk && stillHolding.length === 1 && stillHolding[0] === "email_suppressions",
  stillHolding.length ? `held by ${stillHolding.join(", ")}` : "held by nothing — the suppression should still have it",
);

if (suppressed) {
  const supp = after.body?.stores?.find((s) => s.collection === "email_suppressions");
  check("the unsubscribe record SURVIVED the erasure", afterOk && (supp?.count ?? 0) >= 1, `email_suppressions.count=${supp?.count} — erasing it would permit contact again`);
} else {
  broken++;
  say("  BROKEN    suppression survival could not be tested — no suppression was created");
}

check("the receipt's count matches what actually moved", erasedOk && erased.body.documentsErased >= 2 && contactsAfter === 0, `receipt says ${erased.body?.documentsErased}, contacts went 2 → ${contactsAfter}`);

// --- 9. The production fail-closed behaviour the first run discovered ----
// With NODE_ENV=production and no Firebase Admin, brand isolation cannot be
// enforced, so every brand-scoped route must refuse rather than serve. This is
// why the first version of this driver could not use a built server at all —
// so it is asserted rather than remembered.
process.env.NODE_ENV = "production";
const refused = await getPrivacy(`/api/privacy?brandId=${encodeURIComponent(BRAND)}`);
check("with no credentials in production the export REFUSES rather than serving", refused.status === 503 && /Isolation unavailable/.test(refused.body?.error || ""), `status ${refused.status}`);
const refusedErase = await postPrivacy({ brandId: BRAND, action: "erase", confirm: "ERASE" });
check("with no credentials in production the erasure REFUSES rather than deleting", refusedErase.status === 503, `status ${refusedErase.status}`);
process.env.NODE_ENV = "test";

say("");
say(`drive:privacy — ${proven} proven, ${broken} broken.`);
say("");
say("NOT PROVEN BY THIS RUN: the Firestore write paths — batch delete, the");
say("documentId range query and the anonymise field-delete. No credentials exist");
say("in this container, so persistence was the in-memory store. Those remain");
say("unproven until a keyed run.");
process.exit(broken ? 1 : 0);
