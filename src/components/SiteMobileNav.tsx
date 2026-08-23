"use client";

// THE PUBLIC SITE HAD NO MENU ON A PHONE.
//
// SiteHeader's nav is `hidden … md:flex`, "Sign in" is `hidden sm:block`, and
// nothing replaced either below those breakpoints. So on every phone — and in
// the installed app, which is where it was reported — the entire public site
// offered a logo and one "Get started" button. Pricing, how it works,
// industries, the free audit, sign in: all present, none reachable.
//
// The dashboard has had a working drawer (MobileNav) since the PWA shipped.
// This is the same defect this repository keeps producing: something that
// exists on one side of a boundary and was never carried across. The dashboard
// half was built and the public half was not.
//
// PORTALLED TO <body>, FOR A REASON ALREADY PAID FOR ONCE.
//
// SiteHeader carries `backdrop-blur-xl`. An element with a backdrop-filter
// becomes the containing block for every position:fixed descendant, so
// `fixed inset-0` would resolve against the header's own box rather than the
// viewport: the drawer opens as a strip the height of the header and the
// overlay never covers the page. MobileNav learned this the expensive way; the
// fix is a portal, not a pinned position, because pinning breaks again the
// first time anyone adds a transform or a filter anywhere above.
//
// The links come from FOOTER_NAV so this cannot drift from the footer, plus the
// two account actions the header itself hides on small screens.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { FOOTER_NAV } from "@/components/marketing-nav";
import SiteAuthLinks from "@/components/SiteAuthLinks";

export default function SiteMobileNav() {
  const [open, setOpen] = useState(false);
  // document does not exist during the server render, so the portal target is
  // only taken once mounted. Until then the button renders and the drawer does
  // not, which is the correct state for a drawer nobody has opened.
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

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
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-200 hover:bg-ink-800 md:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[100] md:hidden" role="dialog" aria-modal="true" aria-label="Site navigation">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-80 max-w-[88%] flex-col border-l border-ink-700/60 bg-ink-900 pt-[var(--safe-top)]">
            <div className="flex items-center justify-between border-b border-ink-700/60 px-4 py-4">
              <span className="font-display text-sm font-bold text-white">Menu</span>
              <button
                type="button" aria-label="Close menu" onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-ink-800 hover:text-white"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            {/* The bottom padding clears the phone's own gesture bar, or the
                last link sits underneath it and cannot be tapped. */}
            <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-5 pb-[calc(1.5rem+var(--safe-bottom))]">
              {/* The free audit first and on its own. It is the one thing on
                  this site that gives a stranger something before asking for
                  anything, and burying it in a list is how it stays unused. */}
              <Link
                href="/audit"
                className="block rounded-xl bg-emerald-500 px-4 py-3 text-center text-sm font-bold text-ink-950 hover:bg-emerald-400"
              >
                Free website audit
              </Link>

              {FOOTER_NAV.map((col) => (
                <div key={col.title}>
                  <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">{col.title}</p>
                  <div className="space-y-0.5">
                    {col.links.map(([label, href]) => {
                      const active = pathname === href;
                      return (
                        <Link
                          key={href} href={href}
                          className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition ${active ? "bg-emerald-500/10 text-emerald-300" : "text-slate-300 hover:bg-ink-800 hover:text-white"}`}
                        >
                          {label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Both of these are hidden in the header below sm/md. Without
                  them here, somebody who already has an account has no way into
                  it from a phone. */}
              <div className="space-y-2 border-t border-ink-700/60 pt-5">
                <SiteAuthLinks
                  signInLabel="Sign in"
                  signInClassName="block rounded-lg border border-white/10 px-3 py-2.5 text-center text-sm font-semibold text-slate-200 hover:bg-ink-800"
                  ctaHref="/get-started"
                  ctaClassName="block rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-center text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20"
                />
              </div>
            </nav>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
