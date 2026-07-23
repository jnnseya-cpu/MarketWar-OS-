"use client";

// Customer Intelligence Vault — LIVE, real-data surface.
// Import a CSV (or paste rows) → contacts persist per-brand in the vault
// (/api/contacts) → the AI Audience Segmentation engine scores every one
// (RFM/LTV/churn/intent). No demo sample: an empty brand shows an honest import
// prompt, not fabricated contacts. Consent is preserved; only consented contacts
// are marketing-eligible downstream (email/WhatsApp/autopilot).

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Users, Upload, Trash2, FileUp, ClipboardPaste, CheckCircle2 } from "lucide-react";
import { DonutChart, HBarList } from "@/components/charts";
import { PageHeader, Pill, StatCard } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";

type Row = {
  id: string; name: string; segment: string; segmentLabel: string; spendGbp: number;
  orders: number; ltvGbp: number; churnRisk: number; purchaseIntent: number;
  lastOrderDaysAgo: number | null; consent: boolean;
};
type VaultReport = {
  business: string; live: boolean; contactCount: number; totalContacts: number; totalLtvGbp: number;
  hot: number; atRisk: number; consentedShare: number; statusCounts: Record<string, number>;
  customers: Row[]; note: string;
};

type ParsedContact = { email: string; name: string; phone: string; company: string; totalSpendGbp: string; orderCount: string; lastOrderDaysAgo: string; consent?: boolean };

// Minimal, quote-aware CSV parser + fuzzy header mapping. Runs client-side.
function parseCsv(text: string): ParsedContact[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim().length);
  if (lines.length < 2) return [];
  const parseLine = (line: string): string[] => {
    const out: string[] = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else { if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch; }
    }
    out.push(cur); return out.map((s) => s.trim());
  };
  const headers = parseLine(lines[0]).map((h) => h.toLowerCase());
  const find = (...names: string[]) => headers.findIndex((h) => names.some((n) => h === n || h.includes(n)));
  const iEmail = find("email", "e-mail");
  const iName = find("full name", "name", "contact");
  const iFirst = headers.findIndex((h) => ["first name", "firstname", "first", "given name"].includes(h));
  const iLast = headers.findIndex((h) => ["last name", "lastname", "surname", "family name"].includes(h));
  const iPhone = find("phone", "mobile", "tel", "cell");
  const iCompany = find("company", "organisation", "organization", "account");
  const iSpend = find("spend", "revenue", "ltv", "total value", "value", "amount");
  const iOrders = find("orders", "order count", "purchases", "transactions");
  const iRecency = find("last order days", "days since", "recency", "days ago");
  const iConsent = find("consent", "opt-in", "optin", "subscribed", "marketing");
  const g = (cells: string[], i: number) => (i >= 0 && i < cells.length ? cells[i] : "");
  const truthy = new Set(["yes", "true", "1", "y", "subscribed", "opt-in", "opted in", "opted-in", "consented"]);
  const rows: ParsedContact[] = [];
  for (let r = 1; r < lines.length; r++) {
    const c = parseLine(lines[r]);
    let name = g(c, iName);
    if (!name && (iFirst >= 0 || iLast >= 0)) name = [g(c, iFirst), g(c, iLast)].filter(Boolean).join(" ");
    const consentRaw = g(c, iConsent).toLowerCase();
    rows.push({
      email: g(c, iEmail), name, phone: g(c, iPhone), company: g(c, iCompany),
      totalSpendGbp: g(c, iSpend), orderCount: g(c, iOrders), lastOrderDaysAgo: g(c, iRecency),
      consent: iConsent >= 0 ? truthy.has(consentRaw) : undefined,
    });
  }
  return rows.filter((r) => r.email || r.phone || r.name);
}

