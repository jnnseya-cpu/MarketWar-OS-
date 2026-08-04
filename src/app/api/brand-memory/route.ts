import { NextRequest, NextResponse } from "next/server";
import {
  remember, currentMemory, contextFor, history, conflicts,
  MEASURING_MODULES, AGENT_INTERESTS, STALE_AFTER_DAYS,
} from "@/backend/brand-memory";
import { countContacts, vaultCountsFor } from "@/backend/contacts";
import { brandSummary } from "@/backend/ledger";
import { brandEvents } from "@/backend/email-events";
import { bestPostingTimes } from "@/backend/posting-time";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";

// Brand Memory — the shared context the agent network reads from.
//
// GET  ?brandId=&agent=&key=  → the live memory, one agent's slice, or a key's
//                               history; plus the conflicts worth a look
// POST { action: "remember", brandId, key, value, note? }  → record what the
//                               CUSTOMER told us
// POST { action: "sync", brandId } → derive the MEASURED facts from modules
//                               that actually count something
//
// THE STANDING RULE, ENFORCED AT THE DOOR.
//
// This route will not write a `measured` fact on behalf of a caller, whatever
// the body says. A client-supplied fact is `source: "customer"` — their belief,
// recorded as their belief. Measured facts are produced only by `sync`, which
// runs the measuring modules here on the server and passes their own module
// name as the provenance. Otherwise anyone who can POST could stamp a guess as
// a measurement, which is exactly the laundering the memory exists to prevent.
//
// Not metered: nothing here calls a provider, and it counts data the customer
// already owns — the same reason `/api/results` and `/api/roi` are unmetered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "brand-memory"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  const action = str("action");
  const brandId = str("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  if (action === "remember") {
    // Note what is NOT read from the body: `source` and `sourceRef`. A caller
    // does not get to choose its own standing.
    const res = await remember({
      brandId,
      key: str("key"),
      value: str("value"),
      source: "customer",
      sourceRef: "customer",
      confidence: typeof body.confidence === "number" ? body.confidence : 0.8,
      note: str("note") || undefined,
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ fact: res.fact, superseded: res.superseded, persisted: res.persisted });
  }

  if (action === "sync") {
    const written: string[] = [];
    const skipped: string[] = [];

    // The vault: a count, from the vault.
    const [total, counts] = await Promise.all([
      countContacts(brandId).catch(() => 0),
      vaultCountsFor(brandId).catch(() => ({ total: 0, consented: 0, dormant: 0 })),
    ]);
    if (total > 0) {
      await remember({ brandId, key: "audience.vault-size", value: String(total), source: "measured", sourceRef: "contacts", confidence: 1 });
      await remember({ brandId, key: "audience.consented", value: String(counts.consented), source: "measured", sourceRef: "contacts", confidence: 1 });
      written.push("audience.vault-size", "audience.consented");
    } else skipped.push("audience.* — no contacts in the vault yet");

    // Revenue: only what is actually in the ledger.
    const rev = await brandSummary(brandId).catch(() => null);
    if (rev && !rev.isEmpty) {
      await remember({ brandId, key: "revenue.recorded-gbp", value: String(rev.revenueGbp), source: "measured", sourceRef: "ledger", confidence: 1 });
      await remember({ brandId, key: "revenue.orders", value: String(rev.orders), source: "measured", sourceRef: "ledger", confidence: 1 });
      if (rev.avgOrderGbp > 0) {
        await remember({ brandId, key: "revenue.avg-order-gbp", value: String(rev.avgOrderGbp), source: "measured", sourceRef: "ledger", confidence: 1 });
        written.push("revenue.avg-order-gbp");
      }
      written.push("revenue.recorded-gbp", "revenue.orders");
    } else skipped.push("revenue.* — nothing in the Money Ledger yet");

    // Posting hours: recorded ONLY when the engine says its basis is measured.
    // Its market-hours fallback is a starting point, not a finding, and writing
    // it as a measured fact would be the exact laundering this route prevents.
    const events = await brandEvents(brandId).catch(() => []);
    const advice = bestPostingTimes({ events, market: null, timezone: "UTC" });
    if (advice.basis === "measured" && advice.windows.length) {
      await remember({
        brandId, key: "posting.best-windows",
        value: advice.windows.map((w) => `${w.label ?? ""}`.trim() || JSON.stringify(w)).join("; "),
        source: "measured", sourceRef: "posting-time", confidence: 1,
        note: `${advice.sampleClicks} clicks, ${advice.sampleOpens} opens`,
      });
      written.push("posting.best-windows");
    } else skipped.push(`posting.best-windows — basis is "${advice.basis}", not a measurement`);

    return NextResponse.json({ written, skipped, memory: await currentMemory(brandId) });
  }

  return NextResponse.json({ error: "Unknown action — use remember or sync" }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const url = new URL(req.url);
  const brandId = url.searchParams.get("brandId") || "";
  if (!brandId) {
    return NextResponse.json({
      store: "Brand Memory — the shared context the agent network reads from",
      rule: "Every fact records where it came from, and a fact produced by a model is never promoted to measured. Without that, one agent's guess becomes the next agent's premise and a chain of ten agents produces a confident plan built on nothing.",
      measuringModules: MEASURING_MODULES,
      staleAfterDays: STALE_AFTER_DAYS,
      agentInterests: AGENT_INTERESTS,
    });
  }
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const key = url.searchParams.get("key");
  if (key) return NextResponse.json({ key, history: await history(brandId, key) });

  const agent = url.searchParams.get("agent");
  if (agent) return NextResponse.json(await contextFor(brandId, agent));

  return NextResponse.json({ memory: await currentMemory(brandId), conflicts: await conflicts(brandId) });
}
