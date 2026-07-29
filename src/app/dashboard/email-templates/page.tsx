"use client";

// Email Template Editor — the Brevo-style reusable-template surface behind the
// ESP. Create per-brand templates with {{ variable }} merge tokens; a live
// preview shows exactly what a recipient sees (sample data merged in). Saved
// templates are selectable in the Email Center send form and personalised per
// contact at send time.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, FileText, Plus, Save, Trash2, Eye, Code, Check, AlertTriangle, Wand2, Sparkles } from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";
import { MERGE_VARS, mergeTokens, tokenWarnings } from "@/shared/merge-tokens";

type Template = { id: string; brandId: string; name: string; subject: string; html: string; updatedAt: string };

// The token grammar is SHARED with the send path. A local copy is how a preview
// ends up looking clean for a template that merges badly on the real list.
const VARS = MERGE_VARS;
const mergePreview = mergeTokens;

const BLANK = { id: "", name: "", subject: "", html: "" };

type Design = { heading: string; body: string; ctaLabel: string; ctaUrl: string; accent: string };
const DESIGN_DEFAULT: Design = {
  heading: "",
  body: "Write your message here — tell your customer what's new, the offer, and why it matters. Keep it short and human.",
  ctaLabel: "Claim your offer",
  ctaUrl: "",
  accent: "#16a34a",
};
const esc = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The jobs an email can do. Client-safe mirror of EMAIL_PURPOSES so the picker
// renders before the round-trip; the server is still the authority on which one
// was used.
const PURPOSES: { id: string; label: string }[] = [
  { id: "win_back", label: "Win back a quiet customer" },
  { id: "new_offer", label: "Announce an offer" },
  { id: "welcome", label: "Welcome a new customer" },
  { id: "follow_up", label: "Follow up an enquiry" },
  { id: "announcement", label: "Announce something new" },
  { id: "review_request", label: "Ask for a review" },
  { id: "referral_ask", label: "Ask for a referral" },
  { id: "reminder", label: "Appointment / deadline reminder" },
];

type AiReport = { ok: boolean; written: string; note: string; warnings: string[]; tokensUsed: string[] };

