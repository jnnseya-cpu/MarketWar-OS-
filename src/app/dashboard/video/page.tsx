"use client";

// M-31 AI Video War Room — clip intelligence + campaign video agents.
//
// Honesty rule (owner directive): every capability is badged LIVE (computes real
// output today — deterministic in demo, full quality with keys) or P1
// (scaffolded, activates with the render / capture pipeline). The 7 tabs below
// are real AgentRunners. The Clip Intelligence Lab is wired to the REAL
// VideoDominance engine (/api/video-intelligence): genre detection, moment
// ranking, 8-dimension virality scoring and natural-language moment search.
// Studio tools that need a render/capture farm (avatar, audio, screen recorder,
// editor, B-roll) are honestly marked "Coming soon" — never shown as working.

import { useEffect, useState } from "react";
import {
  Captions,
  CheckCircle2,
  Clapperboard,
  Clock,
  Globe2,
  ImagePlus,
  Layers,
  Loader2,
  Mic,
  MonitorPlay,
  Palette,
  Scissors,
  Search,
  Send,
  Sparkles,
  UserSquare2,
  Users2,
} from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import VideoRenderAndPublish from "@/components/VideoRenderAndPublish";
import { PageHeader, Pill, ScoreBar, StatCard } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";

type Status = "live" | "p1";
// A studio gated on a real provider key flips to Live when the key is present
// (read from the no-spend /api/health/live probe).
type Cap = "image" | "video" | "publish";
const CAP_LABELS: Record<Cap, string> = {
  image: "Photoreal image backgrounds",
  video: "Video render (Veo/Sora)",
  publish: "Social publishing (Zernio, 15 channels)",
};

// Local honest status chip (per-page pattern; not shared across pages).
function StatusChip({ status }: { status: Status }) {
  return status === "live" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
      <CheckCircle2 className="h-3 w-3" /> Live now
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
      <Clock className="h-3 w-3" /> Coming soon
    </span>
  );
}

// Each studio: what it produces TODAY. Key-gated studios carry a `cap` + a
// `liveNote`; their chip flips to Live the moment the provider key is present.
type Studio = { icon: typeof Clapperboard; title: string; desc: string; status: Status; note: string; cap?: Cap; liveNote?: string };
const STUDIO: Studio[] = [
  { icon: Clapperboard, title: "AI Video Generator", status: "p1", cap: "video", note: "Scripts, shot lists & platform versions generate live in the Campaign Video tab; rendered video needs a video-model + render queue.", liveNote: "Rendered video is live (Veo / Sora) — render an MP4 in the panel below.", desc: "Prompt/script/product-demo/explainer/testimonial/ad/avatar/image/PPT-to-video — one-click campaign videos with platform versions." },
  { icon: Scissors, title: "Online Video Editor", status: "p1", note: "The in-browser editor timeline lands with the render pipeline.", desc: "Cut, trim, split, crop, resize, merge, text, logos, overlays, transitions, effects, speed, blur/censor, multi-format export." },
  { icon: Captions, title: "Subtitle & Caption Engine", status: "live", note: "Caption specs generated live — run the Captions tab below.", desc: "Auto-subtitles, karaoke captions, word highlights, SRT/VTT, burned-in, multi-language — in Sales/Education/Viral/Brand modes." },
  { icon: Globe2, title: "Translation & Dubbing", status: "p1", note: "The localisation plan generates live in the Global Reach tab; voice cloning + dubbed render need an audio-model.", desc: "Subtitle + voice translation, AI dubbing, voice cloning — one video in 10–50 languages with localised CTAs." },
  { icon: UserSquare2, title: "AI Avatar Studio", status: "p1", note: "Talking-head avatar rendering activates with an avatar-model key.", desc: "Talking-head presenters: business, teacher, professional and influencer avatars — a branded company spokesperson in any language." },
  { icon: Mic, title: "Audio Studio", status: "p1", note: "TTS / voice-clone / enhancement rendering needs an audio-model.", desc: "TTS, voiceovers, voice cloning, noise removal, audio enhancement — Perfect Voice, Ad Voice and Course Voice agents." },
  { icon: MonitorPlay, title: "Screen & Presentation Recorder", status: "p1", note: "Browser capture + teleprompter land with the capture client.", desc: "Screen/webcam/slides with teleprompter — auto-turned into demos, training modules, social clips and help-centre videos." },
  { icon: Layers, title: "Repurposing Engine", status: "live", note: "Powered by the live clip-intelligence engine — rank & find moments in the lab below.", desc: "1 long video → 10 TikToks, 10 Reels, 10 Shorts, 5 LinkedIn clips, 5 Facebook ads, 1 blog, 1 email campaign, 1 landing-page script." },
  { icon: Palette, title: "Brand Kit", status: "p1", cap: "video", note: "Logo colour auto-detection + intro/outro render land with the creative pipeline.", liveNote: "Your logo + brand colours (Brand Studio) theme every creative; intro/outro render is live via the video model.", desc: "Logo colour auto-detection, fonts, intros/outros, watermarks — the Brand Guardian rejects off-brand visuals at generation time." },
  { icon: Users2, title: "Collaboration & Approvals", status: "p1", note: "The team workspace + approval portal land with the connector phase.", desc: "Team workspace, versions, client approval portal (Approve/Reject/Request Change), creator→editor→manager→client→publish." },
  { icon: ImagePlus, title: "B-Roll & Visual Enhancer", status: "p1", cap: "video", note: "B-roll generation + background removal need an image/video-model.", liveNote: "B-roll + image-to-video are live via the image/video models.", desc: "AI B-roll, image-to-video, video-to-video, image generation/extension, background removal, green screen, upscaling." },
  { icon: Send, title: "Publishing & Hosting", status: "p1", cap: "publish", note: "Hosting + scheduled publishing activate with channel connectors.", liveNote: "Publishing is live (Zernio, 15 channels) + Firebase Storage hosting — publish or schedule from the render panel.", desc: "Hosting, share/approval links, embed player, platform export, scheduled publishing and the campaign library." },
];

