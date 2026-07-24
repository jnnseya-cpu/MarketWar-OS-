"use client";

// Customer Intelligence Vault — LIVE, real-data surface.
// Import a CSV (or paste rows) → contacts persist per-brand in the vault
// (/api/contacts) → the AI Audience Segmentation engine scores every one
// (RFM/LTV/churn/intent). No demo sample: an empty brand shows an honest import
// prompt, not fabricated contacts. Consent is preserved; only consented contacts
// are marketing-eligible downstream (email/WhatsApp/autopilot).

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Users, Upload, Trash2, FileUp, ClipboardPaste, CheckCircle2, AlertTriangle } from "lucide-react";
import { DonutChart, HBarList } from "@/components/charts";
import { PageHeader, Pill, StatCard } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";
import ExportButton from "@/components/ExportButton";

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

type ParsedContact = { email: string; name: string; phone: string; company: string; totalSpendGbp: string; orderCount: string; lastOrderDaysAgo: string; consent?: boolean; trade?: string; town?: string; area?: string; status?: string; score?: string };

// Robust client-side parser. Handles real-world exports:
//  • auto-detects the delimiter (tab, comma or semicolon),
//  • works WITH a header row (fuzzy-mapped) OR WITHOUT one (headerless),
//  • finds the email in whatever column it lands in (even mid-cell / with junk),
//  • falls back to phone/name so a row is never silently dropped.
// Extract the first email-looking token from any text (strips trailing quotes,
// commas, surrounding whitespace, and multi-email cells like "a@x.com,b@x.com").
function firstEmail(s: string): string {
  const m = (s || "").match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/);
  return m ? m[0].toLowerCase() : "";
}
function firstPhone(s: string): string {
  const t = (s || "").replace(/[^\d+]/g, "");
  return t.replace(/^\+/, "").length >= 7 ? (s.trim()) : "";
}

