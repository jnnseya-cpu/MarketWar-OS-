"use client";

// M-32 AI Viral Product Engine (Agent 21) — product images in, complete
// campaign out. Spec: docs/ai-os/10-viral-product-and-website-engines.md
// Part A. The conversational core runs through the gateway now; the vision
// upload pipeline (1-100 images via Cloud Tasks) lands with connectors (P1).

import {
  BadgePercent,
  Camera,
  Clapperboard,
  Image as ImageIcon,
  LineChart,
  Megaphone,
  PenLine,
  Rocket,
  Send,
  UploadCloud,
} from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import { PageHeader, Pill } from "@/components/ui";

const ANALYSIS_ATTRS = [
  "Product type", "Brand", "Colours", "Materials", "Style", "Audience",
  "Price positioning", "Competitors", "Benefits", "Emotional triggers",
  "Luxury vs budget", "Weaknesses", "Viral opportunities", "Seasonal plays",
  "Gift potential", "Target countries", "Market trends", "Pain points solved",
];

const STUDIOS = [
  { icon: Megaphone, title: "Viral Social Posts", desc: "Platform-optimised posts for Facebook, Instagram, TikTok, X, LinkedIn, Pinterest, Threads, Snapchat and Reddit — captions, hooks, CTAs, hashtags, emojis, native formatting." },
  { icon: ImageIcon, title: "AI Ad Creator", desc: "Image, carousel, story, Reels, Shorts, display, Google, YouTube, LinkedIn and TikTok ads — built from the product dossier." },
  { icon: Clapperboard, title: "AI Video Creator", desc: "Product, UGC-style, testimonial, explainer, cinematic and luxury-commercial videos in vertical + landscape — rendered via the Video War Room." },
  { icon: PenLine, title: "AI Copy Studio", desc: "Product descriptions, Amazon/Shopify listings, SEO copy, landing pages, blogs, email/SMS/WhatsApp campaigns, push notifications, press releases, influencer briefs." },
  { icon: Camera, title: "AI Image Studio", desc: "Lifestyle images, studio renders, seasonal creatives, luxury mockups, before/after, bundles, banners, infographics, cut-outs, AI backgrounds, billboard mockups." },
  { icon: BadgePercent, title: "AI Sales Booster", desc: "Upsells, cross-sells, bundles, scarcity, countdowns, flash sales, loyalty, referral, influencer and giveaway campaigns." },
  { icon: LineChart, title: "AI Market Intelligence", desc: "Competitor positioning, pricing recommendations, viral trend predictions, audiences, platforms, posting times, budget, predicted ROAS, purchase-intent score." },
  { icon: Send, title: "One-Click Publish", desc: "Publish directly to connected channels or export — every asset passes the compliance gate and carries the AI-content watermark." },
];

export default function ProductEnginePage() {
  return (
    <div>
      <PageHeader
        kicker="AI Viral Product Engine"
        title="One product image. A complete campaign."
        subtitle="Upload product photos, packaging or marketplace listings — the engine builds the full dossier (18 attributes + Visual Quality, Conversion and Trust scores), then one click creates posts, ads, videos, copy, images, sales boosters and market intelligence."
        actions={<Pill tone="info">Module M-32 · Agent 21 · image upload pipeline lands at P1</Pill>}
      />

      {/* Upload zone (demo) */}
      <div className="mb-8 card flex flex-col items-center justify-center border-dashed p-8 text-center">
        <UploadCloud className="mb-2 h-8 w-8 text-emerald-400" />
        <p className="font-display font-bold text-white">Drop 1–100 product images</p>
        <p className="mt-1 max-w-xl text-xs text-slate-500">
          Product photos · lifestyle shots · packaging · logos · screenshots · Amazon, Etsy, Shopify and marketplace
          listings. Demo mode: describe your product below and the engine runs on the description — vision upload
          connects with the P1 pipeline.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
          {ANALYSIS_ATTRS.map((a) => (
            <span key={a} className="rounded-full bg-ink-850 px-2.5 py-1 text-[10px] font-semibold text-slate-400">
              {a}
            </span>
          ))}
          {["Visual Quality /100", "Conversion /100", "Trust /100"].map((s) => (
            <span key={s} className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-400">
              {s}
            </span>
          ))}
        </div>
      </div>

      {/* Studios grid */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STUDIOS.map((s) => (
          <div key={s.title} className="card p-4 transition hover:border-emerald-500/40">
            <s.icon className="mb-2.5 h-5 w-5 text-emerald-400" />
            <h3 className="font-display text-sm font-bold text-white">{s.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{s.desc}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex items-center gap-2">
        <Rocket className="h-4 w-4 text-emerald-400" />
        <h2 className="font-display text-lg font-bold text-white">Run the engine</h2>
      </div>
      <AgentRunner
        agentId="viral-product-engine"
        buttonLabel="Build dossier + full campaign"
        fields={[
          { key: "business", label: "Business / brand", defaultValue: "Brixton Grill House" },
          { key: "location", label: "Target market", defaultValue: "Brixton, London" },
          {
            key: "product",
            label: "Product (describe the image you'd upload)",
            defaultValue:
              "Hero photo of the £25 flame-grilled family platter — char-grilled chicken, sides, flatbreads on a dark board, flames visible behind",
            textarea: true,
          },
          { key: "channels", label: "Channels you can publish to", defaultValue: "Instagram, TikTok, Facebook, WhatsApp, email list" },
        ]}
      />
    </div>
  );
}
