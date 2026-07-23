"use client";

// Billing & ACUs — the commercial surface. Renders the owner's finalised 8-plan
// model + the ACU wallet LIVE from /api/subscription (single source of truth in
// src/backend/subscription.ts). £1 = 100 ACUs; every plan auto-allocates 20% of
// the price paid as ACUs; annual = 30% off with ACUs released monthly. Pricing
// rule: charge = provider cost × 4 = a 300% markup = 75% gross margin. Provider
// cost is never shown to the customer. Wallet figures are Demo Intelligence
// until Stripe + the acu_ledger go live. (Upgrades the earlier placeholder
// £9–£99 ladder — the finalised model supersedes it per REQUIREMENTS-COVERAGE.)

import { useEffect, useState } from "react";
import { Check, Loader2, Wallet, Zap, TrendingUp, Star } from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";
import { authedFetch } from "@/frontend/api-client";

type PlanEconomics = {
  id: string; name: string; monthlyGbp: number; annualGbp: number; annualSavingGbp: number;
  monthlyAcus: number; annualAcus: number; annualMonthlyReleaseAcus: number;
  defaultTopUpGbp: number; defaultTopUpAcus: number;
  brands: number | "custom"; users: number | "custom"; storageGb: number; custom?: boolean;
};
type SubResponse = {
  plans: PlanEconomics[];
  markupCorrection: { markupMultiplier: number; markupPct: number; grossMarginPct: number };
  topUps: { gbp: number; acus: number }[];
};

const RECOMMENDED = "growth";
const fmtGbp = (n: number) => (n === 0 ? "£0" : `£${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`);
const fmtStorage = (gb: number) => (gb < 1 ? `${gb * 1000} MB` : gb >= 1024 ? `${gb / 1024} TB` : `${gb} GB`);
const cap = (v: number | "custom") => (v === "custom" ? "Custom" : v.toLocaleString("en-GB"));

const PLAN_FEATURES: Record<string, string[]> = {
  free: ["1 brand · 1 user", "Basic campaign builder", "Community support"],
  starter: ["Brand kit + content calendar", "Image & copy studio", "Basic video repurposing"],
  growth: ["VisualStrike + SiteRaid engines", "Video clipping & repurposing", "Social listening + competitor watch"],
  scale: ["Advanced VideoDominance AI", "Bulk production + A/B testing", "CRM + ecommerce integrations"],
  business: ["Autonomous campaign war room", "Guarded publishing autopilot", "Creative Genome + attribution"],
  enterprise: ["Business units + budgets", "SSO + advanced audit trails", "Dedicated success manager"],
  corporate: ["Central marketing command", "Global campaign governance", "Data residency options"],
  global: ["Bring-your-own-provider", "Private models where supported", "Dedicated implementation team"],
};

