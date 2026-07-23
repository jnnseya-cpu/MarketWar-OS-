"use client";

// MarketWar Organic Dominance OS — Command Centre (Phase 1 foundation).
// The autonomous demand-intelligence surface: run the Website-to-Growth workup,
// see the keyword/prompt universes, competitor gaps and SCORED opportunities
// (transparent §13 formula), and turn each into a one-click action that routes
// into the engines you already have. Honest data-source gating: capabilities
// needing licensed external data say "connect a source" — never fake numbers.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2, Radar, Search, Sparkles, Target, Gauge, Plug, ArrowRight, ShieldCheck,
  MessageSquare, FileText, LayoutTemplate, Swords, Rocket, CheckCircle2, Circle,
} from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import ExportButton from "@/components/ExportButton";

type Factors = { demand: number; commercialIntent: number; relevance: number; timing: number; authorityProbability: number; conversionProbability: number; competition: number };
type Opportunity = { title: string; category: string; factors: Factors; score: number; recommendedAction: string; actionType: string };
type KeywordItem = { keyword: string; cluster: string; intent: string; commercialScore: number };
type PromptItem = { prompt: string; category: string; commercialScore: number };
type CompetitorGap = { competitor: string; weakness: string; exploit: string };
type Result = {
  mode: "live" | "scaffold"; business: string;
  businessProfile: { whatTheyDo: string; audience: string; valueProps: string[]; locations: string[] };
  keywordUniverse: KeywordItem[]; promptUniverse: PromptItem[]; competitorGaps: CompetitorGap[];
  opportunities: Opportunity[]; contentPillars: { pillar: string; why: string }[];
  ninetyDayPlan: { phase: string; focus: string; actions: string[] }[]; note: string;
};
type NavSection = { n: number; label: string; status: "foundation" | "live" | "connect"; route?: string; note: string };
type DataSource = { key: string; label: string; category: string; connected: boolean; unlocks: string };
type Meta = { navigation: NavSection[]; dataSources: DataSource[] };

// One-click actions → real destinations that already exist in the OS.
const ACTION_ROUTES: Record<string, { label: string; icon: typeof FileText; href: string }> = {
  create_article: { label: "Create article", icon: FileText, href: "/dashboard/content" },
  create_landing: { label: "Build landing page", icon: LayoutTemplate, href: "/dashboard/landing-builder" },
  create_comparison: { label: "Comparison page", icon: Swords, href: "/dashboard/competitors" },
  create_offer: { label: "Create offer", icon: Sparkles, href: "/dashboard/offers" },
  brief_sales: { label: "Brief the team", icon: MessageSquare, href: "/dashboard/prospecting" },
  launch_campaign: { label: "Launch campaign", icon: Rocket, href: "/dashboard/campaigns" },
  add_to_pipeline: { label: "Add to pipeline", icon: Target, href: "/dashboard/war-room" },
  publish: { label: "Publish", icon: ArrowRight, href: "/dashboard/publish" },
  monitor: { label: "Monitor", icon: Radar, href: "/dashboard/competitors" },
};

const scoreTone = (n: number): "good" | "warn" | "bad" => (n >= 55 ? "good" : n >= 30 ? "warn" : "bad");
const intentTone = (i: string): "good" | "warn" | "neutral" => (i === "transactional" ? "good" : i === "commercial" || i === "local" ? "warn" : "neutral");

