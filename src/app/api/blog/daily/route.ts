import { NextRequest, NextResponse } from "next/server";
import { generateArticle } from "@/backend/blog-generator";
import { savePost, getPost, listPosts } from "@/backend/blog-store";
import type { BlogPost } from "@/shared/blog";
import { requireAuth } from "@/backend/guard";

// SEO autopilot — the DAILY branded post, published while you sleep.
//
// Scheduled by Vercel Cron (see vercel.json). Generates one article from the
// rotating topic plan, publishes it and pings the search engines with the
// sitemap so it gets crawled — the whole loop, unattended.
//
// Auth: the scheduler sends x-cron-secret (CRON_SECRET). A signed-in admin may
// also trigger it manually to preview the day's post. Never public — generation
// spends real AI budget.
//
// Idempotent per day: if a post was already created today it does nothing, so a
// retried or double-fired cron can never publish twice.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Writes a full post via DOCUMENT_BUDGET (100s). A 60s function is killed
// mid-generation, so the cron silently produced nothing.
export const maxDuration = 120;

const SITE = (process.env.NEXT_PUBLIC_PRODUCTION_URL || "https://www.marketwaros.com").replace(/\/$/, "");

// The rotating plan. Each day takes the next topic, so coverage compounds
// instead of repeating one keyword. Editable without touching the scheduler.
const TOPIC_PLAN: { topic: string; category: string; keywords: string }[] = [
  { topic: "How small businesses get found by ChatGPT and AI assistants", category: "AI Search", keywords: "AI search optimisation, GEO, llms.txt, get cited by ChatGPT" },
  { topic: "Cutting customer acquisition cost without cutting leads", category: "Growth", keywords: "reduce CAC, customer acquisition cost, lead cost" },
  { topic: "Owned distribution: why email and WhatsApp beat paid ads", category: "Growth", keywords: "owned channels, email marketing ROI, WhatsApp marketing" },
  { topic: "Turning a dormant customer list into repeat revenue", category: "Retention", keywords: "win-back campaign, dormant customers, reactivation email" },
  { topic: "The schema and llms.txt setup that makes AI quote your prices", category: "AI Search", keywords: "product schema, structured data, llms.txt, AI citations" },
  { topic: "Landing pages that convert without a design team", category: "Conversion", keywords: "landing page conversion, high converting landing page" },
  { topic: "Local SEO for service businesses: the parts that actually move rank", category: "Local SEO", keywords: "local SEO, Google Business Profile, local rankings" },
];

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 80);
}
function readMinutes(content: string): number {
  return Math.max(1, Math.round(content.split(/\s+/).length / 200));
}

// Tell the search engines a new URL exists. Best-effort — never fails the run.
async function pingSitemap(): Promise<string[]> {
  const sitemap = `${SITE}/sitemap.xml`;
  const pinged: string[] = [];
  await Promise.all([
    `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemap)}`,
    `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemap)}`,
  ].map(async (u) => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(u, { signal: ctrl.signal });
      clearTimeout(t);
      if (r.ok) pinged.push(new URL(u).hostname);
    } catch { /* best effort */ }
  }));
  return pinged;
}

async function runDaily(force: boolean) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // Idempotency: one post per day, so a re-fired cron cannot double-publish.
  const existing = await listPosts();
  const alreadyToday = existing.find((p) => (p.createdAt || "").slice(0, 10) === today);
  if (alreadyToday && !force) {
    return { ran: false, reason: "A post was already created today.", slug: alreadyToday.slug, title: alreadyToday.title };
  }

  // Rotate through the plan by day-of-year so topics never repeat back-to-back.
  const dayIndex = Math.floor(now.getTime() / 86_400_000);
  const plan = TOPIC_PLAN[dayIndex % TOPIC_PLAN.length];

  const gen = await generateArticle({ topic: plan.topic, category: plan.category, keywords: plan.keywords });

  let slug = slugify(gen.title);
  if (await getPost(slug)) slug = `${slug}-${today.replace(/-/g, "")}`;

  const post: BlogPost = {
    id: slug, slug, title: gen.title, excerpt: gen.excerpt, category: plan.category,
    readMinutes: readMinutes(gen.content), content: gen.content,
    author: "MarketWar OS", status: "published", mode: gen.mode, views: 0,
    createdAt: now.toISOString(), publishedAt: now.toISOString(),
  };
  await savePost(post);
  const pinged = await pingSitemap();

  return {
    ran: true, slug, title: post.title, category: post.category, mode: post.mode,
    url: `${SITE}/blog/${slug}`, pinged,
    note: `Published "${post.title}" and pinged ${pinged.length ? pinged.join(", ") : "no engines (ping unavailable)"}.`,
  };
}

export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get("x-cron-secret") || "";
  const cronOk = Boolean(process.env.CRON_SECRET) && cronSecret === process.env.CRON_SECRET;
  // Vercel Cron sends its own bearer; accept it too when CRON_SECRET matches.
  if (!cronOk) {
    const auth = await requireAuth(req, { scope: "platform_admin" });
    if (!auth.ok) {
      return NextResponse.json({ error: "Unauthorised — set the x-cron-secret header (scheduler) or sign in as an administrator." }, { status: auth.status });
    }
  }
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* cron sends no body */ }
  try {
    return NextResponse.json(await runDaily(body.force === true));
  } catch (e) {
    return NextResponse.json({ ran: false, error: e instanceof Error ? e.message : "Daily post failed" }, { status: 502 });
  }
}

// Vercel Cron issues GET requests.
export async function GET(req: NextRequest) {
  const cronSecret = req.headers.get("x-cron-secret") || "";
  const vercelCron = (req.headers.get("user-agent") || "").includes("vercel-cron");
  const cronOk = (Boolean(process.env.CRON_SECRET) && cronSecret === process.env.CRON_SECRET) || vercelCron;
  if (!cronOk) {
    const auth = await requireAuth(req, { scope: "platform_admin" });
    if (!auth.ok) return NextResponse.json({ error: "Unauthorised" }, { status: auth.status });
  }
  try {
    return NextResponse.json(await runDaily(false));
  } catch (e) {
    return NextResponse.json({ ran: false, error: e instanceof Error ? e.message : "Daily post failed" }, { status: 502 });
  }
}
