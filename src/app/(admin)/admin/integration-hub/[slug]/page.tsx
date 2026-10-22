"use client";

/**
 * Integration Hub — integration detail (P7 Stage C).
 *
 * The app's first dynamic admin route. Eleven tabs (Overview ·
 * Configuration · Credentials · API Endpoints · OAuth & Permissions ·
 * Tools or Actions · Webhooks · Documentation · Terms & Privacy ·
 * Testing · Audit History), all rendered from the Stage B detail
 * aggregate — nothing is hard-coded per integration.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  ErrorState,
  LoadingState,
  ModeNote,
  useAdminFetch,
} from "@/components/admin/AdminBits";
import { cn } from "@/lib/utils";
import type {
  HubDetailResponse,
  HubOverviewResponse,
} from "@/components/admin/integration-hub/hub-api";
import {
  HUB_TABS,
  type HubTabId,
} from "@/components/admin/integration-hub/hub-ui";
import { IntegrationStatusBadge } from "@/components/admin/integration-hub/HubBits";
import { OverviewTab } from "@/components/admin/integration-hub/OverviewTab";
import { ConfigurationTab } from "@/components/admin/integration-hub/ConfigurationTab";
import { CredentialsTab } from "@/components/admin/integration-hub/CredentialsTab";
import {
  EndpointsTab,
  OAuthTab,
  TermsTab,
  ToolsTab,
  WebhooksTab,
} from "@/components/admin/integration-hub/MetadataTabs";
import { DocumentsTab } from "@/components/admin/integration-hub/DocumentsTab";
import { TestingTab } from "@/components/admin/integration-hub/TestingTab";
import { AuditTab } from "@/components/admin/integration-hub/AuditTab";

export default function IntegrationHubDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const slug = params.slug;
  const router = useRouter();
  const detailUrl = `/api/admin/integration-hub/integrations/${encodeURIComponent(slug)}`;
  const {
    data: detail,
    error,
    loading,
    reload,
  } = useAdminFetch<HubDetailResponse>(detailUrl, [detailUrl]);
  const { data: overviewData } = useAdminFetch<{
    overview: HubOverviewResponse;
  }>("/api/admin/integration-hub");
  // Fail-closed default: until the overview reports the mode, treat the
  // workspace as demo (credential writes disabled).
  const mode = overviewData?.overview.mode ?? "demo";
  const vaultConfigured = overviewData?.overview.vault_configured ?? false;

  const [tab, setTab] = React.useState<HubTabId>("overview");

  if (loading) {
    return (
      <div>
        <BackLink />
        <LoadingState />
      </div>
    );
  }
  if (error || !detail) {
    return (
      <div>
        <BackLink />
        <ErrorState
          message={error ?? "Integration not found."}
          onRetry={reload}
        />
      </div>
    );
  }

  const { integration } = detail;
  const tabBadge: Partial<Record<HubTabId, string>> = {
    credentials: String(detail.credentials.length),
    documentation: String(detail.documents.length),
    testing: `${detail.checklist_rollup.percent_done}%`,
  };

  return (
    <div>
      <BackLink />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-24 font-bold tracking-tight text-white sm:text-28">
          {integration.name}
        </h1>
        <IntegrationStatusBadge status={integration.status} />
      </div>
      <p className="mt-1 text-13 text-black-400">
        {integration.vendor ?? "—"} · {integration.category} ·{" "}
        <span className="font-mono">{integration.slug}</span>
      </p>
      <div className="mt-4">
        <ModeNote mode={mode} />
      </div>

      <div
        className="mt-6 flex gap-1 overflow-x-auto border-b border-black-700/70 pb-px"
        role="tablist"
        aria-label="Integration sections"
      >
        {HUB_TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-13 font-medium whitespace-nowrap transition-colors",
              tab === t.id
                ? "border-rose-500 text-white"
                : "border-transparent text-black-400 hover:text-black-100"
            )}
          >
            {t.label}
            {tabBadge[t.id] && (
              <span className="rounded-full bg-black-700 px-1.5 py-0.5 text-10 text-black-300">
                {tabBadge[t.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "overview" && (
          <OverviewTab
            detail={detail}
            mode={mode}
            vaultConfigured={vaultConfigured}
          />
        )}
        {tab === "configuration" && (
          <ConfigurationTab
            detail={detail}
            onChanged={reload}
            onDeleted={() => router.push("/admin/integration-hub")}
          />
        )}
        {tab === "credentials" && (
          <CredentialsTab
            slug={slug}
            credentials={detail.credentials}
            mode={mode}
            onChanged={reload}
          />
        )}
        {tab === "endpoints" && (
          <EndpointsTab detail={detail} onChanged={reload} />
        )}
        {tab === "oauth" && <OAuthTab detail={detail} />}
        {tab === "tools" && <ToolsTab detail={detail} onChanged={reload} />}
        {tab === "webhooks" && (
          <WebhooksTab detail={detail} onChanged={reload} />
        )}
        {tab === "documentation" && (
          <DocumentsTab detail={detail} onChanged={reload} />
        )}
        {tab === "terms" && <TermsTab detail={detail} onChanged={reload} />}
        {tab === "testing" && (
          <TestingTab detail={detail} onChanged={reload} />
        )}
        {tab === "audit" && <AuditTab detail={detail} />}
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/integration-hub"
      className="mb-4 inline-flex items-center gap-1.5 text-13 text-black-400 transition-colors hover:text-white"
    >
      <ArrowLeft className="h-4 w-4" /> Integration Hub
    </Link>
  );
}
