// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// AI blog generator — turns a topic into a complete, SEO-optimised Markdown
// article via the AI Gateway (Claude → OpenAI → Gemini failover). With no
// provider key it returns a deterministic starter article, clearly flagged.

import { gatewayComplete, GatewayUnconfiguredError, DOCUMENT_DEEP, demoFallbackAllowed, LIVE_AI_UNAVAILABLE } from "@/backend/gateway";
import { aiUnavailableMessage } from "@/backend/capabilities";
import { enforceLinks, extractLinks, isExternal, linkAudit, menuForPrompt, resolveBareLinks, verifyExternal, type LinkTarget } from "@/backend/blog-links";

const SYSTEM = `You are an expert SEO content strategist and writer for MarketWar OS, an AI customer-acquisition platform. Write a complete, publish-ready blog article in Markdown.
Rules:
- Start with a single H1 title line ("# Title").
- Then a compelling 1-2 sentence stand-first paragraph (this becomes the excerpt).
- Then the full body: H2/H3 sections, practical and specific, scannable, 700-1100 words.
- SEO-optimised around the topic and any target keywords; British English; expert, honest tone.
- NEVER fabricate statistics or testimonials. End with a short call-to-action.

LINKS. An article that links nowhere is a dead end for the reader and for search.
- Place 3 to 6 internal links, in the flow of a sentence, where they genuinely help.
- Write the WHOLE link every time: [anchor text](/the-path). A label in square brackets on its own, like [Pricing], is NOT a link — the reader sees the brackets and the article looks unfinished.
- Use ONLY the destinations listed under "Link menu" below, and copy the path exactly as written.
- NEVER invent a URL. If the page you want is not on the menu, write the sentence without a link.
- Anchor text must describe the destination; never "click here" or a bare URL.
- Outbound links to other sites are optional. Only link a page you are certain exists, and never a competitor's marketing page. Every external URL is checked before publication and removed if it does not answer.
Return ONLY the Markdown article - no preamble, no code fences.`;

export type GeneratedArticle = {
  title: string;
  excerpt: string;
  content: string;
  mode: "live" | "demo";
  /** What the link enforcement did — surfaced, never silent. */
  links: { internal: number; external: number; removed: { url: string; text: string; reason: string }[]; note: string };
};

export async function generateArticle(input: {
  topic: string;
  category?: string;
  keywords?: string;
  /** Everywhere this article is allowed to point. Empty menu = no links asked for. */
  menu?: LinkTarget[];
}): Promise<GeneratedArticle> {
  const menu = input.menu ?? [];
  const prompt = [
    `Topic: ${input.topic}`,
    input.category ? `Category: ${input.category}` : "",
    input.keywords ? `Target keywords: ${input.keywords}` : "",
    menu.length ? `\nLink menu — the only internal destinations that exist. Use the exact paths:\n${menuForPrompt(menu)}` : "",
    "",
    "Write the article now.",
  ].filter(Boolean).join("\n");

  try {
    const res = await gatewayComplete({ system: SYSTEM, prompt }, DOCUMENT_DEEP);
    const article = splitArticle(res.text.trim(), input.topic);
    const checked = await applyLinkPolicy(article.content, menu);
    return { ...article, content: checked.content, links: checked.links, mode: "live" };
  } catch (e) {
    if (e instanceof GatewayUnconfiguredError) {
      // A canned article is something a customer may publish under their own
      // name, on their own domain, as their own opinion. Hosted production
      // refuses it for the same reason the agents do.
      if (!demoFallbackAllowed()) throw new Error(aiUnavailableMessage());
      const demo = demoArticle(input.topic, input.category);
      const checked = await applyLinkPolicy(demo.content, menu);
      return { ...demo, content: checked.content, links: checked.links, mode: "demo" };
    }
    throw e;
  }
}

/**
 * Hold the finished article to the menu.
 *
 * Runs whatever the model did, because "please only use these URLs" is a
 * request and this is the check. External links are verified over the network
 * first: a citation that 404s is worse than no citation, and neither we nor the
 * model can know without asking.
 */
export async function applyLinkPolicy(
  markdown: string,
  menu: LinkTarget[],
): Promise<{ content: string; links: GeneratedArticle["links"] }> {
  // FIRST: a label in brackets with no url behind it. The model is given the
  // menu as `- [Label](/path)` and will sometimes answer with the labels alone.
  // Every other check here looks for `[text](url)`, so a bare `[text]` used to
  // be invisible to all of them and shipped as visible brackets. Resolved to
  // the destination it names, or the brackets come off.
  const bare = resolveBareLinks(markdown, menu);
  markdown = bare.markdown;

  const external = extractLinks(markdown).map((l) => l.url).filter(isExternal);
  const alive = external.length ? await verifyExternal(external).catch(() => new Set<string>()) : new Set<string>();
  const result = enforceLinks(markdown, menu, alive);
  const audit = linkAudit(result.markdown, menu);
  const notes = [
    bare.linked.length
      ? `${bare.linked.length} bracketed label(s) had no url and were resolved to the page they name: ${bare.linked.map((b) => `[${b.label}] → ${b.resolvedTo}`).join("; ")}.`
      : "",
    bare.unlinked.length
      ? `${bare.unlinked.length} bracketed label(s) matched nothing on the menu, so the brackets were removed and the words kept: ${bare.unlinked.map((b) => `[${b.label}]`).join(", ")}.`
      : "",
    result.removed.length
      ? `${result.removed.length} link(s) were removed and their words left in place: ${result.removed.map((r) => `${r.url} (${r.reason})`).join("; ")}.`
      : "",
    audit.note,
  ].filter(Boolean);
  return {
    content: result.markdown,
    links: {
      internal: result.internalCount,
      external: result.externalCount,
      removed: result.removed,
      note: notes.join(" "),
    },
  };
}

function splitArticle(md: string, fallbackTitle: string): { title: string; excerpt: string; content: string } {
  const clean = md.replace(/^```(?:markdown)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const lines = clean.split("\n");
  const h1 = lines.find((l) => /^#\s+/.test(l));
  const title = h1 ? h1.replace(/^#\s+/, "").trim() : fallbackTitle;
  const body = clean.replace(/^#\s+.*$/m, "").trim();
  const firstPara = body.split(/\n{2,}/).map((s) => s.trim()).find((s) => s && !s.startsWith("#") && !s.startsWith("!"));
  const excerpt = (firstPara || `A practical guide to ${fallbackTitle}.`).replace(/[#*_>`]/g, "").slice(0, 220);
  return { title, excerpt, content: clean };
}

function demoArticle(topic: string, category?: string): { title: string; excerpt: string; content: string } {
  const cat = category || "Growth";
  const content = [
    `# ${topic}`,
    ``,
    `A practical, margin-safe take on ${topic.toLowerCase()} for founders who want customers, not vanity metrics.`,
    ``,
    `## Why this matters`,
    `Owned-channel acquisition compounds; rented reach does not. The goal is the cheapest next customer, not the most views.`,
    ``,
    `## The play`,
    `1. Define the offer around real price, cost and stock.`,
    `2. Reach buyers on channels you own - email, WhatsApp links, your own site.`,
    `3. Measure attributed revenue, not impressions.`,
    ``,
    `The same sequence is set out phase by phase in [how the platform works](/how-it-works), and the other playbooks are [on the blog](/blog).`,
    ``,
    `## Next steps`,
    `Add an AI provider key to generate full, live ${cat.toLowerCase()} articles like this on demand.`,
  ].join("\n");
  return { title: topic, excerpt: `A practical guide to ${topic.toLowerCase()}.`, content };
}
