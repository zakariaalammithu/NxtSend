"use client";

import * as React from "react";
import Link from "next/link";
import {
  Users,
  Target,
  MessageSquare,
  Mail,
  Plus,
  Upload,
  BarChart3,
  ArrowRight,
  Sparkles,
  Inbox,
  AlertTriangle,
  History,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { DemoBanner } from "@/components/ui";
import { StatsCard } from "@/components/dashboard/StatsCard";
import {
  getCampaignsRepository,
  getInboxRepository,
  getLeadsRepository,
  getUsageRepository,
  listMessageHistory,
  resolveWorkspaceId,
  type ActivityEntry,
  type HistoryMessage,
  type WorkspaceUsage,
} from "@/lib/data";
import { getUserSettingsRepository } from "@/lib/data/user-settings";
import { PLAN_CATALOG } from "@/lib/billing/plans";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const ACTION_LABELS: Record<string, string> = {
  campaign_created: "Campaign created",
  campaign_updated: "Campaign updated",
  campaign_paused: "Campaign paused",
  campaign_resumed: "Campaign resumed",
  campaign_archived: "Campaign archived",
  campaign_duplicated: "Campaign duplicated",
  campaign_deleted: "Campaign deleted",
  leads_enrolled: "Leads enrolled",
};

interface FeedItem {
  id: string;
  kind: "campaign" | "message";
  title: string;
  description: string;
  at: string;
  chip?: { text: string; tone: "demo" | "ok" | "bad" | "neutral" };
}

export default function DashboardOverviewPage() {
  const leadsRepo = React.useMemo(() => getLeadsRepository(), []);
  const campaignsRepo = React.useMemo(() => getCampaignsRepository(), []);
  const usageRepo = React.useMemo(() => getUsageRepository(), []);
  const inboxRepo = React.useMemo(() => getInboxRepository(), []);
  const settingsRepo = React.useMemo(() => getUserSettingsRepository(), []);
  const isDemo = leadsRepo.mode === "demo";

  const [firstName, setFirstName] = React.useState<string>("");
  const [leadCount, setLeadCount] = React.useState<number | null>(null);
  const [contactedCount, setContactedCount] = React.useState(0);
  const [campaignTotal, setCampaignTotal] = React.useState<number | null>(null);
  const [activeCampaigns, setActiveCampaigns] = React.useState(0);
  const [unreadCount, setUnreadCount] = React.useState<number | null>(null);
  const [usage, setUsage] = React.useState<WorkspaceUsage | null>(null);
  const [feed, setFeed] = React.useState<FeedItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ws = await resolveWorkspaceId();
        if (!ws) {
          if (!cancelled) setIsLoading(false);
          return;
        }

        const [leads, campaigns, usageData, activity, history, settings] =
          await Promise.all([
            leadsRepo.listLeads(ws),
            campaignsRepo.listCampaigns(ws),
            usageRepo.getWorkspaceUsage(ws),
            campaignsRepo.listActivity(ws),
            listMessageHistory(inboxRepo, ws, 50),
            settingsRepo.getSettings().catch(() => null),
          ]);
        if (cancelled) return;

        setLeadCount(leads.length);
        setContactedCount(leads.filter((l) => l.status !== "new").length);
        setCampaignTotal(campaigns.length);
        setActiveCampaigns(campaigns.filter((c) => c.status === "active").length);
        setUsage(usageData);
        if (settings?.identity.full_name) {
          setFirstName(settings.identity.full_name.split(" ")[0]);
        }

        // Unread conversations — same API the sidebar badge uses.
        try {
          const res = await fetch("/api/inbox/unread-count");
          if (res.ok) {
            const data = (await res.json()) as { count?: number };
            if (!cancelled && typeof data.count === "number") {
              setUnreadCount(data.count);
            }
          }
        } catch {
          // Badge/count is best-effort; the inbox page surfaces errors.
        }
        if (cancelled) return;

        const campaignById = new Map(campaigns.map((c) => [c.id, c.name]));
        const items: FeedItem[] = [];

        for (const entry of activity as ActivityEntry[]) {
          items.push({
            id: `act_${entry.id}`,
            kind: "campaign",
            title:
              ACTION_LABELS[entry.action] ??
              entry.action.replace(/_/g, " "),
            description:
              entry.details ||
              (entry.campaign_id
                ? (campaignById.get(entry.campaign_id) ?? "Campaign")
                : "Workspace activity"),
            at: entry.created_at,
            chip: entry.simulated
              ? { text: "Simulated", tone: "demo" }
              : undefined,
          });
        }

        for (const msg of history as HistoryMessage[]) {
          items.push({
            id: `msg_${msg.id}`,
            kind: "message",
            title:
              msg.direction === "inbound"
                ? `Reply from ${msg.contact_name}`
                : `Message to ${msg.contact_name}`,
            description:
              (msg.conversation_subject ? `${msg.conversation_subject} — ` : "") +
              msg.content.slice(0, 110),
            at: msg.sent_at,
            chip:
              msg.verification === "simulated"
                ? { text: "Simulated", tone: "demo" }
                : msg.verification === "provider"
                  ? { text: "Provider-confirmed", tone: "ok" }
                  : msg.verification === "failed"
                    ? { text: "Failed", tone: "bad" }
                    : undefined,
          });
        }

        items.sort((a, b) => b.at.localeCompare(a.at));
        setFeed(items.slice(0, 8));
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load your dashboard."
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leadsRepo, campaignsRepo, usageRepo, inboxRepo, settingsRepo]);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const emailsCheck = usage?.checks.find((c) => c.metric === "emailsPerMonth");

  return (
    <div className="space-y-7 pb-10">
      {isDemo && <DemoBanner feature="Dashboard" />}

      {/* Header & Quick Action Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-24 sm:text-30 font-bold tracking-tight text-white">
              {greeting}
              {firstName ? `, ${firstName}` : ""}! 👋
            </h1>
            {isDemo && <span className="demo-badge">Demo Data</span>}
          </div>
          <p className="mt-1 text-14 text-black-300">
            Live numbers from your workspace — leads, campaigns, inbox and
            this month&apos;s plan usage.
          </p>
        </div>

        <Link
          href="/dashboard/campaigns/new"
          className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-2.5 text-14 font-semibold text-white shadow-glow-purple transition-all self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>New Campaign</span>
        </Link>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-950/20 px-5 py-3 text-13 text-rose-200 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {/* Primary Stats Grid — every value comes from a repository */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5">
        <StatsCard
          label="Total Leads"
          value={isLoading ? "…" : (leadCount ?? 0)}
          icon={Users}
          sublabel={
            leadCount === null
              ? "in your CRM"
              : `${contactedCount} contacted · ${leadCount - contactedCount} new`
          }
          isDemo={isDemo}
        />
        <StatsCard
          label="Active Campaigns"
          value={isLoading ? "…" : activeCampaigns}
          icon={Target}
          sublabel={
            campaignTotal === null
              ? "campaigns in workspace"
              : `of ${campaignTotal} total campaigns`
          }
          isDemo={isDemo}
        />
        <StatsCard
          label="Unread Conversations"
          value={isLoading ? "…" : (unreadCount ?? 0)}
          icon={MessageSquare}
          sublabel="in your unified inbox"
          isDemo={isDemo}
        />
        <StatsCard
          label="Emails This Month"
          value={isLoading ? "…" : (emailsCheck?.used ?? 0)}
          icon={Mail}
          sublabel={
            emailsCheck
              ? `of ${emailsCheck.limit.toLocaleString()} ${PLAN_CATALOG[usage!.plan].name} quota`
              : "no usage recorded yet"
          }
          isDemo={isDemo}
        />
      </div>

      {/* Middle Row: Plan Usage + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Plan usage (computed from usage_records / repositories) */}
        <div className="lg:col-span-2 glass-card p-6 flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-black-700/60">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-16 font-semibold text-white">
                  Plan Usage — This Month
                </h3>
                {isDemo && (
                  <span className="demo-badge text-10 py-0.5 px-2">Demo Data</span>
                )}
              </div>
              <p className="text-12 text-black-400 mt-0.5">
                {usage
                  ? `${PLAN_CATALOG[usage.plan].name} plan · period from ${usage.period_start} · source: ${
                      usage.source === "usage_records"
                        ? "usage records (rollup job)"
                        : "computed live from your data"
                    }`
                  : "Loading usage…"}
              </p>
            </div>
            <Link
              href="/dashboard/usage"
              className="text-13 font-medium text-purple-400 hover:text-purple-300 flex items-center gap-1 shrink-0"
            >
              <span>Full usage & history</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="pt-5 space-y-5">
            {usage?.checks.map((check) => (
              <div key={check.metric} className="space-y-2">
                <div className="flex items-center justify-between text-13">
                  <span className="text-black-300 font-medium capitalize">
                    {check.metric === "emailsPerMonth"
                      ? "Emails / month"
                      : check.metric}
                  </span>
                  <span className="font-semibold text-white">
                    {check.used.toLocaleString()} / {check.limit.toLocaleString()} (
                    {check.percentUsed}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-black-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      check.allowed
                        ? "bg-gradient-to-r from-purple-600 to-orange-500"
                        : "bg-rose-500"
                    }`}
                    style={{ width: `${check.percentUsed}%` }}
                  />
                </div>
                {!check.allowed && (
                  <p className="text-11 text-rose-300">
                    Over the {PLAN_CATALOG[usage.plan].name} plan limit for this
                    metric.
                  </p>
                )}
              </div>
            ))}
            {!isLoading && usage && usage.checks.length === 0 && (
              <p className="text-13 text-black-400">
                No usage recorded yet this month. Usage appears here as soon
                as leads, campaigns or emails exist in your workspace.
              </p>
            )}
            {isLoading && (
              <p className="text-13 text-black-400">Loading usage…</p>
            )}
          </div>
        </div>

        {/* Quick Actions Card */}
        <div className="glass-card p-6 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-16 font-semibold text-white">Quick Actions</h3>
              <Sparkles className="h-4 w-4 text-orange-400" />
            </div>
            <p className="text-12 text-black-400 mt-1">
              Shortcuts to frequent outreach workflows
            </p>
          </div>

          <div className="space-y-2.5">
            <Link
              href="/dashboard/campaigns/new"
              className="flex items-center justify-between rounded-xl bg-black-800/80 hover:bg-black-800 border border-black-700/80 p-3 text-13 font-medium text-white transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600/20 text-purple-400 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <Target className="h-4 w-4" />
                </div>
                <span>New Campaign</span>
              </div>
              <ArrowRight className="h-4 w-4 text-black-400 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
            </Link>

            <Link
              href="/dashboard/leads"
              className="flex items-center justify-between rounded-xl bg-black-800/80 hover:bg-black-800 border border-black-700/80 p-3 text-13 font-medium text-white transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-600/20 text-orange-400 group-hover:bg-orange-600 group-hover:text-white transition-colors">
                  <Upload className="h-4 w-4" />
                </div>
                <span>Import Leads (CRM)</span>
              </div>
              <ArrowRight className="h-4 w-4 text-black-400 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
            </Link>

            <Link
              href="/dashboard/inbox"
              className="flex items-center justify-between rounded-xl bg-black-800/80 hover:bg-black-800 border border-black-700/80 p-3 text-13 font-medium text-white transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600/20 text-purple-400 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <Inbox className="h-4 w-4" />
                </div>
                <span>View Inbox</span>
              </div>
              <ArrowRight className="h-4 w-4 text-black-400 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
            </Link>

            <Link
              href="/dashboard/ai-personalization"
              className="flex items-center justify-between rounded-xl bg-black-800/80 hover:bg-black-800 border border-black-700/80 p-3 text-13 font-medium text-white transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black-700 text-black-300 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <Sparkles className="h-4 w-4" />
                </div>
                <span>AI Personalization</span>
              </div>
              <ArrowRight className="h-4 w-4 text-black-400 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
            </Link>

            <Link
              href="/dashboard/usage"
              className="flex items-center justify-between rounded-xl bg-black-800/80 hover:bg-black-800 border border-black-700/80 p-3 text-13 font-medium text-white transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black-700 text-black-300 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <BarChart3 className="h-4 w-4" />
                </div>
                <span>Usage & History</span>
              </div>
              <ArrowRight className="h-4 w-4 text-black-400 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
            </Link>
          </div>

          <div className="rounded-xl border border-purple-500/20 bg-purple-600/5 p-3 text-12 text-purple-200">
            💡 <strong>Pro Tip:</strong> Sequences combining LinkedIn connection
            touches + Day 2 email have 2.8x higher reply rates.
          </div>
        </div>
      </div>

      {/* Recent Activity — campaign activity + inbox messages, real sources */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between pb-4 border-b border-black-700/60">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-16 font-semibold text-white">Recent Activity</h3>
              {isDemo && (
                <span className="demo-badge text-10 py-0.5 px-2">Demo Data</span>
              )}
            </div>
            <p className="text-12 text-black-400 mt-0.5">
              Campaign events and inbox messages from your workspace —
              simulated activity is always labelled.
            </p>
          </div>
          <Link
            href="/dashboard/usage"
            className="text-13 font-medium text-purple-400 hover:text-purple-300 flex items-center gap-1"
          >
            <span>Full history</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="divide-y divide-black-700/50 mt-2">
          {isLoading && (
            <p className="py-6 text-13 text-black-400">Loading activity…</p>
          )}
          {!isLoading && feed.length === 0 && (
            <div className="py-8 text-center">
              <History className="h-8 w-8 mx-auto text-black-600 mb-2" />
              <p className="text-13 text-black-400">
                No activity yet. Create a campaign or import leads and the
                history will appear here.
              </p>
            </div>
          )}
          {feed.map((item) => (
            <div
              key={item.id}
              className="py-3.5 flex items-center justify-between gap-4 table-row-hover px-2 rounded-lg"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black-800 border border-black-700 text-purple-400">
                  {item.kind === "campaign" ? (
                    <Target className="h-4 w-4 text-orange-400" />
                  ) : (
                    <Mail className="h-4 w-4 text-purple-400" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-13 font-semibold text-white truncate">
                      {item.title}
                    </p>
                    {item.chip &&
                      (item.chip.tone === "demo" ? (
                        <span className="demo-badge text-10 py-0 px-1.5">
                          {item.chip.text}
                        </span>
                      ) : item.chip.tone === "ok" ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600/15 px-1.5 py-0.5 text-10 font-semibold text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" />
                          {item.chip.text}
                        </span>
                      ) : item.chip.tone === "bad" ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-rose-600/15 px-1.5 py-0.5 text-10 font-semibold text-rose-300">
                          <XCircle className="h-3 w-3" />
                          {item.chip.text}
                        </span>
                      ) : null)}
                  </div>
                  <p className="text-12 text-black-300 truncate">
                    {item.description}
                  </p>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <span className="text-11 text-black-400 font-medium whitespace-nowrap">
                  {relativeTime(item.at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
