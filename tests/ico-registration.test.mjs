import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// THIS PLATFORM'S OWN DATA-PROTECTION REGISTRATION.
//
// The privacy policy names MarketWar OS as the data controller in its first
// paragraph and, until now, said nothing about where that controller is
// registered — the one fact a reader checking up on us would actually look for,
// and the one a regulator expects to find.
//
// WHAT THESE TESTS CAN AND CANNOT PROVE. They prove the number is well-formed,
// that it reaches both legal surfaces, and that a wrong override publishes
// nothing rather than ours. They CANNOT prove the registration is real: that
// lives on the ICO's public register, which this container cannot reach, so
// nothing here should be read as verification of it.

const site = await import("../src/shared/site.ts");

test("the operator's registration is well-formed and reaches the surfaces", () => {
  const ico = site.icoRegistration();
  assert.equal(ico, "C2089949");
  assert.equal(site.isIcoRegistrationFormat(ico), true);

  // Both legal surfaces must state it, and both must read it from the one
  // place — a second copy is a second thing to forget to correct.
  const privacy = readFileSync(new URL("../src/app/privacy/page.tsx", import.meta.url), "utf8");
  assert.match(privacy, /icoRegistration/, "the privacy policy must state where the controller is registered");
  assert.match(privacy, /Information Commissioner/);
  const entity = readFileSync(new URL("../src/components/LegalEntity.tsx", import.meta.url), "utf8");
  assert.match(entity, /icoRegistration/);
  // NOT HARD-CODED AT THE SURFACES. A literal on a page is how one gets
  // corrected and the other does not.
  assert.doesNotMatch(privacy, /C2089949/);
  assert.doesNotMatch(entity, /C2089949/);
});

test("the registration survives an unconfigured trading identity", () => {
  // The identity block used to be all-or-nothing: with the company name still
  // unset it printed "these details are not yet published" and withheld the one
  // identifier the operator HAS supplied. A fact we hold and do not state is
  // not caution — it is a smaller version of the same gap.
  const entity = readFileSync(new URL("../src/components/LegalEntity.tsx", import.meta.url), "utf8");
  const unconfigured = entity.slice(entity.indexOf("if (!legalEntityConfigured)"), entity.indexOf("return (", entity.indexOf("legalEntityConfigured)")) + 600);
  assert.match(unconfigured, /<IcoLine \/>/, "the unconfigured branch must still state the registration");
  // And the configured branch too, or it would appear and then vanish the day
  // the company name is finally set.
  assert.equal((entity.match(/<IcoLine \/>/g) || []).length, 2, "both branches render it");
});

test("A WRONG OVERRIDE PUBLISHES NOTHING, never ours", () => {
  const before = process.env.NEXT_PUBLIC_ICO_REGISTRATION;
  try {
    // Another operator setting this is plainly trying to state THEIR
    // registration. Quietly showing them ours would be a lie told about a
    // regulator on their own legal page.
    for (const bad of ["banana", "C208994", "C20899499", "Z", "  ", "C2089949X", "12089949"]) {
      process.env.NEXT_PUBLIC_ICO_REGISTRATION = bad;
      assert.equal(site.icoRegistration(), "", `"${bad}" must publish nothing`);
    }
    // A well-formed override wins outright.
    for (const good of ["Z1234567", "ZA123456", "c7654321"]) {
      process.env.NEXT_PUBLIC_ICO_REGISTRATION = good;
      assert.equal(site.icoRegistration(), good.toUpperCase(), "a valid override must win, and normalise case");
    }
    process.env.NEXT_PUBLIC_ICO_REGISTRATION = "  Z1234567  ";
    assert.equal(site.icoRegistration(), "Z1234567", "surrounding whitespace is trimmed, not treated as malformed");
    // SET-BUT-EMPTY AND UNSET ARE DIFFERENT ANSWERS. An unset variable means
    // nobody expressed a view, so our own number applies; an empty one is an
    // operator saying "I have no registration to state", and publishing ours
    // over that would be the lie this whole rule exists to prevent.
    process.env.NEXT_PUBLIC_ICO_REGISTRATION = "";
    assert.equal(site.icoRegistration(), "", "set-but-empty means publish nothing");
    delete process.env.NEXT_PUBLIC_ICO_REGISTRATION;
    assert.equal(site.icoRegistration(), "C2089949", "unset means this deployment's own number");
  } finally {
    if (before === undefined) delete process.env.NEXT_PUBLIC_ICO_REGISTRATION;
    else process.env.NEXT_PUBLIC_ICO_REGISTRATION = before;
  }
});

test("the format check is a SHAPE check and does not claim more", () => {
  // It cannot tell a real registration from a well-formed invention, and
  // pretending otherwise would be the more dangerous claim. What it stops is a
  // half-typed or empty value being published as a regulatory identifier.
  assert.equal(site.isIcoRegistrationFormat("C2089949"), true);
  assert.equal(site.isIcoRegistrationFormat("Z1234567"), true, "the older seven-digit Z format");
  assert.equal(site.isIcoRegistrationFormat("ZA123456"), true, "the ZA six-digit format");
  assert.equal(site.isIcoRegistrationFormat("C0000000"), true, "well-formed and certainly not real — the check cannot tell");
  for (const bad of ["", null, undefined, "C208994", "CC2089949", "2089949", "C 2089949", "C2089949 extra"]) {
    assert.equal(site.isIcoRegistrationFormat(bad), false, `${JSON.stringify(bad)} is not the shape`);
  }
});

test("it is catalogued, so the one diagnostic that answers 'what does this deployment hold' can see it", async () => {
  const { ENV_CATALOGUE } = await import("../src/shared/env-catalogue.ts");
  const entry = ENV_CATALOGUE.find((e) => e.name === "NEXT_PUBLIC_ICO_REGISTRATION");
  assert.ok(entry, "an override nothing catalogues is an override nobody can tell is set");
  assert.equal(entry.secret, false, "a public register entry is not a credential");
  assert.equal(entry.group, "Legal");
});
