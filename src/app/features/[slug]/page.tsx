import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingShell, H2, Prose } from "@/components/marketing";
import { FEATURE_PAGES, featureBySlug } from "@/shared/feature-pages";

export const dynamicParams = false;
export function generateStaticParams() {
  return FEATURE_PAGES.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const p = featureBySlug(params.slug);
  if (!p) return { title: "Not found · MarketWar OS" };
  return {
    title: `${p.title} · MarketWar OS`,
    description: p.description,
    alternates: { canonical: `/features/${p.slug}` },
    openGraph: { title: p.title, description: p.description, type: "article" },
  };
}

// One page per question. The JSON-LD is FAQPage plus a breadcrumb — both
// describe what is genuinely on the page, which is the only version worth
// emitting: structured data that promises something the page does not contain
// is a manual action waiting to happen.
export default function FeaturePage({ params }: { params: { slug: string } }) {
  const p = featureBySlug(params.slug);
  if (!p) notFound();

  const related = p.related.map(featureBySlug).filter(Boolean);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        mainEntity: p.faq.map((f) => ({
          "@type": "Question", name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Answers", item: "/features" },
          { "@type": "ListItem", position: 2, name: p.title, item: `/features/${p.slug}` },
        ],
      },
    ],
  };

  return (
    <MarketingShell kicker={p.category} title={p.title} subtitle={p.description}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Prose>
        {/* The thing only we can say, above the fold. It is what makes this page
            worth existing rather than one more restatement of common advice. */}
        <div className="not-prose mb-6 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">How MarketWar handles it</p>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-200">{p.proof}</p>
        </div>

        <div dangerouslySetInnerHTML={{ __html: renderBody(p.body) }} />

        <div className="not-prose my-6 rounded-xl border border-white/10 bg-ink-900/50 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">What this does not do</p>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{p.limit}</p>
        </div>

        <H2>Common questions</H2>
        <div className="not-prose mb-8 space-y-3">
          {p.faq.map((f) => (
            <div key={f.q} className="rounded-lg border border-white/[0.06] bg-ink-950/40 p-4">
              <p className="text-sm font-semibold text-white">{f.q}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </div>
          ))}
        </div>

        {related.length > 0 && (
          <>
            <H2>Related</H2>
            <div className="not-prose mb-8 grid gap-3 sm:grid-cols-2">
              {related.map((r) => (
                <Link key={r!.slug} href={`/features/${r!.slug}`} className="card p-4 transition hover:border-emerald-500/40">
                  <p className="font-display text-sm font-bold text-white">{r!.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">{r!.description}</p>
                </Link>
              ))}
            </div>
          </>
        )}

        <p className="text-sm text-slate-400">
          <Link href="/features">All the answers</Link> · <Link href="/audit">Free website audit</Link> ·{" "}
          <Link href="/choose-plan">What it costs</Link>
        </p>
      </Prose>
    </MarketingShell>
  );
}

/** Markdown, only as far as these pages actually use it. */
function renderBody(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return md.split("\n\n").map((block) => {
    const b = block.trim();
    if (!b) return "";
    if (b.startsWith("## ")) return `<h2>${inline(esc(b.slice(3)))}</h2>`;
    if (b.startsWith("- ")) {
      const items = b.split("\n").filter((l) => l.startsWith("- ")).map((l) => `<li>${inline(esc(l.slice(2)))}</li>`).join("");
      return `<ul>${items}</ul>`;
    }
    return `<p>${inline(esc(b)).replace(/\n/g, " ")}</p>`;
  }).join("");
}

function inline(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}
