import test from "node:test";
import assert from "node:assert/strict";

// FRENCH IS THE PREMIER TRANSLATION — and "premier" has to mean something a
// test can hold, or it is a sentence in a README.
//
// It means three things here, and each of the groups below pins one of them:
//
//   1. It is the first translation this platform OWNS. Generated content has
//      been multilingual since §186; the INTERFACE was English with an
//      invitation to the browser to translate it. French is the one language
//      whose interface strings we wrote ourselves.
//   2. It LEADS every language list, from one ranking function, so the
//      directive cannot be half-applied — the reader's picker and the brand's
//      writing language order themselves the same way by construction.
//   3. It is COMPLETE over the surface it claims. The navigation is enumerated
//      from `NAV` itself rather than from a list kept by hand here, so the day
//      a screen is added without French, this file fails and names it.
//
// MODULES, NOT SOURCE TEXT. Everything below imports and calls. Three
// assertions in §187 passed against attributes that existed only in the
// comments explaining them, and that is the defect this repository keeps
// producing: an instrument that is wrong in the direction of reporting success.

const i18n = await import("../src/shared/i18n.ts");
const { FR } = await import("../src/shared/i18n-fr.ts");
const { NAV } = await import("../src/components/Sidebar.tsx");
const { LOCALES } = await import("../src/frontend/locale-context.tsx");
const { WRITER_LANGUAGES } = await import("../src/shared/writer-language.ts");

const NBSP = " ";

/** Every distinct string the navigation renders, from the navigation itself. */
function navStrings() {
  const out = new Set();
  for (const group of NAV) {
    out.add(group.group);
    for (const item of group.items) out.add(item.label);
  }
  return [...out];
}

// ---------------------------------------------------------------- 1. premier

test("French is the premier translation, and the only one this platform owns", () => {
  assert.equal(i18n.PREMIER_TRANSLATION, "fr");
  assert.equal(i18n.SOURCE_LANGUAGE, "en");
  // The claim is "premier", not "one of several". If a second owned
  // translation ever lands, this assertion is the place that makes somebody
  // decide — deliberately — whether French still leads.
  assert.deepEqual([...i18n.OWNED_TRANSLATIONS], ["fr"]);
  assert.equal(i18n.OWNED_TRANSLATIONS[0], i18n.PREMIER_TRANSLATION);

  assert.equal(i18n.isOwnedTranslation("fr"), true);
  // English is the SOURCE, not a translation. Nothing is looked up for it.
  assert.equal(i18n.isOwnedTranslation("en"), false);
  assert.equal(i18n.isOwnedTranslation("es"), false);
  assert.equal(i18n.isOwnedTranslation(""), false);
  assert.equal(i18n.isOwnedTranslation(null), false);
});

test("every French-speaking market is served French, not just France", () => {
  // THE MARKET THIS PLATFORM ACTUALLY SELLS TO. Its francophone customers are
  // substantially African — Lingala is in the language list for that reason —
  // and `fr-CD` is the tag a Kinshasa device sends. A dictionary keyed on the
  // exact tag would hand a Congolese or Belgian reader English on the grounds
  // that their region has no strings of its own.
  for (const tag of ["fr", "fr-FR", "fr-BE", "fr-CA", "fr-CH", "fr-CD", "FR-fr"]) {
    assert.equal(i18n.ownedTranslationFor(tag), "fr", tag);
    assert.equal(i18n.t(tag, "Sending Domains"), "Domaines d'envoi", tag);
  }
  // And a language that merely starts with the same letters is not French.
  assert.equal(i18n.ownedTranslationFor("fry"), "");
  assert.equal(i18n.t("fry", "Sending Domains"), "Sending Domains");
});

// ----------------------------------------------------------------- 2. it leads

