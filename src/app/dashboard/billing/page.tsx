import { ArrowUpRight, Building2, Check, Plus, Wallet, Zap } from "lucide-react";
import { AreaChart, DonutChart, HBarList } from "@/components/charts";
import { PageHeader, Pill, StatCard } from "@/components/ui";
import { demoAccountBrands } from "@/shared/demo";

// Billing & ACU module (M-21) — the AI economy surface. £1 = 100 ACUs;
// plan ladder per v3.0 spec §12.1 (£9–£99 band, docs/ai-os/08 §A.1b);
// every AI action priced at ≥ 2× provider cost (owner doctrine §A.1a).
// Demo Intelligence data until Stripe + the acu_ledger collection go live.

const PLAN_LADDER = [
  {
    name: "Free Recon",
    price: "£0",
    acus: "50 ACUs/mo",
    features: ["Marketing Failure Audit", "Daily briefing (lite)", "1 brand"],
    current: false,
  },
  {
    name: "Starter",
    price: "£9/mo",
    acus: "500 ACUs/mo pooled",
    features: ["All 19 agents (L0–L1)", "WhatsApp Center", "1 brand (+£5/extra, max 3)"],
    current: false,
  },
  {
    name: "Growth",
    price: "£29/mo",
    acus: "2,000 ACUs/mo pooled",
    features: ["L2 autonomy + spend caps", "Resurrection Engine", "3 brands (+£5/extra)"],
    current: true,
  },
  {
    name: "Pro",
    price: "£59/mo",
    acus: "5,000 ACUs/mo pooled",
    features: ["L3 autonomy (TOTP-gated)", "Video War Room full", "5 brands (+£4/extra)"],
    current: false,
  },
  {
    name: "Agency",
    price: "£99/mo",
    acus: "12,000 pooled ACUs",
    features: ["15 client workspaces (+£3/extra)", "White-label reports", "ACU pooling"],
    current: false,
  },
];

const TOP_UPS = [
  { price: "£5", acus: "500 ACUs" },
  { price: "£10", acus: "1,000 ACUs" },
  { price: "£25", acus: "2,500 ACUs" },
  { price: "£50", acus: "5,000 ACUs" },
];

const AGENT_BURN = [
  { label: "Campaign Commander", value: 312 },
  { label: "Ad Creative", value: 264 },
  { label: "Video Commander", value: 231 },
  { label: "Content Factory", value: 178 },
  { label: "Resurrection Engine", value: 142 },
  { label: "Growth Strategist", value: 96 },
  { label: "Competitor Spy", value: 71 },
  { label: "All others", value: 106 },
];

const BURN_DAILY = {
  labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  metered: [88, 102, 96, 121, 134, 74, 61, 95, 118, 126, 141, 152, 82, 70],
  recycled: [34, 41, 39, 52, 58, 40, 33, 47, 55, 61, 66, 72, 45, 39],
};

