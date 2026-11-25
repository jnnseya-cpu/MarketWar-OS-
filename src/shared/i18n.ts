// FRENCH IS THE PREMIER TRANSLATION. Owner directive.
//
// WHAT THAT MEANS HERE, STATED PRECISELY, because the word "translation" has
// been doing two jobs on this platform and only one of them was real.
//
//   • GENERATED content has been multilingual for a while and genuinely is:
//     the reader's language reaches every engine (§186), the brand states the
//     language it sells in (`writer-language.ts`), and a French merchant in
//     Kinshasa gets a French campaign email written as a French email rather
//     than translated out of an English one.
//   • THE INTERFACE ITSELF was never translated at all. The chrome is English
//     and the browser is invited to translate it (§187 made that safe by
//     protecting the values a translation must not touch). A machine
//     translation of our own product, improvised per reader, reviewed by
//     nobody.
//
// So "premier translation" is not a ranking between languages we already had.
// It is the first translation this platform OWNS: strings we wrote, that ship
// in the bundle, that a test can hold to a standard. French is that one, and
// for now it is the only one — which is what premier means.
//
// THREE DECISIONS, each of which a later locale inherits.
//
// 1. THE ENGLISH SOURCE TEXT IS THE KEY. There is no `nav.hubs` identifier
//    anywhere. The call site passes the English it would otherwise have
//    rendered, and gets French back when French exists. The consequences are
//    the whole reason:
//      — a missing translation renders correct English, never a raw key. The
//        classic i18n failure on a customer's screen is `nav.billing.title`,
//        and it is structurally impossible here.
//      — the key cannot drift from the string, because it IS the string.
//      — a reviewer reads the dictionary as a parallel text, English beside
//        French, with no indirection to resolve.
//    The cost is honest and bounded: one English string can only have one
//    French form. Where a word genuinely needs two (a noun and a verb reading
//    of the same label), the call site passes a qualified key — and no such
//    case exists in the navigation this covers.
//
// 2. THE DATA STAYS ENGLISH. `NAV` is untouched. It feeds the command bar's
//    search, and the search must keep matching what an English speaker types
//    even when the screen is in French — so translation happens at RENDER,
//    never in the source list. A French screen that could not be searched in
//    English would be a regression dressed as a feature.
//
// 3. `lang` IS SET FROM THE STRINGS, NOT FROM THE READER. §186 removed
//    `<html lang>` because declaring the document French over English text
//    silences the browser's translate offer and makes a screen reader
//    pronounce English with French rules. That reasoning is unchanged — and it
//    is also exactly what makes `lang="fr"` CORRECT on the one element that is
//    now genuinely French. So the attribute goes on the translated nav, per
//    element, and the document keeps declaring English for the English page
//    body it still has. The condition §186 named as the unlock has been met for
//    one element and no more, and the markup says so precisely.

import { primaryLanguage } from "@/shared/locale";
import { FR } from "@/shared/i18n-fr";

/** What the platform is written in. The source of every key in a dictionary. */
export const SOURCE_LANGUAGE = "en";

/** The premier translation — owner directive. */
export const PREMIER_TRANSLATION = "fr";

/**
 * The translations this platform owns, premier first.
 *
 * One entry. A second one is added here, with its dictionary, and every
 * consumer below picks it up without changing — which is the point of there
 * being a list rather than an `=== "fr"` in nine places.
 */
export const OWNED_TRANSLATIONS = [PREMIER_TRANSLATION] as const;

const DICTIONARIES: Record<string, Readonly<Record<string, string>>> = { fr: FR };

/**
 * The owned translation that serves this locale, or "" for none.
 *
 * REGION IS DELIBERATELY DISCARDED, and that is not a shortcut. `fr-FR`,
 * `fr-BE`, `fr-CA`, `fr-CH` and `fr-CD` are all served the French strings,
 * because the alternative is a Belgian or Congolese reader being handed
 * English on the grounds that their exact tag has no dictionary of its own.
 * This platform's francophone market is substantially African — Lingala sits
 * in the language list for that reason — and `fr-CD` is the common tag there.
 * Where a regional form genuinely differs enough to matter (Quebec's
 * terminology), that is a `fr-CA` dictionary layered on this one, and the
 * lookup below is already shaped for it.
 */
export function ownedTranslationFor(raw: unknown): string {
  const primary = primaryLanguage(raw);
  if (!primary) return "";
  return (OWNED_TRANSLATIONS as readonly string[]).includes(primary) ? primary : "";
}

/** Does this platform hold its own strings for this reader's language? */
export function isOwnedTranslation(raw: unknown): boolean {
  return ownedTranslationFor(raw) !== "";
}

/**
 * Where a language sorts when a list of them is shown to a person.
 *
 * -1  an ABSENT code. Not a language: the "not stated" placeholder a select
 *     puts first. Ranking it with the languages would bury "Not set — ask
 *     before writing" at the bottom of the list it heads.
 *  0  French. The directive, in one number.
 *  1  English. The source language, and the fallback, so it stays reachable
 *     immediately below the premier translation rather than alphabetically
 *     adrift among the rest.
 *  2  everything else, in the order its own list already had.
 */
export function localeRank(raw: unknown): number {
  const s = String(raw ?? "").trim();
  if (!s) return -1;
  const primary = primaryLanguage(s);
  if (primary === PREMIER_TRANSLATION) return 0;
  if (primary === SOURCE_LANGUAGE) return 1;
  return 2;
}