export default function OrganicDominancePage() {
  const { activeBrand } = useActiveBrand();
  const router = useRouter();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    fetch("/api/organic-dominance").then((r) => r.json()).then((d) => setMeta({ navigation: d.navigation, dataSources: d.dataSources })).catch(() => {});
  }, []);
  useEffect(() => {
    if (activeBrand) {
      setWebsite((w) => w || activeBrand.website || "");
      setLocation((l) => l || activeBrand.location || "");
      setDescription((d) => d || [activeBrand.product, activeBrand.audience, activeBrand.offer].filter(Boolean).join(" · "));
    }
  }, [activeBrand]);

  async function runWorkup() {
    setBusy(true);
    try {
      const res = await fetch("/api/organic-dominance", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "onboard",
          business: activeBrand?.name || website || "your business",
          website, description,
          competitors: competitors.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
          location,
        }),
      });
      setResult(await res.json());
    } finally { setBusy(false); }
  }

  const connectedSources = meta?.dataSources.filter((s) => s.connected).length ?? 0;

  return (
    <div>
      <PageHeader
        kicker="MarketWar Organic Dominance OS"
        title="Listen → Predict → Decide → Create → Publish → Capture → Convert → Attribute → Optimise"
        subtitle="The autonomous demand-intelligence engine. Turn a website into a growth engine: it builds your keyword + AI-prompt universes, finds competitor gaps, scores every opportunity by real commercial value, and turns each into a one-click action into the engines you already run. Metrics are computed from real signals or honestly marked 'connect a source' — never fabricated."
        actions={<Pill tone="info">demand intelligence · execution loop</Pill>}
      />

      {/* Turn this website into a growth engine */}
      <div className="mb-6 card border-emerald-500/30 p-6">
        <div className="mb-3 flex items-center gap-2"><Radar className="h-5 w-5 text-emerald-400" /><h2 className="font-display text-lg font-bold text-white">Turn this website into a growth engine</h2></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Website</label><input className="input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://yourbusiness.co.uk" /></div>
          <div><label className="label">Location / market</label><input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Kinshasa, Birmingham" /></div>
          <div className="sm:col-span-2"><label className="label">What you do — products, audience, offer (the more you give, the sharper the workup)</label><textarea className="input min-h-[70px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What you sell, who you serve, your main offer" /></div>
          <div className="sm:col-span-2"><label className="label">Competitors (comma or line separated)</label><input className="input" value={competitors} onChange={(e) => setCompetitors(e.target.value)} placeholder="competitor one, competitor two, competitor three" /></div>
        </div>
        <button className="btn-primary mt-4" onClick={runWorkup} disabled={busy}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Building your growth engine…</> : <><Sparkles className="h-4 w-4" /> Run the intelligence workup</>}
        </button>
      </div>

      {result && (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Pill tone={result.mode === "live" ? "good" : "warn"}>{result.mode === "live" ? "Live AI analysis" : "Structural scaffold"}</Pill>
              <span className="text-xs text-slate-500">{result.keywordUniverse.length} keywords · {result.promptUniverse.length} prompts · {result.opportunities.length} scored opportunities</span>
            </div>
            <ExportButton dataset="organic-dominance-workup" label="Export workup"
              rows={result.opportunities.map((o) => ({ title: o.title, category: o.category, score: o.score, action: o.recommendedAction }))}
              json={result}
              report={{ title: `Organic Dominance workup — ${result.business}`, bodyHtml: workupHtml(result) }}
            />
          </div>
          {result.note && <p className="mb-6 rounded-lg border border-white/10 bg-ink-900/50 p-3 text-xs text-slate-400">{result.note}</p>}

          {/* Scored opportunities → one-click actions */}
          <div className="mb-6 card p-6">
            <div className="mb-3 flex items-center gap-2"><Target className="h-5 w-5 text-emerald-400" /><h3 className="font-display font-bold text-white">Opportunity Radar</h3><span className="text-xs text-slate-500">score = demand × intent × relevance × timing × authority × conversion ÷ competition</span></div>
            <div className="space-y-2">
              {result.opportunities.map((o, i) => {
                const act = ACTION_ROUTES[o.actionType] || ACTION_ROUTES.create_article;
                const Icon = act.icon;
                return (
                  <div key={i} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-ink-900/50 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-white">{o.title} <span className="text-xs font-normal text-slate-500">· {o.category}</span></p>
                      <p className="text-xs text-slate-400">{o.recommendedAction}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Pill tone={scoreTone(o.score)}>score {o.score}</Pill>
                      <button onClick={() => router.push(act.href)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25">
                        <Icon className="h-3.5 w-3.5" /> {act.label}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Universes */}
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <div className="card p-6">
              <div className="mb-3 flex items-center gap-2"><Search className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Keyword universe</h3></div>
              <div className="space-y-1.5">
                {result.keywordUniverse.map((k, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-slate-200">{k.keyword} <span className="text-slate-600">· {k.cluster}</span></span>
                    <Pill tone={intentTone(k.intent)}>{k.intent}</Pill>
                  </div>
                ))}
              </div>
            </div>
            <div className="card p-6">
              <div className="mb-3 flex items-center gap-2"><Sparkles className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">AI-prompt universe</h3><span className="text-[10px] text-slate-500">what buyers ask assistants</span></div>
              <div className="space-y-1.5">
                {result.promptUniverse.map((p, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-slate-200">{p.prompt}</span>
                    <Pill tone={p.commercialScore >= 0.75 ? "good" : "neutral"}>{p.category}</Pill>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Competitor gaps + content pillars */}
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            {result.competitorGaps.length > 0 && (
              <div className="card p-6">
                <div className="mb-3 flex items-center gap-2"><Swords className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Competitor gaps to exploit</h3></div>
                <div className="space-y-2">
                  {result.competitorGaps.map((c, i) => (
                    <div key={i} className="rounded-lg border border-white/[0.07] bg-ink-900/50 p-2.5 text-sm">
                      <p className="font-semibold text-white">{c.competitor}</p>
                      <p className="text-xs text-amber-200/80">Weakness: {c.weakness}</p>
                      <p className="text-xs text-emerald-300/90">Exploit: {c.exploit}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {result.contentPillars.length > 0 && (
              <div className="card p-6">
                <div className="mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Content pillars</h3></div>
                <div className="space-y-2">
                  {result.contentPillars.map((c, i) => (
                    <div key={i} className="rounded-lg border border-white/[0.07] bg-ink-900/50 p-2.5 text-sm"><p className="font-semibold text-white">{c.pillar}</p><p className="text-xs text-slate-400">{c.why}</p></div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 90-day plan */}
          {result.ninetyDayPlan.length > 0 && (
            <div className="mb-6 card p-6">
              <div className="mb-3 flex items-center gap-2"><Rocket className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">90-day growth plan</h3></div>
              <div className="grid gap-3 sm:grid-cols-3">
                {result.ninetyDayPlan.map((p, i) => (
                  <div key={i} className="rounded-lg border border-white/[0.07] bg-ink-900/50 p-3">
                    <p className="text-sm font-bold text-emerald-300">{p.phase}</p>
                    <p className="mb-2 text-xs text-slate-400">{p.focus}</p>
                    <ul className="space-y-1 text-xs text-slate-300">{p.actions.map((a, j) => <li key={j}>· {a}</li>)}</ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Data sources — honest connection status */}
      {meta && (
        <div className="mb-6 card p-6">
          <div className="mb-3 flex items-center gap-2"><Plug className="h-5 w-5 text-emerald-400" /><h3 className="font-display font-bold text-white">Data sources</h3><Pill tone={connectedSources > 0 ? "good" : "neutral"}>{connectedSources}/{meta.dataSources.length} connected</Pill></div>
          <p className="mb-3 text-xs text-slate-500">Live listening, search volumes and AI-answer citations activate when their source is connected. Until then those metrics stay honestly blank — never invented.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {meta.dataSources.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.07] bg-ink-900/50 p-2.5 text-sm">
                <div><p className="font-semibold text-white">{s.label}</p><p className="text-xs text-slate-500">{s.unlocks}</p></div>
                {s.connected ? <Pill tone="good"><CheckCircle2 className="mr-1 inline h-3 w-3" />connected</Pill> : <Pill tone="neutral">connect</Pill>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* The 20-section module map */}
      {meta && (
        <div className="card p-6">
          <div className="mb-3 flex items-center gap-2"><Gauge className="h-5 w-5 text-emerald-400" /><h3 className="font-display font-bold text-white">Organic Dominance module map</h3></div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {meta.navigation.map((s) => {
              const tone = s.status === "live" ? "good" : s.status === "foundation" ? "info" : "neutral";
              const inner = (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-ink-900/40 p-2.5 text-sm transition hover:border-emerald-500/30">
                  <span className="flex items-center gap-2 text-slate-200">
                    {s.status === "connect" ? <Circle className="h-3.5 w-3.5 text-slate-600" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                    <span className="text-slate-500">{s.n}.</span> {s.label}
                  </span>
                  <Pill tone={tone}>{s.status === "foundation" ? "live here" : s.status === "live" ? "wired" : "connect source"}</Pill>
                </div>
              );
              return s.route ? <Link key={s.n} href={s.route} title={s.note}>{inner}</Link> : <div key={s.n} title={s.note}>{inner}</div>;
            })}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5" /> Sections marked &ldquo;connect source&rdquo; need licensed external data (live social listening, AI-answer monitoring, backlink indexes) — we never fabricate those figures.</p>
        </div>
      )}
    </div>
  );
}

// Branded report body for the export.
function workupHtml(r: Result): string {
  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
  const opps = r.opportunities.map((o) => `• [${o.score}] ${esc(o.title)} — ${esc(o.recommendedAction)}`).join("\n");
  const kws = r.keywordUniverse.map((k) => `• ${esc(k.keyword)} (${k.intent})`).join("\n");
  const prompts = r.promptUniverse.map((p) => `• ${esc(p.prompt)}`).join("\n");
  const plan = r.ninetyDayPlan.map((p) => `<h2>${esc(p.phase)} — ${esc(p.focus)}</h2>\n${p.actions.map((a) => "• " + esc(a)).join("\n")}`).join("\n\n");
  return `<h2>Business</h2>\n${esc(r.businessProfile.whatTheyDo)}\nAudience: ${esc(r.businessProfile.audience)}\n\n<h2>Top opportunities</h2>\n${opps}\n\n<h2>Keyword universe</h2>\n${kws}\n\n<h2>AI-prompt universe</h2>\n${prompts}\n\n${plan}`;
}
