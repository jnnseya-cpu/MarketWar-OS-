import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLockup } from "@/components/Logo";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import UserMenu from "@/components/UserMenu";
import RequireAuth from "@/components/RequireAuth";
import AuthStatusBanner from "@/components/AuthStatusBanner";
import CapabilityNotice from "@/components/CapabilityNotice";
import EmergencyStop from "@/components/EmergencyStop";
import CommandBar from "@/components/CommandBar";
import GuideWizard from "@/components/GuideWizard";
import InstallPrompt from "@/components/InstallPrompt";
import { BrandProvider } from "@/frontend/brand-context";
import { ResultsProvider } from "@/frontend/results-context";
import { LocaleProvider } from "@/frontend/locale-context";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
    <LocaleProvider>
    <BrandProvider>
    <ResultsProvider>
    <div className="h-screen-safe">
      <Sidebar />
      <div className="lg:pl-60">
        <AuthStatusBanner />
        <header className="header-safe sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.07] bg-ink-950/70 px-5 pb-3 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-2">
            <MobileNav />
            <Link href="/" className="flex items-center gap-2">
              <BrandLockup markClass="h-6 w-auto" textClass="font-display font-bold text-white" />
            </Link>
          </div>
          <UserMenu compact />
        </header>
        {/* pb accounts for the home indicator so the last card is never half under it. */}
        {/* ONE PLACE, EVERY SCREEN.
            Mounted in the layout rather than on each surface for the same
            reason the human gate lives in middleware: a warning that depends on
            every screen remembering to carry it is a warning half the screens
            will not carry. If AI generation is dark on this deployment, the
            customer learns it before they type, wherever they are. */}
        <main className="pad-safe mx-auto max-w-7xl px-5 pb-[calc(2rem+var(--safe-bottom))] pt-8 sm:px-8">
          <CapabilityNotice need="ai_generation" />
          {/* Nothing at all until something is stopped — and then on every screen,
              because a halt the operator cannot see is a platform that merely
              looks broken. */}
          <EmergencyStop variant="banner" />
          {/* One box above every screen. The alternative is asking somebody who
              wants more customers to choose between sixty-five engines, which
              is asking them to do the platform's job. */}
          <CommandBar />
          {children}
        </main>
      </div>
      <GuideWizard />
      <InstallPrompt />
    </div>
    </ResultsProvider>
    </BrandProvider>
    </LocaleProvider>
    </RequireAuth>
  );
}