// Build email-client-safe HTML (tables + inline styles) from the simple Design
// fields, so a non-technical user designs the email and sets the CTA without
// touching HTML. Merge tokens like {{ firstName }} pass through untouched.
function buildEmail(brand: string, d: Design): string {
  const name = esc(brand || "Your Brand");
  const accent = /^#[0-9a-fA-F]{3,8}$/.test(d.accent) ? d.accent : "#16a34a";
  const url = esc((d.ctaUrl || "https://your-link.com").trim());
  const heading = d.heading.trim() ? `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#111111">${esc(d.heading)}</h1>` : "";
  const body = (d.body || "").split(/\n{2,}/).filter(Boolean)
    .map((par) => `<p style="margin:0 0 16px">${esc(par).replace(/\n/g, "<br/>")}</p>`).join("\n        ") || `<p style="margin:0 0 16px"></p>`;
  const cta = d.ctaLabel.trim()
    ? `<tr><td align="center" style="padding:16px 28px 28px">
        <a href="${url}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 28px;border-radius:8px">${esc(d.ctaLabel)}</a>
      </td></tr>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 0">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif">
      <tr><td style="background:#0b1020;padding:20px 28px;color:#ffffff;font-size:20px;font-weight:bold">${name}</td></tr>
      <tr><td style="padding:32px 28px 8px;color:#111111;font-size:16px;line-height:1.6">
        <p style="margin:0 0 16px">Hi {{ firstName | there }},</p>
        ${heading}${body}
      </td></tr>
      ${cta}
      <tr><td style="padding:0 28px 28px;color:#111111;font-size:16px;line-height:1.6">
        <p style="margin:0">Thanks,<br/>The ${name} team</p>
      </td></tr>
      <tr><td style="padding:16px 28px;background:#f4f6f8;color:#8a94a6;font-size:12px;line-height:1.5">
        You&rsquo;re receiving this because you&rsquo;re a customer of ${name}.
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

export default function EmailTemplatesPage() {
  const { activeBrand, ready } = useActiveBrand();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"design" | "code" | "preview">("design");
  const [design, setDesign] = useState<Design>({ ...DESIGN_DEFAULT });
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [purpose, setPurpose] = useState<string>(PURPOSES[0].id);
  const [aiNotes, setAiNotes] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [ai, setAi] = useState<AiReport | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Editing any Design field regenerates the HTML (Design mode is a generator).
  function updateDesign(patch: Partial<Design>) {
    setDesign((prev) => {
      const next = { ...prev, ...patch };
      setForm((f) => ({ ...f, html: buildEmail(activeBrand?.name || "Your Brand", next) }));
      return next;
    });
  }

  const load = useCallback(async (brandId: string) => {
    setBusy(true);
    try {
      const res = await authedFetch(`/api/email-templates?brandId=${encodeURIComponent(brandId)}`);
      const d = await res.json().catch(() => ({}));
      setTemplates(Array.isArray(d.templates) ? d.templates : []);
    } catch { setTemplates([]); } finally { setBusy(false); }
  }, []);

  useEffect(() => { if (ready && activeBrand) load(activeBrand.id); else if (ready) setTemplates([]); }, [ready, activeBrand, load]);

  // Seed a starter email so a new template previews/saves immediately.
  useEffect(() => {
    if (activeBrand && !form.id && !form.html) setForm((f) => ({ ...f, html: buildEmail(activeBrand.name, DESIGN_DEFAULT) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand?.id]);

  // Preview against a REAL contact from this brand's vault.
  //
  // It used to merge invented people — "Marie Jolaine" at "Rawbank" in
  // "Kinshasa" — which a customer reasonably reads as strangers' data leaking
  // into their template. Worse, made-up values are uniformly present, so a
  // template that breaks on a contact with no company still previewed perfectly.
  // A real row shows what an actual recipient gets, gaps and all.
  const [previewContact, setPreviewContact] = useState<{
    name?: string; email?: string; company?: string; trade?: string; town?: string; area?: string;
  } | null>(null);
  const [previewIsReal, setPreviewIsReal] = useState(false);

  useEffect(() => {
    if (!activeBrand) { setPreviewContact(null); setPreviewIsReal(false); return; }
    let on = true;
    (async () => {
      try {
        const r = await authedFetch(`/api/contacts?brandId=${encodeURIComponent(activeBrand.id)}&business=${encodeURIComponent(activeBrand.name)}`);
        const d = await r.json().catch(() => ({}));
        const rows = Array.isArray(d.customers) ? d.customers : [];
        const withEmail = rows.find((c: { email?: string }) => c?.email) || rows[0];
        if (!on) return;
        setPreviewContact(withEmail || null);
        setPreviewIsReal(Boolean(withEmail));
      } catch { if (on) { setPreviewContact(null); setPreviewIsReal(false); } }
    })();
    return () => { on = false; };
  }, [activeBrand]);

  const sample = useMemo<Record<string, string>>(() => {
    const c = previewContact;
    if (c) {
      const full = (c.name || "").trim();
      return {
        firstname: full.split(/\s+/)[0] || "",
        name: full,
        email: (c.email || "").trim(),
        company: (c.company || "").trim(),
        trade: (c.trade || "").trim(),
        town: (c.town || "").trim(),
        area: (c.area || "").trim(),
        brand: activeBrand?.name || "",
      };
    }
    // Empty vault: obvious placeholders, not invented people. Square brackets
    // read as "this is a slot", which no real name ever does.
    return {
      firstname: "[first name]", name: "[full name]", email: "[email]",
      company: "[company]", trade: "[trade]", town: "[town]", area: "[area]",
      brand: activeBrand?.name || "[your brand]",
    };
  }, [previewContact, activeBrand]);

  const previewSubject = mergePreview(form.subject, sample);
  const previewHtml = mergePreview(form.html, sample);

  // Problems that are legal but render badly on a real list — the duplicate name
  // that produced "MarieMarie Jolaine" is the reason this runs as you type
  // rather than only when the AI writes the template.
  const liveWarnings = useMemo(
    () => tokenWarnings(`${form.subject}\n${form.html}`),
    [form.subject, form.html],
  );

  function insertVar(token: string) {
    const snippet = `{{ ${token} }}`;
    // Design mode → insert into the message body; HTML mode → into the HTML.
    if (view === "design") {
      const ta = bodyRef.current;
      if (!ta) { updateDesign({ body: design.body + snippet }); return; }
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? ta.value.length;
      const next = design.body.slice(0, start) + snippet + design.body.slice(end);
      updateDesign({ body: next });
      requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + snippet.length; });
      return;
    }
    const ta = htmlRef.current;
    if (!ta) { setForm((f) => ({ ...f, html: f.html + snippet })); return; }
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const next = form.html.slice(0, start) + snippet + form.html.slice(end);
    setForm((f) => ({ ...f, html: next }));
    requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + snippet.length; });
  }

  // Write the template with AI. The draft lands in the Design fields the
  // customer already edits — subject, headline, message, button — so it is a
  // starting point they own, not a black box. Nothing is saved or sent here.
  async function writeWithAi() {
    if (!activeBrand || aiBusy) return;
    setAiBusy(true); setAiError(null); setAi(null); setMsg(null);
    try {
      const res = await authedFetch("/api/email-templates/ai", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: activeBrand.id,
          business: activeBrand.name,
          product: activeBrand.product,
          audience: activeBrand.audience,
          location: activeBrand.location,
          offer: activeBrand.offer,
          website: activeBrand.website,
          purpose,
          notes: aiNotes.trim() || undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setAiError(d.error || `The writer returned ${res.status}.`); return; }

      const draft = d.draft || {};
      const next: Design = {
        heading: draft.heading || "",
        body: draft.body || design.body,
        ctaLabel: draft.ctaLabel || design.ctaLabel,
        ctaUrl: draft.ctaUrl || design.ctaUrl,
        accent: design.accent || activeBrand.brandColours?.[0] || DESIGN_DEFAULT.accent,
      };
      setDesign(next);
      setForm((f) => ({
        ...f,
        name: f.name.trim() || draft.name || "",
        subject: draft.subject || f.subject,
        html: buildEmail(activeBrand.name, next),
      }));
      setView("design");
      setAi({
        ok: Boolean(d.ok),
        written: d.written || "template",
        note: d.note || "",
        warnings: Array.isArray(d.warnings) ? d.warnings : [],
        tokensUsed: Array.isArray(d.tokensUsed) ? d.tokensUsed : [],
      });
    } catch {
      setAiError("Couldn't reach the writer. Check your connection and try again.");
    } finally { setAiBusy(false); }
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
            <button className="btn-primary mb-3 w-full justify-center" onClick={() => { const d = { ...DESIGN_DEFAULT }; setForm({ ...BLANK, html: buildEmail(activeBrand.name, d) }); setDesign(d); setView("design"); setMsg(null); setAi(null); setAiError(null); }}>
              <Plus className="h-4 w-4" /> New template
            </button>
            {busy && !templates.length && <p className="p-2 text-xs text-slate-500"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Loading…</p>}
            {!busy && !templates.length && <p className="p-2 text-xs text-slate-500">No templates yet. Create your first one.</p>}
            <div className="space-y-1">
              {templates.map((t) => (
                <div key={t.id} className={`group flex items-center gap-1 rounded-md pr-1 ${form.id === t.id ? "bg-emerald-500/10" : "hover:bg-ink-850"}`}>
                  <button className="min-w-0 flex-1 px-2.5 py-2 text-left" onClick={() => { setForm({ id: t.id, name: t.name, subject: t.subject, html: t.html }); setView("preview"); setMsg(null); setAi(null); setAiError(null); }}>
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

            {/* AI writer — the real one. Writes the subject, headline, message
                and button from this brand's own details, checks every merge tag
                against the ones the send engine can actually fill, and refuses
                copy that invents claims about the business. */}
            <div className="mb-3 rounded-lg border border-violet-500/25 bg-violet-500/[0.06] p-3">
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-[190px] flex-1">
                  <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-violet-200"><Sparkles className="h-3.5 w-3.5" /> Write this email with AI</span>
                  <select className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
                    {PURPOSES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </label>
                <label className="min-w-[220px] flex-[2]">
                  <span className="mb-1 block text-xs font-semibold text-slate-400">Anything it must say <span className="font-normal text-slate-600">(optional)</span></span>
                  <input className="input" value={aiNotes} onChange={(e) => setAiNotes(e.target.value)} placeholder="e.g. mention the free site survey, we're booked to March" />
                </label>
                <button onClick={writeWithAi} disabled={aiBusy} className="inline-flex h-[38px] items-center gap-1.5 rounded-lg border border-violet-500/50 bg-violet-500/15 px-3 text-sm font-semibold text-violet-100 hover:bg-violet-500/25 disabled:opacity-60">
                  {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {aiBusy ? "Writing…" : "Write it"}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">
                Uses <span className="text-slate-300">{activeBrand.name}</span>&apos;s own details{activeBrand.offer ? ` and your current offer` : ""}. It fills the fields below — you edit and save. Nothing is sent.
              </p>
              {aiError && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-rose-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {aiError}</p>
              )}
              {ai && (
                <div className="mt-2 space-y-1 border-t border-violet-500/20 pt-2">
                  <p className={`flex items-start gap-1.5 text-xs ${ai.ok ? "text-emerald-300" : "text-amber-300"}`}>
                    {ai.ok ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />} {ai.note}
                  </p>
                  {ai.tokensUsed.length > 0 && (
                    <p className="text-[11px] text-slate-500">Personalised on: {ai.tokensUsed.map((t) => <span key={t} className="mr-1 font-mono text-slate-400">{`{{ ${t} }}`}</span>)}</p>
                  )}
                  {ai.warnings.map((w, i) => (
                    <p key={i} className="text-[11px] text-amber-300/80">• {w}</p>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => {
                  const seeded: Design = { ...DESIGN_DEFAULT, accent: activeBrand.brandColours?.[0] || DESIGN_DEFAULT.accent, ctaUrl: activeBrand.website ? (/^https?:\/\//.test(activeBrand.website) ? activeBrand.website : `https://${activeBrand.website}`) : "" };
                  setDesign(seeded);
                  setForm((f) => ({ ...f, html: buildEmail(activeBrand.name, seeded), subject: f.subject || `A message from ${activeBrand.name}` }));
                  setView("design");
                }}
                className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/20" title="A blank branded layout in your colours with a CTA button — no copy is written, you type it yourself">
                Blank branded layout
              </button>
              <span className="ml-1 mr-1 text-xs text-slate-500">Insert:</span>
              {VARS.map((v) => (
                <button key={v.token} onClick={() => insertVar(v.token)} className="rounded-full border border-ink-700 bg-ink-850 px-2 py-0.5 text-[11px] text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300" title={v.label}>
                  {`{{ ${v.token} }}`}
                </button>
              ))}
            </div>
            <p className="mb-2 text-[11px] text-slate-500">Tip: the <span className="text-slate-300">CTA button</span> link is <span className="font-mono">https://your-link.com</span> — change it to your real page (offer, booking, product). Every link is auto-tracked for clicks on send.</p>

            <div className="mb-2 flex items-center gap-1">
              <button onClick={() => setView("design")} className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${view === "design" ? "bg-emerald-500/15 text-emerald-300" : "text-slate-400 hover:text-white"}`}><Wand2 className="h-3.5 w-3.5" /> Design</button>
              <button onClick={() => setView("code")} className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${view === "code" ? "bg-emerald-500/15 text-emerald-300" : "text-slate-400 hover:text-white"}`}><Code className="h-3.5 w-3.5" /> HTML</button>
              <button onClick={() => setView("preview")} className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${view === "preview" ? "bg-emerald-500/15 text-emerald-300" : "text-slate-400 hover:text-white"}`}><Eye className="h-3.5 w-3.5" /> Preview</button>
            </div>

            {view === "design" ? (
              <div className="space-y-3 rounded-lg border border-ink-700 bg-ink-850/40 p-4">
                <p className="text-[11px] text-slate-500">Fill these in — the email builds itself. Switch to <span className="text-slate-300">Preview</span> to see exactly what lands, or <span className="text-slate-300">HTML</span> for full control.</p>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-400">Headline <span className="font-normal text-slate-600">(optional)</span></span>
                  <input className="input" value={design.heading} onChange={(e) => updateDesign({ heading: e.target.value })} placeholder="e.g. 10% off this week only" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-400">Message <span className="font-normal text-slate-600">— use the Insert buttons above for {"{{ variables }}"}</span></span>
                  <textarea ref={bodyRef} className="input min-h-[130px]" value={design.body} onChange={(e) => updateDesign({ body: e.target.value })} placeholder="Write your message. A blank line starts a new paragraph." />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-400">Button text (CTA)</span>
                    <input className="input" value={design.ctaLabel} onChange={(e) => updateDesign({ ctaLabel: e.target.value })} placeholder="Claim your offer" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-400">Button link</span>
                    <input className="input" value={design.ctaUrl} onChange={(e) => updateDesign({ ctaUrl: e.target.value })} placeholder="https://your-offer-page.com" />
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                    Button colour
                    <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(design.accent) ? design.accent : "#16a34a"} onChange={(e) => updateDesign({ accent: e.target.value })} className="h-7 w-10 cursor-pointer rounded border border-ink-700 bg-transparent" />
                  </label>
                  <span className="text-[11px] text-slate-500">Leave the button text empty to send an email with no button.</span>
                </div>
              </div>
            ) : view === "code" ? (
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

            <p className="mt-2 text-[11px] text-slate-500">
              {previewIsReal ? (
                <>Previewed against a real contact in your vault{sample.name ? <> — <span className="text-slate-300">{sample.name}</span></> : null}{sample.company ? <> at <span className="text-slate-300">{sample.company}</span></> : null}. This is what that person actually receives.</>
              ) : (
                <>Your vault is empty, so the merge slots show as <span className="font-mono text-slate-400">[first name]</span> rather than an invented person. Import contacts and the preview switches to a real one.</>
              )}{" "}
              Use <span className="font-mono text-slate-400">{"{{ firstName | there }}"}</span> to set a fallback for a contact with no value.
            </p>

            {/* Merge problems that are legal but read badly on a real list. Shown
                as you type: a template only checked when the AI writes it still
                goes out wrong when it is typed by hand, which is what happened. */}
            {liveWarnings.length > 0 && (
              <div className="mt-2 space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] p-2.5">
                {liveWarnings.map((w, i) => (
                  <p key={i} className="flex items-start gap-1.5 text-[11px] text-amber-100">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
                  </p>
                ))}
              </div>
            )}

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
