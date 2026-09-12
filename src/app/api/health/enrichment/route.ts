import { NextRequest, NextResponse } from "next/server";
import { jsonRoute, loadModule } from "@/backend/route-guard";

// IS THE CONTACT WATERFALL REAL ON THIS DEPLOYMENT?
//
// Two questions, and only one of them costs money, so only one of them is gated.
//
//   GET /api/health/enrichment          free. Which providers this build can see.
//   GET /api/health/enrichment?probe=1  spends ~$0.11 of Hunter credit, so it
//                                       needs a platform-admin session or the
//                                       scheduler bearer — the same rule
//                                       `/api/health/email?send=` follows.
//
// WHY THE PROBE IS HERE AND NOT ONLY IN A SCRIPT. The Hunter adapter's field
// mapping was written in an environment that cannot reach api.hunter.io, so it
// is REASONED rather than OBSERVED. `scripts/check-hunter.mjs` proves it, and
// needs a terminal and a clone. This proves it from the deployment, which
// already has the key and the network — the pattern that ended a day of
// guesswork: when a question can only be answered where the code runs, make the
// code answer it instead of asking somebody to relay evidence.
//
// Both callers share `backend/hunter-probe.ts`. A second copy of the field list
// would drift from the first and the drift would be silent.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = jsonRoute(async (req: Request) => {
  const url = new URL(req.url);
  const wantsProbe = url.searchParams.get("probe") === "1";

  // Loaded inside the guard. A module-load failure here answers with JSON naming
  // the module, rather than the HTML page that read as the whole OS being down.
  const adapters = await loadModule("@/backend/enrichment-adapters", () => import("@/backend/enrichment-adapters"));
  const provider = await loadModule("@/backend/enrichment-provider", () => import("@/backend/enrichment-provider"));
  adapters.registerBuiltInProviders();

  // THE FREE HALF. Whether a key is present is not a secret — it is the same
  // thing `/api/contact-hunter` already reports, and it answers the question the
  // owner actually asks after setting a variable: "did the running build get it?"
  const providers = provider.providerHealth();
  const free = {
    service: "Contact enrichment — which suppliers this deployment can actually reach",
    providers,
    notConfigured: adapters.NOT_IMPLEMENTED,
    order: "Free sources run first and are better evidence: our own crawl, then the company register, then any paid finder. A paid credit is only spent on what the free ones missed.",
    whyDidARowFindNothing: "Add ?company=<a business name> to run ONE row through the real chain and see every step, free. Add &paid=1 (platform admin or scheduler bearer) to let Hunter and Apollo answer too.",
    howToProve: "Add ?probe=1 (platform admin or the scheduler bearer) to make three real Hunter calls and check every field the adapter reads. That spends about $0.11.",
  };
  // WHY DID THIS ROW FIND NOTHING? The question the key list cannot answer.
  //
  // "I have all three keys and it still does not work" has at least seven causes
  // that look identical from outside — a stale build, a rejected search key, a
  // site with no address, a refused directory inbox, an empty wallet, a supplier
  // with no data, a supplier refusing us. Each needs a different action. This
  // runs ONE named company through the real chain and reports every step.
  //
  // Free by default: the crawl costs nothing, and that is where most failures
  // are. `&paid=1` spends one row's budget and is authorised like the Hunter
  // probe below, because it moves money.
  const company = (url.searchParams.get("company") || "").trim();
  if (company) {
    const explain = await loadModule("@/backend/enrichment-explain", () => import("@/backend/enrichment-explain"));
    let budget = 0;
    let paidNote = "";
    if (url.searchParams.get("paid") === "1") {
      const guard = await loadModule("@/backend/guard", () => import("@/backend/guard"));
      const ok = guard.cronAuthorised(req instanceof NextRequest ? req : new NextRequest(req)).ok
        || (await guard.requireAuth(req, { scope: "platform_admin" })).ok;
      const wallet = await loadModule("@/backend/wallet", () => import("@/backend/wallet"));
      if (ok) budget = Math.floor(wallet.ACTION_COST_ACU.enrich_paid / 2);
      else paidNote = "&paid=1 spends real supplier credit, so it needs a platform-admin session or the scheduler bearer. The free half below ran anyway.";
    }
    const result = await explain.explainEnrichment(company, budget);
    return NextResponse.json({ ...free, explain: result, ...(paidNote ? { paidNote } : {}) });
  }

  if (!wantsProbe) return NextResponse.json(free);

  // THE PAID HALF. Money moves, so the caller has to be somebody.
  const guard = await loadModule("@/backend/guard", () => import("@/backend/guard"));
  const authorised = guard.cronAuthorised(req instanceof NextRequest ? req : new NextRequest(req)).ok
    || (await guard.requireAuth(req, { scope: "platform_admin" })).ok;
  if (!authorised) {
    return NextResponse.json({
      ...free,
      error: "The live probe spends real Hunter credit, so it needs a platform-admin session or the scheduler bearer.",
      // NAMED, because "unauthorised" with no route forward is how somebody ends
      // up unable to run the one check that would answer their question.
      insteadRunThis: "HUNTER_API_KEY=… node scripts/check-hunter.mjs — the same checks, from your own machine, with no session needed.",
    }, { status: 403 });
  }

  const probe = await loadModule("@/backend/hunter-probe", () => import("@/backend/hunter-probe"));
  const domain = (url.searchParams.get("domain") || "stripe.com").trim().toLowerCase();
  return NextResponse.json({ ...free, probe: await probeWithin(probe, domain) });
}, { maxSeconds: 60, label: "/api/health/enrichment" });

/** Keep the probe inside the route's own budget, so a slow supplier answers rather than hangs. */
async function probeWithin(mod: { probeHunter: (d?: string, s?: AbortSignal) => Promise<unknown> }, domain: string): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 40_000);
  try {
    return await mod.probeHunter(domain, ctl.signal);
  } finally {
    clearTimeout(timer);
  }
}
