"use client";

// Email Template Editor — the Brevo-style reusable-template surface behind the
// ESP. Create per-brand templates with {{ variable }} merge tokens; a live
// preview shows exactly what a recipient sees (sample data merged in). Saved
// templates are selectable in the Email Center send form and personalised per
// contact at send time.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, FileText, Plus, Save, Trash2, Eye, Code, Check, AlertTriangle } from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";

type Template = { id: string; brandId: string; name: string; subject: string; html: string; updatedAt: string };

// Client-safe mirror of MERGE_VARS (backend module can't be imported here).
const VARS: { token: string; label: string }[] = [
  { token: "firstName", label: "First name" },
  { token: "name", label: "Full name" },
  { token: "email", label: "Email" },
  { token: "company", label: "Company" },
  { token: "trade", label: "Trade" },
  { token: "town", label: "Town" },
  { token: "area", label: "Area" },
  { token: "brand", label: "Brand" },
];

// Lightweight client merge for the LIVE preview (same token grammar as the
// backend). The real send uses the backend merge against each contact.
function mergePreview(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g, (_m, key: string, fb?: string) => {
    const v = values[key.toLowerCase()];
    return (v && v.length ? v : (fb ?? "")).toString();
  });
}

const BLANK = { id: "", name: "", subject: "", html: "" };

