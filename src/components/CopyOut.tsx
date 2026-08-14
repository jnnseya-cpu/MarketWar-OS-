"use client";

// TAKE IT AWAY.
//
// The ad canvas taught this the expensive way: the engine was fine and the
// surface had no way to get the artefact out, so a customer could do the whole
// job and end holding something they could not use. A sweep for the same shape
// found three more — the email preview, the ad formats and the presenter video
// brief all rendered generated output with no route off the screen.
//
// The email one is the worst of them. When sending is not configured on a
// deployment — which is the normal state until a domain is verified — copying
// the text out is the ONLY way the email engine produces anything at all. A
// preview with no copy button is a feature that cannot be used, and it looks
// like a feature that works.
//
// Deliberately tiny and deliberately honest about failing: `navigator.clipboard`
// needs a secure context and a user gesture, and it refuses in some embedded
// browsers. When it does, the text is selected instead so a person can copy it
// by hand rather than pressing a button that silently does nothing.

import { useRef, useState } from "react";
import { Check, Copy, Download } from "lucide-react";

export default function CopyOut({
  text,
  filename,
  label = "Copy",
  mime = "text/plain",
  compact,
}: {
  text: string;
  /** When given, a download is offered too — a long email is easier saved than pasted. */
  filename?: string;
  label?: string;
  mime?: string;
  compact?: boolean;
}) {
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const holder = useRef<HTMLSpanElement>(null);

  async function copy() {
    setFailed(false);
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 2_000);
    } catch {
      // The honest fallback. A button that fails silently is worse than no
      // button, because the person believes they have the text.
      setFailed(true);
      const el = holder.current;
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }

  function save() {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename!;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  const cls = compact
    ? "inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-white/5"
    : "inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-white/5";

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => void copy()} className={cls} disabled={!text}>
        {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {done ? "Copied" : label}
      </button>
      {filename && (
        <button type="button" onClick={save} className={cls} disabled={!text}>
          <Download className="h-3.5 w-3.5" /> Save
        </button>
      )}
      {failed && (
        <span className="text-[11px] text-amber-300">
          This browser blocked the clipboard — the text is selected, press Ctrl/Cmd+C.
        </span>
      )}
      {/* Off-screen but selectable: the fallback needs something real to select. */}
      <span ref={holder} className="sr-only">{text}</span>
    </span>
  );
}
