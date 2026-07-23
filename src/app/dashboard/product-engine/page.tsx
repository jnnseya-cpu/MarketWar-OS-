"use client";

// M-32 AI Viral Product Engine (Agent 21) — product images in, complete
// campaign out. Spec: docs/ai-os/10-viral-product-and-website-engines.md
// Part A. The conversational core runs through the gateway now; the vision
// upload pipeline (1-100 images via Cloud Tasks) lands with connectors (P1).
//
// Honesty rule (owner directive): every capability on this page is badged
// LIVE (produces real output today, demo-deterministic and live with keys) or
// P1 (scaffolded, activates with the vision/render/publish pipeline). Nothing
// is presented as working when it is not — that protects the brand with testers.

import { useEffect, useState } from "react";
import {
  BadgePercent,
  Camera,
  CheckCircle2,
  Clapperboard,
  Clock,
  Image as ImageIcon,
  LineChart,
  Megaphone,
  PenLine,
  Rocket,
  Send,
  UploadCloud,
} from "lucide-react";
import GenerateAndPublish from "@/components/GenerateAndPublish";
import VisualStrikeHooks from "@/components/VisualStrikeHooks";
import VideoRenderAndPublish from "@/components/VideoRenderAndPublish";
import BrandAssetUploader from "@/components/BrandAssetUploader";
import { PageHeader, Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";

type Status = "live" | "p1";
// A capability gated on a real provider key — its chip flips to "Live now" the
// moment the key is present (read from the no-spend /api/health/live probe), so
// the label always tells the truth about what this deployment can actually do.
type Cap = "image" | "video" | "publish";

// Map the health-probe capability names → our gate keys.
const CAP_LABELS: Record<Cap, string> = {
  image: "Photoreal image backgrounds",
  video: "Video render (Veo/Sora)",
  publish: "Social publishing (Zernio, 15 channels)",
};

// Small honest status chip used across every capability on the page.
function StatusChip({ status }: { status: Status }) {
  return status === "live" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
      <CheckCircle2 className="h-3 w-3" /> Live now
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
      <Clock className="h-3 w-3" /> Coming at P1
    </span>
  );
}

const ANALYSIS_ATTRS = [
  "Product type", "Brand", "Colours", "Materials", "Style", "Audience",
  "Price positioning", "Competitors", "Benefits", "Emotional triggers",
  "Luxury vs budget", "Weaknesses", "Viral opportunities", "Seasonal plays",
  "Gift potential", "Target countries", "Market trends", "Pain points solved",
];

const GUARANTEES: { title: string; desc: string; status: Status }[] = [
  { title: "Product Identity Lock™", status: "live", desc: "Shape, colour, logo, packaging, text and proportions are locked before any generation — ads never misrepresent the real product. Exact preservation is mandatory for regulated products." },
  { title: "Viral Potential Score™", status: "live", desc: "Every concept scored 0–100 across 15 dimensions (stopping power → purchase intent) with explained reasons — plus a separate Commercial Potential Score so views are never confused with profit." },
  { title: "Hook Laboratory™", status: "live", desc: "130+ scored hooks per product (13 families × 10), each deception-checked — visual, spoken, text, curiosity, pain, comparison, objection, urgency, community, conversion, authority, social-proof and transformation. Deceptive clickbait is detected and blocked." },
  { title: "Autonomous test loop", status: "p1", desc: "19-variable testing matrix: publish variants → find winners → kill waste → recombine → attribute revenue → store learnings in Creative Intelligence Memory. The scoring + optimisation brain is live; the closed publish-and-measure loop activates with channel connectors at P1." },
];

