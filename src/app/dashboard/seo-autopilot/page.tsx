"use client";

// SEO Autopilot — the customer's own branded blog.
//
// Set the topics you want to rank for, choose manual or automatic, and the OS
// writes and publishes them. Every post uses ACUs from the plan's own monthly
// allowance (no separate SEO fee), and the panel states exactly how many posts
// that allowance covers and how many the balance affords right now — so the cost
// is never a surprise.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, PenLine, Rocket, CheckCircle2, XCircle, ExternalLink, Link2, Layers } from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";
import SeoDeployPanel from "@/components/SeoDeployPanel";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";

type Settings = { enabled: boolean; cadence: "daily" | "weekly"; topics: string[]; keywords: string; autoPublish: boolean; lastRunAt?: string | null };
// `postsAffordableNow` is NULL, not zero, when the caller is not metered.
// Those are different facts and the button below depends on the difference:
// `null ?? 0` reads as "out of credits" and disables the one control the page
// exists for, which is how a server-side exemption dies at the browser.
type PlanInfo = { name: string; monthlyAcus: number; includedPostsPerMonth: number; balanceAcu: number; postsAffordableNow: number | null; unmetered?: boolean };
type Post = { slug: string; title: string; status: string; createdAt: string; url: string };
type Opportunity = { kind: string; title: string; url: string; domain: string; evidence: string; why: string; difficulty: string; priority: number; pitchAngle: string };
type OppReport = { mode: "live" | "demo"; opportunities: Opportunity[]; compliance: string; note: string };
type PageSpec = { slug: string; h1: string; title: string; metaDescription: string; links: { slug: string; label: string; group: string }[] };
type Batch = { pages: PageSpec[]; generated: number; duplicatesAvoided: number; interlinks: number; orphans: string[]; note: string };

