"use client";

// Article footer widget — counts a view once per session and offers a copy-link
// share. Talks to /api/blog (action: "view"); no backend import (layer-safe).

import { useEffect, useState } from "react";
import { Eye, Link2, Check } from "lucide-react";

export default function BlogArticleClient({ slug, initialViews }: { slug: string; initialViews: number }) {
  const [views, setViews] = useState(initialViews);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const key = `mw.blogview.${slug}`;
    try { if (sessionStorage.getItem(key)) return; } catch { /* storage blocked */ }
    fetch("/api/blog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "view", slug }) })
      .then((r) => r.json())
      .then((d) => { if (typeof d?.views === "number") setViews(d.views); try { sessionStorage.setItem(key, "1"); } catch { /* ignore */ } })
      .catch(() => {});
  }, [slug]);

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* ignore */ }
  }

  return (
    <div className="flex items-center gap-4 text-sm text-slate-400">
      <span className="flex items-center gap-1.5"><Eye className="h-4 w-4" /> {views.toLocaleString()} views</span>
      <button onClick={share} className="flex items-center gap-1.5 font-semibold text-emerald-400 hover:text-emerald-300">
        {copied ? <><Check className="h-4 w-4" /> Link copied</> : <><Link2 className="h-4 w-4" /> Share</>}
      </button>
    </div>
  );
}
