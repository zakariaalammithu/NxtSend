"use client";

import * as React from "react";
import Link from "next/link";
import { Target, Plus, Search, MoreVertical, Play, Pause, Copy, Archive, Trash2, Edit, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { DemoBanner, Badge } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { getCampaignsRepository, resolveWorkspaceId } from "@/lib/data";
import type { Campaign, CampaignStatus, CampaignType } from "@/types";

export default function CampaignsListPage() {
  const campaignsRepo = React.useMemo(() => getCampaignsRepository(), []);
  const isDemo = campaignsRepo.mode === "demo";

  const [workspaceId, setWorkspaceId] = React.useState<string | null>(null);
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");
  const [actionMenuOpenId, setActionMenuOpenId] = React.useState<string | null>(null);

  // Campaigns load through the repository layer (Supabase when configured,
  // labelled demo store otherwise) and every lifecycle action persists
  // through the same layer.
  const refreshCampaigns = React.useCallback(
    async (ws: string) => {
      const rows = await campaignsRepo.listCampaigns(ws);
      setCampaigns(rows);
    },
    [campaignsRepo]
  );

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ws = await resolveWorkspaceId();
        if (cancelled) return;
        setWorkspaceId(ws);
        if (ws) {
          const rows = await campaignsRepo.listCampaigns(ws);
          if (!cancelled) setCampaigns(rows);
        }
      } catch (err) {
        if (!cancelled) {
          setActionError(
            err instanceof Error ? err.message : "Failed to load campaigns."
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignsRepo]);

  // Filtered campaigns
  const filteredCampaigns = campaigns.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    const matchesType = typeFilter === "all" || c.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  // Action handlers — all persist through the repository; the list is
  // refreshed from the store afterwards so what you see is what is saved.
  const runAction = async (fn: () => Promise<void>) => {
    setActionError(null);
    setActionMenuOpenId(null);
    try {
      await fn();
      if (workspaceId) await refreshCampaigns(workspaceId);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "That action failed. Please try again."
      );
    }
  };

  const handleToggleStatus = (c: Campaign) => {
    if (!workspaceId) return;
    const nextStatus: CampaignStatus = c.status === "active" ? "paused" : "active";
    void runAction(() =>
      campaignsRepo.setCampaignStatus(workspaceId, c.id, nextStatus)
    );
  };

  const handleDuplicate = (c: Campaign) => {
    if (!workspaceId) return;
    void runAction(async () => {
      await campaignsRepo.duplicateCampaign(workspaceId, c.id);
    });
  };

  const handleArchive = (id: string) => {
    if (!workspaceId) return;
    void runAction(() =>
      campaignsRepo.setCampaignStatus(workspaceId, id, "archived")
    );
  };

  const handleDelete = (id: string) => {
    if (!workspaceId) return;
    void runAction(() => campaignsRepo.deleteCampaign(workspaceId, id));
  };

  const getTypeBadge = (type: CampaignType) => {
    switch (type) {
      case "linkedin":
        return <Badge variant="blue">LinkedIn</Badge>;
      case "email":
        return <Badge variant="purple">Email</Badge>;
      case "mixed":
        return <Badge variant="orange">Mixed Multi</Badge>;
      default:
        return <Badge variant="gray">{type}</Badge>;
    }
  };

  const getStatusBadge = (status: CampaignStatus) => {
    switch (status) {
      case "active":
        return <Badge variant="green">Active</Badge>;
      case "paused":
        return <Badge variant="yellow">Paused</Badge>;
      case "draft":
        return <Badge variant="gray">Draft</Badge>;
      case "archived":
        return <Badge variant="red">Archived</Badge>;
      default:
        return <Badge variant="gray">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Demo Banner */}
      <DemoBanner feature="Campaign Engine" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">
              Campaigns
            </h1>
            {isDemo && <span className="demo-badge">Demo Data</span>}
          </div>
          <p className="mt-1 text-14 text-black-300">
            Create and monitor automated sequences across LinkedIn & cold emails.
          </p>
        </div>

        <Link
          href="/dashboard/campaigns/new"
          className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-2.5 text-14 font-semibold text-white shadow-glow-purple transition-all self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>New Campaign</span>
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-card p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-black-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search campaigns..."
            className="input-field pl-10 py-2.5 text-13"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Status filter */}
          <div className="flex items-center gap-2 flex-1 md:flex-initial">
            <span className="text-12 text-black-400 font-medium whitespace-nowrap">
              Status:
            </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-black-600 bg-black-800 px-3 py-2 text-13 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {/* Type filter */}
          <div className="flex items-center gap-2 flex-1 md:flex-initial">
            <span className="text-12 text-black-400 font-medium whitespace-nowrap">
              Type:
            </span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-xl border border-black-600 bg-black-800 px-3 py-2 text-13 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="all">All</option>
              <option value="mixed">Mixed</option>
              <option value="linkedin">LinkedIn</option>
              <option value="email">Email</option>
            </select>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-950/20 px-5 py-3 text-13 text-rose-200">
          {actionError}
        </div>
      )}

      {/* Campaigns Table */}
      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-13 text-black-400">
            Loading campaigns…
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-black-800 border border-black-700 text-black-400">
              <Target className="h-6 w-6" />
            </div>
            <h3 className="text-16 font-semibold text-white">No campaigns found</h3>
            <p className="text-13 text-black-400 max-w-sm mx-auto">
              No campaigns match your selected search or filter criteria. Try resetting the filters or create a new campaign.
            </p>
            <div className="pt-2">
              <Link
                href="/dashboard/campaigns/new"
                className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-2 text-13 font-semibold text-white transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Create Campaign</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-13 border-collapse">
              <thead>
                <tr className="border-b border-black-700/80 bg-black-800/40 text-11 font-semibold uppercase tracking-wider text-black-400">
                  <th className="py-3.5 px-5">Campaign Name</th>
                  <th className="py-3.5 px-4">Type</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Leads</th>
                  <th className="py-3.5 px-4">Messages</th>
                  <th className="py-3.5 px-4">Reply Rate</th>
                  <th className="py-3.5 px-4">Last Updated</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black-700/50">
                {filteredCampaigns.map((camp) => (
                  <tr key={camp.id} className="table-row-hover group">
                    {/* Name */}
                    <td className="py-4 px-5">
                      <Link
                        href={`/dashboard/campaigns/${camp.id}`}
                        className="font-semibold text-white hover:text-purple-400 transition-colors flex items-center gap-2"
                      >
                        <span>{camp.name}</span>
                        <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 text-purple-400 transition-opacity" />
                      </Link>
                    </td>

                    {/* Type */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      {getTypeBadge(camp.type)}
                    </td>

                    {/* Status */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      {getStatusBadge(camp.status)}
                    </td>

                    {/* Leads (mock metrics) */}
                    <td className="py-4 px-4 text-black-200">
                      {camp.status === "draft" ? "0" : "84"}
                    </td>

                    {/* Messages */}
                    <td className="py-4 px-4 text-black-200">
                      {camp.status === "draft" ? "0" : "156"}
                    </td>

                    {/* Reply Rate */}
                    <td className="py-4 px-4 font-medium text-emerald-400">
                      {camp.status === "draft" ? "—" : "18.4%"}
                    </td>

                    {/* Last Updated */}
                    <td className="py-4 px-4 text-black-400 whitespace-nowrap text-12">
                      {formatDate(camp.updated_at, "short")}
                    </td>

                    {/* Actions Menu */}
                    <td className="py-4 px-5 text-right relative">
                      <div className="inline-block text-left">
                        <button
                          type="button"
                          onClick={() =>
                            setActionMenuOpenId(actionMenuOpenId === camp.id ? null : camp.id)
                          }
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-black-400 hover:text-white hover:bg-black-700/60 transition-colors"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>

                        {actionMenuOpenId === camp.id && (
                          <div className="absolute right-5 top-12 z-30 w-44 rounded-xl bg-black-800 border border-black-600 p-1.5 shadow-2xl text-12 text-left animate-fade-in">
                            <Link
                              href={`/dashboard/campaigns/${camp.id}`}
                              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-black-200 hover:text-white hover:bg-black-700/50"
                            >
                              <Edit className="h-3.5 w-3.5" />
                              <span>Edit Details</span>
                            </Link>

                            <button
                              type="button"
                              onClick={() => handleToggleStatus(camp)}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-black-200 hover:text-white hover:bg-black-700/50"
                            >
                              {camp.status === "active" ? (
                                <>
                                  <Pause className="h-3.5 w-3.5 text-yellow-400" />
                                  <span>Pause Campaign</span>
                                </>
                              ) : (
                                <>
                                  <Play className="h-3.5 w-3.5 text-emerald-400" />
                                  <span>Resume Campaign</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDuplicate(camp)}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-black-200 hover:text-white hover:bg-black-700/50"
                            >
                              <Copy className="h-3.5 w-3.5 text-blue-400" />
                              <span>Duplicate</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleArchive(camp.id)}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-black-200 hover:text-white hover:bg-black-700/50"
                            >
                              <Archive className="h-3.5 w-3.5 text-orange-400" />
                              <span>Archive</span>
                            </button>

                            <div className="border-t border-black-700 my-1" />

                            <button
                              type="button"
                              onClick={() => handleDelete(camp.id)}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-rose-400 hover:bg-rose-950/30"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        <div className="flex items-center justify-between border-t border-black-700/60 p-4 text-12 text-black-400">
          <span>
            Showing <strong className="text-white">1-{filteredCampaigns.length}</strong> of{" "}
            <strong className="text-white">{filteredCampaigns.length}</strong> campaigns
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-black-800 text-black-500 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600 text-white font-semibold"
            >
              1
            </button>
            <button
              type="button"
              disabled
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-black-800 text-black-500 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
