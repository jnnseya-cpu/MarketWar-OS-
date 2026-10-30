"use client";

// Presenter video — a synthetic face and voice reading your script.
//
// The consent form is not paperwork bolted on beside the feature; it IS the
// feature's precondition. A custom avatar is a real person's face, so without a
// consent on record the render is refused rather than warned about, and this
// panel shows the refusal with the part that failed named — "consented to face,
// not voice" sends you somewhere useful, "no consent" does not.

import { useCallback, useEffect, useState } from "react";
import { Film, Loader2, Scissors, ShieldCheck, UserRound, Video, X } from "lucide-react";
import { Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";
import CopyOut from "@/components/CopyOut";

type Consent = {
  id: string; personName: string; kinds: string[]; evidence: string;
  territories: string[]; platforms: string[]; paidAds: boolean;
  grantedAt: string; expiresAt: string; revokedAt?: string;
  live: boolean; daysLeft: number;
};
type Job = {
  ok?: boolean; mode?: string; provider?: string; jobRef?: string | null; brief?: string;
  note?: string; disclosure?: string; charged?: boolean;
  jobId?: string; status?: "rendering" | "ready" | "failed"; videoUrl?: string | null;
};
type AvatarChoice = { id: string; name: string; kind: "avatar" | "photo"; gender?: string; previewImage?: string };
type PlannedBeat = { index: number; text: string; seconds: number; words?: number };
type Plan = {
  beats: PlannedBeat[]; totalSeconds: number; minutes: number;
  dividedBy: "author" | "pace"; warnings: string[];
  acus: number; continuous: boolean; provider: string | null; note: string;
};
type VoiceChoice = { id: string; name: string; language?: string; gender?: string };
type Translation = { jobId: string; lang: string; status: string; videoUrl: string | null; note?: string };

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

  // The roster — pick a face instead of pasting a provider id.
  const [avatars, setAvatars] = useState<AvatarChoice[]>([]);
  const [voices, setVoices] = useState<VoiceChoice[]>([]);
  const [rosterNote, setRosterNote] = useState("");
  const [avatarId, setAvatarId] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [aspect, setAspect] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const [voiceSource, setVoiceSource] = useState<"provider" | "cloned">("provider");
  // One take, or a continuous commercial built from fifteen-second beats.
  const [shape, setShape] = useState<"take" | "commercial">("take");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [elevenVoiceId, setElevenVoiceId] = useState("");

  // Translation
  const [languages, setLanguages] = useState<string[]>([]);
  const [pickedLangs, setPickedLangs] = useState<string[]>([]);
  const [translateAcu, setTranslateAcu] = useState(0);
  const [translations, setTranslations] = useState<Translation[]>([]);

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

  // The roster is brand-independent, so it loads once and is cached server-side.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await authedFetch("/api/avatars?roster=1");
        const d = await r.json();
        if (!live || !r.ok) return;
        setAvatars(Array.isArray(d?.avatars) ? d.avatars : []);
        setVoices(Array.isArray(d?.voices) ? d.voices : []);
        setRosterNote(typeof d?.note === "string" ? d.note : "");
        setLanguages(Array.isArray(d?.translation?.languages) ? d.translation.languages : []);
        setTranslateAcu(Number(d?.translation?.acuPerMinutePerLanguage) || 0);
      } catch { /* the panel still renders without a roster */ }
    })();
    return () => { live = false; };
  }, []);

  // POLL THE RENDER UNTIL IT IS A VIDEO.
  //
  // This is the half that did not exist: the panel used to print the provider's
  // job id and stop, so a paid render had to be collected from the provider's
  // own dashboard. It stops polling the moment the job is ready or failed, and
  // on unmount — a timer left running against a finished job is a request per
  // three seconds for as long as the tab is open.
  useEffect(() => {
    if (!job?.jobId || job.status !== "rendering" || !activeBrand?.id) return;
    let live = true;
    const tick = async () => {
      try {
        const r = await authedFetch(`/api/avatars?brandId=${encodeURIComponent(activeBrand.id)}&jobId=${encodeURIComponent(job.jobId!)}`);
        const d = await r.json();
        if (!live || !r.ok) return;
        if (d?.status && d.status !== "rendering") {
          setJob((j) => ({ ...(j || {}), status: d.status, videoUrl: d.videoUrl ?? null, note: d.note || j?.note }));
        }
      } catch { /* the next tick tries again */ }
    };
    const id = setInterval(tick, 3000);
    void tick();
    return () => { live = false; clearInterval(id); };
  }, [job?.jobId, job?.status, activeBrand?.id]);

  // The same for each translation in flight.
  useEffect(() => {
    const pending = translations.filter((t) => t.status === "rendering");
    if (!pending.length || !activeBrand?.id) return;
    let live = true;
    const id = setInterval(async () => {
      for (const t of pending) {
        try {
          const r = await authedFetch(`/api/avatars?brandId=${encodeURIComponent(activeBrand.id)}&translationId=${encodeURIComponent(t.jobId)}`);
          const d = await r.json();
          if (!live || !r.ok) continue;
          if (d?.status && d.status !== "rendering") {
            setTranslations((all) => all.map((x) => (x.jobId === t.jobId ? { ...x, status: d.status, videoUrl: d.videoUrl ?? null, note: d.note } : x)));
          }
        } catch { /* next tick */ }
      }
    }, 4000);
    return () => { live = false; clearInterval(id); };
  }, [translations, activeBrand?.id]);

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
    const d = await post({
      action: "render", script, avatarKind,
      personName: personName || undefined,
      avatarId: avatarId || undefined,
      voiceId: voiceSource === "provider" ? (voiceId || undefined) : undefined,
      voiceSource,
      elevenVoiceId: voiceSource === "cloned" ? (elevenVoiceId || undefined) : undefined,
      aspect,
    });
    if (d) { setJob(d); setTranslations([]); }
  }

  /**
   * Split the script and quote the price, WITHOUT rendering or charging.
   *
   * The same function on the server answers this and sizes the real charge, so
   * the beats shown here are the beats that get rendered. A preview computed
   * one way and a render another is the defect this platform keeps producing.
   */
  async function planScenes() {
    setPlan(null);
    const d = await post({ action: "storyboard", script });
    if (!d) return;
    setPlan({
      beats: Array.isArray(d.beats) ? d.beats : [],
      totalSeconds: Number(d.totalSeconds) || 0,
      minutes: Number(d.minutes) || 0,
      dividedBy: d.dividedBy === "author" ? "author" : "pace",
      warnings: Array.isArray(d.warnings) ? d.warnings.filter((w: unknown) => typeof w === "string") : [],
      acus: Number(d.acus) || 0,
      continuous: d.continuous === true,
      provider: typeof d.provider === "string" ? d.provider : null,
      note: typeof d.note === "string" ? d.note : "",
    });
  }

  async function renderCommercial() {
    const d = await post({
      action: "commercial", script, avatarKind,
      personName: personName || undefined,
      avatarId: avatarId || undefined,
      voiceId: voiceSource === "provider" ? (voiceId || undefined) : undefined,
      voiceSource,
      elevenVoiceId: voiceSource === "cloned" ? (elevenVoiceId || undefined) : undefined,
      aspect,
    });
    if (d) { setJob(d); setTranslations([]); }
  }

  async function translate() {
    if (!job?.jobId || !pickedLangs.length) return;
    const d = await post({ action: "translate", jobId: job.jobId, languages: pickedLangs });
    if (!d) return;
    const started: Translation[] = (Array.isArray(d.started) ? d.started : []).map((t: Record<string, unknown>) => ({
      jobId: String(t.jobId || ""), lang: String(t.lang || ""), status: String(t.status || "rendering"),
      videoUrl: typeof t.videoUrl === "string" ? t.videoUrl : null,
    }));
    setTranslations((all) => [...all, ...started]);
    if (Array.isArray(d.refused) && d.refused.length) {
      setError(d.refused.map((r: Record<string, unknown>) => `${r.lang}: ${r.error}`).join(" · "));
    }
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

      {/* ONE TAKE, OR A COMMERCIAL. The owner's brief: "a very professional and
          commercial video of up to 1 minute no stop if 15 second each with a
          tool to make them together as 1 video." There is no joining tool,
          because the provider renders several scenes as ONE file — so the
          choice here is how the script is divided, not how clips are glued. */}
      <div className="mb-3 flex flex-wrap gap-2">
        {([
          ["take", "One take", "A single continuous read."],
          ["commercial", "Commercial", "Up to 60s, built from 15-second scenes, rendered as one video."],
        ] as const).map(([id, label, why]) => (
          <button
            key={id} type="button"
            onClick={() => { setShape(id); setPlan(null); }}
            className={`rounded-lg border px-3 py-2 text-left text-xs transition ${shape === id ? "border-brand-500/60 bg-brand-500/10 text-white" : "border-ink-700 text-slate-300 hover:border-slate-500"}`}
          >
            <span className="block font-bold">{label}</span>
            <span className="block text-[10px] text-slate-500">{why}</span>
          </button>
        ))}
      </div>

      <label className="label">The script</label>
      <textarea
        className="input min-h-[100px]" value={script}
        onChange={(e) => { setScript(e.target.value); setPlan(null); }}
        placeholder={shape === "commercial"
          ? "Up to about 150 words. Leave a blank line where you want a new scene, or write it as prose and it will be divided for you."
          : "The one point this video is making."}
      />
      {shape === "commercial" && (
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          A blank line is a scene break. Write it as prose instead and it is divided at sentence boundaries into
          beats of about fifteen seconds — never mid-word, and never inside &ldquo;Mr. Patel&rdquo; or &ldquo;£4.99&rdquo;.
          Plan it first and you will see exactly what will be rendered before anything is charged.
        </p>
      )}

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
        <div>
          <label className="label">Shape</label>
          <select className="input" value={aspect} onChange={(e) => setAspect(e.target.value as "9:16" | "16:9" | "1:1")}>
            <option value="9:16">Vertical 9:16 — Reels, TikTok, Shorts</option>
            <option value="16:9">Landscape 16:9 — YouTube, a page, an email</option>
            <option value="1:1">Square 1:1 — feed posts and square ads</option>
          </select>
        </div>
        <div>
          <label className="label">Voice</label>
          <select className="input" value={voiceSource} onChange={(e) => setVoiceSource(e.target.value as "provider" | "cloned")}>
            <option value="provider">One of the provider&apos;s voices</option>
            <option value="cloned">My own cloned voice (ElevenLabs)</option>
          </select>
        </div>
      </div>

      {/* THE FACE PICKER. This used to be a free-text field for a provider id,
          which meant the one thing this screen could not do was let somebody
          choose a presenter — and a wrong paste renders a stranger reading
          their script, billed. */}
      {avatars.length > 0 && (
        <div className="mt-3">
          <label className="label">Who presents it</label>
          <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto rounded-lg border border-white/10 bg-ink-900/40 p-2 sm:grid-cols-5">
            {avatars.map((a) => (
              <button
                key={a.id} type="button" onClick={() => setAvatarId(a.id === avatarId ? "" : a.id)}
                className={`rounded-lg border p-1 text-left transition ${a.id === avatarId ? "border-fuchsia-500/60 bg-fuchsia-500/10" : "border-white/10 hover:border-white/25"}`}
                title={a.name}
              >
                {a.previewImage
                  // eslint-disable-next-line @next/next/no-img-element -- a provider CDN thumbnail, not a bundled asset
                  ? <img src={a.previewImage} alt={a.name} className="h-20 w-full rounded object-cover" loading="lazy" />
                  : <div className="flex h-20 w-full items-center justify-center rounded bg-ink-850 text-[10px] text-slate-500">no preview</div>}
                <p className="mt-1 truncate text-[10px] text-slate-300">{a.name}</p>
              </button>
            ))}
          </div>
          {!avatarId && <p className="mt-1 text-[11px] text-amber-300">Pick a presenter — without one the provider refuses the render.</p>}
        </div>
      )}
      {avatars.length === 0 && rosterNote && <p className="mt-3 text-[11px] text-slate-500">{rosterNote}</p>}

      {voiceSource === "provider" && voices.length > 0 && (
        <div className="mt-3">
          <label className="label">Which voice</label>
          <select className="input" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
            <option value="">The presenter&apos;s default voice</option>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>{v.name}{v.language ? ` · ${v.language}` : ""}{v.gender ? ` · ${v.gender}` : ""}</option>
            ))}
          </select>
        </div>
      )}
      {voiceSource === "cloned" && (
        <div className="mt-3">
          <label className="label">ElevenLabs voice id</label>
          <input className="input" value={elevenVoiceId} onChange={(e) => setElevenVoiceId(e.target.value)} placeholder="Leave blank for the default voice" />
          <p className="mt-1 text-[11px] text-slate-500">
            The speech is generated in your own voice, hosted by us, and the presenter lip-syncs to it — the provider never receives the voice model. A cloned voice of a real person needs a VOICE consent on record, not just a face one. Billed separately, per 1,000 characters.
          </p>
        </div>
      )}

      {shape === "take" ? (
        <>
          <button className="btn-primary mt-4" onClick={render} disabled={busy || !script.trim()}>
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Working…</> : <><Video className="h-4 w-4" /> {configured ? "Render the presenter" : "Get the shot brief"}</>}
          </button>
          <p className="mt-2 text-[11px] text-slate-500">
            {configured
              ? `About ${minutes} minute${minutes === 1 ? "" : "s"} at a natural pace${acuPerMinute ? ` · ${acuPerMinute * minutes} ACUs` : ""}. Providers bill by duration, so this is charged by the minute and nothing is charged if a gate refuses it.`
              : "No provider is configured, so this returns a shot brief and charges nothing."}
          </p>
        </>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button className="btn-secondary" onClick={planScenes} disabled={busy || !script.trim()}>
              {busy && !plan ? <><Loader2 className="h-4 w-4 animate-spin" /> Working…</> : <><Scissors className="h-4 w-4" /> Plan the scenes</>}
            </button>
            {plan && (
              <button className="btn-primary" onClick={renderCommercial} disabled={busy}>
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Working…</> : <><Film className="h-4 w-4" /> {plan.continuous ? `Render ${plan.beats.length} scenes as one video${plan.acus ? ` · ${plan.acus} ACUs` : ""}` : "Get the storyboard"}</>}
              </button>
            )}
            <span className="text-[11px] text-slate-500">Planning is free — nothing is charged until you render.</span>
          </div>

          {plan && (
            <div className="mt-3 rounded-lg border border-white/10 bg-ink-900/40 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-white">
                  {plan.beats.length} scene{plan.beats.length === 1 ? "" : "s"} · {plan.totalSeconds}s
                </p>
                <span className="text-[10px] text-slate-500">
                  {plan.dividedBy === "author" ? "divided where you left the blank lines" : "divided at sentence boundaries, by pace"}
                </span>
              </div>
              <ol className="space-y-1.5">
                {plan.beats.map((b) => (
                  <li key={b.index} className="flex gap-2 text-[11px] leading-relaxed">
                    <span className="mt-px shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                      {b.index} · {b.seconds}s
                    </span>
                    <span className="text-slate-300">{b.text}</span>
                  </li>
                ))}
              </ol>
              {plan.warnings.map((w) => (
                <p key={w} className="mt-2 text-[11px] leading-relaxed text-amber-200">{w}</p>
              ))}
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{plan.note}</p>
            </div>
          )}
        </>
      )}

      {error && <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-3 text-sm text-rose-200">{error}</p>}

      {job && (
        <div className="mt-4 space-y-3">
          {job.note && <p className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs leading-relaxed text-slate-300">{job.note}</p>}
          {job.brief && (
            <>
              <pre className="whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-ink-900/50 p-3 font-sans text-sm leading-relaxed text-slate-300">{job.brief}</pre>
              {/* A script is read from a phone while filming. It has to leave
                  this screen or it is not a script, it is a paragraph. */}
              <CopyOut text={job.brief} filename="script.txt" label="Copy the script" />
            </>
          )}
          {/* THE PLAYER. What this panel owed the customer all along: it used to
              print the provider's job id as monospace text and stop, so a paid
              render had to be fetched from the provider's own dashboard. */}
          {job.status === "rendering" && (
            <p className="flex items-center gap-2 text-xs text-slate-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Rendering. This takes a few minutes — the video appears here when it is done, and it is filed in your library.
            </p>
          )}
          {job.status === "failed" && (
            <p className="text-xs text-rose-300">{job.note || "The render failed and the ACUs have been put back."}</p>
          )}
          {job.status === "ready" && job.videoUrl && (
            <div className="space-y-2">
              <video src={job.videoUrl} controls playsInline className="w-full max-w-sm rounded-lg border border-white/10" />
              <div className="flex flex-wrap gap-2">
                <a href={job.videoUrl} download className="btn-secondary !py-1.5 !text-xs">Download the MP4</a>
              </div>

              {/* TRANSLATION — the same video, mouth re-rendered per language. */}
              {languages.length > 0 && (
                <div className="mt-3 rounded-lg border border-white/10 bg-ink-900/40 p-3">
                  <p className="text-xs font-semibold text-white">Say it in another language</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    The mouth is re-rendered to match, which is not the same as dubbing the audio. Billed per language, per minute{translateAcu ? ` — ${translateAcu * minutes} ACUs each` : ""}.
                  </p>
                  <select
                    className="input mt-2" multiple size={4}
                    value={pickedLangs}
                    onChange={(e) => setPickedLangs(Array.from(e.target.selectedOptions).map((o) => o.value))}
                  >
                    {languages.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button className="btn-secondary !py-1.5 !text-xs" onClick={translate} disabled={busy || !pickedLangs.length}>
                      Translate into {pickedLangs.length || 0}
                    </button>
                    {pickedLangs.length > 0 && translateAcu > 0 && (
                      <span className="text-[11px] text-slate-400">{translateAcu * minutes * pickedLangs.length} ACUs in total</span>
                    )}
                  </div>
                </div>
              )}

              {translations.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {translations.map((t) => (
                    <li key={t.jobId} className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                      <span className="font-semibold">{t.lang}</span>
                      {t.status === "rendering" && <span className="text-slate-500">rendering…</span>}
                      {t.status === "failed" && <span className="text-rose-300">{t.note || "failed — refunded"}</span>}
                      {t.status === "ready" && t.videoUrl && <a href={t.videoUrl} className="text-fuchsia-300 underline" target="_blank" rel="noreferrer">open</a>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {job.jobRef && job.status !== "ready" && <p className="text-[10px] text-slate-600">Provider job: <span className="font-mono">{job.jobRef}</span></p>}
        </div>
      )}

      {disclosure && <p className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-[11px] leading-relaxed text-slate-500">{disclosure}</p>}
    </div>
  );
}
