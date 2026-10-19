"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Mail,
  Plus,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  ListOrdered,
  ArrowUpRight,
} from "lucide-react";
import { StatsCard } from "@/components/dashboard/StatsCard";
import {
  getCampaignsRepository,
  getInboxRepository,
  resolveWorkspaceId,
} from "@/lib/data";
import type { Campaign } from "@/types";
import {
  listMessageHistory,
  type HistoryMessage,
} from "@/lib/data/message-history";

/**
 * Email Campaigns — rewired to the data layer (Round-2 Stage F).
 *
 * Everything on this page is a real count or a real record:
 *   - campaigns of type email/mixed from the campaigns repository,
 *     with real enrollment counts;
 *   - send KPIs + the recent-sends list from the message-history
 *     repository (the same store the Inbox and Usage & History read),
 *     each send carrying its verification classification — provider-
 *     confirmed, simulated, failed, or suppressed. No open/bounce
 *     rates are shown: the app only learns those from provider
 *     webhooks, and inventing them here would be fiction;
 *   - sending state from the Integration Center status API (Resend).
 *
 * Scheduling/execution is the background worker's job
 * (Admin → System → Queue & Workers, job type follow_up_due) — this
 * page links there instead of pretending to schedule anything itself.
 */

interface EmailCampaignRow {
  campaign: Campaign;
  enrolled: number;
  stepCount: number;
}

interface ResendState {
  status: string;
  statusMessage: string;
}

const STATUS_CHIP: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400",
  draft: "bg-black-700 text-black-300",
  paused: "bg-amber-500/15 text-amber-400",
  archived: "bg-black-800 text-black-500",
};

function VerificationChip({ entry }: { entry: HistoryMessage }) {
  if (entry.status === "suppressed") {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-11 font-semibold bg-rose-500/15 text-rose-400">
        Blocked — suppressed
      </span>
    );
  }
  switch (entry.verification) {
    case "provider":
      return (
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-11 font-semibold bg-emerald-500/15 text-emerald-400">
          Provider-confirmed
        </span>
      );
    case "simulated":
      return (
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-11 font-semibold bg-amber-500/15 text-amber-400">
          Simulated — not sent
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-11 font-semibold bg-rose-500/15 text-rose-400">
          Failed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-11 font-semibold bg-black-700 text-black-300">
          Recorded
        </span>
      );
  }
}