// Each studio: what it produces TODAY. Key-gated studios carry a `cap` and a
// `liveNote`; their chip + note flip to Live the moment the provider key is set.
type Studio = { icon: typeof Megaphone; title: string; desc: string; status: Status; note: string; cap?: Cap; liveNote?: string };
const STUDIOS: Studio[] = [
  { icon: Megaphone, title: "Viral Social Posts", status: "live", note: "Copy generated live by the engine.", desc: "Platform-optimised posts for Facebook, Instagram, TikTok, X, LinkedIn, Pinterest, Threads, Snapchat and Reddit — captions, hooks, CTAs, hashtags, emojis, native formatting." },
  { icon: PenLine, title: "AI Copy Studio", status: "live", note: "Full copy generated live.", desc: "Product descriptions, Amazon/Shopify listings, SEO copy, landing pages, blogs, email/SMS/WhatsApp campaigns, push notifications, press releases, influencer briefs." },
  { icon: BadgePercent, title: "AI Sales Booster", status: "live", note: "Offers & mechanics generated live.", desc: "Upsells, cross-sells, bundles, scarcity, countdowns, flash sales, loyalty, referral, influencer and giveaway campaigns." },
  { icon: LineChart, title: "AI Market Intelligence", status: "live", note: "Analysis generated live.", desc: "Competitor positioning, pricing recommendations, viral trend predictions, audiences, platforms, posting times, budget, predicted ROAS, purchase-intent score." },
  { icon: ImageIcon, title: "AI Ad Creator", status: "live", cap: "image", note: "Ad concepts + brand-safe creatives live via Brand Studio; photoreal AI renders activate with an image-model key.", liveNote: "Ad concepts + brand-safe creatives + photoreal AI renders — all live.", desc: "Image, carousel, story, Reels, Shorts, display, Google, YouTube, LinkedIn and TikTok ads — built from the product dossier." },
  { icon: Camera, title: "AI Image Studio", status: "p1", cap: "image", note: "Brand-safe SVG creatives render today in Brand Studio; photoreal generation activates with an image-model key.", liveNote: "Photoreal generation is live (gpt-image-1) — renders host to Firebase Storage, ready to attach.", desc: "Lifestyle images, studio renders, seasonal creatives, luxury mockups, before/after, bundles, banners, infographics, cut-outs, AI backgrounds, billboard mockups." },
  { icon: Clapperboard, title: "AI Video Creator", status: "p1", cap: "video", note: "Clip intelligence + scripts live; rendered video needs a video-model + render queue.", liveNote: "Rendered video is live (Veo / Sora) — MP4s render and attach to a post below.", desc: "Product, UGC-style, testimonial, explainer, cinematic and luxury-commercial videos in vertical + landscape — rendered via the Video War Room." },
  { icon: Send, title: "One-Click Publish", status: "p1", cap: "publish", note: "Needs channel connectors (platform approval or an aggregator key).", liveNote: "Publishing is live (Zernio, 15 channels) — connect a brand's socials, then publish. Every post passes the compliance gate + watermark.", desc: "Publish directly to connected channels or export — every asset passes the compliance gate and carries the AI-content watermark." },
];

