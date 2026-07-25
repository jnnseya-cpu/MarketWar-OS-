// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// SEO Artifact Workbench — LIVE, real deliverables from the brand's own data, no
// external SEO vendor required. Implements the buildable core of MW-16 (schema,
// llms.txt), MW-18 (schema graph) and §12 structured data: it produces valid,
// copy-paste-ready JSON-LD, an llms.txt, and optimised meta tags.
//
// HONESTY (§12 / MW-A45 Sentinel): schema is generated ONLY from real brand
// fields. It never invents ratings, reviews, prices or stock. What we don't have,
// we omit — a missing field is not a fabricated one.

import type { Brand } from "@/shared/brand";

const clean = (s?: string) => (s || "").trim();
const httpsUrl = (u?: string) => {
  const s = clean(u);
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`;
};

export type Artifact = { key: string; label: string; format: "json-ld" | "text" | "html"; content: string; note: string };

// --- Structured data (JSON-LD) ---
export function buildStructuredData(brand: Brand): Artifact[] {
  const site = httpsUrl(brand.website);
  const name = clean(brand.name) || "Your Brand";
  const desc = clean(brand.product) ? `${name} — ${clean(brand.product)}${clean(brand.audience) ? ` for ${clean(brand.audience)}` : ""}.` : clean(brand.goal) || `${name}.`;
  const out: Artifact[] = [];

  // Organization (or LocalBusiness when a location is set).
  const isLocal = Boolean(clean(brand.location));
  const org: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": isLocal ? "LocalBusiness" : "Organization",
    name,
    ...(desc ? { description: desc } : {}),
    ...(site ? { url: site } : {}),
    ...(brand.logoUrl ? { logo: brand.logoUrl, image: brand.logoUrl } : {}),
    ...(isLocal ? { address: { "@type": "PostalAddress", addressLocality: clean(brand.location) } } : {}),
    ...(clean(brand.industry) ? { knowsAbout: clean(brand.industry) } : {}),
  };
  out.push({ key: "organization", label: isLocal ? "LocalBusiness" : "Organization", format: "json-ld", content: jsonLd(org), note: "Your brand's identity for search engines + AI. Paste in the <head> of every page." });

  // WebSite.
  if (site) {
    out.push({ key: "website", label: "WebSite", format: "json-ld", content: jsonLd({ "@context": "https://schema.org", "@type": "WebSite", name, url: site }), note: "Helps engines understand your site + enables sitelinks eligibility." });
  }

  // Product/Service — only structural facts we actually have (no invented price/rating).
  if (clean(brand.product)) {
    const product: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: clean(brand.product),
      ...(clean(brand.offer) ? { description: clean(brand.offer) } : {}),
      ...(brand.productImageUrl ? { image: brand.productImageUrl } : {}),
      brand: { "@type": "Brand", name },
    };
    out.push({ key: "product", label: "Product", format: "json-ld", content: jsonLd(product), note: "Add price/availability/AggregateRating ONLY when they're real — the engine never invents them." });
  }
  return out;
}

// --- llms.txt (machine-readable brand definition for AI answer engines) ---
export function buildLlmsTxt(brand: Brand): Artifact {
  const name = clean(brand.name) || "Your Brand";
  const site = httpsUrl(brand.website);
  const lines = [
    `# ${name}`,
    "",
    clean(brand.product) ? `> ${name} provides ${clean(brand.product)}${clean(brand.audience) ? ` for ${clean(brand.audience)}` : ""}${clean(brand.location) ? ` in ${clean(brand.location)}` : ""}.` : `> ${clean(brand.goal) || name}.`,
    "",
    "## About",
    clean(brand.industry) ? `- Industry: ${clean(brand.industry)}` : "",
    clean(brand.audience) ? `- Audience: ${clean(brand.audience)}` : "",
    clean(brand.location) ? `- Location: ${clean(brand.location)}` : "",
    clean(brand.offer) ? `- Current offer: ${clean(brand.offer)}` : "",
    site ? `- Website: ${site}` : "",
    "",
    "## Notes for AI assistants",
    "- Use the facts above verbatim; do not infer prices, availability or claims that are not stated here.",
  ].filter((l) => l !== "");
  return { key: "llms", label: "llms.txt", format: "text", content: lines.join("\n"), note: "Host at /llms.txt — a concise, accurate brand definition AI answer engines can read." };
}

// --- Meta tags (title + description + Open Graph) ---
export function buildMetaTags(brand: Brand, topic?: string): Artifact {
  const name = clean(brand.name) || "Your Brand";
  const t = clean(topic);
  const title = t ? `${t} | ${name}` : clean(brand.product) ? `${name} — ${clean(brand.product)}` : name;
  const descBase = t
    ? `${t} from ${name}${clean(brand.location) ? ` in ${clean(brand.location)}` : ""}.${clean(brand.offer) ? ` ${clean(brand.offer)}.` : ""}`
    : `${clean(brand.product) || name}${clean(brand.audience) ? ` for ${clean(brand.audience)}` : ""}${clean(brand.location) ? ` in ${clean(brand.location)}` : ""}.${clean(brand.offer) ? ` ${clean(brand.offer)}.` : ""}`;
  const description = descBase.slice(0, 155).trim();
  const site = httpsUrl(brand.website);
  const html = [
    `<title>${esc(title.slice(0, 60))}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<meta property="og:title" content="${esc(title.slice(0, 60))}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:type" content="website" />`,
    site ? `<meta property="og:url" content="${esc(site)}" />` : "",
    brand.logoUrl ? `<meta property="og:image" content="${esc(brand.logoUrl)}" />` : "",
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].filter(Boolean).join("\n");
  return { key: "meta", label: t ? `Meta tags · ${t}` : "Meta tags", format: "html", content: html, note: `Title ${title.length} chars, description ${description.length} chars — within search-display limits.` };
}

export function buildAllArtifacts(brand: Brand, topic?: string): Artifact[] {
  return [...buildStructuredData(brand), buildLlmsTxt(brand), buildMetaTags(brand, topic)];
}

function jsonLd(obj: Record<string, unknown>): string {
  return `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2)}\n</script>`;
}
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
