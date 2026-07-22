// Blog — shared types + helpers (pure, client-safe; no sided imports).

export type BlogStatus = "draft" | "published";

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  readMinutes: number;
  content: string; // markdown
  author: string;
  status: BlogStatus;
  mode: "live" | "demo";
  views: number;
  createdAt: string;
  publishedAt: string | null;
};

export function slugify(s: string): string {
  const base = (s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return base || "post";
}

export function readMinutes(markdown: string): number {
  const words = (markdown || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