export default function CustomerVaultPage() {
  const { activeBrand, ready } = useActiveBrand();
  const [report, setReport] = useState<VaultReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (brandId: string, business: string) => {
    setBusy(true);
    try {
      const res = await authedFetch(`/api/contacts?brandId=${encodeURIComponent(brandId)}&business=${encodeURIComponent(business)}`);
      setReport(await res.json());
    } catch { setReport(null); } finally { setBusy(false); }
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (activeBrand) load(activeBrand.id, activeBrand.name); else setReport(null);
  }, [ready, activeBrand, load]);

  async function importContacts(contacts: ParsedContact[]) {
    if (!activeBrand) return;
    if (!contacts.length) { setMsg("No valid rows found — need at least an email, phone or name column."); return; }
    setImporting(true); setMsg(null);
    try {
      const res = await authedFetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-now": new Date().toISOString() },
        body: JSON.stringify({ brandId: activeBrand.id, business: activeBrand.name, contacts }),
      });
      const d = await res.json();
      if (!res.ok) { setMsg(d.error || "Import failed"); return; }
      setReport(d);
      setMsg(`Imported ${d.imported} contact${d.imported === 1 ? "" : "s"} — ${d.total} in the vault, all scored.`);
      setPaste(""); setShowPaste(false);
    } finally { setImporting(false); }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await importContacts(parseCsv(text));
    if (fileRef.current) fileRef.current.value = "";
  }

  async function clearVault() {
    if (!activeBrand) return;
    if (!confirm("Remove all imported contacts for this brand? This cannot be undone.")) return;
    setBusy(true);
    try {
      await authedFetch(`/api/contacts?brandId=${encodeURIComponent(activeBrand.id)}`, { method: "DELETE" });
      await load(activeBrand.id, activeBrand.name);
      setMsg("Vault cleared.");
    } finally { setBusy(false); }
  }

  const donutData = report ? Object.entries(report.statusCounts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value) : [];
  const topLtv = report ? report.customers.slice(0, 5) : [];
  const hasContacts = Boolean(report && report.contactCount > 0);

  return (
    <div>
      <PageHeader
        kicker="Customer Intelligence Vault"
        title="Your database is a marketing asset"
        subtitle="Import a CSV of your contacts — every one is scored for engagement, intent, churn risk and lifetime value the moment it lands. Consented contacts become a sendable, trackable segment for email, WhatsApp and Autopilot."
        actions={<Pill tone={hasContacts ? "good" : "info"}>{hasContacts ? `${report?.contactCount} live contacts` : "No contacts yet"}</Pill>}
      />

      {ready && !activeBrand && (
        <div className="card border-emerald-500/20 p-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400"><Users className="h-5 w-5" /></span>
          <h2 className="mt-4 font-display text-lg font-bold text-white">Add a brand first</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">Pick or add a brand in the switcher, then import that brand&apos;s contacts here.</p>
        </div>
      )}

      {activeBrand && (
        <>
          {/* Import panel */}
          <div className="mb-6 card border-emerald-500/25 p-5">
            <div className="mb-3 flex items-center gap-2">
              <Upload className="h-4 w-4 text-emerald-400" />
              <h2 className="font-display text-sm font-bold text-white">Import contacts (CSV)</h2>
            </div>
            <p className="mb-3 text-xs text-slate-400">
              Columns detected automatically: <span className="text-slate-300">email, name, phone, company, spend, orders, last-order-days, consent</span>. Email is enough. Re-importing the same email merges (no duplicates).
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" id="csvfile" />
              <label htmlFor="csvfile" className="btn-primary cursor-pointer">
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} Upload CSV
              </label>
              <button className="btn-ghost" onClick={() => setShowPaste((v) => !v)}><ClipboardPaste className="h-4 w-4" /> Paste rows</button>
              {hasContacts && <button className="btn-ghost !text-rose-300" onClick={clearVault}><Trash2 className="h-4 w-4" /> Clear vault</button>}
            </div>
            {showPaste && (
              <div className="mt-3">
                <textarea
                  value={paste} onChange={(e) => setPaste(e.target.value)} rows={4}
                  placeholder={"email,name,consent\njane@acme.com,Jane Doe,yes\njohn@corp.com,John Smith,yes"}
                  className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 font-mono text-xs text-white placeholder-slate-600 outline-none focus:border-emerald-500/60"
                />
                <button className="btn-primary mt-2" onClick={() => importContacts(parseCsv(paste))} disabled={importing || !paste.trim()}>
                  {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardPaste className="h-4 w-4" />} Import pasted rows
                </button>
              </div>
            )}
            {msg && <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> {msg}</p>}
          </div>

          {busy && !report && (
            <div className="card p-10 text-center text-sm text-slate-400"><Loader2 className="mx-auto h-5 w-5 animate-spin text-emerald-400" /><p className="mt-3">Scoring contacts…</p></div>
          )}

          {/* Empty vault — honest, no demo sample */}
          {report && !hasContacts && !busy && (
            <div className="card p-10 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400"><Upload className="h-5 w-5" /></span>
              <h2 className="mt-4 font-display text-lg font-bold text-white">Vault is empty</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">Upload a CSV above to populate {activeBrand.name}&apos;s vault. Every contact gets RFM, LTV, churn and intent scores instantly — then Autopilot and the email/WhatsApp engines act on real people.</p>
            </div>
          )}

          {hasContacts && report && (
            <>
              <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Contacts" value={`${report.totalContacts}`} sub="imported records" />
                <StatCard label="Lifetime value" value={`£${report.totalLtvGbp.toLocaleString()}`} tone="good" sub={`${Math.round(report.consentedShare * 100)}% consented`} />
                <StatCard label="Hot leads now" value={`${report.hot}`} tone="good" />
                <StatCard label="At churn risk" value={`${report.atRisk}`} tone="warn" sub="risk ≥ 60" />
              </div>

              <div className="mb-8 grid gap-6 lg:grid-cols-2">
                <div className="card p-5">
                  <h2 className="mb-3 font-display font-bold text-white">Vault by segment</h2>
                  {donutData.length ? <DonutChart size={185} centerValue={`${report.totalContacts}`} centerLabel="contacts" data={donutData} /> : <p className="text-sm text-slate-500">No segments yet.</p>}
                </div>
                <div className="card p-5">
                  <h2 className="mb-4 font-display font-bold text-white">Lifetime value — top customers</h2>
                  {topLtv.length ? <HBarList valuePrefix="£" data={topLtv.map((c) => ({ label: c.name, value: c.ltvGbp, note: `${c.orders} orders` }))} /> : <p className="text-sm text-slate-500">No customers yet.</p>}
                </div>
              </div>

              <div className="card overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink-700 text-xs uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-3 font-semibold">Customer</th>
                      <th className="px-4 py-3 font-semibold">Segment</th>
                      <th className="px-4 py-3 text-right font-semibold">Spend</th>
                      <th className="px-4 py-3 text-right font-semibold">Orders</th>
                      <th className="px-4 py-3 text-right font-semibold">LTV</th>
                      <th className="px-4 py-3 text-right font-semibold">Intent</th>
                      <th className="px-4 py-3 text-right font-semibold">Churn risk</th>
                      <th className="px-4 py-3 text-right font-semibold">Last order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.customers.map((c) => (
                      <tr key={c.id} className="border-b border-ink-800 last:border-0 hover:bg-ink-850/60">
                        <td className="px-4 py-3"><p className="font-semibold text-white">{c.name}</p><p className="text-xs text-slate-500">{c.consent ? "marketing-eligible" : "no consent"}</p></td>
                        <td className="px-4 py-3"><Pill tone={c.churnRisk >= 60 ? "warn" : c.purchaseIntent >= 75 ? "good" : "neutral"}>{c.segmentLabel}</Pill></td>
                        <td className="px-4 py-3 text-right font-display font-bold text-white">£{c.spendGbp.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-slate-300">{c.orders}</td>
                        <td className="px-4 py-3 text-right font-display font-bold text-emerald-300">£{c.ltvGbp.toLocaleString()}</td>
                        <td className={`px-4 py-3 text-right font-display font-bold ${c.purchaseIntent >= 75 ? "text-emerald-400" : c.purchaseIntent >= 50 ? "text-amber-400" : "text-slate-500"}`}>{c.purchaseIntent}</td>
                        <td className={`px-4 py-3 text-right font-display font-bold ${c.churnRisk >= 60 ? "text-rose-400" : c.churnRisk >= 30 ? "text-amber-400" : "text-emerald-400"}`}>{c.churnRisk}%</td>
                        <td className="px-4 py-3 text-right text-slate-400">{c.lastOrderDaysAgo === null ? "—" : c.lastOrderDaysAgo === 0 ? "today" : `${c.lastOrderDaysAgo}d ago`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-4 text-xs text-slate-600">{report.note}</p>
            </>
          )}
        </>
      )}
    </div>
  );
}
