import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPost, listPosts } from "@/backend/blog-store";
import { relatedPosts } from "@/backend/blog-links";
import { SEO_ARTICLES } from "@/shared/seo-articles";
import { AgentMarkdown } from "@/components/ui";
import { SiteHeader, SiteFooter } from "@/components/marketing";
import BlogArticleClient from "@/components/BlogArticleClient";

export const dynamic = "force-dynamic";

const SITE = (process.env.NEXT_PUBLIC_PRODUCTION_URL || "https://www.marketwaros.com").replace(/\/$/, "");

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getPost(params.slug).catch(() => null);
  if (!post) return { title: "Article · MarketWar OS" };
  const url = `${SITE}/blog/${post.slug}`;
  return {
    title: `${post.title} · MarketWar OS`,
    description: post.excerpt,
    // Without a canonical, every tracking parameter a shared link picks up
    // looks like a separate page to a crawler and the article competes with
    // copies of itself for the ranking it earned.
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      url,
      publishedTime: post.publishedAt || post.createdAt,
      authors: [post.author || "MarketWar OS"],
    },
    twitter: { card: "summary_large_image", title: post.title, description: post.excerpt },
    keywords: SEO_ARTICLES.find((a) => a.slug === post.slug)?.keywords,
  };
}

export default async function BlogArticlePage({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug).catch(() => null);
  if (!post || post.status !== "published") notFound();
  const all = await listPosts().catch(() => []);
  // Only genuinely overlapping posts. An empty list renders nothing rather than
  // padding the block with whatever went out most recently — a "related" list
  // full of unrelated things teaches a reader to skip the block entirely.
  const cluster = SEO_ARTICLES.find((a) => a.slug === post.slug);
  // For the evergreen cluster the relations are DECLARED rather than inferred.
  // A topic cluster only works if the spokes point where they were designed to
  // point; keyword overlap would rebuild a different, weaker graph by accident.
  const related = cluster
    ? cluster.related
        .map((slug) => all.find((p) => p.slug === slug))
        .filter((p): p is typeof post => Boolean(p))
        // The reason is not word overlap here, so it does not claim to be.
        .map((p) => ({ post: p, shared: ["part of this guide"] }))
    : relatedPosts(post, all);

  // Article structured data. Without it a post is a wall of text to a crawler:
  // no author, no dates, no headline, and no chance of the rich result that
  // makes a link worth clicking in the first place.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    articleSection: post.category,
    datePublished: post.publishedAt || post.createdAt,
    dateModified: post.publishedAt || post.createdAt,
    author: { "@type": "Organization", name: post.author || "MarketWar OS", url: SITE },
    publisher: { "@type": "Organization", name: "MarketWar OS", url: SITE },
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE}/blog/${post.slug}` },
    url: `${SITE}/blog/${post.slug}`,
    inLanguage: "en-GB",
  };

  // FAQ structured data. The questions are real ones the article answers, so
  // this is the rich result the page was written for rather than markup bolted
  // onto prose that never addresses them.
  const faqLd = cluster && cluster.faq.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: cluster.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  } : null;

  // Breadcrumbs, so a search result shows where the page sits rather than a
  // bare URL.
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: `${SITE}/blog/${post.slug}` },
    ],
  };

  const published = post.publishedAt || post.createdAt;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />}
      <article className="mx-auto max-w-3xl px-5 py-16">
        <Link href="/blog" className="text-sm font-semibold text-emerald-400 hover:text-emerald-300">← All articles</Link>
        <div className="mb-3 mt-5 flex items-center gap-2 text-[11px]">
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-300">{post.category}</span>
          <span className="text-slate-500">{post.readMinutes} min read</span>
        </div>
        <h1 className="font-display text-3xl font-bold leading-tight text-white sm:text-4xl">{post.title}</h1>
        <div className="mb-8 mt-4 border-b border-ink-700/60 pb-6">
          <p className="mb-3 text-[13px] text-slate-500">
            By {post.author || "MarketWar OS"}
            {published && (
              <>
                {" · "}
                <time dateTime={published}>
                  {new Date(published).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                </time>
              </>
            )}
          </p>
          <BlogArticleClient slug={post.slug} initialViews={post.views} />
        </div>
        <AgentMarkdown text={post.content} />

        {related.length > 0 && (
          <aside className="mt-14 border-t border-ink-700/60 pt-8">
            <h2 className="font-display text-lg font-bold text-white">Related playbooks</h2>
            <p className="mt-1 text-[13px] text-slate-500">
              {cluster
                ? "The rest of this guide — written as one set, so each part picks up where this one stops."
                : "Chosen by what these articles actually have in common, and the shared words are shown."}
            </p>
            <ul className="mt-4 space-y-3">
              {related.map((r) => (
                <li key={r.post.slug}>
                  <Link href={`/blog/${r.post.slug}`} className="group block rounded-xl border border-ink-800 bg-ink-900/50 p-4 transition hover:border-emerald-500/40">
                    <p className="text-sm font-bold text-white group-hover:text-emerald-300">{r.post.title}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-slate-400">{r.post.excerpt}</p>
                    <p className="mt-2 text-[11px] text-slate-500">{cluster ? r.shared[0] : `Shares: ${r.shared.slice(0, 5).join(", ")}`}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </article>
      <SiteFooter />
    </div>
  );
}
