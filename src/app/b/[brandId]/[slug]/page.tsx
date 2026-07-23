// PUBLIC hosted landing page — the REAL page a visitor sees at
// /b/{brandId}/{slug}. Server-rendered from the persisted LandingPage (published
// via the Conversion Architect). Themed with the brand's logo + colours. The
// lead form writes straight into the brand's Customer Vault. This is what makes
// the generated page an actual, visitable, shareable page — not a dead URL.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPage } from "@/backend/landing-store";
import LandingLeadForm from "@/components/LandingLeadForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { brandId: string; slug: string };

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const page = await getPage(params.brandId, params.slug).catch(() => null);
  if (!page) return { title: "Page not found" };
  return { title: page.headline, description: page.subheadline };
}

export default async function HostedLandingPage({ params }: { params: Params }) {
  const page = await getPage(params.brandId, params.slug).catch(() => null);
  if (!page || !page.live) notFound();

  const cols = page.brandColours && page.brandColours.length ? page.brandColours : ["#1F6FEB", "#0B7285"];
  const primary = cols[0];
  const accent = cols[1] || cols[0];
  const waHref = page.whatsappConfig?.enabled && page.whatsappConfig.phoneNumber
    ? `https://wa.me/${page.whatsappConfig.phoneNumber.replace(/\D/g, "")}?text=${encodeURIComponent(page.whatsappConfig.prefilledMessage || "")}`
    : null;

  return (
    <main className="min-h-screen bg-white text-slate-900">
      {/* Hero */}
      <header className="relative overflow-hidden px-6 py-16 text-white" style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}>
        <div className="mx-auto max-w-3xl text-center">
          {page.logoUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={page.logoUrl} alt={page.brandName} className="mx-auto mb-6 h-14 w-auto rounded bg-white/90 p-1.5" />
          )}
          <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">{page.headline}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-white/90">{page.subheadline}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href="#lead" className="rounded-lg bg-white px-6 py-3 text-base font-bold" style={{ color: primary }}>{page.primaryCta}</a>
            {waHref && <a href={waHref} className="rounded-lg border border-white/70 px-6 py-3 text-base font-bold text-white">{page.whatsappConfig.enabled ? "Message on WhatsApp" : page.secondaryCta}</a>}
          </div>
        </div>
      </header>

      {/* Sections */}
      <section className="mx-auto max-w-3xl px-6 py-14">
        <div className="space-y-10">
          {page.sections.map((s, i) => (
            <div key={i}>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide" style={{ color: accent }}>{s.type.replace(/_/g, " ")}</p>
              <h2 className="text-2xl font-bold text-slate-900">{s.heading}</h2>
              {s.body && <p className="mt-2 text-slate-600">{s.body}</p>}
              {s.items && s.items.length > 0 && (
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {s.items.map((it, j) => (
                    <li key={j} className="flex items-start gap-2 text-slate-700">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
                      {it}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Lead capture / conversion */}
      <section id="lead" className="border-t border-slate-100 bg-slate-50 px-6 py-14">
        <div className="mx-auto max-w-md">
          <h2 className="mb-1 text-center text-2xl font-bold text-slate-900">{page.primaryCta}</h2>
          <p className="mb-6 text-center text-slate-600">{page.offerText}</p>
          {page.formConfig.enabled && page.formConfig.fields.length > 0 ? (
            <LandingLeadForm
              brandId={page.brandId}
              slug={page.slug}
              fields={page.formConfig.fields}
              submitLabel={page.primaryCta}
              accent={primary}
            />
          ) : waHref ? (
            <a href={waHref} className="block rounded-lg px-4 py-4 text-center text-base font-bold text-white" style={{ background: primary }}>
              {page.primaryCta} on WhatsApp
            </a>
          ) : (
            <LandingLeadForm
              brandId={page.brandId}
              slug={page.slug}
              fields={[{ key: "name", label: "Name", type: "text", required: true }, { key: "email", label: "Email", type: "email", required: true }]}
              submitLabel={page.primaryCta}
              accent={primary}
            />
          )}
        </div>
      </section>

      <footer className="px-6 py-8 text-center text-sm text-slate-400">
        {page.brandName} · Powered by MarketWar OS
      </footer>
    </main>
  );
}
