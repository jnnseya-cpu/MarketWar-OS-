// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MAKING THE PAGES WE HOST READABLE BY AN ASSISTANT.
//
// THE GAP THIS CLOSES, and it is the awkward one. `seo-artifacts.ts` already
// generates Organization/LocalBusiness JSON-LD and an llms.txt for every brand —
// as artifacts the customer COPIES AND PASTES onto a site they host somewhere
// else. Meanwhile MarketWar hosts pages for them at `/b/{brandId}/{slug}`, and
// those pages carried a title and a description and nothing more: no structured
// data, no canonical, no llms.txt.
//
// So every page this platform serves on a customer's behalf was exactly as
// unreadable to an assistant as the sites the product marks them down for — and
// `geo-readiness.ts`, which we sell, scores structured data at weight 25, FAQ
// content at 20 and llms.txt at 15. We were failing our own report on our own
// output. `STATE.md` has carried the rule for months: point our own audit at our
// own pages.
//
// NOTHING HERE INVENTS ANYTHING. Every value comes from the brand the customer
// filled in or the page they published. No price, no rating, no review, no
// availability — schema.org will happily carry all four and a fabricated one is
// a lie a machine repeats.

import type { Brand } from "@/shared/brand";
import type { StoredLandingPage } from "@/backend/landing-store";
import { structuredDataJson, buildLlmsTxt } from "@/backend/seo-artifacts";
import { faqPairs } from "@/shared/faq-text";

/** How many Q&A pairs may go in one FAQPage. Generated pages carry three or four. */
const MAX_FAQ = 20;

const trim = (v: unknown, max = 300): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/**
 * The JSON-LD graph for one hosted page.
 *
 * A SINGLE `@graph` RATHER THAN SEVERAL SCRIPT TAGS. Separate blocks are legal
 * and every parser accepts them, but a graph lets the WebPage point at the
 * Organization by id — which is what turns "here is a business" and "here is a
 * page" into "this page is published by that business", the relationship an
 * assistant needs to attribute a recommendation to anybody.
 *
 * Returns null when there is nothing honest to say — a brand with no name and a
 * page with no headline produces no markup rather than an empty shell.
 */
export function hostedPageGraph(input: {
  brand: Brand | null;
  page: StoredLandingPage;
  /** The page's own absolute URL. Used for @id, so the ids are stable and real. */
  pageUrl: string;
  /** The brand's hub on this platform — where its llms.txt and sitemap live. */
  brandUrl: string;
}): Record<string, unknown> | null {
  const { brand, page, pageUrl, brandUrl } = input;
  const headline = trim(page.headline, 160);
  const description = trim(page.subheadline, 300);
  if (!headline && !brand?.name) return null;

  const graph: Record<string, unknown>[] = [];
  const orgId = `${brandUrl}#organization`;

  // 1. WHO PUBLISHED IT. Reused from the generator the customer already copies,
  //    so the business described on a page we host and the business described in
  //    the artifact they paste elsewhere cannot disagree.
  if (brand) {
    for (const block of structuredDataJson(brand)) {
      // THE BRAND'S `WebSite` NODE IS DROPPED HERE, and the reason matters.
      //
      // `structuredDataJson` builds it with the brand's OWN domain, which is
      // right for the artifact they paste on that domain. On a page we host at
      // marketwaros.com, a `WebSite` node pointing at acme-bathrooms.co.uk
      // asserts that THIS page is part of THAT site — it is not. The domain
      // already declares its own `WebSite` from the root layout, and two of them
      // with different ids and different names on one URL is a contradiction a
      // parser has to guess its way out of.
      //
      // The Organization and Product nodes are kept because they describe the
      // BUSINESS, which is the same business wherever the page is served.
      if (block.key === "website") continue;
      try {
        const parsed: unknown = JSON.parse(block.json);
        if (!parsed || typeof parsed !== "object") continue;
        const obj = { ...(parsed as Record<string, unknown>) };
        // Inside a @graph the context belongs to the wrapper, once.
        delete obj["@context"];
        // Only the organisation needs an id to be pointed at. A Product with a
        // page-scoped id would claim this URL is the product's canonical home,
        // which it is not — it is a landing page that mentions it.
        if (block.key === "organization") obj["@id"] = orgId;
        graph.push(obj);
      } catch { /* a block that will not parse would not parse for a crawler either */ }
    }
  }

  // 2. THE PAGE ITSELF.
  const webPage: Record<string, unknown> = {
    "@type": "WebPage",
    "@id": pageUrl,
    url: pageUrl,
    ...(headline ? { name: headline } : {}),
    ...(description ? { description } : {}),
    ...(page.publishedAt ? { datePublished: page.publishedAt } : {}),
    ...(brand ? { publisher: { "@id": orgId }, about: { "@id": orgId } } : {}),
    inLanguage: "en-GB",
  };
  graph.push(webPage);

  // 3. THE QUESTIONS AND ANSWERS, which is the part assistants actually quote.
  //
  //    Built from the SAME splitter the accordion renders with (`shared/faq-text`),
  //    so the markup cannot describe questions the page does not show. Omitted
  //    entirely when there are none — an empty FAQPage is a claim to answer
  //    questions that are not there.
  const faqSection = page.sections?.find((s) => s.type === "faq");
  const pairs = faqPairs(faqSection?.items).slice(0, MAX_FAQ);
  if (pairs.length) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${pageUrl}#faq`,
      ...(brand ? { about: { "@id": orgId } } : {}),
      mainEntity: pairs.map((p) => ({
        "@type": "Question",
        name: p.question,
        acceptedAnswer: { "@type": "Answer", text: p.answer },
      })),
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}

