"use client";

import * as React from "react";
import Link from "next/link";
import { Users, Target, CreditCard, DollarSign, Shield, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { MOCK_ADMIN_USERS } from "@/lib/db/mock/data";
import { formatDate } from "@/lib/utils";

export default function AdminOverviewPage() {
  return (
    <div className="space-y-7 pb-14">
      {/* Admin Demo Banner */}
      <div className="rounded-2xl border border-rose-500/40 bg-rose-950/20 p-4 text-rose-200 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-rose-400 shrink-0" />
          <p className="text-13">
            <strong>Admin Panel</strong> &mdash; This is demo data. Connect Supabase to see real platform metrics.
          </p>
        </div>
        <span className="demo-badge text-10 py-0.5 px-2.5">
          Simulated Sandbox
        </span>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">
          Platform Overview
        </h1>
        <p className="mt-1 text-14 text-black-300">
          Global metrics across all workspaces, tenants, and infrastructure adapters.
        </p>
      </div>

      {/* Platform Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5">
        <StatsCard
          label="Total Users"
          value={128}
          change={18}
          changeType="up"
          icon={Users}
          sublabel="registered accounts"
          isDemo={true}
        />
        <StatsCard
          label="Active Workspaces"
          value={84}
          change={12}
          changeType="up"
          icon={Target}
          sublabel="multi-tenant orgs"
          isDemo={true}
        />
        <StatsCard
          label="Total Revenue"
          value="$0"
          sublabel="Demo Mode (Stripe sandbox)"
          icon={DollarSign}
          isDemo={true}
        />
        <StatsCard
          label="Active Subscriptions"
          value={46}
          change={8}
          changeType="up"
          icon={CreditCard}
          sublabel="paid workspace tiers"
          isDemo={true}
        />
      </div>

      {/* Integration Health Status Cards */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-black-700">
          <div>
            <h3 className="text-16 font-semibold text-white">
              Integration Adapter Health
            </h3>
            <p className="text-12 text-black-400">
              Operational status of internal cron runners and third-party APIs
            </p>
          </div>
          <Badge variant="green">All Systems Nominal</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          <div className="rounded-xl border border-black-700 bg-black-800/60 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white text-13">Supabase DB</span>
              <span className="flex items-center gap-1.5 text-11 text-emerald-400 font-medium">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Demo Fallback Active
              </span>
            </div>
            <p className="text-12 text-black-400">
              In-memory mock store active. Latency: 4ms.
            </p>
          </div>

          <div className="rounded-xl border border-black-700 bg-black-800/60 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white text-13">Resend Mailer</span>
              <span className="flex items-center gap-1.5 text-11 text-emerald-400 font-medium">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Simulated 200 OK
              </span>
            </div>
            <p className="text-12 text-black-400">
              Mock worker processing 50 touches/minute.
            </p>
          </div>

          <div className="rounded-xl border border-black-700 bg-black-800/60 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white text-13">LinkedIn Queue</span>
              <span className="flex items-center gap-1.5 text-11 text-emerald-400 font-medium">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Delay Throttling Active
              </span>
            </div>
            <p className="text-12 text-black-400">
              Human randomized delays: 45-120s interval.
            </p>
          </div>
        </div>
      </div>

      {/* Recent Signups Table */}
      <div className="glass-card overflow-hidden">
        <div className="p-5 border-b border-black-700/80 flex items-center justify-between">
          <div>
            <h3 className="text-16 font-semibold text-white">
              Recent Signups (Last 5 Users)
            </h3>
            <p className="text-12 text-black-400">Mock platform accounts</p>
          </div>
          <Link
            href="/admin/users"
            className="text-13 text-rose-400 hover:text-rose-300 font-medium flex items-center gap-1"
          >
            <span>Manage All Users</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-13">
            <thead>
              <tr className="border-b border-black-700/80 bg-black-800/40 text-11 font-semibold uppercase tracking-wider text-black-400">
                <th className="py-3 px-5">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Plan</th>
                <th className="py-3 px-4">Workspaces</th>
                <th className="py-3 px-4">Joined Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black-700/50">
              {MOCK_ADMIN_USERS.slice(0, 5).map((user) => (
                <tr key={user.id} className="table-row-hover">
                  <td className="py-3.5 px-5">
                    <div className="font-semibold text-white">{user.name}</div>
                    <div className="text-11 text-black-400">{user.email}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <Badge
                      variant={
                        user.role === "super_admin"
                          ? "red"
                          : user.role === "admin"
                          ? "purple"
                          : "blue"
                      }
                    >
                      {user.role}
                    </Badge>
                  </td>
                  <td className="py-3.5 px-4 uppercase text-12 font-medium text-black-200">
                    {user.plan}
                  </td>
                  <td className="py-3.5 px-4 text-black-300">
                    {user.workspace_count}
                  </td>
                  <td className="py-3.5 px-4 text-12 text-black-400 whitespace-nowrap">
                    {formatDate(user.created_at, "short")}
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