export default function EmailPage() {
  const [campaignRows, setCampaignRows] = useState<EmailCampaignRow[]>([]);
  const [history, setHistory] = useState<HistoryMessage[]>([]);
  const [resend, setResend] = useState<ResendState | null>(null);
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
      setMode(campaignsRepo.mode);
      const [campaigns, entries] = await Promise.all([
        campaignsRepo.listCampaigns(workspaceId),
        listMessageHistory(inboxRepo, workspaceId),
      ]);
      const emailCampaigns = campaigns.filter(
        (c) => c.type === "email" || c.type === "mixed"
      );
      const rows = await Promise.all(
        emailCampaigns.map(async (campaign) => {
          const [enrollments, steps] = await Promise.all([
            campaignsRepo.listEnrollments(campaign.id),
            campaignsRepo.getCampaignSteps(campaign.id),
          ]);
          return {
            campaign,
            enrolled: enrollments.length,
            stepCount: steps.length,
          };
        })
      );
      setCampaignRows(rows);
      setHistory(
        entries.filter((e) => e.channel === "email" && e.direction === "outbound")
      );
    } catch {
      setError("Failed to load email campaign data from the data layer.");
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
          (i: { id: string }) => i.id === "resend"
        );
        if (entry) {
          setResend({
            status: entry.status,
            statusMessage: entry.statusMessage,
          });
        }
      })
      .catch(() => {
        /* status panel degrades to the data-mode note below */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const confirmed = history.filter(
      (e) => e.verification === "provider"
    ).length;
    const simulated = history.filter(
      (e) => e.verification === "simulated"
    ).length;
    const failed = history.filter(
      (e) =>
        e.verification === "failed" || e.status === "failed" || e.status === "error"
    ).length;
    const suppressed = history.filter((e) => e.status === "suppressed").length;
    return {
      total: history.length,
      confirmed,
      simulated,
      failed,
      suppressed,
      activeCampaigns: campaignRows.filter((r) => r.campaign.status === "active")
        .length,
      enrolledTotal: campaignRows.reduce((s, r) => s + r.enrolled, 0),
    };
  }, [history, campaignRows]);

  const recent = history.slice(0, 8);
  const isDemo = mode === "demo";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-24 font-bold text-white">Email Campaigns</h1>
          <p className="text-14 text-black-400 mt-1">
            Real campaigns, real sends — every number below comes from the
            data layer{isDemo ? " (Demo Mode data)" : ""}.
          </p>
        </div>
        <Link href="/dashboard/campaigns/new" className="btn-primary shrink-0">
          <Plus className="w-4 h-4" /> New Campaign
        </Link>
      </div>

      {isDemo && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-600/10 px-5 py-4">
          <p className="text-13 text-amber-200">
            <span className="font-semibold">Demo Mode.</span> Campaigns and
            sends shown here are demo data. Sends are labelled Simulated —
            nothing is delivered. Connect Supabase + Resend (Integration
            Center) for real sending.
          </p>
        </div>
      )}

      {/* Sending pipeline — honest state */}
      <div className="glass-card p-5 flex flex-col md:flex-row md:items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-purple-600/20 flex items-center justify-center shrink-0">
          <ListOrdered className="w-5 h-5 text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-15 font-semibold text-white">
            How email steps are sent
          </h2>
          <p className="text-13 text-black-400 mt-0.5">
            Sequence steps are executed by the background worker (job{" "}
            <code className="text-black-200">follow_up_due</code>, driven by
            Vercel Cron) — suppression-checked, plan-limit-enforced, and
            recorded with the provider&apos;s real outcome.{" "}
            {resend
              ? `Email provider (Resend): ${resend.statusMessage}`
              : "Email provider state is available in the Integration Center."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Link href="/admin/system/queue" className="btn-secondary !py-2 !px-3 text-13">
            <Clock className="w-4 h-4" /> Queue &amp; Workers
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href="/dashboard/integrations/resend"
            className="btn-secondary !py-2 !px-3 text-13"
          >
            <Mail className="w-4 h-4" /> Email integration
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard
              label="Email campaigns"
              value={campaignRows.length}
              icon={Mail}
              sublabel={`${stats.activeCampaigns} active`}
              isDemo={isDemo}
            />
            <StatsCard
              label="Leads enrolled"
              value={stats.enrolledTotal}
              icon={Users}
              sublabel="Across the campaigns below"
              isDemo={isDemo}
            />
            <StatsCard
              label="Sends recorded"
              value={stats.total}
              icon={Send}
              sublabel={`${stats.confirmed} provider-confirmed · ${stats.simulated} simulated`}
              isDemo={isDemo}
            />
            <StatsCard
              label="Failed / blocked"
              value={stats.failed + stats.suppressed}
              icon={XCircle}
              sublabel={`${stats.failed} failed · ${stats.suppressed} suppressed`}
              isDemo={isDemo}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
            {/* Campaigns */}
            <div className="glass-card p-6 xl:col-span-3">
              <h2 className="text-16 font-bold text-white mb-4">
                Email &amp; mixed campaigns
              </h2>
              {loading ? (
                <p className="text-13 text-black-400 py-6 text-center">
                  Loading campaigns…
                </p>
              ) : campaignRows.length === 0 ? (
                <div className="py-8 text-center">
                  <Mail className="w-10 h-10 text-black-600 mx-auto mb-3" />
                  <p className="text-14 text-black-300 font-medium">
                    No email campaigns yet
                  </p>
                  <p className="text-13 text-black-500 mt-1 mb-4">
                    Create a campaign of type Email or Mixed and enroll
                    leads — due steps are sent by the worker.
                  </p>
                  <Link href="/dashboard/campaigns/new" className="btn-primary !py-2 !px-4 text-13">
                    <Plus className="w-4 h-4" /> Create campaign
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-black-800">
                  {campaignRows.map(({ campaign, enrolled, stepCount }) => (
                    <Link
                      key={campaign.id}
                      href={`/dashboard/campaigns/${campaign.id}`}
                      className="flex items-center gap-3 py-3.5 group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-purple-600/15 flex items-center justify-center shrink-0">
                        <Mail className="w-4 h-4 text-purple-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-14 font-medium text-white truncate group-hover:text-purple-300 transition-colors">
                          {campaign.name}
                        </p>
                        <p className="text-12 text-black-500">
                          {campaign.type} · {enrolled} enrolled · {stepCount}{" "}
                          step{stepCount === 1 ? "" : "s"}
                        </p>
                      </div>
                      <span
                        className={`text-11 font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_CHIP[campaign.status] ?? STATUS_CHIP.draft}`}
                      >
                        {campaign.status}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Recent sends */}
            <div className="glass-card p-6 xl:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-16 font-bold text-white">Recent sends</h2>
                <Link
                  href="/dashboard/usage"
                  className="text-12 text-purple-400 hover:text-purple-300 inline-flex items-center gap-1"
                >
                  Full history <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              {loading ? (
                <p className="text-13 text-black-400 py-6 text-center">
                  Loading sends…
                </p>
              ) : recent.length === 0 ? (
                <div className="py-8 text-center">
                  <CheckCircle2 className="w-10 h-10 text-black-600 mx-auto mb-3" />
                  <p className="text-14 text-black-300 font-medium">
                    No email sends recorded yet
                  </p>
                  <p className="text-13 text-black-500 mt-1">
                    Sends appear here when the sequence executor delivers a
                    due step, or when a reply is sent from the Inbox.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recent.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-xl bg-black-800/60 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-13 font-medium text-white truncate">
                          {entry.subject || "(no subject)"}
                        </p>
                        <VerificationChip entry={entry} />
                      </div>
                      <p className="text-12 text-black-500 mt-1 truncate">
                        to {entry.contact_name}
                        {entry.contact_email ? ` · ${entry.contact_email}` : ""}{" "}
                        · {new Date(entry.sent_at).toLocaleString()}
                      </p>
                      {entry.error && (
                        <p className="text-12 text-rose-400 mt-1 line-clamp-2">
                          {entry.error}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <p className="text-12 text-black-500 mt-4">
                Open and bounce rates are not shown: they only exist once
                provider webhooks report them, and this page does not
                invent numbers.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
