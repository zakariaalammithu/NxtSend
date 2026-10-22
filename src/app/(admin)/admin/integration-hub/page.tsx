"use client";

/**
 * Integration Hub — overview (P7 Stage C).
 *
 * One card per integration from GET /api/admin/integration-hub: status
 * (stored truth, never upgraded), auth method, environments,
 * completeness (credentials + checklist, computed from the API's
 * rollups), warnings for unverified/expired states, a prominent Copy
 * Integration Package per card, Configure → detail, plus hub-level
 * search and status/vendor filters and a plain "New integration"
 * create flow.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Plus, Search, Settings2 } from "lucide-react";
import {
  AdminPageHeader,
  EmptyStateBox,
  ErrorState,
  LoadingState,
  ModeNote,
  fmtDateTime,
  useAdminFetch,
} from "@/components/admin/AdminBits";
import { Modal } from "@/components/ui/Modal";
import {
  HUB_INTEGRATION_STATUSES,
  type HubIntegrationStatus,
} from "@/lib/integration-hub/hub-core";
import type { HubOverviewResponse } from "@/components/admin/integration-hub/hub-api";
import {
  createHubIntegration,
  HubApiError,
} from "@/components/admin/integration-hub/hub-api";
import {
  HUB_STATUS_META,
  integrationCompleteness,
  metaString,
  type HubOverviewItemView,
} from "@/components/admin/integration-hub/hub-ui";
import { HubCopyPackage } from "@/components/admin/integration-hub/HubCopyPackage";
import {
  ChecklistProgress,
  ErrorNote,
  IntegrationStatusBadge,
  WarningNote,
} from "@/components/admin/integration-hub/HubBits";

export default function IntegrationHubOverviewPage() {
  const { data, error, loading, reload } = useAdminFetch<{
    overview: HubOverviewResponse;
  }>("/api/admin/integration-hub");
  const overview = data?.overview;
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [vendorFilter, setVendorFilter] = React.useState<string>("all");
  const [createOpen, setCreateOpen] = React.useState(false);

  const vendors = React.useMemo(() => {
    const set = new Set<string>();
    for (const item of overview?.integrations ?? []) {
      if (item.integration.vendor) set.add(item.integration.vendor);
    }
    return Array.from(set).sort();
  }, [overview]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return (overview?.integrations ?? []).filter((item) => {
      const { integration } = item;
      if (statusFilter !== "all" && integration.status !== statusFilter) {
        return false;
      }
      if (vendorFilter !== "all" && integration.vendor !== vendorFilter) {
        return false;
      }
      if (q) {
        const haystack =
          `${integration.name} ${integration.vendor ?? ""} ${integration.slug} ${integration.category}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [overview, query, statusFilter, vendorFilter]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AdminPageHeader
          title="Integration Hub"
          description="External integrations, their credentials vault, submission checklists and one-click copy packages — managed from one admin workspace."
        />
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-13 font-semibold text-white transition-colors hover:bg-rose-500"
        >
          <Plus className="h-4 w-4" /> New integration
        </button>
      </div>
      {overview && (
        <div className="mb-5">
          <ModeNote mode={overview.mode} />
        </div>
      )}
      {overview && overview.mode === "supabase" && !overview.vault_configured && (
        <div className="mb-5">
          <WarningNote>
            The credential vault key (INTEGRATION_HUB_ENCRYPTION_KEY) is not
            configured on the server — credential storage and disclosure stay
            unavailable until it is set. Configuration, checklists and
            documents work normally.
          </WarningNote>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-black-500" />
          <input
            className="input-field !pl-10"
            placeholder="Search integrations…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search integrations"
          />
        </div>
        <select
          className="input-field max-w-52"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          {HUB_INTEGRATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {HUB_STATUS_META[s as HubIntegrationStatus].label}
            </option>
          ))}
        </select>
        <select
          className="input-field max-w-52"
          value={vendorFilter}
          onChange={(e) => setVendorFilter(e.target.value)}
          aria-label="Filter by vendor"
        >
          <option value="all">All vendors</option>
          {vendors.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !overview || overview.integrations.length === 0 ? (
        <EmptyStateBox
          title="No integrations yet"
          message="Create the first integration record with the “New integration” button. Records start as drafts — nothing is marked live by creating one."
        />
      ) : visible.length === 0 ? (
        <EmptyStateBox
          title="No integrations match"
          message="No integration matches the current search and filters."
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((item) => (
            <IntegrationCard key={item.integration.id} item={item} />
          ))}
        </div>
      )}

      <CreateIntegrationModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  );
}

function IntegrationCard({ item }: { item: HubOverviewItemView }) {
  const { integration } = item;
  const completeness = integrationCompleteness(item);
  const authMethod = metaString(integration.metadata, "auth_method");
  const envEntries = Object.entries(item.credentials_by_environment);
  const detailHref = `/admin/integration-hub/${integration.slug}`;

  return (
    <article className="glass-card flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={detailHref}
            className="text-17 font-semibold text-white underline-offset-2 hover:underline"
          >
            {integration.name}
          </Link>
          <p className="mt-0.5 text-12 text-black-400">
            {integration.vendor ?? "—"} · {integration.category}
          </p>
        </div>
        <IntegrationStatusBadge status={integration.status} />
      </div>

      <dl className="space-y-1.5 text-13 text-black-300">
        <div className="flex justify-between gap-3">
          <dt className="text-black-500">Authentication</dt>
          <dd className="text-right">{authMethod ?? "Not recorded"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-black-500">Environments</dt>
          <dd className="text-right">
            {envEntries.length === 0
              ? "—"
              : envEntries.map(([env, n]) => `${env} ×${n}`).join(", ")}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-black-500">Credentials</dt>
          <dd>{completeness.credentialsLabel}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-black-500">Documents</dt>
          <dd>
            {item.document_count} · {item.test_account_count} test account
            {item.test_account_count === 1 ? "" : "s"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-black-500">Nearest credential expiry</dt>
          <dd>
            {item.nearest_expiry ? fmtDateTime(item.nearest_expiry) : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-black-500">Last updated</dt>
          <dd>{fmtDateTime(integration.updated_at)}</dd>
        </div>
      </dl>

      <ChecklistProgress
        done={item.checklist.done}
        total={item.checklist.total}
        percent={item.checklist.percent_done}
      />

      {completeness.warnings.length > 0 && (
        <ul className="space-y-1">
          {completeness.warnings.map((w) => (
            <li
              key={w}
              className="rounded-lg border border-amber-500/40 bg-amber-950/20 px-2.5 py-1.5 text-12 text-amber-300"
            >
              {w}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto space-y-3 border-t border-black-700/60 pt-4">
        <HubCopyPackage slug={integration.slug} showExport={false} />
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={detailHref}
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-13 font-semibold text-white transition-colors hover:bg-rose-500"
          >
            <Settings2 className="h-4 w-4" /> Configure
          </Link>
          {integration.docs_url && (
            <a
              href={integration.docs_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-black-600 bg-black-800 px-3.5 py-2 text-13 font-medium text-black-200 transition-colors hover:text-white"
            >
              Documentation <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function CreateIntegrationModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [vendor, setVendor] = React.useState("");
  const [category, setCategory] = React.useState("connector");
  const [authMethod, setAuthMethod] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [websiteUrl, setWebsiteUrl] = React.useState("");
  const [docsUrl, setDocsUrl] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) setError(null);
  }, [open ]);

  const submit = async () => {
    if (name.trim() === "") {
      setError("Give the integration a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const metadata: Record<string, unknown> = {};
      if (authMethod.trim()) metadata.auth_method = authMethod.trim();
      if (baseUrl.trim()) metadata.base_url = baseUrl.trim();
      const { integration } = await createHubIntegration({
        name: name.trim(),
        vendor: vendor.trim() === "" ? null : vendor.trim(),
        category: category.trim() || "general",
        summary,
        website_url: websiteUrl.trim() === "" ? null : websiteUrl.trim(),
        docs_url: docsUrl.trim() === "" ? null : docsUrl.trim(),
        metadata,
      });
      onClose();
      router.push(`/admin/integration-hub/${integration.slug}`);
    } catch (err) {
      setError(
        err instanceof HubApiError
          ? err.fields
            ? `${err.message} (${Object.entries(err.fields)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ")})`
            : err.message
          : "Create failed. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const label = "mb-1.5 block text-13 font-medium text-black-200";
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="New integration"
      description="Creates a draft record. Credentials, endpoints, checklists and documents are added inside the record afterwards."
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-black-600 bg-black-800 px-4 py-2 text-13 font-medium text-black-200 hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="rounded-xl bg-rose-600 px-4 py-2 text-13 font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create integration"}
          </button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Name *</label>
          <input
            className="input-field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Biz Review Radar"
          />
        </div>
        <div>
          <label className={label}>Vendor</label>
          <input
            className="input-field"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
          />
        </div>
        <div>
          <label className={label}>Category</label>
          <input
            className="input-field"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </div>
        <div>
          <label className={label}>Authentication method</label>
          <input
            className="input-field"
            value={authMethod}
            onChange={(e) => setAuthMethod(e.target.value)}
            placeholder="e.g. OAuth 2.0 + PKCE"
          />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>API base URL</label>
          <input
            className="input-field font-mono"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>
        <div>
          <label className={label}>Website URL</label>
          <input
            className="input-field"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
          />
        </div>
        <div>
          <label className={label}>Documentation URL</label>
          <input
            className="input-field"
            value={docsUrl}
            onChange={(e) => setDocsUrl(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Summary</label>
          <textarea
            className="input-field"
            rows={3}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </div>
      </div>
      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </Modal>
  );
}
