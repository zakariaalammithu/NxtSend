"use client";

import * as React from "react";
import {
  AdminPageHeader,
  EmptyStateBox,
  ErrorState,
  LoadingState,
  ModeNote,
  useAdminFetch,
} from "@/components/admin/AdminBits";
import type { CrmSummary } from "@/lib/admin/platform-server";

interface CrmResponse {
  mode: string;
  summary: CrmSummary;
}

/**
 * Admin → CRM. The platform-level CRM view: how lead data is
 * organised across workspaces — tags (the platform's list/segment
 * model), per-workspace volumes, and pipeline status distribution.
 * Individual records live under Admin → Leads; day-to-day CRM work
 * happens in each workspace's own dashboard.
 */
export default function AdminCrmPage() {
  const { data, error, loading, reload } = useAdminFetch<CrmResponse>(
    "/api/admin/leads?view=crm"
  );
  const summary = data?.summary;

  return (
    <div className="space-y-6 pb-14">
      <AdminPageHeader
        title="CRM"
        description="Lists, tags, and segments across the platform. Tags are the list model: a tag on leads functions as a named list/segment in every workspace."
      />

      {data && <ModeNote mode={data.mode} />}
      {loading && <LoadingState label="Loading CRM summary…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {summary && summary.totalLeads === 0 && (
        <EmptyStateBox
          title="No CRM data yet"
          message="No leads exist on the platform yet, so there are no lists, tags, or segments to summarise."
        />
      )}

      {summary && summary.totalLeads > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass-card p-5">
              <p className="text-11 font-bold uppercase tracking-wider text-black-400">
                Total leads
              </p>
              <p className="text-28 font-bold text-white mt-1">{summary.totalLeads}</p>
            </div>
            <div className="glass-card p-5">
              <p className="text-11 font-bold uppercase tracking-wider text-black-400">
                Workspaces with leads
              </p>
              <p className="text-28 font-bold text-white mt-1">{summary.workspaceCount}</p>
            </div>
            <div className="glass-card p-5">
              <p className="text-11 font-bold uppercase tracking-wider text-black-400">
                Distinct tags (lists)
              </p>
              <p className="text-28 font-bold text-white mt-1">{summary.tags.length}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="glass-card p-6">
              <h2 className="text-16 font-bold text-white mb-4">Tags / lists</h2>
              {summary.tags.length === 0 ? (
                <p className="text-13 text-black-400">No tags in use yet.</p>
              ) : (
                <ul className="space-y-2">
                  {summary.tags.map((t) => (
                    <li
                      key={t.tag}
                      className="flex items-center justify-between border-b border-black-800/60 py-1.5"
                    >
                      <span className="text-13 text-black-200">{t.tag}</span>
                      <span className="text-12 text-black-400">{t.count} leads</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="glass-card p-6">
              <h2 className="text-16 font-bold text-white mb-4">Per workspace</h2>
              <ul className="space-y-2">
                {summary.perWorkspace.map((w) => (
                  <li
                    key={w.workspace_name}
                    className="flex items-center justify-between border-b border-black-800/60 py-1.5"
                  >
                    <span className="text-13 text-black-200">{w.workspace_name}</span>
                    <span className="text-12 text-black-400">{w.leads} leads</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="glass-card p-6">
              <h2 className="text-16 font-bold text-white mb-4">Pipeline status</h2>
              <ul className="space-y-2">
                {summary.perStatus.map((s) => (
                  <li
                    key={s.status}
                    className="flex items-center justify-between border-b border-black-800/60 py-1.5"
                  >
                    <span className="text-13 text-black-200 capitalize">{s.status}</span>
                    <span className="text-12 text-black-400">{s.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
