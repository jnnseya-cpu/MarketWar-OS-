"use client";

// Partner self-serve dashboard — where a registered creator/affiliate tracks
// their OWN activity + earnings. Token-gated: the ?t=<token> in the link (issued
// when they applied) is the only credential — no platform login. Reads the live
// engine via the token-gated partner_portal action.

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Wallet, Users, LinkIcon, Copy, ShieldCheck, TrendingUp, Coins } from "lucide-react";

type WalletData = {
  payoutEligible: boolean; followers: number; followersVerified: boolean;
  cumulativeNetGbp: number; countedEvents: number; flaggedEvents: number;
  lifetimeCreatorGbp: number; paidGbp: number; payableGbp: number; pendingGbp: number;
  programme: "main" | "acu_referral"; acusEarned: number; referralCount: number; gateNote: string;
  perCustomer: { ref: string; netGbp: number; creatorGbp: number; platformGbp: number; state: string; progressPct: number }[];
};
type Sub = { code: string; link: string; programme: string; brand: string; destinationUrl: string };
type Portal = { partner: { name: string; tier: string; followers: number; followersVerified: boolean; payoutEligible: boolean; scoutScore?: number }; wallet: WalletData; subscriptions: Sub[] };

const money = (n: number) => `£${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function PartnerDashboard() {
  const params = useSearchParams();
  const token = params.get("t") || "";
  const [data, setData] = useState<Portal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setError("This dashboard needs your personal link. Check the email/confirmation from when you applied."); setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch("/api/creator-engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "partner_portal", token }) });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) { setError(d.error || "Couldn't load your dashboard."); return; }
        setData(d as Portal);
      } catch { setError("Network error — please try again."); }
      finally { setLoading(false); }
    })();
  }, [token]);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-ink-950"><Loader2 className="h-6 w-6 animate-spin text-emerald-400" /></div>;
  if (error || !data) return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-3 bg-ink-950 px-6 text-center">
      <ShieldCheck className="h-8 w-8 text-emerald-500/60" />
      <h1 className="font-display text-lg font-bold text-white">Partner dashboard</h1>
      <p className="text-sm text-slate-400">{error}</p>
    </div>
  );

  const { partner, wallet, subscriptions } = data;
  const isMain = wallet.programme === "main";

  return (
    <div className="min-h-screen bg-ink-950 px-5 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">Partner dashboard</p>
          <h1 className="font-display text-2xl font-bold text-white">Welcome, {partner.name}</h1>
          <p className="mt-1 text-sm text-slate-400">
            {partner.tier} · {partner.followers.toLocaleString()} followers {partner.followersVerified ? "(verified)" : "(unverified)"}{partner.scoutScore != null ? ` · Scout ${partner.scoutScore}/100` : ""}
          </p>
        </div>

        {/* Earnings */}
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4"><div className="flex items-center gap-1.5 text-xs text-slate-400"><Wallet className="h-3.5 w-3.5" /> Payable now</div><p className="mt-1 font-display text-2xl font-bold text-emerald-300">{money(wallet.payableGbp)}</p></div>
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4"><div className="flex items-center gap-1.5 text-xs text-slate-400"><TrendingUp className="h-3.5 w-3.5" /> Pending (to 10K)</div><p className="mt-1 font-display text-2xl font-bold text-amber-300">{money(wallet.pendingGbp)}</p></div>
          <div className="rounded-xl border border-white/10 bg-ink-900/60 p-4"><div className="text-xs text-slate-400">Lifetime earned</div><p className="mt-1 font-display text-2xl font-bold text-white">{money(wallet.lifetimeCreatorGbp)}</p></div>
          <div className="rounded-xl border border-white/10 bg-ink-900/60 p-4"><div className="flex items-center gap-1.5 text-xs text-slate-400"><Coins className="h-3.5 w-3.5" /> ACUs earned</div><p className="mt-1 font-display text-2xl font-bold text-white">{wallet.acusEarned.toLocaleString()}</p></div>
        </div>
        <p className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-ink-900/50 p-3 text-xs text-slate-400"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> {wallet.gateNote}</p>

        {/* Performance */}
        <div className="rounded-xl border border-white/10 bg-ink-900/50 p-5">
          <h2 className="mb-3 font-display font-bold text-white">Performance</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
            <div><p className="text-xs text-slate-500">Referred customers</p><p className="font-bold text-white">{wallet.referralCount}</p></div>
            <div><p className="text-xs text-slate-500">Verified conversions</p><p className="font-bold text-white">{wallet.countedEvents}</p></div>
            <div><p className="text-xs text-slate-500">Net revenue driven</p><p className="font-bold text-white">{money(wallet.cumulativeNetGbp)}</p></div>
            <div><p className="text-xs text-slate-500">Already paid out</p><p className="font-bold text-white">{money(wallet.paidGbp)}</p></div>
          </div>
        </div>

        {/* Programme (£20K cap per customer) */}
        {wallet.perCustomer.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-ink-900/50 p-5">
            <h2 className="mb-3 font-display font-bold text-white">Earnings by referred customer</h2>
            <div className="space-y-2">
              {wallet.perCustomer.map((c) => (
                <div key={c.ref} className="rounded-lg border border-white/[0.06] bg-ink-950/40 p-3 text-sm">
                  <div className="flex items-center justify-between"><span className="text-slate-200">{c.ref} <span className="text-slate-500">· you {money(c.creatorGbp)}</span></span><span className="text-[11px] uppercase tracking-wide text-slate-500">{c.state.replace(/_/g, " ").toLowerCase()}</span></div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-700/60"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${c.progressPct}%` }} /></div>
                  <p className="mt-1 text-[11px] text-slate-500">{c.progressPct}% to the £20,000 cap</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Codes & links */}
        <div className="rounded-xl border border-white/10 bg-ink-900/50 p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display font-bold text-white"><LinkIcon className="h-4 w-4 text-emerald-400" /> Your programmes & tracked links</h2>
          {subscriptions.length === 0 ? (
            <p className="text-sm text-slate-400">No programmes yet. Brands you&rsquo;re matched to will issue you a code/link here.</p>
          ) : (
            <div className="space-y-2">
              {subscriptions.map((s) => (
                <div key={s.code} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-ink-950/40 p-3 text-sm">
                  <div><p className="font-semibold text-white">{s.programme || s.brand}</p><p className="font-mono text-xs text-emerald-300">{s.code}</p></div>
                  <button onClick={() => navigator.clipboard?.writeText(`${window.location.origin}${s.link}`)} className="inline-flex items-center gap-1 text-xs text-emerald-300 hover:text-emerald-200"><Copy className="h-3.5 w-3.5" /> Copy link</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-600">This is your private link — keep it safe. Earnings shown are computed on verified revenue; {isMain ? "you're on the cash programme" : "you're on the ACU referral programme and auto-upgrade to cash at 10K verified followers"}.</p>
      </div>
    </div>
  );
}

export default function PartnerPage() {
  return <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-ink-950"><Loader2 className="h-6 w-6 animate-spin text-emerald-400" /></div>}><PartnerDashboard /></Suspense>;
}
