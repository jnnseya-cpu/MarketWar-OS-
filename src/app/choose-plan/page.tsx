"use client";

// Choose-a-plan step (post sign-up). Monthly / annual toggle (annual = 30% off).
// Free activates immediately; paid opens a Stripe subscription checkout (live) or
// a demo confirmation. Reads the real plans from /api/subscription.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Loader2, Shield, Sparkles } from "lucide-react";
import { authedFetch } from "@/frontend/api-client";

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
      // Demo: acknowledge + continue into the OS.
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
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-ink-950"><Shield className="h-5 w-5" /></span>
          <span className="font-display text-lg font-bold tracking-tight text-white">MarketWar <span className="text-emerald-400">OS</span></span>
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
                  </ul>
                  <button onClick={() => choose(p)} disabled={busy !== null} className={`mt-5 rounded-xl py-2.5 text-center text-sm font-bold transition disabled:opacity-50 ${featured ? "bg-gradient-to-r from-emerald-400 to-emerald-500 text-ink-950" : "border border-white/15 text-white hover:border-emerald-500/50"}`}>
                    {busy === p.id ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : isFree ? "Start free" : p.custom ? "Contact sales" : `Choose ${p.name}`}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-8 text-center text-sm text-slate-500">
          Not sure yet? <Link href="/dashboard" className="font-semibold text-emerald-400 hover:text-emerald-300">Explore the demo first</Link> — you can pick a plan any time from Billing.
        </p>
      </div>
    </div>
  );
}
