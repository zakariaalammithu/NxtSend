"use client";

/**
 * Documentation-shaped detail tabs — API Endpoints, OAuth & Permissions,
 * Tools or Actions, Webhooks, Terms & Privacy.
 *
 * All of them render from the integration's `metadata` documentation
 * fields (the same fields the copy-package generator reads) and edit via
 * the integration PUT route. Empty collections render honest empty
 * states — never filler content.
 */

import * as React from "react";
import { ExternalLink, Plus, Save, Trash2 } from "lucide-react";
import { CopyButton } from "../CopyButton";
import type { HubDetailResponse } from "./hub-api";
import { updateHubIntegration, HubApiError } from "./hub-api";
import {
  metaComplianceLinks,
  metaEndpoints,
  metaLegal,
  metaRedirectUris,
  metaScopeProfile,
  metaScopes,
  metaString,
  metaTools,
  metaWebhooks,
  type HubEndpointMeta,
  type HubToolMeta,
  type HubWebhookMeta,
} from "./hub-ui";
import {
  ErrorNote,
  FieldRow,
  MonoValue,
  SectionCard,
  ToneBadge,
} from "./HubBits";
import { CREDENTIAL_KIND_LABELS, maskCredentialValue } from "./hub-ui";

function describeError(err: unknown): string {
  if (err instanceof HubApiError) {
    return err.fields
      ? `${err.message} (${Object.entries(err.fields)
          .map(([k, v]) => `${k}: ${v}`)
          .join(" · ")})`
      : err.message;
  }
  return "Save failed. Please try again.";
}

function useMetadataSave(detail: HubDetailResponse, onChanged: () => void) {
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const save = async (patch: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateHubIntegration(detail.integration.slug, {
        metadata: { ...detail.integration.metadata, ...patch },
      });
      setSaved(true);
      onChanged();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  };
  return { saving, error, saved, save };
}