test("French leads every language list, and from one function", () => {
  // The reader's own picker.
  assert.equal(LOCALES[0].code, "fr", "the picker must lead with French");
  assert.equal(LOCALES[1].code, "en", "English is the source language and stays reachable");

  // The brand's writing language. Same rule, different list — and the unset
  // placeholder keeps the top, because it is not a language.
  assert.equal(WRITER_LANGUAGES[0].code, "", "'Not set' heads the list it heads");
  assert.equal(WRITER_LANGUAGES[1].code, "fr", "French leads the languages");
  assert.equal(WRITER_LANGUAGES[2].code, "en");

  // ONE FUNCTION, so the two cannot drift apart. Ranking French first is the
  // function's job; ordering within a rank is not, and the languages after
  // English keep the order their own list chose.
  assert.deepEqual(
    LOCALES.slice(2).map((l) => l.code),
    ["es", "pt", "ar", "de", "it", "nl", "hi", "zh", "sw", "ln"],
    "a rank sort must be stable: nothing below English was reshuffled"
  );
  assert.deepEqual(
    WRITER_LANGUAGES.slice(3).map((l) => l.code),
    ["es", "pt", "ar", "sw", "de", "it", "nl"],
    "the writer list keeps its own order below English — a different one, and still its own"
  );

  // And the ranking is a function of the code alone, not of the list.
  assert.equal(i18n.localeRank("fr-CA"), 0);
  assert.equal(i18n.localeRank("en-GB"), 1);
  assert.equal(i18n.localeRank("sw"), 2);
  assert.equal(i18n.localeRank(""), -1, "an absent code is a placeholder, not a language");
  assert.ok(i18n.localeRank("fr") < i18n.localeRank("en"), "the directive, in one comparison");
  assert.ok(i18n.localeRank("") < i18n.localeRank("fr"), "the placeholder still outranks it");
});

test("ranking never mutates the list it was given", () => {
  const input = [{ code: "en" }, { code: "fr" }];
  const out = i18n.rankLanguages(input, (x) => x.code);
  assert.equal(input[0].code, "en", "the caller's array is untouched");
  assert.equal(out[0].code, "fr");
  assert.notEqual(out, input);
});

// -------------------------------------------------------------- 3. completeness

test("every navigation string the platform renders has French", () => {
  const keys = new Set(i18n.translatedKeys("fr"));
  const missing = navStrings().filter((s) => !keys.has(s));
  // THE DRIFT GATE. Enumerated from `NAV`, so adding a screen without a French
  // label fails here and names it, rather than shipping one English item in a
  // French menu that nobody notices for a quarter.
  assert.deepEqual(missing, [], `navigation strings with no French: ${missing.join(" | ")}`);
  assert.ok(navStrings().length >= 70, "the whole navigation, not a sample");
});

test("the French is real French and not English with French words", () => {
  // FRENCH TYPOGRAPHY. A no-break space precedes `:`, `%`, `?` and `!`. This
  // is the detail that distinguishes a translation somebody wrote from a
  // dictionary somebody ran, and its absence is the first thing a French
  // reader notices without being able to name the rule.
  const offenders = [];
  for (const [en, fr] of Object.entries(FR)) {
    for (const mark of [":", "%", "?", "!"]) {
      let at = fr.indexOf(mark);
      while (at >= 0) {
        // A mark inside a placeholder or a URL is punctuation, not prose.
        const before = fr[at - 1];
        if (at > 0 && before !== NBSP && !/[0-9A-Za-z]/.test(mark)) {
          if (!(mark === ":" && /[A-Za-z]/.test(fr[at + 1] ?? ""))) offenders.push(`${en} → ${fr}`);
        }
        at = fr.indexOf(mark, at + 1);
      }
    }
  }
  assert.deepEqual(offenders, [], `French punctuation needs a no-break space: ${offenders.join(" | ")}`);
  // Not vacuous: there ARE strings with those marks, so the loop above ran.
  assert.ok(
    Object.values(FR).filter((v) => /[:%?!]/.test(v)).length >= 3,
    "the rule is being applied to real strings, not to none"
  );
});

