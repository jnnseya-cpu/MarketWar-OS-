import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLockup } from "@/components/Logo";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import UserMenu from "@/components/UserMenu";
import RequireAuth from "@/components/RequireAuth";
import AuthStatusBanner from "@/components/AuthStatusBanner";
import { BrandProvider } from "@/frontend/brand-context";
import { ResultsProvider } from "@/frontend/results-context";
import { LocaleProvider } from "@/frontend/locale-context";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
    <LocaleProvider>
    <BrandProvider>
    <ResultsProvider>
    <div className="min-h-screen">
      <Sidebar />
      <div className="lg:pl-60">
        <AuthStatusBanner />
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.07] bg-ink-950/70 px-5 py-3 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-2">
            <MobileNav />
            <Link href="/" className="flex items-center gap-2">
              <BrandLockup markClass="h-6 w-auto" textClass="font-display font-bold text-white" />
            </Link>
          </div>
          <UserMenu compact />
        </header>
        <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">{children}</main>
      </div>
    </div>
    </ResultsProvider>
    </BrandProvider>
    </LocaleProvider>
    </RequireAuth>
  );
}
