import { NextRequest, NextResponse } from "next/server";
import { runAutopilotCycle, autopilotDigestEmail, type BrandLite, type AutopilotRun } from "@/backend/autopilot";
import { sendEmail } from "@/backend/email";
import { rateLimit, clientKey, requireAuth, cronAuthorised } from "@/backend/guard";
import { listEnabled, dueForSend, markSent, setSubscription, getSubscription, MIN_HOURS_BETWEEN_SENDS } from "@/backend/digest-subscriptions";
import { listBrandsForOwner } from "@/backend/brand-store";

// Nightly Autopilot digest — the "here's what I did overnight and what needs
// approval" email. A scheduler (cron) calls this once a day with the account's
// active brands + the operator's email. Runs a cycle per brand and sends ONE
// combined morning digest via the SMTP email engine.
//
// POST { brands: BrandLite[], to, recipientName?, requestedLevel?, budgetGbp?,
//        dashboardUrl?, nowISO? }  → runs cycles + sends the digest.
// Demo-safe: with no SMTP/HTTP email keys the send is simulated (mode: demo).
export const runtime = "nodejs";
// Reserves the platform maximum. This route does slow external work (runs agents and sends on a schedule),
// and without a budget the function is killed part-way through: the caller
// gets no JSON at all — just "Request failed" — and any work already done
// goes unreported, which is how a send gets repeated.
export const maxDuration = 60;

