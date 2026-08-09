"use client";

// Presenter video — a synthetic face and voice reading your script.
//
// The consent form is not paperwork bolted on beside the feature; it IS the
// feature's precondition. A custom avatar is a real person's face, so without a
// consent on record the render is refused rather than warned about, and this
// panel shows the refusal with the part that failed named — "consented to face,
// not voice" sends you somewhere useful, "no consent" does not.

import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck, UserRound, Video, X } from "lucide-react";
import { Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";

type Consent = {
  id: string; personName: string; kinds: string[]; evidence: string;
  territories: string[]; platforms: string[]; paidAds: boolean;
  grantedAt: string; expiresAt: string; revokedAt?: string;
  live: boolean; daysLeft: number;
};
type Job = { ok?: boolean; mode?: string; provider?: string; jobRef?: string | null; brief?: string; note?: string; disclosure?: string; charged?: boolean };

const EVIDENCE = [
  { id: "signed-release", label: "A signed release I hold" },
  { id: "recorded-statement", label: "They said so on camera or audio" },
  { id: "written-agreement", label: "An email or contract naming this use" },
  { id: "self", label: "It is me" },
];

export default function PresenterVideo() {
  const { activeBrand } = useActiveBrand();
  const [consents, setConsents] = useState<Consent[]>([]);
  const [configured, setConfigured] = useState(false);
  const [disclosure, setDisclosure] = useState("");
  const [acuPerMinute, setAcuPerMinute] = useState(0);
  const [script, setScript] = useState("");
  const [avatarKind, setAvatarKind] = useState<"stock" | "custom">("stock");
  const [personName, setPersonName] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // The consent form
  const [cName, setCName] = useState("");
  const [cFace, setCFace] = useState(true);
  const [cVoice, setCVoice] = useState(false);
  const [cEvidence, setCEvidence] = useState("signed-release");
  const [cTerritories, setCTerritories] = useState("*");
  const [cPlatforms, setCPlatforms] = useState("*");
  const [cPaid, setCPaid] = useState(false);

  const load = useCallback(async () => {
    if (!activeBrand?.id) return;
    try {
      const r = await authedFetch(`/api/avatars?brandId=${encodeURIComponent(activeBrand.id)}`);
      const d = await r.json();
      if (r.ok) {
        setConsents(Array.isArray(d?.consents) ? d.consents : []);
        setConfigured(Boolean(d?.configured));
        setDisclosure(d?.disclosure || "");
        setAcuPerMinute(Number(d?.acuPerMinute) || 0);
      }
    } catch { /* the panel still records consents */ }
  }, [activeBrand?.id]);

  useEffect(() => { load(); }, [load]);

  const post = async (body: Record<string, unknown>) => {
    if (!activeBrand?.id) { setError("Pick a brand first."); return null; }
    setBusy(true); setError("");
    try {
      const res = await authedFetch("/api/avatars", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: activeBrand.id, ...body }),
      });
      const d = await res.json();
      if (!res.ok) { setError([d?.error, d?.hint].filter(Boolean).join(" — ")); return null; }
      return d;
    } catch {
      setError("Could not reach the presenter gateway."); return null;
    } finally { setBusy(false); }
  };

  async function saveConsent() {
    const kinds = [cFace ? "face" : null, cVoice ? "voice" : null].filter(Boolean);
    const d = await post({
      action: "consent", personName: cName, kinds, evidence: cEvidence,
      territories: cTerritories.split(",").map((t) => t.trim()).filter(Boolean),
      platforms: cPlatforms.split(",").map((p) => p.trim()).filter(Boolean),
      paidAds: cPaid,
    });
    if (d) { setCName(""); load(); }
  }

  async function revoke(id: string) {
    const d = await post({ action: "revoke", consentId: id });
    if (d) load();
  }

  async function render() {
    const d = await post({ action: "render", script, avatarKind, personName: personName || undefined });
    if (d) setJob(d);
  }

  // The same 150 words per minute the server bills at, so the number quoted
  // here and the number charged come from one rule rather than two.
  const minutes = Math.max(1, Math.ceil(script.split(/\s+/).filter(Boolean).length / 150));

  return (
    <div className="mb-6 card border-fuchsia-500/25 p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <UserRound className="h-5 w-5 text-fuchsia-400" />
        <h2 className="font-display text-lg font-bold text-white">Presenter video — a face reading your script</h2>
        <Pill tone={configured ? "good" : "info"}>{configured ? "Provider connected" : "No provider — you get the brief"}</Pill>
      </div>
      <p className="mb-4 text-sm text-slate-400">
        A stock presenter is a licensed performer and may never be made to look like they personally endorse you. A custom avatar is somebody you know, and needs their consent on record first — scoped to where, on what, and until when. No record, no render.
      </p>

      {/* Consents first, because the render depends on them. */}
      <div className="mb-5 rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5" /> Consents on record
        </p>
        {consents.length === 0 && <p className="mb-3 text-xs text-slate-500">None yet. A custom avatar cannot be rendered until there is one.</p>}
        {consents.length > 0 && (
          <ul className="mb-3 space-y-1.5">
            {consents.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 text-xs">
                <Pill tone={c.live ? "good" : "bad"}>{c.revokedAt ? "withdrawn" : c.live ? `${c.daysLeft}d left` : "expired"}</Pill>
                <span className="font-semibold text-white">{c.personName}</span>
                <span className="text-slate-400">{c.kinds.join(" + ")} · {c.territories.join(",")} · {c.platforms.join(",")} · {c.paidAds ? "paid ads included" : "organic only"}</span>
                {!c.revokedAt && (
                  <button className="ml-auto inline-flex items-center gap-1 rounded border border-ink-700 px-1.5 py-0.5 text-[11px] text-slate-400 hover:border-rose-500/40" onClick={() => revoke(c.id)} disabled={busy}>
                    <X className="h-3 w-3" /> Withdraw
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <input className="input" value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Whose likeness — full name" />
          <select className="input" value={cEvidence} onChange={(e) => setCEvidence(e.target.value)}>
            {EVIDENCE.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
          <input className="input" value={cTerritories} onChange={(e) => setCTerritories(e.target.value)} placeholder="Territories — GB, IE, or * for worldwide" />
          <input className="input" value={cPlatforms} onChange={(e) => setCPlatforms(e.target.value)} placeholder="Platforms — Instagram, TikTok, or *" />
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 sm:col-span-2">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={cFace} onChange={(e) => setCFace(e.target.checked)} /> Face</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={cVoice} onChange={(e) => setCVoice(e.target.checked)} /> Voice</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={cPaid} onChange={(e) => setCPaid(e.target.checked)} /> Paid advertising too</label>
            <button className="btn-secondary ml-auto" onClick={saveConsent} disabled={busy || !cName.trim() || (!cFace && !cVoice)}>Record the consent</button>
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
          Consent to a face is never consent to a voice, and organic use is never paid use. Each is asked for separately because each is a separate permission. A withdrawal takes effect immediately and stays on record.
        </p>
      </div>

      <label className="label">The script</label>
      <textarea className="input min-h-[100px]" value={script} onChange={(e) => setScript(e.target.value)} placeholder="The one point this video is making." />

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Presenter</label>
          <select className="input" value={avatarKind} onChange={(e) => setAvatarKind(e.target.value as "stock" | "custom")}>
            <option value="stock">A licensed stock performer</option>
            <option value="custom">Someone I have consent for</option>
          </select>
        </div>
        {avatarKind === "custom" && (
          <div>
            <label className="label">Whose likeness</label>
            <input className="input" value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="Must match a consent on record" />
          </div>
        )}
      </div>

      <button className="btn-primary mt-4" onClick={render} disabled={busy || !script.trim()}>
        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Working…</> : <><Video className="h-4 w-4" /> {configured ? "Render the presenter" : "Get the shot brief"}</>}
      </button>
      <p className="mt-2 text-[11px] text-slate-500">
        {configured
          ? `About ${minutes} minute${minutes === 1 ? "" : "s"} at a natural pace${acuPerMinute ? ` · ${acuPerMinute * minutes} ACUs` : ""}. Providers bill by duration, so this is charged by the minute and nothing is charged if a gate refuses it.`
          : "No provider is configured, so this returns a shot brief and charges nothing."}
      </p>

      {error && <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-3 text-sm text-rose-200">{error}</p>}

      {job && (
        <div className="mt-4 space-y-3">
          {job.note && <p className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs leading-relaxed text-slate-300">{job.note}</p>}
          {job.brief && <pre className="whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-ink-900/50 p-3 font-sans text-sm leading-relaxed text-slate-300">{job.brief}</pre>}
          {job.jobRef && <p className="text-xs text-slate-400">Provider job: <span className="font-mono">{job.jobRef}</span></p>}
        </div>
      )}

      {disclosure && <p className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-[11px] leading-relaxed text-slate-500">{disclosure}</p>}
    </div>
  );
}
