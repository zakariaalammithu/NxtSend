"use client";

/**
 * Shared monitoring UI for the admin provider-monitoring pages
 * (Wave 2, Phase 2): the overview, the per-provider detail and the
 * per-group pages all render from GET
 * /api/admin/integrations/monitoring. Imported by the group pages —
 * it lives next to them because the shared components directory is
 * outside this wave's file set.
 *
 * Every number renders from the API response. Null means unknown
 * (the source table could not be read) and renders as "Unknown",
 * never as 0. Counts that are not tracked for a provider (no audit
 * prefix, no webhook outbox) render as "Not recorded".
 */

import * as React from "react";
import Link from "next/link";
import {
  AdminPageHeader,
  EmptyStateBox,
  ErrorState,
  LoadingState,
  fmtDateTime,
  useAdminFetch,
} from "@/components/admin/AdminBits";
import type {
  ProviderMonitoringDetail,
  ProviderMonitoringRow,
} from "@/lib/admin/integration-monitoring";
import { PROVIDER_GROUPS } from "@/lib/admin/integration-monitoring";

export interface MonitoringOverviewResponse {
  mode: string;
  providers: ProviderMonitoringRow[];
  totals: {
    providers: number;
    disabled: number;
    connectedWorkspaces: number;
    errorConnections: number;
    apiErrors24h: number;
    apiErrors7d: number;
    deadDeliveries: number;
    syncJobsFailed7d: number;
  };
  disabledFlagsUnknown: boolean;
  unknownTables: string[];
  checkedAt: string;
  note?: string;
}

export type MonitoringDetailResponse = { mode: string; note?: string } & ProviderMonitoringDetail;

export function fmtUnknown(value: number | null): string {
  return value === null ? "Unknown" : String(value);
}

export function providerHealth(row: ProviderMonitoringRow): {
  label: string;
  className: string;
} {
  if (row.disabled) {
    return {
      label: "Disabled by admin",
      className: "text-rose-300 border-rose-500/40 bg-rose-950/30",
    };
  }
  if (row.errorConnections > 0) {
    return {
      label: "Connection errors",
      className: "text-rose-300 border-rose-500/40 bg-rose-950/30",
    };
  }
  if (row.connectedWorkspaces > 0) {
    return {
      label: "Connected",
      className: "text-emerald-300 border-emerald-500/40 bg-emerald-950/30",
    };
  }
  if (row.connectionCount > 0) {
    return {
      label: "Stored, not connected",
      className: "text-yellow-300 border-yellow-500/40 bg-yellow-950/30",
    };
  }
  return {
    label: "Not connected",
    className: "text-black-300 border-black-600 bg-black-800/60",
  };
}

export function ProviderHealthBadge({ row }: { row: ProviderMonitoringRow }) {
  const health = providerHealth(row);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-11 font-semibold whitespace-nowrap ${health.className}`}
    >
      {health.label}
    </span>
  );
}

export function DisableToggle({
  providerId,
  providerName,
  disabled,
  reason,
  onChanged,
}: {
  providerId: string;
  providerName: string;
  disabled: boolean;
  reason: string | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const toggle = async () => {
    const next = !disabled;
    const confirmed = window.confirm(
      next
        ? `Disable ${providerName}? New connections and calls for this provider will be refused once enforcement is wired (see the note on this page). Existing stored connections are not deleted.`
        : `Re-enable ${providerName}?`
    );
    if (!confirmed) return;
    const toggleReason = next
      ? window.prompt("Reason for disabling (shown to admins):", reason ?? "") ?? ""
      : "";
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/integrations/monitoring/${encodeURIComponent(providerId)}/disable`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ disabled: next, reason: toggleReason || null }),
        }
      );
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string" ? body.error : `Request failed (${res.status})`
        );
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Toggle failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`rounded-xl px-3 py-1.5 text-12 font-semibold transition-colors disabled:opacity-50 ${
          disabled
            ? "bg-emerald-600 text-white hover:bg-emerald-500"
            : "bg-rose-600 text-white hover:bg-rose-500"
        }`}
      >
        {busy ? "Saving…" : disabled ? "Re-enable provider" : "Disable provider"}
      </button>
      {disabled && reason && (
        <span className="text-11 text-black-400">Reason: {reason}</span>
      )}
      {error && <span className="text-11 text-rose-300">{error}</span>}
    </div>
  );
}

