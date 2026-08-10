"use client";

// Choose-a-plan step (post sign-up). Monthly / annual toggle (annual = 30% off).
// Free activates immediately; paid opens a Stripe subscription checkout (live) or
// a demo confirmation. Reads the real plans from /api/subscription.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Loader2, Sparkles } from "lucide-react";
import { authedFetch } from "@/frontend/api-client";
import { BrandLockup } from "@/components/Logo";
import { AGENT_LIST } from "@/shared/agents";
import { COMMISSION_BANDS, ratePct, RATE_PLATFORM } from "@/shared/creator-program";


type Plan = {
  id: string; name: string; monthlyGbp: number; annualGbp: number; annualSavingGbp: number;
  monthlyAcus: number; annualMonthlyReleaseAcus: number;
  brands: number | "custom"; users: number | "custom"; storageGb: number; custom?: boolean;
};

const BLURB: Record<string, string> = {
  free: "Diagnose + try the whole OS", starter: "Your first real campaigns", growth: "The full acquisition machine",
  scale: "Multi-brand operators", business: "Agencies + franchises", enterprise: "Large multi-location",
  corporate: "Networks + resellers", global: "Custom at any scale",
};

// Concise "what you can do" bullets per plan (real features + caps only).
const HIGHLIGHTS: Record<string, string[]> = {
  free: ["Every module + AI agent to explore", "Business DNA + marketing audit", "1 campaign + 1 landing page", "Real output before you pay"],
  starter: ["First-Customer sprint to real sales", "Email from your own domain", "WhatsApp funnel + on-brand content", "3 social accounts · 5 campaigns"],
  growth: [`Full ${AGENT_LIST.length}-agent AI workforce`, "SEO + Search-Dominance workbench", "Competitor intel + lead recovery", "Publish to 10 socials · 20 campaigns", "Optional API package"],
  scale: ["Approvals + collaboration workflow", "Per-brand wallets + budget control", "White-label option", "Autonomy dial · 30 socials · 100 campaigns"],
  business: ["White-label included", "Priority support", "ROI + revenue-attribution ledger", "100 socials · 500 campaigns"],
  enterprise: ["Unlimited campaigns", "Controlled wallets + org hierarchy", "White-label + priority support", "Onboarding, training + integrations"],
  corporate: ["Enterprise power at group scale", "Full controlled-wallet governance", "Dedicated onboarding", "1,000 socials · unlimited campaigns"],
  global: ["Dedicated infrastructure", "White-glove implementation", "Embedded specialists + bespoke SLAs", "Custom brands, users + channels"],
};

