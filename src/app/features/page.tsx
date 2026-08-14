import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell, H2, Prose } from "@/components/marketing";
import { FEATURE_PAGES, FEATURE_CATEGORIES } from "@/shared/feature-pages";

export const metadata: Metadata = {
  title: "How it works, question by question · MarketWar OS",
  description: "Straight answers to what small businesses actually ask about marketing: what you can afford to pay an affiliate, why your ad text is unreadable, why AI assistants never mention you, and what an audit really checks.",
  alternates: { canonical: "/features" },
};

// The hub. Organised by the QUESTION rather than by our engine names, because
// nobody has ever gone looking for an engine.
export default function FeaturesHub() {
  return (
    <MarketingShell
      kicker="Answers"
      title="The questions, answered properly"
      subtitle="Each of these is something a small business owner actually asks, answered with the arithmetic rather than the adjectives — including the parts where the honest answer is that you cannot do the thing you wanted."
    >
      <Prose>
        {FEATURE_CATEGORIES.map((cat) => (
          <section key={cat}>
            <H2>{cat}</H2>
            <div className="not-prose mb-8 grid gap-3 sm:grid-cols-2">
              {FEATURE_PAGES.filter((p) => p.category === cat).map((p) => (
                <Link key={p.slug} href={`/features/${p.slug}`} className="card p-4 transition hover:border-emerald-500/40">
                  <p className="font-display text-sm font-bold text-white">{p.title}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{p.description}</p>
                </Link>
              ))}
            </div>
          </section>
        ))}
        <p className="text-sm text-slate-400">
          If you would rather see it than read about it, <Link href="/audit">the free audit</Link> reads your actual page
          and gives you three true things about it in about fifteen seconds, with no account.
        </p>
      </Prose>
    </MarketingShell>
  );
}
