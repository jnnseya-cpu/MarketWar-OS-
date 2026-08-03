// Which link schemes are safe to draw on a page.
//
// This lives in shared rather than inside the renderer because it is a security
// decision and a security decision that cannot be tested directly is a security
// decision nobody checks. The renderer imports it; so do the tests.
//
// The threat is specific. The Markdown renderer displays MODEL OUTPUT — on the
// public blog and inside the dashboard. `javascript:` and `data:` are URLs a
// language model can be talked into producing, and a page that renders them
// hands script execution to whoever wrote the prompt. So this is a whitelist of
// three things rather than a blacklist of the ones we thought of:
//
//   • a relative path (but not `//host`, which is a protocol-relative jump to
//     somebody else's site wearing a relative link's clothes),
//   • http and https,
//   • mailto.
//
// Everything else keeps its words and loses its link.

export type SafeLink = { href: string; external: boolean };

export function safeHref(url: string): SafeLink | null {
  const u = (url || "").trim();
  if (!u) return null;
  if (u.startsWith("//")) return null;
  if (u.startsWith("/")) return { href: u, external: false };
  if (/^https?:\/\//i.test(u)) return { href: u, external: true };
  if (/^mailto:/i.test(u)) return { href: u, external: false };
  return null;
}
