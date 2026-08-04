import { NextRequest, NextResponse } from "next/server";
import { listPosts, getPost, savePost, incrementViews, deletePost } from "@/backend/blog-store";
import { generateArticle } from "@/backend/blog-generator";
import { linkAudit, linkMenu } from "@/backend/blog-links";
import { slugify, readMinutes, type BlogPost } from "@/shared/blog";
import { requireAuth, rateLimit, clientKey } from "@/backend/guard";
import { meterAction } from "@/backend/wallet";

// A document generation runs behind this route, and DOCUMENT_BUDGET gives the
// gateway 100s. Without a maxDuration the function is killed at the platform
// default of ~10s — long before any provider could answer — so the generation
// could never have completed no matter what the gateway did.
export const maxDuration = 300;

// A run of articles, bounded by the clock rather than by hope. Each generation
// is a deep document call; the deadline leaves room to finish the one in flight,
// save it and answer, so a batch never dies holding work nobody sees.
const MAX_BATCH = 10;
const BATCH_DEADLINE_MS = 200_000;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Blog API.
// GET  ?slug=…    → a single published post
// GET  ?admin=1   → all posts incl. drafts (platform_admin only)
// GET             → published posts (public)
// POST { action: "view", slug }                              → public view counter
// POST { action: "generate", topic | topics[], category?, keywords? } → AI draft(s) (admin)
// POST { action: "audit-links" }                             → per-post link report (admin)
// POST { action: "publish"|"unpublish"|"delete", slug }      → admin
export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug");
    if (slug) {
      const post = await getPost(slug);
      if (!post || post.status !== "published") return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ post });
    }
    if (req.nextUrl.searchParams.get("admin") === "1") {
      const auth = await requireAuth(req, { scope: "platform_admin" });
      if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
      return NextResponse.json({ posts: await listPosts({ includeDrafts: true }) });
    }
    return NextResponse.json({ posts: await listPosts() });
  } catch {
    return NextResponse.json({ posts: [] });
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "blog"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "";
  const slug = typeof body.slug === "string" ? body.slug : "";

  // Public: count a view.
  if (action === "view") {
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
    try { return NextResponse.json({ views: await incrementViews(slug) }); }
    catch { return NextResponse.json({ views: 0 }); }
  }

  // Everything else is owner-only.
  const auth = await requireAuth(req, { scope: "platform_admin" });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // Writing an article is an AI action, so it is metered like every other one.
  // For MarketWar's own staff this is a no-op — meterAction exempts staff, so
  // the owner is never blocked from publishing by a wallet — but the rule holds
  // uniformly, and an administrator who is not staff pays for what they spend.
  if (action === "generate") {
    const topicCount = Array.isArray(body.topics) ? Math.max(1, body.topics.length) : 1;
    const meter = await meterAction(auth, "llm", Math.min(topicCount, MAX_BATCH));
    if (!meter.allowed) return NextResponse.json({ error: meter.error, balanceAcu: meter.balanceAcu }, { status: meter.status });
  }

  try {
    if (action === "generate") {
      // ONE TOPIC OR SEVERAL. Three articles existed because writing one meant
      // typing one topic and waiting, ten times over. A list produces a run in
      // a single action — and stops on the clock rather than being killed
      // mid-generation, reporting the topics it did not reach by name.
      const single = typeof body.topic === "string" ? body.topic.trim() : "";
      const many = Array.isArray(body.topics)
        ? body.topics.map((t) => (typeof t === "string" ? t.trim() : "")).filter(Boolean)
        : [];
      const topics = (many.length ? many : single ? [single] : []).slice(0, MAX_BATCH);
      if (!topics.length) return NextResponse.json({ error: "topic required" }, { status: 400 });
      const category = typeof body.category === "string" && body.category.trim() ? body.category.trim() : "Growth";
      const keywords = typeof body.keywords === "string" ? body.keywords : undefined;

      const started = Date.now();
      const created: BlogPost[] = [];
      const linkNotes: { slug: string; note: string }[] = [];
      const skipped: { topic: string; reason: string }[] = [];

      for (const [i, topic] of topics.entries()) {
        // The wall clock is the real constraint: this function is killed at
        // maxDuration and a generation cut off halfway leaves nothing behind.
        // Stop while there is time to save and answer.
        if (i > 0 && Date.now() - started > BATCH_DEADLINE_MS) {
          for (const t of topics.slice(i)) skipped.push({ topic: t, reason: "ran out of time in this request — run it again for the rest" });
          break;
        }
        // Rebuilt each time so article two may link to article one.
        const menu = linkMenu(await listPosts().catch(() => []));
        try {
          const gen = await generateArticle({ topic, category, keywords, menu });
          const now = new Date().toISOString();
          let s = slugify(gen.title);
          if (await getPost(s)) s = `${s}-${now.slice(11, 19).replace(/:/g, "")}`;
          const post: BlogPost = {
            id: s, slug: s, title: gen.title, excerpt: gen.excerpt, category,
            readMinutes: readMinutes(gen.content), content: gen.content,
            author: "MarketWar OS", status: "draft", mode: gen.mode, views: 0,
            createdAt: now, publishedAt: null,
          };
          await savePost(post);
          created.push(post);
          linkNotes.push({ slug: s, note: gen.links.note });
        } catch (e) {
          // One bad topic must not lose the articles already written.
          skipped.push({ topic, reason: e instanceof Error ? e.message : "generation failed" });
        }
      }

      if (!created.length) {
        return NextResponse.json({ error: skipped[0]?.reason || "Blog engine error", skipped }, { status: 502 });
      }
      // `post` stays for the single-topic caller that has always read it.
      return NextResponse.json({ post: created[0], posts: created, links: linkNotes, skipped });
    }

    if (action === "audit-links") {
      const posts = await listPosts({ includeDrafts: true });
      return NextResponse.json({
        audits: posts.map((p) => ({
          slug: p.slug, title: p.title, status: p.status,
          ...linkAudit(p.content || "", linkMenu(posts, p.slug)),
        })),
      });
    }

    if (action === "publish" || action === "unpublish") {
      const post = await getPost(slug);
      if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
      post.status = action === "publish" ? "published" : "draft";
      if (action === "publish" && !post.publishedAt) post.publishedAt = new Date().toISOString();
      await savePost(post);
      return NextResponse.json({ post });
    }

    if (action === "delete") {
      await deletePost(slug);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Blog engine error" }, { status: 502 });
  }
}