function SaveRow({
  saving,
  saved,
  error,
  onSave,
}: {
  saving: boolean;
  saved: boolean;
  error: string | null;
  onSave: () => void;
}) {
  return (
    <div className="mt-4 space-y-2">
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-13 font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-50"
      >
        <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save changes"}
      </button>
      {saved && <p className="text-12 text-emerald-300">Saved.</p>}
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}

const cellInput = "input-field !px-3 !py-2 text-13";

// ── API Endpoints ───────────────────────────────────────────────────────────

export function EndpointsTab({
  detail,
  onChanged,
}: {
  detail: HubDetailResponse;
  onChanged: () => void;
}) {
  const { integration } = detail;
  const existing = metaEndpoints(integration.metadata);
  const [rows, setRows] = React.useState<HubEndpointMeta[]>(existing);
  const { saving, error, saved, save } = useMetadataSave(detail, onChanged);
  const baseUrl = metaString(integration.metadata, "base_url");
  const curl = metaString(integration.metadata, "curl_example");

  React.useEffect(() => {
    setRows(metaEndpoints(integration.metadata));
  }, [integration.metadata]);

  const update = (i: number, patch: Partial<HubEndpointMeta>) =>
    setRows((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
    );

  return (
    <div className="space-y-6">
      <SectionCard
        title="Endpoints"
        description="The provider endpoints this integration uses — shown in the copy package exactly as recorded here."
      >
        {baseUrl && (
          <dl className="mb-4">
            <FieldRow label="Base URL">
              <span className="inline-flex flex-wrap items-center gap-2">
                <MonoValue>{baseUrl}</MonoValue>
                <CopyButton text={baseUrl} />
              </span>
            </FieldRow>
          </dl>
        )}
        {rows.length === 0 ? (
          <p className="text-13 text-black-400">
            No endpoints documented yet. Add the first one below.
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((ep, i) => (
              <div
                key={i}
                className="grid gap-2 rounded-xl border border-black-700 bg-black-800/50 p-3 sm:grid-cols-[1fr_auto]"
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    className={cellInput}
                    value={ep.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                    placeholder="Label (e.g. MCP endpoint)"
                    aria-label="Endpoint label"
                  />
                  <input
                    className={cellInput}
                    value={ep.method ?? ""}
                    onChange={(e) =>
                      update(i, { method: e.target.value || undefined })
                    }
                    placeholder="Method (optional, e.g. POST)"
                    aria-label="Endpoint method"
                  />
                  <input
                    className={`${cellInput} font-mono sm:col-span-2`}
                    value={ep.url}
                    onChange={(e) => update(i, { url: e.target.value })}
                    placeholder="https://…"
                    aria-label="Endpoint URL"
                  />
                  <input
                    className={`${cellInput} sm:col-span-2`}
                    value={ep.notes ?? ""}
                    onChange={(e) =>
                      update(i, { notes: e.target.value || undefined })
                    }
                    placeholder="Notes (optional)"
                    aria-label="Endpoint notes"
                  />
                </div>
                <div className="flex items-start gap-2">
                  <CopyButton text={ep.url} />
                  <button
                    type="button"
                    onClick={() =>
                      setRows((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-950/20 px-2.5 py-1.5 text-12 text-rose-300 hover:text-rose-200"
                    aria-label="Remove endpoint"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, { label: "", url: "" }])}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-black-600 bg-black-800 px-2.5 py-1.5 text-12 font-medium text-black-200 hover:text-white"
        >
          <Plus className="h-3.5 w-3.5" /> Add endpoint
        </button>
        <SaveRow
          saving={saving}
          saved={saved}
          error={error}
          onSave={() =>
            save({
              endpoints: rows
                .filter((r) => r.label.trim() !== "" && r.url.trim() !== "")
                .map((r) => ({
                  label: r.label.trim(),
                  url: r.url.trim(),
                  ...(r.method ? { method: r.method } : {}),
                  ...(r.notes ? { notes: r.notes } : {}),
                })),
            })
          }
        />
      </SectionCard>

      {curl && (
        <SectionCard title="Example request">
          <pre className="overflow-x-auto rounded-xl border border-black-700 bg-black-900 p-4 font-mono text-12 whitespace-pre-wrap text-black-200">
            {curl}
          </pre>
          <div className="mt-3">
            <CopyButton text={curl} label="Copy example" />
          </div>
          <p className="mt-2 text-12 text-black-500">
            Examples use placeholder environment variables (e.g.
            ${"${BRR_TEST_API_KEY}"}) — never a real key.
          </p>
        </SectionCard>
      )}
    </div>
  );
}

// ── OAuth & Permissions ─────────────────────────────────────────────────────

export function OAuthTab({ detail }: { detail: HubDetailResponse }) {
  const { integration } = detail;
  const scopes = metaScopes(integration.metadata);
  const profile = metaScopeProfile(integration.metadata);
  const redirectUris = metaRedirectUris(integration.metadata);
  const authMethod = metaString(integration.metadata, "auth_method");
  const oauthNotes = metaString(integration.metadata, "oauth_notes");
  const oauthCreds = detail.credentials.filter(
    (c) => c.kind === "oauth_client_id" || c.kind === "client_secret"
  );

  return (
    <div className="space-y-6">
      <SectionCard title="OAuth configuration">
        <dl className="divide-y divide-black-700/60">
          <FieldRow label="Authentication">{authMethod ?? "—"}</FieldRow>
          <FieldRow label="Scope profile">
            {profile ? (
              <span>
                {profile}{" "}
                <span className="text-12 text-black-500">
                  (closed set — the server rejects scopes outside the profile)
                </span>
              </span>
            ) : (
              "None recorded"
            )}
          </FieldRow>
          <FieldRow label="Redirect URIs">
            {redirectUris.length === 0 ? (
              "None recorded yet — add them in the Configuration tab."
            ) : (
              <ul className="space-y-1.5">
                {redirectUris.map((uri) => (
                  <li
                    key={uri}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <MonoValue>{uri}</MonoValue>
                    <CopyButton text={uri} />
                  </li>
                ))}
              </ul>
            )}
          </FieldRow>
        </dl>
        {oauthNotes && (
          <p className="mt-3 text-13 whitespace-pre-wrap text-black-300">
            {oauthNotes}
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="Scopes / permissions"
        description="Exactly what this integration requests — nothing more. Copy them into the external setup as-is."
      >
        {scopes.length === 0 ? (
          <p className="text-13 text-black-400">
            No scopes documented yet.
          </p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-2">
              {scopes.map((s) => (
                <li
                  key={s}
                  className="inline-flex items-center gap-1.5 rounded-full border border-black-600 bg-black-800 py-0.5 pr-1 pl-3"
                >
                  <span className="font-mono text-12 text-black-100">{s}</span>
                  <CopyButton text={s} label="" copiedLabel="" />
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <CopyButton
                text={scopes.join(" ")}
                label="Copy all scopes (space-separated)"
              />
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard
        title="OAuth credentials"
        description="Masked summaries — manage values in the Credentials tab."
      >
        {oauthCreds.length === 0 ? (
          <p className="text-13 text-black-400">
            No OAuth client credentials stored yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {oauthCreds.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-2 text-13 text-black-300"
              >
                <span className="font-medium text-white">{c.label}</span>
                <span className="text-black-400">
                  {CREDENTIAL_KIND_LABELS[c.kind]} · {c.environment}
                </span>
                <MonoValue>{maskCredentialValue(c)}</MonoValue>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

// ── Tools or Actions ────────────────────────────────────────────────────────

export function ToolsTab({
  detail,
  onChanged,
}: {
  detail: HubDetailResponse;
  onChanged: () => void;
}) {
  const { integration } = detail;
  const [rows, setRows] = React.useState<HubToolMeta[]>(() =>
    metaTools(integration.metadata)
  );
  const { saving, error, saved, save } = useMetadataSave(detail, onChanged);

  React.useEffect(() => {
    setRows(metaTools(integration.metadata));
  }, [integration.metadata]);

  const update = (i: number, patch: Partial<HubToolMeta>) =>
    setRows((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
    );

  return (
    <SectionCard
      title="Tools / actions inventory"
      description="What this integration exposes or calls, with the scope each item requires. Read-only tools are labelled as such — never upgraded here."
    >
      {rows.length === 0 ? (
        <p className="text-13 text-black-400">
          No tools or actions documented yet. Add the first one below.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((tool, i) => (
            <div
              key={i}
              className="grid gap-2 rounded-xl border border-black-700 bg-black-800/50 p-3"
            >
              <div className="grid gap-2 sm:grid-cols-3">
                <input
                  className={`${cellInput} font-mono`}
                  value={tool.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder="tool.name"
                  aria-label="Tool name"
                />
                <input
                  className={`${cellInput} font-mono`}
                  value={tool.scope ?? ""}
                  onChange={(e) =>
                    update(i, { scope: e.target.value || undefined })
                  }
                  placeholder="Required scope"
                  aria-label="Required scope"
                />
                <input
                  className={cellInput}
                  value={tool.permission ?? ""}
                  onChange={(e) =>
                    update(i, { permission: e.target.value || undefined })
                  }
                  placeholder="Permission (e.g. read-only)"
                  aria-label="Permission"
                />
              </div>
              <div className="flex gap-2">
                <input
                  className={cellInput}
                  value={tool.description ?? ""}
                  onChange={(e) =>
                    update(i, { description: e.target.value || undefined })
                  }
                  placeholder="Description"
                  aria-label="Description"
                />
                <button
                  type="button"
                  onClick={() =>
                    setRows((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-950/20 px-2.5 py-1.5 text-12 text-rose-300 hover:text-rose-200"
                  aria-label="Remove tool"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, { name: "" }])}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-black-600 bg-black-800 px-2.5 py-1.5 text-12 font-medium text-black-200 hover:text-white"
      >
        <Plus className="h-3.5 w-3.5" /> Add tool / action
      </button>
      <SaveRow
        saving={saving}
        saved={saved}
        error={error}
        onSave={() =>
          save({
            tool_inventory: rows
              .filter((r) => r.name.trim() !== "")
              .map((r) => ({
                name: r.name.trim(),
                ...(r.scope ? { scope: r.scope } : {}),
                ...(r.permission ? { permission: r.permission } : {}),
                ...(r.description ? { description: r.description } : {}),
              })),
          })
        }
      />
    </SectionCard>
  );
}

// ── Webhooks ────────────────────────────────────────────────────────────────

export function WebhooksTab({
  detail,
  onChanged,
}: {
  detail: HubDetailResponse;
  onChanged: () => void;
}) {
  const { integration } = detail;
  const [rows, setRows] = React.useState<HubWebhookMeta[]>(() =>
    metaWebhooks(integration.metadata)
  );
  const { saving, error, saved, save } = useMetadataSave(detail, onChanged);
  const signing = metaString(integration.metadata, "webhook_signing");

  React.useEffect(() => {
    setRows(metaWebhooks(integration.metadata));
  }, [integration.metadata]);

  const update = (i: number, patch: Partial<HubWebhookMeta>) =>
    setRows((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
    );

  return (
    <div className="space-y-6">
      <SectionCard
        title="Webhooks"
        description="Documented webhook endpoints and events for this integration. A webhook is listed here as documentation — listing it does not subscribe or activate anything."
      >
        {signing && (
          <p className="mb-4 text-13 text-black-300">
            <span className="font-medium text-black-100">Signing: </span>
            {signing}
          </p>
        )}
        {rows.length === 0 ? (
          <p className="text-13 text-black-400">
            No webhooks documented yet. Add the first one below.
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((hook, i) => (
              <div
                key={i}
                className="grid gap-2 rounded-xl border border-black-700 bg-black-800/50 p-3"
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    className={cellInput}
                    value={hook.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    placeholder="Webhook name"
                    aria-label="Webhook name"
                  />
                  <input
                    className={`${cellInput} font-mono`}
                    value={hook.url ?? ""}
                    onChange={(e) =>
                      update(i, { url: e.target.value || undefined })
                    }
                    placeholder="https://… (receiving URL)"
                    aria-label="Webhook URL"
                  />
                </div>
                <input
                  className={`${cellInput} font-mono`}
                  value={hook.events.join(", ")}
                  onChange={(e) =>
                    update(i, {
                      events: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="Events, comma-separated"
                  aria-label="Webhook events"
                />
                <div className="flex gap-2">
                  <input
                    className={cellInput}
                    value={hook.notes ?? ""}
                    onChange={(e) =>
                      update(i, { notes: e.target.value || undefined })
                    }
                    placeholder="Notes (optional)"
                    aria-label="Webhook notes"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setRows((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-950/20 px-2.5 py-1.5 text-12 text-rose-300 hover:text-rose-200"
                    aria-label="Remove webhook"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {hook.url && (
                  <div>
                    <CopyButton text={hook.url} label="Copy URL" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() =>
            setRows((prev) => [...prev, { name: "", events: [] }])
          }
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-black-600 bg-black-800 px-2.5 py-1.5 text-12 font-medium text-black-200 hover:text-white"
        >
          <Plus className="h-3.5 w-3.5" /> Add webhook
        </button>
        <SaveRow
          saving={saving}
          saved={saved}
          error={error}
          onSave={() =>
            save({
              webhooks: rows
                .filter((r) => r.name.trim() !== "")
                .map((r) => ({
                  name: r.name.trim(),
                  ...(r.url ? { url: r.url } : {}),
                  events: r.events,
                  ...(r.notes ? { notes: r.notes } : {}),
                })),
            })
          }
        />
      </SectionCard>
    </div>
  );
}

// ── Terms & Privacy ─────────────────────────────────────────────────────────

export function TermsTab({
  detail,
  onChanged,
}: {
  detail: HubDetailResponse;
  onChanged: () => void;
}) {
  const { integration } = detail;
  const links = metaComplianceLinks(integration.metadata);
  const legal = metaLegal(integration.metadata);
  const policies = detail.documents.filter((d) => d.kind === "policy");
  const [privacyUrl, setPrivacyUrl] = React.useState(legal.privacy_url ?? "");
  const [termsUrl, setTermsUrl] = React.useState(legal.terms_url ?? "");
  const [dataCategories, setDataCategories] = React.useState(
    legal.data_categories ?? ""
  );
  const [retention, setRetention] = React.useState(legal.retention ?? "");
  const [incidentContact, setIncidentContact] = React.useState(
    legal.incident_contact ?? ""
  );
  const { saving, error, saved, save } = useMetadataSave(detail, onChanged);

  React.useEffect(() => {
    const l = metaLegal(integration.metadata);
    setPrivacyUrl(l.privacy_url ?? "");
    setTermsUrl(l.terms_url ?? "");
    setDataCategories(l.data_categories ?? "");
    setRetention(l.retention ?? "");
    setIncidentContact(l.incident_contact ?? "");
  }, [integration.metadata]);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Legal & compliance links"
        description="The exact URLs submitted to external reviewers — copied from this record, never retyped."
      >
        {links.length === 0 ? (
          <p className="text-13 text-black-400">
            No compliance links documented yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {links.map((l) => (
              <li key={l.url} className="flex flex-wrap items-center gap-2">
                <span className="text-13 text-black-200">{l.label}:</span>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-13 break-all text-rose-300 underline-offset-2 hover:underline"
                >
                  {l.url}
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                </a>
                <CopyButton text={l.url} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Data handling record"
        description="What this integration processes and how long it is kept — the facts reviewers ask for. Keep them accurate; they are claims, not settings."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-13 font-medium text-black-200">
              Privacy policy URL
            </label>
            <input
              className="input-field font-mono"
              value={privacyUrl}
              onChange={(e) => setPrivacyUrl(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-13 font-medium text-black-200">
              Terms URL
            </label>
            <input
              className="input-field font-mono"
              value={termsUrl}
              onChange={(e) => setTermsUrl(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-13 font-medium text-black-200">
              Data categories processed
            </label>
            <textarea
              className="input-field"
              rows={3}
              value={dataCategories}
              onChange={(e) => setDataCategories(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-13 font-medium text-black-200">
              Retention / deletion behaviour
            </label>
            <textarea
              className="input-field"
              rows={3}
              value={retention}
              onChange={(e) => setRetention(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-13 font-medium text-black-200">
              Security-incident contact / commitment
            </label>
            <input
              className="input-field"
              value={incidentContact}
              onChange={(e) => setIncidentContact(e.target.value)}
            />
          </div>
        </div>
        <SaveRow
          saving={saving}
          saved={saved}
          error={error}
          onSave={() =>
            save({
              legal: {
                ...(privacyUrl.trim()
                  ? { privacy_url: privacyUrl.trim() }
                  : {}),
                ...(termsUrl.trim() ? { terms_url: termsUrl.trim() } : {}),
                ...(dataCategories.trim()
                  ? { data_categories: dataCategories.trim() }
                  : {}),
                ...(retention.trim() ? { retention: retention.trim() } : {}),
                ...(incidentContact.trim()
                  ? { incident_contact: incidentContact.trim() }
                  : {}),
              },
            })
          }
        />
      </SectionCard>

      <SectionCard title="Policy documents">
        {policies.length === 0 ? (
          <p className="text-13 text-black-400">
            No policy documents stored yet — add them in the Documentation
            tab with kind “policy”.
          </p>
        ) : (
          <ul className="space-y-2">
            {policies.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 text-13"
              >
                <span className="text-black-100">{d.title}</span>
                <ToneBadge tone="zinc">v{d.version}</ToneBadge>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