const APP_URL = process.env.NEXT_PUBLIC_PRODUCTION_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "autopilot-nightly"), 30, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  // This route sends REAL email to a client-supplied recipient — it must be
  // gated. It's a scheduler endpoint: require the CRON_SECRET header (set on the
  // cron job) OR a signed-in user. Without either, refuse — an open email relay
  // from the platform's authenticated domain is an abuse/reputation risk.
  const cronOk = cronAuthorised(req).ok;
  const auth = cronOk ? null : await requireAuth(req);
  if (auth && !auth.ok) return NextResponse.json({ error: "Unauthorised — call it as the scheduler or sign in." }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  // Subscribing to the morning digest.
  //
  // The address is NOT taken from the body. It is the signed-in account's own
  // email, because a nightly job that mails whatever address a caller supplied
  // is a relay that repeats itself for ever. Nobody can subscribe somebody else.
  if (typeof body.action === "string" && (body.action === "subscribe" || body.action === "unsubscribe")) {
    if (!auth || !auth.ok) return NextResponse.json({ error: "Sign in to change the digest subscription." }, { status: 401 });
    const ownerId = auth.uid || "demo-owner";
    const own = (auth.email || "").trim();
    const fallback = typeof body.email === "string" ? body.email.trim() : "";
    // With Admin configured the account email is authoritative; in demo there
    // are no accounts, so the typed address is all there is.
    const email = auth.enforced ? own : (own || fallback);
    if (!email) {
      return NextResponse.json({ error: "This account has no email address on file, so there is nowhere to send a digest." }, { status: 400 });
    }
    const res = await setSubscription({
      ownerId, email,
      enabled: body.action === "subscribe",
      requestedLevel: typeof body.requestedLevel === "number" ? body.requestedLevel : undefined,
      budgetGbp: typeof body.budgetGbp === "number" ? body.budgetGbp : undefined,
      nowISO: new Date().toISOString(),
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({
      subscription: res.subscription,
      note: res.subscription.enabled
        ? `The digest goes to ${res.subscription.email} each morning, at most once every ${MIN_HOURS_BETWEEN_SENDS} hours. It reports what Autopilot queued — nothing is sent or published to your customers by it.`
        : "Switched off. Nothing further will be sent.",
    });
  }

  const to = typeof body.to === "string" ? body.to.trim() : "";
  if (!to) return NextResponse.json({ error: "to (recipient email) is required" }, { status: 400 });

  const rawBrands = Array.isArray(body.brands) ? body.brands : [];
  const brands: BrandLite[] = rawBrands
    .map((b) => (b ?? {}) as Record<string, unknown>)
    .filter((b) => typeof b.id === "string" && b.id && typeof b.name === "string" && b.name)
    .map((b) => ({
      id: String(b.id), name: String(b.name),
      industry: typeof b.industry === "string" ? b.industry : undefined,
      product: typeof b.product === "string" ? b.product : undefined,
      audience: typeof b.audience === "string" ? b.audience : undefined,
      location: typeof b.location === "string" ? b.location : undefined,
      offer: typeof b.offer === "string" ? b.offer : undefined,
      goal: typeof b.goal === "string" ? b.goal : undefined,
    }));
  if (brands.length === 0) return NextResponse.json({ error: "brands[] is required (at least one brand with id + name)" }, { status: 400 });

  const nowISO = typeof body.nowISO === "string" && body.nowISO ? body.nowISO : new Date().toISOString();
  const requestedLevel = typeof body.requestedLevel === "number" ? body.requestedLevel : Number(body.requestedLevel) || 3;
  const budgetGbp = typeof body.budgetGbp === "number" ? body.budgetGbp : Number(body.budgetGbp) || 0;
  const dashboardUrl = (typeof body.dashboardUrl === "string" && body.dashboardUrl) ? body.dashboardUrl : `${APP_URL}/dashboard/autopilot`;
  const recipientName = typeof body.recipientName === "string" ? body.recipientName : undefined;

  const runs: AutopilotRun[] = brands.map((brand) => runAutopilotCycle({ brand, requestedLevel, budgetGbp, nowISO }));
  const { subject, html } = autopilotDigestEmail(runs, { recipientName, dashboardUrl });

  const send = await sendEmail({ to, subject, html, transactional: true });

  return NextResponse.json({
    sent: send.ok,
    mode: send.mode,
    provider: send.provider,
    subject,
    detail: send.detail,
    // Include the rendered HTML only when explicitly previewing (keeps sends lean).
    html: body.preview === true ? html : undefined,
    brands: runs.map((r) => ({ brand: r.brandName, autoExecuted: r.autoExecuted, queued: r.queued, projectedRevenueGbp: r.projectedRevenueGbp, grantedLevel: r.grantedLevel })),
  });
}

// THE CRON. This used to return documentation, so the scheduled job in
// vercel.json had never done anything since the day it was added — a route with
// a schedule attached and no work behind it.
//
// It now iterates the people who ASKED for the digest, reads their own brands
// from the store rather than from a request body, and sends one email each.
export async function GET(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "autopilot-cron"), 12, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const cron = cronAuthorised(req);
  if (!cron.ok) {
    // A signed-in operator may fire it to see what the schedule would do; that
    // path only ever reaches their OWN subscription, below.
    const auth = await requireAuth(req);
    if (!auth.ok) return NextResponse.json({ error: `Unauthorised — ${cron.reason}` }, { status: auth.status });
    const mine = auth.uid ? await getSubscription(auth.uid) : null;
    if (!mine) return NextResponse.json({ subscribed: false, note: "You are not subscribed to the morning digest." });
    return NextResponse.json(await runFor([mine], new Date().toISOString()));
  }

  const nowISO = new Date().toISOString();
  const subs = (await listEnabled()).filter((s) => dueForSend(s, nowISO));
  return NextResponse.json(await runFor(subs.slice(0, MAX_PER_TICK), nowISO, subs.length));
}

// How many accounts one tick will mail. The rest wait for the next firing and
// are reported, because a scheduler that silently drops half its work looks
// exactly like one that had nothing to do.
const MAX_PER_TICK = 25;

async function runFor(subs: { ownerId: string; email: string; requestedLevel: number; budgetGbp: number }[], nowISO: string, dueTotal?: number) {
  const results: Record<string, unknown>[] = [];
  for (const sub of subs) {
    const brands = await listBrandsForOwner(sub.ownerId).catch(() => []);
    if (!brands.length) {
      results.push({ ownerId: sub.ownerId, sent: false, why: "no brands on this account yet" });
      continue;
    }
    // Marked BEFORE the send: a duplicate digest is a complaint against the
    // sending domain every customer on this platform shares.
    await markSent(sub.ownerId, nowISO);

    const runs: AutopilotRun[] = brands.slice(0, 10).map((b) => runAutopilotCycle({
      brand: { id: b.id, name: b.name, industry: b.industry, product: b.product, audience: b.audience, location: b.location, offer: b.offer, goal: b.goal },
      requestedLevel: sub.requestedLevel, budgetGbp: sub.budgetGbp, nowISO,
    }));
    const { subject, html } = autopilotDigestEmail(runs, { dashboardUrl: `${APP_URL}/dashboard/autopilot` });
    const send = await sendEmail({ to: sub.email, subject, html, transactional: true });
    results.push({
      ownerId: sub.ownerId, sent: send.ok, mode: send.mode, brands: runs.length,
      queued: runs.reduce((a, r) => a + r.queued, 0),
    });
  }
  return {
    at: nowISO,
    due: dueTotal ?? subs.length,
    processed: subs.length,
    results,
    doctrine: "The digest reports what Autopilot queued for approval. It sends nothing to your customers, and it only goes to accounts that asked for it, at their own verified address.",
  };
}
