import { NextRequest, NextResponse } from "next/server";
import { getSeoSettings, setSeoSettings, runBrandSeoPost, listEnabledBrands, isDue, ACU_PER_POST } from "@/backend/seo-autopilot";
import { listPostsForBrand } from "@/backend/blog-store";
import { getWallet, meteringExempt } from "@/backend/wallet";
import { PLANS, planEconomics } from "@/backend/subscription";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey, cronAuthorised } from "@/backend/guard";

// Customer SEO autopilot — each brand's OWN branded blog.
//
// POST { action: "settings", brandId }              → current settings + posts
// POST { action: "save", brandId, ... }             → update cadence/topics/auto
// POST { action: "run", brandId, brandName, topic? }→ generate ONE post NOW
// GET  ?cron=1 (x-cron-secret)                      → run every due, enabled brand
//
// Every generation costs the BRAND ACU_PER_POST ACUs, whether pushed manually or
// produced by the scheduler — it spends the same AI budget either way. The wallet
// is debited before generation and refunded if generation fails.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SITE = (process.env.NEXT_PUBLIC_PRODUCTION_URL || "https://www.marketwaros.com").replace(/\/$/, "");

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "seo-autopilot"), 30, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const brandId = s("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });

  // Brand ownership — a customer can only touch their own blog.
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const action = s("action") || "settings";

  if (action === "settings") {
    const [settings, posts, wallet] = await Promise.all([
      getSeoSettings(brandId), listPostsForBrand(brandId), getWallet(brandId),
    ]);
    // Make "included in your plan" PROVABLE: posts are paid from the plan's own
    // monthly ACU allocation, so show how many that actually buys and how many
    // the current balance covers right now. No new charge, no separate add-on.
    const plan = PLANS.find((pl) => pl.id === wallet.planId) ?? PLANS[0];
    const eco = planEconomics(plan);
    const includedPerMonth = Math.floor((eco.monthlyAcus || eco.annualAcus || 0) / ACU_PER_POST);
    // A STAFF CALLER IS NOT SHORT OF CREDITS, so do not tell them they are. The
    // wallet arithmetic below is true of the wallet and false of the person
    // reading it: staff runs are not billed, so "you can afford 0 more right
    // now" would be a refusal the platform is not going to make.
    const staff = meteringExempt(access);
    if (staff.exempt) {
      return NextResponse.json({
        settings, acuPerPost: ACU_PER_POST,
        plan: {
          id: plan.id, name: plan.name, monthlyAcus: eco.monthlyAcus,
          includedPostsPerMonth: includedPerMonth,
          balanceAcu: wallet.balanceAcu, postsAffordableNow: null, unmetered: true,
        },
        posts: posts.map((p) => ({ slug: p.slug, title: p.title, status: p.status, createdAt: p.createdAt, url: `${SITE}/blog/${p.slug}` })),
        note: `${staff.why} Posts run from here are not charged, so there is no balance to run out of.`,
      });
    }
    const affordableNow = Math.floor(wallet.balanceAcu / ACU_PER_POST);
    return NextResponse.json({
      settings, acuPerPost: ACU_PER_POST,
      plan: {
        id: plan.id, name: plan.name, monthlyAcus: eco.monthlyAcus,
        includedPostsPerMonth: includedPerMonth,
        balanceAcu: wallet.balanceAcu, postsAffordableNow: affordableNow,
      },
      posts: posts.map((p) => ({ slug: p.slug, title: p.title, status: p.status, createdAt: p.createdAt, url: `${SITE}/blog/${p.slug}` })),
      note: includedPerMonth > 0
        ? `Included in your ${plan.name} plan: ${eco.monthlyAcus.toLocaleString("en-GB")} ACUs a month covers about ${includedPerMonth} posts. Each post uses ${ACU_PER_POST} ACUs from that same allowance — there is no separate SEO fee. You can afford ${affordableNow} more right now.`
        : `Each post uses ${ACU_PER_POST} ACUs from your wallet. You can afford ${affordableNow} right now — top up or upgrade for a monthly allowance.`,
    });
  }

  if (action === "save") {
    const settings = await setSeoSettings(brandId, {
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      cadence: s("cadence") === "daily" ? "daily" : s("cadence") === "weekly" ? "weekly" : undefined,
      topics: Array.isArray(body.topics) ? (body.topics as unknown[]).map(String) : undefined,
      keywords: typeof body.keywords === "string" ? body.keywords : undefined,
      autoPublish: typeof body.autoPublish === "boolean" ? body.autoPublish : undefined,
    });
    return NextResponse.json({ settings, note: settings.enabled ? `Autopilot on (${settings.cadence}). ${ACU_PER_POST} ACUs per post.` : "Autopilot off — you can still publish manually." });
  }

  if (action === "run") {
    const result = await runBrandSeoPost({
      brandId, brandName: s("brandName") || brandId, website: s("website"),
      topic: s("topic") || undefined, category: s("category") || undefined,
      trigger: "manual", siteBase: SITE,
      // The caller, carried across. Staff pressing this button are not billed
      // for their own platform — the same rule every metered route already
      // applies, which this path used to be the exception to.
      spender: access,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 402 });
  }

  return NextResponse.json({ error: "Unknown action — use settings, save or run" }, { status: 400 });
}

// Scheduler: generate for every enabled brand that is due under its cadence.
export async function GET(req: NextRequest) {
  // A user-agent is a header anyone can set, and this route runs agents for
  // every due brand — that made it an anonymous button for spending the
  // platform's provider budget. Credential only.
  const cron = cronAuthorised(req);
  if (!cron.ok) return NextResponse.json({ error: `Unauthorised — scheduler only. ${cron.reason}` }, { status: 401 });
  const brands = await listEnabledBrands();
  const due = brands.filter((b) => isDue(b));
  const results: { brandId: string; ok: boolean; charged: number; error?: string; slug?: string }[] = [];
  for (const b of due.slice(0, 50)) {
    // NO CALLER — the scheduler is not a person, so there is no role that could
    // exempt this and the brand's wallet pays. Passed explicitly so a reader can
    // see the exemption was considered rather than forgotten.
    const r = await runBrandSeoPost({ brandId: b.brandId, brandName: b.brandId, trigger: "auto", siteBase: SITE, spender: null });
    results.push({ brandId: b.brandId, ok: r.ok, charged: r.charged, error: r.error, slug: r.post?.slug });
  }
  return NextResponse.json({
    enabled: brands.length, due: due.length, ran: results.length,
    charged: results.reduce((n, r) => n + r.charged, 0),
    results,
    note: "Brands with insufficient ACUs are skipped with an error and charged nothing.",
  });
}
