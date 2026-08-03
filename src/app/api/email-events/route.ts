import { NextRequest, NextResponse } from "next/server";
import { resolveBrandAccess } from "@/backend/brand-access";
import { eventStats, suppressedEmails, brandEvents } from "@/backend/email-events";
import { engagementSanity } from "@/backend/email-bot-filter";
import { byReceivingProvider, reputationVerdict } from "@/backend/deliverability";
import { improvements } from "@/backend/email-improve";
import { listDomains } from "@/backend/sending-domains";
import { getWarmup } from "@/backend/email-warmup";

// Engagement stats for a brand's Email Center — opens/clicks/bounces/complaints
// aggregated from the real delivery-event ledger, the suppression count, and
// today's warm-up allowance. Ownership-enforced; read-only.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId") || "";
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const today = new Date().toISOString().slice(0, 10);
  const [stats, suppressed, warmup, ledger, domains] = await Promise.all([
    eventStats(brandId), suppressedEmails(brandId), getWarmup(brandId, today), brandEvents(brandId).catch(() => []),
    listDomains(brandId).catch(() => []),
  ]);

  // Where the mail actually went. An 8.7% open rate across the board is a
  // mystery; "Gmail 22%, Microsoft 0.4%" names the filter that is blocking you
  // and the company to go and fix it with.
  const providers = byReceivingProvider(ledger);
  const reputation = reputationVerdict({ sent: stats.sent, bounces: stats.bounce, complaints: stats.complaint });
  // Click-to-open is the tell. A live account showed 79 clicks from 98 openers —
  // 81%, where real people run 10–15% — because every corporate mail scanner
  // fetches every link on delivery and nothing was distinguishing them.
  const sanity = engagementSanity({
    sent: stats.sent, opens: stats.open, clicks: stats.click,
    machineOpens: stats.machineOpen, machineClicks: stats.machineClick,
  });
  // Why the rates are what they are, and the one thing to change. The tiles used
  // to show 5.9% in green with nothing behind it; this is the "behind it".
  const improve = improvements({
    events: ledger,
    domains: domains.map((d) => ({ domain: d.domain, status: d.status })),
    machineOpens: stats.machineOpen,
    machineClicks: stats.machineClick,
    bounces: stats.bounce,
    complaints: stats.complaint,
    unsubscribes: stats.unsubscribe,
    platformFrom: process.env.EMAIL_FROM || "",
  });

  return NextResponse.json({
    ...stats,
    suppressed: suppressed.size,
    warmup,
    engagement: sanity,
    improve,
    providers,
    reputation,
    note: [
      sanity.note,
      stats.machineOpen || stats.machineClick
        ? `${stats.machineOpen} open(s) and ${stats.machineClick} click(s) were identified as machines and are excluded from the rates above. They are kept in the ledger as evidence of delivery.`
        : "",
      reputation.halt
        ? "SENDING IS BLOCKED for this brand until the list is cleaned — see the reputation block."
        : "",
      providers.some((p) => p.judgeable && p.openRatePct < 3)
        ? `Open rates near zero at ${providers.filter((p) => p.judgeable && p.openRatePct < 3).map((p) => p.provider).join(", ")} while others are normal means that provider is filtering you, not that the copy is weak.`
        : "",
      "Events recorded before machine detection existed carry no verdict and are counted as human — they cannot be reclassified after the fact, so early figures read higher than later ones.",
    ].filter(Boolean).join(" "),
  });
}
