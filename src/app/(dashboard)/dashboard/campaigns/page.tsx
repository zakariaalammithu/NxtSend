"use client";

import * as React from "react";
import Link from "next/link";
import {
  Target,
  Plus,
  Search,
  Play,
  Pause,
  Copy,
  Archive,
  Trash2,
  Edit,
  ChevronLeft,
  ChevronRight,
  Download,
  Settings,
  BarChart3,
  Info,
  X,
  Users,
  UserPlus,
  UserCheck,
  MessageSquare,
  Reply,
  Send,
  MailOpen,
  MousePointerClick,
  MailX,
  Flag,
  Linkedin,
  Mail,
} from "lucide-react";
import { DemoBanner, Badge, Tooltip, Avatar, Modal } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import {
  getAccountsRepository,
  getCampaignsRepository,
  getInboxRepository,
  getLeadsRepository,
  loadCampaignStats,
  aggregateCampaignStats,
  resolveWorkspaceId,
  type CampaignStats,
} from "@/lib/data";
import { campaignsToCsv } from "@/lib/data/csv";
import type {
  Campaign,
  CampaignStatus,
  CampaignType,
  ConnectedAccount,
} from "@/types";

const PAGE_SIZE = 10;
const INFO_BANNER_KEY = "nxtsend_campaigns_info_dismissed_v1";

type TabKey = CampaignStatus;
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "active", label: "Active" },
  { key: "draft", label: "Drafts" },
  { key: "paused", label: "Paused" },
  { key: "archived", label: "Archived" },
];

const STATUS_DOT: Record<CampaignStatus, string> = {
  active: "bg-emerald-400",
  paused: "bg-amber-400",
  draft: "bg-black-400",
  archived: "bg-rose-400",
};

const DATE_RANGES = [
  { key: "all", label: "All time", days: null },
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
] as const;
type DateRangeKey = (typeof DATE_RANGES)[number]["key"];

function channelLabel(type: CampaignType): string {
  if (type === "linkedin") return "LinkedIn";
  if (type === "email") return "Email";
  return "LinkedIn + Email";
}

/**
 * Fallback sender text for campaigns with no connected account
 * (pre-accounts campaigns, or the account was deleted — the
 * reference is nullable by design): state only what the product
 * actually knows about the workspace's sending state per channel.
 */
function senderStateText(c: Campaign, isDemo: boolean): string {
  const li = "LinkedIn: no provider connected";
  const em = isDemo ? "Email: simulated (Demo Mode)" : "Email: sends via provider";
  if (c.type === "linkedin") return li;
  if (c.type === "email") return em;
  return `${li} · ${em}`;
}

/**
 * The account a campaign's sender cell represents: strictly the
 * LinkedIn (sender) account for LinkedIn/mixed campaigns, strictly
 * the email account for email campaigns — no cross-channel fallback,
 * so a deleted LinkedIn account never makes the email account pose
 * as the LinkedIn sender. Null when the campaign references no
 * account for its channel or the account no longer exists.
 */
function campaignSenderAccount(
  c: Campaign,
  accountsById: Map<string, ConnectedAccount>
): ConnectedAccount | null {
  const primaryId =
    c.type === "email" ? c.email_account_id : c.sender_account_id;
  if (!primaryId) return null;
  return accountsById.get(primaryId) ?? null;
}

function FunnelMetric({
  icon: Icon,
  label,
  value,
  tooltip,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tooltip: string;
}) {
  return (
    <div className="min-w-[86px]">
      <div className="flex items-center gap-1.5 text-black-400">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-11 font-medium">{label}</span>
        <Tooltip content={tooltip} tooltipClassName="whitespace-normal w-56 text-left">
          <Info className="h-3 w-3 text-black-500 hover:text-black-300 cursor-help" />
        </Tooltip>
      </div>
      <div className="mt-1 text-20 font-bold text-white leading-none">{value}</div>
    </div>
  );
}

