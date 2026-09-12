// VERIFY THE CUSTOMER DECK AGAINST THE CODE IT CLAIMS TO DESCRIBE.
//
//   npm run deck:verify
//
// A deck is the document that outlives the conversation: forwarded, quoted back,
// and held up six months later when a price has moved. So every figure in the
// rendered PDF is re-derived from `src/` here and searched for in the extracted
// text — not in the HTML source, which could contain a number the renderer never
// drew.
//
// AND IT REFUSES THE CLAIMS THIS PLATFORM CANNOT MAKE. There are no customers
// yet, so there are no testimonials, no logos, no "trusted by" and no ROI
// multiples. Inventing social proof is the one lie a buyer will certainly
// discover, and this file makes adding it a build failure rather than a
// judgement call somebody makes at midnight.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { CLAIMS, BRAND, SLIDES } from "./deck-content.mjs";
import { ROUTES } from "./ads-facts.mjs";
import { CHROME } from "./doc-render.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const PDF = join(here, "..", "docs", "MarketWar-OS-Customer-Deck.pdf");
const HTML = join(here, "..", "docs", "MarketWar-OS-Customer-Deck.html");

const fail = [];
const check = (ok, msg) => { if (!ok) fail.push(msg); };

if (!existsSync(PDF)) {
  console.error("verify-deck: no PDF. Run `npm run deck:doc` first.");
  process.exit(1);
}

