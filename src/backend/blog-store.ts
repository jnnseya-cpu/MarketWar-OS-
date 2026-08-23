// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Blog store — Firestore (blog_posts/{slug}) when the Admin SDK is configured,
// otherwise an in-memory map so the engine works with zero config. Views are
// incremented atomically in Firestore.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import type { BlogPost } from "@/shared/blog";
import { SEO_ARTICLES } from "@/shared/seo-articles";

const COLLECTION = "blog_posts";
const mem = new Map<string, BlogPost>(); // slug -> post

// ---------------------------------------------------------------------------
// The evergreen cluster
//
// These are code, not rows, because they are the pages the site is meant to rank
// for — and a page that exists only when Firestore is configured is a page
// missing from the sitemap on every deployment that is not.
//
// Merged in HERE rather than in each consumer, so the article route, the index,
// the related-post logic and the sitemap pick them up with no changes at all. A
// stored post with the same slug wins, so one can always be superseded by an
// edited version without touching the code.
// ---------------------------------------------------------------------------
const EVERGREEN_AUTHOR = "MarketWar OS";
const EVERGREEN_PUBLISHED = "2026-08-10T09:00:00.000Z";

const evergreen = (): BlogPost[] => SEO_ARTICLES.map((a) => ({
  id: `evergreen_${a.slug}`,
  slug: a.slug,
  title: a.title,
  excerpt: a.excerpt,
  category: a.category,
  readMinutes: a.readMinutes,
  content: a.content,
  author: EVERGREEN_AUTHOR,
  status: "published" as const,
  mode: "live" as const,
  views: 0,
  createdAt: EVERGREEN_PUBLISHED,
  publishedAt: EVERGREEN_PUBLISHED,
}));

export const evergreenSlugs = (): string[] => SEO_ARTICLES.map((a) => a.slug);

export async function savePost(post: BlogPost): Promise<void> {
  if (adminConfigured && adminDb) {
    await adminDb.collection(COLLECTION).doc(post.slug).set(post, { merge: true });
    return;
  }
  mem.set(post.slug, post);
}

export async function getPost(slug: string): Promise<BlogPost | null> {
  if (!slug) return null;
  if (adminConfigured && adminDb) {
    const doc = await adminDb.collection(COLLECTION).doc(slug).get();
    if (doc.exists) return doc.data() as BlogPost;
  } else {
    const local = mem.get(slug);
    if (local) return local;
  }
  return evergreen().find((p) => p.slug === slug) ?? null;
}

export async function listPostsForBrand(brandId: string): Promise<BlogPost[]> {
  const all = await listPosts();
  return all.filter((p) => (p.brandId || "") === brandId);
}

export async function listPosts(opts?: { includeDrafts?: boolean }): Promise<BlogPost[]> {
  let posts: BlogPost[];
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection(COLLECTION).get();
    posts = snap.docs.map((d) => d.data() as BlogPost);
  } else {
    posts = [...mem.values()];
  }
  if (!opts?.includeDrafts) posts = posts.filter((p) => p.status === "published");
  // A stored post with the same slug wins, so an evergreen article can always be
  // superseded by an edited version without a deploy.
  const stored = new Set(posts.map((p) => p.slug));
  posts = [...posts, ...evergreen().filter((p) => !stored.has(p.slug))];
  return posts.sort((a, b) => (b.publishedAt || b.createdAt).localeCompare(a.publishedAt || a.createdAt));
}

export async function incrementViews(slug: string): Promise<number> {
  // THE READ PATH KNEW ABOUT EVERGREEN ARTICLES AND THE WRITE PATH DID NOT.
  //
  // The thirteen evergreen articles are code, not rows — deliberately, so the
  // pages the site ranks for exist on a deployment with no Firestore. `getPost`
  // falls back to `evergreen()`, so they render. This did not, so `snap.exists`
  // was false and `mem.get` was undefined for every one of them: it returned 0,
  // the client set the counter to the 0 it was handed, and every article showed
  // "0 views" forever however many people read it.
  //
  // Counting one now CREATES the row from the evergreen definition. The article
  // stays code; only its view count becomes stored, which is the one part of it
  // that is not knowable at build time.
  const seed = (): BlogPost | null => evergreen().find((p) => p.slug === slug) ?? null;

  if (adminConfigured && adminDb) {
    const ref = adminDb.collection(COLLECTION).doc(slug);
    const snap = await ref.get();
    if (!snap.exists) {
      const ever = seed();
      if (!ever) return 0;
      // `set` with the whole post, so a later read gets a complete row rather
      // than a document containing nothing but a number.
      await ref.set({ ...ever, views: 1 }, { merge: true });
      return 1;
    }
    await ref.update({ views: FieldValue.increment(1) });
    return ((snap.data() as BlogPost).views || 0) + 1;
  }

  let p = mem.get(slug);
  if (!p) {
    const ever = seed();
    if (!ever) return 0;
    p = { ...ever };
    mem.set(slug, p);
  }
  p.views += 1;
  return p.views;
}

export async function deletePost(slug: string): Promise<void> {
  if (adminConfigured && adminDb) {
    await adminDb.collection(COLLECTION).doc(slug).delete();
    return;
  }
  mem.delete(slug);
}
