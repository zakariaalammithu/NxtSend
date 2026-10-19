"use client";

import * as React from "react";
import { Badge } from "@/components/ui";
import {
  AdminPageHeader,
  EmptyStateBox,
  ErrorState,
  LoadingState,
  ModeNote,
  useAdminFetch,
} from "@/components/admin/AdminBits";
import type { WorkspaceUsageRow } from "@/lib/admin/usage-core";

interface UsageResponse {
  mode: string;
  workspaces: WorkspaceUsageRow[];
}

/**
 * Admin → Analytics → Usage & Credits. Real substrate: usage_records
 * (written monthly by the usage_rollup job) per workspace, with plan
 * limits applied via the billing module's checkLimit. Demo Mode shows
 * the labelled demo seed. Quantities are measured records only.
 *
 * Note on "credits": NxtSend has no credit-balance system — usage is
 * quota-based per plan (see Credit Rules). This page therefore shows
 * consumption against plan quotas, which is the real model.
 */
export default function AdminUsagePage() {
  const { data, error, loading, reload } = useAdminFetch<UsageResponse>(
    "/api/admin/usage"
  );

  const overLimitCount = (data?.workspaces ?? []).filter(
    (w) => w.over_limit.length > 0
  ).length;

  return (
    <div className="space-y-6 pb-14">
      <AdminPageHeader
        title="Usage & Credits"
        description="Per-workspace consumption against plan quotas for the latest recorded period. NxtSend meters usage by quota (leads, campaigns, accounts, emails/month) — there is no separate credit balance; the 'credits' framing maps to these plan limits."
        badge={overLimitCount > 0 ? `${overLimitCount} over limit` : undefined}
      />

      {data && <ModeNote mode={data.mode} />}
      {loading && <LoadingState label="Loading usage…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && data.workspaces.length === 0 && (
        <EmptyStateBox
          title="No usage recorded yet"
          message="Usage rows are written by the usage_rollup background job (monthly). Once the worker has run against real workspace data, per-workspace consumption appears here."
        />
      )}

      {data &&
        data.workspaces.map((ws) => (
          <div key={ws.workspace_id} className="glass-card p-6">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
              <div>
                <h2 className="text-16 font-bold text-white">{ws.workspace_name}</h2>
                <p className="text-12 text-black-400">
                  Plan: <span className="capitalize">{ws.plan}</span>
                  {ws.period_start ? ` · Period from ${ws.period_start}` : ""}
                </p>
              </div>
              {ws.over_limit.length > 0 ? (
                <Badge variant="red">
                  Over limit: {ws.over_limit.join(", ")}
                </Badge>
              ) : (
                <Badge variant="green">Within limits</Badge>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {ws.checks.map((check) => (
                <div key={check.metric}>
                  <div className="flex items-center justify-between text-12 mb-1.5">
                    <span className="text-black-300 font-medium capitalize">
                      {check.metric === "emailsPerMonth"
                        ? "Emails / month"
                        : check.metric}
                    </span>
                    <span className={check.allowed ? "text-black-400" : "text-rose-300"}>
                      {check.used.toLocaleString()} / {check.limit.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-black-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        check.allowed ? "bg-purple-500" : "bg-rose-500"
                      }`}
                      style={{ width: `${check.percentUsed}%` }}
                    />
                  </div>
                </div>
              ))}
              {ws.checks.length === 0 && (
                <p className="text-13 text-black-400">
                  No metrics recorded for this workspace in the latest period.
                </p>
              )}
            </div>
          </div>
        ))}
    </div>
  );
}
