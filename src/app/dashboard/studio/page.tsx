"use client";

// AI Visual Creation Engine — the Brand Studio command surface.
// Generates brand-safe ad creatives through the image gateway (/api/image),
// using the ACTIVE brand's REAL logo + colour palette + product photo (captured
// here or at onboarding, hosted on Firebase Storage). Every creative is on-brand
// — never generic. Zero-config still renders real SVG creatives.

import { useState } from "react";
import { Loader2, Image as ImageIcon, Palette, ShieldCheck } from "lucide-react";
import GenerateAndPublish from "@/components/GenerateAndPublish";
import PublishToChannels from "@/components/PublishToChannels";
import BrandAssetUploader from "@/components/BrandAssetUploader";
import { PageHeader, Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";
import { brandDefaults } from "@/shared/brand";
import {
  DEFAULT_CREATIVE_OPTIONS, type CreativeOptions, type PlatformFormat, type LogoPosition,
  type ImageQuality, type BrandTheme,
} from "@/shared/creative";

type Variant = {
  imageUrl: string; hostedUrl?: string; provider: string; model: string; mode: string;
  width: number; height: number; format: string; brandTheme: BrandTheme;
  brandSafe: boolean; variantIndex: number;
  notes: string[];
};

const FORMATS: PlatformFormat[] = ["facebook", "instagram", "tiktok", "linkedin", "whatsapp", "story", "reel", "banner"];
const POSITIONS: LogoPosition[] = ["top-left", "top-right", "bottom-left", "bottom-right", "centre", "watermark"];
const QUALITIES: ImageQuality[] = ["draft", "standard", "premium"];

export default function StudioPage() {
  const { activeBrand, updateBrand } = useActiveBrand();
  const business = activeBrand?.name ?? "";
  const [headline, setHeadline] = useState("Your headline, rendered exactly");
  const [offerText, setOfferText] = useState("");
  const [cta, setCta] = useState("Order now");
  const [quality, setQuality] = useState<ImageQuality>("standard");
  const [variantCount, setVariantCount] = useState(3);
  const [options, setOptions] = useState<CreativeOptions>(DEFAULT_CREATIVE_OPTIONS);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [busy, setBusy] = useState(false);
  const [publishIdx, setPublishIdx] = useState(0);

  const hasLogo = Boolean(activeBrand?.logoUrl);
  const hasProduct = Boolean(activeBrand?.productImageUrl);

  const opt = <K extends keyof CreativeOptions>(k: K, v: CreativeOptions[K]) => setOptions((o) => ({ ...o, [k]: v }));

  async function generate() {
    if (!activeBrand) return;
    setBusy(true);
    try {
      const res = await authedFetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate", business, headline, offerText, cta, quality, variants: variantCount, options,
          brandId: activeBrand.id,
          logoUrl: activeBrand.logoUrl,
          productImageUrl: activeBrand.productImageUrl,
          brandColours: activeBrand.brandColours,
        }),
      });
      const data = await res.json();
      setVariants(data.variants || []);
      setPublishIdx(0);
    } finally {
      setBusy(false);
    }
  }

  const theme = variants[0]?.brandTheme;

  return (
    <div>
      <PageHeader
        kicker="AI Visual Creation Engine · Brand Studio"
        title="Brand-safe ad creative — never generic, always on-brand"
        subtitle="Upload your logo, brand colours and a product photo once — they're reused across every creative. The original logo is overlaid without distortion and all text is rendered exactly, so ads always show the real brand."
        actions={<Pill tone="info">On-brand · logo-aware · exact text</Pill>}
      />

      {!activeBrand && (
        <div className="mb-8 card border-emerald-500/20 p-10 text-center">
          <h2 className="font-display text-lg font-bold text-white">Add a brand to start</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">Add a brand from the switcher, upload its logo + colours, and every creative is generated on-brand.</p>
        </div>
      )}

      {/* Brand Asset Library — real uploads, hosted on Firebase Storage */}
      {activeBrand && (
      <div className="mb-8 card p-6">
        <div className="mb-3 flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-emerald-400" />
          <h2 className="font-display text-lg font-bold text-white">Brand assets for {activeBrand.name}</h2>
          <Pill tone="neutral">reused across every campaign</Pill>
        </div>
        <p className="mb-4 text-sm text-slate-400">Upload once, reuse everywhere. Your logo is overlaid on every creative; your colours theme it; your product photo can be the base. Saved to your brand — available from the start.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <BrandAssetUploader
            brandId={activeBrand.id} assetType="logo" label="Logo" accept="image/png,image/jpeg,image/webp,image/svg+xml"
            currentUrl={activeBrand.logoUrl}
            onUploaded={(url) => updateBrand(activeBrand.id, { logoUrl: url })}
            onClear={() => updateBrand(activeBrand.id, { logoUrl: undefined })}
          />
          <BrandAssetUploader
            brandId={activeBrand.id} assetType="product_image" label="Product photo" accept="image/png,image/jpeg,image/webp"
            currentUrl={activeBrand.productImageUrl}
            onUploaded={(url) => updateBrand(activeBrand.id, { productImageUrl: url })}
            onClear={() => updateBrand(activeBrand.id, { productImageUrl: undefined })}
          />
          <BrandColoursEditor
            value={activeBrand.brandColours ?? []}
            onChange={(cols) => updateBrand(activeBrand.id, { brandColours: cols })}
          />
        </div>
      </div>
      )}

      {/* Creative options */}
      {activeBrand && (
      <div className="mb-8 card border-emerald-500/30 p-6">
        <div className="mb-4 flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-emerald-400" />
          <h2 className="font-display text-lg font-bold text-white">Create a creative</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Headline (rendered exactly)</label><input className="input" value={headline} onChange={(e) => setHeadline(e.target.value)} /></div>
          <div><label className="label">Offer text</label><input className="input" value={offerText} onChange={(e) => setOfferText(e.target.value)} placeholder="Optional" /></div>
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

        {/* toggles — options that need an uploaded asset are disabled until it exists */}
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {([
            ["useLogo", "Use my logo", !hasLogo, "Upload a logo above"],
            ["useBrandColours", "Use my brand colours", (activeBrand.brandColours?.length ?? 0) === 0, "Add brand colours above"],
            ["useProductPhoto", "Use uploaded product photo", !hasProduct, "Upload a product photo above"],
            ["useUploadedBase", "Use uploaded photo/video as base", !hasProduct, "Upload a product photo above"],
            ["generateNewBackground", "Generate new AI background", false, ""],
            ["addCtaButton", "Add CTA button", false, ""],
            ["addOfferText", "Add offer text", false, ""],
          ] as [keyof CreativeOptions, string, boolean, string][]).map(([k, label, disabled, hint]) => (
            <label key={k} className={`flex items-center gap-2 text-sm ${disabled ? "text-slate-600" : "text-slate-300"}`} title={disabled ? hint : ""}>
              <input type="checkbox" disabled={disabled} checked={!disabled && Boolean(options[k])} onChange={(e) => opt(k, e.target.checked as never)} className="accent-emerald-500" />
              {label}{disabled && <span className="text-[10px] text-amber-400/80">· {hint}</span>}
            </label>
          ))}
        </div>

        <button className="btn-primary mt-5" onClick={generate} disabled={busy}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating on-brand variants…</> : <><ImageIcon className="h-4 w-4" /> Generate creatives</>}
        </button>
      </div>
      )}

      {/* Brand theme */}
      {theme && (
        <div className="mb-8 card p-6">
          <div className="mb-3 flex items-center gap-2"><Palette className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Brand theme</h3><Pill tone={theme.source === "logo" ? "good" : "neutral"}>{theme.source === "logo" ? "from your brand colours" : "derived"}</Pill></div>
          <div className="flex flex-wrap gap-3">
            {([["primary", theme.primary], ["secondary", theme.secondary], ["accent", theme.accent], ["background", theme.backgroundSafe], ["text", theme.textSafe], ["CTA", theme.cta]] as const).map(([name, hex]) => (
              <div key={name} className="text-center">
                <div className="h-12 w-12 rounded-lg border border-white/10" style={{ background: hex }} />
                <p className="mt-1 text-[10px] text-slate-400">{name}</p>
              </div>
            ))}
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
                    <Pill tone={v.mode === "live" ? "good" : "neutral"}>{v.mode === "live" ? "Live render" : "Brand composer"}</Pill>
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-300">{publishIdx === v.variantIndex ? "✓ selected" : <><ShieldCheck className="h-3.5 w-3.5" /> brand-safe</>}</span>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">{v.notes[1]}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Attach the selected creative to a post and publish. Publishing needs
              a hosted (postable) URL — the inline preview can't attach to socials. */}
          <PublishToChannels
            defaultText={[headline, offerText, cta].filter(Boolean).join("\n")}
            defaultMediaUrls={variants[publishIdx]?.hostedUrl ? [variants[publishIdx].hostedUrl!] : []}
            sourceLabel="creative"
          />
        </div>
      )}

      {/* The agent */}
      {activeBrand && (
      <GenerateAndPublish
        agentId="brand-visual-creation"
        buttonLabel="Direct the brand creative"
        publishSourceLabel="creative direction"
        fields={[
          { key: "business", label: "Business", defaultValue: brandDefaults(activeBrand).business ?? "" },
          { key: "product", label: "Product / service", defaultValue: brandDefaults(activeBrand).product ?? "" },
          { key: "offer", label: "Offer", defaultValue: brandDefaults(activeBrand).offer ?? "" },
          { key: "audience", label: "Audience", defaultValue: brandDefaults(activeBrand).audience ?? "" },
          { key: "platform", label: "Platform format", defaultValue: "Instagram 4:5" },
        ]}
      />
      )}
    </div>
  );
}

