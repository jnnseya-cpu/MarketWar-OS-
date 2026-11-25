import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// THE PLATFORM FOLLOWS THE DEVICE'S LANGUAGE.
//
// All three parts existed and none of them were joined up: the context detected
// `navigator.language`, the header `x-mw-lang` could carry it, and the gateway
// turned it into AI output in that language. But `authedFetch` read a stored
// OVERRIDE only — written by nothing except the manual picker — the gateway
// ignored `Accept-Language` entirely, and `<html lang>` was hard-coded English
// on every page outside the dashboard. A French device that never found the
// selector got English everywhere, from a platform that knew it was French.

const loc = await import("../src/shared/locale.ts");
const gw = await import("../src/backend/gateway.ts");

const req = (headers) => ({ headers: { get: (n) => headers[n.toLowerCase()] ?? null } });

test("a device language is honoured with NO action from the person", () => {
  // The headline behaviour. No stored choice, no picker, no JavaScript on the
  // client — just the header every browser sends from the OS language settings.
  assert.equal(gw.gatewayLangFrom(req({ "accept-language": "fr-FR,fr;q=0.9,en;q=0.8" })), "French");
  assert.equal(gw.gatewayLangFrom(req({ "accept-language": "es-ES" })), "Spanish");
  assert.equal(gw.gatewayLangFrom(req({ "accept-language": "sw" })), "Swahili");
  // English needs no instruction: the platform already writes in it, and
  // "write in English" is a wasted sentence on every single call.
  assert.equal(gw.gatewayLangFrom(req({ "accept-language": "en-GB,en;q=0.9" })), undefined);
  assert.equal(gw.gatewayLangFrom(req({})), undefined);
});

test("A DELIBERATE CHOICE OUTRANKS THE DEVICE, always", () => {
  // Somebody who picked English on a French laptop meant it — they may be the
  // English-speaking owner of a French-market business. A device language that
  // quietly overrode that is a setting that will not stay set.
  assert.equal(gw.gatewayLangFrom(req({ "x-mw-lang": "en", "accept-language": "fr-FR" })), undefined);
  assert.equal(gw.gatewayLangFrom(req({ "x-mw-lang": "de", "accept-language": "fr-FR" })), "German");
  // And the same rule, in the resolver both sides share.
  assert.equal(loc.effectiveLocale({ override: "en", device: ["fr-FR", "fr"] }), "en");
  assert.equal(loc.effectiveLocale({ override: null, device: ["fr-FR", "fr"] }), "fr-FR");
  assert.equal(loc.effectiveLocale({ override: "   ", device: ["pt-BR"] }), "pt-BR", "whitespace is not a choice");
  assert.equal(loc.effectiveLocale({}), "en", "something has to be served");
});

test("quality values decide, because that is what they are for", () => {
  // `en;q=0.5,fr;q=0.9` is a person who would rather read French. Taking the
  // first entry hands them English.
  assert.equal(loc.fromAcceptLanguage("en;q=0.5,fr;q=0.9"), "fr");
  assert.equal(loc.fromAcceptLanguage("de;q=0.2,fr;q=0.4,es;q=0.9"), "es");
  // A tie is broken by the order given, because that order is itself a ranking.
  assert.equal(loc.fromAcceptLanguage("fr,de"), "fr");
  assert.equal(loc.fromAcceptLanguage("fr;q=0.8,de;q=0.8"), "fr");
  // q=0 is "explicitly NOT this one" — the opposite of a preference.
  assert.equal(loc.fromAcceptLanguage("fr;q=0,de;q=0.1"), "de");
  // The case that actually DISTINGUISHES the rule: with nothing else on offer,
  // q=0 must leave no preference at all rather than selecting the thing the
  // reader explicitly refused.
  assert.equal(loc.fromAcceptLanguage("fr;q=0"), "");
  assert.equal(loc.fromAcceptLanguage("fr;q=0,de;q=0"), "");
  // `*` means "anything", which is the absence of a preference rather than a
  // language called "*".
  assert.equal(loc.fromAcceptLanguage("*"), "");
  assert.equal(loc.fromAcceptLanguage("*;q=0.9,fr;q=0.1"), "fr");
  // A malformed q is a missing q, not a preference of zero.
  assert.equal(loc.fromAcceptLanguage("fr;q=banana"), "fr");
  for (const junk of ["", "   ", null, undefined, ";;;", "q=1"]) {
    assert.equal(loc.fromAcceptLanguage(junk), "", `${JSON.stringify(junk)} is not a language`);
  }
});

test("a tag is normalised so two spellings of one preference are one preference", () => {
  assert.equal(loc.normaliseLocale("fr"), "fr");
  assert.equal(loc.normaliseLocale("FR-fr"), "fr-FR");
  assert.equal(loc.normaliseLocale("  pt-br  "), "pt-BR");
  assert.equal(loc.normaliseLocale("zh-Hans-CN"), "zh-Hans-CN");
  assert.equal(loc.primaryLanguage("fr-FR"), "fr");
  // Not a language tag.
  for (const junk of ["", "*", "e", "english please", "123", "<script>", null, undefined, {}, "fr_FR"]) {
    assert.equal(loc.normaliseLocale(junk), "", `${JSON.stringify(junk)} must not read as a language`);
  }
});

