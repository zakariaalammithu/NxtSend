"use client";

import * as React from "react";
import Link from "next/link";
import {
  Users,
  Target,
  MessageSquare,
  TrendingUp,
  UserPlus,
  Mail,
  CornerUpLeft,
  AlertTriangle,
  Plus,
  Upload,
  BarChart3,
  ArrowRight,
  Sparkles,
  Inbox,
  Clock,
} from "lucide-react";
import { DemoBanner } from "@/components/ui";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { MOCK_PERFORMANCE_DATA, MOCK_ACTIVITY } from "@/lib/db/mock/data";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function DashboardOverviewPage() {
  const userName = "Alex";

  return (
    <div className="space-y-7 pb-10">
      {/* Top Demo Banner */}
      <DemoBanner feature="Analytics & Live Sync" />

      {/* Header & Quick Action Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-24 sm:text-30 font-bold tracking-tight text-white">
              Good morning, {userName}! 👋
            </h1>
            <span className="demo-badge">Demo Data</span>
          </div>
          <p className="mt-1 text-14 text-black-300">
            Here is what&apos;s happening across your outreach campaigns today.
          </p>
        </div>

        {/* Action button */}
        <Link
          href="/dashboard/campaigns/new"
          className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-2.5 text-14 font-semibold text-white shadow-glow-purple transition-all self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>New Campaign</span>
        </Link>
      </div>

      {/* Primary Stats Grid (4 Cards using StatsCard) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5">
        <StatsCard
          label="Total Leads"
          value={247}
          change={14.8}
          changeType="up"
          icon={Users}
          sublabel="vs last month"
          isDemo={true}
        />
        <StatsCard
          label="Active Campaigns"
          value={3}
          change={0}
          changeType="up"
          icon={Target}
          sublabel="running smoothly"
          isDemo={true}
        />
        <StatsCard
          label="Messages Sent"
          value={156}
          change={18.5}
          changeType="up"
          icon={MessageSquare}
          sublabel="across channels"
          isDemo={true}
        />
        <StatsCard
          label="Reply Rate"
          value="18%"
          change={4.2}
          changeType="up"
          icon={TrendingUp}
          sublabel="industry avg 9%"
          isDemo={true}
        />
      </div>

      {/* Secondary Stats Row (4 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5">
        <StatsCard
          label="Connections Sent"
          value={89}
          change={11.2}
          changeType="up"
          icon={UserPlus}
          sublabel="LinkedIn requests"
          isDemo={true}
        />
        <StatsCard
          label="Emails Sent"
          value={312}
          change={26.4}
          changeType="up"
          icon={Mail}
          sublabel="delivered via Resend"
          isDemo={true}
        />
        <StatsCard
          label="Positive Replies"
          value={28}
          change={8.7}
          changeType="up"
          icon={CornerUpLeft}
          sublabel="qualified leads"
          isDemo={true}
        />
        <StatsCard
          label="Bounces"
          value={12}
          change={1.2}
          changeType="down"
          icon={AlertTriangle}
          sublabel="3.8% bounce rate"
          isDemo={true}
        />
      </div>

      {/* Middle Row: Campaign Performance Chart + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Campaign Performance Chart (2 Cols on LG) */}
        <div className="lg:col-span-2 glass-card p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-4 border-b border-black-700/60">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-16 font-semibold text-white">
                  Campaign Performance
                </h3>
                <span className="demo-badge text-10 py-0.5 px-2">Demo Data</span>
              </div>
              <p className="text-12 text-black-400 mt-0.5">
                Connections and messages dispatched over the last 7 days
              </p>
            </div>
            <div className="flex items-center gap-4 text-12">
              <span className="flex items-center gap-1.5 text-black-300">
                <span className="h-2.5 w-2.5 rounded-full bg-purple-600" />
                Messages
              </span>
              <span className="flex items-center gap-1.5 text-black-300">
                <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
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

        {/* Quick Actions Card (1 Col on LG) */}
        <div className="glass-card p-6 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-16 font-semibold text-white">
                Quick Actions
              </h3>
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
                <span>Import Leads</span>
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
              href="/dashboard/analytics"
              className="flex items-center justify-between rounded-xl bg-black-800/80 hover:bg-black-800 border border-black-700/80 p-3 text-13 font-medium text-white transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black-700 text-black-300 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <BarChart3 className="h-4 w-4" />
                </div>
                <span>View Analytics</span>
              </div>
              <ArrowRight className="h-4 w-4 text-black-400 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
            </Link>
          </div>

          <div className="rounded-xl border border-purple-500/20 bg-purple-600/5 p-3 text-12 text-purple-200">
            💡 <strong>Pro Tip:</strong> Sequences combining LinkedIn connection touches + Day 2 email have 2.8x higher reply rates.
          </div>
        </div>
      </div>

      {/* Recent Activity Section */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between pb-4 border-b border-black-700/60">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-16 font-semibold text-white">
                Recent Activity
              </h3>
              <span className="demo-badge text-10 py-0.5 px-2">Demo Data</span>
            </div>
            <p className="text-12 text-black-400 mt-0.5">
              Live updates across active sequences and prospect responses
            </p>
          </div>
          <Link
            href="/dashboard/inbox"
            className="text-13 font-medium text-purple-400 hover:text-purple-300 flex items-center gap-1"
          >
            <span>Open Inbox</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="divide-y divide-black-700/50 mt-2">
          {MOCK_ACTIVITY.map((item) => (
            <div
              key={item.id}
              className="py-3.5 flex items-center justify-between gap-4 table-row-hover px-2 rounded-lg"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black-800 border border-black-700 text-purple-400">
                  {item.channel === "linkedin" ? (
                    <Users className="h-4 w-4 text-blue-400" />
                  ) : item.channel === "email" ? (
                    <Mail className="h-4 w-4 text-purple-400" />
                  ) : (
                    <Clock className="h-4 w-4 text-orange-400" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-13 font-semibold text-white truncate">
                      {item.title}
                    </p>
                    {item.is_demo && (
                      <span className="demo-badge text-10 py-0 px-1.5">
                        Demo
                      </span>
                    )}
                  </div>
                  <p className="text-12 text-black-300 truncate">
                    {item.description}
                  </p>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <span className="text-11 text-black-400 font-medium whitespace-nowrap">
                  {item.timestamp}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
