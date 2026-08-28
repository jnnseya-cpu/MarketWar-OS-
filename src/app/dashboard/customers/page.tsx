"use client";

// Customer Intelligence Vault — LIVE, real-data surface.
// Import a CSV (or paste rows) → contacts persist per-brand in the vault
// (/api/contacts) → the AI Audience Segmentation engine scores every one
// (RFM/LTV/churn/intent). No demo sample: an empty brand shows an honest import
// prompt, not fabricated contacts. Consent is preserved; only consented contacts
// are marketing-eligible downstream (email/WhatsApp/autopilot).

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Users, Upload, Trash2, FileUp, ClipboardPaste, CheckCircle2, AlertTriangle, Mail, MessageCircle, Search, ExternalLink, ShieldCheck } from "lucide-react";
import { DonutChart, HBarList } from "@/components/charts";
import { PageHeader, Pill, StatCard } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";
import ExportButton from "@/components/ExportButton";

type Row = {
  id: string; name: string; segment: string; segmentLabel: string; spendGbp: number;
  orders: number; ltvGbp: number; churnRisk: number; purchaseIntent: number;
  lastOrderDaysAgo: number | null; consent: boolean;
  email?: string | null; phone?: string | null; company?: string | null;
  trade?: string | null; town?: string | null; status?: string | null;
  website?: string | null; emailConfidence?: string | null;
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

// One-click contact helpers. The email is prefilled but fully editable in the
// user's own mail client (no send happens here — the user stays in control).
function mailtoFor(r: Row, fromBrand: string): string {
  const who = r.company || r.name || "there";
  const trade = r.trade ? ` ${r.trade.toLowerCase()}` : "";
  const town = r.town ? ` in ${r.town}` : "";
  const subject = `Quick question for ${who}`;
  const body = `Hi ${who},\n\nI came across your${trade} business${town} and wanted to reach out.\n\n[Write your offer here — what you do and why it's relevant to them.]\n\nBest regards,\n${fromBrand}`;
  return `mailto:${r.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
function waLink(phone: string, r: Row, fromBrand: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("0")) d = "44" + d.slice(1);        // UK national → international
  const who = r.company || r.name || "there";
  const text = `Hi ${who}, this is ${fromBrand}. `;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

export default function CustomerVaultPage() {
  const { activeBrand, ready } = useActiveBrand();
  const [report, setReport] = useState<VaultReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [breakdown, setBreakdown] = useState<{ found: number; searchUnavailable: number; noOwnSite: number; siteNoEmail: number; total: number } | null>(null);
  const [audit, setAudit] = useState<{ badCount: number; checked: number; sample: { company: string; email: string; reason: string }[] } | null>(null);
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

  // Large lists are imported in automatic batches: the server caps a single
  // upload (and serverless has a request-size limit), so anything big is split
  // into CHUNK-row POSTs sent in sequence. The server returns the full scored
  // vault each time, so the LAST response holds the complete, scored vault.
  const CHUNK = 2000;

  async function importContacts(contacts: ParsedContact[]) {
    if (!activeBrand) { setMsg({ text: "No active brand — pick or add a brand first.", error: true }); return; }
    if (!contacts.length) { setMsg({ text: "No valid rows found — need at least an email, phone, name or company column.", error: true }); return; }
    setImporting(true); setMsg(null);
    const batches: ParsedContact[][] = [];
    for (let i = 0; i < contacts.length; i += CHUNK) batches.push(contacts.slice(i, i + CHUNK));
    let last: VaultReport | null = null;
    let done = 0;
    try {
      for (let b = 0; b < batches.length; b++) {
        if (batches.length > 1) setMsg({ text: `Importing… ${done.toLocaleString()} / ${contacts.length.toLocaleString()} rows`, error: false });
        const res = await authedFetch("/api/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-now": new Date().toISOString() },
          body: JSON.stringify({ brandId: activeBrand.id, business: activeBrand.name, contacts: batches[b] }),
        });
        // Defensive parse: an auth redirect / 500 / proxy page may not be JSON.
        const raw = await res.text();
        let d: Record<string, unknown> = {};
        try { d = raw ? JSON.parse(raw) : {}; } catch { d = {}; }
        // LAUNCH-AUDIT D-01: this logged the whole parsed response `d` for every
        // batch of a CUSTOMER import. Whatever the server echoes back — counts,
        // errors, and anything it chose to include about the rows — went to the
        // browser console of whoever ran the import, and stayed in it. Debug
        // output in a flow that handles other people's customer records is not
        // a style question. The batch position is kept because it is genuinely
        // useful when a long import stalls; the payload is not.
        if (!res.ok) {
          const reason = (typeof d.error === "string" && d.error) || `Import failed (HTTP ${res.status})${raw && !d.error ? ` — ${raw.slice(0, 140)}` : ""}`;
          setMsg({ text: `${reason}${done > 0 ? ` (imported ${done.toLocaleString()} before this)` : ""}`, error: true });
          return;
        }
        last = d as unknown as VaultReport;
        done += batches[b].length;
      }
      if (last) {
        setReport(last);
        writeCache(activeBrand.id, last);
        const total = Number(last.contactCount) || Number((last as unknown as { total?: number }).total) || 0;
        setMsg({ text: `Imported ${contacts.length.toLocaleString()} row${contacts.length === 1 ? "" : "s"} — ${total.toLocaleString()} contact${total === 1 ? "" : "s"} in the vault, all scored.`, error: false });
        setPaste(""); setShowPaste(false);
      }
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

  // Find real emails for prospect rows that don't have one — reads each firm's
  // own website via live Google and extracts a genuine address (never invents).
  // Capped server-side per call; re-run to continue through a large list.
  async function findEmails() {
    if (!activeBrand) return;
    setEnriching(true); setMsg({ text: "Finding real emails from each company's website… this can take a minute.", error: false });
    try {
      const res = await authedFetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-now": new Date().toISOString() },
        body: JSON.stringify({ brandId: activeBrand.id, business: activeBrand.name, action: "enrich" }),
      });
      const raw = await res.text();
      let d: Record<string, unknown> = {};
      try { d = raw ? JSON.parse(raw) : {}; } catch { d = {}; }
      if (!res.ok) { setMsg({ text: (typeof d.error === "string" && d.error) || `Enrichment failed (HTTP ${res.status})`, error: true }); return; }
      if (d.contactCount !== undefined) { setReport(d as unknown as VaultReport); writeCache(activeBrand.id, d as unknown as VaultReport); }
      const b = d.breakdown as { found?: number; searchUnavailable?: number; noOwnSite?: number; siteNoEmail?: number } | undefined;
      setBreakdown(b ? {
        found: Number(b.found) || 0,
        searchUnavailable: Number(b.searchUnavailable) || 0,
        noOwnSite: Number(b.noOwnSite) || 0,
        siteNoEmail: Number(b.siteNoEmail) || 0,
        total: Number((d as { enrichedCount?: number }).enrichedCount) || 0,
      } : null);
      setMsg({ text: (typeof d.note === "string" && d.note) || "Enrichment complete.", error: (d as { emailsFound?: number }).emailsFound === 0 });
    } catch (e) {
      setMsg({ text: `Enrichment failed: ${(e as Error).message || "network error"}.`, error: true });
    } finally { setEnriching(false); }
  }

  // Check the emails already in the vault and strip the ones that belong to
  // somebody else. Free, local, no search calls — and necessary, because rows
  // written before the ownership check can still carry one directory inbox
  // spread across several businesses. Shows what it found before changing it.
  async function auditEmails(apply: boolean) {
    if (!activeBrand) return;
    setAuditing(true); setMsg(null);
    try {
      const res = await authedFetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-now": new Date().toISOString() },
        body: JSON.stringify({ brandId: activeBrand.id, business: activeBrand.name, action: "audit_emails", apply }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ text: d.error || `Check failed (HTTP ${res.status})`, error: true }); return; }
      if (apply && d.contactCount !== undefined) { setReport(d); writeCache(activeBrand.id, d); }
      setAudit(apply ? null : { badCount: Number(d.badCount) || 0, checked: Number(d.checked) || 0, sample: Array.isArray(d.sample) ? d.sample : [] });
      setMsg({ text: String(d.note || "Done."), error: false });
    } catch (e) {
      setMsg({ text: `Check failed: ${(e as Error).message || "network error"}.`, error: true });
    } finally { setAuditing(false); }
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
  const missingEmail = report ? report.customers.filter((c) => !c.email).length : 0;
  const withEmail = report ? report.customers.filter((c) => c.email).length : 0;

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
              {missingEmail > 0 && (
                <button className="btn-primary !bg-sky-500 hover:!bg-sky-400" onClick={findEmails} disabled={enriching}>
                  {enriching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Find emails ({missingEmail})
                </button>
              )}
              {withEmail > 0 && (
                <button className="btn-ghost" onClick={() => auditEmails(false)} disabled={auditing} title="Check every stored email actually belongs to the business it is attached to">
                  {auditing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Check emails
                </button>
              )}
              {hasContacts && <button className="btn-ghost !text-rose-300" onClick={clearVault}><Trash2 className="h-4 w-4" /> Clear vault</button>}
            </div>
            {missingEmail > 0 && (
              <p className="mt-2 text-[11px] text-slate-500">
                {withEmail > 0 && <span className="text-emerald-300">{withEmail} contactable. </span>}
                {missingEmail} prospect{missingEmail === 1 ? "" : "s"} without an email — <span className="text-slate-300">Find emails</span> reads each company&apos;s own website (live Google) to get a real address. Done in batches; an address is only attached when the domain belongs to that company, so a directory&apos;s inbox is never passed off as theirs. Nothing is invented — a firm with no public email stays blank.
              </p>
            )}
            {breakdown && breakdown.total > 0 && (
              <div className="mt-3 rounded-lg border border-ink-700 bg-ink-850/50 p-3">
                <p className="text-[11px] font-semibold text-slate-300">Where the last {breakdown.total} went</p>
                <ul className="mt-1 space-y-0.5 text-[11px] text-slate-400">
                  <li><span className="font-semibold text-emerald-300">{breakdown.found}</span> — real email found on the company&apos;s own site.</li>
                  {breakdown.noOwnSite > 0 && (
                    <li><span className="font-semibold text-slate-300">{breakdown.noOwnSite}</span> — no website of their own, only directory pages about them. Common for small trades; these are phone/WhatsApp leads, not email leads.</li>
                  )}
                  {breakdown.siteNoEmail > 0 && (
                    <li><span className="font-semibold text-slate-300">{breakdown.siteNoEmail}</span> — has a site but publishes no address (contact form only).</li>
                  )}
                  {breakdown.searchUnavailable > 0 && (
                    <li><span className="font-semibold text-amber-300">{breakdown.searchUnavailable}</span> — could not be looked up at all. This is a search-connector problem, not a data problem: check <span className="font-mono text-slate-300">/api/health/serper</span>.</li>
                  )}
                </ul>
              </div>
            )}
            {audit && (
              <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] p-3">
                {audit.badCount === 0 ? (
                  <p className="text-xs text-emerald-300">All {audit.checked} stored addresses belong to the business they are attached to.</p>
                ) : (
                  <>
                    <p className="text-xs font-semibold text-amber-200">
                      {audit.badCount} of {audit.checked} addresses do not belong to the business they are on. Sending to these puts a stranger on your campaign and costs you sender reputation.
                    </p>
                    <ul className="mt-1.5 space-y-0.5">
                      {audit.sample.slice(0, 6).map((b, i) => (
                        <li key={i} className="text-[11px] text-slate-400">
                          <span className="font-mono text-slate-300">{b.email}</span> on <span className="text-slate-300">{b.company}</span> — {b.reason}
                        </li>
                      ))}
                      {audit.badCount > 6 && <li className="text-[11px] text-slate-500">…and {audit.badCount - 6} more.</li>}
                    </ul>
                    <div className="mt-2 flex items-center gap-2">
                      <button className="btn-primary !bg-amber-500 hover:!bg-amber-400 !py-1 !text-xs" onClick={() => auditEmails(true)} disabled={auditing}>
                        Remove these {audit.badCount}
                      </button>
                      <button className="btn-ghost !py-1 !text-xs" onClick={() => setAudit(null)}>Leave them</button>
                    </div>
                    <p className="mt-1.5 text-[10px] text-slate-500">Removing puts those rows back to prospects — the company, trade and town stay, and Find emails can try them again properly.</p>
                  </>
                )}
              </div>
            )}
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
                <table className="w-full min-w-[940px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink-700 text-xs uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-3 font-semibold">Customer</th>
                      <th className="px-4 py-3 font-semibold">Contact</th>
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
                        <td className="px-4 py-3">
                          <p className="font-semibold text-white">{c.company || c.name}</p>
                          <p className="text-xs text-slate-500">{[c.trade, c.town].filter(Boolean).join(" · ") || (c.consent ? "marketing-eligible" : "no consent")}</p>
                        </td>
                        <td className="px-4 py-3">
                          {c.email ? (
                            <div className="flex flex-col gap-1.5">
                              <span className="truncate text-xs text-slate-300" title={c.email}>{c.email}</span>
                              <div className="flex flex-wrap gap-1.5">
                                <a href={mailtoFor(c, report.business)} className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-500/40 hover:bg-emerald-500/25"><Mail className="h-3 w-3" /> Email</a>
                                {c.phone && <a href={waLink(c.phone, c, report.business)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-green-500/15 px-2 py-1 text-[11px] font-semibold text-green-300 ring-1 ring-green-500/40 hover:bg-green-500/25"><MessageCircle className="h-3 w-3" /> WhatsApp</a>}
                                {c.website && <a href={c.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-400 hover:text-slate-200"><ExternalLink className="h-3 w-3" /> Site</a>}
                              </div>
                            </div>
                          ) : c.phone ? (
                            <div className="flex flex-col gap-1.5">
                              <a href={waLink(c.phone, c, report.business)} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 rounded-md bg-green-500/15 px-2 py-1 text-[11px] font-semibold text-green-300 ring-1 ring-green-500/40 hover:bg-green-500/25"><MessageCircle className="h-3 w-3" /> WhatsApp</a>
                              <span className="text-[11px] text-slate-600">no email yet</span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-600">— <span className="text-slate-500">use Find emails</span></span>
                          )}
                        </td>
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
