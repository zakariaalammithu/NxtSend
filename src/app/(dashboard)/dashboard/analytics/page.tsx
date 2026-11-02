"use client";

import * as React from "react";
import Link from "next/link";
import { TrendingUp, Zap, MessageSquare, CheckCircle2 } from "lucide-react";
import { DemoBanner, Badge } from "@/components/ui";
import { StatsCard } from "@/components/dashboard/StatsCard";
import {
  getCampaignsRepository,
  getInboxRepository,
  getLeadsRepository,
  resolveWorkspaceId,
} from "@/lib/data";
import {
  loadCampaignStats,
  type CampaignStats,
} from "@/lib/data/campaign-stats";
import type { Campaign } from "@/types";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function pct(numerator: number, denominator: number): string {
  if (denominator <= 0) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export default function AnalyticsPage() {
  const campaignsRepo = React.useMemo(() => getCampaignsRepository(), []);
  const inboxRepo = React.useMemo(() => getInboxRepository(), []);
  const leadsRepo = React.useMemo(() => getLeadsRepository(), []);
  const isDemo = campaignsRepo.mode === "demo";

  const [aggregate, setAggregate] = React.useState<CampaignStats | null>(null);
  const [byCampaign, setByCampaign] = React.useState<
    { campaign: Campaign; stats: CampaignStats }[]
  >([]);
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
        const list = await campaignsRepo.listCampaigns(ws);
        const result = await loadCampaignStats(
          {
            campaignsRepo,
            inboxRepo,
            leadsRepo,
            mode: campaignsRepo.mode,
          },
          ws,
          list,
        );
        if (cancelled) return;
        setAggregate(result.aggregate);
        setByCampaign(
          list.map((campaign) => ({
            campaign,
            stats:
              result.byCampaign.get(campaign.id) ??
              result.aggregate,
          })),
        );
      } catch {
        if (!cancelled)
          setLoadError("Could not load analytics. Please try again.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignsRepo, inboxRepo, leadsRepo]);

  // Real recorded totals only. LinkedIn "accepted" has no data source
  // anywhere in the product, so it is shown as "—", never estimated.
  // The previous version of this page rendered hard-coded mock
  // numbers and a decorative date-range toggle; both are removed:
  // these totals cover all recorded activity, not a selected window.
  const linkedinSent = aggregate
    ? aggregate.linkedin.connectionRequestsSent + aggregate.linkedin.messagesSent
    : 0;
  const emailSent = aggregate ? aggregate.email.sent : 0;
  const totalSent = linkedinSent + emailSent;
  const repliesTotal = aggregate ? aggregate.repliesTotal : 0;

  const channelBreakdownData = [
    { name: "LinkedIn", value: linkedinSent },
    { name: "Cold Email", value: emailSent },
  ];

  const performanceData = byCampaign.map(({ campaign, stats }) => ({
    name: campaign.name,
    messages: stats.email.sent,
    connections: stats.linkedin.connectionRequestsSent,
  }));

  const topCampaigns = [...byCampaign]
    .sort((a, b) => {
      const sentA =
        a.stats.email.sent +
        a.stats.linkedin.connectionRequestsSent +
        a.stats.linkedin.messagesSent;
      const sentB =
        b.stats.email.sent +
        b.stats.linkedin.connectionRequestsSent +
        b.stats.linkedin.messagesSent;
      return sentB - sentA;
    })
    .slice(0, 5);

  return (
    <div className="space-y-7 pb-14">
      <DemoBanner feature="Analytics Engine" />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">
              Outreach Analytics
            </h1>
            {isDemo && <span className="demo-badge">Demo Data</span>}
          </div>
          <p className="mt-1 text-14 text-black-300">
            Totals computed from recorded enrollments, messages and step
            executions — all recorded activity, not a selected date range.
            LinkedIn acceptance is shown as “—” because no data source
            reports it yet.
          </p>
        </div>
      </div>

      {loadError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-600/10 p-3.5 text-13 text-rose-300">
          {loadError}
        </div>
      )}

      {isLoading || !aggregate ? (
        <p className="text-13 text-black-400">
          {isLoading ? "Loading analytics…" : "No analytics data available."}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5">
            <StatsCard
              label="Total Outreach"
              value={totalSent}
              icon={Zap}
              sublabel="recorded sends (email + LinkedIn)"
              isDemo={isDemo}
            />
            <StatsCard
              label="Acceptance Rate"
              value="—"
              icon={CheckCircle2}
              sublabel="no LinkedIn acceptance source yet"
              isDemo={isDemo}
            />
            <StatsCard
              label="Reply Rate"
              value={pct(repliesTotal, totalSent)}
              icon={MessageSquare}
              sublabel="replies / recorded sends"
              isDemo={isDemo}
            />
            <StatsCard
              label="Steps Skipped"
              value={aggregate.executions.skipped}
              icon={TrendingUp}
              sublabel="LinkedIn steps without a provider"
              isDemo={isDemo}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-card p-6 flex flex-col justify-between">
              <div className="flex items-center justify-between pb-3 border-b border-black-700">
                <div>
                  <h3 className="text-16 font-semibold text-white">
                    Campaign Performance
                  </h3>
                  <p className="text-12 text-black-400 mt-0.5">
                    Connections vs messages sent, by campaign
                  </p>
                </div>
              </div>
              <div className="pt-6 h-[260px]">
                {performanceData.length === 0 ? (
                  <p className="text-13 text-black-400">
                    No campaign activity recorded yet.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={performanceData}>
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="messages" name="Messages" fill="#642cff" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="connections" name="Connections" fill="#ff4d00" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="glass-card p-6 flex flex-col justify-between">
              <div className="pb-3 border-b border-black-700">
                <h3 className="text-16 font-semibold text-white">
                  Channel Volume
                </h3>
                <p className="text-12 text-black-400 mt-0.5">
                  LinkedIn vs email sends, recorded totals
                </p>
              </div>
              <div className="py-6 flex items-center justify-center">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={channelBreakdownData} dataKey="value" nameKey="name">
                      <Cell fill="#642cff" />
                      <Cell fill="#ff4d00" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <p className="rounded-xl border border-black-700 bg-black-800/60 p-3 text-12 text-black-300 text-center">
                LinkedIn steps are recorded as skipped until an authorized
                LinkedIn provider is connected — they are not counted as
                sent.
              </p>
            </div>
          </div>

          <div className="glass-card p-6">
            <div className="flex items-center justify-between pb-4 border-b border-black-700">
              <div>
                <h3 className="text-16 font-semibold text-white">
                  Top Performing Campaigns
                </h3>
                <p className="text-12 text-black-400 mt-0.5">
                  Campaigns ranked by recorded sends
                </p>
              </div>
            </div>
            <div className="overflow-x-auto mt-2">
              {topCampaigns.length === 0 ? (
                <p className="text-13 text-black-400">
                  No campaigns yet. Create a campaign to see it here.
                </p>
              ) : (
                <table className="w-full text-left text-13">
                  <thead>
                    <tr className="border-b border-black-700/60 text-11 font-semibold uppercase tracking-wider text-black-400">
                      <th className="py-3 px-3">Campaign</th>
                      <th className="py-3 px-3">Channel</th>
                      <th className="py-3 px-3">Sent</th>
                      <th className="py-3 px-3">Replies</th>
                      <th className="py-3 px-3 text-right">Reply Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black-700/40">
                    {topCampaigns.map(({ campaign, stats }) => {
                      const sent =
                        stats.email.sent +
                        stats.linkedin.connectionRequestsSent +
                        stats.linkedin.messagesSent;
                      return (
                        <tr key={campaign.id} className="table-row-hover">
                          <td className="py-3.5 px-3 font-semibold text-white">
                            <Link
                              href={`/dashboard/campaigns/${campaign.id}`}
                              className="hover:underline"
                            >
                              {campaign.name}
                            </Link>
                          </td>
                          <td className="py-3.5 px-3">
                            <Badge
                              variant={
                                campaign.type === "mixed"
                                  ? "orange"
                                  : campaign.type === "linkedin"
                                  ? "blue"
                                  : "purple"
                              }
                            >
                              {campaign.type}
                            </Badge>
                          </td>
                          <td className="py-3.5 px-3 text-black-300">{sent}</td>
                          <td className="py-3.5 px-3 text-black-300">
                            {stats.repliesTotal}
                          </td>
                          <td className="py-3.5 px-3 text-right font-bold text-emerald-400">
                            {pct(stats.repliesTotal, sent)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
