import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/backend/guard";
import { spendThisMonth, spendVerdict, MONTHLY_CEILING_USD } from "@/backend/ai-spend";

// What the PLATFORM is spending, as opposed to what customers are.
//
// Every other meter in this product watches a customer's ACU balance. This one
// watches the owner's provider bill, which nothing was watching at all — a live
// month reached $33.45 on one provider with no revenue against it, and nothing
// in the code would have stopped it at ten times that.
//
// Owner-only: it is a business figure, not a customer one.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, { scope: "platform_admin" });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const summary = spendThisMonth();
  const verdict = spendVerdict(false);

  return NextResponse.json({
    ...summary,
    ceilingUsd: MONTHLY_CEILING_USD,
    blocked: !verdict.allowed,
    note: [
      summary.note,
      MONTHLY_CEILING_USD > 0
        ? `Ceiling: $${MONTHLY_CEILING_USD} of UNPAID spend a month. Work a customer paid ACUs for is exempt and always runs.`
        : "No ceiling set. AI_MONTHLY_CEILING_USD caps unpaid spend — crons, demo traffic and internal testing — without ever blocking a paying customer.",
      "Set a hard limit at the provider console too. This is the early warning; that is the backstop that survives any bug in here.",
    ].join(" "),
  });
}
