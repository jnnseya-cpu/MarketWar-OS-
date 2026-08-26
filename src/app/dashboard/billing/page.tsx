"use client";

// Billing & ACUs — the commercial surface. Renders the owner's finalised 8-plan
// model + the ACU wallet LIVE from /api/subscription (single source of truth in
// src/backend/subscription.ts). £1 = 100 ACUs; every plan auto-allocates 20% of
// the price paid as ACUs; annual = 30% off with ACUs released monthly. Pricing
// rule: charge = provider cost × 4 = a 300% markup = 75% gross margin. Provider
// cost is never shown to the customer. Wallet figures are Demo Intelligence
// until Stripe + the acu_ledger go live. (Upgrades the earlier placeholder
// £9–£99 ladder — the finalised model supersedes it per REQUIREMENTS-COVERAGE.)

import { useEffect, useCallback, useState } from "react";
import { Check, Loader2, Wallet, Zap, TrendingUp, Star } from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";
import Link from "next/link";
import { authedFetch } from "@/frontend/api-client";
import { useIsAdmin } from "@/frontend/use-is-admin";
import { track } from "@/frontend/analytics";

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
  // THE OPERATOR IS NOT A CUSTOMER.
  //
  // The owner opened this page and found their own wallet at 100 ACUs above
  // eight subscription tiers inviting them to buy the platform from themselves,
  // with no way to do the one thing an operator actually needs here: put ACUs
  // in somebody's wallet.
  //
  // NOTHING IS HIDDEN. An operator still has a real wallet, still spends real
  // ACUs, and the plan table is how they see what a customer sees — removing it
  // would take away the only place the pricing can be checked against the
  // pricing law. What changes is that the page opens by telling them which side
  // of the counter they are on, and points at the tool they came for.
  const { isAdmin } = useIsAdmin();
  const [data, setData] = useState<SubResponse | null>(null);
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const [error, setError] = useState(false);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [buying, setBuying] = useState<number | null>(null);
  const [checkout, setCheckout] = useState<{ ok: boolean; mode: string; url: string | null; acus: number; note: string; error?: string } | null>(null);

  const [wallet, setWallet] = useState<{ live: boolean; balanceAcu: number; planId: string; lifetimeCreditedAcu: number; lifetimeDebitedAcu: number } | null>(null);

  // Named so it can be re-run after a plan change — activating the free plan
  // changes the wallet, and a page still showing the old balance reads as a
  // failed click.
  const load = useCallback(() => {
    fetch("/api/subscription").then((r) => r.json()).then(setData).catch(() => setError(true));
    // Real ACU wallet (credited by the Stripe webhook, debited by AI use).
    authedFetch("/api/billing/wallet")
      .then((r) => r.json())
      .then((d) => { if (d && d.wallet) setWallet({ live: Boolean(d.live), balanceAcu: d.wallet.balanceAcu, planId: d.wallet.planId, lifetimeCreditedAcu: d.wallet.lifetimeCreditedAcu, lifetimeDebitedAcu: d.wallet.lifetimeDebitedAcu }); })
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

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

  // Choose a plan. The endpoint has always existed; the button simply was not
  // wired to it, so every "Choose <plan>" click did nothing — the money path
  // was dead in the one place a customer tries to pay.
  async function choosePlan(planId: string, custom?: boolean) {
    if (custom) { window.location.href = "/contact?topic=enterprise"; return; }
    setSubscribing(planId); setCheckout(null);
    try {
      const res = await authedFetch("/api/billing/subscribe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, cycle }),
      });
      const r = await res.json();
      if (!res.ok) { setCheckout({ ok: false, mode: "demo", url: null, acus: 0, note: r?.error || "Could not start checkout." }); return; }
      // Free needs no payment — reflect it immediately rather than sending the
      // customer to a checkout for £0.
      if (r.free) {
        // Its own event, with no value. Reporting a £0 Purchase would tell Meta
        // this platform's customers are worth nothing and train the bidding on
        // exactly that.
        track("start_free_plan", { plan: planId, cycle });
        setCheckout({ ok: true, mode: "live", url: null, acus: 0, note: r.note || "Free plan activated." }); load(); return;
      }
      if (r.url) {
        // begin_checkout, NOT purchase — Stripe has not taken any money yet, and
        // the customer may never complete. The purchase is recorded on the
        // confirmed return, where the amount is known to be real.
        // The amount comes from the economics the server already sent for this
        // page, not from a price re-typed here. A second copy of the price table
        // would drift from the real one and quietly report the wrong revenue.
        const plan = data?.plans.find((p) => p.id === planId);
        const value = cycle === "annual" ? plan?.annualGbp : plan?.monthlyGbp;
        track("begin_checkout", { plan: planId, cycle, value, currency: "GBP" });
        window.location.href = r.url; return;
      }
      setCheckout({ ok: false, mode: "demo", url: null, acus: 0, note: r.note || "Payments are not configured on this deployment yet." });
    } catch {
      setCheckout({ ok: false, mode: "demo", url: null, acus: 0, note: "Network error — the plan was not changed." });
    } finally { setSubscribing(null); }
  }

  // Wallet: prefer the REAL balance (credited by the Stripe webhook, debited by
  // AI use) when accounts are enforced; otherwise fall back to the modelled
  // plan allocation so the page still renders honestly in demo.
  const walletPlanId = wallet?.planId ?? "growth";
  const currentPlan = data?.plans.find((p) => p.id === walletPlanId) ?? data?.plans.find((p) => p.id === "growth");
  const allocation = currentPlan?.monthlyAcus ?? 980;
  const walletLive = Boolean(wallet?.live);
  const spent = walletLive ? (wallet?.lifetimeDebitedAcu ?? 0) : 0;

  // THE BALANCE IS THE BALANCE, or it is not shown at all.
  //
  // This used to read `walletLive ? real : allocation` and print the plan's
  // allocation under the words "of AI usage available". It is not available: the
  // wallet that `debitAcus` actually reads had never been credited, so the page
  // showed 980 ACUs while a render was refused for having 0. A number the
  // spending engine disagrees with is not an estimate, it is a wrong number with
  // a badge on it.
  //
  // null means "no wallet to report". The card then says so instead of modelling
  // one, and the allocation is shown for what it is — an entitlement that
  // becomes real ACUs when billing is connected.
  const balance = walletLive ? (wallet?.balanceAcu ?? 0) : null;

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

      {isAdmin && (
        <div className="mb-6 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-5">
          <p className="text-sm font-semibold text-white">You are the operator here, not a customer.</p>
          <p className="mt-1.5 text-xs leading-relaxed text-emerald-100/90">
            You do not buy a plan from yourself. Your wallet below is real and your ACUs are spent
            like anyone else&rsquo;s — that is deliberate, so the platform can be tested the way a
            customer experiences it. To put ACUs in your own wallet, or a pilot&rsquo;s, use the
            grant tool. Everything below this line is what a customer sees, which is the only place
            the pricing can be checked against the margin floor.
          </p>
          <Link
            href="/dashboard/admin"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-ink-950 hover:bg-emerald-400"
          >
            Grant ACUs
          </Link>
        </div>
      )}

      {/* ACU wallet — real allocation; live metering activates with billing */}
      <div className="mb-8 grid gap-4 lg:grid-cols-4">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2"><Wallet className="h-4 w-4 text-emerald-400" /><h2 className="font-display font-bold text-white">ACU Wallet</h2>
            <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${walletLive ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-500/15 text-slate-300"}`}>{walletLive ? "live" : "estimate"}</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              {balance === null ? (
                <>
                  <p className="font-display text-3xl font-bold text-slate-500">—<span className="ml-1 text-sm font-normal text-slate-500">ACUs</span></p>
                  <p className="mt-1 max-w-xs text-xs text-amber-300/90">No wallet is credited on this deployment yet, so metered actions will be refused. The allocation beside this is what your plan grants once billing is connected.</p>
                </>
              ) : (
                <>
                  <p className="font-display text-3xl font-bold text-white">{balance.toLocaleString("en-GB")}<span className="ml-1 text-sm font-normal text-slate-400">ACUs</span></p>
                  <p className="mt-1 text-xs text-slate-400">≈ {fmtGbp(balance / 100)} of AI usage available</p>
                </>
              )}
            </div>
            <button
              onClick={() => { document.getElementById("top-up")?.scrollIntoView({ behavior: "smooth" }); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-ink-950 hover:bg-emerald-400"
            ><Zap className="h-4 w-4" /> Top up</button>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink-800">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: balance === null ? "0%" : `${allocation > 0 ? Math.max(2, Math.min(100, Math.round((balance / Math.max(balance, allocation)) * 100))) : 100}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-slate-500"><span>{spent.toLocaleString("en-GB")} spent{walletLive ? " (lifetime)" : " this cycle"}</span><span>{walletLive ? "Live per-use metering active" : "Live per-use metering activates with billing"}</span></div>
        </div>
        <div className="card p-5 lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">This month&apos;s allocation</p>
          <p className="mt-1 font-display text-2xl font-bold text-emerald-400">{allocation.toLocaleString("en-GB")}</p>
          <p className="text-xs text-slate-400">
            {walletLive
              ? "Your plan\u2019s automatic AI credit — auto-credited each cycle. Add ACUs any time without changing your plan."
              : "What your plan grants per cycle once billing is connected. It is not in the wallet yet, so it cannot be spent."}
          </p>
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
                <button
                  onClick={() => choosePlan(p.id, p.custom)}
                  disabled={subscribing !== null}
                  className={`mt-4 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50 ${isRec ? "bg-emerald-500 text-ink-950 hover:bg-emerald-400" : "border border-ink-700 text-slate-200 hover:border-emerald-500"}`}
                >
                  {subscribing === p.id ? "Starting…" : p.monthlyGbp === 0 ? "Start free" : p.custom ? "Contact sales" : "Choose " + p.name}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Top-ups */}
      {data && (
        <div id="top-up" className="mt-8 scroll-mt-24">
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
