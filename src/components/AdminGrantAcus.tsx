"use client";

// ADMIN — PUT ACUs IN SOMEBODY'S WALLET, WITHOUT A PAYMENT.
//
// THE GAP THIS CLOSES. `/api/admin/grant-acus` has existed and worked for
// months: resolve an email to a uid, credit the wallet, optionally set the plan.
// Nothing anywhere in the product called it. So the only way to comp a design
// partner, unstick a pilot, or refund a customer whose run failed was to hand-
// craft an authenticated POST — which means in practice it never happened, and
// the owner's own account sat at 100 ACUs looking at a page selling them eight
// subscription tiers.
//
// A capability with no surface is not a capability. This is the surface.
//
// WHAT IT IS FOR:
//   • Design-partner pilots — a real metered tenant who never hits the paywall.
//   • Making somebody whole when a run failed on our side.
//   • The owner's own account, so the platform can be used to test the platform.
//
// WHAT IT DELIBERATELY IS NOT: a discount mechanism. Granted ACUs cost the owner
// real provider money and earn nothing, so the balance is shown BEFORE and AFTER
// every grant. A tool that moves money and does not show the consequence is how
// somebody types an extra zero and finds out next month.

import { useState } from "react";
import { Check, Coins, Loader2, Search, TriangleAlert } from "lucide-react";
import { authedFetch } from "@/frontend/api-client";

const PLAN_OPTS = [
  ["", "Leave plan unchanged"],
  ["free", "Free"], ["starter", "Starter"], ["growth", "Growth"], ["scale", "Scale"],
  ["business", "Business"], ["enterprise", "Enterprise"], ["corporate", "Corporate"], ["global", "Global"],
] as const;

/** The amounts actually used in practice, so the common case is one tap. */
const QUICK = [100, 500, 1_000, 5_000, 10_000] as const;

type Wallet = { live: boolean; orgId?: string; balanceAcu?: number; planId?: string; lifetimeCreditedAcu?: number; lifetimeDebitedAcu?: number; note?: string };

const acu = (n: number | undefined) => (typeof n === "number" ? n.toLocaleString("en-GB") : "—");
/** ACUs are pennies. Saying so is the only way a grant reads as a real cost. */
const gbp = (n: number) => `£${(n / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AdminGrantAcus() {
  const [email, setEmail] = useState("");
  const [acus, setAcus] = useState("1000");
  const [planId, setPlanId] = useState("");
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [busy, setBusy] = useState<"look" | "grant" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const amount = Math.round(Number(acus) || 0);
  const valid = /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email.trim());

  async function look() {
    if (!valid) { setErr("Put in the account's email address."); return; }
    setBusy("look"); setErr(null); setDone(null); setWallet(null);
    try {
      const r = await authedFetch(`/api/admin/grant-acus?email=${encodeURIComponent(email.trim())}`);
      const d = await r.json().catch(() => ({}));
      if (r.status === 401 || r.status === 403) { setErr("Admin sign-in required. Set PLATFORM_ADMIN_EMAILS to your address and redeploy, or sign in with an account that carries the platform_admin scope."); return; }
      if (!r.ok) { setErr(d.error || "That account could not be read."); return; }
      setWallet(d as Wallet);
    } catch { setErr("Network error — try again."); } finally { setBusy(null); }
  }

  async function grant() {
    if (!valid) { setErr("Put in the account's email address."); return; }
    if (!(amount > 0)) { setErr("How many ACUs?"); return; }
    setBusy("grant"); setErr(null); setDone(null);
    try {
      const r = await authedFetch("/api/admin/grant-acus", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), acus: amount, ...(planId ? { planId } : {}) }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401 || r.status === 403) { setErr("Admin sign-in required to grant ACUs."); return; }
      if (!r.ok) { setErr(d.error || "The grant did not go through."); return; }
      // The NEW balance, from the server's own reply — never a number this
      // component worked out by adding to what it last saw.
      setWallet({ live: true, orgId: d.orgId, balanceAcu: d.balanceAcu, planId: d.planId });
      setDone(d.note || `Credited ${acu(amount)} ACUs.`);
    } catch { setErr("Network error — the grant may not have gone through. Look the account up before trying again."); } finally { setBusy(null); }
  }

  return (
    <section className="card p-5">
      <h3 className="flex items-center gap-2 font-display text-base font-bold text-white">
        <Coins className="h-4 w-4 text-emerald-400" /> Grant ACUs
      </h3>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
        Credit any account&rsquo;s wallet without a payment — a pilot, a comp, or making somebody
        whole after a failed run. They stay a normal metered tenant and simply never hit the
        paywall. <span className="text-slate-300">Granted ACUs cost real provider money and earn
        nothing</span>, so the balance is shown before and after.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={email} onChange={(e) => { setEmail(e.target.value); setWallet(null); setDone(null); }}
          type="email" placeholder="their@email.com"
          className="min-w-[220px] flex-1 rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50"
        />
        <button
          onClick={() => void look()} disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-60"
        >
          {busy === "look" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Look up
        </button>
      </div>

      {wallet && wallet.live !== false && (
        <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-white/10 bg-ink-950/40 p-3 sm:grid-cols-4">
          <div><p className="text-[10px] uppercase tracking-wide text-slate-500">Balance</p><p className="text-sm font-bold text-white">{acu(wallet.balanceAcu)}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-500">Plan</p><p className="text-sm font-bold text-white">{wallet.planId || "—"}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-500">Credited (life)</p><p className="text-sm font-bold text-white">{acu(wallet.lifetimeCreditedAcu)}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-500">Spent (life)</p><p className="text-sm font-bold text-white">{acu(wallet.lifetimeDebitedAcu)}</p></div>
        </div>
      )}
      {wallet && wallet.live === false && (
        <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-amber-100">
          {wallet.note || "Accounts are not enforced on this deployment, so there is no per-user wallet to credit."}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={acus} onChange={(e) => setAcus(e.target.value.replace(/[^\d]/g, ""))}
          inputMode="numeric" placeholder="1000"
          className="w-32 rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50"
        />
        <select
          value={planId} onChange={(e) => setPlanId(e.target.value)}
          className="rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50"
        >
          {PLAN_OPTS.map(([v, l]) => <option key={v || "none"} value={v}>{l}</option>)}
        </select>
        <button
          onClick={() => void grant()} disabled={busy !== null || !(amount > 0)}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-bold text-ink-950 hover:bg-emerald-400 disabled:opacity-60"
        >
          {busy === "grant" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />} Grant
        </button>
        {/* WHAT IT COSTS, beside the button that spends it. An ACU is a penny;
            a grant of 10,000 is a hundred pounds of provider budget given away,
            and that number should be impossible to miss at the moment of
            pressing rather than discoverable next month. */}
        {amount > 0 && (
          <span className="text-xs text-slate-400">
            = {gbp(amount)} of AI usage, given away
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK.map((n) => (
          <button
            key={n} onClick={() => setAcus(String(n))}
            className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${amount === n ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-white/10 text-slate-400 hover:bg-white/5"}`}
          >
            {acu(n)}
          </button>
        ))}
      </div>

      {err && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/[0.06] p-3 text-xs leading-relaxed text-rose-200">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {err}
        </p>
      )}
      {done && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] p-3 text-xs leading-relaxed text-emerald-100">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {done}
        </p>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        The account must have signed up first — there is no wallet before there is an account. A
        grant is a credit, not a plan change: pick a plan above only if you also want their tier to
        read differently.
      </p>
    </section>
  );
}
