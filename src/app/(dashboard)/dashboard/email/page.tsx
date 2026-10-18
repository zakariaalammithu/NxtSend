"use client";

import * as React from "react";
import Link from "next/link";
import { Mail, Send, AlertTriangle, ShieldCheck, Plus, ArrowRight, TrendingUp } from "lucide-react";
import { DemoBanner, Badge } from "@/components/ui";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { MOCK_CAMPAIGNS } from "@/lib/db/mock/data";

export default function EmailOutreachPage() {
  const emailCampaigns = MOCK_CAMPAIGNS.filter(
    (c) => c.type === "email" || c.type === "mixed"
  );

  return (
    <div className="space-y-7 pb-14">
      <DemoBanner feature="Email Warmup & Deliverability" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white flex items-center gap-2.5">
              <Mail className="h-6 w-6 text-purple-400" />
              <span>Cold Email Deliverability</span>
            </h1>
            <span className="demo-badge">Demo Mode</span>
          </div>
          <p className="mt-1 text-14 text-black-300">
            Monitor domain warmup status, SPF/DKIM health, and cold email sequences.
          </p>
        </div>

        <Link
          href="/dashboard/campaigns/new"
          className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-2.5 text-14 font-semibold text-white shadow-glow-purple transition-all self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>New Email Campaign</span>
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5">
        <StatsCard
          label="Emails Delivered"
          value={312}
          change={26.4}
          changeType="up"
          icon={Send}
          sublabel="via Resend sandbox"
          isDemo={true}
        />
        <StatsCard
          label="Open Rate"
          value="58.4%"
          change={4.2}
          changeType="up"
          icon={TrendingUp}
          sublabel="verified pixel tracking"
          isDemo={true}
        />
        <StatsCard
          label="Bounce Rate"
          value="1.8%"
          change={0.4}
          changeType="down"
          icon={AlertTriangle}
          sublabel="safe (< 3% threshold)"
          isDemo={true}
        />
        <StatsCard
          label="Domain Reputation"
          value="99 / 100"
          change={0}
          changeType="up"
          icon={ShieldCheck}
          sublabel="DKIM/SPF passed"
          isDemo={true}
        />
      </div>

      {/* Active Domain Card */}
      <div className="glass-card p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-600/20 text-purple-400 border border-purple-500/30 font-bold text-16">
            @
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white text-15">
                mail.nxtsend-demo.com
              </span>
              <Badge variant="green">Warmup Complete</Badge>
            </div>
            <p className="text-12 text-black-400 mt-0.5">
              Provider: Resend &bull; Daily quota: 500 emails/day &bull; Tracking domain: custom SSL
            </p>
          </div>
        </div>

        <Link
          href="/dashboard/integrations"
          className="inline-flex items-center gap-1.5 rounded-xl bg-black-800 hover:bg-black-700 border border-black-600 px-4 py-2 text-13 font-medium text-white transition-colors"
        >
          <span>Configure Provider</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Active Email Campaigns */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-black-700">
          <h3 className="text-16 font-semibold text-white">
            Active Email Sequences
          </h3>
          <Link
            href="/dashboard/campaigns"
            className="text-12 text-purple-400 hover:underline"
          >
            View All Campaigns &rarr;
          </Link>
        </div>

        <div className="space-y-2.5 pt-1">
          {emailCampaigns.map((camp) => (
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
