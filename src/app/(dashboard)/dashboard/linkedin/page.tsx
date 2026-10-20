"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Linkedin,
  UserPlus,
  Send,
  SkipForward,
  ListChecks,
  Plus,
  ArrowUpRight,
  RefreshCcw,
  ShieldAlert,
} from "lucide-react";
import { DemoBanner } from "@/components/ui";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { Avatar } from "@/components/ui/Avatar";
import {
  getAccountsRepository,
  getCampaignsRepository,
  getInboxRepository,
  getLeadsRepository,
  loadCampaignExecutions,
  loadCampaignStats,
  resolveWorkspaceId,
  type CampaignStats,
} from "@/lib/data";
import type { Campaign, CampaignStep, ConnectedAccount, Lead } from "@/types";
import {
  accountHealthActionHref,
  accountHealthView,
  buildLinkedInActivity,
  filterLinkedInCampaigns,
  linkedInStepsOf,
  summarizeLinkedInExecutions,
  type LinkedInActivityRow,
} from "@/lib/linkedin";

/**
 * LinkedIn Outreach — rewired to the data layer (P5 Stage F).
 *
 * Everything on this page is a real record or a count of real
 * records (this page previously rendered the old mock module's
 * campaign constants and hard-coded KPI numbers — that is gone):
 *   - campaigns whose SEQUENCES contain LinkedIn steps, from the
 *     campaigns repository, with real enrollment counts and the
 *     executor's recorded per-campaign outcomes;
 *   - the activity list from real `campaign_step_executions`
 *     records (demo mode: the demo executor store the demo runner
 *     writes) — action type, campaign, lead, outcome, the recorded
 *     reason, and time;
 *   - connected LinkedIn accounts from the accounts repository,
 *     each with its recorded authorization health (migration 013);
 *   - the provider state from the Integration Center status API,
 *     which derives from the ONE LinkedIn seam (src/lib/linkedin).
 *
 * Honesty rules: "sent" is 0 today and stays 0 until an approved
 * provider actually sends — every LinkedIn execution is recorded
 * `skipped` with its reason, and the page shows exactly that.
 * Account health ("the record is fine") and provider state
 * ("Configuration Required") are shown as the two separate facts
 * they are; neither is dressed up as "LinkedIn works".
 */

interface LinkedInCampaignRow {
  campaign: Campaign;
  enrolled: number;
  linkedInStepCount: number;
  recorded: number;
  sent: number;
  skipped: number;
}

interface ProviderStateInfo {
  status: string;
  statusMessage: string;
}

const CAMPAIGN_STATUS_CHIP: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400",
  draft: "bg-black-700 text-black-300",
  paused: "bg-amber-500/15 text-amber-400",
  archived: "bg-black-800 text-black-500",
};

const EXECUTION_STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  sent: { label: "Sent", cls: "bg-emerald-500/15 text-emerald-400" },
  skipped: { label: "Skipped — not sent", cls: "bg-amber-500/15 text-amber-400" },
  failed: { label: "Failed", cls: "bg-rose-500/15 text-rose-400" },
  stopped: { label: "Stopped", cls: "bg-black-700 text-black-300" },
  executed: { label: "Executed", cls: "bg-blue-500/15 text-blue-400" },
  simulated: { label: "Simulated", cls: "bg-amber-500/15 text-amber-400" },
};

const HEALTH_TONE_CLS: Record<string, string> = {
  ok: "bg-emerald-500/15 text-emerald-400",
  warning: "bg-amber-500/15 text-amber-400",
  error: "bg-rose-500/15 text-rose-400",
  muted: "bg-black-700 text-black-300",
};

