"use client";

import * as React from "react";
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle } from "lucide-react";
import {
  AdminPageHeader,
  ErrorState,
  LoadingState,
  ModeNote,
  fmtDateTime,
  useAdminFetch,
} from "@/components/admin/AdminBits";
import type { HealthSummary, HealthCheckStatus } from "@/lib/admin/health-core";
import type { EnvPresence } from "@/lib/admin/platform-server";

interface HealthResponse extends HealthSummary {
  mode: string;
  env: EnvPresence[];
  checkedAt: string;
}

function StatusIcon({ status }: { status: HealthCheckStatus }) {
  switch (status) {
    case "ok":
      return <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />;
    case "warning":
      return <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0" />;
    case "fail":
      return <XCircle className="h-5 w-5 text-rose-400 shrink-0" />;
    default:
      return <HelpCircle className="h-5 w-5 text-black-400 shrink-0" />;
  }
}

/**
 * Admin → System → System Health. The overall banner comes from
 * aggregateHealth(): a failed REQUIRED check (e.g. no database) can
 * never render as "Healthy" — in Demo Mode this page correctly leads
 * with "Issues found", because there is no database behind it yet.
 */
export default function AdminHealthPage() {
  const { data, error, loading, reload } = useAdminFetch<HealthResponse>(
    "/api/admin/health"
  );

  const bannerClass =
    data?.overall === "healthy"
      ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-200"
      : data?.overall === "not_configured"
        ? "border-yellow-500/40 bg-yellow-950/20 text-yellow-200"
        : "border-rose-500/40 bg-rose-950/20 text-rose-200";

  return (
    <div className="space-y-6 pb-14">
      <AdminPageHeader
        title="System Health"
        description="Live checks against the services this deployment actually depends on. A check is only 'OK' when the underlying configuration or probe succeeds — this page never reports blanket health."
      />

      {data && <ModeNote mode={data.mode} />}
      {loading && <LoadingState label="Running health checks…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && (
        <>
          <div className={`rounded-2xl border p-5 ${bannerClass}`}>
            <p className="text-18 font-bold">Overall: {data.label}</p>
            <p className="text-13 mt-1 opacity-90">
              {data.counts.ok} OK · {data.counts.warning} warning ·{" "}
              {data.counts.fail} failed · {data.counts.unknown} unknown ·
              checked {fmtDateTime(data.checkedAt)}
            </p>
          </div>

          <div className="space-y-3">
            {data.checks.map((check) => (
              <div
                key={check.id}
                className="glass-card p-5 flex items-start gap-4"
              >
                <StatusIcon status={check.status} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-14 font-semibold text-white">{check.label}</p>
                    {check.required && (
                      <span className="text-10 font-bold uppercase tracking-wider text-rose-300 border border-rose-500/40 rounded-full px-2 py-0.5">
                        Required
                      </span>
                    )}
                    <span className="text-11 uppercase tracking-wider text-black-400">
                      {check.status}
                    </span>
                  </div>
                  <p className="text-13 text-black-300 mt-1">{check.message}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="glass-card p-6">
            <h2 className="text-16 font-bold text-white mb-1">
              Environment presence
            </h2>
            <p className="text-13 text-black-400 mb-4">
              Names and presence only — secret values are never displayed,
              logged, or sent to the browser. Set values in Vercel →
              Project → Settings → Environment Variables.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
              {data.env.map((entry) => (
                <div
                  key={entry.name}
                  className="flex items-center justify-between gap-3 py-1.5 border-b border-black-800/60"
                >
                  <span className="text-12 font-mono text-black-200 truncate">
                    {entry.name}
                  </span>
                  <span
                    className={`text-11 font-bold uppercase tracking-wider ${
                      entry.present ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {entry.present ? "Set" : "Missing"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
