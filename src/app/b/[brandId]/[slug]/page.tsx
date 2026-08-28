// PUBLIC hosted landing page — the REAL page a visitor sees at
// /b/{brandId}/{slug}. Server-rendered from the persisted LandingPage (published
// via the Conversion Architect). Themed with the brand's logo + colours. The
// lead form writes straight into the brand's Customer Vault. This is what makes
// the generated page an actual, visitable, shareable page — not a dead URL.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPage } from "@/backend/landing-store";
import { recordPageEvent } from "@/backend/page-analytics";
import PageTracker from "@/components/PageTracker";
import LandingLeadForm from "@/components/LandingLeadForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { brandId: string; slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { brandId, slug } = await params;
  const page = await getPage(brandId, slug).catch(() => null);
  if (!page) return { title: "Page not found" };
  return { title: page.headline, description: page.subheadline };
}

export default async function HostedLandingPage({ params }: { params: Promise<Params> }) {
  const { brandId, slug } = await params;
  const page = await getPage(brandId, slug).catch(() => null);
  if (!page || !page.live) notFound();

  // Count the visit server-side, so it is recorded even for a visitor with
  // JavaScript disabled or an ad blocker that eats client-side beacons. A
  // failure here must never stop the page rendering — the customer is paying
  // for the page, not for the counter.
  await recordPageEvent(brandId, slug, "view").catch(() => {});

  const cols = page.brandColours && page.brandColours.length ? page.brandColours : ["#1F6FEB", "#0B7285"];
  const primary = cols[0];
  const accent = cols[1] || cols[0];
  const waHref = page.whatsappConfig?.enabled && page.whatsappConfig.phoneNumber
    ? `https://wa.me/${page.whatsappConfig.phoneNumber.replace(/\D/g, "")}?text=${encodeURIComponent(page.whatsappConfig.prefilledMessage || "")}`
    : null;
  // Owner's own product/checkout/booking link. When set, the CTA button sends the
  // visitor straight there instead of scrolling to the built-in form. Older stored
  // pages predate this field, so it's read defensively.
  const ctaUrl = (page as { primaryCtaUrl?: string }).primaryCtaUrl || "";
  const heroHref = ctaUrl || "#lead";
  const external = Boolean(ctaUrl);

  return (
    <main className="min-h-screen bg-white text-slate-900">
      {/* Counts CTA clicks. Views are already counted server-side above. */}
      <PageTracker brandId={page.brandId} slug={page.slug} />
      {/* Hero — one promise, one price, one button. Everything else is below. */}
      <header className="relative overflow-hidden px-6 pb-20 pt-14 text-white" style={{ background: `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)` }}>
        {/* Depth without an image: two soft radial washes over the gradient. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40"
          style={{ background: "radial-gradient(60% 55% at 15% 0%, rgba(255,255,255,.35), transparent 60%), radial-gradient(50% 50% at 95% 100%, rgba(0,0,0,.28), transparent 60%)" }} />
        <div className="relative mx-auto max-w-3xl text-center">
          {page.logoUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={page.logoUrl} alt={page.brandName} className="mx-auto mb-7 h-12 w-auto rounded-lg bg-white/95 p-2 shadow-lg sm:h-14" />
          )}
          {page.offerText && (
            <p className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white ring-1 ring-inset ring-white/30 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              {page.offerText}
            </p>
          )}
          <h1 className="text-[2rem] font-black leading-[1.08] tracking-tight sm:text-5xl">{page.headline}</h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-white/90 sm:text-xl">{page.subheadline}</p>

          <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <a
              href={heroHref}
              data-mw-cta="primary"
              {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="rounded-xl bg-white px-8 py-4 text-base font-black shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:shadow-2xl"
              style={{ color: primary }}
            >
              {page.primaryCta}
            </a>
            {waHref && (
              <a href={waHref} className="rounded-xl border-2 border-white/60 px-8 py-4 text-base font-bold text-white transition hover:bg-white/10">
                {page.whatsappConfig.enabled ? "Message on WhatsApp" : page.secondaryCta}
              </a>
            )}
          </div>
          {/* Who the buyer is paying. The money goes to the owner's own payment
              account and never through MarketWar, so naming the processor is
              the honest reassurance — not a badge we invented. */}
          {external && (page as { checkoutProvider?: string }).checkoutProvider && (
            <p className="mt-3 text-center text-xs text-white/70">
              Secure checkout via {(page as { checkoutProvider?: string }).checkoutProvider}
            </p>
          )}

          {/* Reassurance, not fabricated proof: these are facts about the FORM,
              true of every page, never invented numbers or reviews. */}
          <p className="mt-6 text-xs text-white/70">
            {page.formConfig?.enabled && page.formConfig.fields.length
              ? `Takes under a minute · ${page.formConfig.fields.length} field${page.formConfig.fields.length === 1 ? "" : "s"} · No obligation`
              : "No obligation · Straight through to a human"}
          </p>
        </div>
      </header>

      {/* Body — each section type gets the treatment that suits it, rather than
          every block rendering as the same wall of text. */}
      <section className="mx-auto max-w-3xl px-6 py-16">
        <div className="space-y-14">
          {page.sections.map((sec, i) => {
            const isFaq = sec.type === "faq";
            const isOffer = sec.type === "offer";
            const isUrgency = sec.type === "urgency";
            const isProof = sec.type === "proof" || sec.type === "testimonials";

            // The offer is the commercial heart of the page — it gets a card.
            if (isOffer) {
              return (
                <div key={i} className="rounded-2xl border-2 p-7 shadow-sm sm:p-9" style={{ borderColor: primary }}>
                  <p className="mb-2 text-xs font-black uppercase tracking-widest" style={{ color: primary }}>{sec.heading}</p>
                  {sec.body && <p className="text-xl font-bold leading-snug text-slate-900 sm:text-2xl">{sec.body}</p>}
                  {sec.items && sec.items.length > 0 && (
                    <ul className="mt-6 space-y-3">
                      {sec.items.map((it, j) => (
                        <li key={j} className="flex items-start gap-3 text-slate-800">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white" style={{ background: primary }}>✓</span>
                          <span className="leading-relaxed">{it}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <a
                    href={heroHref}
                    data-mw-cta="section"
                    {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="mt-7 block rounded-xl px-6 py-4 text-center text-base font-black text-white shadow-lg transition hover:-translate-y-0.5"
                    style={{ background: primary }}
                  >
                    {page.primaryCta}
                  </a>
                </div>
              );
            }

            // FAQ as a real accordion — no JavaScript, works everywhere, and
            // keeps the page short instead of burying the CTA under text.
            if (isFaq && sec.items?.length) {
              return (
                <div key={i}>
                  <h2 className="mb-5 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{sec.heading}</h2>
                  <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
                    {sec.items.map((it, j) => {
                      const [q, ...rest] = it.split(/\s*[?]\s*/);
                      const answer = rest.join("? ").trim();
                      return (
                        <details key={j} className="group bg-white open:bg-slate-50">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left font-bold text-slate-900">
                            <span>{q}{answer ? "?" : ""}</span>
                            <span className="shrink-0 text-xl leading-none transition group-open:rotate-45" style={{ color: primary }}>+</span>
                          </summary>
                          {answer && <p className="px-5 pb-5 leading-relaxed text-slate-600">{answer}</p>}
                        </details>
                      );
                    })}
                  </div>
                </div>
              );
            }

            // Urgency is only ever generated from a REAL deadline, so it is
            // allowed to shout — but only a little.
            if (isUrgency) {
              return (
                <div key={i} className="rounded-xl bg-slate-900 px-7 py-6 text-center text-white">
                  <p className="text-xs font-black uppercase tracking-widest" style={{ color: accent }}>{sec.heading}</p>
                  {sec.body && <p className="mt-2 text-lg font-bold">{sec.body}</p>}
                </div>
              );
            }

            return (
              <div key={i}>
                <p className="mb-2 text-xs font-black uppercase tracking-widest" style={{ color: accent }}>{sec.type.replace(/_/g, " ")}</p>
                <h2 className="text-2xl font-black leading-tight tracking-tight text-slate-900 sm:text-3xl">{sec.heading}</h2>
                {sec.body && <p className="mt-3 text-lg leading-relaxed text-slate-600">{sec.body}</p>}
                {sec.items && sec.items.length > 0 && (
                  <ul className={`mt-6 grid gap-x-6 gap-y-4 ${isProof ? "sm:grid-cols-1" : "sm:grid-cols-2"}`}>
                    {sec.items.map((it, j) => (
                      <li key={j} className="flex items-start gap-3">
                        <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-black text-white" style={{ background: accent }}>{j + 1}</span>
                        <span className="leading-relaxed text-slate-700">{it}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Lead capture / conversion */}
      <section id="lead" className="border-t border-slate-100 bg-slate-50 px-6 py-14">
        <div className="mx-auto max-w-md">
          <h2 className="mb-2 text-center text-3xl font-black tracking-tight text-slate-900">{page.primaryCta}</h2>
          <p className="mb-7 text-center text-lg text-slate-600">{page.offerText}</p>
          {external ? (
            <>
              <a href={ctaUrl} data-mw-cta="final" target="_blank" rel="noopener noreferrer" className="block rounded-xl px-4 py-4 text-center text-base font-black text-white shadow-lg transition hover:-translate-y-0.5" style={{ background: primary }}>
                {page.primaryCta}
              </a>
              {page.formConfig.enabled && page.formConfig.fields.length > 0 && (
                <div className="mt-8">
                  <p className="mb-3 text-center text-sm font-semibold text-slate-500">Prefer we get in touch? Leave your details.</p>
                  <LandingLeadForm brandId={page.brandId} slug={page.slug} fields={page.formConfig.fields} submitLabel="Send my details" accent={primary} />
                </div>
              )}
            </>
          ) : page.formConfig.enabled && page.formConfig.fields.length > 0 ? (
            <LandingLeadForm
              brandId={page.brandId}
              slug={page.slug}
              fields={page.formConfig.fields}
              submitLabel={page.primaryCta}
              accent={primary}
            />
          ) : waHref ? (
            <a href={waHref} className="block rounded-xl px-4 py-4 text-center text-base font-black text-white shadow-lg transition hover:-translate-y-0.5" style={{ background: primary }}>
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

      <footer className="px-6 pb-28 pt-10 text-center text-sm text-slate-400 sm:pb-10">
        {page.brandName} · Powered by MarketWar OS
      </footer>

      {/* Sticky action bar on phones. Most visitors arrive on mobile, scroll a
          little and never reach the form — this keeps the one action they came
          for permanently in reach. Hidden on desktop, where the page CTAs are
          already visible. */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur sm:hidden">
        <div className="flex gap-2">
          <a
            href={heroHref}
            data-mw-cta="sticky"
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="flex-1 rounded-xl px-4 py-3.5 text-center text-sm font-black text-white"
            style={{ background: primary }}
          >
            {page.primaryCta}
          </a>
          {waHref && (
            <a href={waHref} className="rounded-xl border-2 px-4 py-3.5 text-center text-sm font-black" style={{ borderColor: primary, color: primary }}>
              WhatsApp
            </a>
          )}
        </div>
      </div>
    </main>
  );
}
