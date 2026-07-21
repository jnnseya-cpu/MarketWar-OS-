"use client";

// AI Visual Creation Engine — the Brand Studio command surface.
// Generates brand-safe ad creatives through the multi-provider image gateway
// (/api/image). Zero-config: the Demo Composer renders real SVG creatives; live
// providers (Gemini Nano Banana 2/Pro, GPT Image 2, FLUX.2) activate with keys.
// Every creative uses the logo colour theme — never generic / off-brand.

import { useEffect, useState } from "react";
import { Loader2, Image as ImageIcon, Palette, Layers, ShieldCheck, Upload } from "lucide-react";
import GenerateAndPublish from "@/components/GenerateAndPublish";
import PublishToChannels from "@/components/PublishToChannels";
import { PageHeader, Pill, StatCard } from "@/components/ui";
import {
  DEFAULT_CREATIVE_OPTIONS, type CreativeOptions, type PlatformFormat, type LogoPosition,
  type ImageQuality, type BrandTheme, type AssetType,
} from "@/shared/creative";

type Variant = {
  imageUrl: string; provider: string; model: string; mode: string;
  width: number; height: number; format: string; brandTheme: BrandTheme;
  brandSafe: boolean; variantIndex: number;
  cost: { providerUsd: number; retailGbp: number; acus: number; marginMultiplier: number; breakdown: string[] };
  notes: string[];
};
type ProviderStatus = { id: string; label: string; model: string; tier: string; vendor: string; configured: boolean; openWeight: boolean };

const FORMATS: PlatformFormat[] = ["facebook", "instagram", "tiktok", "linkedin", "whatsapp", "story", "reel", "banner"];
const POSITIONS: LogoPosition[] = ["top-left", "top-right", "bottom-left", "bottom-right", "centre", "watermark"];
const QUALITIES: ImageQuality[] = ["draft", "standard", "premium", "edit", "bulk"];
const ASSET_TYPES: AssetType[] = [
  "logo", "product_image", "service_image", "team_image", "customer_image", "venue_image",
  "before_after_image", "testimonial_video", "promo_video", "event_video", "existing_ad", "background_image", "brand_pattern",
];

