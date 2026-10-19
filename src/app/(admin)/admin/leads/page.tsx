"use client";

import * as React from "react";
import { Search } from "lucide-react";
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
import type { AdminLeadRow } from "@/lib/admin/platform-server";

interface LeadsResponse {
  mode: string;
  leads: AdminLeadRow[];
}

/**
 * Admin → Leads. Cross-workspace, READ-ONLY lead inspection with the
 * owning workspace labelled on every row. This is a platform-admin
 * surface (admin-gated API, service role) — it never replaces the
 * workspace-scoped CRM users work in, and it offers no edit path
 * into another tenant's data.
 */
export default function AdminLeadsPage() {
  const { data, error, loading, reload } = useAdminFetch<LeadsResponse>(
    "/api/admin/leads"
  );
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");

  const leads = React.useMemo(() => {
    const all = data?.leads ?? [];
    const q = search.trim().toLowerCase();
    return all.filter((lead) => {
      if (statusFilter !== "all" && lead.status !== statusFilter) return false;
      if (
        q &&
        !`${lead.first_name ?? ""} ${lead.last_name ?? ""} ${lead.email ?? ""} ${lead.company ?? ""} ${lead.workspace_name}`
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [data, search, statusFilter]);

  const statuses = React.useMemo(
    () => Array.from(new Set((data?.leads ?? []).map((l) => l.status))).sort(),
    [data]
  );

  return (
    <div className="space-y-6 pb-14">
      <AdminPageHeader
        title="Leads"
        description="Lead records across all workspaces, tenant-labelled and read-only. Showing the most recent 200 records."
      />

      {data && <ModeNote mode={data.mode} />}
      {loading && <LoadingState label="Loading leads…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && (
        <>
          <div className="glass-card p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-black-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, company, workspace…"
                className="input-field pl-10 py-2.5 text-13"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-black-600 bg-black-800 px-3 py-2 text-13 text-white focus:outline-none focus:border-purple-500"
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {leads.length === 0 ? (
            <EmptyStateBox
              title="No leads"
              message="No lead records match the current filters (or no workspace has imported leads yet)."
            />
          ) : (
            <div className="glass-card p-6 overflow-x-auto">
              <table className="w-full text-13">
                <thead>
                  <tr className="text-left text-11 uppercase tracking-wider text-black-500 border-b border-black-700/60">
                    <th className="py-2 pr-4 font-semibold">Lead</th>
                    <th className="py-2 pr-4 font-semibold">Company</th>
                    <th className="py-2 pr-4 font-semibold">Workspace</th>
                    <th className="py-2 pr-4 font-semibold">Status</th>
                    <th className="py-2 pr-4 font-semibold">Tags</th>
                    <th className="py-2 font-semibold">Added</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id} className="border-b border-black-800/60">
                      <td className="py-2.5 pr-4 text-black-100 font-medium">
                        {[lead.first_name, lead.last_name].filter(Boolean).join(" ") ||
                          "—"}
                        {lead.email && (
                          <span className="block text-12 text-black-500">{lead.email}</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-black-300">{lead.company ?? "—"}</td>
                      <td className="py-2.5 pr-4 text-black-300">{lead.workspace_name}</td>
                      <td className="py-2.5 pr-4">
                        <Badge variant="gray">{lead.status}</Badge>
                      </td>
                      <td className="py-2.5 pr-4 text-black-300">
                        {(lead.tags ?? []).join(", ") || "—"}
                      </td>
                      <td className="py-2.5 text-black-300 whitespace-nowrap">
                        {fmtDateTime(lead.created_at)}
                      </td>
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
