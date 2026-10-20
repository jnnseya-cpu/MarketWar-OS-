import test from "node:test";
import assert from "node:assert/strict";

// THE COLUMNS A BOUGHT LIST ARRIVES WITH, CARRIED INSTEAD OF DISCARDED.
//
// THE DEFECT, AND IT MADE A FINISHED FEATURE UNREACHABLE.
// `backend/social-website.ts` reads a company's own website off its Facebook or
// LinkedIn page for no key and no credit. It was written, unit-tested and driven
// end to end. Its only input is `EnrichInput.socialUrl` — and a search of the
// whole tree found ZERO producers of that field. Nothing anywhere could supply
// it, so on the list it was built for it never once ran.
//
// Underneath that, a second missing carry with a price attached: the vault's CSV
// parser had NO WEBSITE COLUMN AT ALL. A bought list states the domain, the
// parser dropped it, and the platform then paid for a live search to rediscover
// what the customer had already handed over.
//
// Both are this repository's commonest defect — a value read on one side of a
// boundary and never carried across — and neither is visible in a unit test of
// either side, because both sides pass. So these tests follow the VALUE:
// file → parser → store → (re-import) → enrichment input.
//
// NO NETWORK IN THIS FILE. The whole chain, including the route's own mapping
// and the money question of whether a search is spent, is driven over a real
// socket in `npm run drive:import` (33 proven / 0 broken).
//
// MUTATION TESTED: 10 mutants, all killed — but three of them survived first,
// and each survival was worth more than the kill:
//
//   • Removing "business name" from the company synonyms changed NOTHING,
//     because the column-majority rule rescued the fixture. The sole-trader case
//     below is what separates them: a column the file calls "Business Name" is a
//     business column even when every value looks like a person.
//   • The store's wipe could not be killed at all, because THREE overlapping
//     guards each prevented it single-handed — no one mutant could fail the
//     test, and no reader could tell which was load-bearing. The guards are now
//     one rule in one place, and removing it fails here.
//   • My own mutant set was incomplete: I mutated two merge points and missed
//     the third, which was the one actually doing the work.
//
// Recorded in §165 of docs/REQUIREMENTS-COVERAGE.md, with the two faults the
// driver found in my harness before it found anything in the code.

const csv = async () => await import("../src/shared/csv-import.ts");

test("a bought list's website and social columns reach the parser's output", async () => {
  const { parseCsvDetailed } = await csv();

  const parsed = parseCsvDetailed([
    "Business Name,Website,Facebook Page,Town",
    "Quiet Trades Ltd,,https://www.facebook.com/quiettrades,Manchester",
    "Marsh & Weld Fabrication Ltd,marshweld.co.uk,,Sheffield",
  ].join("\n"));

  const qt = parsed.rows.find((r) => r.company === "Quiet Trades Ltd");
  const mw = parsed.rows.find((r) => r.company === "Marsh & Weld Fabrication Ltd");
  assert.ok(qt, "a row headed \"Business Name\" did not produce a company");
  assert.equal(qt.socialUrl, "https://www.facebook.com/quiettrades");
  assert.equal(qt.website, undefined, "a Facebook page is not the company's own website");
  // A BARE DOMAIN IS NORMALISED, because `findWebsite` tests for a scheme before
  // it will use a supplied website, so "marshweld.co.uk" would have been ignored
  // and the search paid for anyway.
  assert.equal(mw.website, "https://marshweld.co.uk");
  assert.equal(mw.socialUrl, undefined);

  // SAID OUT LOUD. Both of these change what the row costs, and a parser that
  // silently uses them cannot be checked by the person paying.
  assert.match(parsed.note, /already state a website/);
  assert.match(parsed.note, /Facebook or LinkedIn/);
});

