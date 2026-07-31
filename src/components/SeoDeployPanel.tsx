"use client";

// SEO auto-deploy — the approval screen.
//
// The engine (src/backend/seo-deploy.ts) can write a title, a description or a
// schema block onto a live page. This is where a person decides whether it may.
// It is mounted on SiteRaid AI (next to the crawl that found the gap) and on SEO
// Autopilot (next to the blog it publishes), because those are the two places a
// customer is already looking at their own site's SEO.
//
// WHAT THIS SCREEN IS FOR, in order of importance:
//
//   NOTHING SHIPS UNAPPROVED. Every fix arrives off. The customer's website is
//   theirs and they carry the legal weight of what it says, so the default is
//   always "no" and turning it on is a deliberate act, per fix.
//
//   THE VALUE IS SHOWN IN FULL. Not a summary, not a count — the actual words
//   that will appear on the page, in a box they can edit before approving. A
//   panel that says "3 improvements ready" and hides them is asking for trust it
//   has not earned.
//
//   THE LIMITS ARE ON THE SCREEN, not in a docs page. This applies fixes in the
//   browser: Google sees them on a later pass, and the AI assistants the
//   visibility module measures do not see them at all. That belongs next to the
//   button, not behind a link.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Copy, Loader2, Plus, Rocket, ShieldCheck, Sparkles, Trash2, XCircle } from "lucide-react";
import { Pill } from "@/components/ui";
import { authedFetch } from "@/frontend/api-client";
import type { Brand } from "@/shared/brand";
import { SEO_FIX_KINDS, type SeoDeployConfig, type SeoFix, type SeoFixKind, type UnfillableGap } from "@/shared/seo-deploy";

/** The subset of a SiteRaid crawl the drafting endpoint reads. */
export type PanelCrawl = {
  ok?: boolean;
  url?: string;
  finalUrl?: string;
  title?: string;
  metaDescription?: string;
  imagesTotal?: number;
  imagesNoAlt?: number;
  structuredDataTypes?: string[];
  /** Passed straight through: drafting refuses on a page whose HTML we could not read. */
  renderGap?: { jsShell?: boolean; framework?: string; words?: number };
};

const KIND_LABEL = new Map(SEO_FIX_KINDS.map((k) => [k.kind, k.label]));
const KIND_HINT = new Map(SEO_FIX_KINDS.map((k) => [k.kind, k.hint]));