export default function BillingPage() {
  const [data, setData] = useState<SubResponse | null>(null);
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const [error, setError] = useState(false);
  const [buying, setBuying] = useState<number | null>(null);
  const [checkout, setCheckout] = useState<{ ok: boolean; mode: string; url: string | null; acus: number; note: string; error?: string } | null>(null);

  useEffect(() => {
    fetch("/api/subscription").then((r) => r.json()).then(setData).catch(() => setError(true));
  }, []);

  async function buyTopup(gbp: number, acus: number) {
    setBuying(gbp); setCheckout(null);
    try {
      const res = await authedFetch("/api/billing/topup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountGbp: gbp, acus }),
      });
      const r = await res.json();
      setCheckout(r);
      // Live Stripe link → go straight to checkout; demo → show the link + note.
      if (r.ok && r.url && r.mode === "live") window.location.href = r.url;
    } catch {
      setCheckout({ ok: false, mode: "demo", url: null, acus, note: "Network error" });
    } finally { setBuying(null); }
  }

  // Wallet keyed off the plan's monthly allocation. Real per-account metering
  // activates with billing (Stripe) — until then spend is 0 (never fabricated).
  const currentPlan = data?.plans.find((p) => p.id === "growth");
  const allocation = currentPlan?.monthlyAcus ?? 980;
  const spent = 0;
  const topUpAcus = 0;
  const balance = allocation + topUpAcus - spent;

  return (
    <div>
      <PageHeader
        kicker="Commercial"
        title="Billing & ACUs"
        subtitle="One subscription for the operating system. ACUs pay for metered AI usage — £1 = 100 ACUs. Every plan includes an automatic AI credit allowance; add ACUs any time without changing your plan."
        actions={
          <div className="flex items-center gap-1 rounded-full border border-ink-700 bg-ink-850 p-1 text-xs font-semibold">
            <button onClick={() => setCycle("monthly")} className={`rounded-full px-3 py-1.5 ${cycle === "monthly" ? "bg-emerald-500 text-ink-950" : "text-slate-300"}`}>Monthly</button>
            <button onClick={() => setCycle("annual")} className={`rounded-full px-3 py-1.5 ${cycle === "annual" ? "bg-emerald-500 text-ink-950" : "text-slate-300"}`}>Annual · save 30%</button>
          </div>
        }
      />

      {/* ACU wallet — real allocation; live metering activates with billing */}
      <div className="mb-8 grid gap-4 lg:grid-cols-4">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2"><Wallet className="h-4 w-4 text-emerald-400" /><h2 className="font-display font-bold text-white">ACU Wallet</h2></div>
          <div className="flex items-end justify-between">
            <div>
              <p className="font-display text-3xl font-bold text-white">{balance.toLocaleString("en-GB")}<span className="ml-1 text-sm font-normal text-slate-400">ACUs</span></p>
              <p className="mt-1 text-xs text-slate-400">≈ {fmtGbp(balance / 100)} of AI usage available</p>
            </div>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-ink-950 hover:bg-emerald-400"><Zap className="h-4 w-4" /> Top up</button>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink-800">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: "100%" }} />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-slate-500"><span>0 spent this cycle</span><span>Live per-use metering activates with billing</span></div>
        </div>
        <div className="card p-5 lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">This month&apos;s allocation</p>
          <p className="mt-1 font-display text-2xl font-bold text-emerald-400">{allocation.toLocaleString("en-GB")}</p>
          <p className="text-xs text-slate-400">Your plan&apos;s automatic AI credit — auto-credited each cycle. Add ACUs any time without changing your plan.</p>
        </div>
      </div>

      {/* Plans */}
      <div className="mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-400" /><h2 className="font-display text-base font-bold text-white">Plans</h2>{data && <span className="text-xs text-slate-500">· {data.plans.length} tiers</span>}</div>

      {error && <p className="text-sm text-rose-300">Could not load plans.</p>}
      {!data && !error && <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading plans…</div>}

      {data && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.plans.map((p) => {
            const isRec = p.id === RECOMMENDED;
            const price = p.custom ? "From " + fmtGbp(cycle === "annual" ? p.annualGbp : p.monthlyGbp) : fmtGbp(cycle === "annual" ? p.annualGbp : p.monthlyGbp);
            const per = p.monthlyGbp === 0 ? "" : cycle === "annual" ? "/yr" : "/mo";
            const acus = cycle === "annual" ? p.annualMonthlyReleaseAcus : p.monthlyAcus;
            return (
              <div key={p.id} className={`card relative flex flex-col p-4 ${isRec ? "border-emerald-500/50 ring-1 ring-emerald-500/30" : ""}`}>
                {isRec && <span className="absolute -top-2 left-4 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-ink-950"><Star className="h-3 w-3" /> Popular</span>}
                <h3 className="font-display text-sm font-bold text-white">{p.name}</h3>
                <p className="mt-1"><span className="font-display text-2xl font-bold text-white">{price}</span><span className="text-xs text-slate-400">{per}</span></p>
                {p.monthlyGbp === 0 ? (
                  <p className="mt-1 text-xs text-emerald-300">100 ACUs / year</p>
                ) : (
                  <p className="mt-1 text-xs text-emerald-300">{acus.toLocaleString("en-GB")} ACUs/mo{cycle === "annual" ? " released" : ""}</p>
                )}
                {cycle === "annual" && p.annualSavingGbp > 0 && <p className="text-[11px] text-slate-500">save {fmtGbp(p.annualSavingGbp)}</p>}
                <div className="mt-3 space-y-1 text-[11px] text-slate-400">
                  <div className="flex justify-between"><span>Brands</span><span className="text-slate-200">{cap(p.brands)}</span></div>
                  <div className="flex justify-between"><span>Users</span><span className="text-slate-200">{cap(p.users)}</span></div>
                  <div className="flex justify-between"><span>Storage</span><span className="text-slate-200">{fmtStorage(p.storageGb)}</span></div>
                  {p.defaultTopUpAcus > 0 && <div className="flex justify-between"><span>1-click top-up</span><span className="text-slate-200">{fmtGbp(p.defaultTopUpGbp)} = {p.defaultTopUpAcus}</span></div>}
                </div>
                <ul className="mt-3 space-y-1">
                  {(PLAN_FEATURES[p.id] ?? []).map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-[11px] text-slate-300"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" /> {f}</li>
                  ))}
                </ul>
                <button className={`mt-4 rounded-lg px-3 py-2 text-xs font-semibold ${isRec ? "bg-emerald-500 text-ink-950 hover:bg-emerald-400" : "border border-ink-700 text-slate-200 hover:border-emerald-500"}`}>
                  {p.monthlyGbp === 0 ? "Start free" : p.custom ? "Contact sales" : "Choose " + p.name}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Top-ups */}
      {data && (
        <div className="mt-8">
          <div className="mb-3 flex items-center gap-2"><Zap className="h-4 w-4 text-emerald-400" /><h2 className="font-display text-base font-bold text-white">ACU top-ups</h2><Pill tone="neutral">no discount — protects the 4× rule</Pill></div>
          <div className="flex flex-wrap gap-2">
            {data.topUps.map((t) => (
              <button key={t.gbp} onClick={() => buyTopup(t.gbp, t.acus)} disabled={buying !== null} className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-emerald-500 disabled:opacity-50">
                {buying === t.gbp ? "…" : <>{fmtGbp(t.gbp)} <span className="text-emerald-300">= {t.acus.toLocaleString("en-GB")} ACUs</span></>}
              </button>
            ))}
          </div>
          {checkout && (
            <div className="mt-3 rounded-lg border border-white/[0.07] bg-ink-900/60 p-3 text-xs">
              {checkout.ok && checkout.url ? (
                <p className="text-slate-300">
                  <span className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${checkout.mode === "live" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>{checkout.mode === "live" ? "Redirecting to Stripe" : "Demo link"}</span>
                  {checkout.acus.toLocaleString("en-GB")} ACUs · {checkout.mode === "live" ? "complete payment to credit your wallet." : <a href={checkout.url} className="text-sky-300 underline">{checkout.url}</a>} <span className="text-slate-500">{checkout.note}</span>
                </p>
              ) : (
                <p className="text-rose-300">{checkout.error || checkout.note}</p>
              )}
            </div>
          )}
          <p className="mt-4 text-xs text-slate-500">Subscription pays for access and operating capacity. ACUs pay for AI consumption. Add-ons pay for structural expansion. Provider cost is never shown — you only ever see ACUs. Top-ups carry no discount, protecting the 4× provider-cost recovery.</p>
        </div>
      )}
    </div>
  );
}
