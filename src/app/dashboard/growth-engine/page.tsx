"use client";

// AI Growth Engine — the ten built-in tools, in one place.
//
// TWO OF THEM HAD NO ENGINE AT ALL and are built here: the hashtag generator
// and the posting-time recommender. The other eight already shipped as full
// command surfaces, so this page does NOT reimplement them — a second, thinner
// copy of the Landing Page Architect would be worse than the one that exists.
// It names each one, says in one line what it does and what it needs from you,
// and takes you into the real thing.
//
// Every card states its own honesty condition, because these are exactly the
// tools that get faked elsewhere: no hashtag reach figures, no "best time"
// invented out of nothing, and analytics that refuse to quote a rate on a
// sample too small to carry one.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3, Clock, Hash, Image as ImageIcon, Layers, Loader2, Mail,
  MousePointerClick, Plane, Cpu, Target, Users, Video,
} from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";

type Hashtag = { tag: string; kind: string; because: string };
type HashtagSet = {
  platform: string;
  rule: { hardCap: number | null; suggested: number; note: string };
  use: Hashtag[];
  alsoConsidered: Hashtag[];
  warnings: string[];
  note: string;
};
type PostingAdvice = {
  basis: "measured" | "market-hours" | "unknown";
  timezone: string;
  windows: { hour: number; label: string; clicks: number; opens: number }[];
  days: { day: string; clicks: number; opens: number }[];
  sampleClicks: number;
  sampleOpens: number;
  headline: string;
  caveat: string;
};

const PLATFORMS = ["instagram", "tiktok", "linkedin", "x", "facebook", "youtube", "threads", "pinterest"] as const;

// The eight that already exist. Each goes to the surface that does the work.
const TOOLS: { icon: typeof Cpu; title: string; does: string; needs: string; href: string; cta: string }[] = [
  {
    icon: Cpu, title: "AI social media post generator",
    does: "Writes the post in your brand voice for the channel you pick, then publishes or queues it.",
    needs: "Your brand set up. Connect a channel to publish straight from here; without one you copy the post out.",
    href: "/dashboard/content", cta: "Open the Content Factory",
  },
  {
    icon: Plane, title: "AI travel advert creator",
    does: "Ad copy and creative built around your offer — destination, season, price and the reason to book now. Travel is one of the industry profiles the engine reads, so the vocabulary, channels and buyer roles are the travel ones rather than a generic advert.",
    needs: "Your offer and price. Set the industry to travel or tourism on the brand and the profile applies everywhere, not just here.",
    href: "/dashboard/campaigns", cta: "Build the advert",
  },
  {
    icon: Mail, title: "AI email campaign generator",
    does: "Writes the campaign, previews it through the real send path against real contacts, then sends from your own authenticated domain.",
    needs: "Contacts with consent in the Vault. A verified sending domain to send as yourself.",
    href: "/dashboard/email", cta: "Open the Email Centre",
  },
  {
    icon: Layers, title: "AI landing page builder",
    does: "Picks the page type from your objective, builds the full section structure and publishes it on a live URL with its own analytics.",
    needs: "What the page is for and what you want the visitor to do.",
    href: "/dashboard/landing-builder", cta: "Build a page",
  },
  {
    icon: Video, title: "AI video script generator",
    does: "Hook, script and shot list for a short — plus clip-finding that reads a long recording and returns the moments worth cutting.",
    needs: "A subject, or a recording to cut clips out of.",
    href: "/dashboard/video", cta: "Open the Video War Room",
  },
  {
    icon: MousePointerClick, title: "AI performance recommendations",
    does: "Compares your channels by what a customer actually costs on each, and names where the next one is cheapest.",
    needs: "Spend and results on at least one channel. It says so rather than guessing when there is nothing to compare.",
    href: "/dashboard/roi", cta: "Open the ROI Engine",
  },
  {
    icon: Users, title: "AI audience optimisation",
    does: "Ranks your contacts into segments by recency, value, churn risk and intent, each with the offer and channel that fits it.",
    needs: "Your customer list imported into the Vault.",
    href: "/dashboard/segments", cta: "Open Segments",
  },
  {
    icon: BarChart3, title: "AI campaign analytics",
    does: "Every campaign carries a verdict — SCALE, FIX or STOP — against the kill numbers agreed before launch, with a rate refused outright when the sample is too small to carry one.",
    needs: "A running campaign. Connect an ad account and pausing happens automatically.",
    href: "/dashboard/war-room", cta: "Open the War Room",
  },
];

