"use client";

import * as React from "react";
import { CreditCard, DollarSign, TrendingUp, Search } from "lucide-react";
import { Badge } from "@/components/ui";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { MOCK_ADMIN_SUBSCRIPTIONS } from "@/lib/db/mock/data";

export default function AdminSubscriptionsPage() {
  const [searchQuery, setSearchQuery] = React.useState("");

  const filteredSubs = MOCK_ADMIN_SUBSCRIPTIONS.filter(
    (s) =>
      s.workspaceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.userEmail.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-7 pb-14">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">
            Platform Subscriptions
          </h1>
          <span className="demo-badge">Stripe Sandbox</span>
        </div>
        <p className="mt-1 text-14 text-black-300">
          Monitor recurring SaaS subscriptions, seat usage, and Stripe connection state.
        </p>
      </div>

      {/* Stripe Status Card */}
      <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <CreditCard className="h-6 w-6 text-amber-400 shrink-0" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white text-14">
                Stripe Production Status
              </span>
              <Badge variant="yellow">Not Connected (Demo Mode)</Badge>
            </div>
            <p className="text-12 text-black-300 mt-0.5">
              Live webhooks and charge capture will activate once STRIPE_SECRET_KEY is configured.
            </p>
          </div>
        </div>
      </div>

      {/* Revenue Summary KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4.5">
        <StatsCard
          label="Simulated MRR"
          value="$945"
          change={14.2}
          changeType="up"
          icon={DollarSign}
          sublabel="monthly recurring"
          isDemo={true}
        />
        <StatsCard
          label="Active Subscriptions"
          value={5}
          change={0}
          changeType="up"
          icon={CreditCard}
          sublabel="across tiers"
          isDemo={true}
        />
        <StatsCard
          label="Average Plan Value"
          value="$189"
          change={8.5}
          changeType="up"
          icon={TrendingUp}
          sublabel="per active org"
          isDemo={true}
        />
      </div>

      {/* Subscriptions Table */}
      <div className="glass-card overflow-hidden">
        <div className="p-4 border-b border-black-700/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-black-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search subscriptions..."
              className="input-field pl-9 py-2 text-12"
            />
          </div>
          <span className="text-12 text-black-400">
            Showing {filteredSubs.length} active workspace subscriptions
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-13 border-collapse">
            <thead>
              <tr className="border-b border-black-700/80 bg-black-800/40 text-11 font-semibold uppercase tracking-wider text-black-400">
                <th className="py-3 px-5">Workspace Org</th>
                <th className="py-3 px-4">Owner Email</th>
                <th className="py-3 px-4">Plan Tier</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Next Renewal</th>
                <th className="py-3 px-5 text-right">Stripe Gateway</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black-700/50">
              {filteredSubs.map((sub) => (
                <tr key={sub.id} className="table-row-hover">
                  <td className="py-3.5 px-5 font-semibold text-white">
                    {sub.workspaceName}
                  </td>
                  <td className="py-3.5 px-4 text-black-300">
                    {sub.userEmail}
                  </td>
                  <td className="py-3.5 px-4">
                    <Badge variant="purple">{sub.plan.toUpperCase()}</Badge>
                  </td>
                  <td className="py-3.5 px-4 font-medium text-white">
                    ${sub.amount}/mo
                  </td>
                  <td className="py-3.5 px-4">
                    <Badge
                      variant={sub.status === "active" ? "green" : "yellow"}
                    >
                      {sub.status}
                    </Badge>
                  </td>
                  <td className="py-3.5 px-4 text-12 text-black-400 whitespace-nowrap">
                    {sub.renewalDate}
                  </td>
                  <td className="py-3.5 px-5 text-right text-11 text-black-400">
                    {sub.stripeStatus}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