export default function ProductEnginePage() {
  const { activeBrand, updateBrand } = useActiveBrand();
  // Live capability probe — flips key-gated chips (image / video / publish) to
  // "Live now" when the provider key is actually present in this deployment.
  const [caps, setCaps] = useState<Record<Cap, boolean>>({ image: false, video: false, publish: false });
  useEffect(() => {
    let on = true;
    fetch("/api/health/live")
      .then((r) => r.json())
      .then((d) => {
        if (!on || !Array.isArray(d?.capabilities)) return;
        const ready = (label: string) => Boolean(d.capabilities.find((c: { capability: string; ready: boolean }) => c.capability === label)?.ready);
        setCaps({ image: ready(CAP_LABELS.image), video: ready(CAP_LABELS.video), publish: ready(CAP_LABELS.publish) });
      })
      .catch(() => {});
    return () => { on = false; };
  }, []);

  const effStatus = (s: Studio): Status => (s.cap ? (caps[s.cap] ? "live" : "p1") : s.status);
  const effNote = (s: Studio): string => (s.cap && caps[s.cap] && s.liveNote ? s.liveNote : s.note);
  const renderLive = caps.image && caps.video;

  return (
    <div>
      <PageHeader
        kicker="MarketWar VisualStrike AI™"
        title="Upload one product picture. Launch a viral campaign factory."
        subtitle="Not an image tool — an autonomous factory that researches, creates, tests, publishes, learns and optimises. Product Identity Lock™ guarantees the ads always show the real product; Viral + Commercial Potential Scores make sure attention turns into revenue, not empty views."
        actions={<Pill tone="info">{renderLive ? "Module M-32 · Agent 21 · render + publish live" : "Module M-32 · Agent 21 · vision pipeline lands at P1"}</Pill>}
      />

      {/* Honesty legend — what produces real output today vs what's coming at P1 */}
      <div className="mb-8 card border-white/[0.08] p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-400">
          <span className="font-display font-bold text-white">What&apos;s real today:</span>
          <span className="flex items-center gap-1.5"><StatusChip status="live" /> produces real output now (demo-deterministic; full quality with keys)</span>
          <span className="flex items-center gap-1.5"><StatusChip status="p1" /> scaffolded — activates with the vision / render / publish pipeline</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          The intelligence — identity lock, 15-dimension viral + commercial scoring, 130+ deception-checked hooks, 27 angle
          families, dossier and full campaign copy — runs live right now.{" "}
          {renderLive
            ? <>Photoreal image + video rendering and one-click publishing are <span className="text-emerald-300">Live now</span> too — the chips below reflect exactly what this deployment can do.</>
            : <>Rendering photoreal images/video and auto-publishing to channels flip to <span className="text-emerald-300">Live now</span> the moment their keys are set — the chips below always reflect this deployment&apos;s real capability.</>}
        </p>
      </div>

      {/* v2 factory guarantees */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {GUARANTEES.map((c) => (
          <div key={c.title} className="card border-emerald-500/20 p-4">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-bold text-emerald-300">{c.title}</h3>
              <StatusChip status={c.status} />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{c.desc}</p>
          </div>
        ))}
      </div>

      {/* Upload zone — REAL product-image upload (hosted); vision auto-extraction still P1 */}
      <div className="mb-8 card p-6">
        <div className="mb-2 flex items-center gap-2">
          <UploadCloud className="h-5 w-5 text-emerald-400" />
          <p className="font-display font-bold text-white">Your product image</p>
          <StatusChip status="live" />
        </div>
        <p className="mb-4 max-w-2xl text-xs text-slate-500">
          Upload your product photo / packaging / logo — it&apos;s hosted on your brand and used as the base + Identity-Lock
          reference for every creative. <span className="text-amber-300">Auto-reading the 18 attributes below from the image
          (vision) is still P1</span> — for now, fill them in the description field and the engine produces the full dossier + campaign live.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <BrandAssetUploader
            brandId={activeBrand?.id} assetType="product_image" label="Product image" accept="image/png,image/jpeg,image/webp"
            currentUrl={activeBrand?.productImageUrl}
            onUploaded={(url) => activeBrand && updateBrand(activeBrand.id, { productImageUrl: url })}
            onClear={() => activeBrand && updateBrand(activeBrand.id, { productImageUrl: undefined })}
          />
          <BrandAssetUploader
            brandId={activeBrand?.id} assetType="logo" label="Logo" accept="image/png,image/jpeg,image/webp,image/svg+xml"
            currentUrl={activeBrand?.logoUrl}
            onUploaded={(url) => activeBrand && updateBrand(activeBrand.id, { logoUrl: url })}
            onClear={() => activeBrand && updateBrand(activeBrand.id, { logoUrl: undefined })}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {ANALYSIS_ATTRS.map((a) => (
            <span key={a} className="rounded-full bg-ink-850 px-2.5 py-1 text-[10px] font-semibold text-slate-400">{a}</span>
          ))}
          {["Visual Quality /100", "Conversion /100", "Trust /100"].map((s) => (
            <span key={s} className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-400">{s}</span>
          ))}
        </div>
      </div>

      {/* Studios grid — each honestly badged */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STUDIOS.map((s) => {
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

      {/* One-click campaign modes */}
      <div className="mb-8 card p-5">
        <div className="mb-1 flex items-center gap-2">
          <h2 className="font-display font-bold text-white">One-click campaign modes</h2>
          <StatusChip status="live" />
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Eight pre-built strategies — from a 7-day Viral Sprint to Always-On Autopilot inside your approved budget
          and brand rules. High-risk categories stay at draft/approval levels. The engine builds each mode&apos;s plan + assets
          live; automated cross-channel execution activates with connectors (P1).
        </p>
        <div className="flex flex-wrap gap-1.5">
          {["Launch Blitz", "Viral Sprint", "Sales Conversion", "Product Education", "Marketplace Domination", "Local Business Push", "Seasonal Takeover", "Always-On Autopilot"].map((m) => (
            <span key={m} className="rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-400">
              {m}
            </span>
          ))}
        </div>
      </div>

      {/* Hook Lab — generate the 130-hook library and publish a chosen hook */}
      <VisualStrikeHooks />

      {/* AI Video Creator — render a video and attach it to a post */}
      <VideoRenderAndPublish />

      <div className="mb-4 flex items-center gap-2">
        <Rocket className="h-4 w-4 text-emerald-400" />
        <h2 className="font-display text-lg font-bold text-white">Run the engine</h2>
        <StatusChip status="live" />
      </div>
      <GenerateAndPublish
        agentId="viral-product-engine"
        buttonLabel="Build dossier + full campaign"
        publishSourceLabel="campaign copy"
        fields={[
          { key: "business", label: "Business / brand", defaultValue: "Your business" },
          { key: "location", label: "Target market", defaultValue: "Your location" },
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
