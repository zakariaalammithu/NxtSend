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
import type { AdminCampaignRow } from "@/lib/admin/platform-server";

interface CampaignsResponse {
  mode: string;
  campaigns: AdminCampaignRow[];
}

/**
 * Admin → Campaigns. Platform-wide, READ-ONLY inspection across all
 * workspaces (each row labelled with its tenant). Status changes stay
 * with the workspace owner in the user dashboard — admins inspect
 * here, they do not reach into tenant workspaces from this page.
 */
export default function AdminCampaignsPage() {
  const { data, error, loading, reload } = useAdminFetch<CampaignsResponse>(
    "/api/admin/campaigns"
  );
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");

  const campaigns = React.useMemo(() => {
    const all = data?.campaigns ?? [];
    const q = search.trim().toLowerCase();
    return all.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (
        q &&
        !`${c.name} ${c.workspace_name}`.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [data, search, statusFilter]);

  return (
    <div className="space-y-6 pb-14">
      <AdminPageHeader
        title="Campaigns"
        description="Every campaign on the platform, labelled by workspace. Read-only inspection for support and governance — lifecycle actions belong to each workspace's own dashboard."
      />

      {data && <ModeNote mode={data.mode} />}
      {loading && <LoadingState label="Loading campaigns…" />}
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
                placeholder="Search campaign or workspace…"
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
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {campaigns.length === 0 ? (
            <EmptyStateBox
              title="No campaigns"
              message="No campaigns match the current filters (or none exist yet on the platform)."
            />
          ) : (
            <div className="glass-card p-6 overflow-x-auto">
              <table className="w-full text-13">
                <thead>
                  <tr className="text-left text-11 uppercase tracking-wider text-black-500 border-b border-black-700/60">
                    <th className="py-2 pr-4 font-semibold">Campaign</th>
                    <th className="py-2 pr-4 font-semibold">Workspace</th>
                    <th className="py-2 pr-4 font-semibold">Type</th>
                    <th className="py-2 pr-4 font-semibold">Status</th>
                    <th className="py-2 font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id} className="border-b border-black-800/60">
                      <td className="py-2.5 pr-4 text-black-100 font-medium">{c.name}</td>
                      <td className="py-2.5 pr-4 text-black-300">{c.workspace_name}</td>
                      <td className="py-2.5 pr-4 text-black-300 capitalize">
                        {c.type.replace(/_/g, " ")}
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge
                          variant={
                            c.status === "active"
                              ? "green"
                              : c.status === "paused"
                                ? "yellow"
                                : c.status === "archived"
                                  ? "gray"
                                  : "blue"
                          }
                        >
                          {c.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-black-300 whitespace-nowrap">
                        {fmtDateTime(c.created_at)}
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