export default function GrowthEnginePage() {
  const { activeBrand } = useActiveBrand();

  // --- hashtags ---
  const [postText, setPostText] = useState("");
  const [platform, setPlatform] = useState<string>("instagram");
  const [campaign, setCampaign] = useState("");
  const [sets, setSets] = useState<HashtagSet[] | null>(null);
  const [tagging, setTagging] = useState(false);

  // --- posting times ---
  const [advice, setAdvice] = useState<PostingAdvice | null>(null);
  const [timing, setTiming] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const places = (activeBrand?.location ? [activeBrand.location] : []).filter(Boolean);

  async function makeTags() {
    setTagging(true); setErr(null);
    try {
      const r = await authedFetch("/api/growth-engine", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "hashtags", text: postText, platform,
          brandName: activeBrand?.name || "", industry: activeBrand?.industry || "",
          places, campaign,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "Couldn't build the tags."); return; }
      // Normalised here rather than trusted: the render maps these, and an
      // absent array throws into the global boundary.
      setSets((Array.isArray(d.sets) ? d.sets : []).map((s2: HashtagSet) => ({
        ...s2,
        use: Array.isArray(s2?.use) ? s2.use : [],
        alsoConsidered: Array.isArray(s2?.alsoConsidered) ? s2.alsoConsidered : [],
        warnings: Array.isArray(s2?.warnings) ? s2.warnings : [],
        rule: s2?.rule ?? { hardCap: null, suggested: 0, note: "" },
      })));
    } catch { setErr("Couldn't reach the growth engine."); }
    finally { setTagging(false); }
  }

  const loadTimes = useCallback(async () => {
    if (!activeBrand) { setAdvice(null); return; }
    setTiming(true);
    try {
      const r = await authedFetch("/api/growth-engine", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "posting-times", brandId: activeBrand.id, market: activeBrand.targetMarket ?? null }),
      });
      const d = await r.json();
      if (r.ok && d && d.basis) {
        setAdvice({ ...d, windows: Array.isArray(d.windows) ? d.windows : [], days: Array.isArray(d.days) ? d.days : [] });
      }
    } catch { /* the panel simply stays empty */ }
    finally { setTiming(false); }
  }, [activeBrand]);
  useEffect(() => { loadTimes(); }, [loadTimes]);

  const basisTone = advice?.basis === "measured" ? "good" : advice?.basis === "market-hours" ? "info" : "warn";

  return (
    <div>
      <PageHeader
        kicker="AI Growth Engine"
        title="Ten built-in tools to maximise your reach"
        subtitle="Everything here runs on your own data or your own words. Where a number cannot be measured, this page says so rather than printing one — which is the difference between a tool you can act on and a tool that looks busy."
      />

      {/* ---------------------------------------------------------------- */}
      {/* Hashtags — built here                                            */}
      {/* ---------------------------------------------------------------- */}
      <div className="card mb-6 p-5">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Hash className="h-4 w-4 text-emerald-400" />
          <h2 className="font-display font-bold text-white">AI hashtag generator</h2>
          <Pill tone="good">no invented reach figures</Pill>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Tags come out of the post you wrote, your brand, your industry and the places you sell in — and each one tells you where it came from. Nothing here shows a volume or reach number, because nobody selling a hashtag tool can measure either for your account.
        </p>
        <textarea
          value={postText} onChange={(e) => setPostText(e.target.value)} rows={4}
          placeholder="Paste the post you are about to publish…"
          className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-emerald-500/60"
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-400">Platform</span>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)}
              className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/60">
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-slate-400">Your campaign tag (optional)</span>
            <input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="summer24"
              className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-emerald-500/60" />
          </label>
        </div>
        <button onClick={makeTags} disabled={tagging} className="btn-primary mt-3 text-xs disabled:opacity-60">
          {tagging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hash className="h-3.5 w-3.5" />} Generate tags
        </button>
        {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}

        {sets?.map((s) => (
          <div key={s.platform} className="mt-4 rounded-lg border border-white/[0.08] p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-white">{s.platform}</span>
              <Pill tone="info">{s.rule.hardCap ? `limit ${s.rule.hardCap}` : "no published limit"}</Pill>
              <Pill tone="neutral">use ~{s.rule.suggested}</Pill>
            </div>
            <p className="font-mono text-sm text-emerald-300">{s.use.map((t) => t.tag).join(" ")}</p>
            <ul className="mt-2 space-y-1">
              {s.use.map((t) => (
                <li key={t.tag} className="text-[11px] text-slate-500"><span className="text-slate-300">{t.tag}</span> — {t.because}</li>
              ))}
            </ul>
            {s.alsoConsidered.length > 0 && (
              <p className="mt-2 text-[11px] text-slate-500">
                Also available, left out to stay inside what works on {s.platform}: {s.alsoConsidered.map((t) => t.tag).join(" ")}
              </p>
            )}
            {s.warnings.map((w) => <p key={w} className="mt-2 text-[11px] text-amber-300">{w}</p>)}
            <p className="mt-2 border-t border-white/[0.06] pt-2 text-[11px] text-slate-500">{s.rule.note}</p>
          </div>
        ))}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Posting times — built here                                       */}
      {/* ---------------------------------------------------------------- */}
      <div className="card mb-8 p-5">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Clock className="h-4 w-4 text-emerald-400" />
          <h2 className="font-display font-bold text-white">AI best posting time recommendations</h2>
          {advice && (
            <Pill tone={basisTone}>
              {advice.basis === "measured" ? "measured from your own data" : advice.basis === "market-hours" ? "your market's hours — not a finding" : "not enough to say"}
            </Pill>
          )}
        </div>
        {timing && <p className="text-xs text-slate-500">Reading your delivery ledger…</p>}
        {advice && (
          <>
            <p className="mb-2 text-sm text-slate-300">{advice.headline}</p>
            {advice.windows.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {advice.windows.map((w) => (
                  <span key={w.hour} className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-1.5 text-xs">
                    <span className="font-bold text-emerald-300">{w.label}</span>
                    {advice.basis === "measured" && <span className="text-slate-400"> · {w.clicks} clicks, {w.opens} opens</span>}
                  </span>
                ))}
              </div>
            )}
            {advice.basis === "measured" && advice.days.some((d) => d.clicks || d.opens) && (
              <p className="mb-2 text-[11px] text-slate-500">
                Busiest days: {advice.days.filter((d) => d.clicks || d.opens).slice(0, 3).map((d) => `${d.day} (${d.clicks} clicks)`).join(", ")}
              </p>
            )}
            <p className="text-[11px] text-slate-500">{advice.caveat}</p>
          </>
        )}
        {!advice && !timing && <p className="text-xs text-slate-500">Pick a brand to see this.</p>}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* The eight that already ship                                      */}
      {/* ---------------------------------------------------------------- */}
      <h2 className="mb-3 font-display text-lg font-bold text-white">The rest of the engine</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {TOOLS.map((t) => (
          <div key={t.title} className="card flex flex-col p-5">
            <div className="mb-2 flex items-center gap-2">
              <t.icon className="h-4 w-4 text-emerald-400" />
              <h3 className="font-display text-sm font-bold text-white">{t.title}</h3>
            </div>
            <p className="text-xs leading-relaxed text-slate-400">{t.does}</p>
            <p className="mt-2 flex-1 text-[11px] leading-relaxed text-slate-500"><span className="font-semibold text-slate-400">What it needs: </span>{t.needs}</p>
            <Link href={t.href} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300">
              {t.cta} →
            </Link>
          </div>
        ))}
      </div>

      <p className="mt-6 flex items-start gap-2 text-[11px] text-slate-500">
        <Target className="mt-0.5 h-3 w-3 shrink-0" />
        <span>
          Every tool above is on every plan. What an action costs comes out of your monthly AI credits, so the price is the work it does rather than the tier you are on — and the two tools on this page cost nothing at all, because neither of them calls an AI provider.
        </span>
      </p>
      <p className="mt-2 flex items-start gap-2 text-[11px] text-slate-500">
        <ImageIcon className="mt-0.5 h-3 w-3 shrink-0" />
        <span>Creative for any of these is generated in the <Link href="/dashboard/studio" className="text-emerald-400 hover:text-emerald-300">Brand Studio</Link>, on your own palette and logo.</span>
      </p>
    </div>
  );
}
