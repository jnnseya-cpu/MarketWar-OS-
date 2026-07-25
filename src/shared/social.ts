// Native per-network composer links (client-safe, pure).
//
// The always-works, no-connection, no-cost publish path: open the platform's own
// post screen with the caption pre-filled where supported, so a user can post
// from their own account by hand even when the managed publisher is unavailable.
// Platforms with no web post-intent (Instagram/TikTok/YouTube/Google Business/
// Snapchat) return null → the UI shows "copy caption + post in the app".
export function composerUrl(platform: string, caption: string, siteUrl = "", image?: string): string | null {
  const t = encodeURIComponent(caption || "");
  const u = encodeURIComponent(siteUrl || "");
  switch (platform) {
    case "x": return `https://twitter.com/intent/tweet?text=${t}`;
    case "threads": return `https://www.threads.net/intent/post?text=${t}`;
    case "whatsapp": return `https://wa.me/?text=${t}`;
    case "telegram": return `https://t.me/share/url?url=${u}&text=${t}`;
    case "linkedin": return `https://www.linkedin.com/feed/?shareActive=true&text=${t}`;
    case "reddit": return `https://www.reddit.com/submit?title=${encodeURIComponent((caption || "").slice(0, 280))}&text=${t}`;
    case "pinterest": return `https://www.pinterest.com/pin/create/button/?description=${t}${image ? `&media=${encodeURIComponent(image)}` : ""}${siteUrl ? `&url=${u}` : ""}`;
    case "facebook": return siteUrl ? `https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${t}` : null;
    default: return null;
  }
}