/**
 * A language list, premier translation first.
 *
 * ONE function for every such list on the platform — the reader's picker and
 * the brand's writing language are both ordered by this, so they cannot come
 * to disagree about which language leads. Two lists hand-ordered the same way
 * is how one of them quietly stops matching the other.
 *
 * The sort is stable (ES2019 onward), so languages of equal rank keep the
 * order their own list chose. Ranking does not reorder within a rank, and the
 * input array is never mutated.
 */
export function rankLanguages<T>(items: readonly T[], codeOf: (item: T) => unknown): T[] {
  return [...items].sort((a, b) => localeRank(codeOf(a)) - localeRank(codeOf(b)));
}

/** `{name}` → the value supplied for it. Anything unsupplied is left alone. */
function fill(template: string, vars?: Readonly<Record<string, string | number>>): string {
  if (!vars) return template;
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (whole, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : whole
  );
}

/**
 * The string to render: French when we have it, the English given otherwise.
 *
 * `Object.hasOwn` RATHER THAN `dict[english]`, and this is a real defect and
 * not a precaution: every object inherits `constructor`, `toString` and
 * `valueOf`, so a plain property read of a dictionary for the label
 * "constructor" returns a FUNCTION, and `String(fn)` puts JavaScript source on
 * a customer's screen. The same shape of fault as the `__proto__` case in the
 * growth-brief store. An own-property check is the only lookup that answers
 * the question actually being asked.
 *
 * An entry equal to its key is a DECISION, not a gap: "Acquisition" and
 * "Conversion" are those words in French too, and the dictionary says so
 * explicitly rather than leaving a reader of it to wonder whether they were
 * forgotten.
 */
export function t(
  locale: unknown,
  english: string,
  vars?: Readonly<Record<string, string | number>>
): string {
  const code = ownedTranslationFor(locale);
  // No owned translation: the English given, with its variables filled.
  if (!code) return translateWith({}, english, vars);
  return translateWith(DICTIONARIES[code] ?? {}, english, vars);
}

/**
 * The lookup itself, against a dictionary handed in.
 *
 * SEPARATE FROM `t` SO THE DANGEROUS DICTIONARY CAN BE DRIVEN DIRECTLY. A
 * blank entry, an entry that is not a string, an inherited one — those are the
 * cases that put a function body or an empty label on a customer's screen, and
 * none of them can be reached through `t` without shipping a broken dictionary
 * to prove it. The pattern this repository keeps arriving at: extract the pure
 * function, then test the input that matters.
 *
 * TWO GUARDS, AND THEY DO DIFFERENT JOBS — worth stating, because a mutation
 * sweep showed that each one alone made the other look untested:
 *
 *   • `Object.hasOwn` confines the lookup to the dictionary's OWN keys. Every
 *     object inherits `constructor`, `toString` and `valueOf`, so `source in
 *     dict` answers yes for a label of "constructor". It also fixes how a
 *     second dictionary layers on this one: by own keys (`{...FR, ...FR_CA}`),
 *     never by prototype, because a prototype's entries are deliberately
 *     invisible here.
 *   • The `typeof` guard is what makes a non-string harmless if it is ever
 *     reached — including the inherited FUNCTION that a loosened check would
 *     return, which `String(fn)` would print as JavaScript source.
 */
export function translateWith(
  dict: Readonly<Record<string, unknown>>,
  english: string,
  vars?: Readonly<Record<string, string | number>>
): string {
  const source = String(english ?? "");
  if (!dict || !Object.hasOwn(dict, source)) return fill(source, vars);

  const translated = dict[source];
  // A blank or non-string entry is a broken dictionary, not an instruction to
  // render nothing. English is always better than an empty label.
  if (typeof translated !== "string" || translated.trim() === "") return fill(source, vars);
  return fill(translated, vars);
}

/**
 * The `lang` for an element whose text came out of a dictionary.
 *
 * `undefined` — not `"en"` — when there is no owned translation, because React
 * omits an undefined attribute entirely, and an element that inherits the
 * document's language is telling the truth without repeating it.
 */
export function langFor(locale: unknown): string | undefined {
  return ownedTranslationFor(locale) || undefined;
}

/**
 * What is actually translated, counted rather than claimed.
 *
 * Exists because "the platform is available in French" is the kind of sentence
 * that survives in a README long after it stopped being true. A number that is
 * computed from the dictionary at the moment it is asked for cannot.
 */
export function translationCoverage(locale: unknown = PREMIER_TRANSLATION): {
  locale: string;
  strings: number;
  /** Entries whose French is identical to the English, which is sometimes correct. */
  identical: number;
} {
  const code = ownedTranslationFor(locale);
  const dict = code ? DICTIONARIES[code] : undefined;
  if (!dict) return { locale: "", strings: 0, identical: 0 };
  const keys = Object.keys(dict);
  return {
    locale: code,
    strings: keys.length,
    identical: keys.filter((k) => dict[k] === k).length,
  };
}

/**
 * Every English string this dictionary answers for — for a coverage test.
 *
 * Exported so a test can assert that the navigation is covered COMPLETELY,
 * from `NAV` itself rather than from a hand-kept list that would silently stop
 * matching it. The day somebody adds a screen without French, that test fails
 * and names the label.
 */
export function translatedKeys(locale: unknown = PREMIER_TRANSLATION): string[] {
  const code = ownedTranslationFor(locale);
  const dict = code ? DICTIONARIES[code] : undefined;
  return dict ? Object.keys(dict) : [];
}
