"use client";

// The warning that arrives BEFORE the work, not after it.
//
// A customer should never type a brief, wait, and then be told the deployment
// cannot do this. That sequence costs them their evening and costs us their
// trust, and it is what has been happening on every generative surface of this
// platform whenever a provider key was missing.
//
// Two rules this component exists to keep:
//
//   • It never says "nothing works". That is almost always false, and saying it
//     is its own kind of dishonesty. Every notice names what still works.
//   • It never tells anybody to retry something that cannot succeed. A missing
//     key is a setting, not a glitch, and "try again in a moment" is how an
//     evening gets wasted.

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useCapability } from "@/frontend/use-capabilities";

export default function CapabilityNotice({ need, compact }: { need: string; compact?: boolean }) {
  const { known, live, cap } = useCapability(need);

  // Silent while the answer is in flight, and silent when it is fine. A banner
  // that flashes a warning and then withdraws it teaches people to ignore it.
  if (!known || live || !cap) return null;

  if (compact) {
    return (
      <p className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-2.5 text-[11px] leading-relaxed text-amber-100">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span><span className="font-semibold">{cap.label} is not available on this deployment.</span> {cap.whenDark} Retrying will not change it.</span>
      </p>
    );
  }

  return (
    <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
      <p className="flex items-center gap-2 font-display text-sm font-bold text-amber-100">
        <AlertTriangle className="h-4 w-4" /> {cap.label} is not available on this deployment
      </p>
      <p className="mt-2 text-xs leading-relaxed text-amber-100/90">{cap.whenDark}</p>
      <p className="mt-2 text-xs leading-relaxed text-amber-100/70">
        {cap.because} This is a missing setting rather than a fault, so retrying will not change it.
      </p>
      <p className="mt-3 flex items-start gap-2 rounded-lg bg-ink-950/40 p-2.5 text-xs leading-relaxed text-emerald-200">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span><span className="font-semibold">What still works:</span> {cap.stillWorks}</span>
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        <span className="font-semibold text-slate-400">To switch it on:</span> {cap.oneAction}
      </p>
    </div>
  );
}
