"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import BrandSwitcher from "@/components/BrandSwitcher";
import { BrandLockup } from "@/components/Logo";
import UserMenu from "@/components/UserMenu";
import LanguageSelector from "@/components/LanguageSelector";
import { useIsAdmin } from "@/frontend/use-is-admin";
import {
  Activity,
  BadgePercent,
  Banknote,
  Bell,
  Clapperboard,
  Coins,
  Cpu,
  Crosshair,
  Factory,
  Flame,
  Gauge,
  Globe,
  LayoutDashboard,
  LayoutTemplate,
  Layers,
  Mail,
  MapPin,
  MessageCircle,
  Moon,
  PiggyBank,
  Plug,
  Radar,
  RefreshCcw,
  Search,
  Rocket,
  Send,
  Swords,
  ScrollText,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Target,
  Wand2,
  Users,
  Wallet,
  Workflow,
} from "lucide-react";

export const NAV = [
  {
    group: "Command",
    items: [
      { href: "/dashboard/studio", label: "Brand Studio", icon: Wand2 },
      { href: "/dashboard", label: "Command Center", icon: LayoutDashboard },
      { href: "/dashboard/first-customer", label: "First Customer", icon: Banknote },
      { href: "/dashboard/autopilot", label: "Revenue Autopilot", icon: Moon },
      { href: "/dashboard/engines", label: "AI Engines", icon: Cpu },
      { href: "/dashboard/ai-agents", label: "Strategy Agents", icon: Sparkles },
      { href: "/dashboard/create", label: "Make Anything", icon: Wand2 },
      { href: "/dashboard/briefing", label: "Daily Briefing", icon: ScrollText },
      { href: "/dashboard/strategy", label: "Strategy Chain", icon: Target },
      { href: "/dashboard/audit", label: "Failure Audit", icon: Stethoscope },
    ],
  },
  {
    group: "Acquisition",
    items: [
      { href: "/dashboard/organic-dominance", label: "Organic Dominance OS", icon: Radar },
      { href: "/dashboard/warfare", label: "Campaign Warfare", icon: Swords },
      { href: "/dashboard/war-room", label: "Campaign War Room", icon: Crosshair },
      { href: "/dashboard/campaigns", label: "Campaign Builder", icon: Rocket },
      { href: "/dashboard/offers", label: "Offer Builder", icon: BadgePercent },
      { href: "/dashboard/product-engine", label: "VisualStrike AI", icon: Sparkles },
      { href: "/dashboard/publish", label: "Publish Center", icon: Send },
      { href: "/dashboard/website-intel", label: "SiteRaid AI", icon: Globe },
      { href: "/dashboard/discover", label: "Market Intel", icon: Search },
      { href: "/dashboard/prospecting", label: "LeadWar Room", icon: Crosshair },
      { href: "/dashboard/organic", label: "Organic Dominance", icon: Radar },
      { href: "/dashboard/content", label: "Content Factory", icon: Factory },
      { href: "/dashboard/blog", label: "SEO Blog Studio", icon: ScrollText },
      { href: "/dashboard/video", label: "Video War Room", icon: Clapperboard },
      { href: "/dashboard/landing-pages", label: "Landing Pages", icon: Flame },
      { href: "/dashboard/landing-builder", label: "Conversion Architect", icon: LayoutTemplate },
    ],
  },
  {
    group: "Conversion",
    items: [
      { href: "/dashboard/whatsapp", label: "WhatsApp Center", icon: MessageCircle },
      { href: "/dashboard/email", label: "Email Center", icon: Mail },
      { href: "/dashboard/customers", label: "Customer Vault", icon: Users },
      { href: "/dashboard/segments", label: "Audience Segments", icon: Layers },
      { href: "/dashboard/recovery", label: "Lead Recovery", icon: RefreshCcw },
      { href: "/dashboard/influencers", label: "Influencer Recruitment", icon: Share2 },
      { href: "/dashboard/partner-network", label: "Partner Network", icon: Users },
      { href: "/dashboard/automation", label: "Automation Lab", icon: Workflow },
      { href: "/dashboard/amplify", label: "Reach Amplifier", icon: Share2 },
    ],
  },
  {
    group: "Intelligence",
    items: [
      { href: "/dashboard/roi", label: "ROI Engine", icon: Coins },
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
      { href: "/dashboard/comms", label: "Comms Events", icon: Bell, adminOnly: true },
      { href: "/dashboard/integrations", label: "Integration Hub", icon: Plug },
      { href: "/dashboard/settings", label: "Settings & Security", icon: Settings },
      { href: "/dashboard/admin", label: "Admin Centre", icon: Gauge, adminOnly: true },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { isAdmin } = useIsAdmin();
  // Honest live-status indicator — never shows the word "demo" to a customer.
  const [liveReady, setLiveReady] = useState<number | null>(null);
  useEffect(() => {
    let on = true;
    fetch("/api/health/live")
      .then((r) => r.json())
      .then((d) => { if (on) setLiveReady(typeof d?.liveReady === "number" ? d.liveReady : null); })
      .catch(() => {});
    return () => { on = false; };
  }, []);
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-ink-700/60 bg-ink-900/95 lg:flex">
      <Link href="/" className="flex items-center gap-2.5 border-b border-ink-700/60 px-5 py-5">
        <BrandLockup markClass="h-7 w-auto" textClass="font-display text-base font-bold tracking-tight text-white" />
      </Link>
      <BrandSwitcher />
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
        {NAV.map((group) => {
          // Hide operator-only items (Admin Centre, Comms Events) from tenants.
          const items = group.items.filter((item) => !(item as { adminOnly?: boolean }).adminOnly || isAdmin);
          if (items.length === 0) return null;
          return (
          <div key={group.group}>
            <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">
              {group.group}
            </p>
            <div className="space-y-0.5">
              {items.map((item) => {
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
          );
        })}
      </nav>
      <div className="border-t border-ink-700/60 px-5 py-3">
        <UserMenu />
      </div>
      <div className="border-t border-ink-700/60 px-5 py-3">
        <LanguageSelector />
      </div>
      <div className="border-t border-ink-700/60 px-5 py-4">
        {liveReady === null ? (
          <p className="text-xs text-slate-500">Checking status…</p>
        ) : liveReady > 0 ? (
          <p className="flex items-center gap-2 text-xs font-medium text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Live intelligence active
          </p>
        ) : (
          <p className="flex items-center gap-2 text-xs font-medium text-amber-400">
            <span className="h-2 w-2 rounded-full bg-amber-400" /> Activating…
          </p>
        )}
      </div>
    </aside>
  );
}