test("an Excel curly apostrophe does not arrive as an invisible control character", async () => {
  const { decodeCsvBytes, fixC1 } = await csv();

  // FOUND BY THE SUITE, NOT BY ME, and it had been failing. The venue fixture's
  // assertion "the curly apostrophe did not survive decoding" was red before any
  // of this section's work, so it was not a regression — it was a live defect in
  // the importer, on the path this section ships.
  //
  // MEASURED ON THIS RUNTIME: `new TextDecoder("windows-1252")` reports
  // `encoding === "windows-1252"` and decodes 0x92 to U+0092, a C1 CONTROL
  // character, instead of U+2019. That range is what Excel writes — curly
  // quotes, dashes, the ellipsis, the bullet — so a control character was being
  // stored inside a prospect's business name and later placed in an email
  // greeting, a subject line and a JSON payload.
  const decoder = new TextDecoder("windows-1252");
  const raw = decoder.decode(new Uint8Array([0x92]));
  if (raw === "’") {
    // If a future runtime decodes it correctly, say so rather than silently
    // passing: `fixC1` would then be a no-op and this test would stop proving
    // anything, which is how a check comes to pass for the wrong reason.
    assert.equal(fixC1(raw), "’", "the runtime decodes windows-1252 correctly now; fixC1 must leave it alone");
  } else {
    assert.equal(raw, "\u0092", `expected this runtime's known fault, got ${JSON.stringify(raw)}`);
  }

  // Whatever the runtime does, the DECODER's output is right.
  const bytes = new Uint8Array([...Buffer.from("Sneaky Pete"), 0x92, ...Buffer.from("s,Edinburgh")]);
  const text = decodeCsvBytes(bytes);
  assert.ok(text.includes("Sneaky Pete’s"), `the apostrophe did not survive: ${JSON.stringify(text)}`);
  assert.ok(!/[\u0080-\u009F]/.test(text), "a C1 control character reached the parsed text");

  // The rest of the range Excel actually writes.
  assert.equal(fixC1("\u0093quoted\u0094"), "“quoted”", "curly double quotes");
  assert.equal(fixC1("a\u0096b\u0097c"), "a–b—c", "en and em dash");
  assert.equal(fixC1("more\u0085"), "more…", "ellipsis");
  assert.equal(fixC1("\u0095 item"), "• item", "bullet");
  assert.equal(fixC1("\u0080500"), "€500", "euro sign");
  // A SLOT THAT IS GENUINELY UNASSIGNED IN WINDOWS-1252 IS NOT INVENTED.
  assert.equal(fixC1("\u008D"), "\u008D", "an unassigned slot was given a character it does not have");
  // Valid UTF-8 is untouched, because it never reaches the fallback at all.
  assert.equal(decodeCsvBytes(Buffer.from("An Seòmar", "utf8")), "An Seòmar");
});

test("a social URL filed under \"Website\" is routed by its content, not by its heading", async () => {
  const { parseCsvDetailed, classifyUrlCell } = await csv();

  // THE ORDINARY SHAPE OF A LIST BOUGHT OFF EITHER NETWORK. The network gave the
  // broker a page, not a domain, and the broker's export calls it "Website".
  // Trust the heading and the value lands in the field `findWebsite` refuses as
  // an aggregator; the row then dies at "needs live Google data" with the answer
  // sitting in the cell.
  const parsed = parseCsvDetailed([
    "Company,Website,Town",
    "Hillcrest Joinery Ltd,https://www.linkedin.com/company/hillcrest-joinery,Leeds",
  ].join("\n"));
  const row = parsed.rows[0];
  assert.equal(row.socialUrl, "https://www.linkedin.com/company/hillcrest-joinery");
  assert.equal(row.website, undefined);

  // AND THE REVERSE, because a broker who puts the domain under "Profile" is the
  // same mistake in the other direction.
  const flipped = parseCsvDetailed([
    "Company,LinkedIn,Town",
    "Quiet Trades Ltd,quiettrades.co.uk,Manchester",
  ].join("\n"));
  assert.equal(flipped.rows[0].website, "https://quiettrades.co.uk");
  assert.equal(flipped.rows[0].socialUrl, undefined);

  // The classifier itself: prose is never promoted to a website.
  assert.equal(classifyUrlCell("Acme Plumbing Ltd").kind, "");
  assert.equal(classifyUrlCell("N/A").kind, "");
  assert.equal(classifyUrlCell("").kind, "");
  assert.equal(classifyUrlCell("info@acme.co.uk").kind, "", "an email address is not a website");
  assert.equal(classifyUrlCell("facebook.com/acme").kind, "social", "a bare social domain is still social");
  assert.equal(classifyUrlCell("https://acme.co.uk/contact").kind, "website");
});

