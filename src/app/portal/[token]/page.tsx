import type { Metadata } from "next";
import ClientPortalView from "@/components/ClientPortalView";

// THE PAGE AN OUTSIDE CLIENT OPENS.
//
// Outside the dashboard shell on purpose: no sidebar, no brand switcher, no
// navigation into the product. The person here is their agency's customer, not
// ours, and everything that looks like an advert makes the agency look like it
// is reselling us rather than doing the work.
//
// NOINDEX, and it matters. Approval links land in email, email lands in
// archives, and archives get crawled. A search engine indexing one of these
// would put a client's unreleased creative into a result page.
export const metadata: Metadata = {
  title: "Approve this · MarketWar OS",
  description: "Review one piece of work and approve it, ask for a change, or reject it.",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-400">For your approval</p>
          <h1 className="mt-2 text-2xl font-bold text-white">One thing to look at</h1>
          <p className="mt-2 text-sm text-slate-400">
            You are not signed in and you do not need an account. This link opens this one item and nothing else.
          </p>
        </header>

        <ClientPortalView token={token} />

        <footer className="mt-10 border-t border-white/10 pt-5 text-xs text-slate-500">
          Sent using MarketWar OS. Your decision is recorded against this item with the time and, if you gave one, your name.
        </footer>
      </div>
    </main>
  );
}
