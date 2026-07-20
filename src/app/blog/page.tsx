import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell, Prose } from "@/components/marketing";

export const metadata: Metadata = {
  title: "Blog · MarketWar OS",
  description: "Playbooks on owned customer acquisition, AI-search visibility, ACU economics and profitable growth.",
};

const POSTS: { title: string; excerpt: string; tag: string; read: string }[] = [
  { title: "Buy the cheapest next customer, not the most reach", tag: "Growth", read: "6 min", excerpt: "Why the smartest growth question isn't 'how do I get more views?' but 'where can I acquire the next customer for the lowest cost?' — and how the ROI engine answers it, owned-channels first." },
  { title: "SEO is becoming GEO: getting recommended by AI assistants", tag: "AI Visibility", read: "8 min", excerpt: "When buyers ask ChatGPT, Claude, Gemini and Perplexity for a recommendation, does your brand appear? A practical guide to generative-engine optimisation and citation share-of-voice." },
  { title: "The utility-company pricing model for AI features", tag: "Economics", read: "5 min", excerpt: "Never sell AI at cost. How the ACU model works — £1 = 100 ACUs, a 4× markup (300% markup = 75% gross margin), and why margin can never exceed 100%." },
  { title: "One product photo → a whole viral campaign", tag: "Creative", read: "7 min", excerpt: "Inside VisualStrike AI: product identity lock, a 15-dimension viral score, 27 angle families and the honesty guard that blocks fabricated claims." },
  { title: "Why your marketing tools should be disconnected from nobody", tag: "Independence", read: "6 min", excerpt: "Renting your customer relationship to a delivery app or ad platform is a strategic risk. What it means to own your acquisition infrastructure." },
  { title: "Turning social listening into revenue, not dashboards", tag: "Intelligence", read: "6 min", excerpt: "Most listening tools stop at charts. How MarketWar turns a buying-intent mention into a Lead Opportunity Card — consent-gated, compliance-checked, ready to act on." },
];

export default function BlogPage() {
  return (
    <MarketingShell
      kicker="Blog"
      title="Playbooks for profitable growth"
      subtitle="Field notes on owned customer acquisition, AI-search visibility, ACU economics and building a growth machine that scales without breaking your margin."
    >
      <Prose>
        <div className="grid gap-4 sm:grid-cols-2">
          {POSTS.map((p) => (
            <article key={p.title} className="card flex flex-col p-5">
              <div className="mb-2 flex items-center gap-2 text-[11px]">
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-300">{p.tag}</span>
                <span className="text-slate-500">{p.read} read</span>
              </div>
              <h3 className="font-display text-base font-bold leading-snug text-white">{p.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">{p.excerpt}</p>
              <span className="mt-3 text-[13px] font-semibold text-emerald-400">Full article coming soon →</span>
            </article>
          ))}
        </div>
        <p className="mt-8 text-sm text-slate-500">
          Want these in your inbox? <Link href="/contact" className="text-emerald-400 hover:text-emerald-300">Subscribe via Contact</Link> — no spam, capped and consented, like everything we build.
        </p>
      </Prose>
    </MarketingShell>
  );
}
