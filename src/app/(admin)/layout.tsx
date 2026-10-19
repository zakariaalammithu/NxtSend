"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, CreditCard, Settings, Shield, ArrowLeft,
  ChevronLeft, ChevronRight, LogOut, Target, Megaphone, UserSearch,
  Database, Inbox, Bell, Globe, Share2, TrendingUp, Gauge, Receipt,
  DollarSign, SlidersHorizontal, Mail, Table, Sparkles, Bot, Blocks,
  Wand2, ListOrdered, Radio, MonitorSmartphone, Settings2, HeartPulse,
  FlaskConical, Stethoscope, KeyRound, Siren,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { ADMIN_NAV_GROUPS } from "@/lib/admin/nav";

/**
 * Sidebar structure lives in src/lib/admin/nav.ts (pure data, unit
 * tested against the brief's item list); this map binds its icon keys
 * to lucide components.
 */
const NAV_ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, Users, CreditCard, Settings, Shield, Target,
  Megaphone, UserSearch, Database, Inbox, Bell, Globe, Share2,
  TrendingUp, Gauge, Receipt, DollarSign, SlidersHorizontal, Mail,
  Table, Sparkles, Bot, Blocks, Wand2, ListOrdered, Radio,
  MonitorSmartphone, Settings2, HeartPulse, FlaskConical, Stethoscope,
  KeyRound, Siren,
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  const handleLogout = async () => {
    // Real logout: terminate the Supabase session (clears the auth cookies)
    // before navigating. In demo mode createClient() returns null and there
    // is no session to end, so we simply navigate to /login.
    const supabase = createClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="flex h-screen w-full bg-black-900 text-white overflow-hidden font-sans">
      {/* Admin Sidebar */}
      <aside
        className={cn(
          "flex flex-col border-r border-black-700/70 bg-black-900 transition-all duration-300 z-50",
          isCollapsed ? "w-16" : "w-[240px]"
        )}
      >
        {/* Header */}
        <div className="flex h-16 shrink-0 items-center justify-between px-3.5 border-b border-black-700/60">
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-2.5 overflow-hidden",
              isCollapsed && "justify-center w-full"
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="NxtSend"
              className="h-8 w-8 shrink-0 object-contain"
            />
            {!isCollapsed && (
              <div className="flex flex-col">
                <span className="text-16 font-bold tracking-tight text-white leading-tight">
                  Nxt<span className="text-gradient-brand">Send</span>
                </span>
                <span className="text-10 font-bold uppercase tracking-wider text-rose-400">
                  Admin Panel
                </span>
              </div>
            )}
          </Link>

          {!isCollapsed && (
            <button
              type="button"
              onClick={() => setIsCollapsed(true)}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-black-400 hover:text-white hover:bg-black-800 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {isCollapsed && (
          <div className="flex justify-center py-2 border-b border-black-800">
            <button
              type="button"
              onClick={() => setIsCollapsed(false)}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-black-400 hover:text-white hover:bg-black-800"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Admin Badge */}
        {!isCollapsed && (
          <div className="p-3">
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-11 text-rose-300 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
              <span className="font-semibold">Super Admin Mode</span>
            </div>
          </div>
        )}

        {/* Navigation — grouped per the admin brief (src/lib/admin/nav.ts) */}
        <div className="flex-1 overflow-y-auto px-2.5 py-3">
          {ADMIN_NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
              {!isCollapsed && (
                <p className="px-3 pb-1.5 text-10 font-bold uppercase tracking-widest text-black-500">
                  {group.label}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  // Items that are a path prefix of a sibling item
                  // (e.g. /admin/settings vs /admin/settings/secrets)
                  // highlight on exact match only.
                  const hasChildItem = ADMIN_NAV_GROUPS.some((g) =>
                    g.items.some(
                      (other) =>
                        other.href !== item.href &&
                        other.href.startsWith(item.href + "/")
                    )
                  );
                  const isActive =
                    item.href === "/admin" || hasChildItem
                      ? pathname === item.href
                      : pathname === item.href ||
                        pathname?.startsWith(item.href + "/");
                  const Icon = NAV_ICONS[item.icon] ?? LayoutDashboard;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        isActive
                          ? "flex items-center gap-3 rounded-xl px-3 py-2 text-13 font-medium bg-rose-600/15 text-white border border-rose-600/30"
                          : "sidebar-item",
                        isCollapsed && "justify-center px-0 py-2.5"
                      )}
                      title={isCollapsed ? item.label : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-rose-400" />
                      {!isCollapsed && <span>{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Return to Dashboard shortcut + Log Out */}
        <div className="p-2.5 border-t border-black-700/60 space-y-2">
          <Link
            href="/dashboard"
            className={cn(
              "flex items-center gap-2.5 rounded-xl bg-black-800 hover:bg-black-700 border border-black-700 p-2 text-12 font-medium text-black-200 hover:text-white transition-colors",
              isCollapsed && "justify-center px-0"
            )}
            title="Return to User Dashboard"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-purple-400 shrink-0" />
            {!isCollapsed && <span>Back to App</span>}
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-xl bg-black-800 hover:bg-black-700 border border-black-700 p-2 text-12 font-medium text-rose-300 hover:text-rose-200 transition-colors",
              isCollapsed && "justify-center px-0"
            )}
            title="Log Out"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            {!isCollapsed && <span>Log Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Admin Top Bar */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-black-700/70 bg-black-900 px-6 z-30">
          <div className="flex items-center gap-3">
            <span className="text-13 text-black-400">Admin Console</span>
            <span className="text-black-600">/</span>
            <span className="font-semibold text-white text-14">
              Platform Governance
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 border border-rose-500/30 px-2.5 py-0.5 text-10 font-bold text-rose-400">
              ADMIN
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-12 font-semibold text-purple-400 hover:text-purple-300"
            >
              Exit to User Dashboard &rarr;
            </Link>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-black-900 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
