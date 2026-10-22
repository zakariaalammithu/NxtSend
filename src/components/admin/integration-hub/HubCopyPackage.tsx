"use client";

/**
 * HubCopyPackage — the "Copy Integration Package" control.
 *
 * Default packages (Markdown / JSON) are generated server-side from the
 * stored records and NEVER contain credential values. Exporting WITH
 * credentials is a separate, explicit action: the admin picks individual
 * credentials in a warning dialog, the server audits the export
 * (HUB_COPY_PACKAGE_GENERATE), and only the selected values are included.
 */

import * as React from "react";
import { PackageOpen, ShieldAlert } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import type { HubCredentialMetadata } from "@/lib/integration-hub/hub-core";
import { CopyButton, copyTextToClipboard } from "../CopyButton";
import { copyHubPackage, HubApiError } from "./hub-api";
import {
  CREDENTIAL_KIND_LABELS,
  isSecretCredentialKind,
  maskCredentialValue,
} from "./hub-ui";
import { ErrorNote, WarningNote } from "./HubBits";

export function HubCopyPackage({
  slug,
  credentials,
  showExport = true,
}: {
  slug: string;
  /** Needed only for the export-with-credentials picker (detail page). */
  credentials?: HubCredentialMetadata[];
  showExport?: boolean;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [format, setFormat] = React.useState<"md" | "json">("md");
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);
  const [exportDone, setExportDone] = React.useState(false);

  const exportable = (credentials ?? []).filter((c) => c.has_value);

  const doExport = async () => {
    if (selected.length === 0) return;
    setExporting(true);
    setExportError(null);
    setExportDone(false);
    try {
      const result = await copyHubPackage(slug, format, selected);
      const ok = await copyTextToClipboard(result.content);
      if (ok) {
        setExportDone(true);
      } else {
        setExportError(
          "The package was generated but your browser blocked the clipboard write. Try again, or copy the standard package and add the values manually from the Credentials tab."
        );
      }
    } catch (err) {
      setExportError(
        err instanceof HubApiError
          ? err.message
          : "Export failed. Please try again."
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-12 font-medium text-black-300">
          <PackageOpen className="h-4 w-4 text-rose-400" />
          Copy Integration Package
        </span>
        <CopyButton
          label="Markdown"
          text={async () => (await copyHubPackage(slug, "md")).content}
          onError={setError}
          onCopied={() => setError(null)}
        />
        <CopyButton
          label="JSON"
          text={async () => (await copyHubPackage(slug, "json")).content}
          onError={setError}
          onCopied={() => setError(null)}
        />
        {showExport && (
          <button
            type="button"
            onClick={() => {
              setExportOpen(true);
              setExportError(null);
              setExportDone(false);
              setSelected([]);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/20 px-2.5 py-1.5 text-12 font-medium text-amber-300 transition-colors hover:text-amber-200"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Export with credentials…
          </button>
        )}
      </div>
      <p className="text-11 text-black-500">
        Markdown / JSON packages never include credential values.
      </p>
      {error && <ErrorNote>{error}</ErrorNote>}

      <Modal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export package with credentials"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setExportOpen(false)}
              className="rounded-xl border border-black-600 bg-black-800 px-4 py-2 text-13 font-medium text-black-200 transition-colors hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={doExport}
              disabled={exporting || selected.length === 0}
              className="rounded-xl bg-rose-600 px-4 py-2 text-13 font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-50"
            >
              {exporting
                ? "Exporting…"
                : `Export ${selected.length} credential${selected.length === 1 ? "" : "s"} to clipboard`}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <WarningNote>
            This exports REAL credential values into the copied package. The
            export is written to the audit log with your admin identity.
            Paste it only into the destination it is intended for, and never
            into chat, email or a public document.
          </WarningNote>
          {exportable.length === 0 ? (
            <p className="text-13 text-black-400">
              No credentials with stored values exist for this integration
              yet, so there is nothing to export.
            </p>
          ) : (
            <div className="space-y-2">
              {exportable.map((cred) => (
                <label
                  key={cred.id}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-black-700 bg-black-800/60 p-3"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-black-600 bg-black-800 text-rose-600 focus:ring-rose-500"
                    checked={selected.includes(cred.id)}
                    onChange={(e) =>
                      setSelected((prev) =>
                        e.target.checked
                          ? [...prev, cred.id]
                          : prev.filter((id) => id !== cred.id)
                      )
                    }
                  />
                  <span className="min-w-0">
                    <span className="block text-13 font-medium text-white">
                      {cred.label}
                    </span>
                    <span className="block text-12 text-black-400">
                      {CREDENTIAL_KIND_LABELS[cred.kind]} · {cred.environment} ·{" "}
                      {maskCredentialValue(cred)}
                      {isSecretCredentialKind(cred.kind) ? " · secret" : ""}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 text-13 text-black-300">
            <span>Format:</span>
            {(["md", "json"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                className={
                  format === f
                    ? "rounded-lg border border-rose-500/50 bg-rose-600/15 px-2.5 py-1 text-12 font-medium text-rose-200"
                    : "rounded-lg border border-black-600 bg-black-800 px-2.5 py-1 text-12 text-black-300 hover:text-white"
                }
              >
                {f === "md" ? "Markdown" : "JSON"}
              </button>
            ))}
          </div>
          {exportError && <ErrorNote>{exportError}</ErrorNote>}
          {exportDone && (
            <p className="text-13 text-emerald-300">
              Exported to your clipboard. Handle it as a secret.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