function parseCsv(text: string): ParsedContact[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim().length);
  if (!lines.length) return [];

  // Detect delimiter from the sample: tab wins over semicolon wins over comma
  // when it appears more (handles tab-separated pastes with commas inside cells).
  const sample = lines.slice(0, 20).join("\n");
  const n = (re: RegExp) => (sample.match(re) || []).length;
  const tabs = n(/\t/g), semis = n(/;/g), commas = n(/,/g);
  const delim = tabs >= commas && tabs >= semis ? "\t" : semis > commas ? ";" : ",";

  const parseLine = (line: string): string[] => {
    const out: string[] = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else { if (ch === '"') q = true; else if (ch === delim) { out.push(cur); cur = ""; } else cur += ch; }
    }
    out.push(cur); return out.map((s) => s.trim());
  };

  const first = parseLine(lines[0]);
  const KNOWN = ["email", "e-mail", "name", "phone", "mobile", "tel", "company", "organisation", "organization", "spend", "revenue", "ltv", "orders", "consent", "opt", "first", "last", "contact"];
  const firstHasEmail = first.some((c) => firstEmail(c));
  const looksHeader = !firstHasEmail && first.some((c) => KNOWN.some((k) => c.toLowerCase().includes(k)));
  const truthy = new Set(["yes", "true", "1", "y", "subscribed", "opt-in", "opted in", "opted-in", "consented", "oui"]);

  // ---- Header path: map columns by name (as before, delimiter-aware) ----
  if (looksHeader) {
    const headers = first.map((h) => h.toLowerCase());
    const find = (...names: string[]) => headers.findIndex((h) => names.some((x) => h === x || h.includes(x)));
    const iEmail = find("email", "e-mail"), iName = find("full name", "name", "contact");
    const iFirst = headers.findIndex((h) => ["first name", "firstname", "first", "given name"].includes(h));
    const iLast = headers.findIndex((h) => ["last name", "lastname", "surname", "family name"].includes(h));
    const iPhone = find("phone", "mobile", "tel", "cell"), iCompany = find("company", "organisation", "organization", "account");
    const iSpend = find("spend", "revenue", "ltv", "total value", "value", "amount"), iOrders = find("orders", "order count", "purchases", "transactions");
    const iRecency = find("last order days", "days since", "recency", "days ago"), iConsent = find("consent", "opt-in", "optin", "subscribed", "marketing");
    // Prospect-list columns (Company / Trade / Town / Area / Score / Status).
    const iTrade = find("trade", "sector", "category"), iTown = find("town", "city"), iArea = find("area", "region", "postcode area");
    const iStatus = find("status", "stage"), iScore = find("score", "rating");
    const g = (c: string[], i: number) => (i >= 0 && i < c.length ? c[i] : "");
    const rows: ParsedContact[] = [];
    for (let r = 1; r < lines.length; r++) {
      const c = parseLine(lines[r]);
      let name = g(c, iName);
      if (!name && (iFirst >= 0 || iLast >= 0)) name = [g(c, iFirst), g(c, iLast)].filter(Boolean).join(" ");
      rows.push({
        email: firstEmail(g(c, iEmail)) || (iEmail < 0 ? firstEmail(c.join(" ")) : ""),
        name, phone: g(c, iPhone), company: g(c, iCompany),
        totalSpendGbp: g(c, iSpend), orderCount: g(c, iOrders), lastOrderDaysAgo: g(c, iRecency),
        consent: iConsent >= 0 ? truthy.has(g(c, iConsent).toLowerCase()) : undefined,
        trade: g(c, iTrade) || undefined, town: g(c, iTown) || undefined, area: g(c, iArea) || undefined,
        status: g(c, iStatus) || undefined, score: g(c, iScore) || undefined,
      });
    }
    // Keep company-only prospect rows too (not just email/phone/name).
    return rows.filter((r) => r.email || r.phone || r.name || r.company);
  }

  // ---- Headerless path: detect the email column by content ----
  const parsed = lines.map(parseLine);
  const colCount = Math.max(...parsed.map((c) => c.length));
  let emailCol = -1, best = 0;
  for (let ci = 0; ci < colCount; ci++) {
    let hits = 0;
    for (const c of parsed) if (c[ci] && firstEmail(c[ci])) hits++;
    if (hits > best) { best = hits; emailCol = ci; }
  }
  const rows: ParsedContact[] = [];
  for (const c of parsed) {
    const email = emailCol >= 0 && firstEmail(c[emailCol] || "") ? firstEmail(c[emailCol]) : firstEmail(c.join(" "));
    // Remaining non-email text cells → name (first) + company (second), skipping
    // the detected email cell and any obvious phone cell.
    const others = c.map((s) => s.trim()).filter((s, i) => s && i !== emailCol && !firstEmail(s));
    const phone = c.map((s) => firstPhone(s)).find(Boolean) || "";
    const textOthers = others.filter((s) => !firstPhone(s));
    rows.push({
      email, name: textOthers[0] || "", phone, company: textOthers[1] || "",
      totalSpendGbp: "", orderCount: "", lastOrderDaysAgo: "", consent: undefined,
    });
  }
  return rows.filter((r) => r.email || r.phone || r.name);
}