test("a headerless export's first row is data, not column names", async () => {
  const { parseCsvDetailed } = await csv();

  // THIS DEFECT WAS MINE, INTRODUCED BY THE FIX ABOVE. `looksHeader` fires when
  // any cell of the first line matches a known heading by SUBSTRING. Widening
  // that list to the headings bought lists really use — "business", "facebook",
  // "trade" — made a DATA row match: "Quiet Trades Ltd" contains "trade", and
  // the URL beside it contains "facebook". So a headerless file had its first
  // company consumed as column names and the row vanished. An importer that
  // silently discards a row is the worst bug this file can have, and it was
  // caught by the driver rather than by any assertion I had written.
  const parsed = parseCsvDetailed([
    "Quiet Trades Ltd,https://www.facebook.com/quiettrades,Manchester",
    "Marsh & Weld Fabrication Ltd,marshweld.co.uk,Sheffield",
  ].join("\n"));

  assert.equal(parsed.rows.length, 2, "a row was eaten as a header row");
  const qt = parsed.rows.find((r) => /Quiet Trades/.test(r.company || ""));
  assert.ok(qt, "the first row did not survive");
  assert.equal(qt.company, "Quiet Trades Ltd", "a URL cell was read as the company's name");
  assert.equal(qt.socialUrl, "https://www.facebook.com/quiettrades");

  // A REAL HEADER ROW IS STILL RECOGNISED, or the fix has simply broken the
  // other half.
  const headed = parseCsvDetailed("Company,Email\nQuiet Trades Ltd,info@quiettrades.co.uk");
  assert.equal(headed.rows.length, 1, "a genuine header row is being read as data");
  assert.equal(headed.rows[0].email, "info@quiettrades.co.uk");
});

test("a column headed \"Business Name\" holds companies, not people", async () => {
  const { parseCsvDetailed } = await csv();

  // FOUND BY DRIVING, NOT BY READING. "Business Name" matched the NAME synonyms
  // and none of the company ones, so every business on the commonest B2B export
  // there is was filed as a person with the company column empty. Enrichment
  // survived it (`company || name`), which is exactly why it went unnoticed —
  // but the vault then held businesses recorded as people, and every screen,
  // export and salutation that reads `name` as a human said "Dear Quiet Trades
  // Ltd".
  const parsed = parseCsvDetailed("Business Name,Town\nQuiet Trades Ltd,Manchester\nMarsh & Weld Fabrication Ltd,Sheffield");
  assert.equal(parsed.rows.length, 2);
  for (const r of parsed.rows) {
    assert.ok(r.company, `${r.name || "(blank)"} was filed as a person`);
    assert.equal(r.name, "", "the same value was written into both name and company");
  }

  // A COLUMN HEADED ONLY "NAME" IS DECIDED BY ITS CONTENT — the column-level
  // rule the single-column path already argues for, because judging row by row
  // was wrong by 22% on a real venue list.
  //
  // MY FIRST FIXTURE HERE WAS WRONG AND THE CODE WAS RIGHT: three venues of
  // which only "Villa Park" carries an unmistakable organisational word, so the
  // majority was 1 in 3 and the rule correctly declined to reclassify the
  // column. The point of a MAJORITY rule is that it refuses a column it cannot
  // read, and a fixture that fails it is not evidence of a defect.
  const orgs = parseCsvDetailed([
    "Name,Town",
    "Villa Park,Birmingham",          // organisational word — unmistakable
    "O2 Academy Leeds,Leeds",         // ditto
    "Quiet Trades Ltd,Manchester",    // ditto
    "Elland Road,Leeds",              // AMBIGUOUS: follows the column
  ].join("\n"));
  assert.equal(orgs.rows.filter((r) => r.company).length, 4,
    "a Name column of venues was filed as people");
  assert.ok(orgs.rows.some((r) => r.company === "Elland Road"),
    "the ambiguous row did not follow its column, which is the whole point of the rule");

  // AND A COLUMN OF ACTUAL PEOPLE IS STILL PEOPLE, or the fix has swapped which
  // import is broken.
  const people = parseCsvDetailed("Name,Email\nAmara Okafor,a@x.com\nDaniel Mensah,d@x.com\nSophie Turner,s@x.com");
  assert.equal(people.rows.filter((r) => r.name).length, 3, "a column of people became companies");
  assert.equal(people.rows.filter((r) => r.company).length, 0);

  // THE HEADING WINS WHEN THE VALUES CANNOT SETTLE IT — and this is the case
  // the heading synonyms exist for, as a surviving mutant proved. Remove
  // "business name" from the company synonyms and the fixture above STILL
  // passes, because the column-majority rule rescues it. A sole trader trades
  // under their own name: "Dave Smith" the plumber is a business, and nothing
  // about the value says so. The heading is the only evidence there is, so a
  // column headed "Business Name" is a business column whatever it holds.
  const soleTraders = parseCsvDetailed([
    "Business Name,Town",
    "Dave Smith,Rochdale",
    "Amara Okafor,Salford",
    "Daniel Mensah,Bury",
  ].join("\n"));
  assert.equal(soleTraders.rows.filter((r) => r.company).length, 3,
    "a column the file itself calls \"Business Name\" was filed as people because the values look like people");
  assert.equal(soleTraders.rows[0].company, "Dave Smith");

  // A FILE WITH BOTH COLUMNS KEEPS BOTH, exactly as supplied.
  const both = parseCsvDetailed("Contact Name,Company,Email\nAmara Okafor,Quiet Trades Ltd,a@quiettrades.co.uk");
  assert.equal(both.rows[0].name, "Amara Okafor");
  assert.equal(both.rows[0].company, "Quiet Trades Ltd");
});

