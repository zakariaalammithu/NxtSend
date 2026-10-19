"use client";

import * as React from "react";
import Link from "next/link";
import {
  History,
  AlertTriangle,
  Mail,
  Linkedin,
  Target,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react";
import { DemoBanner } from "@/components/ui";
import {
  getCampaignsRepository,
  getInboxRepository,
  getUsageRepository,
  listMessageHistory,
  resolveWorkspaceId,
  type ActivityEntry,
  type HistoryMessage,
  type WorkspaceUsage,
} from "@/lib/data";
import { PLAN_CATALOG } from "@/lib/billing/plans";

type HistoryTab = "all" | "campaigns" | "messages";

interface FeedRow {
  id: string;
  kind: "campaign" | "message";
  title: string;
  description: string;
  at: string;
  channel?: string;
  direction?: string;
  status?: string;
  verification?: HistoryMessage["verification"];
  simulated?: boolean;
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

const METRIC_LABELS: Record<string, string> = {
  leads: "Leads",
  campaigns: "Campaigns (active)",
  emailsPerMonth: "Emails / month",
  accounts: "Connected accounts",
};

export default function UsageHistoryPage() {
  const campaignsRepo = React.useMemo(() => getCampaignsRepository(), []);
  const usageRepo = React.useMemo(() => getUsageRepository(), []);
  const inboxRepo = React.useMemo(() => getInboxRepository(), []);
  const isDemo = usageRepo.mode === "demo";

  const [usage, setUsage] = React.useState<WorkspaceUsage | null>(null);
  const [rows, setRows] = React.useState<FeedRow[]>([]);
  const [tab, setTab] = React.useState<HistoryTab>("all");
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
        const [usageData, campaigns, activity, history] = await Promise.all([
          usageRepo.getWorkspaceUsage(ws),
          campaignsRepo.listCampaigns(ws),
          campaignsRepo.listActivity(ws),
          listMessageHistory(inboxRepo, ws, 200),
        ]);
        if (cancelled) return;
        setUsage(usageData);

        const campaignById = new Map(campaigns.map((c) => [c.id, c.name]));
        const feed: FeedRow[] = [];

        for (const entry of activity as ActivityEntry[]) {
          feed.push({
            id: `act_${entry.id}`,
            kind: "campaign",
            title: ACTION_LABELS[entry.action] ?? entry.action.replace(/_/g, " "),
            description:
              entry.details ||
              (entry.campaign_id
                ? (campaignById.get(entry.campaign_id) ?? "Campaign")
                : "Workspace activity"),
            at: entry.created_at,
            simulated: entry.simulated,
          });
        }

        for (const msg of history as HistoryMessage[]) {
          feed.push({
            id: `msg_${msg.id}`,
            kind: "message",
            title:
              msg.direction === "inbound"
                ? `Reply from ${msg.contact_name}`
                : `Message to ${msg.contact_name}`,
            description:
              (msg.conversation_subject ? `${msg.conversation_subject} — ` : "") +
              msg.content.slice(0, 140) +
              (msg.error ? ` · Error: ${msg.error}` : ""),
            at: msg.sent_at,
            channel: msg.channel,
            direction: msg.direction,
            status: msg.status,
            verification: msg.verification,
          });
        }

        feed.sort((a, b) => b.at.localeCompare(a.at));
        setRows(feed);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load usage and history."
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignsRepo, usageRepo, inboxRepo]);

  const visibleRows = rows.filter((r) =>
    tab === "all" ? true : tab === "campaigns" ? r.kind === "campaign" : r.kind === "message"
  );

  return (
    <div className="space-y-7 pb-14 max-w-5xl">
      {isDemo && <DemoBanner feature="Usage & History" />}

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">
            Usage & History
          </h1>
          {isDemo && <span className="demo-badge">Demo Data</span>}
        </div>
        <p className="mt-1 text-14 text-black-300">
          What your workspace has used against its plan quotas, and the
          recorded activity behind it. Simulated activity is always
          labelled — only provider-confirmed results are shown as sent.
        </p>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-950/20 px-5 py-3 text-13 text-rose-200 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {/* Usage vs plan limits */}
      <div className="glass-card p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="text-18 font-bold text-white">Plan Usage</h2>
            <p className="text-13 text-black-300 mt-0.5">
              {usage ? (
                <>
                  {PLAN_CATALOG[usage.plan].name} plan · period starting{" "}
                  {usage.period_start} ·{" "}
                  {usage.source === "usage_records"
                    ? "recorded by the usage rollup job"
                    : "computed live from your workspace data (no rollup record yet)"}
                  {isDemo ? " · Demo Mode data" : ""}
                </>
              ) : (
                "Loading usage…"
              )}
            </p>
          </div>
          <Link
            href="/dashboard/billing#credits"
            className="text-13 font-medium text-purple-400 hover:text-purple-300 shrink-0"
          >
            Billing & plan quotas →
          </Link>
        </div>

        <div className="space-y-5">
          {usage?.checks.map((check) => (
            <div key={check.metric} className="space-y-2">
              <div className="flex items-center justify-between text-13">
                <span className="text-black-300 font-medium">
                  {METRIC_LABELS[check.metric] ?? check.metric}
                </span>
                <span className="font-semibold text-white">
                  {check.used.toLocaleString()} / {check.limit.toLocaleString()} (
                  {check.percentUsed}%) · {check.remaining.toLocaleString()} remaining
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-black-700 overflow-hidden">
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
                <p className="text-12 text-rose-300 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Over the {PLAN_CATALOG[usage.plan].name} plan limit for this
                  metric.
                </p>
              )}
            </div>
          ))}
          {!isLoading && usage && usage.checks.length === 0 && (
            <p className="text-13 text-black-400">
              No usage has been recorded for this workspace yet.
            </p>
          )}
          {isLoading && <p className="text-13 text-black-400">Loading usage…</p>}
        </div>

        <p className="text-12 text-black-500 border-t border-black-700/70 pt-4">
          NxtSend plans use monthly quotas, not a credit balance — the
          numbers above are measured counts of your leads, campaigns and
          sent email against the {usage ? PLAN_CATALOG[usage.plan].name : ""}{" "}
          plan&apos;s limits.
        </p>
      </div>

      {/* Activity history */}
      <div className="glass-card p-6 sm:p-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-18 font-bold text-white flex items-center gap-2">
              <History className="h-5 w-5 text-purple-400" />
              Activity History
            </h2>
            <p className="text-13 text-black-300 mt-0.5">
              Campaign lifecycle events and message history.{" "}
              <span className="text-amber-300">Simulated</span> entries were
              never sent anywhere;{" "}
              <span className="text-emerald-300">Provider-confirmed</span>{" "}
              entries carry a provider result.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-xl bg-black-800 p-1 border border-black-700 self-start">
            {(
              [
                { key: "all", label: "All" },
                { key: "campaigns", label: "Campaigns" },
                { key: "messages", label: "Messages" },
              ] as { key: HistoryTab; label: string }[]
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-lg px-3 py-1.5 text-12 font-medium transition-colors ${
                  tab === t.key
                    ? "bg-purple-600 text-white shadow-glow-purple"
                    : "text-black-400 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-black-700/50">
          {isLoading && (
            <p className="py-6 text-13 text-black-400">Loading history…</p>
          )}
          {!isLoading && visibleRows.length === 0 && (
            <p className="py-8 text-center text-13 text-black-400">
              Nothing recorded here yet. Campaign actions and inbox messages
              will appear as they happen.
            </p>
          )}
          {visibleRows.map((row) => (
            <div key={row.id} className="py-3.5 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black-800 border border-black-700">
                  {row.kind === "campaign" ? (
                    <Target className="h-4 w-4 text-orange-400" />
                  ) : row.channel === "linkedin" ? (
                    <Linkedin className="h-4 w-4 text-blue-400" />
                  ) : (
                    <Mail className="h-4 w-4 text-purple-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-13 font-semibold text-white">{row.title}</p>
                    {row.kind === "message" &&
                      (row.direction === "outbound" ? (
                        <span className="inline-flex items-center gap-1 text-10 font-semibold text-black-300 uppercase tracking-wide">
                          <ArrowUpRight className="h-3 w-3" /> Sent
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-10 font-semibold text-black-300 uppercase tracking-wide">
                          <ArrowDownLeft className="h-3 w-3" /> Received
                        </span>
                      ))}
                    {row.kind === "message" && row.status && (
                      <span className="rounded-md bg-black-700/80 px-1.5 py-0.5 text-10 text-black-300">
                        {row.status}
                      </span>
                    )}
                    {row.kind === "campaign" && row.simulated && (
                      <span className="demo-badge text-10 py-0 px-1.5">Simulated</span>
                    )}
                    {row.kind === "message" && row.verification === "simulated" && (
                      <span className="demo-badge text-10 py-0 px-1.5">
                        Simulated — not sent
                      </span>
                    )}
                    {row.kind === "message" && row.verification === "provider" && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600/15 px-1.5 py-0.5 text-10 font-semibold text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" />
                        Provider-confirmed
                      </span>
                    )}
                    {row.kind === "message" && row.verification === "failed" && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-rose-600/15 px-1.5 py-0.5 text-10 font-semibold text-rose-300">
                        <XCircle className="h-3 w-3" />
                        Failed / blocked
                      </span>
                    )}
                  </div>
                  <p className="text-12 text-black-300 mt-0.5 break-words">
                    {row.description}
                  </p>
                </div>
              </div>
              <span className="text-11 text-black-400 whitespace-nowrap shrink-0">
                {new Date(row.at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
