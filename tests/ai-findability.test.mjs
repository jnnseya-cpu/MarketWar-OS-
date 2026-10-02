import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// GETTING FOUND ON CHATGPT AND AI SEARCH — the two halves.
//
// 1. ONE CRAWLER LIST. `shared/ai-readability.ts` knows ten crawlers by the token
//    they honour in robots.txt. `backend/geo-readiness.ts` — the PAID GEO report,
//    and the input `ai-citation.ts` builds its action playbook from — used to
//    carry its own list of six, missing **OAI-SearchBot, the crawler that builds
//    ChatGPT's search index**, plus ChatGPT-User, Bingbot (Copilot) and
//    Applebot-Extended. A customer whose robots.txt blocked OAI-SearchBot was
//    told by the paid report that "No AI crawler is blocked", on the single
//    question that decides whether they can appear in ChatGPT, while the free
//    audit on the same bytes caught it.
//
// 2. SERVE WHAT WE GENERATE. `seo-artifacts.ts` has always built per-brand JSON-LD
//    and llms.txt — as artifacts the customer pastes onto a site hosted somewhere
//    else. The pages MarketWar HOSTS at /b/{brandId}/{slug} carried a title and a
//    description and nothing else, so they failed our own report (structured data
//    weight 25, FAQ 20, llms.txt 15) on our own output.

const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ---------------------------------------------------------------------------
// 1. ONE LIST, ONE PARSER.
// ---------------------------------------------------------------------------

test("the crawler that decides ChatGPT-search visibility is checked", async () => {
  const { AI_CRAWLERS, blockedAiCrawlers } = await import("../src/shared/ai-readability.ts");

  // The four that were missing from the paid report, by the token robots.txt uses.
  for (const token of ["oai-searchbot", "chatgpt-user", "bingbot", "applebot-extended"]) {
    assert.ok(AI_CRAWLERS.some((c) => c.token === token), `${token} must be one of the crawlers checked`);
  }
  // Each must say what it feeds, or a report naming it is naming a word.
  for (const c of AI_CRAWLERS) {
    assert.ok(c.name && c.feeds && c.token === c.token.toLowerCase(),
      `${c.name} needs a lowercase token and a statement of what it feeds`);
  }

  // THE CASE THAT WAS WRONG. A site that blocks only ChatGPT's search crawler.
  const blocked = blockedAiCrawlers("User-agent: OAI-SearchBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n");
  assert.deepEqual(blocked.map((b) => b.name), ["OAI-SearchBot"]);
  assert.match(blocked[0].feeds, /ChatGPT search/);
});

test("geo-readiness has no crawler list or robots parser of its own", () => {
  const code = codeOf(readFileSync("src/backend/geo-readiness.ts", "utf8"));
  // Rule 6: one source of truth per concept. A second list is how six crawlers
  // came to masquerade as all of them.
  assert.doesNotMatch(code, /const AI_BOTS\s*=/, "a second crawler list is the defect this fixed");
  assert.doesNotMatch(code, /function robotsVerdict/, "a second robots parser is the other half of it");
  assert.match(code, /import \{ AI_CRAWLERS, blockedAiCrawlers \} from "@\/shared\/ai-readability"/);
  assert.match(code, /blockedAiCrawlers\(robots\.text\)/, "and it must actually be used");
});