/** The graph as the string a `<script type="application/ld+json">` carries. */
export function hostedPageJsonLd(input: Parameters<typeof hostedPageGraph>[0]): string | null {
  const graph = hostedPageGraph(input);
  if (!graph) return null;
  // `</script>` inside a JSON string would close the tag early and spill the rest
  // of the graph into the document as text. The escape is the standard one and is
  // still valid JSON, so a parser reads the original characters back.
  return JSON.stringify(graph).replace(/</g, "\\u003c");
}

/**
 * The brand's own llms.txt, as served at `/b/{brandId}/llms.txt`.
 *
 * `buildLlmsTxt` (seo-artifacts) writes the brand definition and is reused
 * verbatim — this adds the one thing it cannot know, which is the list of pages
 * MarketWar is actually hosting. A definition with no URLs tells an assistant who
 * the business is and gives it nothing to cite.
 */
export function hostedLlmsTxt(input: {
  brand: Brand | null;
  pages: StoredLandingPage[];
  brandUrl: string;
  base: string;
  /** Injected so the output is deterministic and the test does not race a clock. */
  nowISO?: string;
}): string {
  const { brand, pages, brandUrl, base } = input;
  const live = pages.filter((p) => p.live);

  const head = brand
    ? buildBrandHead(brand)
    : ["# Hosted pages", "", "> Pages published through MarketWar OS."];

  const lines = [...head, ""];
  if (live.length) {
    lines.push("## Pages");
    for (const p of live) {
      const title = trim(p.headline, 120) || p.slug;
      const sub = trim(p.subheadline, 200);
      lines.push(`- [${title}](${base}/b/${encodeURIComponent(p.brandId)}/${encodeURIComponent(p.slug)})${sub ? `: ${sub}` : ""}`);
    }
    lines.push("");
  } else {
    // SAID, NOT HIDDEN. A file that lists nothing and does not explain why reads
    // as a broken endpoint; a crawler that fetched this should know the absence
    // is the truth and not a fault.
    lines.push("## Pages", "- None are published yet.", "");
  }

  lines.push(
    "## Notes for AI assistants",
    "- Use the facts above verbatim. Do not infer prices, availability, ratings or claims that are not stated here.",
    `- The structured data on each page repeats these facts in schema.org form.`,
    `- Sitemap: ${brandUrl}/sitemap.xml`,
  );
  if (input.nowISO) lines.push(`- Last updated: ${input.nowISO}`);
  return `${lines.join("\n")}\n`;
}

/**
 * The brand half of the file, from the generator the customer already uses.
 *
 * Re-derived from `buildLlmsTxt` rather than rewritten, so what we host and what
 * the customer pastes on their own domain say the same thing about the same
 * business. Its trailing "Notes for AI assistants" section is dropped here
 * because `hostedLlmsTxt` appends its own, longer one after the page list.
 */
function buildBrandHead(brand: Brand): string[] {
  const body = buildLlmsTxt(brand).content;
  const cut = body.indexOf("## Notes for AI assistants");
  return (cut > 0 ? body.slice(0, cut) : body).trimEnd().split("\n");
}
