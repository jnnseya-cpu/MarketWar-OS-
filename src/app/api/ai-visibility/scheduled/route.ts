import { NextRequest, NextResponse } from "next/server";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey, requireAuth, cronAuthorised } from "@/backend/guard";
import { configuredProviders } from "@/backend/gateway";
import {
  runVisibilityCheck, saveRun, listRuns, classifyIntent, RUN_BUDGET_MS,
  type VisibilityQuestion,
} from "@/backend/ai-visibility";
import {
  getSchedule, setSchedule, listEnabled, isDue, alertFor, MIN_CADENCE_DAYS,
} from "@/backend/visibility-schedule";
import { sendEmail } from "@/backend/email";

// Weekly visibility runs.
//
// GET  ?brandId=…          → this brand's schedule
// PUT  { brandId, … }      → set it
// GET  ?cron=1             → run every brand that is due (Vercel cron / CRON_SECRET)
//
// The alert only fires when the trend engine calls the movement real. These
// models are non-deterministic, so alerting on every change would fire every
// week regardless of anything the customer did — and a notification that always
// fires is one nobody reads.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;

  if (p.get("cron") === "1") {
    // Credential only — a user-agent is a header anyone can set, and this
    // route runs a visibility sweep for every due brand at our expense.
    const cron = cronAuthorised(req);
    if (!cron.ok) return NextResponse.json({ error: `Forbidden — ${cron.reason}` }, { status: 403 });
    return NextResponse.json(await runDue());
  }

  const brandId = p.get("brandId") || "";
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const schedule = await getSchedule(brandId);
  return NextResponse.json({
    schedule,
    minCadenceDays: MIN_CADENCE_DAYS,
    note: schedule.enabled
      ? `Runs every ${schedule.cadenceDays} days on the same ${schedule.questions.length} questions. Changing the questions restarts the comparison, so the trend line only means something while they stay the same.`
      : "Not scheduled. A single run is a sample — the trend across runs is the thing worth watching, and that only exists if the runs keep happening.",
  });
}

export async function PUT(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "vis-schedule"), 20, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const brandId = s(body.brandId);
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const questions = Array.isArray(body.questions)
    ? (body.questions as unknown[]).map(s).filter(Boolean).slice(0, 8)
    : undefined;
  const enabled = Boolean(body.enabled);
  if (enabled && (!questions?.length || !s(body.business))) {
    return NextResponse.json({ error: "A schedule needs a brand name and at least one question — there is nothing to ask otherwise." }, { status: 400 });
  }

  const requested = Number(body.cadenceDays);
  const schedule = await setSchedule(brandId, {
    enabled,
    questions,
    business: s(body.business) || undefined,
    domain: s(body.domain) || undefined,
    notifyEmail: s(body.notifyEmail) || undefined,
    cadenceDays: Number.isFinite(requested) ? requested : undefined,
  });

  return NextResponse.json({
    schedule,
    note: [
      enabled
        ? `Scheduled. The next run happens within ${schedule.cadenceDays} days of the last one.`
        : "Schedule turned off. Existing runs are kept.",
      Number.isFinite(requested) && requested < MIN_CADENCE_DAYS
        ? `Asked for every ${requested} day(s); set to ${MIN_CADENCE_DAYS}. These models return different companies hour to hour, so running more often buys a noisier line at a higher cost, not a better one.`
        : "",
      enabled && !s(body.notifyEmail)
        ? "No alert address set, so movement is recorded on the page but nothing is sent."
        : "",
    ].filter(Boolean).join(" "),
  });
}

// ---------------------------------------------------------------------------

async function runDue() {
  const assistants = configuredProviders();
  if (!assistants.length) {
    return { ran: 0, alerted: 0, skipped: "No AI provider is configured, so nothing could be asked. No schedules were consumed." };
  }

  const due = (await listEnabled()).filter((sc) => isDue(sc));
  const results: { brandId: string; asked: number; alerted: boolean; emailed: boolean; error?: string }[] = [];

  for (const sc of due) {
    // Each brand gets its own budget under this route's ceiling, and the loop
    // stops rather than being killed part-way with schedules half-updated.
    const started = Date.now();
    try {
      const questions: VisibilityQuestion[] = sc.questions.map((text) => ({
        id: text.slice(0, 40), text, intent: classifyIntent(text, sc.business),
      }));
      const run = await runVisibilityCheck(
        { brandId: sc.brandId, brand: sc.business, domain: sc.domain, questions, assistants },
        new Date().toISOString(), {}, { deadline: started + RUN_BUDGET_MS },
      );
      await saveRun(run);
      // Only mark it run when a run actually happened — a run where nothing could
      // be asked must not consume the week.
      if (run.askedCount > 0) await setSchedule(sc.brandId, { lastRunAt: run.ranAt });

      const alert = alertFor(await listRuns(sc.brandId, 12));
      let emailed = false;
      if (alert && sc.notifyEmail) {
        const html = alert.body
          .split("\n")
          .map((line) => (line ? `<p>${line.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string))}</p>` : ""))
          .join("");
        // Transactional: the customer asked for this alert, so it is not
        // marketing and must not be filtered as such.
        const sent = await sendEmail({
          to: sc.notifyEmail, subject: alert.subject, html, transactional: true,
        }).catch(() => null);
        emailed = Boolean(sent?.ok);
      }
      results.push({ brandId: sc.brandId, asked: run.askedCount, alerted: Boolean(alert), emailed });
    } catch (e) {
      // A brand that fails does not stop the rest, and its week is not consumed.
      results.push({ brandId: sc.brandId, asked: 0, alerted: false, emailed: false, error: (e as Error).message });
    }
  }

  return {
    ran: results.filter((r) => r.asked > 0).length,
    alerted: results.filter((r) => r.alerted).length,
    due: due.length,
    results,
    note: "Every run is recorded. An alert is only raised where the movement is larger than these models produce on their own — silence means the number moved within the noise, not that nothing ran.",
  };
}