const TABS = [
  { key: "video", label: "Campaign Video" },
  { key: "hooks", label: "Viral Hooks" },
  { key: "funnel", label: "Funnel Builder" },
  { key: "captions", label: "Captions" },
  { key: "global", label: "Global Reach" },
  { key: "compliance", label: "Compliance" },
  { key: "packaging", label: "Thumbnails & Titles" },
] as const;

// ---- Live engine response types (mirror src/backend/video-intelligence.ts) ----
type GenreResult = { genre: string; confidence: number; runnerUp: string };
type RankedMoment = { id: string; startSec: number; endSec: number; transcript?: string; momentScore: number; reasons: string[] };
type ClipScores = { clipId: string; scores: { dimension: string; score: number }[]; headline: string; note: string };
type FoundMoment = RankedMoment & { matchReason: string };
type FindResult = { query: string; results: FoundMoment[]; note: string };

// Deterministic sample timeline. The engine ranks / scores / searches these
// SUPPLIED moments — it never invents a moment (honest per the engine's own note).
const SAMPLE_MOMENTS = [
  { id: "m1", startSec: 12, endSec: 34, transcript: "the secret nobody tells you about grilling", hasFace: true, emotionIntensity: 70 },
  { id: "m2", startSec: 90, endSec: 108, transcript: "three reasons customers switch to us", hasProduct: true, isNumberedPoint: true },
  { id: "m3", startSec: 150, endSec: 171, transcript: "a customer changed my mind with these results", emotionIntensity: 62 },
  { id: "m4", startSec: 205, endSec: 320, transcript: "long slow intro with background music", hasFace: false },
  { id: "m5", startSec: 330, endSec: 352, transcript: "how much does it cost? here is the price and a quick demo", hasProduct: true, isQuestion: true },
];

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const pretty = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export default function VideoWarRoomPage() {
  const { activeBrand } = useActiveBrand();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("video");

  // Live capability probe — flips the render/publish studios to "Live now".
  const [caps, setCaps] = useState<Record<Cap, boolean>>({ image: false, video: false, publish: false });
  useEffect(() => {
    let on = true;
    fetch("/api/health/live").then((r) => r.json()).then((d) => {
      if (!on || !Array.isArray(d?.capabilities)) return;
      const ready = (label: string) => Boolean(d.capabilities.find((c: { capability: string; ready: boolean }) => c.capability === label)?.ready);
      setCaps({ image: ready(CAP_LABELS.image), video: ready(CAP_LABELS.video), publish: ready(CAP_LABELS.publish) });
    }).catch(() => {});
    return () => { on = false; };
  }, []);
  const effStatus = (s: Studio): Status => (s.cap ? (caps[s.cap] ? "live" : "p1") : s.status);
  const effNote = (s: Studio): string => (s.cap && caps[s.cap] && s.liveNote ? s.liveNote : s.note);
  const renderLive = caps.video;

  // Clip Intelligence Lab (live engine).
  const [title, setTitle] = useState(activeBrand ? `${activeBrand.name} — product demo & customer story` : "Product demo: how our grill works, plus a customer story");
  const [transcript, setTranscript] = useState("Let me demo the features and unbox it. Three reasons customers switch. A question you always ask about price.");
  const [query, setQuery] = useState("clips suitable for a 15-second product ad");
  const [genre, setGenre] = useState<GenreResult | null>(null);
  const [ranked, setRanked] = useState<RankedMoment[] | null>(null);
  const [clip, setClip] = useState<ClipScores | null>(null);
  const [found, setFound] = useState<FindResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = (body: Record<string, unknown>) =>
    fetch("/api/video-intelligence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

  async function runLab() {
    setBusy(true);
    setError(null);
    try {
      const [g, r] = await Promise.all([
        post({ action: "genre", title, transcript }),
        post({ action: "rank", moments: SAMPLE_MOMENTS }),
      ]);
      if (g?.error) throw new Error(g.error);
      if (r?.error) throw new Error(r.error);
      const rankedMoments: RankedMoment[] = r.moments ?? [];
      const top = rankedMoments[0];
      const scoreInput = top
        ? {
            clipId: top.id,
            hookStrength: top.momentScore,
            productVisible: /price|demo|product/.test((top.transcript ?? "").toLowerCase()),
            ctaPresent: /price|demo|order/.test((top.transcript ?? "").toLowerCase()),
            buyerIntent: /price|cost|switch/.test((top.transcript ?? "").toLowerCase()) ? 72 : 45,
            platform: "tiktok",
          }
        : { clipId: "m1" };
      const c = await post({ action: "score", input: scoreInput });
      if (c?.error) throw new Error(c.error);
      setGenre(g);
      setRanked(rankedMoments);
      setClip(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setBusy(false);
    }
  }

  async function runFind() {
    setBusy(true);
    setError(null);
    try {
      const f = await post({ action: "find", moments: SAMPLE_MOMENTS, query });
      if (f?.error) throw new Error(f.error);
      setFound(f);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        kicker="MarketWar AI Video War Room"
        title="Turn one idea into global video campaigns"
        subtitle="Creation, editing, captions, translation, avatars, branding, repurposing and campaign launch — video as a weapon, not a file. Every asset ships with a tracked CTA into a channel you own."
        actions={<Pill tone="info">{renderLive ? "video render live (Veo / Sora)" : "video rendering coming soon"}</Pill>}
      />

      {/* Honesty legend — what computes real output today vs what needs the render farm */}
      <div className="mb-8 card border-white/[0.08] p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-400">
          <span className="font-display font-bold text-white">What&apos;s real today:</span>
          <span className="flex items-center gap-1.5"><StatusChip status="live" /> computes real output now (deterministic in demo; full quality with keys)</span>
          <span className="flex items-center gap-1.5"><StatusChip status="p1" /> scaffolded — activates with the render / capture farm</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          The clip-intelligence brain — genre detection, moment ranking, 8-dimension commercial scoring and natural-language
          moment search — runs live in the <span className="text-emerald-300">Clip Intelligence Lab</span> below, and the 7 agent
          tabs generate real scripts, hooks, captions and packaging.{" "}
          {renderLive
            ? <>Video rendering (Veo / Sora), publishing and hosting are <span className="text-emerald-300">Live now</span> — render + publish in the panel below. Avatars, audio, screen capture and the editor timeline remain <span className="text-amber-300">Coming soon</span>.</>
            : <>Rendering video/avatars/audio and screen capture flip to <span className="text-emerald-300">Live now</span> as their model keys are set.</>}
        </p>
      </div>

      {/* Studio grid — each honestly badged live vs P1 (health-driven) */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {STUDIO.map((s) => {
          const st = effStatus(s);
          return (
          <div key={s.title} className="card p-4 transition hover:border-emerald-500/40">
            <div className="mb-2.5 flex items-center justify-between">
              <s.icon className="h-5 w-5 text-emerald-400" />
              <StatusChip status={st} />
            </div>
            <h3 className="font-display text-sm font-bold text-white">{s.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{s.desc}</p>
            <p className={`mt-2 text-[11px] font-medium ${st === "live" ? "text-emerald-300/80" : "text-amber-300/80"}`}>{effNote(s)}</p>
          </div>
          );
        })}
      </div>

      {/* LIVE video render + publish — render an MP4 and attach it to a post */}
      <VideoRenderAndPublish />

      {/* LIVE Clip Intelligence Lab — wired to the real VideoDominance engine */}
      <div className="mb-8 card border-emerald-500/30 p-6">
        <div className="mb-1 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-emerald-400" />
          <h2 className="font-display text-lg font-bold text-white">Clip Intelligence Lab</h2>
          <StatusChip status="live" />
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Genre detection → moment ranking → 8 separate commercial scores (reach/ad/engagement/retention/lead/conversion/
          brand-safety/profitability), never one vanity number. Computed live by the engine; the sample timeline is ranked and
          searched — moments are never fabricated.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Video title</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="label">Transcript / description</label>
            <input className="input" value={transcript} onChange={(e) => setTranscript(e.target.value)} />
          </div>
        </div>
        <button className="btn-primary mt-4" onClick={runLab} disabled={busy}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Analysing…</> : <><Sparkles className="h-4 w-4" /> Detect genre, rank & score moments</>}
        </button>
        {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}

        {genre && ranked && clip && (
          <div className="mt-6 space-y-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="Detected genre" value={pretty(genre.genre)} tone="good" sub={`${genre.confidence}% · runner-up ${pretty(genre.runnerUp)}`} />
              <StatCard label="Candidate moments" value={`${ranked.length}`} sub="ranked by momentScore" />
              <StatCard label="Top clip" value={clip.headline} sub={`clip ${clip.clipId}`} />
            </div>

            {/* Ranked moments */}
            <div className="card p-4">
              <h3 className="mb-3 font-display text-sm font-bold text-white">Ranked moments</h3>
              <div className="space-y-2">
                {ranked.map((m) => (
                  <div key={m.id} className="rounded-lg border border-white/[0.06] bg-ink-900/50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs text-slate-500">{fmt(m.startSec)}–{fmt(m.endSec)}</span>
                      <Pill tone={m.momentScore >= 70 ? "good" : m.momentScore >= 55 ? "warn" : "neutral"}>score {m.momentScore}</Pill>
                    </div>
                    {m.transcript && <p className="mt-1 text-sm text-slate-200">&ldquo;{m.transcript}&rdquo;</p>}
                    {m.reasons.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {m.reasons.map((r, i) => <span key={i} className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">{r}</span>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 8-dimension virality scoring */}
            <div className="card p-4">
              <h3 className="mb-1 font-display text-sm font-bold text-white">Multi-dimensional virality scoring — clip {clip.clipId}</h3>
              <p className="mb-3 text-xs text-slate-500">{clip.note}</p>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {clip.scores.map((d) => <ScoreBar key={d.dimension} label={pretty(d.dimension)} score={d.score} />)}
              </div>
            </div>
          </div>
        )}

        {/* NL moment search */}
        <div className="mt-6 border-t border-white/[0.06] pt-5">
          <div className="mb-1 flex items-center gap-2">
            <Search className="h-4 w-4 text-emerald-400" />
            <h3 className="font-display text-sm font-bold text-white">Find moments — natural language</h3>
            <StatusChip status="live" />
          </div>
          <p className="mb-3 text-xs text-slate-500">Search the sample timeline in plain language. Each result is timestamped with transcript evidence.</p>
          <div className="flex flex-wrap gap-2">
            <input className="input flex-1" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. every moment a customer talks about results" />
            <button className="btn-primary" onClick={runFind} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Find
            </button>
          </div>
          {found && (
            <div className="mt-4">
              <p className="mb-2 text-xs text-slate-500">{found.note}</p>
              <div className="space-y-2">
                {found.results.map((m) => (
                  <div key={m.id} className="rounded-lg border border-white/[0.06] bg-ink-900/50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs text-slate-500">{fmt(m.startSec)}–{fmt(m.endSec)}</span>
                      <Pill tone={m.momentScore >= 70 ? "good" : "warn"}>score {m.momentScore}</Pill>
                    </div>
                    {m.transcript && <p className="mt-1 text-sm text-slate-200">&ldquo;{m.transcript}&rdquo;</p>}
                    <p className="mt-1 text-[11px] text-emerald-300/80">match: {m.matchReason}</p>
                  </div>
                ))}
                {found.results.length === 0 && <p className="text-sm text-slate-500">No matching moments in the sample timeline for that query.</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 7 real agent tabs */}
      <div className="mb-4 flex items-center gap-2">
        <Clapperboard className="h-4 w-4 text-emerald-400" />
        <h2 className="font-display text-lg font-bold text-white">Campaign agents</h2>
        <StatusChip status="live" />
      </div>
      <div className="mb-6 flex flex-wrap gap-2 border-b border-ink-700">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              tab === t.key
                ? "border-emerald-500 text-emerald-300"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "video" && (
        <AgentRunner
          agentId="video-commander"
          buttonLabel="Generate campaign video package"
          fields={[
            { key: "business", label: "Business", defaultValue: "Your business" },
            { key: "product", label: "Product / offer", defaultValue: "Family platter — feed 4 for £25, Fridays only" },
            { key: "location", label: "Target location", defaultValue: "Your location" },
            { key: "audience", label: "Target audience", defaultValue: "Local families and young professionals, evening scrollers", textarea: true },
            { key: "goal", label: "Campaign goal", defaultValue: "WhatsApp orders" },
          ]}
        />
      )}
      {tab === "hooks" && (
        <AgentRunner
          agentId="viral-hook"
          buttonLabel="Generate & rank hooks"
          fields={[
            { key: "business", label: "Business", defaultValue: "Your business" },
            { key: "location", label: "Market", defaultValue: "Your location" },
            { key: "concept", label: "Video concept", defaultValue: "Friday family platter — £25 feeds 4, kitchen caps at 40, hot in 20 minutes or free", textarea: true },
            { key: "audience", label: "Audience", defaultValue: "Local families, evening scrollers on TikTok/Reels" },
          ]}
        />
      )}
      {tab === "funnel" && (
        <AgentRunner
          agentId="funnel-video-builder"
          buttonLabel="Build the 8-video funnel"
          fields={[
            { key: "business", label: "Business", defaultValue: "Your business" },
            { key: "location", label: "Market", defaultValue: "Your location" },
            { key: "product", label: "Product / offer", defaultValue: "Family platter — feed 4 for £25, Fridays only" },
            { key: "goal", label: "Funnel goal", defaultValue: "WhatsApp orders" },
          ]}
        />
      )}
      {tab === "compliance" && (
        <AgentRunner
          agentId="video-compliance"
          buttonLabel="Run compliance scan"
          fields={[
            { key: "business", label: "Business", defaultValue: "Your business" },
            { key: "platforms", label: "Where it will run", defaultValue: "Meta ads, TikTok ads, organic TikTok" },
            { key: "script", label: "Script / creative description", defaultValue: "Hot in 20 minutes or it's free. The best grill in South London. Uses trending TikTok audio. Shows a customer testimonial at the door.", textarea: true },
          ]}
        />
      )}
      {tab === "packaging" && (
        <AgentRunner
          agentId="thumbnail-title"
          buttonLabel="Generate packaging kit"
          fields={[
            { key: "business", label: "Business", defaultValue: "Your business" },
            { key: "location", label: "Market", defaultValue: "Your location" },
            { key: "video", label: "Video summary", defaultValue: "20s ad: Friday family platter £25 feeds 4, live 40-platter counter, WhatsApp ordering", textarea: true },
          ]}
        />
      )}
      {tab === "captions" && (
        <AgentRunner
          agentId="caption-engine"
          buttonLabel="Generate captions"
          fields={[
            { key: "business", label: "Business", defaultValue: "Your business" },
            { key: "mode", label: "Caption mode (Sales / Education / Viral / Brand)", defaultValue: "Viral" },
            { key: "script", label: "Video script or transcript", defaultValue: "It's Friday. Feed 4 for £25. Hot at your door in 20 minutes or it's free. Kitchen caps at 40 platters. Tap to order on WhatsApp.", textarea: true },
          ]}
        />
      )}
      {tab === "global" && (
        <AgentRunner
          agentId="global-reach"
          buttonLabel="Build localisation plan"
          fields={[
            { key: "business", label: "Business", defaultValue: "Your business" },
            { key: "location", label: "Home market", defaultValue: "Your location" },
            { key: "languages", label: "Target languages", defaultValue: "English, French, Lingala, Portuguese, Arabic" },
            { key: "script", label: "Master script (short)", defaultValue: "It's Friday. Feed 4 for £25. Hot in 20 minutes or it's free. Order on WhatsApp before 7pm.", textarea: true },
          ]}
        />
      )}
    </div>
  );
}