export default function CampaignsListPage() {
  const campaignsRepo = React.useMemo(() => getCampaignsRepository(), []);
  const accountsRepo = React.useMemo(() => getAccountsRepository(), []);
  const inboxRepo = React.useMemo(() => getInboxRepository(), []);
  const leadsRepo = React.useMemo(() => getLeadsRepository(), []);
  const isDemo = campaignsRepo.mode === "demo";
  const statsDeps = React.useMemo(
    () => ({ campaignsRepo, inboxRepo, leadsRepo, mode: campaignsRepo.mode }),
    [campaignsRepo, inboxRepo, leadsRepo]
  );

  const [workspaceId, setWorkspaceId] = React.useState<string | null>(null);
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [accounts, setAccounts] = React.useState<ConnectedAccount[]>([]);
  const [statsMap, setStatsMap] = React.useState<Map<string, CampaignStats>>(
    new Map()
  );
  const [isLoading, setIsLoading] = React.useState(true);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<TabKey>("active");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");
  const [accountFilter, setAccountFilter] = React.useState<string>("all");
  const [dateRange, setDateRange] = React.useState<DateRangeKey>("all");
  const [page, setPage] = React.useState(1);
  const [actionMenuOpenId, setActionMenuOpenId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Campaign | null>(null);
  const [infoDismissed, setInfoDismissed] = React.useState(true);

  // The row action menu dismisses on click-away (backdrop) — Escape must
  // dismiss it too, otherwise the invisible backdrop keeps intercepting
  // pointer events and the page looks frozen to keyboard users.
  React.useEffect(() => {
    if (actionMenuOpenId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActionMenuOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actionMenuOpenId]);

  React.useEffect(() => {
    try {
      setInfoDismissed(
        window.localStorage.getItem(INFO_BANNER_KEY) === "true"
      );
    } catch {
      setInfoDismissed(false);
    }
  }, []);

  // Deep link support: /dashboard/campaigns?tab=drafts (the wizard's
  // "Save as draft" lands here). Accepts the tab keys ("draft") and
  // their plural label forms ("drafts"). Same window.location pattern
  // as the detail page's ?tab= support.
  React.useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("tab");
    if (!raw) return;
    const byLabelOrKey: Record<string, TabKey> = {
      active: "active",
      draft: "draft",
      drafts: "draft",
      paused: "paused",
      archived: "archived",
    };
    const match = byLabelOrKey[raw.toLowerCase()];
    if (match) setActiveTab(match);
  }, []);

  const dismissInfo = () => {
    try {
      window.localStorage.setItem(INFO_BANNER_KEY, "true");
    } catch {
      // persistence is best-effort
    }
    setInfoDismissed(true);
  };

  // Campaigns + their honest stats load through the data layer; every
  // lifecycle action persists through the same layer and refreshes.
  const refreshAll = React.useCallback(
    async (ws: string) => {
      const rows = await campaignsRepo.listCampaigns(ws);
      setCampaigns(rows);
      setAccounts(await accountsRepo.listAccounts(ws));
      const stats = await loadCampaignStats(statsDeps, ws, rows);
      setStatsMap(stats.byCampaign);
    },
    [campaignsRepo, accountsRepo, statsDeps]
  );

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ws = await resolveWorkspaceId();
        if (cancelled) return;
        setWorkspaceId(ws);
        if (ws) await refreshAll(ws);
      } catch (err) {
        if (!cancelled) {
          setActionError(
            err instanceof Error ? err.message : "Failed to load campaigns."
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshAll]);

  // Reset to the first page whenever the view scope changes.
  React.useEffect(() => {
    setPage(1);
  }, [activeTab, searchQuery, typeFilter, accountFilter, dateRange]);

  const tabCounts = React.useMemo(() => {
    const counts: Record<TabKey, number> = {
      active: 0,
      draft: 0,
      paused: 0,
      archived: 0,
    };
    for (const c of campaigns) counts[c.status] = (counts[c.status] ?? 0) + 1;
    return counts;
  }, [campaigns]);

  const dateCutoff = React.useMemo(() => {
    const range = DATE_RANGES.find((r) => r.key === dateRange);
    if (!range || range.days === null) return null;
    return Date.now() - range.days * 24 * 60 * 60 * 1000;
  }, [dateRange]);

  // Campaigns in the active tab + date range — this is also the scope
  // the funnel strip aggregates over.
  const scopedCampaigns = React.useMemo(
    () =>
      campaigns.filter((c) => {
        if (c.status !== activeTab) return false;
        if (dateCutoff !== null && new Date(c.created_at).getTime() < dateCutoff)
          return false;
        return true;
      }),
    [campaigns, activeTab, dateCutoff]
  );

  const accountsById = React.useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts]
  );

  const visibleCampaigns = React.useMemo(
    () =>
      scopedCampaigns.filter((c) => {
        const matchesSearch = c.name
          .toLowerCase()
          .includes(searchQuery.toLowerCase());
        const matchesType = typeFilter === "all" || c.type === typeFilter;
        const matchesAccount =
          accountFilter === "all" ||
          c.sender_account_id === accountFilter ||
          c.email_account_id === accountFilter;
        return matchesSearch && matchesType && matchesAccount;
      }),
    [scopedCampaigns, searchQuery, typeFilter, accountFilter]
  );

  const funnel = React.useMemo(
    () =>
      aggregateCampaignStats(
        scopedCampaigns
          .map((c) => statsMap.get(c.id))
          .filter((s): s is CampaignStats => Boolean(s))
      ),
    [scopedCampaigns, statsMap]
  );

  const totalPages = Math.max(1, Math.ceil(visibleCampaigns.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = visibleCampaigns.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const filtersActive =
    searchQuery !== "" ||
    typeFilter !== "all" ||
    accountFilter !== "all" ||
    dateRange !== "all";

  const resetFilters = () => {
    setSearchQuery("");
    setTypeFilter("all");
    setAccountFilter("all");
    setDateRange("all");
  };

  // ---- Actions ------------------------------------------------------------

  const runAction = async (fn: () => Promise<void>) => {
    setActionError(null);
    setActionMenuOpenId(null);
    try {
      await fn();
      if (workspaceId) await refreshAll(workspaceId);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "That action failed. Please try again."
      );
    }
  };

  /** Inline On/Off switch — optimistic, reverts + reports on failure. */
  const handleToggle = async (c: Campaign) => {
    if (!workspaceId) return;
    if (c.status !== "active" && c.status !== "paused") return;
    const prev = c.status;
    const next: CampaignStatus = prev === "active" ? "paused" : "active";
    setActionError(null);
    setCampaigns((rows) =>
      rows.map((r) => (r.id === c.id ? { ...r, status: next } : r))
    );
    try {
      await campaignsRepo.setCampaignStatus(workspaceId, c.id, next);
    } catch (err) {
      setCampaigns((rows) =>
        rows.map((r) => (r.id === c.id ? { ...r, status: prev } : r))
      );
      setActionError(
        err instanceof Error
          ? err.message
          : `Failed to ${next === "paused" ? "pause" : "resume"} "${c.name}" — the change was reverted.`
      );
    }
  };

  const handleDuplicate = (c: Campaign) => {
    if (!workspaceId) return;
    void runAction(async () => {
      await campaignsRepo.duplicateCampaign(workspaceId, c.id);
    });
  };

  const handleArchive = (id: string) => {
    if (!workspaceId) return;
    void runAction(() =>
      campaignsRepo.setCampaignStatus(workspaceId, id, "archived")
    );
  };

  const handleDeleteConfirmed = () => {
    if (!workspaceId || !deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    void runAction(() => campaignsRepo.deleteCampaign(workspaceId, id));
  };

  const handleExport = () => {
    const csv = campaignsToCsv(
      visibleCampaigns.map((c) => ({
        campaign: c,
        stats: statsMap.get(c.id),
      }))
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nxtsend-campaigns.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const getTypeBadge = (type: CampaignType) => {
    switch (type) {
      case "linkedin":
        return <Badge variant="blue">LinkedIn</Badge>;
      case "email":
        return <Badge variant="purple">Email</Badge>;
      case "mixed":
        return <Badge variant="orange">Mixed Multi</Badge>;
      default:
        return <Badge variant="gray">{type}</Badge>;
    }
  };

  const activeTabLabel = TABS.find((t) => t.key === activeTab)?.label ?? "";
  const dateLabel =
    DATE_RANGES.find((r) => r.key === dateRange)?.label ?? "All time";

  return (
    <div className="space-y-6 pb-12">
      {/* Demo Banner */}
      <DemoBanner feature="Campaign Engine" />

      {/* Info banner — dismissible, persisted per browser */}
      {!infoDismissed && (
        <div className="rounded-2xl border border-blue-500/30 bg-blue-600/10 px-5 py-4 flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300">
            <Info className="h-4 w-4" />
          </span>
          <div className="flex-1 text-13 text-blue-100/90 leading-relaxed">
            <p>
              Manage every campaign from one place: use the switch to pause or
              resume, and the gear menu to edit, duplicate, archive or delete.
              Every number below is computed from recorded enrollments,
              messages and step executions — LinkedIn steps are recorded by
              the sequence engine but not sent until an authorized LinkedIn
              provider is connected; email steps send through your connected
              email provider{isDemo ? " (simulated in Demo Mode)" : ""}.{" "}
              <Link
                href="/dashboard/integrations"
                className="font-semibold text-blue-300 hover:text-blue-200 underline underline-offset-2"
              >
                Open the Integration Center
              </Link>
            </p>
          </div>
          <button
            type="button"
            onClick={dismissInfo}
            aria-label="Dismiss this information"
            className="shrink-0 rounded-lg p-1 text-blue-300/70 hover:text-white hover:bg-blue-500/20 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">
              Campaigns
            </h1>
            {isDemo && <span className="demo-badge">Demo Data</span>}
          </div>
          <p className="mt-1 text-14 text-black-300">
            Create and monitor automated sequences across LinkedIn & cold emails.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-xl bg-black-800 hover:bg-black-700 border border-black-600 px-4 py-2.5 text-14 font-medium text-black-100 transition-colors"
          >
            <Download className="h-4 w-4" />
            <span>Export</span>
          </button>
          <Link
            href="/dashboard/campaigns/new"
            className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-2.5 text-14 font-semibold text-white shadow-glow-purple transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>New campaign</span>
          </Link>
        </div>
      </div>

      {/* Funnel stats strip — real aggregates over the campaigns in view */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <h2 className="text-13 font-semibold text-white">
            Performance overview
          </h2>
          <span className="text-12 text-black-400">
            {activeTabLabel} campaigns · {dateLabel}
            {isDemo ? " · Demo Mode data" : ""}
          </span>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-5">
          {/* Total prospects */}
          <FunnelMetric
            icon={Users}
            label="Total prospects"
            value={String(funnel.prospects)}
            tooltip="Leads enrolled in the campaigns in view (recorded enrollments)."
          />

          <div className="hidden md:block w-px bg-black-700/70" />

          {/* LinkedIn group */}
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <Linkedin className="h-4 w-4 text-blue-400" />
              <span className="text-12 font-semibold text-white">LinkedIn</span>
              {!funnel.linkedin.providerConnected && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-10 font-semibold text-amber-300">
                  Provider not connected
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-4">
              <FunnelMetric
                icon={UserPlus}
                label="Connection sent"
                value={String(funnel.linkedin.connectionRequestsSent)}
                tooltip="Connection-request steps the executor actually sent. Steps are recorded as skipped while no LinkedIn provider is connected."
              />
              <FunnelMetric
                icon={UserCheck}
                label="Accepted"
                value={funnel.linkedin.accepted === null ? "—" : String(funnel.linkedin.accepted)}
                tooltip="No data source exists for accepted connections until a LinkedIn provider reports them — shown as — rather than estimated."
              />
              <FunnelMetric
                icon={MessageSquare}
                label="Messages"
                value={String(funnel.linkedin.messagesSent)}
                tooltip="LinkedIn message steps the executor actually sent (execution records, not inbox content)."
              />
              <FunnelMetric
                icon={Reply}
                label="Replied"
                value={String(funnel.linkedin.replied)}
                tooltip="Inbound LinkedIn replies recorded in the Inbox against these campaigns."
              />
            </div>
            {!funnel.linkedin.providerConnected && (
              <p className="mt-2.5 text-11 text-black-400">
                LinkedIn provider not connected — steps are recorded, not
                sent ({funnel.linkedin.stepsSkipped} skipped so far).
              </p>
            )}
          </div>

          <div className="hidden md:block w-px bg-black-700/70" />

          {/* Email group */}
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <Mail className="h-4 w-4 text-purple-400" />
              <span className="text-12 font-semibold text-white">Email</span>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-4">
              <FunnelMetric
                icon={Send}
                label="Sent"
                value={String(funnel.email.sent)}
                tooltip={`Outbound campaign emails with a recorded send outcome: ${funnel.email.sentProviderConfirmed} provider-confirmed, ${funnel.email.sentSimulated} simulated.`}
              />
              <FunnelMetric
                icon={MailOpen}
                label="Opened"
                value={funnel.email.opened === null ? "—" : String(funnel.email.opened)}
                tooltip="Opens recorded by the email provider's webhooks, read through the deliverability service (simulated from demo data in Demo Mode). Shown as — only when no event source is available — never invented."
              />
              <FunnelMetric
                icon={MousePointerClick}
                label="Clicked"
                value={funnel.email.clicked === null ? "—" : String(funnel.email.clicked)}
                tooltip="Clicks recorded by the email provider's webhooks, read through the deliverability service (simulated from demo data in Demo Mode). Shown as — only when no event source is available — never invented."
              />
              <FunnelMetric
                icon={MailX}
                label="Bounced"
                value={funnel.email.bounced === null ? "—" : String(funnel.email.bounced)}
                tooltip="Distinct recipients whose provider reported a bounce (webhook events, via the deliverability service). Bounced addresses are auto-suppressed."
              />
              <FunnelMetric
                icon={Flag}
                label="Complained"
                value={funnel.email.complained === null ? "—" : String(funnel.email.complained)}
                tooltip="Distinct recipients whose provider reported a spam complaint (webhook events, via the deliverability service). Complained addresses are auto-suppressed."
              />
              <FunnelMetric
                icon={Reply}
                label="Replied"
                value={String(funnel.email.replied)}
                tooltip="Inbound email replies recorded in the Inbox against these campaigns."
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-black-700/80 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`whitespace-nowrap px-4 py-2.5 text-14 font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? "border-purple-500 text-white"
                : "border-transparent text-black-400 hover:text-white"
            }`}
          >
            {tab.label}
            <span
              className={`ml-2 rounded-full px-1.5 py-0.5 text-11 font-semibold ${
                activeTab === tab.key
                  ? "bg-purple-600/25 text-purple-200"
                  : "bg-black-700 text-black-300"
              }`}
            >
              {tabCounts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-card p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-black-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search campaigns..."
            className="input-field pl-10 py-2.5 text-13"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 flex-1 md:flex-initial">
            <span className="text-12 text-black-400 font-medium whitespace-nowrap">
              Created:
            </span>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DateRangeKey)}
              className="rounded-xl border border-black-600 bg-black-800 px-3 py-2 text-13 text-white focus:outline-none focus:border-purple-500"
              aria-label="Filter by creation date"
            >
              {DATE_RANGES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 flex-1 md:flex-initial">
            <span className="text-12 text-black-400 font-medium whitespace-nowrap">
              Type:
            </span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-xl border border-black-600 bg-black-800 px-3 py-2 text-13 text-white focus:outline-none focus:border-purple-500"
              aria-label="Filter by campaign type"
            >
              <option value="all">All</option>
              <option value="mixed">Mixed</option>
              <option value="linkedin">LinkedIn</option>
              <option value="email">Email</option>
            </select>
          </div>

          <div className="flex items-center gap-2 flex-1 md:flex-initial">
            <span className="text-12 text-black-400 font-medium whitespace-nowrap">
              Account:
            </span>
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="rounded-xl border border-black-600 bg-black-800 px-3 py-2 text-13 text-white focus:outline-none focus:border-purple-500"
              aria-label="Filter by connected account"
              data-testid="campaign-account-filter"
            >
              <option value="all">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.display_name} ({a.channel === "linkedin" ? "LinkedIn" : "Email"})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-950/20 px-5 py-3 text-13 text-rose-200">
          {actionError}
        </div>
      )}

      {/* Campaigns Table */}
      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-13 text-black-400">
            Loading campaigns…
          </div>
        ) : campaigns.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-black-800 border border-black-700 text-black-400">
              <Target className="h-6 w-6" />
            </div>
            <h3 className="text-16 font-semibold text-white">No campaigns yet</h3>
            <p className="text-13 text-black-400 max-w-sm mx-auto">
              Create your first campaign to start enrolling prospects into an
              automated LinkedIn &amp; email sequence.
            </p>
            <div className="pt-2">
              <Link
                href="/dashboard/campaigns/new"
                className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-2 text-13 font-semibold text-white transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Create Campaign</span>
              </Link>
            </div>
          </div>
        ) : visibleCampaigns.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-black-800 border border-black-700 text-black-400">
              <Target className="h-6 w-6" />
            </div>
            <h3 className="text-16 font-semibold text-white">
              {filtersActive
                ? "No campaigns match your filters"
                : `No ${activeTabLabel.toLowerCase()} campaigns`}
            </h3>
            <p className="text-13 text-black-400 max-w-sm mx-auto">
              {filtersActive
                ? "Try a different search term, type, account or date range — or reset the filters to see everything in this tab."
                : `There are no campaigns with the ${activeTabLabel.toLowerCase()} status right now. Switch tabs or create a new campaign.`}
            </p>
            {filtersActive && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-black-800 hover:bg-black-700 border border-black-600 px-4 py-2 text-13 font-medium text-white transition-colors"
                >
                  Reset filters
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-13 border-collapse">
              <thead>
                <tr className="border-b border-black-700/80 bg-black-800/40 text-11 font-semibold uppercase tracking-wider text-black-400">
                  <th className="py-3 px-4" rowSpan={2}>
                    <span className="sr-only">On/Off</span>
                  </th>
                  <th className="py-3 px-4" rowSpan={2}>Campaign</th>
                  <th className="py-3 px-4" rowSpan={2}>Sender</th>
                  <th className="py-2 px-4 text-center text-blue-300" colSpan={4}>
                    LinkedIn
                  </th>
                  <th className="py-2 px-4 text-center text-purple-300" colSpan={4}>
                    Email
                  </th>
                  <th className="py-3 px-4 text-right" rowSpan={2}>Actions</th>
                </tr>
                <tr className="border-b border-black-700/80 bg-black-800/40 text-10 font-semibold uppercase tracking-wider text-black-500">
                  <th className="py-2 px-3 text-center font-semibold">Connections</th>
                  <th className="py-2 px-3 text-center font-semibold">Accepted</th>
                  <th className="py-2 px-3 text-center font-semibold">Messages</th>
                  <th className="py-2 px-3 text-center font-semibold">Replied</th>
                  <th className="py-2 px-3 text-center font-semibold">Sent</th>
                  <th className="py-2 px-3 text-center font-semibold">Opened</th>
                  <th className="py-2 px-3 text-center font-semibold">Clicked</th>
                  <th className="py-2 px-3 text-center font-semibold">Replied</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black-700/50">
                {pageRows.map((camp, rowIdx) => {
                  const stats = statsMap.get(camp.id);
                  const senderAccount = campaignSenderAccount(
                    camp,
                    accountsById
                  );
                  const isOn = camp.status === "active";
                  const canToggle =
                    camp.status === "active" || camp.status === "paused";
                  const menuUp = rowIdx >= pageRows.length - 2 && pageRows.length > 2;
                  return (
                    <tr key={camp.id} className="table-row-hover group">
                      {/* On/Off toggle */}
                      <td className="py-4 px-4 align-top">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isOn}
                          aria-label={`${isOn ? "Pause" : "Resume"} campaign ${camp.name}`}
                          disabled={!canToggle}
                          title={
                            canToggle
                              ? isOn
                                ? "Pause campaign"
                                : "Resume campaign"
                              : camp.status === "draft"
                                ? "Drafts are not running — launch or duplicate the campaign to activate it"
                                : "Archived campaigns cannot be resumed"
                          }
                          onClick={() => void handleToggle(camp)}
                          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                            isOn ? "bg-emerald-500" : "bg-black-600"
                          } ${canToggle ? "cursor-pointer" : "opacity-40 cursor-not-allowed"}`}
                        >
                          <span
                            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                              isOn ? "left-[22px]" : "left-0.5"
                            }`}
                          />
                        </button>
                      </td>

                      {/* Campaign: status dot + name + prospects + created */}
                      <td className="py-4 px-4 align-top">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[camp.status]}`}
                            title={`Status: ${camp.status}`}
                          />
                          <Link
                            href={`/dashboard/campaigns/${camp.id}`}
                            className="font-semibold text-white hover:text-purple-400 transition-colors"
                          >
                            {camp.name}
                          </Link>
                          {getTypeBadge(camp.type)}
                        </div>
                        <div className="mt-1 text-12 text-black-400">
                          {stats ? stats.prospects : "—"} prospects · Created{" "}
                          {formatDate(camp.created_at, "short")}
                        </div>
                      </td>

                      {/* Sender: the campaign's connected account when
                          it has one (avatar + name + handle, and the
                          "Warm-up mode" label only when that LinkedIn
                          account's warm-up is actually on); otherwise
                          the honest workspace sending-state text. */}
                      <td className="py-4 px-4 align-top">
                        {senderAccount ? (
                          <div className="flex items-center gap-2.5">
                            <Avatar
                              src={senderAccount.avatar_url}
                              name={senderAccount.display_name}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <div className="text-12 font-medium text-black-100">
                                {senderAccount.display_name}
                              </div>
                              <div className="text-11 text-black-400 leading-snug max-w-[220px] truncate">
                                {senderAccount.handle_or_email}
                              </div>
                              {senderAccount.channel === "linkedin" &&
                                senderAccount.warmup_enabled && (
                                  <span
                                    className="mt-1 inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-10 font-medium text-amber-300"
                                    data-testid="sender-warmup-label"
                                  >
                                    Warm-up mode
                                  </span>
                                )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2.5">
                            <Avatar name={channelLabel(camp.type)} size="sm" />
                            <div className="min-w-0">
                              <div className="text-12 font-medium text-black-100">
                                {channelLabel(camp.type)}
                              </div>
                              <div className="text-11 text-black-400 leading-snug max-w-[220px]">
                                {senderStateText(camp, isDemo)}
                              </div>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* LinkedIn metrics (execution records only) */}
                      <td className="py-4 px-3 text-center text-black-200 align-top">
                        {stats ? stats.linkedin.connectionRequestsSent : "—"}
                      </td>
                      <td
                        className="py-4 px-3 text-center text-black-400 align-top"
                        title="No data source until a LinkedIn provider is connected"
                      >
                        {stats?.linkedin.accepted === null || !stats
                          ? "—"
                          : stats.linkedin.accepted}
                      </td>
                      <td className="py-4 px-3 text-center text-black-200 align-top">
                        {stats ? stats.linkedin.messagesSent : "—"}
                      </td>
                      <td className="py-4 px-3 text-center text-black-200 align-top">
                        {stats ? stats.linkedin.replied : "—"}
                      </td>

                      {/* Email metrics */}
                      <td className="py-4 px-3 text-center text-black-200 align-top">
                        {stats ? stats.email.sent : "—"}
                      </td>
                      <td
                        className="py-4 px-3 text-center text-black-400 align-top"
                        title="Recorded by provider webhooks, read through the deliverability service (simulated in Demo Mode)"
                      >
                        {stats?.email.opened === null || !stats
                          ? "—"
                          : stats.email.opened}
                      </td>
                      <td
                        className="py-4 px-3 text-center text-black-400 align-top"
                        title="Recorded by provider webhooks, read through the deliverability service (simulated in Demo Mode)"
                      >
                        {stats?.email.clicked === null || !stats
                          ? "—"
                          : stats.email.clicked}
                      </td>
                      <td className="py-4 px-3 text-center text-black-200 align-top">
                        {stats ? stats.email.replied : "—"}
                      </td>

                      {/* Actions: analytics + settings menu */}
                      <td className="py-4 px-4 text-right align-top relative">
                        <div className="inline-flex items-center gap-1">
                          <Link
                            href={`/dashboard/campaigns/${camp.id}?tab=analytics`}
                            title="View analytics"
                            aria-label={`View analytics for ${camp.name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-black-400 hover:text-white hover:bg-black-700/60 transition-colors"
                          >
                            <BarChart3 className="h-4 w-4" />
                          </Link>
                          <div className="inline-block text-left">
                            <button
                              type="button"
                              aria-label={`Settings for ${camp.name}`}
                              onClick={() =>
                                setActionMenuOpenId(
                                  actionMenuOpenId === camp.id ? null : camp.id
                                )
                              }
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-black-400 hover:text-white hover:bg-black-700/60 transition-colors"
                            >
                              <Settings className="h-4 w-4" />
                            </button>

                            {actionMenuOpenId === camp.id && (
                              <>
                                <button
                                  type="button"
                                  aria-hidden="true"
                                  tabIndex={-1}
                                  className="fixed inset-0 z-20 cursor-default"
                                  onClick={() => setActionMenuOpenId(null)}
                                />
                                <div
                                  className={`absolute right-10 z-30 w-48 rounded-xl bg-black-800 border border-black-600 p-1.5 shadow-2xl text-12 text-left animate-fade-in ${
                                    menuUp ? "bottom-10" : "top-10"
                                  }`}
                                >
                                  <Link
                                    href={
                                      camp.status === "draft"
                                        ? `/dashboard/campaigns/new?campaignId=${camp.id}`
                                        : `/dashboard/campaigns/${camp.id}`
                                    }
                                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-black-200 hover:text-white hover:bg-black-700/50"
                                  >
                                    <Edit className="h-3.5 w-3.5" />
                                    <span>
                                      {camp.status === "draft"
                                        ? "Continue in Wizard"
                                        : "Edit Details"}
                                    </span>
                                  </Link>

                                  <button
                                    type="button"
                                    disabled={!canToggle}
                                    onClick={() => {
                                      setActionMenuOpenId(null);
                                      void handleToggle(camp);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-black-200 hover:text-white hover:bg-black-700/50 disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    {camp.status === "active" ? (
                                      <>
                                        <Pause className="h-3.5 w-3.5 text-yellow-400" />
                                        <span>Pause Campaign</span>
                                      </>
                                    ) : (
                                      <>
                                        <Play className="h-3.5 w-3.5 text-emerald-400" />
                                        <span>Resume Campaign</span>
                                      </>
                                    )}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDuplicate(camp)}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-black-200 hover:text-white hover:bg-black-700/50"
                                  >
                                    <Copy className="h-3.5 w-3.5 text-blue-400" />
                                    <span>Duplicate</span>
                                  </button>

                                  {camp.status !== "archived" && (
                                    <button
                                      type="button"
                                      onClick={() => handleArchive(camp.id)}
                                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-black-200 hover:text-white hover:bg-black-700/50"
                                    >
                                      <Archive className="h-3.5 w-3.5 text-orange-400" />
                                      <span>Archive</span>
                                    </button>
                                  )}

                                  <div className="border-t border-black-700 my-1" />

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActionMenuOpenId(null);
                                      setDeleteTarget(camp);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-rose-400 hover:bg-rose-950/30"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    <span>Delete</span>
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls — real client pagination, page size 10 */}
        {!isLoading && visibleCampaigns.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-black-700/60 p-4 text-12 text-black-400">
            <span>
              Showing{" "}
              <strong className="text-white">
                {(safePage - 1) * PAGE_SIZE + 1}–
                {Math.min(safePage * PAGE_SIZE, visibleCampaigns.length)}
              </strong>{" "}
              of <strong className="text-white">{visibleCampaigns.length}</strong>{" "}
              campaigns
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-black-800 text-black-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  aria-label={`Page ${n}`}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg font-semibold ${
                    n === safePage
                      ? "bg-purple-600 text-white"
                      : "bg-black-800 text-black-300 hover:text-white"
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Next page"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-black-800 text-black-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete this campaign?"
        description={
          deleteTarget
            ? `"${deleteTarget.name}" and its sequence steps and enrollment records will be permanently removed. This cannot be undone.`
            : undefined
        }
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="rounded-xl bg-black-800 hover:bg-black-700 border border-black-600 px-4 py-2 text-13 font-medium text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteConfirmed}
              className="rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-2 text-13 font-semibold text-white transition-colors"
            >
              Delete campaign
            </button>
          </>
        }
      >
        <p className="text-13 text-black-300">
          Recorded message history in the Inbox is kept — only the campaign,
          its steps and its enrollments are deleted.
        </p>
      </Modal>
    </div>
  );
}
