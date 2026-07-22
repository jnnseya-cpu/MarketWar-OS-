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

const COLLECTION = "blog_posts";
const mem = new Map<string, BlogPost>(); // slug -> post

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
    return doc.exists ? (doc.data() as BlogPost) : null;
  }
  return mem.get(slug) ?? null;
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
  return posts.sort((a, b) => (b.publishedAt || b.createdAt).localeCompare(a.publishedAt || a.createdAt));
}

export async function incrementViews(slug: string): Promise<number> {
  if (adminConfigured && adminDb) {
    const ref = adminDb.collection(COLLECTION).doc(slug);
    const snap = await ref.get();
    if (!snap.exists) return 0;
    await ref.update({ views: FieldValue.increment(1) });
    return ((snap.data() as BlogPost).views || 0) + 1;
  }
  const p = mem.get(slug);
  if (!p) return 0;
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