test("the paid report states HOW MANY crawlers it checked, and what each feeds", () => {
  const code = codeOf(readFileSync("src/backend/geo-readiness.ts", "utf8"));
  // "No AI crawler is blocked" without a count is how a shortfall hides. The
  // evidence line now names the number and the names.
  assert.match(code, /None of the \$\{AI_CRAWLERS\.length\} AI crawlers is blocked/);
  assert.match(code, /AI_CRAWLERS\.map\(\(c\) => c\.name\)\.join\(", "\)/);
  // And a block must name what it costs, not just which token is listed.
  assert.match(code, /\$\{b\.name\} \(\$\{b\.feeds\}\)/);
  assert.match(code, /while blocked you cannot appear in \$\{blockedBots\.map\(\(b\) => b\.feeds\)/);
});

// ---------------------------------------------------------------------------
// 2. THE PAGES WE HOST.
// ---------------------------------------------------------------------------

const BRAND = {
  id: "acme",
  name: "Acme Bathrooms",
  website: "acme-bathrooms.co.uk",
  product: "bathroom fitting",
  audience: "homeowners",
  location: "Coventry",
  industry: "Bathroom installation",
  offer: "Free survey this month",
  goal: "",
};

const PAGE = {
  brandId: "acme",
  slug: "free-survey",
  live: true,
  publishedAt: "2026-09-01T09:00:00.000Z",
  headline: "Bathroom fitting in Coventry",
  subheadline: "A fixed quote in 24 hours, from fitters who turn up.",
  sections: [
    { type: "benefits", heading: "Why us", body: "", items: ["Fixed quotes", "DBS-checked fitters"] },
    {
      type: "faq", heading: "Questions", body: "",
      items: [
        "How much does it cost? — Ask for a quick, no-obligation price.",
        "Where do you cover? — Coventry and nearby.",
        "A question with no answer",
      ],
    },
  ],
};

test("a hosted page carries the business, the page and its questions", async () => {
  const { hostedPageGraph } = await import("../src/backend/hosted-schema.ts");
  const graph = hostedPageGraph({
    brand: BRAND, page: PAGE,
    pageUrl: "https://marketwaros.com/b/acme/free-survey",
    brandUrl: "https://marketwaros.com/b/acme",
  });
  assert.ok(graph);
  assert.equal(graph["@context"], "https://schema.org");
  const types = graph["@graph"].map((n) => n["@type"]);

  // A location was given, so the business is a LocalBusiness — which is the type
  // that can be recommended for "near me", the question this audience is asked about.
  assert.ok(types.includes("LocalBusiness"), `got ${types.join(", ")}`);
  assert.ok(types.includes("WebPage"));
  assert.ok(types.includes("FAQPage"), "the FAQ is the part assistants quote");
  // AND NO SECOND `WebSite`. The brand's own domain gets one in the artifact they
  // paste there; on a page we host, a WebSite node naming their domain claims this
  // page is part of that site, and the root layout already declares one for this
  // domain. Two with different ids on one URL is a contradiction.
  assert.ok(!types.includes("WebSite"),
    "a WebSite node for the brand's own domain must not appear on a page hosted on ours");

  // THE RELATIONSHIP, which is the point of a single graph: this page is
  // published BY that business. Two unlinked blocks do not say that.
  const page = graph["@graph"].find((n) => n["@type"] === "WebPage");
  const org = graph["@graph"].find((n) => n["@type"] === "LocalBusiness");
  assert.equal(org["@id"], "https://marketwaros.com/b/acme#organization");
  assert.deepEqual(page.publisher, { "@id": org["@id"] });
  assert.equal(page.url, "https://marketwaros.com/b/acme/free-survey");
  assert.equal(page.datePublished, "2026-09-01T09:00:00.000Z");

  // Inside a graph the context belongs to the wrapper, once.
  for (const node of graph["@graph"]) {
    assert.equal(node["@context"], undefined, `${node["@type"]} must not repeat @context inside a @graph`);
  }
});

test("the FAQ markup says exactly what the page shows — and nothing else", async () => {
  const { hostedPageGraph } = await import("../src/backend/hosted-schema.ts");
  const { splitFaqItem } = await import("../src/shared/faq-text.ts");
  const graph = hostedPageGraph({
    brand: BRAND, page: PAGE,
    pageUrl: "https://x/b/acme/free-survey", brandUrl: "https://x/b/acme",
  });
  const faq = graph["@graph"].find((n) => n["@type"] === "FAQPage");

  // Two pairs, not three: the third item has no answer, so it renders as a bare
  // heading and is NOT claimed as answered content. Schema.org requires an
  // acceptedAnswer, and a Question with an empty one is a prompt with nothing
  // behind it.
  assert.equal(faq.mainEntity.length, 2, "an unanswered question must not be claimed as answered");
  assert.deepEqual(faq.mainEntity.map((q) => q.name), ["How much does it cost?", "Where do you cover?"]);
  assert.equal(faq.mainEntity[1].acceptedAnswer.text, "Coventry and nearby.",
    "the separator dash is punctuation joining the halves, not part of the answer");

  // AND THE SAME SPLITTER THE ACCORDION USES. Google's FAQ policy treats markup
  // that does not match the visible content as a violation, and this codebase's
  // oldest defect class is a value derived differently on two sides of a boundary.
  for (const item of PAGE.sections[1].items) {
    const pair = splitFaqItem(item);
    if (!pair?.answer) continue;
    assert.ok(faq.mainEntity.some((q) => q.name === pair.question && q.acceptedAnswer.text === pair.answer),
      `the schema must carry exactly what the renderer shows for: ${item}`);
  }
});

test("the hosted page renders the FAQ through the shared splitter, not a copy", () => {
  const code = codeOf(readFileSync("src/app/b/[brandId]/[slug]/page.tsx", "utf8"));
  assert.match(code, /const pair = splitFaqItem\(it\);/,
    "a second split in the renderer is how the markup starts describing a different page");
  assert.doesNotMatch(code, /it\.split\(\/\\s\*\[\?\]\\s\*\//,
    "the inline split this replaced");
  // Server-rendered, because most assistant crawlers do not run scripts — which
  // is the whole reason this is markup in the HTML and not an injected tag.
  assert.match(code, /type="application\/ld\+json"/);
  assert.match(code, /alternates: \{ canonical \}/, "one address to cite");
});

test("nothing is invented — no price, rating, review or availability", async () => {
  const { hostedPageJsonLd } = await import("../src/backend/hosted-schema.ts");
  const json = hostedPageJsonLd({
    brand: BRAND, page: PAGE, pageUrl: "https://x/b/acme/p", brandUrl: "https://x/b/acme",
  });
  // schema.org will carry all four happily, and a fabricated one is a lie a
  // machine then repeats. The brand fixture supplies none of them.
  for (const forbidden of ["aggregateRating", "ratingValue", "reviewCount", "priceCurrency", "price", "availability", "review"]) {
    assert.ok(!json.includes(`"${forbidden}"`), `${forbidden} appeared without a real value behind it`);
  }
  // `<` is escaped, or a `</script>` inside a string closes the tag early and
  // spills the rest of the graph into the document as text.
  assert.ok(!json.includes("<"), "the JSON must carry no raw < at all");
  const hostile = hostedPageJsonLd({
    brand: { ...BRAND, name: 'Acme</script><script>alert(1)</script>' },
    page: PAGE, pageUrl: "https://x/b/acme/p", brandUrl: "https://x/b/acme",
  });
  assert.ok(!hostile.includes("</script>"), "a brand name cannot be allowed to close the tag");
  assert.ok(JSON.parse(hostile.replace(/\\u003c/g, "<")), "and it is still valid JSON");
});

test("a page with no brand still describes itself", async () => {
  // The brand read can fail — the customer is paying for the page, not for the
  // markup — and a page that then emits nothing is worse than one that describes
  // itself without naming its publisher.
  const { hostedPageGraph } = await import("../src/backend/hosted-schema.ts");
  const graph = hostedPageGraph({ brand: null, page: PAGE, pageUrl: "https://x/b/a/p", brandUrl: "https://x/b/a" });
  const types = graph["@graph"].map((n) => n["@type"]);
  assert.deepEqual(types, ["WebPage", "FAQPage"]);
  const page = graph["@graph"][0];
  assert.equal(page.publisher, undefined, "an unknown publisher must not be asserted");

  // And nothing at all to say produces nothing, not an empty shell.
  assert.equal(hostedPageGraph({
    brand: null, page: { ...PAGE, headline: "", subheadline: "", sections: [] },
    pageUrl: "https://x/b/a/p", brandUrl: "https://x/b/a",
  }), null);
});

test("the brand's llms.txt lists the live pages and no drafts", async () => {
  const { hostedLlmsTxt } = await import("../src/backend/hosted-schema.ts");
  const body = hostedLlmsTxt({
    brand: BRAND,
    pages: [PAGE, { ...PAGE, slug: "draft-page", headline: "Not published", live: false }],
    brandUrl: "https://marketwaros.com/b/acme",
    base: "https://marketwaros.com",
  });

  assert.match(body, /^# Acme Bathrooms/, "the brand definition comes from the generator the customer already uses");
  assert.match(body, /bathroom fitting/);
  assert.match(body, /Coventry/);
  assert.match(body, /\/b\/acme\/free-survey/, "a definition with no URLs gives an assistant nothing to cite");
  assert.doesNotMatch(body, /draft-page/, "a draft must never be exposed by the file that exists to get pages found");
  assert.doesNotMatch(body, /Not published/);
  assert.match(body, /Sitemap: https:\/\/marketwaros\.com\/b\/acme\/sitemap\.xml/);
  assert.match(body, /do not infer prices, availability, ratings or claims/i);
  // One "Notes for AI assistants", not the generator's plus ours.
  assert.equal((body.match(/## Notes for AI assistants/g) || []).length, 1);
});

test("a brand with nothing published says so rather than looking broken", async () => {
  const { hostedLlmsTxt } = await import("../src/backend/hosted-schema.ts");
  const body = hostedLlmsTxt({ brand: BRAND, pages: [], brandUrl: "https://x/b/acme", base: "https://x" });
  assert.match(body, /None are published yet/,
    "a file that lists nothing and does not explain why reads as a broken endpoint");
});

test("the per-brand sitemap exists, carries real dates, and is not ours to claim", () => {
  const sitemap = codeOf(readFileSync("src/app/b/[brandId]/sitemap.xml/route.ts", "utf8"));
  // lastmod from the real publishedAt. Writing today's date on every entry tells
  // a crawler everything changed every sweep, and it stops reading the dates.
  assert.match(sitemap, /Date\.parse\(p\.publishedAt \|\| ""\)/);
  assert.match(sitemap, /live = pages\.filter\(\(p\) => p\.live\)/, "drafts must not be listed");
  assert.match(sitemap, /xmlSafe\(loc\)/, "a slug with an ampersand would break the XML");

  // THE DECISION IN app/robots.ts STILL STANDS: customer pages are indexable but
  // are not ours to put in OUR sitemap. A per-brand sitemap makes discovery
  // possible without claiming their pages as our content.
  // RAW, NOT `codeOf`. This one assertion is deliberately about the COMMENT: the
  // decision not to list customer pages in our sitemap is a decision, and a
  // per-brand sitemap only makes sense while it stands. Stripping comments and
  // then asserting on one is how eight tests in this repo have failed on their
  // own prose, so the exception is stated rather than assumed.
  const robotsRaw = readFileSync("src/app/robots.ts", "utf8");
  // The phrase wraps across a comment line, so the whitespace is anything.
  assert.match(robotsRaw, /not ours to put in our[\s/]+sitemap/,
    "if that decision is reversed, the per-brand sitemap needs revisiting rather than silently duplicating ours");
  const ourSitemap = readFileSync("src/app/sitemap.ts", "utf8");
  assert.doesNotMatch(ourSitemap, /\/b\//, "the brand pages must not have crept into our own sitemap");
});

test("our own robots.txt does not block what we sell measuring", async () => {
  // Pointing our own audit at ourselves, which is the rule this file's second
  // half exists to honour.
  const { blockedAiCrawlers } = await import("../src/shared/ai-readability.ts");
  const robots = codeOf(readFileSync("src/app/robots.ts", "utf8"));
  // The rules are built in code, so the check is on the shape: one `*` group that
  // allows `/`, and no root disallow for anybody.
  assert.match(robots, /userAgent: "\*"/);
  assert.match(robots, /allow: "\/"/);
  const disallow = /disallow: \[([^\]]*)\]/.exec(robots)?.[1] || "";
  assert.ok(!/"\/"/.test(disallow), "a root disallow would make marketwaros.com invisible to the engines the product is about");
  // And the hosted brand pages must not be in the disallow list, or every
  // customer page this platform serves is unreadable by the crawlers.
  assert.ok(!/"\/b\//.test(disallow), "/b/ must stay crawlable — it is every customer's hosted page");
  assert.deepEqual(blockedAiCrawlers("User-agent: *\nAllow: /\nDisallow: /dashboard/\n"), [],
    "the shape our robots.txt produces must block no AI crawler");
});

// ---------------------------------------------------------------------------
// 3. OUR OWN PAGE, WHICH WAS FAILING OUR OWN REPORT.
//
// Measured before this: marketwaros.com scored 80/100, grade B, and FAILED
// "Answerable content (FAQ / Q&A)" at weight 20 — zero question-style headings.
// Eight good answers were already on the page; the questions sat in a bare
// `<summary>` and nothing machine-readable said they existed. The content a model
// would quote was present and invisible.
// ---------------------------------------------------------------------------

test("every home-page question is a real heading our own check can count", async () => {
  const { SITE_FAQ } = await import("../src/shared/site-faq.ts");
  const page = readFileSync("src/app/page.tsx", "utf8");

  // MEASURED ON A RUNNING BUILD: all 8 are counted by the check's own regex, and
  // the report went 80/100 grade B with a FAIL here to 98/100 grade A with
  // "8 question-style headings found, plus FAQPage schema".
  assert.ok(SITE_FAQ.length >= 4, `the readiness check wants at least 4 questions, got ${SITE_FAQ.length}`);
  assert.equal(SITE_FAQ.length, 8, "the count is pinned so a trim cannot quietly take the page back under the threshold");
  // An <h3> with the question and NOTHING nested inside it, which is what the
  // check, a crawler and a screen reader all look for.
  assert.match(page, /<h3 className="text-sm font-semibold text-white">\{f\.q\}<\/h3>/,
    "the question must be the whole content of a heading");

  // THE CHECK'S OWN REGEX, run against what the headings will contain. Copied
  // from geo-readiness.ts so this fails if the shape stops matching rather than
  // inventing a looser rule of its own.
  const counts = /<h[2-4][^>]*>[^<]{8,120}\?\s*<\/h[2-4]>/i;
  for (const f of SITE_FAQ) {
    const rendered = `<h3 className="x">${f.q.replace(/'/g, "&#x27;")}</h3>`;
    assert.match(rendered, counts, `"${f.q}" will not be counted as a question heading`);
  }
});

test("the FAQ markup is built from the array the page renders", async () => {
  const { SITE_FAQ } = await import("../src/shared/site-faq.ts");
  const page = readFileSync("src/app/page.tsx", "utf8");
  const comp = readFileSync("src/components/FaqJsonLd.tsx", "utf8");

  // ONE ARRAY, BOTH SIDES. The component takes what it is given and the page
  // gives it exactly what it maps over, so markup cannot describe one list while
  // the page shows another.
  assert.match(page, /<FaqJsonLd items=\{SITE_FAQ\} \/>/);
  assert.match(page, /\{SITE_FAQ\.map\(\(f\) => \(/);
  assert.match(comp, /"@type": "FAQPage"/);
  assert.match(comp, /acceptedAnswer: \{ "@type": "Answer", text: f\.a \}/);
  // A question with no answer is a prompt with nothing behind it; schema.org
  // requires an acceptedAnswer.
  assert.match(comp, /items\.filter\(\(f\) => f\.q\.trim\(\) && f\.a\.trim\(\)\)/);
  assert.match(comp, /replace\(\/</, "an answer containing </script> must not close the tag");

  for (const f of SITE_FAQ) {
    assert.ok(f.q.trim().endsWith("?"), `"${f.q}" is not a question`);
    assert.ok(f.a.trim().length > 40, `the answer to "${f.q}" is too short to be quotable`);
  }
});

test("the one number in the FAQ is counted, not typed", async () => {
  const { SITE_FAQ } = await import("../src/shared/site-faq.ts");
  const { INCLUDED_TOOLS } = await import("../src/shared/included-tools.ts");
  const src = readFileSync("src/shared/site-faq.ts", "utf8");

  // §151 was "32 checks" typed onto a public page where the code said 31. This is
  // the same shape of claim, so it is read from the list it describes.
  assert.match(src, /spell\(INCLUDED_TOOLS\.length\)/);
  const joined = SITE_FAQ.map((f) => f.a).join(" ");
  const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
  assert.ok(joined.includes(`one weapon of ${words[INCLUDED_TOOLS.length]}`),
    `the FAQ must say "one weapon of ${words[INCLUDED_TOOLS.length]}" — ${INCLUDED_TOOLS.length} tools are listed`);
});

test("no FAQ answer claims a result, a customer or a testimonial", async () => {
  const { SITE_FAQ } = await import("../src/shared/site-faq.ts");
  // Customers acquired is zero. The same rule `ads:verify` holds the adverts to,
  // applied to the page an assistant is most likely to quote.
  const joined = SITE_FAQ.map((f) => `${f.q} ${f.a}`).join(" ");
  for (const re of [
    /trusted by [0-9]/i, /[0-9,]+\+? (?:happy )?customers/i, /join [0-9,]+/i,
    /guaranteed results/i, /[0-9]+% more (?:leads|sales|revenue)/i,
  ]) {
    assert.doesNotMatch(joined, re, `the FAQ makes a claim there is no basis for: ${re}`);
  }
});

test("MarketWar's price is on the pages that sell it and on no customer page", () => {
  // THE CONFLICT §156 RECORDED, now closed. The root layout renders on every page
  // including /b/{brandId}/{slug}, so a SoftwareApplication with an Offer in that
  // graph advertised our subscription inside a customer's landing page — where an
  // assistant answering "who fits bathrooms in Coventry" could fold our product
  // and price into the answer about them.
  const site = codeOf(readFileSync("src/components/SiteJsonLd.tsx", "utf8"));
  const layout = codeOf(readFileSync("src/app/layout.tsx", "utf8"));

  // The site-wide graph keeps Organization and WebSite — both true on any page
  // served from this domain — and no longer carries the offer.
  const siteFn = site.slice(site.indexOf("export default function SiteJsonLd"), site.indexOf("export function ProductJsonLd"));
  assert.match(siteFn, /"@type": "Organization"/);
  assert.match(siteFn, /"@type": "WebSite"/);
  assert.doesNotMatch(siteFn, /SoftwareApplication/,
    "the product offer must not be in the graph that renders on every page");
  assert.doesNotMatch(siteFn, /"@type": "Offer"/);

  // The offer lives in its own component, and the root layout must not render it.
  assert.match(site, /export function ProductJsonLd/);
  assert.doesNotMatch(layout, /ProductJsonLd/,
    "rendering it from the root layout would put it straight back on every customer page");

  // It IS rendered by the pages that sell the product.
  for (const rel of ["page.tsx", "features/page.tsx", "how-it-works/page.tsx", "choose-plan/page.tsx"]) {
    const src = readFileSync(`src/app/${rel}`, "utf8");
    assert.match(src, /<ProductJsonLd \/>/, `${rel} sells the product and should carry its offer`);
  }

  // And emphatically not by the hosted customer page.
  const hosted = readFileSync("src/app/b/[brandId]/[slug]/page.tsx", "utf8");
  assert.doesNotMatch(hosted, /ProductJsonLd/, "a customer's page must never carry MarketWar's price");
});
