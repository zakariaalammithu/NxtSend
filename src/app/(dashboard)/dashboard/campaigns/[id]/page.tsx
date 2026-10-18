"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Play, Pause, Archive, Target, Users, MessageSquare, Clock, Mail, Linkedin, CheckCircle2 } from "lucide-react";
import { DemoBanner, Badge } from "@/components/ui";
import { StatsCard } from "@/components/dashboard/StatsCard";
import {
  MOCK_CAMPAIGNS,
  MOCK_CAMPAIGN_STEPS,
  MOCK_LEADS,
  MOCK_PERFORMANCE_DATA,
} from "@/lib/db/mock/data";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { CampaignStatus } from "@/types";

export default function CampaignDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const campaign =
    MOCK_CAMPAIGNS.find((c) => c.id === id) || MOCK_CAMPAIGNS[0];

  const [status, setStatus] = React.useState<CampaignStatus>(campaign.status);
  const [activeTab, setActiveTab] = React.useState<
    "overview" | "sequence" | "leads" | "analytics"
  >("overview");

  const toggleStatus = () => {
    setStatus((prev) => (prev === "active" ? "paused" : "active"));
  };

  const handleArchive = () => {
    setStatus("archived");
  };

  return (
    <div className="space-y-6 pb-14">
      {/* Back button & Demo Banner */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/campaigns"
          className="inline-flex items-center gap-1.5 text-13 font-medium text-black-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Campaigns</span>
        </Link>
        <span className="demo-badge">Campaign Detail</span>
      </div>

      <DemoBanner feature="Campaign Sequences" />

      {/* Header Card */}
      <div className="glass-card p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-22 sm:text-26 font-bold tracking-tight text-white">
              {campaign.name}
            </h1>
            <Badge
              variant={
                status === "active"
                  ? "green"
                  : status === "paused"
                  ? "yellow"
                  : "red"
              }
            >
              {status.toUpperCase()}
            </Badge>
            <Badge variant="purple">{campaign.type.toUpperCase()}</Badge>
          </div>
          <p className="text-13 text-black-300">
            Enrolling high-intent prospects across automated multichannel touches.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={toggleStatus}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-13 font-semibold transition-all ${
              status === "active"
                ? "bg-amber-600/20 text-amber-300 border border-amber-500/30 hover:bg-amber-600/30"
                : "bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30"
            }`}
          >
            {status === "active" ? (
              <>
                <Pause className="h-4 w-4" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                <span>Resume</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleArchive}
            className="inline-flex items-center gap-1.5 rounded-xl bg-black-800 hover:bg-black-700 border border-black-600 px-4 py-2 text-13 font-medium text-black-300 hover:text-white transition-colors"
          >
            <Archive className="h-4 w-4" />
            <span>Archive</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-black-700/80 pb-px">
        {[
          { key: "overview", label: "Overview" },
          { key: "sequence", label: "Sequence" },
          { key: "leads", label: "Leads" },
          { key: "analytics", label: "Analytics" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() =>
              setActiveTab(tab.key as "overview" | "sequence" | "leads" | "analytics")
            }
            className={`rounded-t-xl px-4 py-2.5 text-14 font-medium transition-colors border-b-2 ${
              activeTab === tab.key
                ? "border-purple-500 text-white bg-black-800/40"
                : "border-transparent text-black-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB CONTENT: Overview */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5">
            <StatsCard
              label="Enrolled Leads"
              value={84}
              change={12}
              changeType="up"
              icon={Users}
              sublabel="total added"
              isDemo={true}
            />
            <StatsCard
              label="Active Sequence"
              value={42}
              change={5}
              changeType="up"
              icon={Target}
              sublabel="in progress"
              isDemo={true}
            />
            <StatsCard
              label="Completed"
              value={36}
              change={20}
              changeType="up"
              icon={CheckCircle2}
              sublabel="all steps executed"
              isDemo={true}
            />
            <StatsCard
              label="Replies"
              value={14}
              change={16.7}
              changeType="up"
              icon={MessageSquare}
              sublabel="positive interest"
              isDemo={true}
            />
          </div>

          <div className="glass-card p-6">
            <h3 className="text-16 font-semibold text-white mb-2">
              Campaign Configuration Summary
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-13 pt-2">
              <div className="rounded-xl bg-black-800/80 p-3.5 border border-black-700">
                <span className="text-black-400 text-11 block">Daily Sending Cap</span>
                <span className="font-semibold text-white text-15 mt-0.5 block">50 touches / day</span>
              </div>
              <div className="rounded-xl bg-black-800/80 p-3.5 border border-black-700">
                <span className="text-black-400 text-11 block">Sending Window</span>
                <span className="font-semibold text-white text-15 mt-0.5 block">Mon - Fri, 09:00 - 18:00</span>
              </div>
              <div className="rounded-xl bg-black-800/80 p-3.5 border border-black-700">
                <span className="text-black-400 text-11 block">Account Safety</span>
                <span className="font-semibold text-emerald-400 text-15 mt-0.5 block">Smart Random Delays (Active)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Sequence */}
      {activeTab === "sequence" && (
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-black-700">
            <div>
              <h3 className="text-16 font-semibold text-white">Sequence Flow</h3>
              <p className="text-12 text-black-400">Read-only view of steps configured for this campaign</p>
            </div>
            <span className="demo-badge">4 Steps</span>
          </div>

          <div className="space-y-4 pt-2">
            {MOCK_CAMPAIGN_STEPS.map((step, idx) => (
              <div
                key={step.id}
                className="rounded-2xl border border-black-700/80 bg-black-800/70 p-5 space-y-2.5 relative"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-black-700 text-12 font-bold text-white">
                      {idx + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      {step.step_type === "connection_request" ? (
                        <Linkedin className="h-4 w-4 text-blue-400" />
                      ) : step.step_type === "wait" ? (
                        <Clock className="h-4 w-4 text-orange-400" />
                      ) : (
                        <Mail className="h-4 w-4 text-purple-400" />
                      )}
                      <span className="text-14 font-semibold text-white">
                        {step.subject}
                      </span>
                    </div>
                  </div>

                  <span className="text-11 text-black-400">
                    Delay: {step.delay_hours}h
                  </span>
                </div>

                <p className="text-13 text-black-200 font-mono bg-black-900/60 p-3 rounded-xl border border-black-700/60">
                  {step.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: Leads */}
      {activeTab === "leads" && (
        <div className="glass-card overflow-hidden">
          <div className="p-4 border-b border-black-700/80 flex items-center justify-between">
            <h3 className="text-15 font-semibold text-white">
              Enrolled Leads in this Sequence
            </h3>
            <span className="text-12 text-black-400">Showing {MOCK_LEADS.slice(0, 5).length} leads</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-13">
              <thead>
                <tr className="border-b border-black-700/80 bg-black-800/40 text-11 font-semibold uppercase tracking-wider text-black-400">
                  <th className="py-3 px-5">Lead</th>
                  <th className="py-3 px-4">Company</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Step</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black-700/50">
                {MOCK_LEADS.slice(0, 5).map((lead, idx) => (
                  <tr key={lead.id} className="table-row-hover">
                    <td className="py-3 px-5">
                      <div className="font-medium text-white">
                        {lead.first_name} {lead.last_name}
                      </div>
                      <div className="text-11 text-black-400">{lead.email}</div>
                    </td>
                    <td className="py-3 px-4 text-black-200">{lead.company}</td>
                    <td className="py-3 px-4">
                      <Badge
                        variant={
                          lead.status === "replied"
                            ? "green"
                            : lead.status === "contacted"
                            ? "blue"
                            : "gray"
                        }
                      >
                        {lead.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-black-300">
                      Step {idx + 1} of 4
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Analytics */}
      {activeTab === "analytics" && (
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-black-700">
            <div>
              <h3 className="text-16 font-semibold text-white">Conversion Funnel</h3>
              <p className="text-12 text-black-400">Weekly touches and response rates for this sequence</p>
            </div>
            <span className="demo-badge">Demo Data</span>
          </div>

          <div className="h-[260px] pt-4">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={MOCK_PERFORMANCE_DATA}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="messages" name="Touches" fill="#642cff" radius={[4, 4, 0, 0]} />
                <Bar dataKey="replies" name="Replies" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