test("AN UNREADABLE TAG BECOMES NO INSTRUCTION, never a literal one", () => {
  // The context's own copy of this rule returned the raw code when `Intl` knew
  // no name for it, which turned an unreadable tag into an instruction to
  // "write in zz". The shared one returns "" and "" means the platform's own
  // language everywhere.
  assert.equal(loc.languageNameOf("zz"), "");
  assert.equal(loc.languageNameOf("qqq"), "");
  assert.equal(loc.languageNameOf("en-GB"), "", "English is the platform's own language");
  // `eng` IS ENGLISH TOO — the ISO 639-2 three-letter code, which some clients
  // send. Its primary subtag is "eng", not "en", so the fast path misses it and
  // only the name check catches it. Without this case the two English checks
  // look mutually redundant and a mutation sweep says so, while removing the
  // wrong one would put "write this in English" on every call from such a
  // client.
  assert.equal(loc.languageNameOf("eng"), "");
  // And a code Intl cannot name is not turned into an instruction either: it
  // echoes the input back, which "write this in cpe" would otherwise become.
  assert.equal(loc.languageNameOf("cpe"), "");
  assert.equal(loc.languageNameOf(""), "");
  assert.equal(loc.languageNameOf("fr-CA"), "French");
  assert.equal(gw.gatewayLangFrom(req({ "accept-language": "zz-ZZ" })), undefined);
});

test("EVERY PART OF THE CHAIN IS JOINED — the defect was the joins, not the parts", () => {
  // 1. The client sends the DEVICE language, not only a stored override.
  const client = readFileSync(new URL("../src/frontend/api-client.ts", import.meta.url), "utf8");
  assert.match(client, /effectiveLocale\(\{/, "authedFetch must resolve the device language, not read storage alone");
  assert.match(client, /navigator\.languages \?\? navigator\.language/);
  assert.doesNotMatch(client, /localStorage\.getItem\("mw\.locale\.v1"\)/,
    "the storage key must come from the shared module, or one copy drifts and silently finds nothing");

  // 2. The server reads the header every browser sends by itself.
  const gateway = readFileSync(new URL("../src/backend/gateway.ts", import.meta.url), "utf8");
  assert.match(gateway, /fromAcceptLanguage\(req\.headers\.get\("accept-language"\)\)/);

  // 3. `<html lang>` IS NOT SET FROM THE DEVICE, and that is the correct
  //    behaviour rather than a missing one. `lang` declares the language the
  //    content IS IN; the chrome here is English. Claiming `lang="fr"` over
  //    English text makes a screen reader pronounce English with French rules,
  //    and tells Chrome the page is already French so its offer to translate
  //    never appears — the line whose stated purpose was "so browser translate
  //    works" was the thing preventing it.
  const layout = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(layout, /documentElement\.lang/,
    "the root layout must not stamp a reader's preference onto the document's content language");
  assert.match(layout, /<html lang="en"/, "the chrome is English and must say so, which is what lets the browser offer to translate it");

  // 4. One resolver, so the three cannot disagree.
  const context = readFileSync(new URL("../src/frontend/locale-context.tsx", import.meta.url), "utf8");
  assert.match(context, /from "@\/shared\/locale"/);
  assert.doesNotMatch(context, /new Intl\.DisplayNames/, "the context's private near-copy of the naming rule is gone");

  // 5. THE CONTEXT MUST NOT STAMP THE DOCUMENT EITHER. This is where the
  //    defect actually lived, so asserting only about the root layout would
  //    guard the place it never was.
  assert.doesNotMatch(context, /documentElement\.lang\s*=/,
    "a reader's preference must not be written onto the document's content language");

  // 6. A DETECTED LANGUAGE IS NEVER PERSISTED AS A CHOICE. Writing it would
  //    freeze today's device setting as though the person had asked for it, and
  //    the platform would stop following the device from the first load on.
  const writes = [...context.matchAll(/localStorage\.setItem\(/g)].length;
  assert.equal(writes, 1, "only the deliberate choice may be stored");
  const setter = context.slice(context.indexOf("const setLocale"), context.indexOf("const value"));
  assert.match(setter, /localStorage\.setItem\(/, "and that one write is in setLocale, not in the detection effect");
  assert.match(setter, /normaliseLocale\(code\)/, "what is stored is normalised, so one preference has one spelling");
});

test("nothing here can stop a request or a render", () => {
  // A language preference is the least important thing on any of these paths.
  for (const hostile of [
    { "accept-language": "\u0000\u0000" },
    { "accept-language": "a".repeat(5000) },
    { "x-mw-lang": "<script>alert(1)</script>", "accept-language": "fr" },
    { "x-mw-lang": "../../etc/passwd" },
  ]) {
    assert.doesNotThrow(() => gw.gatewayLangFrom(req(hostile)));
  }
  // An injected tag never becomes a language name, so it never reaches a prompt.
  assert.equal(gw.gatewayLangFrom(req({ "x-mw-lang": "<script>alert(1)</script>", "accept-language": "fr" })), "French",
    "a junk override falls through to the device rather than poisoning the instruction");
  // And a junk override never reaches a prompt as an instruction: it falls
  // through to the device rather than being passed along.
  assert.equal(gw.gatewayLangFrom(req({ "x-mw-lang": "../../etc/passwd", "accept-language": "de" })), "German");
});