export default function ChoosePlanPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/subscription").then((r) => r.json()).then((d) => setPlans(d.plans)).catch(() => {});
  }, []);

  const money = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;

  async function choose(p: Plan) {
    setBusy(p.id); setMsg(null);
    try {
      const res = await authedFetch("/api/billing/subscribe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: p.id, cycle }),
      });
      const d = await res.json();
      if (d.free) { router.push("/dashboard?plan=free"); return; }
      if (d.ok && d.url && d.mode === "live") { window.location.href = d.url; return; }
      // Payments not enabled in a real deployment — never grant paid access for free.
      if (d.ok === false) { setMsg(d.error || "Payments aren't available right now — please try again shortly."); return; }
      // Demo/dev (no accounts, no entitlements): acknowledge + continue exploring.
      setMsg(`${p.name} (${cycle}) — ${d.note || "demo checkout"}. Continuing to your dashboard…`);
      setTimeout(() => router.push(`/dashboard?plan=${p.id}`), 1400);
    } catch {
      setMsg("Something went wrong — try again.");
    } finally { setBusy(null); }
  }

  return (
    <div className="min-h-screen px-4 py-14">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2.5">
          <BrandLockup />
        </Link>

        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">Choose your plan</h1>
          <p className="mt-3 text-slate-400">Platform access + an automatic AI credit allowance. Change or cancel any time.</p>

          {/* Monthly / annual toggle */}
          <div className="mt-6 inline-flex items-center gap-1 rounded-full border border-white/10 bg-ink-900/70 p-1">
            <button onClick={() => setCycle("monthly")} className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${cycle === "monthly" ? "bg-emerald-500 text-ink-950" : "text-slate-300 hover:text-white"}`}>Monthly</button>
            <button onClick={() => setCycle("annual")} className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${cycle === "annual" ? "bg-emerald-500 text-ink-950" : "text-slate-300 hover:text-white"}`}>Annual <span className={cycle === "annual" ? "text-ink-950/80" : "text-emerald-400"}>· save 30%</span></button>
          </div>
        </div>

        {msg && <p className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-center text-sm text-emerald-200">{msg}</p>}

        {!plans ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-emerald-400" /></div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((p) => {
              const isFree = p.monthlyGbp === 0;
              const featured = p.id === "growth";
              const priceMain = isFree ? "£0" : cycle === "annual" ? money(Math.round(p.annualGbp / 12)) : money(p.monthlyGbp);
              const acus = isFree ? "100 ACUs / yr" : `${(cycle === "annual" ? p.annualMonthlyReleaseAcus : p.monthlyAcus).toLocaleString("en-GB")} ACUs/mo`;
              return (
                <div key={p.id} className={`relative flex flex-col rounded-2xl p-6 ${featured ? "gradient-border bg-ink-900" : "border border-white/10 bg-ink-900/70"}`}>
                  {featured && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 px-3 py-1 text-[11px] font-bold text-ink-950">MOST POPULAR</span>}
                  <h3 className="font-display text-lg font-bold text-white">{p.name}</h3>
                  <p className="mt-1 text-xs text-slate-500">{BLURB[p.id] ?? ""}</p>
                  <p className="mt-4 font-display text-3xl font-bold text-white">{p.custom ? "From " : ""}{priceMain}<span className="text-sm font-semibold text-slate-500">{isFree ? "" : "/mo"}</span></p>
                  {!isFree && cycle === "annual" && <p className="text-[11px] text-emerald-300">{money(p.annualGbp)}/yr · save {money(p.annualSavingGbp)}</p>}
                  {!isFree && cycle === "monthly" && <p className="text-[11px] text-slate-500">billed monthly</p>}
                  <ul className="mt-4 flex-1 space-y-1.5 text-xs text-slate-300">
                    <li className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-emerald-400" />{acus}{cycle === "annual" && !isFree ? " released" : ""}</li>
                    <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" />{p.brands === "custom" ? "Custom" : p.brands} brand{p.brands === 1 ? "" : "s"} · {p.users === "custom" ? "custom" : p.users} user{p.users === 1 ? "" : "s"}</li>
                    <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" />{p.storageGb >= 1024 ? `${p.storageGb / 1024} TB` : `${p.storageGb} GB`} storage</li>
                    {(HIGHLIGHTS[p.id] ?? []).map((h) => (
                      <li key={h} className="flex items-start gap-1.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />{h}</li>
                    ))}
                  </ul>
                  <button onClick={() => choose(p)} disabled={busy !== null} className={`mt-5 rounded-xl py-2.5 text-center text-sm font-bold transition disabled:opacity-50 ${featured ? "bg-gradient-to-r from-emerald-400 to-emerald-500 text-ink-950" : "border border-white/15 text-white hover:border-emerald-500/50"}`}>
                    {busy === p.id ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : isFree ? "Start free" : p.custom ? "Contact sales" : `Choose ${p.name}`}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* The creator programme is charged separately, and a pricing page that
            does not say so is a pricing page somebody argues with later. */}
        <div className="mt-10 rounded-xl border border-white/10 bg-ink-900/50 p-5">
          <h3 className="font-display text-base font-bold text-white">Creator commission is separate — and only ever paid on a sale</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
            Your subscription buys the platform, and AI actions draw on your ACU allowance. If you run{" "}
            <Link href="/blog/creator-earning-programmes" className="font-semibold text-emerald-400 hover:text-emerald-300">SHARE2EARN or the creator programme</Link>,
            commission is charged as an acquisition cost on the sales those creators produce — never a retainer, never a fee for reach that converted nothing.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-xs">
              <thead><tr className="text-slate-500"><th className="pb-1.5 font-semibold">Who is promoting</th><th className="pb-1.5 font-semibold">Creator gets</th><th className="pb-1.5 font-semibold">You pay</th></tr></thead>
              <tbody className="divide-y divide-white/[0.06]">
                {COMMISSION_BANDS.map((b) => (
                  <tr key={b.id}>
                    <td className="py-2 pr-3 text-slate-300">{b.label}</td>
                    <td className="py-2 pr-3 font-bold text-emerald-300">{ratePct(b.creatorRate)}</td>
                    <td className="py-2 text-white">{ratePct(b.totalRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            Our share is a flat {ratePct(RATE_PLATFORM)} at every band, so a creator moving up a tier raises what they take home rather than what we take. The whole programme is capped at{" "}
            <Link href="/blog/profitguard-growthguard-creator-programme" className="font-semibold text-emerald-400 hover:text-emerald-300">5% of the value it generates</Link>{" "}
            and cannot breach the margin you choose to protect — a reward configuration that would is refused, not warned about.
          </p>
        </div>

        <p className="mt-8 text-center text-sm text-slate-500">
          Not sure yet? <Link href="/dashboard" className="font-semibold text-emerald-400 hover:text-emerald-300">Explore the demo first</Link> — you can pick a plan any time from Billing.
        </p>
      </div>
    </div>
  );
}