export default function SeoAutopilotPage() {
  const { activeBrand } = useActiveBrand();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [acuPerPost, setAcuPerPost] = useState(25);
  const [note, setNote] = useState("");
  const [topicText, setTopicText] = useState("");
  const [busy, setBusy] = useState(false);
  const [writing, setWriting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  // Backlinks. The engine has existed since the SEO work landed and nothing in
  // the product ever called it, so a customer had no way to reach it.
  const [opps, setOpps] = useState<OppReport | null>(null);
  const [findingLinks, setFindingLinks] = useState(false);
  // The page builder. It has had an API since the SEO work landed and no way in.
  const [services, setServices] = useState("");
  const [places, setPlaces] = useState("");
  const [batch, setBatch] = useState<Batch | null>(null);
  const [building, setBuilding] = useState(false);

  const load = useCallback(async () => {
    if (!activeBrand) return;
    setBusy(true);
    try {
      const r = await authedFetch("/api/seo-autopilot", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "settings", brandId: activeBrand.id }),
      });
      const d = await r.json();
      if (!r.ok) { setMsg({ text: d.error || "Couldn't load settings.", error: true }); return; }
      setSettings(d.settings); setPlan(d.plan); setPosts(d.posts || []);
      setAcuPerPost(d.acuPerPost ?? 25); setNote(d.note || "");
      setTopicText((d.settings?.topics || []).join("\n"));
    } catch { setMsg({ text: "Couldn't reach the SEO engine.", error: true }); }
    finally { setBusy(false); }
  }, [activeBrand]);

  useEffect(() => { load(); }, [load]);

  // Services x places → one page each, joined to one another. Every link points
  // at a page in the same batch, so the set is a network a crawler can walk and
  // not one of them can 404.
  async function buildPages() {
    if (!activeBrand) return;
    const svc = services.split("\n").map((t) => t.trim()).filter(Boolean);
    const loc = places.split("\n").map((t) => t.trim()).filter(Boolean);
    if (!svc.length || !loc.length) { setMsg({ text: "Add at least one service and one place — the OS will not invent either.", error: true }); return; }
    setBuilding(true); setMsg(null);
    try {
      const r = await authedFetch("/api/programmatic-seo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "batch", brand: activeBrand.name, type: "location", services: svc, locations: loc, cap: 200 }),
      });
      const d = await r.json();
      if (!r.ok) { setMsg({ text: d.error || "Couldn't build the pages.", error: true }); return; }
      setBatch(d);
    } catch { setMsg({ text: "Couldn't reach the page builder.", error: true }); }
    finally { setBuilding(false); }
  }

  // Real pages where a link can be EARNED — found in live search, pitched by a
  // human from their own mailbox. Nothing here is placed, bought or injected:
  // that breaches Google's link spam policy and the penalty lands on the
  // customer's own domain, not ours.
  async function findBacklinks() {
    if (!activeBrand) return;
    setFindingLinks(true); setMsg(null);
    try {
      const r = await authedFetch("/api/link-opportunities", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: activeBrand.name, website: activeBrand.website || "", category: activeBrand.industry || "" }),
      });
      const d = await r.json();
      if (!r.ok) { setMsg({ text: d.error || "Couldn't search for link opportunities.", error: true }); return; }
      setOpps(d);
    } catch { setMsg({ text: "Couldn't reach the link engine.", error: true }); }
    finally { setFindingLinks(false); }
  }

  async function save(patch: Partial<Settings>) {
    if (!activeBrand) return;
    setBusy(true); setMsg(null);
    try {
      const r = await authedFetch("/api/seo-autopilot", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save", brandId: activeBrand.id,
          topics: topicText.split("\n").map((t) => t.trim()).filter(Boolean),
          ...patch,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setMsg({ text: d.error || "Couldn't save.", error: true }); return; }
      setSettings(d.settings);
      setMsg({ text: d.note || "Saved.", error: false });
    } finally { setBusy(false); }
  }

  async function writeNow() {
    if (!activeBrand) return;
    setWriting(true); setMsg(null);
    try {
      const r = await authedFetch("/api/seo-autopilot", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", brandId: activeBrand.id, brandName: activeBrand.name, website: activeBrand.website }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) { setMsg({ text: d.error || "Couldn't write the post.", error: true }); return; }
      setMsg({ text: `Published "${d.post.title}" — ${d.charged} ACUs used, ${d.balanceAcu} left.`, error: false });
      load();
    } catch { setMsg({ text: "Couldn't reach the SEO engine.", error: true }); }
    finally { setWriting(false); }
  }

  const topicCount = topicText.split("\n").filter((t) => t.trim()).length;

  if (!activeBrand) {
    return <div><PageHeader kicker="SEO Autopilot" title="Your own branded blog" /><div className="card p-5 text-sm text-slate-400">Add a brand in the switcher to set up SEO autopilot.</div></div>;
  }

  return (
    <div>
      <PageHeader kicker="SEO Autopilot" title="Rank while you sleep"
        subtitle="Set the topics you want to be found for. The OS writes and publishes them to your own branded blog, and pings Google and Bing. Every post comes out of your plan's ACU allowance — there is no separate SEO fee."
        actions={<button className="btn-ghost" onClick={load} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Refresh</button>} />

      {/* What the plan covers — cost is stated up front, never a surprise. */}
      {plan && (
        <div className="mb-6 card border-emerald-500/25 p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Included in your {plan.name} plan</p>
              <p className="mt-1 font-display text-3xl font-bold text-white">{plan.includedPostsPerMonth}<span className="ml-2 text-sm font-normal text-slate-400">posts / month</span></p>
              <p className="mt-1 text-xs text-slate-400">{plan.monthlyAcus.toLocaleString("en-GB")} ACUs a month · {acuPerPost} ACUs per post</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Balance now</p>
              <p className="mt-1 font-display text-2xl font-bold text-emerald-400">{plan.balanceAcu.toLocaleString("en-GB")} <span className="text-sm font-normal text-slate-400">ACUs</span></p>
              <p className="text-xs text-slate-400">
                {plan.unmetered ? "not charged for your account" : `covers ${plan.postsAffordableNow} more post${plan.postsAffordableNow === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>
          {!plan.unmetered && plan.postsAffordableNow === 0 && (
            <p className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Out of ACUs — <Link href="/dashboard/billing" className="font-semibold underline">top up or upgrade</Link> to keep publishing.
            </p>
          )}
          {note && <p className="mt-2 text-[11px] text-slate-500">{note}</p>}
        </div>
      )}

      {/* Autopilot ranks the blog it publishes here. The rest of the site — the
          pages that actually take the money — needs the same treatment, and
          this is where its title, description and schema get applied. */}
      <SeoDeployPanel brand={activeBrand} className="mb-6" />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Settings */}
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-3 font-display font-bold text-white">What should we write about?</h2>
          <label className="label" htmlFor="topics">Topics — one per line</label>
          <textarea id="topics" className="input min-h-[140px]" value={topicText} onChange={(e) => setTopicText(e.target.value)}
            placeholder={"How to choose a supplier in Manchester\nWhat our service costs and why\nCommon mistakes buyers make"} />
          <p className="mt-1 text-[11px] text-slate-500">{topicCount} topic{topicCount === 1 ? "" : "s"} · we rotate through them so nothing repeats. Nothing is invented — if this is empty, no post is written.</p>

          <label className="label mt-4" htmlFor="kw">Target keywords (optional)</label>
          <input id="kw" className="input" defaultValue={settings?.keywords || ""} onBlur={(e) => save({ keywords: e.target.value })} placeholder="e.g. commercial cleaning Manchester, office cleaners" />

          <div className="mt-4 space-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={settings?.enabled ?? false} onChange={(e) => save({ enabled: e.target.checked })} />
              Run automatically
            </label>
            <div className="flex items-center gap-2 pl-6">
              <span className="text-xs text-slate-400">Cadence</span>
              <select className="input !w-auto !py-1 text-xs" value={settings?.cadence || "weekly"} onChange={(e) => save({ cadence: e.target.value as "daily" | "weekly" })}>
                <option value="weekly">Weekly</option>
                <option value="daily">Daily</option>
              </select>
              <span className="text-[11px] text-slate-500">
                ≈ {settings?.cadence === "daily" ? 30 * acuPerPost : 4 * acuPerPost} ACUs / month
              </span>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={settings?.autoPublish ?? false} onChange={(e) => save({ autoPublish: e.target.checked })} />
              Publish straight away <span className="text-[11px] text-slate-500">(off = saved as a draft for you to review)</span>
            </label>
          </div>

          <button className="btn-ghost mt-4 w-full" onClick={() => save({})} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save topics
          </button>

          <div className="mt-4 border-t border-white/10 pt-4">
            <button className="btn-primary w-full" onClick={writeNow} disabled={writing || topicCount === 0 || (!plan?.unmetered && (plan?.postsAffordableNow ?? 0) === 0)}>
              {writing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
              {writing ? "Writing…" : `Write a post now — ${acuPerPost} ACUs`}
            </button>
            <p className="mt-1 text-center text-[11px] text-slate-500">Same cost whether you press this or autopilot runs it.</p>
          </div>

          {msg && (
            <p className={`mt-3 flex items-start gap-1.5 rounded-md px-3 py-2 text-sm ${msg.error ? "bg-rose-500/10 text-rose-300" : "bg-emerald-500/10 text-emerald-300"}`}>
              {msg.error ? <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />} {msg.text}
            </p>
          )}
        </div>

        {/* Posts */}
        <div className="card p-5 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display font-bold text-white">Your posts</h2>
            {settings?.lastRunAt && <Pill tone="neutral">last run {new Date(settings.lastRunAt).toLocaleDateString("en-GB")}</Pill>}
          </div>
          {posts.length === 0 ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center text-center">
              <Rocket className="mb-3 h-8 w-8 text-emerald-500/60" />
              <p className="max-w-xs text-sm text-slate-500">No posts yet. Add a few topics, then write your first one — or switch on autopilot and it happens on its own.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {posts.map((p) => (
                <div key={p.slug} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.08] p-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{p.title}</p>
                    <p className="text-[11px] text-slate-500">{new Date(p.createdAt).toLocaleDateString("en-GB")} · {p.status}</p>
                  </div>
                  <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300">
                    View <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Location pages, joined together */}
        <div className="card p-5 lg:col-span-3">
          <div className="mb-1 flex items-center gap-2">
            <Layers className="h-4 w-4 text-emerald-400" />
            <h2 className="font-display font-bold text-white">Service &times; place pages</h2>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            One page per service in each place you cover, each with its own title, meta description and structured data &mdash; and <span className="text-slate-300">linked to one another</span>, so the set is a network a crawler can walk instead of a pile of orphans. Nothing is invented: the pages come from the words you type here.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-400">Services &mdash; one per line</span>
              <textarea value={services} onChange={(e) => setServices(e.target.value)} rows={4} placeholder={"Boiler repair\nDrain clearance\nEmergency plumbing"}
                className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-emerald-500/60" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-400">Places you cover &mdash; one per line</span>
              <textarea value={places} onChange={(e) => setPlaces(e.target.value)} rows={4} placeholder={"Croydon\nBromley\nSutton"}
                className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-emerald-500/60" />
            </label>
          </div>
          <button onClick={buildPages} disabled={building} className="btn-primary mt-3 text-xs disabled:opacity-60">
            {building ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />} Build the pages
          </button>
          {batch && (
            <div className="mt-4">
              <div className="mb-2 flex flex-wrap gap-2">
                <Pill tone="good">{batch.generated} pages</Pill>
                <Pill tone="info">{batch.interlinks} internal links</Pill>
                {batch.orphans.length > 0 && <Pill tone="warn">{batch.orphans.length} with nothing pointing at them</Pill>}
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {batch.pages.slice(0, 25).map((pg) => (
                  <div key={pg.slug} className="rounded-lg border border-white/[0.08] p-3">
                    <p className="text-sm font-semibold text-white">{pg.h1}</p>
                    <p className="font-mono text-[11px] text-emerald-300">/{pg.slug}</p>
                    <p className="mt-1 text-xs text-slate-400">{pg.metaDescription}</p>
                    {pg.links.length > 0 && (
                      <p className="mt-1.5 text-[11px] text-slate-500">Links to {pg.links.length}: {pg.links.map((l) => l.label).join(", ")}</p>
                    )}
                  </div>
                ))}
              </div>
              {batch.pages.length > 25 && <p className="mt-2 text-[11px] text-slate-500">Showing the first 25 of {batch.pages.length}.</p>}
              <p className="mt-2 text-[11px] text-slate-500">{batch.note}</p>
            </div>
          )}
        </div>

        {/* Backlinks — earn, never place */}
        <div className="card p-5 lg:col-span-3">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display font-bold text-white"><Link2 className="h-4 w-4 text-emerald-400" /> Backlinks worth earning</h2>
            <button onClick={findBacklinks} disabled={findingLinks || !activeBrand} className="btn-primary text-xs disabled:opacity-60">
              {findingLinks ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />} Find pages that would link to you
            </button>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            Real pages found in live search — sites already naming you without a link, lists that exist to include businesses like yours, and publications already covering your category. Each comes with the evidence and what to say. <span className="text-slate-400">You send the message from your own mailbox.</span>
          </p>
          {!opps && <p className="text-xs text-slate-500">Nothing searched yet.</p>}
          {opps && opps.opportunities.length === 0 && (
            <p className="text-xs text-amber-300">{opps.note || "No opportunities came back for this brand yet."}</p>
          )}
          {opps && opps.opportunities.length > 0 && (
            <>
              <div className="space-y-2">
                {opps.opportunities.map((o) => (
                  <div key={o.url} className="rounded-lg border border-white/[0.08] p-3">
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-300">{o.kind.replace(/_/g, " ")}</span>
                      <span className="text-slate-500">{o.domain} · {o.difficulty} · priority {o.priority}</span>
                    </div>
                    <a href={o.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-sm font-semibold text-white hover:text-emerald-300">{o.title}</a>
                    <p className="mt-1 text-xs text-slate-400">{o.evidence}</p>
                    <p className="mt-1.5 text-xs text-slate-300"><span className="font-semibold text-white">Say this: </span>{o.pitchAngle}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 border-t border-white/[0.06] pt-2 text-[11px] text-slate-500">{opps.compliance || opps.note}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
