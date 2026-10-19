"use client";

import * as React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui";
import {
  AdminPageHeader,
  EmptyStateBox,
  ErrorState,
  LoadingState,
} from "@/components/admin/AdminBits";
import { getCampaignsRepository, resolveWorkspaceId } from "@/lib/data";
import type { Campaign } from "@/types";

function campaignStatusVariant(status: Campaign["status"]) {
  switch (status) {
    case "active":
      return "green" as const;
    case "paused":
      return "yellow" as const;
    case "archived":
      return "gray" as const;
    default:
      return "blue" as const;
  }
}

/**
 * Admin → My Campaigns. The signed-in admin's OWN workspace campaigns
 * (workspace-scoped through the regular data layer — the same view
 * the user dashboard shows), distinct from Admin → Campaigns, which
 * is the cross-workspace platform inspection.
 */
export default function AdminMyCampaignsPage() {
  const [state, setState] = React.useState<{
    loading: boolean;
    error: string | null;
    mode: string;
    campaigns: Campaign[];
  }>({ loading: true, error: null, mode: "demo", campaigns: [] });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const workspaceId = await resolveWorkspaceId();
        if (!workspaceId) {
          if (!cancelled) {
            setState({
              loading: false,
              error: null,
              mode: "supabase",
              campaigns: [],
            });
          }
          return;
        }
        const repo = getCampaignsRepository();
        const campaigns = await repo.listCampaigns(workspaceId);
        if (!cancelled) {
          setState({ loading: false, error: null, mode: repo.mode, campaigns });
        }
      } catch (err) {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            loading: false,
            error: err instanceof Error ? err.message : "Failed to load campaigns.",
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6 pb-14">
      <AdminPageHeader
        title="My Campaigns"
        description="Campaigns in your own workspace, through the standard workspace-scoped data layer. For the cross-workspace platform view, use Admin → Campaigns."
      />

      {state.loading && <LoadingState label="Loading your campaigns…" />}
      {state.error && <ErrorState message={state.error} />}

      {!state.loading && !state.error && state.campaigns.length === 0 && (
        <EmptyStateBox
          title="No campaigns in your workspace"
          message="Create one from the user dashboard's Campaigns page — it will appear here and in the platform-wide Admin → Campaigns view."
        />
      )}

      {!state.loading && state.campaigns.length > 0 && (
        <div className="glass-card p-6 overflow-x-auto">
          <table className="w-full text-13">
            <thead>
              <tr className="text-left text-11 uppercase tracking-wider text-black-500 border-b border-black-700/60">
                <th className="py-2 pr-4 font-semibold">Campaign</th>
                <th className="py-2 pr-4 font-semibold">Type</th>
                <th className="py-2 pr-4 font-semibold">Status</th>
                <th className="py-2 font-semibold">Open</th>
              </tr>
            </thead>
            <tbody>
              {state.campaigns.map((campaign) => (
                <tr key={campaign.id} className="border-b border-black-800/60">
                  <td className="py-2.5 pr-4 text-black-100 font-medium">
                    {campaign.name}
                  </td>
                  <td className="py-2.5 pr-4 text-black-300 capitalize">
                    {campaign.type.replace(/_/g, " ")}
                  </td>
                  <td className="py-2.5 pr-4">
                    <Badge variant={campaignStatusVariant(campaign.status)}>
                      {campaign.status}
                    </Badge>
                  </td>
                  <td className="py-2.5">
                    <Link
                      href={`/dashboard/campaigns/${campaign.id}`}
                      className="text-purple-400 hover:text-purple-300 font-semibold text-12"
                    >
                      Open in dashboard →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
