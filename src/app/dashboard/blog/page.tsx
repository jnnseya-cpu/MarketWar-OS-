"use client";

// SEO Blog Studio — generate an SEO article with AI, publish it to a shareable
// /blog/<slug> URL, and track views. Owner-only (platform_admin) via authedFetch.

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Loader2, Sparkles, Trash2, Send, EyeOff, Copy, Check, ExternalLink } from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";
import { authedFetch } from "@/frontend/api-client";
import type { BlogPost } from "@/shared/blog";

export default function BlogStudioPage() {
  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState("Growth");
  const [keywords, setKeywords] = useState("");
  const [busy, setBusy] = useState(false);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch("/api/blog?admin=1");
      const data = await res.json();
      setPosts(Array.isArray(data.posts) ? data.posts : []);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(action: string, slug?: string, extra?: Record<string, unknown>) {
    setBusy(true); setError(null);
    try {
      const res = await authedFetch("/api/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, slug, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Action failed"); return; }
      await load();
    } catch {
      setError("Could not reach the blog engine.");
    } finally {
      setBusy(false);
    }
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;
    await act("generate", undefined, { topic, category, keywords });
    setTopic(""); setKeywords("");
  }

  async function copyLink(slug: string) {
    const url = `${window.location.origin}/blog/${slug}`;
    try { await navigator.clipboard.writeText(url); setCopied(slug); setTimeout(() => setCopied(null), 1600); } catch { /* ignore */ }
  }

  const totalViews = posts.reduce((n, p) => n + (p.views || 0), 0);
  const published = posts.filter((p) => p.status === "published").length;

  return (
    <div>
      <PageHeader
        kicker="SEO Blog Studio"
        title="AI blog generator"
        subtitle="Generate an SEO-optimised article with AI, publish it to a shareable URL, and track its views — all from here."
      />

      <form onSubmit={generate} className="card mb-8 p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-slate-400">Topic</span>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. How local businesses win with WhatsApp-first funnels"
              className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-emerald-500/60" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-400">Category</span>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Growth"
              className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-emerald-500/60" />
          </label>
        </div>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-semibold text-slate-400">Target keywords (optional)</span>
          <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="whatsapp marketing, local lead generation"
            className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-emerald-500/60" />
        </label>
        <button type="submit" disabled={busy || !topic.trim()} className="btn-primary mt-4 justify-center disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate article
        </button>
        {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
      </form>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Pill tone="good">{posts.length} articles</Pill>
        <Pill tone="info">{published} published</Pill>
        <Pill tone="neutral">{totalViews.toLocaleString()} total views</Pill>
      </div>

      <div className="space-y-3">
        {posts.length === 0 && (
          <div className="card p-8 text-center text-sm text-slate-400">No articles yet — generate your first above.</div>
        )}
        {posts.map((p) => (
          <div key={p.slug} className="card p-4">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-300">{p.category}</span>
              <Pill tone={p.status === "published" ? "good" : "neutral"}>{p.status}</Pill>
              {p.mode === "demo" && <Pill tone="warn">starter copy</Pill>}
              <span className="text-slate-500">{p.readMinutes} min · {(p.views || 0).toLocaleString()} views</span>
            </div>
            <h3 className="font-display text-sm font-bold text-white">{p.title}</h3>
            <p className="mt-1 line-clamp-2 text-xs text-slate-400">{p.excerpt}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {p.status === "published" ? (
                <>
                  <Link href={`/blog/${p.slug}`} target="_blank" className="inline-flex items-center gap-1 rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-emerald-500/40">
                    <ExternalLink className="h-3.5 w-3.5" /> View
                  </Link>
                  <button onClick={() => copyLink(p.slug)} className="inline-flex items-center gap-1 rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-emerald-500/40">
                    {copied === p.slug ? <><Check className="h-3.5 w-3.5 text-emerald-400" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy link</>}
                  </button>
                  <button onClick={() => act("unpublish", p.slug)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:border-amber-500/40 disabled:opacity-60">
                    <EyeOff className="h-3.5 w-3.5" /> Unpublish
                  </button>
                </>
              ) : (
                <button onClick={() => act("publish", p.slug)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-bold text-ink-950 hover:bg-emerald-400 disabled:opacity-60">
                  <Send className="h-3.5 w-3.5" /> Publish
                </button>
              )}
              <button onClick={() => act("delete", p.slug)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs font-semibold text-rose-300 hover:border-rose-500/40 disabled:opacity-60">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
