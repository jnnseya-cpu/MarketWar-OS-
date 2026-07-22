import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPost } from "@/backend/blog-store";
import { AgentMarkdown } from "@/components/ui";
import { SiteHeader, SiteFooter } from "@/components/marketing";
import BlogArticleClient from "@/components/BlogArticleClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getPost(params.slug).catch(() => null);
  if (!post) return { title: "Article · MarketWar OS" };
  return {
    title: `${post.title} · MarketWar OS`,
    description: post.excerpt,
    openGraph: { title: post.title, description: post.excerpt, type: "article" },
  };
}

export default async function BlogArticlePage({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug).catch(() => null);
  if (!post || post.status !== "published") notFound();
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <article className="mx-auto max-w-3xl px-5 py-16">
        <Link href="/blog" className="text-sm font-semibold text-emerald-400 hover:text-emerald-300">← All articles</Link>
        <div className="mb-3 mt-5 flex items-center gap-2 text-[11px]">
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-300">{post.category}</span>
          <span className="text-slate-500">{post.readMinutes} min read</span>
        </div>
        <h1 className="font-display text-3xl font-bold leading-tight text-white sm:text-4xl">{post.title}</h1>
        <div className="mb-8 mt-4 border-b border-ink-700/60 pb-6">
          <BlogArticleClient slug={post.slug} initialViews={post.views} />
        </div>
        <AgentMarkdown text={post.content} />
      </article>
      <SiteFooter />
    </div>
  );
}
