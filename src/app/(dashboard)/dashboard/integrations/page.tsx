"use client";

import * as React from "react";
import Link from "next/link";
import {
  Puzzle,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Search,
  ExternalLink,
} from "lucide-react";
import { DemoBanner, Badge } from "@/components/ui";
import WebhookSettings from "@/components/dashboard/WebhookSettings";
import {
  INTEGRATION_ICONS,
  STATUS_BADGE_VARIANT,
} from "@/components/dashboard/IntegrationCenterBits";
import type { IntegrationStatusEntry } from "@/lib/integrations-center/types";
import { displayStatusMessage } from "@/lib/integrations-center/registry";

/**
 * Integration Center hub.
 *
 * Every card's status comes from GET /api/integrations/status, which
 * derives it server-side from the actual environment/configuration —
 * nothing on this page is hardcoded. Statuses use the exact Center
 * vocabulary; "Connected and Verified" appears only after a real
 * verification call has succeeded (Test Connection on the detail page).
 *
 * Search, category filter, connected/disconnected filter and sorting
 * are client-side views over that same status list. Sorting:
 *  - Featured: connected first, then configured, then the rest;
 *    adapters before info-only entries; name as tie-break. No
 *    "featured" flag exists in the registry data, so nothing is
 *    promoted beyond its real status.
 *  - Recently added: registry order, newest first (entries are
 *    appended to the registry as they are built).
 *  - Name A–Z.
 *
 * Status-message fix: the status service returns "Unknown
 * integration." for ids it has no derivation rule for — which now
 * includes every Milestone 2 provider (their credentials live in the
 * encrypted per-workspace connection store, not env vars, so there
 * is no env rule to derive from). displayStatusMessage (from the
 * Center registry) rewrites exactly that string to the honest
 * meaning instead of showing it to the user.
 * (src/lib/integrations-center/status.ts is owned by another worker;
 * this is a display-layer rewrite only.)
 */

interface StatusResponse {
  mode: "demo" | "supabase";
  integrations: IntegrationStatusEntry[];
}

type StatusFilter = "all" | "connected" | "not-connected";
type SortKey = "featured" | "name" | "recent";

const STATUS_RANK: Record<string, number> = {
  "Connected and Verified": 0,
  "Connected but Not Verified": 1,
  "Configuration Required": 2,
  "Not Connected": 3,
  "Demo Mode": 4,
  Error: 5,
  "Unsupported / No Documented API": 6,
};

/** The status service has no derivation rule for Milestone 2 provider ids. */
function isConnected(entry: IntegrationStatusEntry): boolean {
  return entry.status.startsWith("Connected");
}