function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-black-700/60">
      <table className="w-full min-w-[880px] text-left text-13">
        <thead>
          <tr className="border-b border-black-700/60 text-12 text-black-400">
            <th className="px-4 py-3 font-medium">Provider</th>
            <th className="px-4 py-3 font-medium">Health</th>
            <th className="px-4 py-3 font-medium">Connected workspaces</th>
            <th className="px-4 py-3 font-medium">API errors 24h / 7d</th>
            <th className="px-4 py-3 font-medium">Dead deliveries</th>
            <th className="px-4 py-3 font-medium">Failed syncs 7d</th>
            <th className="px-4 py-3 font-medium">Usage events 7d</th>
            <th className="px-4 py-3 font-medium">Disabled</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function ProviderTable({ rows }: { rows: ProviderMonitoringRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyStateBox
        title="No providers match"
        message="No provider matches the current search and filters."
      />
    );
  }
  return (
    <TableShell>
      {rows.map((row) => (
        <tr key={row.id} className="border-b border-black-800/60 last:border-0">
          <td className="px-4 py-3">
            <Link
              href={`/admin/integrations/monitoring/${row.id}`}
              className="font-semibold text-white underline-offset-2 hover:underline"
            >
              {row.name}
            </Link>
            <p className="text-11 text-black-400">
              {row.category} · {row.authType}
              {row.auditNote ? ` · ${row.auditNote}` : ""}
            </p>
          </td>
          <td className="px-4 py-3">
            <ProviderHealthBadge row={row} />
          </td>
          <td className="px-4 py-3 text-black-200">
            {row.connectionCount === 0 && row.connectedWorkspaces === 0
              ? "0"
              : `${row.connectedWorkspaces} of ${row.connectionCount} stored`}
          </td>
          <td className="px-4 py-3 text-black-200">
            {row.auditTracked
              ? `${fmtUnknown(row.apiErrors24h)} / ${fmtUnknown(row.apiErrors7d)}`
              : "Not recorded"}
          </td>
          <td className="px-4 py-3 text-black-200">
            {row.webhookTracked
              ? fmtUnknown(row.deliveryCounts?.dead ?? null)
              : "Not recorded"}
          </td>
          <td className="px-4 py-3 text-black-200">
            {fmtUnknown(row.syncJobs7d?.failed ?? null)}
          </td>
          <td className="px-4 py-3 text-black-200">
            {row.usage7d === null
              ? "Unknown"
              : `${row.usage7d.events} events · ${row.usage7d.credits} credits`}
          </td>
          <td className="px-4 py-3 text-black-200">
            {row.disabled ? "Yes" : "No"}
          </td>
        </tr>
      ))}
    </TableShell>
  );
}

export function UnknownTablesNote({
  unknownTables,
  disabledFlagsUnknown,
}: {
  unknownTables: string[];
  disabledFlagsUnknown: boolean;
}) {
  if (unknownTables.length === 0 && !disabledFlagsUnknown) return null;
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 px-4 py-3 text-13 text-amber-300">
      {unknownTables.length > 0 && (
        <p>
          These tables could not be read, so their numbers show as
          &ldquo;Unknown&rdquo; instead of zero: {unknownTables.join(", ")}. The
          migrations may not be applied to this project yet.
        </p>
      )}
      {disabledFlagsUnknown && (
        <p className="mt-1">
          The provider disable-flag table could not be read (migration 038
          not applied) — the disable switch is unavailable until it is.
        </p>
      )}
    </div>
  );
}

/** Shared fetch + filter shell used by the overview and group pages. */
export function useMonitoringOverview() {
  return useAdminFetch<MonitoringOverviewResponse>(
    "/api/admin/integrations/monitoring"
  );
}

export function GroupMonitoringPage({ slug }: { slug: string }) {
  const group = PROVIDER_GROUPS.find((g) => g.slug === slug) ?? null;
  const { data, error, loading, reload } = useMonitoringOverview();
  const [query, setQuery] = React.useState("");

  if (!group) {
    return (
      <div>
        <AdminPageHeader title="Unknown provider group" description="" />
        <EmptyStateBox
          title="Unknown group"
          message={`No provider group matches “${slug}”.`}
        />
      </div>
    );
  }

  const rows = (data?.providers ?? []).filter((p) => p.category === group.id);
  const q = query.trim().toLowerCase();
  const visible = q
    ? rows.filter((p) => `${p.name} ${p.id}`.toLowerCase().includes(q))
    : rows;

  return (
    <div className="space-y-6 pb-14">
      <AdminPageHeader title={`${group.label} — provider monitoring`} description={group.description} />
      <p className="text-13 text-black-400">
        <Link href="/admin/integrations/monitoring" className="underline underline-offset-2 hover:text-white">
          All providers
        </Link>
        {" · "}Super-admin only. Counts come from stored connections, sync
        jobs, usage and (where recorded) audit logs and webhook deliveries.
        <button
          type="button"
          onClick={reload}
          className="ml-2 underline underline-offset-2 hover:text-white"
        >
          Refresh
        </button>
      </p>
      {data && (
        <UnknownTablesNote
          unknownTables={data.unknownTables}
          disabledFlagsUnknown={data.disabledFlagsUnknown}
        />
      )}
      <div className="relative min-w-56 flex-1 sm:max-w-sm">
        <input
          className="input-field"
          placeholder={`Search ${group.label} providers…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={`Search ${group.label} providers`}
        />
      </div>
      {loading ? (
        <LoadingState label={`Loading ${group.label} providers…`} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <ProviderTable rows={visible} />
      )}
      {data && (
        <p className="text-12 text-black-500">
          Last checked {fmtDateTime(data.checkedAt)} · {visible.length} of{" "}
          {rows.length} {group.label} provider(s) shown.
        </p>
      )}
    </div>
  );
}
