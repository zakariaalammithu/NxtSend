"use client";

/** Integration detail — Overview tab: identity, status truth, completeness. */

import * as React from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { fmtDateTime } from "../AdminBits";
import { CopyButton } from "../CopyButton";
import type { HubDetailResponse, HubStatusRefreshResult } from "./hub-api";
import { refreshHubStatus } from "./hub-api";
import { HUB_STATUS_META, metaLimitations } from "./hub-ui";
import { HubCopyPackage } from "./HubCopyPackage";
import {
  ChecklistProgress,
  ErrorNote,
  FieldRow,
  IntegrationStatusBadge,
  SectionCard,
  WarningNote,
} from "./HubBits";

export function OverviewTab({
  detail,
  mode,
  vaultConfigured,
}: {
  detail: HubDetailResponse;
  mode: "demo" | "supabase";
  vaultConfigured: boolean;
}) {
  const { integration } = detail;
  const statusMeta = HUB_STATUS_META[integration.status];
  const limitations = metaLimitations(integration.metadata);
  const [refresh, setRefresh] = React.useState<HubStatusRefreshResult | null>(
    null
  );
  const [refreshError, setRefreshError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const credByStatus = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of detail.credentials) {
      counts[c.status] = (counts[c.status] ?? 0) + 1;
    }
    return counts;
  }, [detail.credentials]);

  const doRefresh = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      setRefresh(await refreshHubStatus(integration.slug));
    } catch (err) {
      setRefreshError(
        err instanceof Error ? err.message : "Refresh failed."
      );
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      {mode === "supabase" && !vaultConfigured && (
        <WarningNote>
          The credential vault key (INTEGRATION_HUB_ENCRYPTION_KEY) is not
          configured on the server, so credential storage and disclosure are
          unavailable until it is set.
        </WarningNote>
      )}

      <SectionCard title="Summary">
        <p className="text-14 whitespace-pre-wrap text-black-200">
          {integration.summary || "No summary recorded yet."}
        </p>
        <dl className="mt-4 divide-y divide-black-700/60">
          <FieldRow label="Status">
            <span className="inline-flex flex-wrap items-center gap-2">
              <IntegrationStatusBadge status={integration.status} />
              <span className="text-12 text-black-400">{statusMeta.hint}</span>
            </span>
          </FieldRow>
          <FieldRow label="External status note">
            {integration.external_status_note ? (
              <span>
                {integration.external_status_note}{" "}
                <span className="text-12 text-black-500">
                  (recorded by an admin — not a live feed)
                </span>
              </span>
            ) : (
              "—"
            )}
          </FieldRow>
          <FieldRow label="Vendor">{integration.vendor ?? "—"}</FieldRow>
          <FieldRow label="Category">{integration.category}</FieldRow>
          <FieldRow label="Slug">
            <CopyButton text={integration.slug} label={integration.slug} />
          </FieldRow>
          {integration.website_url && (
            <FieldRow label="Website">
              <ExternalValue url={integration.website_url} />
            </FieldRow>
          )}
          {integration.docs_url && (
            <FieldRow label="Documentation">
              <ExternalValue url={integration.docs_url} />
            </FieldRow>
          )}
          {integration.review_portal_url && (
            <FieldRow label="Review portal">
              <ExternalValue url={integration.review_portal_url} />
            </FieldRow>
          )}
          {integration.support_email && (
            <FieldRow label="Support email">
              <CopyButton
                text={integration.support_email}
                label={integration.support_email}
              />
            </FieldRow>
          )}
          <FieldRow label="Last updated">
            {fmtDateTime(integration.updated_at)}
            {integration.updated_by ? ` by ${integration.updated_by}` : ""}
          </FieldRow>
        </dl>
      </SectionCard>

      <SectionCard
        title="Completeness"
        description="Computed from the stored records — saving configuration never marks anything verified or live by itself."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2 text-13 text-black-300">
            <p>
              Credentials stored:{" "}
              <strong className="text-white">{detail.credentials.length}</strong>
              {detail.credentials.length > 0 && (
                <span className="text-black-400">
                  {" "}
                  (
                  {Object.entries(credByStatus)
                    .map(([s, n]) => `${n} ${s.replace(/_/g, " ")}`)
                    .join(", ")}
                  )
                </span>
              )}
            </p>
            <p>
              Documents:{" "}
              <strong className="text-white">{detail.documents.length}</strong>
            </p>
            <p>
              Test accounts:{" "}
              <strong className="text-white">
                {detail.test_accounts.length}
              </strong>
            </p>
          </div>
          <ChecklistProgress
            done={detail.checklist_rollup.done}
            total={detail.checklist_rollup.total}
            percent={detail.checklist_rollup.percent_done}
          />
        </div>
        {limitations.length > 0 && (
          <div className="mt-5">
            <h4 className="text-13 font-medium text-black-200">
              Known limitations
            </h4>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-13 text-black-400">
              {limitations.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Integration package"
        description="One-click copy of this integration's endpoints, scopes, tools and notes — generated from these records."
      >
        <HubCopyPackage
          slug={integration.slug}
          credentials={detail.credentials}
        />
      </SectionCard>

      <SectionCard
        title="Status refresh"
        description="Recomputes local facts (expiry, checklist rollup, vault configuration). There is no external status feed and refresh never changes the stored status."
        action={
          <button
            type="button"
            onClick={doRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-black-600 bg-black-800 px-3.5 py-2 text-13 font-medium text-black-200 transition-colors hover:text-white disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            {refreshing ? "Refreshing…" : "Refresh local status"}
          </button>
        }
      >
        {refreshError && <ErrorNote>{refreshError}</ErrorNote>}
        {refresh ? (
          <dl className="divide-y divide-black-700/60">
            <FieldRow label="Stored status">{refresh.status}</FieldRow>
            <FieldRow label="Vault configured">
              {refresh.vault_configured ? "Yes" : "No"}
            </FieldRow>
            <FieldRow label="Credentials">{refresh.credential_count}</FieldRow>
            <FieldRow label="Expired credentials">
              {refresh.expired_credential_ids.length}
            </FieldRow>
            <FieldRow label="Checklist">
              {refresh.checklist.done}/{refresh.checklist.total} done ·{" "}
              {refresh.checklist.percent_done}%
            </FieldRow>
            <FieldRow label="Note">{refresh.note}</FieldRow>
          </dl>
        ) : (
          <p className="text-13 text-black-400">
            Not refreshed yet in this session.
          </p>
        )}
      </SectionCard>
    </div>
  );
}

function ExternalValue({ url }: { url: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 break-all text-rose-300 underline-offset-2 hover:underline"
      >
        {url}
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
      </a>
      <CopyButton text={url} />
    </span>
  );
}
