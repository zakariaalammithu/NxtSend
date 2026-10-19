"use client";

import * as React from "react";
import { Search } from "lucide-react";
import {
  EmptyStateBox,
  ErrorState,
  LoadingState,
  ModeNote,
  fmtDateTime,
  useAdminFetch,
} from "@/components/admin/AdminBits";
import type { AuditEntry } from "@/lib/admin/audit-core";

interface AuditResponse {
  mode: string;
  entries: AuditEntry[];
}

/**
 * Admin → Audit Logs. REWIRED in Stage D: this page previously
 * rendered a bundled mock array and never showed a single entry the
 * admin APIs actually write. It now reads GET /api/admin/audit-logs —
 * the audit_logs table (service role, admin-gated) in live mode, the
 * labelled demo store in Demo Mode — with server-side filters for
 * action, actor, date range, and free text.
 */
export default function AdminAuditLogPage() {
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [actionFilter, setActionFilter] = React.useState("all");
  const [actorFilter, setActorFilter] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = React.useMemo(() => {
    const params = new URLSearchParams();
    if (actionFilter !== "all") params.set("action", actionFilter);
    if (actorFilter.trim()) params.set("actor", actorFilter.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    const qs = params.toString();
    return `/api/admin/audit-logs${qs ? `?${qs}` : ""}`;
  }, [actionFilter, actorFilter, from, to, debouncedSearch]);

  const { data, error, loading, reload } = useAdminFetch<AuditResponse>(query);
  const entries = data?.entries ?? [];

  const actions = React.useMemo(
    () => Array.from(new Set(entries.map((e) => e.action))).sort(),
    [entries]
  );

  return (
    <div className="space-y-6 pb-14">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">
            Platform Audit Log
          </h1>
          <span className="demo-badge">Security Logs</span>
        </div>
        <p className="mt-1 text-14 text-black-300">
          The real audit trail: entries written by admin API routes
          (user suspend/activate, settings changes, bootstrap) into the
          audit_logs table — not sample data.
        </p>
      </div>

      {data && <ModeNote mode={data.mode} />}
      {loading && <LoadingState label="Loading audit logs…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && (
        <>
          {/* Filters */}
          <div className="glass-card p-4 flex flex-col xl:flex-row gap-3 xl:items-center">
            <div className="relative w-full xl:w-72">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-black-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search actor, resource, details…"
                className="input-field pl-10 py-2.5 text-13"
              />
            </div>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="rounded-xl border border-black-600 bg-black-800 px-3 py-2 text-13 text-white focus:outline-none focus:border-purple-500"
              aria-label="Filter by action"
            >
              <option value="all">All actions</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              placeholder="Actor contains…"
              className="input-field py-2.5 text-13 xl:w-48"
              aria-label="Filter by actor"
            />
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="input-field py-2.5 text-13"
                aria-label="From date"
              />
              <span className="text-black-500">→</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="input-field py-2.5 text-13"
                aria-label="To date"
              />
            </div>
          </div>

          {entries.length === 0 ? (
            <EmptyStateBox
              title="No audit entries"
              message="No audit entries match the current filters. Security-sensitive admin actions (user status changes, settings updates, emergency controls) are recorded here as they happen."
            />
          ) : (
            <div className="glass-card p-6 overflow-x-auto">
              <table className="w-full text-13">
                <thead>
                  <tr className="text-left text-11 uppercase tracking-wider text-black-500 border-b border-black-700/60">
                    <th className="py-2 pr-4 font-semibold">Timestamp</th>
                    <th className="py-2 pr-4 font-semibold">Actor</th>
                    <th className="py-2 pr-4 font-semibold">Action</th>
                    <th className="py-2 pr-4 font-semibold">Resource</th>
                    <th className="py-2 font-semibold">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} className="border-b border-black-800/60">
                      <td className="py-2.5 pr-4 text-black-300 whitespace-nowrap">
                        {fmtDateTime(entry.created_at)}
                      </td>
                      <td className="py-2.5 pr-4 text-black-200">{entry.actor}</td>
                      <td className="py-2.5 pr-4">
                        <span className="text-11 font-bold uppercase tracking-wider text-rose-300 border border-rose-500/30 rounded-full px-2 py-0.5">
                          {entry.action}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-black-300 font-mono text-12">
                        {entry.resource ?? "—"}
                      </td>
                      <td className="py-2.5 text-black-300">{entry.details || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
