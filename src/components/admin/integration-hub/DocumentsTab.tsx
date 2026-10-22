"use client";

/** Documentation tab — the integration's stored documents (docs, notes,
 *  policies, manifests, copy-package snapshots), with a plain editor. */

import * as React from "react";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { fmtDateTime } from "../AdminBits";
import {
  HUB_DOCUMENT_KINDS,
  type HubDocumentKind,
  type HubDocumentRecord,
} from "@/lib/integration-hub/hub-core";
import type { HubDetailResponse } from "./hub-api";
import {
  createHubDocument,
  deleteHubDocument,
  updateHubDocument,
  HubApiError,
} from "./hub-api";
import { DOCUMENT_KIND_LABELS } from "./hub-ui";
import {
  ConfirmDialog,
  ErrorNote,
  SectionCard,
  ToneBadge,
} from "./HubBits";

export function DocumentsTab({
  detail,
  onChanged,
}: {
  detail: HubDetailResponse;
  onChanged: () => void;
}) {
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<HubDocumentRecord | null>(null);
  const [deleteTarget, setDeleteTarget] =
    React.useState<HubDocumentRecord | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteHubDocument(deleteTarget.id);
      setDeleteTarget(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && <ErrorNote>{error}</ErrorNote>}
      <SectionCard
        title="Documents"
        description="Setup guides, submission copy, policies and working notes stored with this integration. Global documents (not tied to one integration) are shown here too."
        action={
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-13 font-semibold text-white transition-colors hover:bg-rose-500"
          >
            <Plus className="h-4 w-4" /> New document
          </button>
        }
      >
        {detail.documents.length === 0 ? (
          <p className="text-13 text-black-400">
            No documents stored yet.
          </p>
        ) : (
          <ul className="divide-y divide-black-700/60">
            {detail.documents.map((doc) => (
              <li key={doc.id} className="py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-rose-400" />
                      <span className="text-14 font-medium text-white">
                        {doc.title}
                      </span>
                      <ToneBadge tone="zinc">
                        {DOCUMENT_KIND_LABELS[doc.kind]}
                      </ToneBadge>
                      <ToneBadge tone="zinc">v{doc.version}</ToneBadge>
                      {doc.integration_id === null && (
                        <ToneBadge tone="sky">Global</ToneBadge>
                      )}
                    </div>
                    <p className="mt-0.5 text-12 text-black-500">
                      {doc.slug} · updated {fmtDateTime(doc.updated_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded(expanded === doc.id ? null : doc.id)
                      }
                      className="rounded-lg border border-black-600 bg-black-800 px-2.5 py-1.5 text-12 font-medium text-black-200 hover:text-white"
                    >
                      {expanded === doc.id ? "Hide" : "View"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(doc);
                        setFormOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-black-600 bg-black-800 px-2.5 py-1.5 text-12 font-medium text-black-200 hover:text-white"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(doc)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/20 px-2.5 py-1.5 text-12 font-medium text-rose-300 hover:text-rose-200"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </div>
                {expanded === doc.id && (
                  <pre className="mt-3 max-h-96 overflow-auto rounded-xl border border-black-700 bg-black-900 p-4 font-mono text-12 whitespace-pre-wrap text-black-200">
                    {doc.body || "(empty document)"}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <DocumentFormModal
        open={formOpen}
        slug={detail.integration.slug}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          onChanged();
        }}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete document"
        body={
          <>
            Delete <strong className="text-white">{deleteTarget?.title}</strong>
            ? This cannot be undone.
          </>
        }
        confirmLabel="Delete document"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function DocumentFormModal({
  open,
  slug,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  slug: string;
  editing: HubDocumentRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = editing !== null;
  const [title, setTitle] = React.useState("");
  const [docSlug, setDocSlug] = React.useState("");
  const [kind, setKind] = React.useState<HubDocumentKind>("doc");
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing) {
      setTitle(editing.title);
      setDocSlug(editing.slug);
      setKind(editing.kind);
      setBody(editing.body);
    } else {
      setTitle("");
      setDocSlug("");
      setKind("doc");
      setBody("");
    }
  }, [open, editing]);

  const submit = async () => {
    if (title.trim() === "") {
      setError("Give the document a title.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEdit && editing) {
        await updateHubDocument(editing.id, {
          title: title.trim(),
          kind,
          body,
        });
      } else {
        await createHubDocument(slug, {
          title: title.trim(),
          ...(docSlug.trim() ? { slug: docSlug.trim() } : {}),
          kind,
          body,
        });
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
      title={isEdit ? "Edit document" : "New document"}
      size="xl"
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
            {saving ? "Saving…" : "Save document"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-13 font-medium text-black-200">
              Title
            </label>
            <input
              className="input-field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-13 font-medium text-black-200">
              Kind
            </label>
            <select
              className="input-field"
              value={kind}
              onChange={(e) => setKind(e.target.value as HubDocumentKind)}
            >
              {HUB_DOCUMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {DOCUMENT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
        </div>
        {!isEdit && (
          <div>
            <label className="mb-1.5 block text-13 font-medium text-black-200">
              Slug (optional — derived from the title when blank)
            </label>
            <input
              className="input-field font-mono"
              value={docSlug}
              onChange={(e) => setDocSlug(e.target.value)}
              placeholder="setup-guide"
            />
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-13 font-medium text-black-200">
            Body (Markdown or plain text)
          </label>
          <textarea
            className="input-field font-mono"
            rows={14}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  );
}