export default function EmailTemplatesPage() {
  const { activeBrand, ready } = useActiveBrand();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"code" | "preview">("code");
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const htmlRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async (brandId: string) => {
    setBusy(true);
    try {
      const res = await authedFetch(`/api/email-templates?brandId=${encodeURIComponent(brandId)}`);
      const d = await res.json().catch(() => ({}));
      setTemplates(Array.isArray(d.templates) ? d.templates : []);
    } catch { setTemplates([]); } finally { setBusy(false); }
  }, []);

  useEffect(() => { if (ready && activeBrand) load(activeBrand.id); else if (ready) setTemplates([]); }, [ready, activeBrand, load]);

  const sample = useMemo<Record<string, string>>(() => ({
    firstname: "Marie", name: "Marie Jolaine", email: "marie@example.com",
    company: "Rawbank", trade: "Banking", town: "Kinshasa", area: "Gombe",
    brand: activeBrand?.name || "Your brand",
  }), [activeBrand]);

  const previewSubject = mergePreview(form.subject, sample);
  const previewHtml = mergePreview(form.html, sample);

  function insertVar(token: string) {
    const ta = htmlRef.current;
    const snippet = `{{ ${token} }}`;
    if (!ta) { setForm((f) => ({ ...f, html: f.html + snippet })); return; }
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const next = form.html.slice(0, start) + snippet + form.html.slice(end);
    setForm((f) => ({ ...f, html: next }));
    requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + snippet.length; });
  }

  async function save() {
    if (!activeBrand || !form.name.trim()) { setMsg({ text: "Give the template a name first.", error: true }); return; }
    setSaving(true); setMsg(null);
    try {
      const res = await authedFetch("/api/email-templates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", brandId: activeBrand.id, name: form.name, subject: form.subject, html: form.html }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ text: d.error || "Save failed", error: true }); return; }
      setForm({ id: d.id, name: d.name, subject: d.subject, html: d.html });
      setMsg({ text: `Saved “${d.name}”.`, error: false });
      await load(activeBrand.id);
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!activeBrand || !confirm("Delete this template?")) return;
    await authedFetch(`/api/email-templates?brandId=${encodeURIComponent(activeBrand.id)}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (form.id === id) setForm({ ...BLANK });
    await load(activeBrand.id);
  }

  return (
    <div>
      <PageHeader
        kicker="Email Templates"
        title="Design once, personalise for everyone"
        subtitle="Build reusable templates with merge variables like {{ firstName }} and {{ company }}. Every contact gets a personalised subject and body at send time. Saved templates appear in the Email Center send form."
        actions={<Pill tone="info">merge variables · live preview</Pill>}
      />

      {ready && !activeBrand && (
        <div className="card border-emerald-500/20 p-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400"><FileText className="h-5 w-5" /></span>
          <h2 className="mt-4 font-display text-lg font-bold text-white">Add a brand first</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">Pick or add a brand in the switcher, then build that brand&apos;s templates here.</p>
        </div>
      )}

      {activeBrand && (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* Template list */}
          <div className="card h-max p-3">
            <button className="btn-primary mb-3 w-full justify-center" onClick={() => { setForm({ ...BLANK }); setMsg(null); }}>
              <Plus className="h-4 w-4" /> New template
            </button>
            {busy && !templates.length && <p className="p-2 text-xs text-slate-500"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Loading…</p>}
            {!busy && !templates.length && <p className="p-2 text-xs text-slate-500">No templates yet. Create your first one.</p>}
            <div className="space-y-1">
              {templates.map((t) => (
                <div key={t.id} className={`group flex items-center gap-1 rounded-md pr-1 ${form.id === t.id ? "bg-emerald-500/10" : "hover:bg-ink-850"}`}>
                  <button className="min-w-0 flex-1 px-2.5 py-2 text-left" onClick={() => { setForm({ id: t.id, name: t.name, subject: t.subject, html: t.html }); setMsg(null); }}>
                    <span className="block truncate text-sm font-medium text-white">{t.name}</span>
                    <span className="block truncate text-[10px] text-slate-500">{t.subject || "no subject"}</span>
                  </button>
                  <button title="Delete" onClick={() => remove(t.id)} className="shrink-0 rounded p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </div>

          {/* Editor */}
          <div className="card p-5">
            <div className="mb-3 grid gap-2 sm:grid-cols-2">
              <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Template name (e.g. Welcome offer)" />
              <input className="input" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Subject line (supports {{ variables }})" />
            </div>

            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-slate-500">Insert:</span>
              {VARS.map((v) => (
                <button key={v.token} onClick={() => insertVar(v.token)} className="rounded-full border border-ink-700 bg-ink-850 px-2 py-0.5 text-[11px] text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300" title={v.label}>
                  {`{{ ${v.token} }}`}
                </button>
              ))}
            </div>

            <div className="mb-2 flex items-center gap-1">
              <button onClick={() => setView("code")} className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${view === "code" ? "bg-emerald-500/15 text-emerald-300" : "text-slate-400 hover:text-white"}`}><Code className="h-3.5 w-3.5" /> HTML</button>
              <button onClick={() => setView("preview")} className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${view === "preview" ? "bg-emerald-500/15 text-emerald-300" : "text-slate-400 hover:text-white"}`}><Eye className="h-3.5 w-3.5" /> Preview</button>
            </div>

            {view === "code" ? (
              <textarea
                ref={htmlRef} value={form.html} onChange={(e) => setForm((f) => ({ ...f, html: e.target.value }))} rows={16}
                placeholder={"<h1>Hi {{ firstName | there }},</h1>\n<p>A special offer for {{ company | you }} from " + (activeBrand.name) + "…</p>"}
                className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 font-mono text-xs text-white placeholder-slate-600 outline-none focus:border-emerald-500/60"
              />
            ) : (
              <div className="rounded-lg border border-ink-700 bg-white">
                <div className="border-b border-slate-200 px-4 py-2 text-xs text-slate-600">Subject: <span className="font-semibold text-slate-800">{previewSubject || "(none)"}</span></div>
                <iframe title="preview" className="h-[360px] w-full rounded-b-lg bg-white" srcDoc={previewHtml || "<p style='font-family:system-ui;color:#94a3b8;padding:16px'>Nothing to preview yet.</p>"} />
              </div>
            )}

            <p className="mt-2 text-[11px] text-slate-500">Preview uses sample data ({sample.name}, {sample.company}…). Use <span className="font-mono text-slate-400">{"{{ firstName | there }}"}</span> to set a fallback when a contact has no value.</p>

            <div className="mt-3 flex items-center gap-3">
              <button className="btn-primary" onClick={save} disabled={saving || !form.name.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {form.id ? "Save changes" : "Create template"}
              </button>
              {msg && (
                <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${msg.error ? "text-rose-300" : "text-emerald-300"}`}>
                  {msg.error ? <AlertTriangle className="h-4 w-4" /> : <Check className="h-4 w-4" />} {msg.text}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
