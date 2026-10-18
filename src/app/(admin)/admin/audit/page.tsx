"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { MOCK_ADMIN_AUDIT_LOGS, AdminAuditLog } from "@/lib/db/mock/data";

export default function AdminAuditLogPage() {
  const [logs] = React.useState<AdminAuditLog[]>(MOCK_ADMIN_AUDIT_LOGS);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [actionFilter, setActionFilter] = React.useState<string>("all");

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.actor.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.resource.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesAction =
      actionFilter === "all" || log.action === actionFilter;

    return matchesSearch && matchesAction;
  });

  return (
    <div className="space-y-6 pb-14">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">
            Platform Audit Log
          </h1>
          <span className="demo-badge">Security Logs</span>
        </div>
        <p className="mt-1 text-14 text-black-300">
          Immutable event trails recording security actions, privilege escalations, and system mutations.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-card p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-black-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search actor, resource, details..."
            className="input-field pl-10 py-2.5 text-13"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-12 text-black-400 font-medium whitespace-nowrap">
            Action Type:
          </span>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-xl border border-black-600 bg-black-800 px-3 py-2 text-13 text-white focus:outline-none focus:border-purple-500"
          >
            <option value="all">All Actions</option>
            <option value="ROLE_CHANGE">ROLE_CHANGE</option>
            <option value="USER_SUSPEND">USER_SUSPEND</option>
            <option value="INTEGRATION_SYNC">INTEGRATION_SYNC</option>
            <option value="CAMPAIGN_LAUNCH">CAMPAIGN_LAUNCH</option>
            <option value="LEAD_IMPORT">LEAD_IMPORT</option>
            <option value="WEBHOOK_EVENT">WEBHOOK_EVENT</option>
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-13 border-collapse">
            <thead>
              <tr className="border-b border-black-700/80 bg-black-800/40 text-11 font-semibold uppercase tracking-wider text-black-400">
                <th className="py-3.5 px-5">Timestamp</th>
                <th className="py-3.5 px-4">Actor</th>
                <th className="py-3.5 px-4">Action</th>
                <th className="py-3.5 px-4">Resource Target</th>
                <th className="py-3.5 px-5">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black-700/50">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="table-row-hover">
                  <td className="py-3.5 px-5 text-12 text-black-400 font-mono whitespace-nowrap">
                    {log.timestamp}
                  </td>
                  <td className="py-3.5 px-4 font-semibold text-white whitespace-nowrap">
                    {log.actor}
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <span className="rounded-lg bg-black-800 border border-black-700 px-2.5 py-1 text-11 font-mono text-purple-300">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-12 text-black-300 whitespace-nowrap">
                    {log.resource}
                  </td>
                  <td className="py-3.5 px-5 text-black-200">
                    {log.details}
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
