import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// RENDERED, NOT READ. Three assertions in this file used to match the source
// text — and passed against `translate="no"` and `dir="auto"` sitting in the
// COMMENTS that explain them, while the attributes themselves had been deleted.
// A mutation sweep caught all three at once. The components are rendered now,
// so what is asserted is what a browser would actually receive.
globalThis.React = React;
const render = (el) => renderToStaticMarkup(el);

// EVERYTHING CAN BE TRANSLATED — AND THE THINGS THAT MUST NOT BE, ARE NOT.
//
// Those are one requirement, not two. A page that cannot be translated fails
// the first half; a page whose translation corrupts a DNS record or a key name
// fails the second, and fails it silently, because the reader cannot tell that
// what they are looking at is no longer what the machine needs.
//
// THE CASE THAT MADE THIS NECESSARY: the Sending Domains screen prints the
// records a customer publishes to authenticate their mail.
//
//     v=spf1 include:_spf.example.com ~all
//     v=DMARC1; p=none; rua=mailto:dmarc@example.com
//
// `include`, `all` and `none` are ordinary English words. A translated record
// pasted into a DNS panel is an email domain that quietly fails authentication,
// found weeks later as mail in spam, by somebody who followed the instructions
// exactly as they were shown.


/**
 * Where an expression is RENDERED, not merely mentioned.
 *
 * `indexOf("{e.name}")` finds `key={e.name}` on a wrapper div — an attribute,
 * not a render — and then reports a correctly protected value as unprotected.
 * That is the same instrument error that reported the Stripe webhook unbounded
 * by matching its import line. Content position is `>{expr}`; an attribute
 * never has a `>` immediately before the brace.
 */
function renderSites(src, expr) {
  const out = [];
  const needle = `>${expr}`;
  let at = src.indexOf(needle);
  while (at >= 0) { out.push(at + 1); at = src.indexOf(needle, at + 1); }
  return out;
}

/** The opening tag that encloses a render site. */
function enclosingTag(src, at) {
  return src.slice(src.lastIndexOf("<", at), at);
}

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const VERBATIM = read("src/components/Verbatim.tsx");

test("the marker sets BOTH halves, because one of them protects nothing", async () => {
  const Verbatim = (await import("../src/components/Verbatim.tsx")).default;
  const html = render(React.createElement(Verbatim, { as: "code", className: "flex-1 font-mono" }, "v=spf1 include:_spf.x.com ~all"));
  // `translate="no"` is the HTML standard the browsers honour; `notranslate` is
  // Google Translate's own convention, read by the widget and other tools.
  assert.match(html, /translate="no"/);
  assert.match(html, /class="notranslate [^"]*"/);
  // The call site's own classes survive the merge.
  assert.match(html, /flex-1 font-mono/);
  // Pinned left-to-right: inside an Arabic paragraph the bidirectional
  // algorithm reorders punctuation, turning a working record into one that
  // still looks plausible and no longer works.
  assert.match(html, /dir="ltr"/);
  assert.match(html, />v=spf1 include:_spf\.x\.com ~all</, "and the value itself is untouched");
});

test("the marker's source states both halves too", () => {
  // `translate="no"` is the HTML standard and is what the browsers honour. The
  // `notranslate` class is Google Translate's own convention, read by the
  // Translate widget and several other tools. Setting one and not the other
  // protects the value from some translators and not others — which is the
  // worst outcome, because it looks protected.
  assert.match(VERBATIM, /translate: "no"/);
  assert.match(VERBATIM, /className: "notranslate"/);
  // And a value is pinned left-to-right: inside an Arabic paragraph the
  // bidirectional algorithm reorders punctuation, turning a working record
  // into one that still looks plausible.
  assert.match(VERBATIM, /dir="ltr"/);
  // The merge must not drop a call site's own classes.
  assert.match(VERBATIM, /`notranslate \$\{className\}`/);
});

