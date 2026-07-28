// Light, safe markdown → HTML, shared by every surface that renders agent output.
//
// Escapes FIRST — agent output is model-written text and must never be able to
// inject HTML into the dashboard — then applies a small deliberate subset:
// ##/### headings, **bold**, and •/- bullets. Callers render with
// white-space: pre-wrap, so remaining line breaks stand as written.
//
// Extracted from AgentRunner so the Work Library renders saved output exactly
// the way it looked when it was generated. Two copies of an escaping routine is
// one copy too many: the day they drift is the day one of them stops escaping.
export function mdToHtml(md: string): string {
  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
  return esc(md || "")
    .replace(/^###\s+(.+)$/gm, "<h2>$1</h2>")
    .replace(/^##\s+(.+)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^\s*[-•]\s+(.+)$/gm, "• $1");
}