test("a product name is not a word, and survives translation whole", () => {
  // The §187 judgement applied to prose: a translation that renames the
  // product has not translated the sentence, it has broken the reference.
  // Place names and unit acronyms go the same way — a French marketer writes
  // SEO and ROI, and Birmingham is in Birmingham in every language.
  const NAMES = [
    "OMNIRANK", "SiteRaid", "VisualStrike", "LeadWar", "Sentinel",
    "MarketWar", "WhatsApp", "TikTok", "SEO", "ROI", "ACU", "Birmingham",
  ];
  const lost = [];
  for (const [en, fr] of Object.entries(FR)) {
    for (const name of NAMES) {
      if (en.includes(name) && !fr.includes(name)) lost.push(`${name}: ${en} → ${fr}`);
    }
  }
  assert.deepEqual(lost, [], `product and place names must survive: ${lost.join(" | ")}`);
  // Again, not vacuous.
  assert.ok(
    Object.keys(FR).filter((k) => NAMES.some((n) => k.includes(n))).length >= 8,
    "there are real names being checked"
  );
  // And "AI" is deliberately NOT on that list: the French for an AI engine is
  // a moteur IA, and preserving "AI" would be the mistake, not the rule.
  assert.equal(i18n.t("fr", "AI Engines"), "Moteurs IA");
});

test("a French string can never demand a variable the call site does not pass", () => {
  const placeholders = (s) => (s.match(/\{[A-Za-z][A-Za-z0-9_]*\}/g) ?? []).sort();
  const broken = [];
  for (const [en, fr] of Object.entries(FR)) {
    const offered = new Set(placeholders(en));
    for (const needed of placeholders(fr)) if (!offered.has(needed)) broken.push(`${needed} in: ${fr}`);
  }
  // A translation that introduces `{total}` where the English had `{acu}`
  // renders a brace on a customer's screen. The English is the contract.
  assert.deepEqual(broken, [], `placeholders not offered by the English: ${broken.join(" | ")}`);
  // A translation may legitimately use FEWER: French does not pluralise a unit
  // symbol, so its ACU line has no `{s}` — and that must still substitute.
  assert.equal(
    i18n.t("fr", "About {acu} ACU{s} · {pct}% match on your wording", { acu: 3, s: "s", pct: 72 }),
    `Environ 3 ACU · 72${NBSP}% de correspondance avec votre formulation`
  );
  assert.equal(
    i18n.t("en", "About {acu} ACU{s} · {pct}% match on your wording", { acu: 1, s: "", pct: 90 }),
    "About 1 ACU · 90% match on your wording"
  );
});

// --------------------------------------------------------------- 4. the fallback

test("a missing translation renders English — never a key, never nothing", () => {
  // THE CLASSIC i18n FAILURE, made structurally impossible: the English source
  // text IS the key, so there is no `nav.billing.title` that can reach a
  // screen. The worst case is a correct English label.
  assert.equal(i18n.t("fr", "A string nobody has translated yet"), "A string nobody has translated yet");
  assert.equal(i18n.t("es", "Sending Domains"), "Sending Domains");
  assert.equal(i18n.t("en", "Sending Domains"), "Sending Domains");
  assert.equal(i18n.t(null, "Sending Domains"), "Sending Domains");
  assert.equal(i18n.t("fr", ""), "");
});

test("an inherited property is not a translation", () => {
  // A PLAIN `dict[english]` LOOKUP IS A DEFECT, not a style choice. Every
  // object inherits `constructor`, `toString` and `valueOf`, so a label of
  // "constructor" read that way returns a FUNCTION and `String(fn)` puts
  // JavaScript source on a customer's screen. Same shape as the `__proto__`
  // case in the growth-brief store: an own-property check is the only lookup
  // that answers the question being asked.
  for (const inherited of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
    const out = i18n.t("fr", inherited);
    assert.equal(out, inherited, inherited);
    assert.equal(typeof out, "string", inherited);
  }

  // AND THE OWN-KEY CHECK IS WHAT DOES THAT, not the type guard standing
  // behind it. A mutation sweep made the distinction: swapping `Object.hasOwn`
  // for `source in dict` left the five labels above still correct, because
  // `Object.prototype` holds no STRING values and the type guard caught every
  // function. A dictionary with a string on its prototype is the case that
  // tells them apart, and it is also the decision this pins — a second locale
  // layers on this one by own keys (`{...FR, ...FR_CA}`), never by prototype,
  // and a prototype's entries are deliberately invisible to the lookup.
  const inheritedStrings = Object.create({ Billing: "inherited, and must not be used" });
  assert.equal(i18n.translateWith(inheritedStrings, "Billing"), "Billing");
  inheritedStrings.Billing = "Facturation";
  assert.equal(i18n.translateWith(inheritedStrings, "Billing"), "Facturation", "an own key is used");
});