export default function StudioPage() {
  const [business, setBusiness] = useState("Brixton Grill House");
  const [headline, setHeadline] = useState("Hungry tonight? Order direct.");
  const [offerText, setOfferText] = useState("20% OFF your first order — today only");
  const [cta, setCta] = useState("Order on WhatsApp");
  const [quality, setQuality] = useState<ImageQuality>("standard");
  const [variantCount, setVariantCount] = useState(3);
  const [options, setOptions] = useState<CreativeOptions>(DEFAULT_CREATIVE_OPTIONS);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const [publishIdx, setPublishIdx] = useState(0);

  useEffect(() => {
    fetch("/api/image").then((r) => r.json()).then((d) => setProviders(d.providers || [])).catch(() => {});
  }, []);

  const opt = <K extends keyof CreativeOptions>(k: K, v: CreativeOptions[K]) => setOptions((o) => ({ ...o, [k]: v }));

  async function generate() {
    setBusy(true);
    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", business, headline, offerText, cta, quality, variants: variantCount, options }),
      });
      const data = await res.json();
      setVariants(data.variants || []);
      setPublishIdx(0);
    } finally {
      setBusy(false);
    }
  }

  const theme = variants[0]?.brandTheme;
  const totalAcus = variants.reduce((a, v) => a + (v.cost?.acus || 0), 0);

  return (
    <div>
      <PageHeader
        kicker="AI Visual Creation Engine · Brand Studio"
        title="Brand-safe ad creative — never generic, always on-brand"
        subtitle="Upload your logo and assets once; the OS extracts your colour theme and generates logo-aware, platform-specific ad variants through a multi-provider image gateway. The original logo is overlaid without distortion and all text is rendered exactly — no model spelling errors."
        actions={<Pill tone="info">Gemini Nano Banana · GPT Image 2 · FLUX.2 · demo-safe</Pill>}
      />

      {/* Brand Asset Library */}
      <div className="mb-8 card p-6">
        <div className="mb-3 flex items-center gap-2">
          <Upload className="h-5 w-5 text-emerald-400" />
          <h2 className="font-display text-lg font-bold text-white">Brand Asset Library</h2>
          <Pill tone="neutral">reused across every campaign</Pill>
        </div>
        <p className="mb-4 text-sm text-slate-400">Upload once, reuse everywhere. Customer/team/testimonial media needs usage-rights confirmation before paid distribution. Live upload + Firebase storage activate at go-live; the schema (`brand_assets`) is wired.</p>
        <div className="flex flex-wrap gap-2">
          {ASSET_TYPES.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-lg border border-white/[0.07] bg-ink-900/50 px-2.5 py-1.5 text-xs text-slate-300">
              {t.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      </div>

      {/* Creative options */}
      <div className="mb-8 card border-emerald-500/30 p-6">
        <div className="mb-4 flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-emerald-400" />
          <h2 className="font-display text-lg font-bold text-white">Create a creative</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Business</label><input className="input" value={business} onChange={(e) => setBusiness(e.target.value)} /></div>
          <div><label className="label">Headline (rendered exactly)</label><input className="input" value={headline} onChange={(e) => setHeadline(e.target.value)} /></div>
          <div><label className="label">Offer text</label><input className="input" value={offerText} onChange={(e) => setOfferText(e.target.value)} /></div>
          <div><label className="label">CTA</label><input className="input" value={cta} onChange={(e) => setCta(e.target.value)} /></div>
          <div>
            <label className="label">Platform format</label>
            <select className="input" value={options.platformFormat} onChange={(e) => opt("platformFormat", e.target.value as PlatformFormat)}>
              {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Logo position</label>
            <select className="input" value={options.logoPosition} onChange={(e) => opt("logoPosition", e.target.value as LogoPosition)}>
              {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Quality tier</label>
            <select className="input" value={quality} onChange={(e) => setQuality(e.target.value as ImageQuality)}>
              {QUALITIES.map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Variants ({variantCount})</label>
            <input className="input" type="range" min={1} max={6} value={variantCount} onChange={(e) => setVariantCount(Number(e.target.value))} />
          </div>
        </div>

        {/* toggles */}
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {([
            ["useLogo", "Use my logo"], ["useBrandColours", "Use my brand colours"], ["useProductPhoto", "Use uploaded product photo"],
            ["useUploadedBase", "Use uploaded photo/video as base"], ["generateNewBackground", "Generate new AI background"],
            ["addCtaButton", "Add CTA button"], ["addOfferText", "Add offer text"],
          ] as [keyof CreativeOptions, string][]).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={Boolean(options[k])} onChange={(e) => opt(k, e.target.checked as never)} className="accent-emerald-500" />
              {label}
            </label>
          ))}
        </div>

        <button className="btn-primary mt-5" onClick={generate} disabled={busy}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating brand-safe variants…</> : <><ImageIcon className="h-4 w-4" /> Generate creatives</>}
        </button>
      </div>

      {/* Brand theme + cost */}
      {theme && (
        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <div className="card p-6">
            <div className="mb-3 flex items-center gap-2"><Palette className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Brand theme</h3><Pill tone={theme.source === "logo" ? "good" : "neutral"}>{theme.source === "logo" ? "extracted from logo" : "derived"}</Pill></div>
            <div className="flex flex-wrap gap-3">
              {([["primary", theme.primary], ["secondary", theme.secondary], ["accent", theme.accent], ["background", theme.backgroundSafe], ["text", theme.textSafe], ["CTA", theme.cta]] as const).map(([name, hex]) => (
                <div key={name} className="text-center">
                  <div className="h-12 w-12 rounded-lg border border-white/10" style={{ background: hex }} />
                  <p className="mt-1 text-[10px] text-slate-400">{name}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="card p-6">
            <div className="mb-3 flex items-center gap-2"><Layers className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Cost & ACUs</h3></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="Variants" value={`${variants.length}`} />
              <StatCard label="Total ACUs" value={`${totalAcus}`} tone="warn" sub={`≈ £${(totalAcus / 100).toFixed(2)}`} />
              <StatCard label="Margin" value={`${variants[0]?.cost.marginMultiplier}×`} tone="good" sub="≥ 2× floor" />
            </div>
            <p className="mt-3 text-xs text-slate-500">{variants[0]?.cost.breakdown.join(" · ")}</p>
          </div>
        </div>
      )}

      {/* Variants */}
      {variants.length > 0 && (
        <div className="mb-8">
          <h3 className="mb-3 font-display font-bold text-white">Creative variants <span className="text-xs font-normal text-slate-500">— click one to attach it to a post</span></h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {variants.map((v) => (
              <button key={v.variantIndex} type="button" onClick={() => setPublishIdx(v.variantIndex)} className={`card overflow-hidden p-0 text-left transition ${publishIdx === v.variantIndex ? "ring-2 ring-emerald-500/70" : "hover:ring-1 hover:ring-emerald-500/30"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.imageUrl} alt={`Variant ${v.variantIndex + 1}`} className="w-full" style={{ aspectRatio: `${v.width}/${v.height}` }} />
                <div className="p-3">
                  <div className="flex items-center justify-between">
                    <Pill tone={v.mode === "live" ? "good" : "neutral"}>{v.mode === "live" ? v.model : "demo composer"}</Pill>
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-300">{publishIdx === v.variantIndex ? "✓ selected" : <><ShieldCheck className="h-3.5 w-3.5" /> brand-safe</>}</span>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">{v.notes[1]}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Attach the selected creative to a post and publish */}
          <PublishToChannels
            defaultText={[headline, offerText, cta].filter(Boolean).join("\n")}
            defaultMediaUrls={variants[publishIdx] ? [variants[publishIdx].imageUrl] : []}
            sourceLabel="creative"
          />
        </div>
      )}

      {/* Provider hierarchy */}
      <div className="mb-8 card p-6">
        <h3 className="mb-3 font-display font-bold text-white">Provider hierarchy</h3>
        <div className="space-y-2 text-sm">
          {providers.map((p) => (
            <div key={p.id} className="flex items-center justify-between border-b border-white/[0.05] py-1.5 last:border-0">
              <span className="text-slate-300">{p.label} <span className="text-slate-500">· {p.model} · {p.tier}</span></span>
              <span className="flex items-center gap-2">
                {p.openWeight && <Pill tone="info">open-weight</Pill>}
                <Pill tone={p.configured ? "good" : "neutral"}>{p.configured ? "live" : "add key"}</Pill>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* The agent */}
      <GenerateAndPublish
        agentId="brand-visual-creation"
        buttonLabel="Direct the brand creative"
        publishSourceLabel="creative direction"
        fields={[
          { key: "business", label: "Business", defaultValue: "Brixton Grill House" },
          { key: "product", label: "Product / service", defaultValue: "Restaurant takeaway" },
          { key: "offer", label: "Offer", defaultValue: "20% off first order" },
          { key: "audience", label: "Audience", defaultValue: "Hungry locals within 3 miles" },
          { key: "platform", label: "Platform format", defaultValue: "Instagram 4:5" },
        ]}
      />
    </div>
  );
}