function AccountHealthBlock({ account }: { account: ConnectedAccount }) {
  const health = accountHealthView(account);
  return (
    <div className="mt-3 rounded-xl border border-black-700/80 bg-black-800/40 px-4 py-3 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-12 font-medium text-black-300">
          Authorization health
        </span>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-11 font-semibold ${HEALTH_TONE_CLS[health.tone]}`}
          data-testid={`account-health-${account.id}`}
        >
          {health.label}
        </span>
        {health.action !== "none" && (
          <Link
            href={accountHealthActionHref(account.channel, account.provider)}
            className="inline-flex items-center gap-1 text-12 font-medium text-purple-300 hover:text-purple-200"
            data-testid={`account-health-action-${account.id}`}
          >
            <RefreshCcw className="h-3 w-3" />
            {health.actionLabel}
          </Link>
        )}
      </div>
      <p className="text-12 text-black-400">{health.description}</p>
      {account.last_error && account.auth_status !== "error" && (
        <p className="text-12 text-rose-300/80">
          Last provider error: {account.last_error}
        </p>
      )}
      <p className="text-12 text-black-500">
        {account.last_sync_at
          ? `Last synced ${new Date(account.last_sync_at).toLocaleString()}`
          : "Never synced with a provider"}
        {account.provider_account_id
          ? ` · Provider account ${account.provider_account_id}`
          : ""}
      </p>
    </div>
  );
}

export default function LinkedInOutreachPage() {
  const [campaignRows, setCampaignRows] = useState<LinkedInCampaignRow[]>([]);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [activity, setActivity] = useState<LinkedInActivityRow[]>([]);
  const [summary, setSummary] = useState(() => summarizeLinkedInExecutions([]));
  const [provider, setProvider] = useState<ProviderStateInfo | null>(null);
  const [mode, setMode] = useState<"demo" | "supabase">("demo");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const workspaceId = await resolveWorkspaceId();
      if (!workspaceId) {
        setError("No workspace could be resolved for this session.");
        return;
      }
      const campaignsRepo = getCampaignsRepository();
      const inboxRepo = getInboxRepository();
      const leadsRepo = getLeadsRepository();
      const accountsRepo = getAccountsRepository();
      setMode(campaignsRepo.mode);
      const deps = {
        campaignsRepo,
        inboxRepo,
        leadsRepo,
        mode: campaignsRepo.mode,
      };

      const [allCampaigns, workspaceAccounts, leads] = await Promise.all([
        campaignsRepo.listCampaigns(workspaceId),
        accountsRepo.listAccounts(workspaceId),
        leadsRepo.listLeads(workspaceId),
      ]);
      const stepsEntries = await Promise.all(
        allCampaigns.map(
          async (c) =>
            [c.id, await campaignsRepo.getCampaignSteps(c.id)] as [
              string,
              CampaignStep[],
            ]
        )
      );
      const stepsByCampaignId = new Map(stepsEntries);
      const liCampaigns = filterLinkedInCampaigns(
        allCampaigns,
        stepsByCampaignId
      );

      const [stats, executions] = await Promise.all([
        loadCampaignStats(deps, workspaceId, liCampaigns),
        loadCampaignExecutions(deps, workspaceId, liCampaigns),
      ]);

      const rows = liCampaigns.map((campaign) => {
        const perCampaign = summarizeLinkedInExecutions(
          executions.filter((x) => x.campaign_id === campaign.id)
        );
        const campaignStats: CampaignStats | undefined = stats.byCampaign.get(
          campaign.id
        );
        return {
          campaign,
          enrolled: campaignStats?.prospects ?? 0,
          linkedInStepCount: linkedInStepsOf(
            stepsByCampaignId.get(campaign.id) ?? []
          ).length,
          recorded: perCampaign.total,
          sent: perCampaign.sent,
          skipped: perCampaign.skipped,
        };
      });
      setCampaignRows(rows);
      setSummary(summarizeLinkedInExecutions(executions));
      setAccounts(
        workspaceAccounts.filter((a) => a.channel === "linkedin")
      );
      const campaignsById = new Map(allCampaigns.map((c) => [c.id, c]));
      const leadsById = new Map<string, Lead>(leads.map((l) => [l.id, l]));
      setActivity(buildLinkedInActivity(executions, campaignsById, leadsById, 25));
    } catch {
      setError("Failed to load LinkedIn data from the data layer.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        const entry = (json.integrations ?? []).find(
          (i: { id?: string; descriptor?: { id?: string } }) =>
            (i.descriptor?.id ?? i.id) === "linkedin"
        );
        if (entry) {
          setProvider({
            status: entry.status,
            statusMessage: entry.statusMessage,
          });
        }
      })
      .catch(() => {
        /* the provider card degrades to the static explanation below */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isDemo = mode === "demo";
  const totals = useMemo(
    () => ({
      recorded: summary.total,
      sent: summary.sent,
      skipped: summary.skipped,
    }),
    [summary]
  );

  return (
    <div className="space-y-6 pb-14">
      <DemoBanner feature="LinkedIn Automation" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white flex items-center gap-2.5">
              <Linkedin className="h-6 w-6 text-blue-400" />
              <span>LinkedIn Outreach</span>
            </h1>
            {isDemo && <span className="demo-badge">Demo Mode</span>}
          </div>
          <p className="mt-1 text-14 text-black-300">
            Real campaigns, real execution records — every number below
            comes from the data layer{isDemo ? " (Demo Mode data)" : ""}.
          </p>
        </div>
        <Link
          href="/dashboard/campaigns/new"
          className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-2.5 text-14 font-semibold text-white shadow-glow-purple transition-all self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>New LinkedIn Sequence</span>
        </Link>
      </div>

      {isDemo && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-600/10 px-5 py-4">
          <p className="text-13 text-amber-200">
            <span className="font-semibold">Demo Mode.</span> Campaigns,
            accounts and execution records shown here are demo data.
            LinkedIn steps are recorded <strong>skipped</strong> — nothing
            is sent, and nothing is simulated as sent. Connect an approved
            LinkedIn provider (Integration Center) for real sending.
          </p>
        </div>
      )}

      {/* Provider state — the seam's honest state */}
      <div
        className="glass-card p-5 flex flex-col md:flex-row md:items-center gap-4"
        data-testid="linkedin-provider-card"
      >
        <div className="w-11 h-11 rounded-xl bg-blue-600/20 flex items-center justify-center shrink-0">
          <ShieldAlert className="w-5 h-5 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-15 font-semibold text-white">
            LinkedIn provider:{" "}
            {provider ? provider.status : isDemo ? "Demo Mode" : "Configuration Required"}
          </h2>
          <p className="text-13 text-black-400 mt-0.5">
            {provider
              ? provider.statusMessage
              : "LinkedIn sending requires an authorized provider (a LinkedIn partner API). No provider is integrated, so LinkedIn steps are recorded skipped and LinkedIn replies are refused."}{" "}
            To make LinkedIn sending real, procure an account with a
            LinkedIn-approved outreach provider and its API credentials —
            NxtSend never scrapes, automates browsers, or collects
            LinkedIn passwords or cookies.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Link
            href="/dashboard/integrations/linkedin"
            className="btn-secondary !py-2 !px-3 text-13"
          >
            <Linkedin className="w-4 h-4" /> LinkedIn integration
          </Link>
          <Link
            href="/dashboard/accounts"
            className="btn-secondary !py-2 !px-3 text-13"
          >
            Connected accounts <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {error && (
        <div className="glass-card p-6 text-center">
          <p className="text-14 text-rose-400">{error}</p>
          <button onClick={load} className="btn-secondary mt-4 !py-2 !px-4 text-13">
            Retry
          </button>
        </div>
      )}

      {!error && (
        <>
          {/* KPIs — computed from execution records only */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard
              label="Actions recorded"
              value={totals.recorded}
              icon={ListChecks}
              sublabel="executor outcomes for LinkedIn steps"
              isDemo={isDemo}
            />
            <StatsCard
              label="Sent"
              value={totals.sent}
              icon={Send}
              sublabel="via an approved LinkedIn provider"
              isDemo={isDemo}
            />
            <StatsCard
              label="Skipped — no provider"
              value={totals.skipped}
              icon={SkipForward}
              sublabel="recorded, never sent"
              isDemo={isDemo}
            />
            <StatsCard
              label="Campaigns with LinkedIn steps"
              value={campaignRows.length}
              icon={UserPlus}
              sublabel={`${accounts.length} LinkedIn account${accounts.length === 1 ? "" : "s"} on record`}
              isDemo={isDemo}
            />
          </div>

          {/* Connected LinkedIn accounts + recorded health */}
          <div className="glass-card p-6" data-testid="linkedin-accounts">
            <div className="flex items-center justify-between pb-3 border-b border-black-700">
              <h2 className="text-16 font-semibold text-white">
                Connected LinkedIn accounts
              </h2>
              <Link
                href="/dashboard/accounts"
                className="text-12 text-purple-400 hover:underline"
              >
                Manage accounts &rarr;
              </Link>
            </div>
            {loading ? (
              <p className="text-13 text-black-400 py-6 text-center">
                Loading accounts…
              </p>
            ) : accounts.length === 0 ? (
              <div className="py-8 text-center">
                <Linkedin className="w-10 h-10 text-black-600 mx-auto mb-3" />
                <p className="text-14 text-black-300 font-medium">
                  No LinkedIn accounts on record
                </p>
                <p className="text-13 text-black-500 mt-1">
                  Accounts appear here when an approved LinkedIn provider
                  integration creates them. There is no password or
                  cookie connect flow — by design.
                </p>
              </div>
            ) : (
              <div className="space-y-4 pt-4">
                {accounts.map((account) => (
                  <div
                    key={account.id}
                    className="rounded-xl bg-black-800/60 border border-black-700/60 px-4 py-3.5"
                  >
                    <div className="flex items-center gap-3.5">
                      <Avatar
                        src={account.avatar_url}
                        name={account.display_name}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-white text-14">
                            {account.display_name}
                          </span>
                          {account.status === "demo" ? (
                            <span className="demo-badge">Demo account</span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-black-700 px-2 py-0.5 text-11 font-medium text-black-300 capitalize">
                              {account.status}
                            </span>
                          )}
                        </div>
                        <p className="text-12 text-black-400 mt-0.5 truncate">
                          {account.handle_or_email || "—"} · via {account.provider}
                        </p>
                      </div>
                    </div>
                    <AccountHealthBlock account={account} />
                    <p className="mt-2 text-12 text-black-500">
                      Account health is this record&apos;s last known
                      state. Sending still requires an approved LinkedIn
                      provider — see the provider status above.
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Campaigns with LinkedIn steps */}
          <div className="glass-card p-6" data-testid="linkedin-campaigns">
            <div className="flex items-center justify-between pb-3 border-b border-black-700">
              <h2 className="text-16 font-semibold text-white">
                Campaigns with LinkedIn steps
              </h2>
              <Link
                href="/dashboard/campaigns"
                className="text-12 text-purple-400 hover:underline"
              >
                View all campaigns &rarr;
              </Link>
            </div>
            {loading ? (
              <p className="text-13 text-black-400 py-6 text-center">
                Loading campaigns…
              </p>
            ) : campaignRows.length === 0 ? (
              <div className="py-8 text-center">
                <UserPlus className="w-10 h-10 text-black-600 mx-auto mb-3" />
                <p className="text-14 text-black-300 font-medium">
                  No campaigns with LinkedIn steps yet
                </p>
                <p className="text-13 text-black-500 mt-1 mb-4">
                  Create a LinkedIn or Mixed campaign whose sequence
                  includes LinkedIn steps — its recorded outcomes will
                  appear here.
                </p>
                <Link
                  href="/dashboard/campaigns/new"
                  className="btn-primary !py-2 !px-4 text-13"
                >
                  <Plus className="w-4 h-4" /> Create campaign
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-black-800">
                {campaignRows.map(
                  ({ campaign, enrolled, linkedInStepCount, recorded, sent, skipped }) => (
                    <Link
                      key={campaign.id}
                      href={`/dashboard/campaigns/${campaign.id}`}
                      className="flex items-center gap-3 py-3.5 group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-blue-600/15 flex items-center justify-center shrink-0">
                        <Linkedin className="w-4 h-4 text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-14 font-medium text-white truncate group-hover:text-blue-300 transition-colors">
                          {campaign.name}
                        </p>
                        <p className="text-12 text-black-500">
                          {campaign.type} · {enrolled} enrolled ·{" "}
                          {linkedInStepCount} LinkedIn step
                          {linkedInStepCount === 1 ? "" : "s"} · {recorded}{" "}
                          action{recorded === 1 ? "" : "s"} recorded · {sent}{" "}
                          sent · {skipped} skipped
                        </p>
                      </div>
                      <span
                        className={`text-11 font-semibold px-2 py-0.5 rounded-full capitalize ${CAMPAIGN_STATUS_CHIP[campaign.status] ?? CAMPAIGN_STATUS_CHIP.draft}`}
                      >
                        {campaign.status}
                      </span>
                    </Link>
                  )
                )}
              </div>
            )}
          </div>

          {/* Activity — real step executions */}
          <div className="glass-card p-6" data-testid="linkedin-activity">
            <h2 className="text-16 font-semibold text-white pb-3 border-b border-black-700">
              LinkedIn activity
            </h2>
            {loading ? (
              <p className="text-13 text-black-400 py-6 text-center">
                Loading activity…
              </p>
            ) : activity.length === 0 ? (
              <div className="py-8 text-center">
                <ListChecks className="w-10 h-10 text-black-600 mx-auto mb-3" />
                <p className="text-14 text-black-300 font-medium">
                  No LinkedIn actions recorded yet
                </p>
                <p className="text-13 text-black-500 mt-1">
                  Actions are recorded when the sequence executor reaches
                  a LinkedIn step (in Demo Mode, use a campaign&apos;s
                  &ldquo;Run due steps&rdquo;). Until an approved provider
                  is connected, every recorded outcome is{" "}
                  <strong>skipped</strong> with its reason.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-black-800">
                {activity.map((row) => {
                  const chip = EXECUTION_STATUS_CHIP[row.status] ?? {
                    label: row.status,
                    cls: "bg-black-700 text-black-300",
                  };
                  return (
                    <div key={row.id} className="py-3.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-13 font-medium text-white">
                          {row.stepTypeLabel}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-11 font-semibold ${chip.cls}`}
                        >
                          {chip.label}
                        </span>
                        <span className="text-12 text-black-500 ml-auto">
                          {new Date(row.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-12 text-black-400 mt-1">
                        {row.campaignName} · for {row.leadName}
                      </p>
                      {row.detail && (
                        <p className="text-12 text-black-500 mt-0.5">
                          {row.detail}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-12 text-black-500 mt-4">
              Duplicate prevention: the sequence executor claims each
              step once per enrollment (an at-most-once claim keyed by
              enrollment + step) before recording its outcome, so
              re-running the worker can never send — or record — the
              same LinkedIn step twice.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
