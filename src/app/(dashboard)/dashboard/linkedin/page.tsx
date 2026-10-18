"use client";

import * as React from "react";
import Link from "next/link";
import { Linkedin, UserPlus, MessageSquare, TrendingUp, ShieldCheck, Plus, ArrowRight } from "lucide-react";
import { DemoBanner, Badge } from "@/components/ui";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { MOCK_CAMPAIGNS } from "@/lib/db/mock/data";

export default function LinkedInOutreachPage() {
  const linkedInCampaigns = MOCK_CAMPAIGNS.filter(
    (c) => c.type === "linkedin" || c.type === "mixed"
  );

  return (
    <div className="space-y-7 pb-14">
      <DemoBanner feature="LinkedIn Automation" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white flex items-center gap-2.5">
              <Linkedin className="h-6 w-6 text-blue-400" />
              <span>LinkedIn Automation</span>
            </h1>
            <span className="demo-badge">Demo Mode</span>
          </div>
          <p className="mt-1 text-14 text-black-300">
            Smart profile touchpoints, automated connection requests, and in-network DMs.
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5">
        <StatsCard
          label="Today's Connections"
          value="18 / 50"
          change={12}
          changeType="up"
          icon={UserPlus}
          sublabel="within safety limit"
          isDemo={true}
        />
        <StatsCard
          label="Acceptance Rate"
          value="41.2%"
          change={5.4}
          changeType="up"
          icon={TrendingUp}
          sublabel="industry benchmark 28%"
          isDemo={true}
        />
        <StatsCard
          label="Direct Messages"
          value={74}
          change={14.1}
          changeType="up"
          icon={MessageSquare}
          sublabel="sent this week"
          isDemo={true}
        />
        <StatsCard
          label="Profile Health"
          value="100%"
          change={0}
          changeType="up"
          icon={ShieldCheck}
          sublabel="zero warnings"
          isDemo={true}
        />
      </div>

      {/* Connected Account Card */}
      <div className="glass-card p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30 font-bold text-16">
            AV
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white text-15">
                Alex Vance (Simulated Account)
              </span>
              <Badge variant="blue">Active Session</Badge>
            </div>
            <p className="text-12 text-black-400 mt-0.5">
              Daily safety cap: 50 requests &bull; Proxy: Residential US-West &bull; Human delay: 45-120s
            </p>
          </div>
        </div>

        <Link
          href="/dashboard/integrations"
          className="inline-flex items-center gap-1.5 rounded-xl bg-black-800 hover:bg-black-700 border border-black-600 px-4 py-2 text-13 font-medium text-white transition-colors"
        >
          <span>Account Settings</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Active LinkedIn Sequences */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-black-700">
          <h3 className="text-16 font-semibold text-white">
            Active LinkedIn Sequences
          </h3>
          <Link
            href="/dashboard/campaigns"
            className="text-12 text-purple-400 hover:underline"
          >
            View All Campaigns &rarr;
          </Link>
        </div>

        <div className="space-y-2.5 pt-1">
          {linkedInCampaigns.map((camp) => (
            <div
              key={camp.id}
              className="flex items-center justify-between p-3.5 rounded-xl bg-black-800/60 border border-black-700/60 table-row-hover"
            >
              <div>
                <span className="font-semibold text-white text-13 block">
                  {camp.name}
                </span>
                <span className="text-11 text-black-400">
                  Status: {camp.status} &bull; 84 leads enrolled
                </span>
              </div>
              <Link
                href={`/dashboard/campaigns/${camp.id}`}
                className="text-12 font-medium text-purple-400 hover:text-purple-300 flex items-center gap-1"
              >
                <span>Inspect</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