export default function BillingPage() {
  const balance = 1148;
  const allowance = 2000;
  const usedPct = Math.round(((allowance - balance) / allowance) * 100);

  return (
    <div>
      <PageHeader
        kicker="Billing & ACUs"
        title="The AI economy, metered transparently"
        subtitle="£1 = 100 ACUs. Every agent action is metered, priced above cost, and visible here — no surprise bills, hard budget caps, one-tap top-up."
        actions={
          <button type="button" className="btn-primary">
            <Zap className="h-4 w-4" /> Top up ACUs
          </button>
        }
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="ACU balance" value={`${balance.toLocaleString()}`} sub={`of ${allowance.toLocaleString()} monthly allowance`} tone="good" />
        <StatCard label="Burned this month" value={`${(allowance - balance).toLocaleString()}`} sub={`${usedPct}% of allowance`} />
        <StatCard label="Recycled (cached) actions" value="38%" sub="delivered at near-zero cost" tone="good" />
        <StatCard label="Alert threshold" value="200" sub="one-tap top-up below this" tone="warn" />
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-5">
        <div className="card p-5 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display font-bold text-white">ACU burn — 14 days</h2>
            <Pill tone="info">recycled = cheaper for you</Pill>
          </div>
          <AreaChart
            labels={BURN_DAILY.labels}
            series={[
              { name: "Metered ACUs", data: BURN_DAILY.metered },
              { name: "Recycled (cached)", data: BURN_DAILY.recycled },
            ]}
            height={230}
          />
          <p className="mt-3 text-xs text-slate-500">
            Recycled actions reuse cached intelligence and templates — the router always tries the cheapest
            sufficient path first, so your allowance goes further every month.
          </p>
        </div>
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-3 font-display font-bold text-white">Burn by agent</h2>
          <DonutChart
            data={AGENT_BURN.slice(0, 5).map((a) => ({ label: a.label, value: a.value }))}
            centerValue={`${AGENT_BURN.reduce((s, a) => s + a.value, 0)}`}
            centerLabel="ACUs this month"
            size={185}
          />
        </div>
      </div>

      <div className="mb-8 card p-5">
        <h2 className="mb-3 font-display font-bold text-white">Where your ACUs went</h2>
        <HBarList data={AGENT_BURN.map((a) => ({ ...a, note: "ACUs" }))} />
      </div>

      {/* Multi-brand: one account, one bill */}
      <div className="mb-8 card p-5">
        <div className="mb-1 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-emerald-400" />
          <h2 className="font-display font-bold text-white">Brands on this account</h2>
          <Pill tone="good">one account · one bill</Pill>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Run every brand and activity from a single login. Each brand is fully separated — its own campaigns,
          customers, agents and audit trail — while the ACU pool and the invoice stay unified.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {demoAccountBrands.map((b) => (
            <div
              key={b.id}
              className={`rounded-xl border p-4 ${b.active ? "border-emerald-500/50 bg-emerald-500/5" : "border-ink-700 bg-ink-850"}`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="truncate font-semibold text-white">{b.name}</p>
                {b.active && <Pill tone="good">active</Pill>}
              </div>
              <p className="mb-3 text-xs text-slate-500">{b.industry}</p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  BVI <span className="font-bold text-white">{b.bvi}</span>
                </span>
                <span className="text-slate-400">
                  <span className="font-bold text-white">{b.acuBurnMonth}</span> ACUs this month
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Growth plan: <strong className="text-white">3 of 3 included slots used</strong> — extra brands £5/mo
            each, drawn from the same pooled ACU allowance.
          </p>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg border border-ink-700 px-3.5 py-2 text-xs font-bold text-slate-200 transition hover:border-emerald-500/50 hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" /> Add a brand — £5/mo
          </button>
        </div>
      </div>

      {/* Plan ladder */}
      <h2 className="mb-4 font-display text-lg font-bold text-white">Plans</h2>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {PLAN_LADDER.map((p) => (
          <div
            key={p.name}
            className={`card flex flex-col p-5 ${p.current ? "border-emerald-500/50 shadow-lg shadow-emerald-500/10" : ""}`}
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display font-bold text-white">{p.name}</h3>
              {p.current && <Pill tone="good">current</Pill>}
            </div>
            <p className="font-display text-2xl font-bold text-emerald-400">{p.price}</p>
            <p className="mb-3 text-xs text-slate-500">{p.acus}</p>
            <ul className="mb-4 flex-1 space-y-1.5">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-1.5 text-xs text-slate-300">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" /> {f}
                </li>
              ))}
            </ul>
            {!p.current && (
              <button
                type="button"
                className="flex items-center justify-center gap-1 rounded-lg border border-ink-700 py-2 text-xs font-bold text-slate-200 transition hover:border-emerald-500/50 hover:text-white"
              >
                {p.name === "Free Recon" ? "Downgrade" : "Upgrade"} <ArrowUpRight className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Top-ups */}
      <div className="card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-emerald-400" />
          <h2 className="font-display font-bold text-white">ACU top-up packs</h2>
          <span className="text-xs text-slate-500">— never expire, drawn after the monthly allowance</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {TOP_UPS.map((t) => (
            <button
              key={t.price}
              type="button"
              className="rounded-xl border border-ink-700 bg-ink-850 p-4 text-center transition hover:border-emerald-500/50"
            >
              <p className="font-display text-xl font-bold text-white">{t.price}</p>
              <p className="text-xs text-emerald-400">{t.acus}</p>
            </button>
          ))}
        </div>
        <p className="mt-4 rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-xs text-sky-200">
          Stripe billing connects at go-live (docs/DEPLOYMENT.md). Pricing shown is the adopted £9–£99 plan band —
          the final price card ships with the Stripe integration and always honours the platform pricing rules.
        </p>
      </div>
    </div>
  );
}
