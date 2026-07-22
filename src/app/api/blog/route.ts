import { NextRequest, NextResponse } from "next/server";
import { listPosts, getPost, savePost, incrementViews, deletePost } from "@/backend/blog-store";
import { generateArticle } from "@/backend/blog-generator";
import { slugify, readMinutes, type BlogPost } from "@/shared/blog";
import { requireAuth, rateLimit, clientKey } from "@/backend/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Blog API.
// GET  ?slug=…    → a single published post
// GET  ?admin=1   → all posts incl. drafts (platform_admin only)
// GET             → published posts (public)
// POST { action: "view", slug }                              → public view counter
// POST { action: "generate", topic, category?, keywords? }   → AI draft (admin)
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

  try {
    if (action === "generate") {
      const topic = typeof body.topic === "string" ? body.topic.trim() : "";
      if (!topic) return NextResponse.json({ error: "topic required" }, { status: 400 });
      const category = typeof body.category === "string" && body.category.trim() ? body.category.trim() : "Growth";
      const gen = await generateArticle({ topic, category, keywords: typeof body.keywords === "string" ? body.keywords : undefined });
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
      return NextResponse.json({ post });
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