test("A DNS RECORD IS NEVER TRANSLATED — the case this exists for", () => {
  const page = read("src/app/dashboard/sending-domains/page.tsx");
  // Every field a customer copies into their DNS panel.
  for (const field of ["{r.type}", "{r.host}", "{r.priority}", "{r.value}"]) {
    const sites = renderSites(page, field);
    assert.ok(sites.length > 0, `${field} is no longer rendered — if that is deliberate, remove it from this list`);
    for (const at of sites) {
      assert.match(enclosingTag(page, at), /<Verbatim/,
        `${field} is rendered unprotected: a translated DNS record breaks a customer's mail authentication`);
    }
  }
  // No bare <code> left holding a record value.
  assert.doesNotMatch(page, /<code className="flex-1 truncate[^>]*>\{r\./,
    "a record value is still in a plain <code>, which translators will rewrite");
});

test("A KEY NAME IS NEVER TRANSLATED EITHER", () => {
  const keys = read("src/components/AdminKeys.tsx");
  for (const field of ["{e.name}", "{e.fingerprint}"]) {
    const sites = renderSites(keys, field);
    assert.ok(sites.length > 0, `${field} is no longer rendered`);
    for (const at of sites) {
      assert.match(enclosingTag(keys, at), /<Verbatim/,
        `${field} is unprotected — an owner copying a translated variable name sets a variable this platform never reads`);
    }
  }
});

test("PROSE IS STILL TRANSLATED — the half that is easy to lose", () => {
  const page = read("src/app/dashboard/sending-domains/page.tsx");
  // The status word beside a domain belongs to the reader's language. Marking
  // the whole pill would have protected the value and silenced the sentence.
  const mapAt = page.indexOf("otherBrandDomains.map");
  assert.ok(mapAt > 0, "the other-brand pill is no longer rendered");
  const pill = page.slice(mapAt, mapAt + 900);
  assert.match(pill, /<Verbatim>\{d\.domain\}<\/Verbatim>/, "the domain is the value");
  assert.match(pill, /<span className="ml-1\.5 text-amber-200\/60">\{d\.status\}<\/span>/,
    "and the status beside it must stay translatable");

  // NOTHING WHOLESALE. A page, main or section marked untranslatable would pass
  // every other assertion here and defeat the entire purpose.
  for (const dir of ["src/components", "src/app"]) {
    for (const file of walk(dir)) {
      const src = read(file);
      for (const tag of ["<main", "<body", "<section", "<article", "<form"]) {
        const at = src.indexOf(`${tag} `);
        if (at < 0) continue;
        const open = src.slice(at, src.indexOf(">", at) + 1);
        assert.doesNotMatch(open, /translate="no"|notranslate/,
          `${file} marks a whole ${tag}> untranslatable, which defeats the point`);
      }
    }
  }
});

test("generated output lays itself out, in the one place that renders it", async () => {
  // `auto`, not a direction derived from the chosen locale: an Arabic-speaking
  // customer may ask for English copy for a UK campaign, and that block must
  // stay left-to-right. The browser infers it per block from the text itself.
  const { AgentMarkdown } = await import("../src/components/ui.tsx");
  const html = render(React.createElement(AgentMarkdown, { text: "Bonjour, voici le plan." }));
  assert.match(html, /^<div dir="auto"/, "every agent's output renders through here");
  assert.doesNotMatch(html, /dir="rtl"|dir="ltr"/, "a fixed direction would be wrong for half the content");
  // Arabic and English both pass through untouched — the direction is the
  // browser's inference, not ours.
  assert.match(render(React.createElement(AgentMarkdown, { text: "مرحبا" })), /dir="auto"/);
});

test("a language's own name is shown in that language, and never translated", () => {
  const sel = read("src/components/LanguageSelector.tsx");
  assert.match(sel, /lang=\{l\.code\}/, "so a screen reader uses the right voice per entry");
  assert.match(sel, /translate="no"/, '"Deutsch" rendered into "German" in a German interface is a list that stopped describing itself');
  // And it describes what it ACTUALLY controls. Asserting that an old phrase is
  // absent fired on the comment explaining why it went — the property is the
  // behaviour, which `device-language.test.mjs` holds where it lives.
  assert.match(sel, /x-mw-lang/, "the selector should say what carries the choice");
  assert.match(sel, /browser will offer to translate/, "and be honest that the chrome is translated by the browser");
});

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) {
    const p = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}
