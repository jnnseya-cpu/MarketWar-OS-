"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandSwitcher from "@/components/BrandSwitcher";
import {
  Activity,
  BadgePercent,
  Clapperboard,
  Crosshair,
  Factory,
  Flame,
  Gauge,
  Globe,
  LayoutDashboard,
  Mail,
  MapPin,
  MessageCircle,
  PiggyBank,
  Radar,
  RefreshCcw,
  Search,
  Rocket,
  Swords,
  ScrollText,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Wand2,
  Users,
  Wallet,
} from "lucide-react";

const NAV = [
  {
    group: "Command",
    items: [
      { href: "/dashboard", label: "Command Center", icon: LayoutDashboard },
      { href: "/dashboard/create", label: "Make Anything", icon: Wand2 },
      { href: "/dashboard/briefing", label: "Daily Briefing", icon: ScrollText },
      { href: "/dashboard/audit", label: "Failure Audit", icon: Stethoscope },
    ],
  },
  {
    group: "Acquisition",
    items: [
      { href: "/dashboard/warfare", label: "Campaign Warfare", icon: Swords },
      { href: "/dashboard/war-room", label: "Campaign War Room", icon: Crosshair },
      { href: "/dashboard/campaigns", label: "Campaign Builder", icon: Rocket },
      { href: "/dashboard/offers", label: "Offer Builder", icon: BadgePercent },
      { href: "/dashboard/product-engine", label: "VisualStrike AI", icon: Sparkles },
      { href: "/dashboard/studio", label: "Brand Studio", icon: Wand2 },
      { href: "/dashboard/website-intel", label: "SiteRaid AI", icon: Globe },
      { href: "/dashboard/discover", label: "Market Intel", icon: Search },
      { href: "/dashboard/organic", label: "Organic Dominance", icon: Radar },
      { href: "/dashboard/content", label: "Content Factory", icon: Factory },
      { href: "/dashboard/video", label: "Video War Room", icon: Clapperboard },
      { href: "/dashboard/landing-pages", label: "Landing Pages", icon: Flame },
    ],
  },
  {
    group: "Conversion",
    items: [
      { href: "/dashboard/whatsapp", label: "WhatsApp Center", icon: MessageCircle },
      { href: "/dashboard/email", label: "Email Center", icon: Mail },
      { href: "/dashboard/customers", label: "Customer Vault", icon: Users },
      { href: "/dashboard/recovery", label: "Lead Recovery", icon: RefreshCcw },
      { href: "/dashboard/amplify", label: "Reach Amplifier", icon: Share2 },
    ],
  },
  {
    group: "Intelligence",
    items: [
      { href: "/dashboard/revenue", label: "Revenue Intel", icon: Activity },
      { href: "/dashboard/budget", label: "Budget Protection", icon: PiggyBank },
      { href: "/dashboard/competitors", label: "Competitor Spy", icon: Radar },
      { href: "/dashboard/reputation", label: "Reputation Shield", icon: ShieldCheck },
      { href: "/dashboard/local", label: "Local Domination", icon: MapPin },
    ],
  },
  {
    group: "Account",
    items: [
      { href: "/dashboard/billing", label: "Billing & ACUs", icon: Wallet },
      { href: "/dashboard/settings", label: "Settings & Security", icon: Settings },
      { href: "/dashboard/admin", label: "Admin Centre", icon: Gauge },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-ink-700/60 bg-ink-900/95 lg:flex">
      <Link href="/" className="flex items-center gap-2.5 border-b border-ink-700/60 px-5 py-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-ink-950">
          <Shield className="h-5 w-5" />
        </span>
        <span className="font-display text-base font-bold tracking-tight text-white">
          MarketWar <span className="text-emerald-400">OS</span>
        </span>
      </Link>
      <BrandSwitcher />
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
        {NAV.map((group) => (
          <div key={group.group}>
            <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">
              {group.group}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition ${
                      active
                        ? "bg-emerald-500/10 text-emerald-300"
                        : "text-slate-400 hover:bg-ink-800 hover:text-slate-200"
                    }`}
                  >
                    <item.icon className={`h-4 w-4 ${active ? "text-emerald-400" : ""}`} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-ink-700/60 px-5 py-4">
        <p className="text-xs text-slate-500">
          Demo Intelligence active.{" "}
          <span className="text-slate-400">Add an API key to go live.</span>
        </p>
      </div>
    </aside>
  );
}
