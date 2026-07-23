"use client";

// Brand asset uploader — pick a file, it uploads to Firebase Storage via
// /api/brand-assets (owner-enforced) and returns the hosted public URL. Used for
// the brand logo, product photo and other brand media so "use my logo / product
// photo" is real. Shows an inline preview and honest error/hosting states.

import { useRef, useState } from "react";
import { Loader2, Upload, X, Check } from "lucide-react";
import { authedFetch } from "@/frontend/api-client";

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("Could not read the file"));
    r.readAsDataURL(file);
  });
}

export default function BrandAssetUploader({
  brandId, assetType, label, currentUrl, accept = "image/*", onUploaded, onClear,
}: {
  brandId: string | null | undefined;
  assetType: string;          // "logo" | "product_image" | …
  label: string;
  currentUrl?: string;
  accept?: string;
  onUploaded: (url: string) => void;
  onClear?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file || !brandId) return;
    setBusy(true); setError(null);
    try {
      const dataUrl = await readAsDataUrl(file);
      const res = await authedFetch("/api/brand-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, assetType, dataUrl, fileName: file.name }),
      });
      const data = await res.json();
      if (!res.ok || !data?.url) { setError(data?.error || "Upload failed"); return; }
      onUploaded(data.url as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(currentUrl || "");

  return (
    <div className="rounded-lg border border-white/[0.08] bg-ink-900/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-300">{label}</span>
        {currentUrl && <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-400"><Check className="h-3 w-3" /> saved</span>}
      </div>

      {currentUrl ? (
        <div className="flex items-center gap-3">
          {isVideo ? (
            /* eslint-disable-next-line jsx-a11y/media-has-caption */
            <video src={currentUrl} className="h-14 w-14 rounded-md border border-white/10 object-cover" />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={currentUrl} alt={label} className="h-14 w-14 rounded-md border border-white/10 bg-white/5 object-contain" />
          )}
          <div className="flex flex-col gap-1.5">
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="text-xs text-emerald-400 hover:underline">Replace</button>
            {onClear && <button type="button" onClick={onClear} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-rose-300"><X className="h-3 w-3" /> Remove</button>}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy || !brandId}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-white/15 px-3 py-4 text-xs text-slate-400 transition hover:border-emerald-500/40 hover:text-slate-200 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? "Uploading…" : brandId ? `Upload ${label.toLowerCase()}` : "Add a brand first"}
        </button>
      )}

      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      {error && <p className="mt-2 text-[11px] text-rose-300">{error}</p>}
    </div>
  );
}