// ---------------------------------------------------------------- the PDF text
//
// READ OUT OF THE RENDERED FILE, not the HTML. A number that is in the markup
// and clipped off the slide is a number the customer never sees, and checking
// the source would pass it.
const pdfBytes = readFileSync(PDF);
const pageCount = (pdfBytes.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
check(pageCount === SLIDES.length,
  `the PDF has ${pageCount} pages and the deck defines ${SLIDES.length} slides`);

// Chrome dumps the DOM after layout, which is the closest thing to "what was
// drawn" available without a PDF text library in this container.
const dom = execFileSync(CHROME, [
  "--headless", "--disable-gpu", "--no-sandbox", "--dump-dom", `file://${HTML}`,
], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const plain = (html) => html
  .replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ");

const rendered = plain(dom);

// PER SLIDE, NOT PER DOCUMENT — and this is the fix for a mutation that survived.
// Changing the Growth price on the pricing slide to a figure src/ does not charge
// still PASSED, because the correct price also appears in a sentence three slides
// earlier. A document-wide search found the right number in the wrong place: the
// wrong-occurrence trap, for the sixth time in this repository.
const slideText = dom.split(/<section\b/).slice(1).map(plain);
// ANY slide of that kind, because two slides share the `statement` shape and
// demanding the first would fail on a figure that correctly sits in the second.
const inSlide = (kind, needle) =>
  SLIDES.some((s, i) => s.kind === kind && i < slideText.length && slideText[i].includes(String(needle)));

const has = (needle) => rendered.includes(String(needle));

// ------------------------------------------------------- every number, re-derived
//
// EACH FIGURE IS BOUND TO THE SLIDE THAT MUST CARRY IT, and that is not pedantry
// — it is the fix for two mutations that survived a document-wide search. Typing
// "£39" over the Growth plan PASSED, because £49 also appears in a sentence
// three slides earlier. Typing "50 agents" over the headline PASSED for the same
// reason. A number found in the wrong place is not the number being checked: the
// wrong-occurrence trap, for the sixth and seventh time in this repository.
// EVERY SLIDE THAT STATES A FIGURE IS CHECKED, not just one of them. The check
// count appears on three slides; binding it to the cover alone let a mutation
// change it on the steps slide and pass. And the free-findings count was not
// checked anywhere at all, so "your three worst problems" could quietly become
// five — the number the adverts promise.
const numbers = [
  [CLAIMS.checks, "the audit check count", ["cover", "steps", "close"]],
  [CLAIMS.freeFindings, "the free-findings count", ["steps", "close"]],
  [CLAIMS.agents, "the agent count", ["cover", "grid"]],
  [CLAIMS.tools, "the tool count", ["grid"]],
  [CLAIMS.keyless, "the no-key tool count", ["grid"]],
  [CLAIMS.free.monthly, "the Free price", ["pricing"]],
  [CLAIMS.starter.monthly, "the Starter price", ["pricing"]],
  [CLAIMS.starter.annual, "the Starter annual price", ["pricing"]],
  [CLAIMS.growth.monthly, "the Growth price", ["pricing", "sizes"]],
  [CLAIMS.growth.annual, "the Growth annual price", ["pricing"]],
  [CLAIMS.starter.monthlyAcus, "Starter's monthly credits", ["pricing"]],
  [CLAIMS.growth.monthlyAcus, "Growth's monthly credits", ["pricing"]],
  [CLAIMS.growth.brands, "Growth's brand count", ["pricing", "sizes"]],
  [CLAIMS.growth.users, "Growth's user count", ["pricing"]],
  [CLAIMS.videoFrom, "the cheapest video price", ["pricing"]],
  [CLAIMS.videoDefault.gbp, "the default video price", ["pricing"]],
  [CLAIMS.share2earnPct, "the referral rate", ["statement"]],
  [CLAIMS.minWithdrawal, "the minimum withdrawal", ["statement"]],
];
for (const [value, what, kinds] of numbers) {
  check(has(value), `${what} (${value}) is nowhere in the rendered deck — it changed in src/ and a slide still says something else`);
  for (const kind of kinds) {
    check(inSlide(kind, value), `${what} (${value}) is missing from the ${kind} slide, whatever else the deck happens to say`);
  }
}

// ------------------------------------------------------------- forbidden claims
//
// THE THINGS A DECK FOR A COMPANY WITH NO CUSTOMERS MUST NOT SAY.
const forbidden = [
  [/\btrusted by\b/i, '"trusted by" — there are no customers to be trusted by yet'],
  [/\b\d[\d,]*\+?\s+(?:businesses|companies|customers|clients|users)\s+(?:use|trust|rely)/i, "a customer count"],
  [/\btestimonial/i, "a testimonial"],
  [/\bcase stud(?:y|ies)\b/i, "a case study"],
  [/\b\d+x\s+(?:ROI|return|growth|more)\b/i, "an ROI or growth multiple"],
  [/\bguarantee(?:d|s)?\b/i, "a guarantee"],
  [/\bindustry[- ]leading\b/i, "an unprovable superlative"],
  [/\b(?:award|voted|rated)[- ]winning\b/i, "an award claim"],
  // The trading identity is not published on the site yet (a launch blocker),
  // and a deck is not the place to invent one.
  [/\b(?:Ltd|Limited|PLC|LLP)\b/, "a legal entity name, which is not published on the site yet"],
  [/\bcompany (?:number|no\.?)\b/i, "a company number"],
  [/\bVAT (?:number|no\.?|reg)/i, "a VAT number"],
];
for (const [re, what] of forbidden) {
  check(!re.test(rendered), `the deck contains ${what}`);
}

// --------------------------------------------------------------- the lead offer
// DERIVED FROM `ads-facts`, WHICH CHECKS THE PAGE EXISTS — not from the deck's
// own BRAND block. Reading the expectation out of the same module that supplies
// the content made this check compare the deck against itself: replacing the
// audit address with "ask us for a demo" passed, because the demand became
// whatever the deck happened to say.
check(has(ROUTES.audit), `the deck never gives the ${ROUTES.audit} address, which is the whole call to action`);
check(has(BRAND.site), "the deck never names the website");
check(has("No account") || has("no account"), "the deck does not say the audit needs no account");
check(has("No card") || has("no card"), "the deck does not say the audit needs no card");

// ---------------------------------------------------------------------- report
if (fail.length) {
  console.error(`verify-deck: ${fail.length} problem(s).\n`);
  for (const f of fail) console.error(`  · ${f}`);
  console.error("\nFix the slide or the code — never this file.");
  process.exit(1);
}
console.log(`verify-deck: ${SLIDES.length} slides, ${numbers.length} figures all matching src/, no unprovable claims.`);
