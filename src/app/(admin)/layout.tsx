"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, CreditCard, Settings, Shield, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const ADMIN_NAV = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "Subscriptions", href: "/admin/subscriptions", icon: CreditCard },
  { label: "Platform Settings", href: "/admin/settings", icon: Settings },
  { label: "Audit Log", href: "/admin/audit", icon: Shield },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = React.useState(false);

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
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-rose-600 to-orange-500 shadow-glow-orange">
              <Shield className="h-4 w-4 text-white" />
            </div>
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

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-1">
          {ADMIN_NAV.map((item) => {
            const isActive =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname?.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  isActive
                    ? "flex items-center gap-3 rounded-xl px-3 py-2.5 text-14 font-medium bg-rose-600/15 text-white border border-rose-600/30"
                    : "sidebar-item",
                  isCollapsed && "justify-center px-0 py-2.5"
                )}
                title={isCollapsed ? item.label : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0 text-rose-400" />
                {!isCollapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </div>

        {/* Return to Dashboard shortcut */}
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
