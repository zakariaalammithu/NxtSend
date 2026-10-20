"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Target, Linkedin, Mail, MessageSquare, BarChart3, Puzzle, CreditCard, Settings, Bell, Search, LogOut, ChevronDown, ChevronLeft, ChevronRight, Zap, X, User, Users, Shield, Check, Sparkles, History, Gift, Coins, ShoppingCart, ContactRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  formatRelativeTime,
  type AppNotification,
} from "@/lib/notifications/core";

interface NavSection {
  title: string;
  items: {
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string | number;
  }[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "MAIN",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Campaigns", href: "/dashboard/campaigns", icon: Target },
      {
        label: "AI Personalization",
        href: "/dashboard/ai-personalization",
        icon: Sparkles,
      },
    ],
  },
  {
    title: "OUTREACH",
    items: [
      { label: "LinkedIn", href: "/dashboard/linkedin", icon: Linkedin },
      { label: "Email", href: "/dashboard/email", icon: Mail },
      {
        label: "Inbox",
        href: "/dashboard/inbox",
        icon: MessageSquare,
        // Badge is the live unread-conversation count, fetched from
        // /api/inbox/unread-count (see below) — never hardcoded.
      },
    ],
  },
  {
    title: "TOOLS",
    items: [
      // The Leads area IS the CRM (contacts, lists/tags, CSV, dedupe).
      { label: "CRM", href: "/dashboard/leads", icon: ContactRound },
      { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
      {
        label: "Usage & History",
        href: "/dashboard/usage",
        icon: History,
      },
    ],
  },
  {
    title: "ACCOUNT",
    items: [
      {
        label: "Billing & Credits",
        href: "/dashboard/billing",
        icon: CreditCard,
      },
      { label: "Referral", href: "/dashboard/referral", icon: Gift },
      { label: "Profile", href: "/dashboard/settings", icon: User },
    ],
  },
  {
    title: "CREDITS",
    items: [
      // NxtSend has no credit balance — plans carry monthly QUOTAS.
      // These entries land on the billing page's quota panel / plans,
      // which present quotas as quotas (see the billing page).
      {
        label: "Available Credits",
        href: "/dashboard/billing#credits",
        icon: Coins,
      },
      { label: "Buy Credits", href: "/dashboard/billing#plans", icon: ShoppingCart },
    ],
  },
  {
    title: "SETTINGS",
    items: [
      { label: "Integrations", href: "/dashboard/integrations", icon: Puzzle },
      {
        label: "Connected Accounts",
        href: "/dashboard/accounts",
        icon: Users,
      },
      { label: "Settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Collapsible sidebar state
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  // Top bar dropdowns
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = React.useState(false);
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = React.useState(false);

  // Demo banner state
  const [showDemoTopNotice, setShowDemoTopNotice] = React.useState(true);

  // Admin platform-settings gate (System Settings / Emergency
  // Controls): when an admin turns the demo banner OFF
  // (demo_banner_enabled=false via GET /api/settings/public), the
  // notice strip stays hidden. Default true preserves today's
  // behaviour; if the endpoint is unreachable the banner shows.
  const [demoBannerEnabled, setDemoBannerEnabled] = React.useState(true);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings/public", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.demo_banner_enabled === false) {
          setDemoBannerEnabled(false);
        }
      } catch {
        // Endpoint unreachable → keep the banner (fail-visible).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Notice shown when middleware redirects a demo-mode /admin visit here
  const [showAdminDemoNotice, setShowAdminDemoNotice] = React.useState(false);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("notice") === "admin-demo") {
      setShowAdminDemoNotice(true);
    }
  }, []);

  // Live inbox unread badge: conversations with unread inbound
  // messages, derived server-side from persisted read state
  // (messages.read_at). Refetched on navigation and whenever the
  // inbox page announces a change.
  const [inboxUnreadCount, setInboxUnreadCount] = React.useState<number>(0);
  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/inbox/unread-count");
        if (!res.ok) return;
        const data = (await res.json()) as { count?: number };
        if (!cancelled && typeof data.count === "number") {
          setInboxUnreadCount(data.count);
        }
      } catch {
        // Badge is best-effort chrome; the inbox page itself surfaces errors.
      }
    };
    load();
    window.addEventListener("nxtsend:inbox-unread-changed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("nxtsend:inbox-unread-changed", load);
    };
  }, [pathname]);

  // Mock workspace
  const currentWorkspace = "Alex Vance's Workspace";

  // Real notifications (Stage D): stored records from
  // GET /api/notifications — created by product events (today:
  // reply arrivals filed by ingestion). There is deliberately no
  // sample data: an empty list means nothing has happened yet.
  const [userNotifications, setUserNotifications] = React.useState<
    AppNotification[]
  >([]);
  const [notifUnreadCount, setNotifUnreadCount] = React.useState(0);
  const loadNotifications = React.useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        notifications?: AppNotification[];
        unreadCount?: number;
      };
      setUserNotifications(data.notifications ?? []);
      setNotifUnreadCount(data.unreadCount ?? 0);
    } catch {
      // Chrome is best-effort; the inbox itself surfaces real errors.
    }
  }, []);
  React.useEffect(() => {
    loadNotifications();
    window.addEventListener("nxtsend:inbox-unread-changed", loadNotifications);
    return () => {
      window.removeEventListener(
        "nxtsend:inbox-unread-changed",
        loadNotifications
      );
    };
  }, [loadNotifications, pathname]);

  const openNotification = async (n: AppNotification) => {
    if (!n.read_at) {
      try {
        await fetch("/api/notifications/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: n.id }),
        });
      } catch {
        /* marking read is best-effort; navigation still happens */
      }
      setUserNotifications((prev) =>
        prev.map((x) =>
          x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x
        )
      );
      setNotifUnreadCount((c) => Math.max(0, c - 1));
    }
    setNotificationsOpen(false);
    if (n.link) router.push(n.link);
  };

  const markAllNotificationsRead = async () => {
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } catch {
      /* best-effort */
    }
    const now = new Date().toISOString();
    setUserNotifications((prev) =>
      prev.map((x) => (x.read_at ? x : { ...x, read_at: now }))
    );
    setNotifUnreadCount(0);
  };

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
      {/* Sidebar Overlay on Mobile */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black-900/80 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-black-700/70 bg-black-900 transition-all duration-300 lg:static",
          isCollapsed ? "w-16" : "w-[240px]",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Sidebar Header / Logo */}
        <div className="flex h-16 shrink-0 items-center justify-between px-3.5 border-b border-black-700/60">
          <Link
            href="/dashboard"
            className={cn(
              "flex items-center gap-2.5 overflow-hidden transition-opacity",
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
              <span className="text-18 font-bold tracking-tight text-white whitespace-nowrap">
                Nxt<span className="text-gradient-brand">Send</span>
              </span>
            )}
          </Link>

          {/* Collapse Toggle (Desktop only) */}
          {!isCollapsed && (
            <button
              type="button"
              onClick={() => setIsCollapsed(true)}
              className="hidden lg:flex h-7 w-7 items-center justify-center rounded-lg text-black-400 hover:text-white hover:bg-black-800 transition-colors"
              title="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Collapsed expand button */}
        {isCollapsed && (
          <div className="hidden lg:flex justify-center py-2 border-b border-black-800">
            <button
              type="button"
              onClick={() => setIsCollapsed(false)}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-black-400 hover:text-white hover:bg-black-800 transition-colors"
              title="Expand sidebar"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Workspace Selector */}
        {!isCollapsed ? (
          <div className="px-3 pt-3.5 pb-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)}
                className="flex w-full items-center justify-between rounded-xl bg-black-800/80 hover:bg-black-800 px-3 py-2 text-13 font-medium text-white border border-black-700/70 transition-colors"
              >
                <div className="flex items-center gap-2 truncate">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-purple-600/30 text-purple-300 text-10 font-bold">
                    WS
                  </div>
                  <span className="truncate">{currentWorkspace}</span>
                </div>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-black-400" />
              </button>

              {workspaceMenuOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 z-30 rounded-xl bg-black-800 border border-black-600 p-1.5 shadow-2xl text-13">
                  <div className="px-2.5 py-1.5 text-11 font-semibold uppercase tracking-wider text-black-400">
                    Workspaces
                  </div>
                  <button
                    type="button"
                    onClick={() => setWorkspaceMenuOpen(false)}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-white bg-purple-600/15"
                  >
                    <span className="truncate">{currentWorkspace}</span>
                    <Check className="h-3.5 w-3.5 text-purple-400" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWorkspaceMenuOpen(false);
                      router.push("/dashboard/settings");
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-black-300 hover:text-white hover:bg-black-700/50 mt-0.5"
                  >
                    <span>+ New Workspace</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="py-3 flex justify-center">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-600/20 text-purple-300 text-11 font-bold">
              WS
            </div>
          </div>
        )}

        {/* Navigation Sections */}
        <div className="flex-1 overflow-y-auto px-2.5 py-2 space-y-5 scrollbar-hide">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="space-y-1">
              {!isCollapsed && (
                <div className="px-3 text-10 font-bold uppercase tracking-wider text-black-400">
                  {section.title}
                </div>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive =
                    item.href === "/dashboard"
                      ? pathname === "/dashboard"
                      : pathname?.startsWith(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      title={isCollapsed ? item.label : undefined}
                      className={cn(
                        isActive ? "sidebar-item-active" : "sidebar-item",
                        isCollapsed && "justify-center px-0 py-2.5"
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!isCollapsed && (
                        <span className="flex-1 truncate">{item.label}</span>
                      )}
                      {!isCollapsed &&
                        (item.href === "/dashboard/inbox"
                          ? inboxUnreadCount > 0
                          : item.badge !== undefined) && (
                          <span className="flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-purple-600 px-1.5 text-10 font-bold text-white shadow-glow-purple">
                            {item.href === "/dashboard/inbox"
                              ? inboxUnreadCount
                              : item.badge}
                          </span>
                        )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar Footer / User Profile */}
        <div className="shrink-0 border-t border-black-700/60 p-2.5">
          {!isCollapsed ? (
            <div className="flex items-center justify-between rounded-xl p-2 bg-black-800/40">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-600/20 text-purple-300 text-12 font-bold border border-purple-500/30">
                  AV
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-13 font-semibold text-white truncate">
                    Alex Vance
                  </span>
                  <span className="text-11 text-black-400 truncate">
                    alex@nxtsend.com
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="h-8 w-8 flex items-center justify-center rounded-lg text-black-400 hover:text-rose-400 hover:bg-black-700/50 transition-colors"
                title="Log Out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-600/20 text-purple-300 text-12 font-bold border border-purple-500/30">
                AV
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="h-7 w-7 flex items-center justify-center rounded-lg text-black-400 hover:text-rose-400"
                title="Log Out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main App Container */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Bar (64px) */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-black-700/70 bg-black-900 px-4 sm:px-6 z-30">
          <div className="flex items-center gap-3">
            {/* Mobile menu hamburger toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden flex h-9 w-9 items-center justify-center rounded-xl bg-black-800 text-black-300 hover:text-white"
            >
              <Zap className="h-4.5 w-4.5 text-purple-400" />
            </button>

            {/* Breadcrumb Workspace Name */}
            <div className="flex items-center gap-2 text-13 sm:text-14">
              <span className="text-black-400 hidden sm:inline">Workspace</span>
              <span className="text-black-600 hidden sm:inline">/</span>
              <span className="font-semibold text-white truncate max-w-[200px] sm:max-w-xs">
                {currentWorkspace}
              </span>
              <span className="demo-badge ml-1 text-10 py-0.5 px-2">
                Demo
              </span>
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2.5 sm:gap-4">
            {/* Search Button / Trigger */}
            <div className="relative hidden md:block w-48 lg:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-black-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search leads, campaigns..."
                className="w-full rounded-xl border border-black-700 bg-black-800/80 pl-9 pr-3 py-1.5 text-12 text-white placeholder-black-400 focus:border-purple-500 focus:outline-none"
              />
            </div>

            {/* Notifications Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-black-800 border border-black-700 text-black-300 hover:text-white transition-colors"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                {notifUnreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-purple-500 px-1 text-9 font-bold text-white shadow-glow-purple">
                    {notifUnreadCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 sm:w-88 rounded-2xl bg-black-800 border border-black-600 p-3 shadow-2xl z-40 text-13 animate-fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-black-700">
                    <span className="font-semibold text-white">Notifications</span>
                    {notifUnreadCount > 0 ? (
                      <button
                        type="button"
                        onClick={markAllNotificationsRead}
                        className="text-11 text-purple-400 font-medium hover:text-purple-300"
                      >
                        {notifUnreadCount} unread — mark all read
                      </button>
                    ) : (
                      <span className="text-11 text-black-400 font-medium">All caught up</span>
                    )}
                  </div>
                  <div className="divide-y divide-black-700/50 py-1 max-h-80 overflow-y-auto">
                    {userNotifications.length === 0 ? (
                      <p className="py-4 px-2 text-12 text-black-400">
                        No notifications yet. New replies to your campaigns
                        will appear here when they arrive.
                      </p>
                    ) : (
                      userNotifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => openNotification(n)}
                          className="w-full text-left py-2.5 hover:bg-black-700/30 px-2 rounded-lg transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-white text-12 flex items-center gap-1.5">
                              {!n.read_at && (
                                <span className="h-1.5 w-1.5 rounded-full bg-purple-400 shrink-0" />
                              )}
                              {n.title}
                            </span>
                            <span className="text-10 text-black-400 shrink-0">
                              {formatRelativeTime(n.created_at)}
                            </span>
                          </div>
                          <p className="text-11 text-black-300 mt-0.5 line-clamp-2">{n.body}</p>
                        </button>
                      ))
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotificationsOpen(false)}
                    className="w-full text-center text-11 text-black-400 hover:text-white pt-2 border-t border-black-700 block"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>

            {/* User Avatar Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setAvatarMenuOpen(!avatarMenuOpen)}
                className="flex items-center gap-2 rounded-xl bg-black-800 border border-black-700 p-1.5 hover:border-black-600 transition-colors"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-purple-600 to-orange-500 text-white text-11 font-bold">
                  AV
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-black-400 hidden sm:block mr-1" />
              </button>

              {avatarMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl bg-black-800 border border-black-600 p-2 shadow-2xl z-40 text-13 animate-fade-in">
                  <div className="px-3 py-2 border-b border-black-700">
                    <p className="font-semibold text-white">Alex Vance</p>
                    <p className="text-11 text-black-400 truncate">alex@nxtsend.com</p>
                  </div>
                  <div className="py-1 space-y-0.5">
                    <Link
                      href="/dashboard/settings"
                      onClick={() => setAvatarMenuOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-black-200 hover:text-white hover:bg-black-700/50"
                    >
                      <User className="h-4 w-4 text-purple-400" />
                      <span>Profile</span>
                    </Link>
                    <Link
                      href="/dashboard/settings"
                      onClick={() => setAvatarMenuOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-black-200 hover:text-white hover:bg-black-700/50"
                    >
                      <Settings className="h-4 w-4 text-black-400" />
                      <span>Settings</span>
                    </Link>
                    <Link
                      href="/admin"
                      onClick={() => setAvatarMenuOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-rose-300 hover:text-rose-200 hover:bg-rose-950/20"
                    >
                      <Shield className="h-4 w-4 text-rose-400" />
                      <span>Admin Panel</span>
                    </Link>
                  </div>
                  <div className="pt-1 border-t border-black-700">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-rose-400 hover:bg-black-700/50 text-left"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Log Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto bg-black-900 flex flex-col">
          {/* Admin-in-demo-mode notice (set by middleware redirect) */}
          {showAdminDemoNotice && (
            <div className="bg-rose-950/40 border-b border-rose-500/30 px-4 py-2.5 text-13 flex items-center justify-between gap-3 text-rose-200">
              <p>
                <strong>Admin Console is unavailable in Demo Mode</strong>{" "}
                &mdash; it shows sample data only. Connect Supabase and sign in
                with an admin account to use the real Admin Console.
              </p>
              <button
                type="button"
                onClick={() => setShowAdminDemoNotice(false)}
                className="rounded-full p-1 text-rose-300/80 hover:text-white hover:bg-white/10 shrink-0"
                aria-label="Dismiss admin demo notice"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Dismissible Demo Mode Banner at top of content area */}
          {showDemoTopNotice && demoBannerEnabled && (
            <div className="bg-gradient-to-r from-orange-600/20 via-purple-600/20 to-orange-600/20 border-b border-orange-500/30 px-4 py-2.5 text-13 flex items-center justify-between gap-3 text-orange-200">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="demo-badge text-10 py-0.5 px-2">DEMO</span>
                <p className="truncate">
                  <strong>Demo Mode</strong> &mdash; Connect Supabase in your environment to enable live sync and production pipelines.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Link
                  href="/dashboard/integrations"
                  className="text-12 font-semibold text-white underline hover:text-orange-300"
                >
                  Configure Integrations &rarr;
                </Link>
                <button
                  type="button"
                  onClick={() => setShowDemoTopNotice(false)}
                  className="rounded-full p-1 text-orange-300/80 hover:text-white hover:bg-white/10"
                  aria-label="Dismiss banner"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Children View */}
          <div className="flex-1 p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
