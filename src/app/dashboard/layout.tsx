import type { ReactNode } from "react";
import Link from "next/link";
import { Shield } from "lucide-react";
import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-950">
      <Sidebar />
      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-700/60 bg-ink-950/90 px-5 py-3 backdrop-blur lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500 text-ink-950">
              <Shield className="h-4 w-4" />
            </span>
            <span className="font-display font-bold text-white">
              MarketWar <span className="text-emerald-400">OS</span>
            </span>
          </Link>
          <Link href="/dashboard" className="text-sm font-semibold text-emerald-400">
            Command Center
          </Link>
        </header>
        <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
