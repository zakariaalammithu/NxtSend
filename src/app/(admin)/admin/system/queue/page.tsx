"use client";

import * as React from "react";
import { Badge } from "@/components/ui";
import {
  AdminPageHeader,
  EmptyStateBox,
  ErrorState,
  LoadingState,
  ModeNote,
  fmtDateTime,
  useAdminFetch,
} from "@/components/admin/AdminBits";
import type { QueueOverview } from "@/lib/admin/platform-server";

function statusBadge(status: string) {
  switch (status) {
    case "completed":
      return <Badge variant="green">Completed</Badge>;
    case "failed":
      return <Badge variant="red">Failed</Badge>;
    case "running":
      return <Badge variant="blue">Running</Badge>;
    case "pending":
      return <Badge variant="yellow">Pending</Badge>;
    default:
      return <Badge variant="gray">{status}</Badge>;
  }
}

/**
 * Admin → System → Queue & Workers. Real substrate: the jobs/job_runs
 * tables drained by POST /api/jobs/run (Vercel Cron). Demo Mode shows
 * the labelled demo seed. If CRON_SECRET is unset the worker endpoint
 * refuses to run — that is stated plainly rather than hidden.
 */
export default function AdminQueuePage() {
  const { data, error, loading, reload } = useAdminFetch<QueueOverview>(
    "/api/admin/queue"
  );

  return (
    <div className="space-y-6 pb-14">
      <AdminPageHeader
        title="Queue & Workers"
        description="Background jobs (usage rollup, webhook retry, follow-up scheduling) and their execution history. Jobs are drained by the /api/jobs/run worker endpoint, invoked by Vercel Cron."
      />

      {data && <ModeNote mode={data.mode} />}
      {loading && <LoadingState label="Loading queue…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && (
        <>
          {!data.cronConfigured && (
            <div className="rounded-2xl border border-yellow-500/40 bg-yellow-950/20 px-5 py-4 text-13 text-yellow-200">
              <strong>Worker not armed:</strong> CRON_SECRET is not set, so
              /api/jobs/run refuses every request (by design — an
              unauthenticated job trigger is never exposed). Set CRON_SECRET in
              Vercel and the cron schedule in vercel.json activates the worker.
            </div>
          )}

          {/* Counts */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {["pending", "running", "completed", "failed", "skipped"].map(
              (status) => (
                <div key={status} className="glass-card p-5">
                  <p className="text-11 font-bold uppercase tracking-wider text-black-400">
                    {status}
                  </p>
                  <p className="text-28 font-bold text-white mt-1">
                    {data.counts[status] ?? 0}
                  </p>
                </div>
              )
            )}
          </div>

          <p className="text-13 text-black-400">
            Last recorded run:{" "}
            <span className="text-black-200">{fmtDateTime(data.lastRunAt)}</span>
          </p>

          {/* Recent runs */}
          <div className="glass-card p-6">
            <h2 className="text-16 font-bold text-white mb-4">Recent runs</h2>
            {data.recentRuns.length === 0 ? (
              <p className="text-13 text-black-400">
                No job runs recorded yet. Runs appear here after the worker
                executes its first jobs.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-13">
                  <thead>
                    <tr className="text-left text-11 uppercase tracking-wider text-black-500 border-b border-black-700/60">
                      <th className="py-2 pr-4 font-semibold">Started</th>
                      <th className="py-2 pr-4 font-semibold">Job type</th>
                      <th className="py-2 pr-4 font-semibold">Status</th>
                      <th className="py-2 font-semibold">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentRuns.map((run) => (
                      <tr key={run.id} className="border-b border-black-800/60">
                        <td className="py-2.5 pr-4 text-black-300 whitespace-nowrap">
                          {fmtDateTime(run.started_at)}
                        </td>
                        <td className="py-2.5 pr-4 text-black-200">
                          {run.job_type ?? "—"}
                        </td>
                        <td className="py-2.5 pr-4">{statusBadge(run.status)}</td>
                        <td className="py-2.5 text-black-300">{run.message || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Jobs */}
          <div className="glass-card p-6">
            <h2 className="text-16 font-bold text-white mb-4">Jobs</h2>
            {data.jobs.length === 0 ? (
              <EmptyStateBox
                title="No jobs"
                message="No jobs are queued. Jobs are enqueued by product flows (webhook retries, monthly usage rollups, follow-up scheduling)."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-13">
                  <thead>
                    <tr className="text-left text-11 uppercase tracking-wider text-black-500 border-b border-black-700/60">
                      <th className="py-2 pr-4 font-semibold">Type</th>
                      <th className="py-2 pr-4 font-semibold">Status</th>
                      <th className="py-2 pr-4 font-semibold">Attempts</th>
                      <th className="py-2 pr-4 font-semibold">Run after</th>
                      <th className="py-2 font-semibold">Last error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.jobs.map((job) => (
                      <tr key={job.id} className="border-b border-black-800/60">
                        <td className="py-2.5 pr-4 text-black-200">{job.type}</td>
                        <td className="py-2.5 pr-4">{statusBadge(job.status)}</td>
                        <td className="py-2.5 pr-4 text-black-300">
                          {job.attempts} / {job.max_attempts}
                        </td>
                        <td className="py-2.5 pr-4 text-black-300 whitespace-nowrap">
                          {fmtDateTime(job.run_after)}
                        </td>
                        <td className="py-2.5 text-black-400">
                          {job.last_error ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
