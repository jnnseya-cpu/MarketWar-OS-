import { NextRequest, NextResponse } from "next/server";
import { savePartnerApplication, type PartnerTier } from "@/backend/partner-applications";
import { rateLimit, clientKey } from "@/backend/guard";

// PUBLIC partner-application capture — the real submission behind the Growth &
// Influencers page. No auth (public marketing page), but rate-limited and
// validated. Stores the application so it can be reviewed + onboarded as tiers
// open. Nothing fabricated: it confirms only that we captured the application.
//
// POST { tier, name, email, audience, website?, notes? }
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIERS: PartnerTier[] = ["promoter", "creator", "affiliate", "agency"];
const EMAIL = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "growth-apply"), 15, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Too many submissions — try again shortly." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid submission" }, { status: 400 }); }

  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const n = (k: string) => (typeof body[k] === "number" ? (body[k] as number) : Number(body[k]) || 0);
  const tier = (s("tier") || "promoter") as PartnerTier;
  const name = s("name");
  const email = s("email");
  const audience = s("audience");
  const website = s("website");
  const programmes = Math.max(1, Math.min(100, Math.round(n("programmes")) || 1));
  const followers = Math.max(0, Math.round(n("followers")));
  const notes = s("notes").slice(0, 800);

  if (!TIERS.includes(tier)) return NextResponse.json({ error: "Pick a valid tier." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Please add your name." }, { status: 400 });
  if (!EMAIL.test(email)) return NextResponse.json({ error: "Please add a valid email." }, { status: 400 });
  if (!audience) return NextResponse.json({ error: "Tell us where you have reach (channels + rough audience size)." }, { status: 400 });

  const nowISO = typeof body.nowISO === "string" ? body.nowISO : new Date().toISOString();
  const record = await savePartnerApplication({ tier, name, email, audience, website, programmes, followers, notes, nowISO });

  return NextResponse.json({
    ok: true,
    applicationId: record.id,
    message: followers >= 10_000
      ? `Application received — you're above the 10k-follower payout threshold. We'll match you to brands and issue a code/link for each of your ${programmes} programme(s).`
      : `Application received. You can promote and accrue now; payout unlocks once you reach 10,000 total followers. We'll match you to brands and issue a code/link per programme.`,
  });
}