export default function IntegrationsPage() {
  const [data, setData] = React.useState<StatusResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState("All");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [sort, setSort] = React.useState<SortKey>("featured");

  React.useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch("/api/integrations/status")
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Status request failed (HTTP ${res.status})`);
        }
        return (await res.json()) as StatusResponse;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load integration statuses.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const categories = React.useMemo(() => {
    const order: string[] = [];
    for (const entry of data?.integrations ?? []) {
      const cat = entry.descriptor.category;
      if (!order.includes(cat)) order.push(cat);
    }
    return order;
  }, [data]);

  const visible = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    const entries = (data?.integrations ?? []).map((entry, index) => ({ entry, index }));
    const filtered = entries.filter(({ entry }) => {
      if (category !== "All" && entry.descriptor.category !== category) return false;
      if (statusFilter === "connected" && !isConnected(entry)) return false;
      if (statusFilter === "not-connected" && isConnected(entry)) return false;
      if (query) {
        const haystack = [
          entry.descriptor.name,
          entry.descriptor.tagline,
          entry.descriptor.category,
          entry.descriptor.description,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
    const sorted = [...filtered];
    if (sort === "name") {
      sorted.sort((a, b) => a.entry.descriptor.name.localeCompare(b.entry.descriptor.name));
    } else if (sort === "recent") {
      sorted.sort((a, b) => b.index - a.index);
    } else {
      sorted.sort((a, b) => {
        const rank =
          (STATUS_RANK[a.entry.status] ?? 99) - (STATUS_RANK[b.entry.status] ?? 99);
        if (rank !== 0) return rank;
        const kind =
          (a.entry.descriptor.kind === "adapter" ? 0 : 1) -
          (b.entry.descriptor.kind === "adapter" ? 0 : 1);
        if (kind !== 0) return kind;
        return a.entry.descriptor.name.localeCompare(b.entry.descriptor.name);
      });
    }
    return sorted.map(({ entry }) => entry);
  }, [data, search, category, statusFilter, sort]);

  const connectedCount = (data?.integrations ?? []).filter(isConnected).length;

  return (
    <div className="space-y-7 pb-14">
      <DemoBanner feature="External Integrations" />

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">
            Integration Center
          </h1>
          {data?.mode === "demo" && <span className="demo-badge">Demo Mode</span>}
        </div>
        <p className="mt-1 text-14 text-black-300">
          Every status below is derived from the actual server configuration —
          an integration shows <strong className="text-white">Connected and Verified</strong> only
          after a real Test Connection succeeds on its detail page.
          {data && (
            <>
              {" "}
              {data.integrations.length} integrations · {connectedCount} connected.
            </>
          )}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
          <div className="space-y-2">
            <p className="text-13 text-rose-200">{error}</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="rounded-lg bg-rose-600/20 border border-rose-500/30 px-3 py-1.5 text-12 font-semibold text-rose-200 hover:bg-rose-600/40 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Search + filters + sorting */}
      {data && !error && (
        <div className="glass-card p-4 space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            <label className="relative flex-1">
              <span className="sr-only">Search integrations</span>
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-black-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search integrations by name, category or description…"
                className="w-full rounded-xl bg-black-800 border border-black-700 pl-9 pr-3 py-2.5 text-13 text-white placeholder:text-black-400 focus:outline-none focus:border-purple-500/60"
              />
            </label>
            <label className="flex items-center gap-2 text-12 text-black-300">
              Category
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded-xl bg-black-800 border border-black-700 px-3 py-2.5 text-13 text-white focus:outline-none focus:border-purple-500/60"
              >
                <option value="All">All categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-12 text-black-300">
              Status
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="rounded-xl bg-black-800 border border-black-700 px-3 py-2.5 text-13 text-white focus:outline-none focus:border-purple-500/60"
              >
                <option value="all">All statuses</option>
                <option value="connected">Connected</option>
                <option value="not-connected">Not connected</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-12 text-black-300">
              Sort
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-xl bg-black-800 border border-black-700 px-3 py-2.5 text-13 text-white focus:outline-none focus:border-purple-500/60"
              >
                <option value="featured">Featured</option>
                <option value="recent">Recently added</option>
                <option value="name">Name A–Z</option>
              </select>
            </label>
          </div>
          <p className="text-12 text-black-400" aria-live="polite">
            Showing {visible.length} of {data.integrations.length} integrations
            {search.trim() ? ` for “${search.trim()}”` : ""}
            {category !== "All" ? ` in ${category}` : ""}
            {statusFilter !== "all"
              ? statusFilter === "connected"
                ? " (connected only)"
                : " (not connected only)"
              : ""}
            .
          </p>
        </div>
      )}

      {!data && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="glass-card p-6 animate-pulse">
              <div className="h-11 w-11 rounded-2xl bg-black-700 mb-4" />
              <div className="h-4 w-2/3 rounded bg-black-700 mb-2" />
              <div className="h-3 w-full rounded bg-black-800" />
            </div>
          ))}
        </div>
      )}

      {data && !error && visible.length === 0 && (
        <div className="glass-card p-8 text-center space-y-2">
          <p className="text-15 font-semibold text-white">No integrations match these filters</p>
          <p className="text-13 text-black-300">
            Try a different search term, category or status filter.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setCategory("All");
              setStatusFilter("all");
            }}
            className="rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-2 text-13 font-semibold text-white transition-colors"
          >
            Clear filters
          </button>
        </div>
      )}

      {data && !error && visible.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visible.map((entry) => {
            const Icon = INTEGRATION_ICONS[entry.descriptor.id] ?? Puzzle;
            const configuredCount = entry.envPresence.filter((v) => v.present).length;
            const connected = isConnected(entry);
            return (
              <article
                key={entry.descriptor.id}
                className="glass-card p-6 flex flex-col justify-between transition-all hover:border-purple-500/50 group"
              >
                <Link
                  href={`/dashboard/integrations/${entry.descriptor.id}`}
                  className="block"
                >
                  <div className="flex items-start justify-between mb-4 gap-2">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-black-800 border border-black-700 text-purple-400">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="flex flex-col items-end gap-1.5">
                      <Badge variant={STATUS_BADGE_VARIANT[entry.status]} size="sm">
                        {entry.status}
                      </Badge>
                      {entry.descriptor.kind === "info" && (
                        <span
                          className="inline-flex items-center rounded-full border border-orange-500/40 bg-orange-950/30 px-2 py-0.5 text-10 font-semibold text-orange-300"
                          title={entry.descriptor.notImplementedNote ?? "Not available yet."}
                        >
                          Coming Soon
                        </span>
                      )}
                    </span>
                  </div>
                  <h3 className="text-16 font-bold text-white mb-1.5">
                    {entry.descriptor.name}
                  </h3>
                  <p className="text-12 text-black-400 mb-2">{entry.descriptor.category}</p>
                  <p className="text-13 text-black-300 leading-relaxed mb-3">
                    {entry.descriptor.tagline}
                  </p>
                  <p className="text-12 text-black-400 leading-relaxed">
                    {displayStatusMessage(entry)}
                  </p>
                </Link>
                <div className="pt-4 mt-4 border-t border-black-700/60 space-y-2">
                  {entry.envPresence.length > 0 && (
                    <div className="flex items-center justify-between text-11 text-black-400">
                      <span>Configuration:</span>
                      <span className="font-medium text-black-300">
                        {configuredCount}/{entry.envPresence.length} variables set
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-11 text-black-400">
                    <span>Last verification:</span>
                    <span className="font-medium text-black-300 inline-flex items-center gap-1">
                      {entry.lastVerification ? (
                        entry.lastVerification.ok ? (
                          <>
                            <CheckCircle2 className="h-3 w-3 text-green-400" />
                            Passed
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3 w-3 text-rose-400" />
                            Failed
                          </>
                        )
                      ) : (
                        "Never"
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <Link
                      href={`/dashboard/integrations/${entry.descriptor.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 px-3 py-1.5 text-12 font-semibold text-white transition-colors"
                    >
                      {connected ? "Configure" : "Connect"}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                    {entry.descriptor.docsUrl && (
                      <a
                        href={entry.descriptor.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-12 font-semibold text-purple-300 hover:text-white transition-colors"
                      >
                        Docs
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Outbound webhooks — real settings surface (state from the API) */}
      <div id="webhook-settings">
        <WebhookSettings />
      </div>
    </div>
  );
}
