"use client";

/**
 * Testing tab — submission/setup checklists (state + note + evidence URL
 * per item) and reviewer test accounts (passwords are vault references
 * only — a raw password field is refused by the API and never offered
 * here).
 */

import * as React from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { fmtDateTime } from "../AdminBits";
import {
  HUB_CHECKLIST_STATES,
  HUB_TEST_ACCOUNT_STATUSES,
  type HubChecklistEntry,
  type HubChecklistState,
  type HubCredentialMetadata,
  type HubTestAccountRecord,
  type HubTestAccountStatus,
} from "@/lib/integration-hub/hub-core";
import type { HubDetailResponse } from "./hub-api";
import {
  createHubTestAccount,
  deleteHubTestAccount,
  putHubChecklistState,
  updateHubTestAccount,
  HubApiError,
} from "./hub-api";
import {
  CHECKLIST_STATE_META,
  TEST_ACCOUNT_STATUS_META,
} from "./hub-ui";
import {
  ChecklistProgress,
  ConfirmDialog,
  ErrorNote,
  SectionCard,
  ToneBadge,
} from "./HubBits";

export function TestingTab({
  detail,
  onChanged,
}: {
  detail: HubDetailResponse;
  onChanged: () => void;
}) {
  const groups = React.useMemo(() => {
    const map = new Map<string, HubChecklistEntry[]>();
    for (const entry of detail.checklists) {
      const key = entry.item.list_key;
      const arr = map.get(key) ?? [];
      arr.push(entry);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [detail.checklists]);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Checklists"
        description="Progress is recorded per item with a state, a note and optional evidence. A completed checklist records that the steps were done — it never changes the integration's external status by itself."
      >
        <div className="mb-5 max-w-md">
          <ChecklistProgress
            done={detail.checklist_rollup.done}
            total={detail.checklist_rollup.total}
            percent={detail.checklist_rollup.percent_done}
          />
        </div>
        {groups.length === 0 ? (
          <p className="text-13 text-black-400">
            No checklist items defined for this integration yet.
          </p>
        ) : (
          <div className="space-y-6">
            {groups.map(([listKey, entries]) => (
              <div key={listKey}>
                <h4 className="mb-2 text-13 font-semibold tracking-wide text-black-200 uppercase">
                  {listKey.replace(/[-_]/g, " ")}
                </h4>
                <ul className="divide-y divide-black-700/60">
                  {entries.map((entry) => (
                    <ChecklistRow
                      key={entry.item.id}
                      slug={detail.integration.slug}
                      entry={entry}
                      onChanged={onChanged}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <TestAccountsCard detail={detail} onChanged={onChanged} />
    </div>
  );
}

function ChecklistRow({
  slug,
  entry,
  onChanged,
}: {
  slug: string;
  entry: HubChecklistEntry;
  onChanged: () => void;
}) {
  const current = entry.state?.state ?? "todo";
  const [state, setState] = React.useState<HubChecklistState>(current);
  const [note, setNote] = React.useState(entry.state?.note ?? "");
  const [evidence, setEvidence] = React.useState(
    entry.state?.evidence_url ?? ""
  );
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setState(entry.state?.state ?? "todo");
    setNote(entry.state?.note ?? "");
    setEvidence(entry.state?.evidence_url ?? "");
  }, [entry.state]);

  const dirty =
    state !== current ||
    note !== (entry.state?.note ?? "") ||
    evidence !== (entry.state?.evidence_url ?? "");

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await putHubChecklistState(slug, entry.item.id, {
        state,
        note,
        evidence_url: evidence.trim() === "" ? null : evidence.trim(),
      });
      setSaved(true);
      onChanged();
    } catch (err) {
      setError(
        err instanceof HubApiError ? err.message : "Save failed."
      );
    } finally {
      setSaving(false);
    }
  };

  const meta = CHECKLIST_STATE_META[state];
  return (
    <li className="py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-xl">
          <p className="text-14 font-medium text-white">{entry.item.title}</p>
          {entry.item.detail && (
            <p className="mt-0.5 text-12 text-black-400">{entry.item.detail}</p>
          )}
          {entry.item.source_ref && (
            <p className="mt-0.5 font-mono text-11 text-black-500">
              {entry.item.source_ref}
            </p>
          )}
        </div>
        <ToneBadge tone={meta.tone}>{meta.label}</ToneBadge>
      </div>
      <div className="mt-2.5 grid gap-2 sm:grid-cols-[160px_1fr_1fr_auto]">
        <select
          className="input-field !px-3 !py-2 text-13"
          value={state}
          onChange={(e) => setState(e.target.value as HubChecklistState)}
          aria-label="Checklist state"
        >
          {HUB_CHECKLIST_STATES.map((s) => (
            <option key={s} value={s}>
              {CHECKLIST_STATE_META[s].label}
            </option>
          ))}
        </select>
        <input
          className="input-field !px-3 !py-2 text-13"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note"
          aria-label="Checklist note"
        />
        <input
          className="input-field !px-3 !py-2 font-mono text-13"
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          placeholder="Evidence URL (optional)"
          aria-label="Evidence URL"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="rounded-xl bg-rose-600 px-3.5 py-2 text-13 font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : saved && !dirty ? "Saved" : "Save"}
        </button>
      </div>
      {error && (
        <div className="mt-2">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      {entry.state?.updated_at && (
        <p className="mt-1.5 text-11 text-black-500">
          Last updated {fmtDateTime(entry.state.updated_at)}
          {entry.state.updated_by ? ` by ${entry.state.updated_by}` : ""}
          {entry.state.completed_at
            ? ` · completed ${fmtDateTime(entry.state.completed_at)}`
            : ""}
        </p>
      )}
    </li>
  );
}

// ── Test accounts ───────────────────────────────────────────────────────────

function TestAccountsCard({
  detail,
  onChanged,
}: {
  detail: HubDetailResponse;
  onChanged: () => void;
}) {
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<HubTestAccountRecord | null>(
    null
  );
  const [deleteTarget, setDeleteTarget] =
    React.useState<HubTestAccountRecord | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteHubTestAccount(deleteTarget.id);
      setDeleteTarget(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const passwordCreds = detail.credentials.filter(
    (c) => c.kind === "password" || c.kind === "test_account_password"
  );

  return (
    <SectionCard
      title="Test accounts"
      description="Accounts prepared for external reviewers. Passwords live in the credential vault — a test account only references the credential that holds its password."
      action={
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-13 font-semibold text-white transition-colors hover:bg-rose-500"
        >
          <Plus className="h-4 w-4" /> Add test account
        </button>
      }
    >
      {error && (
        <div className="mb-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      {detail.test_accounts.length === 0 ? (
        <p className="text-13 text-black-400">
          No test accounts recorded yet.
        </p>
      ) : (
        <ul className="divide-y divide-black-700/60">
          {detail.test_accounts.map((acct) => {
            const meta = TEST_ACCOUNT_STATUS_META[acct.status];
            const pwCred = detail.credentials.find(
              (c) => c.id === acct.password_credential_id
            );
            return (
              <li key={acct.id} className="py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-14 font-medium text-white">
                        {acct.label}
                      </span>
                      <ToneBadge tone={meta.tone}>{meta.label}</ToneBadge>
                    </div>
                    <p className="mt-0.5 text-12 text-black-400">
                      Username: <span className="font-mono">{acct.username}</span>
                      {acct.login_url ? ` · ${acct.login_url}` : ""}
                    </p>
                    <p className="mt-0.5 text-12 text-black-500">
                      Password:{" "}
                      {pwCred
                        ? `stored in vault credential “${pwCred.label}”`
                        : "no vault credential linked"}
                      {" · "}Last verified:{" "}
                      {acct.last_verified_at
                        ? fmtDateTime(acct.last_verified_at)
                        : "never"}
                    </p>
                    {acct.instructions && (
                      <p className="mt-1 text-12 whitespace-pre-wrap text-black-400">
                        {acct.instructions}
                      </p>
                    )}
                    {acct.representative_data_note && (
                      <p className="mt-1 text-12 whitespace-pre-wrap text-black-500">
                        Representative data: {acct.representative_data_note}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(acct);
                        setFormOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-black-600 bg-black-800 px-2.5 py-1.5 text-12 font-medium text-black-200 hover:text-white"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(acct)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/20 px-2.5 py-1.5 text-12 font-medium text-rose-300 hover:text-rose-200"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <TestAccountFormModal
        open={formOpen}
        slug={detail.integration.slug}
        editing={editing}
        passwordCreds={passwordCreds}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          onChanged();
        }}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete test account"
        body={
          <>
            Delete the test account record{" "}
            <strong className="text-white">{deleteTarget?.label}</strong>?
            The linked vault credential (if any) is kept.
          </>
        }
        confirmLabel="Delete test account"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </SectionCard>
  );
}

function TestAccountFormModal({
  open,
  slug,
  editing,
  passwordCreds,
  onClose,
  onSaved,
}: {
  open: boolean;
  slug: string;
  editing: HubTestAccountRecord | null;
  passwordCreds: HubCredentialMetadata[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = editing !== null;
  const [label, setLabel] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [loginUrl, setLoginUrl] = React.useState("");
  const [status, setStatus] = React.useState<HubTestAccountStatus>("active");
  const [passwordCredentialId, setPasswordCredentialId] =
    React.useState<string>("");
  const [instructions, setInstructions] = React.useState("");
  const [repNote, setRepNote] = React.useState("");
  const [markVerified, setMarkVerified] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setMarkVerified(false);
    if (editing) {
      setLabel(editing.label);
      setUsername(editing.username);
      setLoginUrl(editing.login_url ?? "");
      setStatus(editing.status);
      setPasswordCredentialId(editing.password_credential_id ?? "");
      setInstructions(editing.instructions);
      setRepNote(editing.representative_data_note);
    } else {
      setLabel("");
      setUsername("");
      setLoginUrl("");
      setStatus("active");
      setPasswordCredentialId("");
      setInstructions("");
      setRepNote("");
    }
  }, [open, editing]);

  const submit = async () => {
    if (label.trim() === "" || username.trim() === "") {
      setError("Label and username are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        label: label.trim(),
        username: username.trim(),
        login_url: loginUrl.trim() === "" ? null : loginUrl.trim(),
        status,
        password_credential_id:
          passwordCredentialId === "" ? null : passwordCredentialId,
        instructions,
        representative_data_note: repNote,
        ...(markVerified ? { mark_verified: true } : {}),
      };
      if (isEdit && editing) {
        await updateHubTestAccount(editing.id, body);
      } else {
        await createHubTestAccount(slug, body);
      }
      onSaved();
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

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={isEdit ? "Edit test account" : "Add test account"}
      description="Never type the account password here — store it as a credential in the Credentials tab and link it."
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
            {saving ? "Saving…" : "Save test account"}
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
              placeholder="e.g. Reviewer test account"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-13 font-medium text-black-200">
              Username
            </label>
            <input
              className="input-field"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-13 font-medium text-black-200">
              Login URL (optional)
            </label>
            <input
              className="input-field font-mono"
              value={loginUrl}
              onChange={(e) => setLoginUrl(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-13 font-medium text-black-200">
              Status
            </label>
            <select
              className="input-field"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as HubTestAccountStatus)
              }
            >
              {HUB_TEST_ACCOUNT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TEST_ACCOUNT_STATUS_META[s].label}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-13 font-medium text-black-200">
              Password credential (from the vault)
            </label>
            <select
              className="input-field"
              value={passwordCredentialId}
              onChange={(e) => setPasswordCredentialId(e.target.value)}
            >
              <option value="">No credential linked</option>
              {passwordCreds.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} ({c.environment})
                </option>
              ))}
            </select>
            {passwordCreds.length === 0 && (
              <p className="mt-1 text-12 text-black-500">
                No password credentials exist yet — add one in the
                Credentials tab first if this account needs one.
              </p>
            )}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-13 font-medium text-black-200">
            Instructions for the reviewer
          </label>
          <textarea
            className="input-field"
            rows={3}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-13 font-medium text-black-200">
            Representative data note
          </label>
          <textarea
            className="input-field"
            rows={2}
            value={repNote}
            onChange={(e) => setRepNote(e.target.value)}
            placeholder="What sample data the account contains and why it is representative"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 text-13 text-black-200">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-black-600 bg-black-800 text-rose-600 focus:ring-rose-500"
            checked={markVerified}
            onChange={(e) => setMarkVerified(e.target.checked)}
          />
          Mark as verified now (stamps the last-verified time)
        </label>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  );
}
