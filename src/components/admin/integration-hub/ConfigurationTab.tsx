"use client";

/**
 * Configuration tab — integration identity fields, the guarded status
 * control, documentation-shaped metadata (auth method / base URL /
 * redirect URIs) and the Part 5.3 operator-notes area.
 */

import * as React from "react";
import { Save, Trash2 } from "lucide-react";
import {
  HUB_INTEGRATION_STATUSES,
  type HubIntegrationStatus,
} from "@/lib/integration-hub/hub-core";
import type { HubDetailResponse } from "./hub-api";
import {
  deleteHubIntegration,
  updateHubIntegration,
  HubApiError,
} from "./hub-api";
import {
  HUB_NOTES_FIELDS,
  buildStatusUpdateBody,
  metaString,
  statusChangeNeedsConfirm,
} from "./hub-ui";
import {
  ConfirmDialog,
  ErrorNote,
  IntegrationStatusBadge,
  SectionCard,
  WarningNote,
} from "./HubBits";

const inputLabel = "mb-1.5 block text-13 font-medium text-black-200";

export function ConfigurationTab({
  detail,
  onChanged,
  onDeleted,
}: {
  detail: HubDetailResponse;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const integration = detail.integration;

  const [name, setName] = React.useState(integration.name);
  const [vendor, setVendor] = React.useState(integration.vendor ?? "");
  const [category, setCategory] = React.useState(integration.category);
  const [summary, setSummary] = React.useState(integration.summary);
  const [websiteUrl, setWebsiteUrl] = React.useState(
    integration.website_url ?? ""
  );
  const [docsUrl, setDocsUrl] = React.useState(integration.docs_url ?? "");
  const [portalUrl, setPortalUrl] = React.useState(
    integration.review_portal_url ?? ""
  );
  const [supportEmail, setSupportEmail] = React.useState(
    integration.support_email ?? ""
  );
  const [externalNote, setExternalNote] = React.useState(
    integration.external_status_note ?? ""
  );
  const [authMethod, setAuthMethod] = React.useState(
    metaString(integration.metadata, "auth_method") ?? ""
  );
  const [baseUrl, setBaseUrl] = React.useState(
    metaString(integration.metadata, "base_url") ?? ""
  );
  const [redirectUris, setRedirectUris] = React.useState(() => {
    const raw = integration.metadata["redirect_uris"];
    return Array.isArray(raw)
      ? raw.filter((u): u is string => typeof u === "string").join("\n")
      : "";
  });
  const [notes, setNotes] = React.useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const f of HUB_NOTES_FIELDS) {
      out[f.key] = metaString(integration.metadata, f.key) ?? "";
    }
    return out;
  });

  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [statusPick, setStatusPick] = React.useState<HubIntegrationStatus>(
    integration.status
  );
  const [statusBusy, setStatusBusy] = React.useState(false);
  const [statusError, setStatusError] = React.useState<string | null>(null);
  const [confirmStatusOpen, setConfirmStatusOpen] = React.useState(false);

  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    setStatusPick(integration.status);
  }, [integration.status]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const metadata: Record<string, unknown> = { ...integration.metadata };
      const setMeta = (key: string, value: string) => {
        if (value.trim() === "") delete metadata[key];
        else metadata[key] = value.trim();
      };
      setMeta("auth_method", authMethod);
      setMeta("base_url", baseUrl);
      const uris = redirectUris
        .split("\n")
        .map((u) => u.trim())
        .filter(Boolean);
      if (uris.length > 0) metadata["redirect_uris"] = uris;
      else delete metadata["redirect_uris"];
      for (const f of HUB_NOTES_FIELDS) setMeta(f.key, notes[f.key] ?? "");

      await updateHubIntegration(integration.slug, {
        name: name.trim(),
        vendor: vendor.trim() === "" ? null : vendor.trim(),
        category: category.trim() || "general",
        summary,
        website_url: websiteUrl.trim() === "" ? null : websiteUrl.trim(),
        docs_url: docsUrl.trim() === "" ? null : docsUrl.trim(),
        review_portal_url: portalUrl.trim() === "" ? null : portalUrl.trim(),
        support_email: supportEmail.trim() === "" ? null : supportEmail.trim(),
        external_status_note:
          externalNote.trim() === "" ? null : externalNote.trim(),
        metadata,
      });
      setSaved(true);
      onChanged();
    } catch (err) {
      setError(
        err instanceof HubApiError
          ? err.fields
            ? `${err.message} (${Object.entries(err.fields)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ")})`
            : err.message
          : "Save failed. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const applyStatus = async (confirmed: boolean) => {
    setStatusBusy(true);
    setStatusError(null);
    try {
      await updateHubIntegration(
        integration.slug,
        buildStatusUpdateBody(statusPick, confirmed)
      );
      setConfirmStatusOpen(false);
      onChanged();
    } catch (err) {
      setStatusError(
        err instanceof HubApiError ? err.message : "Status change failed."
      );
      setConfirmStatusOpen(false);
    } finally {
      setStatusBusy(false);
    }
  };

  const handleStatusClick = () => {
    if (statusPick === integration.status) return;
    if (statusChangeNeedsConfirm(statusPick)) {
      setConfirmStatusOpen(true);
    } else {
      void applyStatus(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteHubIntegration(integration.slug);
      setDeleteOpen(false);
      onDeleted();
    } catch (err) {
      setStatusError(
        err instanceof Error ? err.message : "Delete failed."
      );
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Identity & links"
        description="The public shape of this integration. Documentation-shaped details (endpoints, tools, webhooks) are edited in their own tabs."
        action={
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-13 font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save configuration"}
          </button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={inputLabel}>Name</label>
            <input
              className="input-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className={inputLabel}>Vendor</label>
            <input
              className="input-field"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
            />
          </div>
          <div>
            <label className={inputLabel}>Category</label>
            <input
              className="input-field"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>
          <div>
            <label className={inputLabel}>Support email</label>
            <input
              className="input-field"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
            />
          </div>
          <div>
            <label className={inputLabel}>Website URL</label>
            <input
              className="input-field"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
            />
          </div>
          <div>
            <label className={inputLabel}>Documentation URL</label>
            <input
              className="input-field"
              value={docsUrl}
              onChange={(e) => setDocsUrl(e.target.value)}
            />
          </div>
          <div>
            <label className={inputLabel}>Review portal URL</label>
            <input
              className="input-field"
              value={portalUrl}
              onChange={(e) => setPortalUrl(e.target.value)}
            />
          </div>
          <div>
            <label className={inputLabel}>Authentication method</label>
            <input
              className="input-field"
              value={authMethod}
              onChange={(e) => setAuthMethod(e.target.value)}
              placeholder="e.g. OAuth 2.0 Authorization Code + PKCE"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={inputLabel}>API base URL</label>
            <input
              className="input-field font-mono"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={inputLabel}>
              Redirect URIs (one per line)
            </label>
            <textarea
              className="input-field font-mono"
              rows={3}
              value={redirectUris}
              onChange={(e) => setRedirectUris(e.target.value)}
              placeholder="https://…/oauth/callback"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={inputLabel}>Summary</label>
            <textarea
              className="input-field"
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={inputLabel}>
              External status note (what the external platform last reported —
              recorded manually, never fetched automatically)
            </label>
            <textarea
              className="input-field"
              rows={2}
              value={externalNote}
              onChange={(e) => setExternalNote(e.target.value)}
            />
          </div>
        </div>
        {error && (
          <div className="mt-4">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
        {saved && (
          <p className="mt-3 text-12 text-emerald-300">
            Configuration saved.
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="Operator notes"
        description="Working notes for whoever sets this integration up — blockers, manual steps and what remains. Text only: never paste credential values here; notes are unencrypted metadata."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {HUB_NOTES_FIELDS.map((f) => (
            <div key={f.key} className={f.rows >= 4 ? "sm:col-span-2" : ""}>
              <label className={inputLabel}>{f.label}</label>
              <textarea
                className="input-field"
                rows={f.rows}
                value={notes[f.key] ?? ""}
                onChange={(e) =>
                  setNotes((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>
        <p className="mt-3 text-12 text-black-500">
          Notes are saved together with the configuration (Save configuration
          button above).
        </p>
      </SectionCard>

      <SectionCard
        title="Status"
        description="The stored workflow status. Marking an integration Approved or Live requires an explicit confirmation and is audited — configuration alone never marks anything live."
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-13 text-black-300">Current:</span>
          <IntegrationStatusBadge status={integration.status} />
          <select
            className="input-field max-w-56"
            value={statusPick}
            onChange={(e) =>
              setStatusPick(e.target.value as HubIntegrationStatus)
            }
            aria-label="New status"
          >
            {HUB_INTEGRATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleStatusClick}
            disabled={statusBusy || statusPick === integration.status}
            className="rounded-xl bg-rose-600 px-3.5 py-2 text-13 font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-50"
          >
            {statusBusy ? "Updating…" : "Change status"}
          </button>
        </div>
        {statusPick !== integration.status &&
          statusChangeNeedsConfirm(statusPick) && (
            <div className="mt-3">
              <WarningNote>
                “{statusPick}” is a claim about the outside world, not just a
                saved setting. You will be asked to confirm explicitly, and
                the change is written to the audit log.
              </WarningNote>
            </div>
          )}
        {statusError && (
          <div className="mt-3">
            <ErrorNote>{statusError}</ErrorNote>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Danger zone">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-13 text-black-400">
            Delete this integration record, its credentials, checklist state,
            test accounts and documents. This cannot be undone.
          </p>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-950/20 px-3.5 py-2 text-13 font-medium text-rose-300 transition-colors hover:text-rose-200"
          >
            <Trash2 className="h-4 w-4" /> Delete integration
          </button>
        </div>
      </SectionCard>

      <ConfirmDialog
        open={confirmStatusOpen}
        title={`Mark as ${statusPick}?`}
        body={
          <>
            You are about to record{" "}
            <strong className="text-white">{integration.name}</strong> as{" "}
            <strong className="text-white">{statusPick}</strong>. Only do
            this when the external state has actually been verified — this
            confirmation is what the audit log records.
          </>
        }
        confirmLabel={`Yes, mark ${statusPick}`}
        busy={statusBusy}
        onConfirm={() => applyStatus(true)}
        onCancel={() => setConfirmStatusOpen(false)}
      />
      <ConfirmDialog
        open={deleteOpen}
        title="Delete integration"
        body={
          <>
            Delete <strong className="text-white">{integration.name}</strong>{" "}
            and everything stored under it (credentials, checklist state,
            test accounts, documents)? This cannot be undone.
          </>
        }
        confirmLabel="Delete integration"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
