import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell, Prose } from "@/components/marketing";
import { listPosts } from "@/backend/blog-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Blog · MarketWar OS",
  description: "Playbooks on owned customer acquisition, AI-search visibility, ACU economics and profitable growth.",
};

export default async function BlogPage() {
  const posts = await listPosts().catch(() => []);
  return (
    <MarketingShell
      kicker="Blog"
      title="Playbooks for profitable growth"
      subtitle="Field notes on owned customer acquisition, AI-search visibility, ACU economics and building a growth machine that scales without breaking your margin."
    >
      <Prose>
        {posts.length === 0 ? (
          <p className="rounded-lg border border-ink-700 bg-ink-850 p-5 text-sm text-slate-400">
            No articles published yet — new playbooks are on the way.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {posts.map((p) => (
              <Link
                key={p.slug}
                href={`/blog/${p.slug}`}
                className="card flex flex-col p-5 transition hover:border-emerald-500/40"
              >
                <div className="mb-2 flex items-center gap-2 text-[11px]">
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-300">{p.category}</span>
                  <span className="text-slate-500">{p.readMinutes} min read</span>
                </div>
                <h3 className="font-display text-base font-bold leading-snug text-white">{p.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">{p.excerpt}</p>
                <span className="mt-3 text-[13px] font-semibold text-emerald-400">Read article →</span>
              </Link>
            ))}
          </div>
        )}
        <p className="mt-8 text-sm text-slate-500">
          Want these in your inbox? <Link href="/contact" className="text-emerald-400 hover:text-emerald-300">Subscribe via Contact</Link> — capped and consented, like everything we build.
        </p>
      </Prose>
    </MarketingShell>
  );
}
