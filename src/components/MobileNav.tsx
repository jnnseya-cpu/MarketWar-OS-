"use client";

// Mobile navigation drawer — the sidebar is hidden below lg, so without this a
// phone user can reach nothing but the Command Center. A hamburger opens a
// slide-over with the full nav (same NAV as the sidebar), admin items filtered.
//
// THE DRAWER IS PORTALLED TO <body>, AND IT HAS TO BE.
//
// This component is rendered inside the dashboard's mobile header, and that
// header carries `backdrop-blur-xl`. An element with a backdrop-filter becomes
// the CONTAINING BLOCK for every position:fixed descendant — so `fixed inset-0`
// resolved against the header's own box, not the viewport. The drawer opened
// as a strip the height of the header, the nav was clipped out of existence,
// and the overlay did not dim the page because it was not over it. On every
// phone, not just in the installed app; the PWA is only where it was noticed.
//
// A portal puts the overlay outside that ancestor for good. Pinning the header
// with an explicit position instead would fix today and break again the first
// time anyone adds a transform, a filter or `will-change` anywhere above this.

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { NAV } from "@/components/Sidebar";
import { useIsAdmin } from "@/frontend/use-is-admin";

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  // document does not exist during the server render, so the portal target is
  // only taken once mounted. Until then the button renders and the drawer does
  // not, which is the correct state for a drawer nobody has opened.
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const { isAdmin } = useIsAdmin();

  useEffect(() => { setMounted(true); }, []);

  // Close the drawer on route change.
  useEffect(() => { setOpen(false); }, [pathname]);
  // Lock body scroll while open.
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Escape closes it. A drawer covering the whole screen with no keyboard way
  // out is a trap for anyone not using touch.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Open navigation menu"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-200 hover:bg-ink-800 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[100] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col border-r border-ink-700/60 bg-ink-900 pt-[var(--safe-top)]">
            <div className="flex items-center justify-between border-b border-ink-700/60 px-4 py-4">
              <span className="font-display text-sm font-bold text-white">Menu</span>
              <button type="button" aria-label="Close navigation menu" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-ink-800 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* The bottom padding clears the phone's own gesture bar, or the
                last nav item sits underneath it and cannot be tapped. */}
            <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 pb-[calc(1rem+var(--safe-bottom))]">
              {NAV.map((group) => {
                const items = group.items.filter((item) => !(item as { adminOnly?: boolean }).adminOnly || isAdmin);
                if (items.length === 0) return null;
                return (
                  <div key={group.group}>
                    <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">{group.group}</p>
                    <div className="space-y-0.5">
                      {items.map((item) => {
                        const active = pathname === item.href;
                        return (
                          <Link key={item.href} href={item.href} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium transition ${active ? "bg-emerald-500/10 text-emerald-300" : "text-slate-300 hover:bg-ink-800 hover:text-white"}`}>
                            <item.icon className={`h-4 w-4 ${active ? "text-emerald-400" : ""}`} />
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </nav>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
