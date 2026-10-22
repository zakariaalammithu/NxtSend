"use client";

/**
 * Audit History tab — the HUB_* entries for this integration and its
 * credentials, read through the existing admin audit-logs API (searched
 * by slug) and filtered to this integration client-side.
 *
 * Audit rows are metadata only by construction: Stage B writes label /
 * kind / environment / status facts and writes the audit row BEFORE any
 * decryption — a credential value can never appear here.
 */

import * as React from "react";
import {
  EmptyStateBox,
  ErrorState,
  LoadingState,
  fmtDateTime,
  useAdminFetch,
} from "../AdminBits";
import type { AuditEntry } from "@/lib/admin/audit-core";
import type { HubDetailResponse } from "./hub-api";
import {
  HUB_AUDIT_ACTION_LABELS,
  isHubAuditForIntegration,
} from "./hub-ui";
import { SectionCard } from "./HubBits";

export function AuditTab({ detail }: { detail: HubDetailResponse }) {
  const slug = detail.integration.slug;
  const credentialIds = React.useMemo(
    () => detail.credentials.map((c) => c.id),
    [detail.credentials]
  );
  const url = `/api/admin/audit-logs?search=${encodeURIComponent(slug)}&limit=100`;
  const { data, error, loading, reload } = useAdminFetch<{
    entries: AuditEntry[];
  }>(url, [url]);

  const entries = React.useMemo(
    () =>
      (data?.entries ?? []).filter((e) =>
        isHubAuditForIntegration(e, slug, credentialIds)
      ),
    [data, slug, credentialIds]
  );

  return (
    <SectionCard
      title="Audit history"
      description="Every Hub action on this integration — configuration changes, checklist updates and credential disclosures. Entries record metadata only (who, what, when); credential values are never written to the audit log."
      action={
        <button
          type="button"
          onClick={reload}
          className="rounded-xl border border-black-600 bg-black-800 px-3.5 py-2 text-13 font-medium text-black-200 transition-colors hover:text-white"
        >
          Refresh
        </button>
      }
    >
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : entries.length === 0 ? (
        <EmptyStateBox
          title="No audit entries yet"
          message="Actions taken on this integration in the Hub will appear here."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-13">
            <thead>
              <tr className="border-b border-black-700 text-12 tracking-wide text-black-400 uppercase">
                <th className="py-2 pr-4 font-medium">When</th>
                <th className="py-2 pr-4 font-medium">Action</th>
                <th className="py-2 pr-4 font-medium">Actor</th>
                <th className="py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black-700/60">
              {entries.map((entry) => (
                <tr key={entry.id} className="align-top">
                  <td className="py-2.5 pr-4 whitespace-nowrap text-black-400">
                    {fmtDateTime(entry.created_at)}
                  </td>
                  <td className="py-2.5 pr-4 whitespace-nowrap text-black-100">
                    {HUB_AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
                  </td>
                  <td className="py-2.5 pr-4 break-all text-black-300">
                    {entry.actor}
                  </td>
                  <td className="py-2.5 text-black-300">{entry.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
