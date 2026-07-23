"use client";

// Real partner/creator/affiliate application form — the working capture behind
// the Growth & Influencers page. Submits to /api/growth/apply, which stores the
// application. Honest: on success it confirms the application was received (it
// does NOT pretend the network is live). Replaces the old dead "/contact" link.

import { useState } from "react";
import { Loader2, CheckCircle2, Send } from "lucide-react";

const TIERS = [
  { value: "promoter", label: "Promoter — share a link, earn on referrals" },
  { value: "creator", label: "Creator — make content for brands" },
  { value: "affiliate", label: "Affiliate Partner — drive signups at scale" },
  { value: "agency", label: "Agency Partner — bring clients (white-label)" },
];

export default function PartnerApplyForm() {
  const [tier, setTier] = useState("promoter");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [audience, setAudience] = useState("");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/growth/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, name, email, audience, website, notes, nowISO: new Date().toISOString() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong — try again."); return; }
      setDone(data.message || "Application received.");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-6">
        <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-400" /><h3 className="font-display text-base font-bold text-white">Application received</h3></div>
        <p className="mt-2 text-sm text-slate-300">{done}</p>
      </div>
    );
  }

  const input = "w-full rounded-lg border border-ink-700 bg-ink-900/70 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/60";
  return (
    <form onSubmit={submit} className="rounded-xl border border-white/10 bg-ink-900/60 p-6">
      <h3 className="font-display text-base font-bold text-white">Apply to the early-access programme</h3>
      <p className="mt-1 mb-4 text-[13px] text-slate-400">Real application — we store it and onboard your tier as it opens. No fake network, no self-serve dashboard yet.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2 block">
          <span className="mb-1 block text-xs font-semibold text-slate-400">How do you want to earn?</span>
          <select value={tier} onChange={(e) => setTier(e.target.value)} className={input}>
            {TIERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-400">Your name</span><input value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="Full name" /></label>
        <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-400">Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="you@example.com" /></label>
        <label className="sm:col-span-2 block"><span className="mb-1 block text-xs font-semibold text-slate-400">Where do you have reach? (channels + rough audience size)</span><input value={audience} onChange={(e) => setAudience(e.target.value)} className={input} placeholder="e.g. TikTok 22k, Instagram 8k, local WhatsApp groups" /></label>
        <label className="sm:col-span-2 block"><span className="mb-1 block text-xs font-semibold text-slate-400">Website / main profile (optional)</span><input value={website} onChange={(e) => setWebsite(e.target.value)} className={input} placeholder="https://…" /></label>
        <label className="sm:col-span-2 block"><span className="mb-1 block text-xs font-semibold text-slate-400">Anything else (optional)</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${input} min-h-[72px]`} placeholder="Niche, audience, why you're a fit…" /></label>
      </div>
      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
      <button type="submit" disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-bold text-ink-950 hover:bg-emerald-400 disabled:opacity-60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {busy ? "Submitting…" : "Submit application"}
      </button>
    </form>
  );
}
