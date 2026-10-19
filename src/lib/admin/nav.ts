/**
 * Admin sidebar structure — the Round-2 brief's groups, as pure data.
 *
 * Kept separate from the layout so the structure is unit-testable (the
 * layout maps `icon` keys to lucide components). Every href must exist
 * as a page under src/app/(admin)/admin — a test asserts uniqueness and
 * the brief's full item list.
 */

export interface AdminNavItem {
  label: string;
  href: string;
  icon: string;
}

export interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    label: "Admin",
    items: [
      { label: "Overview", href: "/admin", icon: "LayoutDashboard" },
      { label: "My Campaigns", href: "/admin/my-campaigns", icon: "Target" },
      { label: "Users", href: "/admin/users", icon: "Users" },
      { label: "Campaigns", href: "/admin/campaigns", icon: "Megaphone" },
      { label: "Leads", href: "/admin/leads", icon: "UserSearch" },
      { label: "CRM", href: "/admin/crm", icon: "Database" },
      { label: "Submissions", href: "/admin/submissions", icon: "Inbox" },
      { label: "Notifications", href: "/admin/notifications", icon: "Bell" },
    ],
  },
  {
    label: "Analytics",
    items: [
      { label: "Website Visitors", href: "/admin/analytics/visitors", icon: "Globe" },
      { label: "Traffic Sources", href: "/admin/analytics/sources", icon: "Share2" },
      { label: "User Growth", href: "/admin/analytics/growth", icon: "TrendingUp" },
      { label: "Usage & Credits", href: "/admin/analytics/usage", icon: "Gauge" },
    ],
  },
  {
    label: "Billing",
    items: [
      { label: "Transactions", href: "/admin/billing/transactions", icon: "Receipt" },
      { label: "Revenue", href: "/admin/billing/revenue", icon: "DollarSign" },
      { label: "Subscriptions", href: "/admin/subscriptions", icon: "CreditCard" },
      { label: "Credit Rules", href: "/admin/billing/credit-rules", icon: "SlidersHorizontal" },
    ],
  },
  {
    label: "Integrations",
    items: [
      { label: "Email / Resend", href: "/admin/integrations/email", icon: "Mail" },
      { label: "Google Sheets", href: "/admin/integrations/sheets", icon: "Table" },
      { label: "AI Providers", href: "/admin/integrations/ai", icon: "Sparkles" },
      { label: "AI Chatbot", href: "/admin/integrations/chatbot", icon: "Bot" },
      { label: "Other APIs", href: "/admin/integrations/other", icon: "Blocks" },
      { label: "Muse.ai Integration", href: "/admin/integrations/muse-ai", icon: "Wand2" },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Queue & Workers", href: "/admin/system/queue", icon: "ListOrdered" },
      { label: "Online", href: "/admin/system/online", icon: "Radio" },
      { label: "Browser Automation", href: "/admin/system/browser-automation", icon: "MonitorSmartphone" },
      { label: "Campaign Settings", href: "/admin/system/campaign-settings", icon: "Settings2" },
      { label: "System Health", href: "/admin/system/health", icon: "HeartPulse" },
      { label: "Inbox Testing", href: "/admin/system/inbox-testing", icon: "FlaskConical" },
      { label: "Development Diagnostics", href: "/admin/system/diagnostics", icon: "Stethoscope" },
    ],
  },
  {
    label: "Security / Settings",
    items: [
      { label: "System Settings", href: "/admin/settings", icon: "Settings" },
      { label: "Configure Secrets", href: "/admin/settings/secrets", icon: "KeyRound" },
      { label: "Emergency Controls", href: "/admin/settings/emergency", icon: "Siren" },
      { label: "Audit Logs", href: "/admin/audit", icon: "Shield" },
    ],
  },
];

export const ADMIN_NAV_ITEMS: AdminNavItem[] = ADMIN_NAV_GROUPS.flatMap(
  (g) => g.items
);