export default function CustomerVaultPage() {
  const { activeBrand, ready } = useActiveBrand();
  const [report, setReport] = useState<VaultReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Client-side cache of the last scored vault per brand. Makes import → display
  // reliable even when server persistence is flaky (serverless in-memory doesn't
  // survive between requests, and Firestore may be unconfigured on a deploy). The
  // server remains the source of truth when it returns data; the cache only fills
  // in when the server round-trip comes back empty.
  const cacheKey = (brandId: string) => `mw.vault.${brandId}`;
  const readCache = (brandId: string): VaultReport | null => {
    try { const raw = localStorage.getItem(cacheKey(brandId)); return raw ? (JSON.parse(raw) as VaultReport) : null; } catch { return null; }
  };
  const writeCache = (brandId: string, r: VaultReport) => { try { localStorage.setItem(cacheKey(brandId), JSON.stringify(r)); } catch { /* quota/private */ } };

  const load = useCallback(async (brandId: string, business: string) => {
    setBusy(true);
    try {
      const res = await authedFetch(`/api/contacts?brandId=${encodeURIComponent(brandId)}&business=${encodeURIComponent(business)}`);
      const server = res.ok ? (await res.json()) as VaultReport : null;
      if (server && server.contactCount > 0) { setReport(server); writeCache(brandId, server); return; }
      // Server empty (or unavailable) → fall back to the local cache if present.
      let cached: VaultReport | null = null;
      try { const raw = localStorage.getItem(`mw.vault.${brandId}`); cached = raw ? JSON.parse(raw) : null; } catch { cached = null; }
      setReport(cached && cached.contactCount > 0 ? cached : server);
    } catch {
      try { const raw = localStorage.getItem(`mw.vault.${brandId}`); setReport(raw ? JSON.parse(raw) : null); } catch { setReport(null); }
    } finally { setBusy(false); }
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (activeBrand) load(activeBrand.id, activeBrand.name); else setReport(null);
  }, [ready, activeBrand, load]);

  async function importContacts(contacts: ParsedContact[]) {
    if (!activeBrand) { setMsg({ text: "No active brand — pick or add a brand first.", error: true }); return; }
    if (!contacts.length) { setMsg({ text: "No valid rows found — need at least an email, phone, name or company column.", error: true }); return; }
    setImporting(true); setMsg(null);
    try {
      const res = await authedFetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-now": new Date().toISOString() },
        body: JSON.stringify({ brandId: activeBrand.id, business: activeBrand.name, contacts }),
      });
      // Defensive parse: an auth redirect / 500 / proxy page may not be JSON.
      // Never let a parse throw silently swallow the outcome.
      const raw = await res.text();
      let d: Record<string, unknown> = {};
      try { d = raw ? JSON.parse(raw) : {}; } catch { d = {}; }
      // eslint-disable-next-line no-console
      console.log("[vault] import response", res.status, d);
      if (!res.ok) {
        const reason = (typeof d.error === "string" && d.error) || `Import failed (HTTP ${res.status})${raw && !d.error ? ` — ${raw.slice(0, 140)}` : ""}`;
        setMsg({ text: reason, error: true });
        return;
      }
      setReport(d as unknown as VaultReport);
      writeCache(activeBrand.id, d as unknown as VaultReport);
      const imported = Number(d.imported) || 0;
      const total = Number(d.total) || 0;
      setMsg({ text: `Imported ${imported} contact${imported === 1 ? "" : "s"} — ${total} in the vault, all scored.`, error: false });
      setPaste(""); setShowPaste(false);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[vault] import error", e);
      setMsg({ text: `Import failed: ${(e as Error).message || "network error"}. Check you're signed in, then retry.`, error: true });
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
      try { localStorage.removeItem(cacheKey(activeBrand.id)); } catch { /* ignore */ }
      setMsg({ text: "Vault cleared.", error: false });
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
        actions={
          <div className="flex items-center gap-2">
            <Pill tone={hasContacts ? "good" : "info"}>{hasContacts ? `${report?.contactCount} live contacts` : "No contacts yet"}</Pill>
            {hasContacts && (
              <ExportButton
                dataset="customer-vault"
                label="Export vault"
                columns={["name", "segmentLabel", "spendGbp", "orders", "ltvGbp", "churnRisk", "purchaseIntent", "lastOrderDaysAgo", "consent"]}
                rows={(report?.customers ?? []).map((c) => ({
                  name: c.name, segmentLabel: c.segmentLabel, spendGbp: c.spendGbp, orders: c.orders,
                  ltvGbp: c.ltvGbp, churnRisk: c.churnRisk, purchaseIntent: c.purchaseIntent,
                  lastOrderDaysAgo: c.lastOrderDaysAgo ?? "", consent: c.consent ? "yes" : "no",
                }))}
              />
            )}
          </div>
        }
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
                <div className="mt-2 flex items-center gap-3">
                  <button className="btn-primary" onClick={() => importContacts(parseCsv(paste))} disabled={importing || !paste.trim()}>
                    {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardPaste className="h-4 w-4" />} Import pasted rows
                  </button>
                  {paste.trim() && <span className="text-xs text-slate-500">{parseCsv(paste).length} row{parseCsv(paste).length === 1 ? "" : "s"} detected</span>}
                </div>
              </div>
            )}
            {msg && (
              <p className={`mt-3 flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium ${msg.error ? "bg-rose-500/10 text-rose-300" : "bg-emerald-500/10 text-emerald-300"}`}>
                {msg.error ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />} {msg.text}
              </p>
            )}
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
