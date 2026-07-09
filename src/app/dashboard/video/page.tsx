"use client";

import { useState } from "react";
import {
  Captions,
  Clapperboard,
  Globe2,
  Layers,
  Mic,
  MonitorPlay,
  Palette,
  Scissors,
  UserSquare2,
  Users2,
} from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import { PageHeader, Pill } from "@/components/ui";

const STUDIO = [
  { icon: Clapperboard, title: "AI Video Generator", desc: "Prompt/script/product-demo/explainer/testimonial/ad/avatar/image/PPT-to-video — one-click campaign videos with platform versions." },
  { icon: Scissors, title: "Online Video Editor", desc: "Cut, trim, split, crop, resize, merge, text, logos, overlays, transitions, effects, speed, blur/censor, multi-format export." },
  { icon: Captions, title: "Subtitle & Caption Engine", desc: "Auto-subtitles, karaoke captions, word highlights, SRT/VTT, burned-in, multi-language — in Sales/Education/Viral/Brand modes." },
  { icon: Globe2, title: "Translation & Dubbing", desc: "Subtitle + voice translation, AI dubbing, voice cloning — one video in 10–50 languages with localised CTAs." },
  { icon: UserSquare2, title: "AI Avatar Studio", desc: "Talking-head presenters: business, teacher, professional and influencer avatars — a branded company spokesperson in any language." },
  { icon: Mic, title: "Audio Studio", desc: "TTS, voiceovers, voice cloning, noise removal, audio enhancement — Perfect Voice, Ad Voice and Course Voice agents." },
  { icon: MonitorPlay, title: "Screen & Presentation Recorder", desc: "Screen/webcam/slides with teleprompter — auto-turned into demos, training modules, social clips and help-centre videos." },
  { icon: Layers, title: "Repurposing Engine", desc: "1 long video → 10 TikToks, 10 Reels, 10 Shorts, 5 LinkedIn clips, 5 Facebook ads, 1 blog, 1 email campaign, 1 landing-page script." },
  { icon: Palette, title: "Brand Kit", desc: "Logo colour auto-detection, fonts, intros/outros, watermarks — the Brand Guardian rejects off-brand visuals at generation time." },
  { icon: Users2, title: "Collaboration & Approvals", desc: "Team workspace, versions, client approval portal (Approve/Reject/Request Change), creator→editor→manager→client→publish." },
];

const TABS = [
  { key: "video", label: "Campaign Video" },
  { key: "captions", label: "Caption Engine" },
  { key: "global", label: "Global Reach" },
] as const;

export default function VideoWarRoomPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("video");

  return (
    <div>
      <PageHeader
        kicker="MarketWar AI Video War Room"
        title="Turn one idea into global video campaigns"
        subtitle="Creation, editing, captions, translation, avatars, branding, repurposing and campaign launch — video as a weapon, not a file. Every asset ships with a tracked CTA into a channel you own."
        actions={<Pill tone="info">Module M-31 · rendering farm lands on Cloud Run (P2)</Pill>}
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {STUDIO.map((s) => (
          <div key={s.title} className="card p-4 transition hover:border-emerald-500/40">
            <s.icon className="mb-2.5 h-5 w-5 text-emerald-400" />
            <h3 className="font-display text-sm font-bold text-white">{s.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{s.desc}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 flex gap-2 border-b border-ink-700">
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
            { key: "business", label: "Business", defaultValue: "Brixton Grill House" },
            { key: "product", label: "Product / offer", defaultValue: "Family platter — feed 4 for £25, Fridays only" },
            { key: "location", label: "Target location", defaultValue: "Brixton, London" },
            { key: "audience", label: "Target audience", defaultValue: "Local families and young professionals, evening scrollers", textarea: true },
            { key: "goal", label: "Campaign goal", defaultValue: "WhatsApp orders" },
          ]}
        />
      )}
      {tab === "captions" && (
        <AgentRunner
          agentId="caption-engine"
          buttonLabel="Generate captions"
          fields={[
            { key: "business", label: "Business", defaultValue: "Brixton Grill House" },
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
            { key: "business", label: "Business", defaultValue: "Brixton Grill House" },
            { key: "location", label: "Home market", defaultValue: "Brixton, London" },
            { key: "languages", label: "Target languages", defaultValue: "English, French, Lingala, Portuguese, Arabic" },
            { key: "script", label: "Master script (short)", defaultValue: "It's Friday. Feed 4 for £25. Hot in 20 minutes or it's free. Order on WhatsApp before 7pm.", textarea: true },
          ]}
        />
      )}
    </div>
  );
}
