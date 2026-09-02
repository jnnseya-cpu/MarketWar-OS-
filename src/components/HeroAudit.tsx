"use client";

// THE HERO IS THE PRODUCT NOW, NOT A PICTURE OF IT.
//
// What was here: a mocked dashboard reading "$124,560 total revenue", "2,345 new
// customers", "AI Opportunity Score 94", under the name Alex Carter. Invented
// numbers, and in DOLLARS on a site that prices in pounds.
//
// That is indefensible on this page in particular, because four screens further
// down the same page says:
//
//     "We're new; we don't publish numbers we haven't earned."
//     "…until then it shows zero, not a guess"
//     "…rather than a sample base"
//     "Never fabricates a rating"
//
// The single strongest thing this platform owns is a product that RUNS BEFORE
// SIGNUP — no account, no card, a real crawl of the visitor's own site. Putting
// a fake screenshot above it, on a page whose argument is that it does not fake
// things, spends the one asset to protect the weakest one.
//
// So the first thing on the page is the field. A stranger types their address
// and gets their own real numbers thirty seconds later, which is worth more than
// any illustration of somebody else's.
//
// IT DOES NOT RUN THE AUDIT HERE. It hands the address to /audit. Two reasons,
// and the second one matters: the audit's own page carries the check catalogue,
// the refusals and the quota copy that make the result legible — and a crawl
// costs real bandwidth, so it should start from a deliberate press on a page
// that says what is about to happen, not from a hero that fires on submit.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";

export default function HeroAudit({ checks }: { checks: number }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [going, setGoing] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  // NOT DISABLED WHILE EMPTY, and that is deliberate. `disabled` renders the
  // button at 45% opacity, so the single most important control on the site
  // greeted every arriving visitor greyed out — which reads as "unavailable"
  // or "broken", not as "type something first". An empty submit focuses the
  // field instead: the same guard, without the page looking dead.
  function go(e: React.FormEvent) {
    e.preventDefault();
    const v = url.trim();
    if (!v) { field.current?.focus(); return; }
    setGoing(true);
    router.push(`/audit?url=${encodeURIComponent(v)}`);
  }

  return (
    <form onSubmit={go} className="animate-fade-up mt-9 max-w-xl" style={{ animationDelay: "0.24s" }}>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <label htmlFor="hero-audit-url" className="sr-only">Your website address</label>
        <input
          id="hero-audit-url"
          ref={field}
          name="url"
          type="text"
          inputMode="url"
          autoComplete="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="yourbusiness.co.uk"
          className="input flex-1 !py-3 !text-base"
        />
        <button type="submit" className="btn-primary group shrink-0 !px-6 !py-3 !text-base" disabled={going}>
          {going ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Show me what it costs
          {!going && <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />}
        </button>
      </div>
      <p className="mt-3 font-mono text-[11px] leading-relaxed tracking-wide text-slate-500">
        {checks} checks on your actual page · no account · no card · about 15 seconds
      </p>
    </form>
  );
}
