"use client";

// Admin — invite a (multi-brand) company to test. Create an invite (company,
// plan, brand allotment) → get a shareable /signup?invite=<token> link. Backed by
// /api/admin/invites (admin-scoped when Firebase is configured).

import { useEffect, useState } from "react";
import { Copy, Check, Loader2, Mail, Trash2, UserPlus } from "lucide-react";
import { authedFetch } from "@/frontend/api-client";

type Invite = { token: string; email: string; companyName: string; planId: string; brands: number; status: string; createdAt: string };

const PLAN_OPTS = [
  ["free", "Free"], ["starter", "Starter"], ["growth", "Growth"], ["scale", "Scale"],
  ["business", "Business"], ["enterprise", "Enterprise"], ["corporate", "Corporate"], ["global", "Global"],
] as const;

export default function AdminInvites() {
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [form, setForm] = useState({ companyName: "", email: "", planId: "growth", brands: "3", note: "" });
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = (t: string) => `${origin}/signup?invite=${t}`;

  async function load() {
    try {
      const r = await authedFetch("/api/admin/invites");
      if (r.status === 401 || r.status === 403) { setErr("Admin sign-in required to manage invites."); setInvites([]); return; }
      const d = await r.json();
      setInvites(Array.isArray(d.invites) ? d.invites : []);
    } catch { setInvites([]); }
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!form.companyName.trim()) return;
    setBusy(true); setErr(null);
    try {
      const r = await authedFetch("/api/admin/invites", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, brands: Number(form.brands) || 3 }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "Could not create invite"); return; }
      setNotice(d.emailed ? `Invite created and emailed to ${form.email}.` : `Invite created — copy the link below to share (email not sent).`);
      setForm((f) => ({ ...f, companyName: "", email: "", note: "" }));
      await load();
    } finally { setBusy(false); }
  }

  async function revoke(token: string) {
    await authedFetch(`/api/admin/invites?token=${encodeURIComponent(token)}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="mt-8 card p-6">
      <div className="mb-1 flex items-center gap-2"><UserPlus className="h-4 w-4 text-emerald-400" /><h2 className="font-display font-bold text-white">Invite a company to test</h2></div>
      <p className="mb-4 text-xs text-slate-400">Create an invite for a multi-brand company — set their plan and brand allotment, then share the sign-up link.</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2"><label className="label">Company name</label><input className="input" placeholder="Acme Group" value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} /></div>
        <div className="lg:col-span-2"><label className="label">Contact email</label><input className="input" type="email" placeholder="owner@acme.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
        <div><label className="label">Brands</label><input className="input" type="number" min="1" value={form.brands} onChange={(e) => setForm((f) => ({ ...f, brands: e.target.value }))} /></div>
        <div><label className="label">Plan</label><select className="input" value={form.planId} onChange={(e) => setForm((f) => ({ ...f, planId: e.target.value }))}>{PLAN_OPTS.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></div>
        <div className="lg:col-span-3"><label className="label">Note (optional)</label><input className="input" placeholder="Pilot — 30-day test" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} /></div>
        <div className="flex items-end"><button className="btn-primary w-full" onClick={create} disabled={busy || !form.companyName.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Create invite</button></div>
      </div>
      {err && <p className="mt-2 text-xs text-amber-300">{err}</p>}
      {notice && <p className="mt-2 text-xs text-emerald-300">{notice}</p>}

      <div className="mt-5">
        {invites === null ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-emerald-400" /></div>
        ) : invites.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">No invites yet — create one above.</p>
        ) : (
          <div className="space-y-2">
            {invites.map((i) => (
              <div key={i.token} className="rounded-lg border border-white/[0.07] bg-ink-900/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{i.companyName} <span className="text-xs font-normal text-slate-500">· {i.planId} · {i.brands} brands{i.email ? ` · ${i.email}` : ""}</span></p>
                    <p className="truncate text-[11px] text-sky-300">{link(i.token)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${i.status === "accepted" ? "bg-emerald-500/15 text-emerald-300" : i.status === "revoked" ? "bg-rose-500/15 text-rose-300" : "bg-amber-500/15 text-amber-300"}`}>{i.status}</span>
                    <button onClick={() => { navigator.clipboard?.writeText(link(i.token)); setCopied(i.token); }} className="text-slate-400 hover:text-white" title="Copy link">{copied === i.token ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}</button>
                    {i.status !== "revoked" && <button onClick={() => revoke(i.token)} className="text-slate-600 hover:text-rose-400" title="Revoke"><Trash2 className="h-3.5 w-3.5" /></button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