test("a broken dictionary entry still renders a correct English label", () => {
  // DRIVEN DIRECTLY, because no shipped dictionary should contain any of
  // these and a test that waits for one to appear is a test that never runs.
  assert.equal(i18n.translateWith({ Billing: "" }, "Billing"), "Billing", "blank");
  assert.equal(i18n.translateWith({ Billing: "   " }, "Billing"), "Billing", "whitespace");
  assert.equal(i18n.translateWith({ Billing: 42 }, "Billing"), "Billing", "not a string");
  assert.equal(i18n.translateWith({ Billing: null }, "Billing"), "Billing", "null");
  // And a good entry is still returned, so the guard above is a guard and not
  // a switch that turned translation off.
  assert.equal(i18n.translateWith({ Billing: "Facturation" }, "Billing"), "Facturation");
  // Variables fill on every path, translated or not.
  assert.equal(i18n.translateWith({}, "{n} left", { n: 4 }), "4 left");
  assert.equal(i18n.translateWith({ "{n} left": "il reste {n}" }, "{n} left", { n: 4 }), "il reste 4");
  // An unsupplied placeholder is left literal rather than becoming the word
  // "undefined", so it is visible to a test instead of plausible on a screen.
  assert.equal(i18n.translateWith({}, "{n} left", { other: 1 }), "{n} left");
  assert.equal(i18n.translateWith({}, "{n} left"), "{n} left");
});

test("the lang attribute is offered only where the strings are really French", () => {
  // `undefined`, not "en": React omits an undefined attribute, and an element
  // that inherits the document's language tells the truth without repeating
  // it. §186 removed `<html lang>` because declaring the page French over
  // English text silences the browser's translate offer and makes a screen
  // reader pronounce English with French rules. That still holds for the page;
  // it does not hold for an element whose every string came out of FR.
  assert.equal(i18n.langFor("fr"), "fr");
  assert.equal(i18n.langFor("fr-CD"), "fr");
  assert.equal(i18n.langFor("en"), undefined);
  assert.equal(i18n.langFor("es"), undefined, "a language with no owned strings claims nothing");
  assert.equal(i18n.langFor(""), undefined);
});

test("coverage is counted, not claimed", () => {
  const c = i18n.translationCoverage("fr");
  assert.equal(c.locale, "fr");
  assert.equal(c.strings, Object.keys(FR).length);
  assert.ok(c.strings >= 90, `only ${c.strings} strings`);
  // An entry equal to its key is a DECISION — "Acquisition" and "Conversion"
  // are those words in French, and the dictionary says so rather than leaving
  // a reader to wonder whether they were forgotten.
  assert.ok(c.identical > 0 && c.identical < c.strings / 3, `identical: ${c.identical}`);
  assert.equal(i18n.t("fr", "Acquisition"), "Acquisition");
  assert.equal(i18n.t("fr", "Command"), "Commandement");
  // A language with no dictionary reports nothing rather than guessing.
  assert.deepEqual(i18n.translationCoverage("es"), { locale: "", strings: 0, identical: 0 });
  assert.deepEqual(i18n.translatedKeys("es"), []);
});

// ------------------------------------------------- 5. the numbers, not only words

