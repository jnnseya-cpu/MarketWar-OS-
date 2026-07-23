// Branded export helpers (client-side) — "anything the user does can be
// exported and downloaded with their brand".
//
// Every export carries the ACTIVE brand: a branded metadata header on CSV, a
// `_brand` block on JSON, and a full logo + colour header on the printable HTML
// report. No backend round-trip — the data is already in the page. Filenames
// are brand-slugged + dated so downloads are self-describing.

import type { Brand } from "@/shared/brand";

// A minimal brand shape so callers can pass the active brand or nothing.
export type ExportBrand = Pick<Brand, "name" | "logoUrl"> & { brandColours?: string[] } | null | undefined;

function slug(s: string): string {
  return (s || "brand").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "brand";
}

// Deterministic-safe date stamp (uses the browser clock at click time — fine
// client-side; this file never runs in the workflow sandbox).
function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fileName(brand: ExportBrand, dataset: string, ext: string): string {
  return `${slug(brand?.name || "")}-${slug(dataset)}-${stamp()}.${ext}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Export an array of flat objects as a branded CSV. The first rows are branded
// metadata comments (business, dataset, date, source) so the file is clearly
// the user's own, then the header row + data.
export function exportCsv(rows: Record<string, unknown>[], opts: { dataset: string; brand?: ExportBrand; columns?: string[] }) {
  const brand = opts.brand;
  const cols = opts.columns ?? Array.from(rows.reduce((set, r) => { Object.keys(r).forEach((k) => set.add(k)); return set; }, new Set<string>()));
  const meta = [
    `# ${brand?.name || "MarketWar OS"} — ${opts.dataset}`,
    `# Exported ${stamp()} from MarketWar OS`,
    brand?.name ? `# Brand: ${brand.name}` : "",
  ].filter(Boolean).join("\n");
  const header = cols.map(csvCell).join(",");
  const body = rows.map((r) => cols.map((c) => csvCell(r[c])).join(",")).join("\n");
  const text = `${meta}\n${header}\n${body}\n`;
  triggerDownload(new Blob([text], { type: "text/csv;charset=utf-8" }), fileName(brand, opts.dataset, "csv"));
}

// Export any data as branded JSON — the payload is wrapped with a `_brand` +
// `_export` metadata block so the download records whose brand it belongs to.
export function exportJson(data: unknown, opts: { dataset: string; brand?: ExportBrand }) {
  const brand = opts.brand;
  const wrapped = {
    _export: { dataset: opts.dataset, date: stamp(), source: "MarketWar OS" },
    _brand: brand ? { name: brand.name, colours: brand.brandColours ?? [] } : null,
    data,
  };
  triggerDownload(new Blob([JSON.stringify(wrapped, null, 2)], { type: "application/json" }), fileName(brand, opts.dataset, "json"));
}

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));

// Export a full branded, printable HTML report (logo + brand colour header,
// title, and body). Opens as a downloadable .html the user can print to PDF —
// so agent outputs, plans and analyses carry the user's brand, white-label.
export function exportBrandedReport(opts: { title: string; bodyHtml: string; dataset: string; brand?: ExportBrand }) {
  const brand = opts.brand;
  const accent = brand?.brandColours?.[0] || "#199e70";
  const logo = brand?.logoUrl ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand?.name || "")}" style="height:44px;max-width:180px;object-fit:contain" />` : "";
  const html = `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(brand?.name ? brand.name + " — " : "")}${esc(opts.title)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #0b0f16; margin: 0; background: #fff; }
  .wrap { max-width: 820px; margin: 0 auto; padding: 40px 32px 64px; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 3px solid ${esc(accent)}; padding-bottom: 16px; margin-bottom: 28px; }
  header .brand { font-weight: 800; font-size: 18px; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  .meta { color: #667085; font-size: 12px; margin-bottom: 24px; }
  .body { font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
  .body h2 { font-size: 17px; border-left: 4px solid ${esc(accent)}; padding-left: 10px; margin-top: 28px; }
  footer { margin-top: 48px; border-top: 1px solid #e4e7ec; padding-top: 12px; color: #98a2b3; font-size: 11px; }
  @media print { .noprint { display: none } }
</style></head><body><div class="wrap">
  <header><div class="brand">${esc(brand?.name || "MarketWar OS")}</div>${logo}</header>
  <h1>${esc(opts.title)}</h1>
  <div class="meta">Exported ${stamp()}${brand?.name ? " · " + esc(brand.name) : ""} · via MarketWar OS</div>
  <div class="body">${opts.bodyHtml}</div>
  <footer>Generated by ${esc(brand?.name || "MarketWar OS")} on MarketWar OS. This document is the property of ${esc(brand?.name || "the account owner")}.</footer>
  <p class="noprint" style="margin-top:24px"><button onclick="window.print()" style="background:${esc(accent)};color:#fff;border:0;border-radius:8px;padding:10px 18px;font-weight:700;cursor:pointer">Print / Save as PDF</button></p>
</div></body></html>`;
  triggerDownload(new Blob([html], { type: "text/html;charset=utf-8" }), fileName(brand, opts.dataset, "html"));
}
