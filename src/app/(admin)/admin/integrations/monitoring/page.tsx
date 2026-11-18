"use client";

/**
 * Provider monitoring — overview (Wave 2, Phase 2, super-admin only).
 *
 * One row per provider from GET /api/admin/integrations/monitoring:
 * all 69 registry providers (5 live platforms + 61 Milestone 2
 * adapters + 3 Category J adapters), with per-provider health from
 * stored connections, API errors from audit logs (last 24h / 7d,
 * only where a real audit prefix exists), dead webhook deliveries,
 * failed sync jobs and usage — every number from a real table read,
 * "Unknown" / "Not recorded" where there is no data. The disable
 * switch lives on the per-provider detail page.
 */

import * as React from "react";
import Link from "next/link";
import {
  AdminPageHeader,
  EmptyStateBox,
  ErrorState,
  LoadingState,
  fmtDateTime,
} from "@/components/admin/AdminBits";
import { PROVIDER_GROUPS } from "@/lib/admin/integration-monitoring";
import {
  ProviderTable,
  UnknownTablesNote,
  useMonitoringOverview,
} from "./monitoring-ui";

export default function ProviderMonitoringOverviewPage() {
  const { data, error, loading, reload } = useMonitoringOverview();
  const [query, setQuery] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [onlyIssues, setOnlyIssues] = React.useState(false);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.providers ?? []).filter((row) => {
      if (categoryFilter !== "all" && row.category !== categoryFilter) return false;
      if (
        onlyIssues &&
        row.errorConnections === 0 &&
        (row.apiErrors24h ?? 0) === 0 &&
        (row.deliveryCounts?.dead ?? 0) === 0 &&
        (row.syncJobs7d?.failed ?? 0) === 0 &&
        !row.disabled
      ) {
        return false;
      }
      if (q && !`${row.name} ${row.id} ${row.category}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [data, query, categoryFilter, onlyIssues]);

  return (
    <div className="space-y-6 pb-14">
      <AdminPageHeader
        title="Provider monitoring"
        description="Every integration provider in the registry — health, connected workspaces, API errors, webhook deliveries, sync jobs and usage, platform-wide. Super-admin only; no credentials, tokens or key material are ever shown here."
      />
      {data?.note && <p className="text-13 text-black-300 leading-relaxed">{data.note}</p>}
      {data && (
        <UnknownTablesNote
          unknownTables={data.unknownTables}
          disabledFlagsUnknown={data.disabledFlagsUnknown}
        />
      )}

      {loading ? (
        <LoadingState label="Loading provider monitoring…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? null : (
        <>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Providers" value={String(data.totals.providers)} sub="in the registry" />
            <Stat
              label="Connected workspaces"
              value={String(data.totals.connectedWorkspaces)}
              sub="distinct workspaces with a connected stored connection"
            />
            <Stat
              label="API errors (24h / 7d)"
              value={`${data.totals.apiErrors24h} / ${data.totals.apiErrors7d}`}
              sub="audit-log entries mentioning a failure — tracked providers only"
            />
            <Stat
              label="Dead deliveries · failed syncs 7d"
              value={`${data.totals.deadDeliveries} · ${data.totals.syncJobsFailed7d}`}
              sub="webhook outbox dead-letters · failed sync jobs"
            />
          </dl>
          {data.totals.disabled > 0 && (
            <p className="rounded-xl border border-rose-500/40 bg-rose-950/20 px-4 py-3 text-13 text-rose-300">
              {data.totals.disabled} provider(s) are currently disabled by an
              admin. Disabled providers refuse new connections once
              enforcement is wired (see the note on a provider&apos;s detail
              page).
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <input
              className="input-field min-w-56 flex-1 sm:max-w-sm"
              placeholder="Search providers…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search providers"
            />
            <select
              className="input-field max-w-52"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filter by category"
            >
              <option value="all">All categories</option>
              {PROVIDER_GROUPS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-2 text-13 text-black-300">
              <input
                type="checkbox"
                checked={onlyIssues}
                onChange={(e) => setOnlyIssues(e.target.checked)}
              />
              Issues / disabled only
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {PROVIDER_GROUPS.map((g) => (
              <Link
                key={g.slug}
                href={`/admin/integrations/${g.slug}`}
                className="rounded-full border border-black-600 bg-black-800 px-3 py-1.5 text-12 font-medium text-black-200 transition-colors hover:text-white"
              >
                {g.label} ({g.providers.length})
              </Link>
            ))}
          </div>

          {visible.length === 0 ? (
            <EmptyStateBox
              title="No providers match"
              message="No provider matches the current search and filters."
            />
          ) : (
            <ProviderTable rows={visible} />
          )}
          <p className="text-12 text-black-500">
            Last checked {fmtDateTime(data.checkedAt)} · {visible.length} of{" "}
            {data.providers.length} providers shown. API error counts cover
            only the providers that write audit rows (Muse, Zapier, n8n,
            Make, Pabbly, Albato, Activepieces); ChatGPT and Claude share
            the muse.tool.* prefix and are reported on the Muse.ai page.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="glass-card p-4">
      <dt className="text-12 text-black-400">{label}</dt>
      <dd className="mt-0.5 text-20 font-bold text-white">{value}</dd>
      <dd className="mt-0.5 text-11 text-black-400">{sub}</dd>
    </div>
  );
}
