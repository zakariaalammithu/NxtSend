"use client";

import * as React from "react";
import { TrendingUp, Zap, MessageSquare, CheckCircle2 } from "lucide-react";
import { DemoBanner, Badge } from "@/components/ui";
import { StatsCard } from "@/components/dashboard/StatsCard";
import {
  MOCK_PERFORMANCE_DATA,
  MOCK_CAMPAIGNS,
} from "@/lib/db/mock/data";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = React.useState<"7d" | "30d" | "90d">("7d");

  // Donut chart data for LinkedIn vs Email
  const channelBreakdownData = [
    { name: "LinkedIn", value: 245 },
    { name: "Cold Email", value: 312 },
  ];


  return (
    <div className="space-y-7 pb-14">
      <DemoBanner feature="Analytics Engine" />

      {/* Header & Date Range Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">
              Outreach Analytics
            </h1>
            <span className="demo-badge">Demo Data</span>
          </div>
          <p className="mt-1 text-14 text-black-300">
            Real-time pipeline metrics, conversion benchmarks, and channel attribution.
          </p>
        </div>

        {/* Date range toggle */}
        <div className="flex items-center gap-1 rounded-xl bg-black-800 p-1 border border-black-700">
          {[
            { key: "7d", label: "Last 7 days" },
            { key: "30d", label: "Last 30 days" },
            { key: "90d", label: "Last 90 days" },
          ].map((range) => (
            <button
              key={range.key}
              type="button"
              onClick={() => setDateRange(range.key as "7d" | "30d" | "90d")}
              className={`rounded-lg px-3 py-1.5 text-12 font-medium transition-colors ${
                dateRange === range.key
                  ? "bg-purple-600 text-white shadow-glow-purple"
                  : "text-black-400 hover:text-white"
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5">
        <StatsCard
          label="Total Outreach"
          value={557}
          change={21.4}
          changeType="up"
          icon={Zap}
          sublabel="combined touches"
          isDemo={true}
        />
        <StatsCard
          label="Acceptance Rate"
          value="41.2%"
          change={6.8}
          changeType="up"
          icon={CheckCircle2}
          sublabel="connection acceptance"
          isDemo={true}
        />
        <StatsCard
          label="Reply Rate"
          value="18.5%"
          change={4.2}
          changeType="up"
          icon={MessageSquare}
          sublabel="total reply volume"
          isDemo={true}
        />
        <StatsCard
          label="Positive Reply Rate"
          value="12.3%"
          change={3.1}
          changeType="up"
          icon={TrendingUp}
          sublabel="high-intent leads"
          isDemo={true}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Campaign Performance Bar Chart */}
        <div className="glass-card p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-black-700">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-16 font-semibold text-white">
                  Campaign Performance
                </h3>
                <span className="demo-badge text-10 py-0.5 px-2">Demo Data</span>
              </div>
              <p className="text-12 text-black-400 mt-0.5">
                Connections vs Messages by day
              </p>
            </div>
            <div className="flex items-center gap-3 text-11 text-black-300">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-purple-600" />
                Messages
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-orange-500" />
                Connections
              </span>
            </div>
          </div>

          <div className="pt-6 h-[260px]">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={MOCK_PERFORMANCE_DATA}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="messages" name="Messages" fill="#642cff" radius={[4, 4, 0, 0]} />
                <Bar dataKey="connections" name="Connections" fill="#ff4d00" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Messages Over Time Line Chart */}
        <div className="glass-card p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-black-700">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-16 font-semibold text-white">
                  Messages Over Time
                </h3>
                <span className="demo-badge text-10 py-0.5 px-2">Demo Data</span>
              </div>
              <p className="text-12 text-black-400 mt-0.5">
                Trendline of emails sent and prospect replies
              </p>
            </div>
            <div className="flex items-center gap-3 text-11 text-black-300">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-purple-500" />
                Emails
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-orange-500" />
                Replies
              </span>
            </div>
          </div>

          <div className="pt-6 h-[260px]">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={MOCK_PERFORMANCE_DATA}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Line
                  dataKey="emails"
                  name="Emails"
                  stroke="#7755ff"
                  strokeWidth={2.5}
                />
                <Line
                  dataKey="replies"
                  name="Replies"
                  stroke="#ff6e1a"
                  strokeWidth={2.5}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Top Campaigns Table & Donut Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Performing Campaigns (2 Cols on LG) */}
        <div className="lg:col-span-2 glass-card p-6">
          <div className="flex items-center justify-between pb-4 border-b border-black-700">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-16 font-semibold text-white">
                  Top Performing Campaigns
                </h3>
                <span className="demo-badge text-10 py-0.5 px-2">Demo Data</span>
              </div>
              <p className="text-12 text-black-400 mt-0.5">
                Campaigns ranked by positive reply rate
              </p>
            </div>
          </div>

          <div className="overflow-x-auto mt-2">
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
                {MOCK_CAMPAIGNS.slice(0, 3).map((camp, idx) => (
                  <tr key={camp.id} className="table-row-hover">
                    <td className="py-3.5 px-3 font-semibold text-white">
                      {camp.name}
                    </td>
                    <td className="py-3.5 px-3">
                      <Badge
                        variant={
                          camp.type === "mixed"
                            ? "orange"
                            : camp.type === "linkedin"
                            ? "blue"
                            : "purple"
                        }
                      >
                        {camp.type}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-3 text-black-300">
                      {[156, 112, 89][idx]}
                    </td>
                    <td className="py-3.5 px-3 text-black-300">
                      {[28, 22, 17][idx]}
                    </td>
                    <td className="py-3.5 px-3 text-right font-bold text-emerald-400">
                      {["22.4%", "19.6%", "18.1%"][idx]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Channel Breakdown Donut Chart (1 Col on LG) */}
        <div className="glass-card p-6 flex flex-col justify-between">
          <div className="pb-3 border-b border-black-700">
            <div className="flex items-center gap-2">
              <h3 className="text-16 font-semibold text-white">
                Channel Volume
              </h3>
              <span className="demo-badge text-10 py-0.5 px-2">Demo Data</span>
            </div>
            <p className="text-12 text-black-400 mt-0.5">
              LinkedIn vs Email touchpoint distribution
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

          <div className="rounded-xl border border-black-700 bg-black-800/60 p-3 text-12 text-black-300 text-center">
            Multichannel sequences are outperforming single-channel by <strong>68%</strong>.
          </div>
        </div>
      </div>
    </div>
  );
}
