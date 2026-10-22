"use client";

/**
 * CredentialsTab — the Integration Hub's credential vault UI.
 *
 * Rules enforced here (on top of the Stage B server rules):
 *  - Values are WRITE-ONLY: the list renders metadata + a masked
 *    `••••••••last4` only; a value appears solely in the temporary reveal
 *    panel after the audited reveal call, and auto-hides.
 *  - The placeholder shown in the value field is TEXT ONLY — submitting
 *    it (or any placeholder-shaped string) is blocked client-side.
 *  - Copying a value goes through the audited copy endpoint, then the
 *    clipboard; failures surface honestly.
 *  - In Demo Mode the forms are disabled with the Stage B explanation and
 *    reveal/copy surface the server's demo response.
 */

import * as React from "react";
import { Eye, EyeOff, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { fmtDateTime } from "../AdminBits";
import { CopyButton } from "../CopyButton";
import {
  HUB_CREDENTIAL_ENVIRONMENTS,
  HUB_CREDENTIAL_KINDS,
  HUB_CREDENTIAL_STATUSES,
  type HubCredentialEnvironment,
  type HubCredentialKind,
  type HubCredentialMetadata,
  type HubCredentialStatus,
} from "@/lib/integration-hub/hub-core";
import {
  copyHubCredentialValue,
  createHubCredential,
  deleteHubCredential,
  revealHubCredential,
  updateHubCredential,
  HubApiError,
} from "./hub-api";
import {
  CREDENTIAL_KIND_LABELS,
  DEMO_CREDENTIAL_NOTICE,
  credentialExpiryState,
  credentialFormError,
  credentialWritesDisabled,
  isSecretCredentialKind,
  maskCredentialValue,
  placeholderForKind,
} from "./hub-ui";
import {
  ConfirmDialog,
  CredentialEnvBadge,
  CredentialStatusBadge,
  ErrorNote,
  MonoValue,
  SectionCard,
  ToneBadge,
  WarningNote,
} from "./HubBits";

const REVEAL_AUTO_HIDE_MS = 30_000;

interface CredentialsTabProps {
  slug: string;
  credentials: HubCredentialMetadata[];
  mode: "demo" | "supabase";
  onChanged: () => void;
}

export function CredentialsTab({
  slug,
  credentials,
  mode,
  onChanged,
}: CredentialsTabProps) {
  const writesDisabled = credentialWritesDisabled(mode);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [revealed, setRevealed] = React.useState<Record<string, string>>({});
  const [revealBusy, setRevealBusy] = React.useState<string | null>(null);
  const timers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {}
  );

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<HubCredentialMetadata | null>(
    null
  );
  const [deleteTarget, setDeleteTarget] =
    React.useState<HubCredentialMetadata | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(
    () => () => {
      Object.values(timers.current).forEach(clearTimeout);
    },
    []
  );

  const hideValue = React.useCallback((id: string) => {
    setRevealed((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (timers.current[id]) clearTimeout(timers.current[id]);
  }, []);

  const handleReveal = async (cred: HubCredentialMetadata) => {
    setActionError(null);
    setRevealBusy(cred.id);
    try {
      const res = await revealHubCredential(cred.id);
      setRevealed((prev) => ({ ...prev, [cred.id]: res.value }));
      if (timers.current[cred.id]) clearTimeout(timers.current[cred.id]);
      timers.current[cred.id] = setTimeout(
        () => hideValue(cred.id),
        REVEAL_AUTO_HIDE_MS
      );
      onChanged();
    } catch (err) {
      if (err instanceof HubApiError && err.status === 409) {
        setActionError(
          `This credential can no longer be revealed. ${err.message}`
        );
      } else {
        setActionError(
          err instanceof Error ? err.message : "Reveal failed."
        );
      }
    } finally {
      setRevealBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteHubCredential(deleteTarget.id);
      hideValue(deleteTarget.id);
      setDeleteTarget(null);
      onChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Delete failed.");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {writesDisabled && <WarningNote>{DEMO_CREDENTIAL_NOTICE}</WarningNote>}
      {actionError && <ErrorNote>{actionError}</ErrorNote>}

      <SectionCard
        title="Stored credentials"
        description="Values are encrypted at rest and never shown in lists. Revealing or copying a value is written to the audit log first."
        action={
          <button
            type="button"
            disabled={writesDisabled}
            title={writesDisabled ? DEMO_CREDENTIAL_NOTICE : undefined}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-13 font-semibold text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Add credential
          </button>
        }
      >
        {credentials.length === 0 ? (
          <p className="text-13 text-black-400">
            No credentials stored yet. Add the first one with the button
            above — you will paste the real value issued by the provider;
            it is encrypted before it is saved.
          </p>
        ) : (
          <ul className="divide-y divide-black-700/60">
            {credentials.map((cred) => (
              <CredentialRow
                key={cred.id}
                cred={cred}
                revealedValue={revealed[cred.id]}
                revealBusy={revealBusy === cred.id}
                writesDisabled={writesDisabled}
                onReveal={() => handleReveal(cred)}
                onHide={() => hideValue(cred.id)}
                onEdit={() => {
                  setEditing(cred);
                  setFormOpen(true);
                }}
                onDelete={() => setDeleteTarget(cred)}
                onChanged={onChanged}
                onError={setActionError}
              />
            ))}
          </ul>
        )}
      </SectionCard>

      <CredentialFormModal
        open={formOpen}
        slug={slug}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          onChanged();
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete credential"
        body={
          <>
            Delete{" "}
            <strong className="text-white">{deleteTarget?.label}</strong>?
            The stored value is removed and cannot be recovered. The
            deletion is written to the audit log.
          </>
        }
        confirmLabel="Delete credential"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function CredentialRow({
  cred,
  revealedValue,
  revealBusy,
  writesDisabled,
  onReveal,
  onHide,
  onEdit,
  onDelete,
  onChanged,
  onError,
}: {
  cred: HubCredentialMetadata;
  revealedValue?: string;
  revealBusy: boolean;
  writesDisabled: boolean;
  onReveal: () => void;
  onHide: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const expiry = credentialExpiryState(cred, Date.now());
  const revoked = cred.status === "revoked";
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <KeyRound className="h-4 w-4 shrink-0 text-rose-400" />
            <span className="text-14 font-medium text-white">{cred.label}</span>
            <CredentialEnvBadge environment={cred.environment} />
            <CredentialStatusBadge status={cred.status} />
            {expiry === "expired" && cred.status !== "expired" && (
              <ToneBadge tone="rose">Past expiry date</ToneBadge>
            )}
            {expiry === "expiring_soon" && (
              <ToneBadge tone="amber">Expires soon</ToneBadge>
            )}
          </div>
          <p className="mt-1 text-12 text-black-400">
            {CREDENTIAL_KIND_LABELS[cred.kind]}
            {isSecretCredentialKind(cred.kind) ? " · secret" : ""} ·{" "}
            <MonoValue>{maskCredentialValue(cred)}</MonoValue>
            {cred.username_hint ? ` · account hint: ${cred.username_hint}` : ""}
          </p>
          <p className="mt-0.5 text-12 text-black-500">
            {cred.expires_at
              ? `Expires ${fmtDateTime(cred.expires_at)} · `
              : ""}
            Last revealed:{" "}
            {cred.last_revealed_at
              ? `${fmtDateTime(cred.last_revealed_at)}${cred.last_revealed_by ? ` by ${cred.last_revealed_by}` : ""}`
              : "never"}{" "}
            · Last copied:{" "}
            {cred.last_copied_at
              ? `${fmtDateTime(cred.last_copied_at)}${cred.last_copied_by ? ` by ${cred.last_copied_by}` : ""}`
              : "never"}
          </p>
          {cred.notes && (
            <p className="mt-1 text-12 text-black-400">{cred.notes}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onReveal}
            disabled={!cred.has_value || revealBusy}
            title={
              !cred.has_value
                ? "No value is stored for this credential"
                : revoked
                  ? "Revoked credentials cannot be revealed — the server will refuse"
                  : "Reveal (audited)"
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-black-600 bg-black-800 px-2.5 py-1.5 text-12 font-medium text-black-200 transition-colors hover:border-black-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Eye className="h-3.5 w-3.5" />
            {revealBusy ? "Revealing…" : "Reveal"}
          </button>
          <CopyButton
            label="Copy value"
            text={async () => (await copyHubCredentialValue(cred.id)).value}
            disabled={!cred.has_value}
            title="Copy via the audited copy endpoint"
            onError={(m) => onError(m)}
            onCopied={() => {
              onError(null);
              onChanged();
            }}
          />
          <button
            type="button"
            onClick={onEdit}
            disabled={writesDisabled}
            title={writesDisabled ? DEMO_CREDENTIAL_NOTICE : "Edit"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-black-600 bg-black-800 px-2.5 py-1.5 text-12 font-medium text-black-200 transition-colors hover:border-black-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={writesDisabled}
            title={writesDisabled ? DEMO_CREDENTIAL_NOTICE : "Delete"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/20 px-2.5 py-1.5 text-12 font-medium text-rose-300 transition-colors hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      </div>

      {revealedValue !== undefined && (
        <div className="mt-3 rounded-xl border border-rose-500/40 bg-rose-950/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-12 text-rose-300">
              Revealed value — visible only on this screen. This reveal was
              written to the audit log and the value hides automatically in
              30 seconds.
            </p>
            <div className="flex items-center gap-2">
              <CopyButton label="Copy" text={revealedValue} />
              <button
                type="button"
                onClick={onHide}
                className="inline-flex items-center gap-1.5 rounded-lg border border-black-600 bg-black-800 px-2.5 py-1.5 text-12 font-medium text-black-200 transition-colors hover:text-white"
              >
                <EyeOff className="h-3.5 w-3.5" /> Hide now
              </button>
            </div>
          </div>
          <p className="mt-2 font-mono text-14 break-all text-white">
            {revealedValue}
          </p>
        </div>
      )}
    </li>
  );
}

function CredentialFormModal({
  open,
  slug,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  slug: string;
  editing: HubCredentialMetadata | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = editing !== null;
  const [label, setLabel] = React.useState("");
  const [kind, setKind] = React.useState<HubCredentialKind>("client_secret");
  const [environment, setEnvironment] =
    React.useState<HubCredentialEnvironment>("production");
  const [status, setStatus] = React.useState<HubCredentialStatus>("configured");
  const [usernameHint, setUsernameHint] = React.useState("");
  const [value, setValue] = React.useState("");
  const [expiresOn, setExpiresOn] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setValue("");
    if (editing) {
      setLabel(editing.label);
      setKind(editing.kind);
      setEnvironment(editing.environment);
      setStatus(editing.status);
      setUsernameHint(editing.username_hint ?? "");
      setExpiresOn(
        editing.expires_at ? editing.expires_at.slice(0, 10) : ""
      );
      setNotes(editing.notes);
    } else {
      setLabel("");
      setKind("client_secret");
      setEnvironment("production");
      setStatus("configured");
      setUsernameHint("");
      setExpiresOn("");
      setNotes("");
    }
  }, [open, editing]);

  const submit = async () => {
    const guardError = credentialFormError({ isEdit, value, notes });
    if (guardError) {
      setError(guardError);
      return;
    }
    if (label.trim() === "") {
      setError("Give the credential a label.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const expires_at = expiresOn
        ? new Date(`${expiresOn}T23:59:59.000Z`).toISOString()
        : null;
      if (isEdit && editing) {
        const body: Record<string, unknown> = {
          label: label.trim(),
          kind,
          environment,
          status,
          username_hint: usernameHint.trim() === "" ? null : usernameHint.trim(),
          expires_at,
          notes,
        };
        // Blank value on edit = keep the stored value (field omitted).
        if (value.trim() !== "") body.value = value;
        await updateHubCredential(editing.id, body);
      } else {
        await createHubCredential(slug, {
          label: label.trim(),
          kind,
          environment,
          status,
          username_hint: usernameHint.trim() === "" ? null : usernameHint.trim(),
          value,
          expires_at,
          notes,
        });
      }
      onSaved();
    } catch (err) {
      if (err instanceof HubApiError) {
        const fieldText = err.fields
          ? Object.entries(err.fields)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")
          : "";
        setError(fieldText ? `${err.message} (${fieldText})` : err.message);
      } else {
        setError("Save failed. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  const statusOptions: HubCredentialStatus[] = isEdit
    ? [...HUB_CREDENTIAL_STATUSES]
    : ["configured", "needs_verification"];

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={isEdit ? "Edit credential" : "Add credential"}
      description="The value is encrypted before it is stored and is never shown again in lists — only via an audited reveal or copy."
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-black-600 bg-black-800 px-4 py-2 text-13 font-medium text-black-200 transition-colors hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="rounded-xl bg-rose-600 px-4 py-2 text-13 font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Store credential"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-13 font-medium text-black-200">
              Label
            </label>
            <input
              className="input-field"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Muse connector client secret"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-13 font-medium text-black-200">
              Kind
            </label>
            <select
              className="input-field"
              value={kind}
              onChange={(e) => setKind(e.target.value as HubCredentialKind)}
            >
              {HUB_CREDENTIAL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {CREDENTIAL_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-13 font-medium text-black-200">
              Environment
            </label>
            <select
              className="input-field"
              value={environment}
              onChange={(e) =>
                setEnvironment(e.target.value as HubCredentialEnvironment)
              }
            >
              {HUB_CREDENTIAL_ENVIRONMENTS.map((env) => (
                <option key={env} value={env}>
                  {env}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-13 font-medium text-black-200">
              Status
            </label>
            <select
              className="input-field"
              value={status}
              onChange={(e) => setStatus(e.target.value as HubCredentialStatus)}
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-13 font-medium text-black-200">
              Account / username hint (optional)
            </label>
            <input
              className="input-field"
              value={usernameHint}
              onChange={(e) => setUsernameHint(e.target.value)}
              placeholder="Non-secret hint only"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-13 font-medium text-black-200">
              Expires on (optional)
            </label>
            <input
              type="date"
              className="input-field"
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-13 font-medium text-black-200">
            {isEdit ? "New value (blank = keep existing)" : "Value"}
          </label>
          <input
            type="password"
            autoComplete="new-password"
            className="input-field font-mono"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholderForKind(kind)}
          />
          <p className="mt-1 text-12 text-black-500">
            Paste the real value issued by the provider. The placeholder text
            above is guidance only — submitting it is blocked and it is never
            saved.
          </p>
        </div>
        <div>
          <label className="mb-1.5 block text-13 font-medium text-black-200">
            Notes (metadata — never paste the value here)
          </label>
          <textarea
            className="input-field"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Where this credential is registered, who issued it, rotation plan…"
          />
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  );
}