// Brand colours editor — up to 6 hex swatches the creative theme uses.
function BrandColoursEditor({ value, onChange }: { value: string[]; onChange: (cols: string[]) => void }) {
  const [draft, setDraft] = useState("#");
  const add = () => {
    const hex = draft.trim();
    if (/^#?[0-9a-fA-F]{6}$/.test(hex)) {
      const norm = hex.startsWith("#") ? hex : `#${hex}`;
      if (!value.includes(norm) && value.length < 6) onChange([...value, norm]);
      setDraft("#");
    }
  };
  return (
    <div className="rounded-lg border border-white/[0.08] bg-ink-900/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-300">Brand colours</span>
        {value.length > 0 && <span className="text-[10px] font-bold uppercase text-emerald-400">{value.length} saved</span>}
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {value.map((c) => (
          <button key={c} type="button" onClick={() => onChange(value.filter((x) => x !== c))} title={`${c} — click to remove`} className="h-7 w-7 rounded-md border border-white/15" style={{ background: c }} />
        ))}
        {value.length === 0 && <span className="text-[11px] text-slate-500">Add your brand hex colours (e.g. #1F6FEB).</span>}
      </div>
      <div className="flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="#1F6FEB" className="input h-8 flex-1 text-xs" />
        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(draft) ? draft : "#1f6feb"} onChange={(e) => setDraft(e.target.value)} className="h-8 w-8 cursor-pointer rounded border border-white/15 bg-transparent" title="Pick a colour" />
        <button type="button" onClick={add} className="rounded-md bg-emerald-500/15 px-3 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25">Add</button>
      </div>
    </div>
  );
}