export default function SeoDeployPanel({
  brand,
  crawl = null,
  className = "",
}: {
  brand: Brand | null;
  /** A completed SiteRaid crawl, when the host page has one. Enables drafting. */
  crawl?: PanelCrawl | null;
  className?: string;
}) {
  const brandId = brand?.id || "";
  const [config, setConfig] = useState<SeoDeployConfig | null>(null);
  const [tag, setTag] = useState("");
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [hostText, setHostText] = useState("");
  const [needsYou, setNeedsYou] = useState<UnfillableGap[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [open, setOpen] = useState(false);

  const verifyUrl = (crawl?.finalUrl || crawl?.url || brand?.website || "").trim();

  const load = useCallback(async () => {
    if (!brandId) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({ brandId });
      if (verifyUrl) q.set("verifyUrl", /^https?:\/\//i.test(verifyUrl) ? verifyUrl : `https://${verifyUrl}`);
      const r = await authedFetch(`/api/seo/deploy?${q.toString()}`);
      const d = await r.json();
      if (!r.ok) { setMsg({ text: d.error || "Couldn't load auto-deploy.", error: true }); return; }
      setConfig(d.config); setTag(d.installTag || ""); setInstalled(d.installed ?? null); setNote(d.note || "");
      setHostText((d.config?.allowedHosts || []).join(", "));
    } catch { setMsg({ text: "Couldn't reach auto-deploy.", error: true }); }
    finally { setLoading(false); }
  }, [brandId, verifyUrl]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const fixes = config?.fixes ?? [];
  const approvedCount = useMemo(() => fixes.filter((f) => f.approved && f.value.trim()).length, [fixes]);
  const liveNow = Boolean(config?.enabled) && approvedCount > 0 && (config?.allowedHosts.length ?? 0) > 0;

  function patchFix(id: string, patch: Partial<SeoFix>) {
    setConfig((c) => (c ? { ...c, fixes: c.fixes.map((f) => (f.id === id ? { ...f, ...patch } : f)) } : c));
  }
  function removeFix(id: string) {
    setConfig((c) => (c ? { ...c, fixes: c.fixes.filter((f) => f.id !== id) } : c));
  }
  function addBlank() {
    setConfig((c) => c && ({
      ...c,
      fixes: [...c.fixes, {
        id: `manual-${c.fixes.length}-${Date.now()}`, kind: "description" as SeoFixKind,
        path: "*", value: "", replace: false, approved: false, source: "written by you", createdAt: new Date().toISOString(),
      }],
    }));
  }

  async function save(over: Partial<SeoDeployConfig> = {}) {
    if (!config || !brandId) return;
    setSaving(true); setMsg(null);
    const next = { ...config, ...over };
    try {
      const r = await authedFetch("/api/seo/deploy", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId,
          enabled: next.enabled,
          allowedHosts: hostText.split(",").map((h) => h.trim()).filter(Boolean),
          fixes: next.fixes,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setMsg({ text: d.error || "Couldn't save.", error: true }); return; }
      setConfig(d.config); setTag(d.installTag || tag);
      setHostText((d.config?.allowedHosts || []).join(", "));
      // The note from the last GET described the state BEFORE this save. Leaving
      // it on screen is how a panel ends up saying "0 of 0 fix(es) approved.
      // Auto-deploy is OFF" directly under "Saved. 3 fix(es) will be applied."
      // Two sentences, both from us, flatly contradicting each other.
      setNote("");
      setMsg({ text: d.note || "Saved.", error: false });
    } catch { setMsg({ text: "Couldn't reach auto-deploy.", error: true }); }
    finally { setSaving(false); }
  }

  // Draft candidates from the crawl the host page already ran. Read-only on the
  // server: they land in this list unapproved, and only a save writes them down.
  async function draftFromCrawl() {
    if (!brand || !crawl) return;
    setDrafting(true); setMsg(null);
    try {
      const r = await authedFetch("/api/seo/deploy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, brand, crawl }),
      });
      const d = await r.json();
      if (!r.ok) { setMsg({ text: d.error || "Couldn't draft fixes.", error: true }); return; }
      setNeedsYou(d.needsYou || []);
      const drafted: SeoFix[] = d.fixes || [];
      if (drafted.length) setConfig((c) => (c ? { ...c, fixes: [...c.fixes, ...drafted] } : c));
      setMsg({ text: d.note || "", error: false });
    } catch { setMsg({ text: "Couldn't reach auto-deploy.", error: true }); }
    finally { setDrafting(false); }
  }

  async function copyTag() {
    try { await navigator.clipboard.writeText(tag); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard denied */ }
  }

  // A fix is written from a brand's own record and applied to that brand's own
  // domains. Without one there is nothing honest to offer, so say that rather
  // than showing an empty form.
  if (!brand) {
    return (
      <div className={`card border-white/[0.08] p-4 ${className}`}>
        <p className="text-xs text-slate-400">
          <Rocket className="mr-1 inline h-3 w-3 text-violet-400" />
          Auto-deploy applies approved SEO fixes to your live pages. Pick a brand in the switcher — the fixes are written from that brand&apos;s own record and only run on its own domains.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <div className={`card border-violet-500/25 p-5 ${className}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Rocket className="h-4 w-4 text-violet-400" />
              <h2 className="font-display font-bold text-white">Auto-deploy the fixes</h2>
              <Pill tone="info">approval required</Pill>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              One script tag on your site and the fixes you approve are applied to the page itself — instead of being handed to you as a block to paste into a CMS you may not control.
            </p>
          </div>
          <button className="btn-ghost shrink-0" onClick={() => setOpen(true)}>Open auto-deploy</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`card border-violet-500/25 p-5 ${className}`}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Rocket className="h-4 w-4 text-violet-400" />
        <h2 className="font-display font-bold text-white">Auto-deploy the fixes</h2>
        {liveNow ? <Pill tone="good">live · {approvedCount} approved</Pill> : <Pill tone="neutral">nothing is being applied</Pill>}
        {installed === true && <Pill tone="good">tag detected on your page</Pill>}
        {installed === false && <Pill tone="warn">tag not found on your page</Pill>}
        <button className="btn-ghost ml-auto !py-1 text-xs" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Refresh
        </button>
      </div>

      {/* The limitation, next to the button rather than behind a link. */}
      <p className="mb-4 rounded-md bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
        <AlertTriangle className="mr-1 inline h-3 w-3" />
        This applies fixes <strong>in the browser</strong>. Google renders JavaScript and will see them, on a later pass than markup that is in the page template. Social link previews, non-rendering crawlers and the AI assistants your visibility check asks all read raw HTML and will <strong>not</strong> see them. Where you can edit your site&apos;s template, do it there — this is the fallback, not the ideal.
      </p>

      {/* 1 — install */}
      <div className="mb-4 rounded-lg border border-white/[0.08] p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">1 · Paste this once, in your site&apos;s &lt;head&gt;</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 overflow-x-auto rounded bg-ink-900/60 px-3 py-2 text-[11px] text-slate-300">{tag || "—"}</code>
          <button className="btn-ghost shrink-0" onClick={copyTag} disabled={!tag}>
            {copied ? <><ClipboardCheck className="h-4 w-4 text-emerald-400" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          {installed === true
            ? "Found on the page we checked."
            : installed === false
              ? "Not found on the page we checked — the fixes below cannot reach your site until it is there."
              : "We check for it whenever this panel loads with a URL to look at."}
        </p>
      </div>

      {/* 2 — hosts */}
      <div className="mb-4 rounded-lg border border-white/[0.08] p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">2 · Which domains may run it</p>
        <input className="input" value={hostText} onChange={(e) => setHostText(e.target.value)} placeholder="veryxjnn.com, www.veryxjnn.com" />
        <p className="mt-1 text-[11px] text-slate-500">
          <ShieldCheck className="mr-1 inline h-3 w-3" />
          Comma-separated. The snippet refuses to run anywhere else — that is what stops someone pasting your tag onto their own site and inheriting your content. Leave it empty and it runs nowhere.
        </p>
      </div>

      {/* 3 — the fixes */}
      <div className="mb-4 rounded-lg border border-white/[0.08] p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">3 · What may be applied</p>
          <div className="flex flex-wrap gap-2">
            {crawl?.ok && (
              <button className="btn-ghost !py-1 text-xs" onClick={draftFromCrawl} disabled={drafting}>
                {drafting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Draft from this crawl
              </button>
            )}
            <button className="btn-ghost !py-1 text-xs" onClick={addBlank} disabled={!config}><Plus className="h-3 w-3" /> Write one</button>
          </div>
        </div>

        {fixes.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-500">
            Nothing queued. {crawl?.ok ? "Draft from the crawl above, or write a fix yourself." : "Write a fix, or run a site crawl on SiteRaid AI and draft from what it finds."}
          </p>
        ) : (
          <div className="space-y-2">
            {fixes.map((f) => (
              <div key={f.id} className={`rounded-lg border p-3 ${f.approved ? "border-emerald-500/30 bg-emerald-500/[0.04]" : "border-white/[0.08]"}`}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <select className="input !w-auto !py-1 text-xs" value={f.kind} onChange={(e) => patchFix(f.id, { kind: e.target.value as SeoFixKind })}>
                    {SEO_FIX_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                  </select>
                  <input className="input !w-auto !py-1 text-xs" style={{ maxWidth: 160 }} value={f.path} onChange={(e) => patchFix(f.id, { path: e.target.value })} placeholder="* or /pricing" />
                  <label className="flex items-center gap-1.5 text-xs text-slate-300">
                    <input type="checkbox" checked={f.approved} onChange={(e) => patchFix(f.id, { approved: e.target.checked })} />
                    Approve
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-400">
                    <input type="checkbox" checked={f.replace} onChange={(e) => patchFix(f.id, { replace: e.target.checked })} />
                    Overwrite what&apos;s there
                  </label>
                  <button className="ml-auto text-slate-500 hover:text-rose-400" onClick={() => removeFix(f.id)} aria-label="Remove this fix"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <textarea
                  className="input min-h-[70px] font-mono text-[11px]"
                  value={f.value}
                  onChange={(e) => patchFix(f.id, { value: e.target.value })}
                  placeholder={KIND_HINT.get(f.kind) || ""}
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  {KIND_HINT.get(f.kind)} <span className="text-slate-600">· {f.source}</span>
                  {f.replace ? <span className="text-amber-300"> · this one overwrites the value already on the page.</span> : <span className="text-slate-600"> · fills a gap only; anything already written stays.</span>}
                </p>
              </div>
            ))}
          </div>
        )}

        {needsYou.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3">
            <p className="mb-1.5 text-xs font-semibold text-amber-200">The OS will not write these for you</p>
            {needsYou.map((g) => (
              <p key={g.label} className="mb-1 text-[11px] leading-relaxed text-amber-100/80"><strong>{g.label}.</strong> {g.reason}</p>
            ))}
          </div>
        )}
      </div>

      {/* 4 — the switch */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.08] p-3">
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={config?.enabled ?? false} onChange={(e) => setConfig((c) => (c ? { ...c, enabled: e.target.checked } : c))} disabled={!config} />
          Auto-deploy is on
          <span className="text-[11px] text-slate-500">({approvedCount} approved fix{approvedCount === 1 ? "" : "es"} would apply)</span>
        </label>
        <button className="btn-primary" onClick={() => save()} disabled={saving || !config}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save
        </button>
      </div>

      {note && <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{note}</p>}
      {msg && (
        <p className={`mt-2 flex items-start gap-1.5 rounded-md px-3 py-2 text-sm ${msg.error ? "bg-rose-500/10 text-rose-300" : "bg-emerald-500/10 text-emerald-300"}`}>
          {msg.error ? <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />} {msg.text}
        </p>
      )}
    </div>
  );
}
