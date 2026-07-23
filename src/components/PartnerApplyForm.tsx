"use client";

// Real creator/affiliate application form — the working capture behind the
// Growth & Influencers page. Submits to /api/growth/apply, which stores the
// application. Honest: on success it confirms the application was received.
//
// New commission model: subscribe to 1–100 programmes, get a code/link per
// programme, paid 0.75% per referred user (platform 0.25%) — but payout only
// unlocks at 10k+ total followers across all socials + YouTube.

import { useState } from "react";
import { Loader2, CheckCircle2, Send, Plus, X } from "lucide-react";
import { MIN_PAYOUT_FOLLOWERS, MIN_PROGRAMMES, MAX_PROGRAMMES, SUB10K_ACU_PER_REFERRAL } from "@/shared/creator-program";

type SocialRow = { platform: string; handle: string; followers: number };
const PLATFORMS = ["YouTube", "TikTok", "Instagram", "Facebook", "LinkedIn", "X", "Newsletter", "Podcast", "Other"];

const TIERS = [
  { value: "promoter", label: "Promoter — share codes/links, earn on referrals" },
  { value: "creator", label: "Creator — make content for the products you promote" },
  { value: "affiliate", label: "Affiliate Partner — drive signups at scale" },
  { value: "agency", label: "Agency Partner — bring clients (white-label)" },
];

export default function PartnerApplyForm() {
  const [tier, setTier] = useState("promoter");
  const [programmes, setProgrammes] = useState(5);
  const [socials, setSocials] = useState<SocialRow[]>([{ platform: "YouTube", handle: "", followers: 0 }]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const followers = socials.reduce((s, r) => s + (Number(r.followers) || 0), 0);
  const addRow = () => setSocials((r) => (r.length < 12 ? [...r, { platform: "Instagram", handle: "", followers: 0 }] : r));
  const removeRow = (i: number) => setSocials((r) => r.filter((_, idx) => idx !== i));
  const setRow = (i: number, patch: Partial<SocialRow>) => setSocials((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const audience = socials.filter((s) => s.handle || s.followers).map((s) => `${s.platform} ${s.handle} ${s.followers}`.trim()).join(", ");
      const res = await fetch("/api/growth/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, programmes, followers, socials, audience, name, email, website, notes, nowISO: new Date().toISOString() }),
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
      <h3 className="font-display text-base font-bold text-white">Apply to the creator programme</h3>
      <p className="mt-1 mb-4 text-[13px] text-slate-400">Real application — we store it, score it and match you to brands. {MIN_PAYOUT_FOLLOWERS.toLocaleString()}+ combined followers earns cash commission (0.75%); under that you earn {SUB10K_ACU_PER_REFERRAL} ACUs per referral and auto-upgrade at {MIN_PAYOUT_FOLLOWERS.toLocaleString()}.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-400">How do you want to earn?</span>
          <select value={tier} onChange={(e) => setTier(e.target.value)} className={input}>
            {TIERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-400">Programmes to subscribe to ({MIN_PROGRAMMES}–{MAX_PROGRAMMES})</span>
          <input type="number" min={MIN_PROGRAMMES} max={MAX_PROGRAMMES} value={programmes} onChange={(e) => setProgrammes(Math.max(MIN_PROGRAMMES, Math.min(MAX_PROGRAMMES, Number(e.target.value))))} className={input} />
        </label>
        <div className="sm:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-slate-400">Your social handles + audience (add every platform — followers are combined)</span>
          <div className="space-y-2">
            {socials.map((row, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select value={row.platform} onChange={(e) => setRow(i, { platform: e.target.value })} className={`${input} max-w-[130px]`}>
                  {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <input value={row.handle} onChange={(e) => setRow(i, { handle: e.target.value })} className={`${input} flex-1 min-w-[120px]`} placeholder="@handle" />
                <input type="number" min={0} value={row.followers || ""} onChange={(e) => setRow(i, { followers: Math.max(0, Number(e.target.value)) })} className={`${input} max-w-[120px]`} placeholder="followers" />
                {socials.length > 1 && <button type="button" onClick={() => removeRow(i)} className="rounded-lg border border-ink-700 p-2 text-slate-500 hover:text-rose-400"><X className="h-4 w-4" /></button>}
              </div>
            ))}
          </div>
          <button type="button" onClick={addRow} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-300 hover:text-emerald-200"><Plus className="h-3.5 w-3.5" /> Add another platform</button>
          <div className={`mt-2 rounded-lg border p-2.5 text-[12px] ${followers >= MIN_PAYOUT_FOLLOWERS ? "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-200" : "border-sky-500/25 bg-sky-500/[0.06] text-sky-200"}`}>
            <span className="font-bold">{followers.toLocaleString()}</span> combined followers — {followers >= MIN_PAYOUT_FOLLOWERS
              ? "you qualify for the MAIN programme: recurring cash commission (0.75%) on verified sales, paid out."
              : `you can promote and accrue now: your commission accumulates until you reach ${MIN_PAYOUT_FOLLOWERS.toLocaleString()}, then pays out — and you also earn ${SUB10K_ACU_PER_REFERRAL} ACUs per referral to create a brand + advertise. You auto-upgrade the moment you cross ${MIN_PAYOUT_FOLLOWERS.toLocaleString()}.`}
          </div>
        </div>
        <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-400">Your name</span><input value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="Full name" /></label>
        <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-400">Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="you@example.com" /></label>
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