test("a number is formatted in a locale this process CHOSE, never the ambient one", async () => {
  // THE DEFECT THIS PINS WAS FOUND BY DRIVING, NOT BY READING. The first
  // French browser ever pointed at this platform threw a React hydration
  // failure on the landing page's chart:
  //
  //     + 7,3   (client)
  //     - 7.3   (server)
  //
  // `(7.3).toLocaleString()` with no locale reads whatever locale the RUNTIME
  // has — en-US in Node, French in a French browser — so the two sides of the
  // same render disagreed and React discarded the server's entire tree. Every
  // chart label, on every page, for every locale whose decimal separator is
  // not a point: French, German, Spanish, Portuguese, Italian, Dutch, Arabic.
  const { formatNumber, formatMoney } = await import("../src/frontend/locale.ts");

  // An explicit locale means the ANSWER IS THE LOCALE'S, not the runtime's.
  assert.equal(formatNumber(7.3, { locale: "en" }), "7.3");
  assert.equal(formatNumber(7.3, { locale: "fr" }), "7,3", "and French gets French numerals");
  assert.notEqual(formatNumber(1234567, { locale: "fr" }), formatNumber(1234567, { locale: "en" }));

  // AND NOW THE PART A SOURCE-TEXT ASSERTION COULD NEVER SHOW: the same call,
  // in a process whose ambient locale IS French, must still answer in the
  // locale it was given. Driven in a child process, because the ambient locale
  // is fixed when the runtime starts.
  const { execFileSync } = await import("node:child_process");
  // An absolute URL, computed here. A relative specifier written inside this
  // string would be resolved against the CHILD's working directory — correct
  // at runtime and unresolvable to anything reading this file, which is how
  // `check:orphans` came to report a broken import that worked.
  const target = JSON.stringify(new URL("../src/frontend/locale.ts", import.meta.url).href);
  const script = `
    const { formatNumber } = await import(${target});
    console.log(JSON.stringify({
      ambient: (7.3).toLocaleString(),
      explicit: formatNumber(7.3, { locale: "en" }),
      french: formatNumber(7.3, { locale: "fr" }),
    }));
  `;
  const out = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, LC_ALL: "fr_FR.UTF-8", LANG: "fr_FR.UTF-8" },
    encoding: "utf8",
  });
  const got = JSON.parse(out.trim().split("\n").pop());
  // The trap, demonstrated rather than described: in this process the ambient
  // call really does answer differently.
  assert.equal(got.ambient, "7,3", "the ambient locale is genuinely French in that process");
  // The fix: the formatter is unmoved by it.
  assert.equal(got.explicit, "7.3", "an explicit locale survives a French runtime");
  assert.equal(got.french, "7,3");

  // Money goes the same way, and the currency follows the region rather than
  // the language: a Belgian and a Congolese reader both read French and do not
  // share a currency.
  assert.ok(formatMoney(1200, { locale: "fr-FR", currency: "EUR" }).includes("1"));
  assert.notEqual(
    formatMoney(1200, { locale: "fr-FR", currency: "EUR" }),
    formatMoney(1200, { locale: "en-GB", currency: "GBP" })
  );
});

test("the search index stays English while the screen turns French", () => {
  // THE REGRESSION THIS PREVENTS. `NAV` is the command bar's search index as
  // well as the sidebar's list. Translating it IN PLACE would have made the
  // French screen searchable only in French — and an English-speaking operator
  // on a French laptop could no longer find a screen by typing its English
  // name. So the data stays English and the translation happens at render.
  const labels = navStrings();
  assert.ok(labels.includes("Sending Domains"), "the index is still English");
  assert.ok(labels.includes("Command Center"));
  assert.equal(i18n.t("fr", "Sending Domains"), "Domaines d'envoi", "and the screen is French");
  // Which means both names reach a search: the English from the data, the
  // French from the dictionary.
  const needle = "sending";
  assert.ok(labels.some((l) => l.toLowerCase().includes(needle)));
  assert.ok(
    labels.map((l) => i18n.t("fr", l)).some((l) => l.toLowerCase().includes("domaines")),
    "the French name is reachable too"
  );
});