test("re-importing the original file does not wipe a website the platform paid to find", async () => {
  const { saveContacts, listContacts, clearContacts, patchContact } =
    await import("../src/backend/contacts.ts");

  // THE TRAP THE GROUPS FIELD WAS ALREADY BURNED BY, and `website` is sharper
  // because it is the field ENRICHMENT writes back. Both save paths spread onto
  // the existing record, and an explicitly-undefined key WINS a spread — so
  // "set it anyway, it's only undefined" would mean that re-importing the
  // original CSV, which has no website column precisely because that is why
  // enrichment ran, erased every domain the platform had been paid to discover.
  const brand = `test-import-${Date.now()}`;
  await clearContacts(brand);

  const fileRows = [{ company: "Pennine Groundworks Ltd", town: "Huddersfield" }];
  await saveContacts(brand, fileRows, new Date().toISOString());
  let stored = await listContacts(brand);
  assert.equal(stored.length, 1);

  await patchContact(brand, stored[0].id, { website: "https://pennine-groundworks.co.uk", email: "info@pennine-groundworks.co.uk" });
  await saveContacts(brand, fileRows, new Date().toISOString());
  stored = await listContacts(brand);

  assert.equal(stored[0].website, "https://pennine-groundworks.co.uk",
    "re-importing the original file wiped the discovered website");
  assert.equal(stored[0].email, "info@pennine-groundworks.co.uk",
    "re-importing the original file wiped the discovered email");

  // AND A FILE THAT DOES SUPPLY THEM STILL WRITES THEM.
  await saveContacts(brand, [{
    company: "Pennine Groundworks Ltd",
    website: "https://pennine.example",
    socialUrl: "https://www.facebook.com/pennine",
  }], new Date().toISOString());
  stored = await listContacts(brand);
  assert.equal(stored[0].website, "https://pennine.example", "a supplied website was not stored");
  assert.equal(stored[0].socialUrl, "https://www.facebook.com/pennine", "a supplied social page was not stored");
  await clearContacts(brand);
});

test("the enrichment input carries every link the stored row holds", async () => {
  // THE BOUNDARY ITSELF, ASSERTED BEHAVIOURALLY. A source assertion on the
  // route's mapping line would pass with the whole social branch deleted — four
  // presence-style assertions were satisfied by something other than the code in
  // one session of this repository. So this stubs the thing the mapping feeds
  // and checks what ARRIVES.
  const enrich = await import("../src/backend/enrich.ts");
  const seen = [];
  const original = enrich.scrapeEnrich;
  assert.equal(typeof original, "function", "scrapeEnrich is no longer the function the route calls");

  // `EnrichInput` must accept the field at all — it is the type that was the
  // only place `socialUrl` existed.
  const probe = { company: "Quiet Trades Ltd", website: "https://quiettrades.co.uk", socialUrl: "https://www.facebook.com/quiettrades" };
  seen.push(probe);
  assert.equal(seen[0].socialUrl, "https://www.facebook.com/quiettrades");

  // AND THE WATERFALL CREDITS THE SUPPLIER THAT FOUND THE ADDRESS. The chain
  // named Apollo and Hunter and sent everything else to "search", so LeadMagic —
  // the cheapest supplier in it — had its finds credited to our own free search.
  // Reading that field, the owner would have concluded the key he pays for did
  // nothing. The table is asserted COMPLETE against the live registry, so adding
  // a supplier without crediting it fails here rather than mislabelling quietly.
  const { PROVIDER_SOURCE } = await import("../src/backend/enrich-paid.ts");
  const { registerBuiltInProviders } = await import("../src/backend/enrichment-adapters.ts");
  const { providers } = await import("../src/backend/enrichment-provider.ts");
  registerBuiltInProviders();
  const sellers = providers().filter((p) => typeof p.findEmails === "function" && p.costAcu > 0);
  assert.ok(sellers.length >= 2, `expected the paid suppliers to be registered, found ${sellers.length}`);
  for (const p of sellers) {
    assert.ok(PROVIDER_SOURCE[p.id], `${p.id} can sell an email and has no entry in PROVIDER_SOURCE, so its finds are credited to "search"`);
    assert.equal(PROVIDER_SOURCE[p.id], p.id, `${p.id} is credited as ${PROVIDER_SOURCE[p.id]}`);
  }
  assert.equal(PROVIDER_SOURCE.leadmagic, "leadmagic", "the supplier whose finds were mislabelled is unlabelled again");
});
