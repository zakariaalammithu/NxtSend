"use client";

/**
 * Shared CSV lead-import pipeline (P4 Stage 2 extraction).
 *
 * One implementation of pick → column mapping → validation → dedupe →
 * summary, used by BOTH the Leads page modal and the campaign wizard's
 * Audience step (the "Import from CSV" and "Import from CSV · My
 * Network" tabs). The pipeline itself lives in src/lib/data/csv.ts
 * (pure, unit-tested); this component is only the UI + repository
 * wiring, so both surfaces behave identically.
 *
 * The mapping table follows Closely's layout: one row per CSV key with
 * example values from the file and a "Match" dropdown of lead fields.
 */

import * as React from "react";
import { FileSpreadsheet, AlertTriangle, ArrowLeft, Users } from "lucide-react";
import { getLeadsRepository } from "@/lib/data";
import {
  LEAD_FIELDS,
  parseCsv,
  processCsvImport,
  suggestColumnMapping,
  type ColumnMapping,
  type CsvImportResult,
  type LeadFieldKey,
} from "@/lib/data/csv";
import type { Lead } from "@/types";

/** Closely caps a single CSV import at 5,000 people; so do we. */
export const MAX_CSV_DATA_ROWS = 5000;

type CsvStage = "pick" | "map" | "done";

export interface CsvImportProps {
  workspaceId: string | null;
  isDemo: boolean;
  /** Current workspace leads — dedupe identities are computed from these at import time. */
  existingLeads: Lead[];
  /** Called once per completed import with the created lead records. */
  onImported?: (created: Lead[], result: CsvImportResult, fileName: string) => void;
  /** "my-network" shows the LinkedIn connections-export guidance banner. */
  variant?: "standard" | "my-network";
  /** Wizard only: people already added to this campaign's audience. */
  audienceCount?: number;
  /** Modal usage: renders a Cancel/Close button in the action row. */
  onCancel?: () => void;
}

export function CsvImport({
  workspaceId,
  isDemo,
  existingLeads,
  onImported,
  variant = "standard",
  audienceCount,
  onCancel,
}: CsvImportProps) {
  const leadsRepo = React.useMemo(() => getLeadsRepository(), []);

  const [stage, setStage] = React.useState<CsvStage>("pick");
  const [fileName, setFileName] = React.useState("");
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<string[][]>([]);
  // Closely's mapping is per CSV key: header -> lead field key ("" = unmapped).
  const [headerField, setHeaderField] = React.useState<Record<string, string>>({});
  const [result, setResult] = React.useState<CsvImportResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isImporting, setIsImporting] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const mapping = React.useMemo<ColumnMapping>(() => {
    const m: ColumnMapping = {};
    for (const [header, field] of Object.entries(headerField)) {
      if (field) m[field as LeadFieldKey] = header;
    }
    return m;
  }, [headerField]);

  const canImport = Boolean(
    mapping.first_name && (mapping.email || mapping.linkedin_url)
  );

  const reset = () => {
    setStage("pick");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setHeaderField({});
    setResult(null);
    setError(null);
    setIsImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChosen = async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length < 2) {
        setError(
          "That file has no data rows — it needs a header row plus at least one lead row."
        );
        return;
      }
      if (parsed.length - 1 > MAX_CSV_DATA_ROWS) {
        setError(
          `That file has ${parsed.length - 1} data rows — a single import is capped at ${MAX_CSV_DATA_ROWS.toLocaleString()}. Please split the file and import it in parts.`
        );
        return;
      }
      const fileHeaders = parsed[0].map((h) => h.trim());
      const suggested = suggestColumnMapping(fileHeaders);
      const inverted: Record<string, string> = {};
      for (const [field, header] of Object.entries(suggested)) {
        if (header) inverted[header] = field;
      }
      setFileName(file.name);
      setHeaders(fileHeaders);
      setRows(parsed);
      setHeaderField(inverted);
      setStage("map");
    } catch {
      setError("Could not read that file. Please choose a valid CSV file.");
    }
  };

  const setFieldForHeader = (header: string, field: string) => {
    setHeaderField((prev) => {
      const next: Record<string, string> = {};
      for (const [h, f] of Object.entries(prev)) {
        // A lead field can be matched to only one CSV key.
        next[h] = field && f === field ? "" : f;
      }
      next[header] = field;
      return next;
    });
  };

  const exampleValues = (header: string): string => {
    const idx = headers.indexOf(header);
    if (idx < 0) return "";
    const values: string[] = [];
    for (let r = 1; r < rows.length && values.length < 3; r++) {
      const v = (rows[r][idx] ?? "").trim();
      if (v) values.push(v);
    }
    return values.join(", ");
  };

  const handleRunImport = async () => {
    if (!workspaceId) return;
    setIsImporting(true);
    setError(null);
    try {
      const importResult = processCsvImport(
        rows,
        mapping,
        existingLeads.map((l) => l.email ?? ""),
        existingLeads.map((l) => l.linkedin_url ?? "")
      );
      let created: Lead[] = [];
      if (importResult.leads.length > 0) {
        created = await leadsRepo.importLeads(workspaceId, importResult.leads);
      }
      setResult(importResult);
      setStage("done");
      onImported?.(created, importResult, fileName);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "The import failed. No leads were added."
      );
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-5">
      {variant === "my-network" && stage === "pick" && (
        <div className="rounded-2xl border border-blue-500/30 bg-blue-950/20 p-4 space-y-2">
          <h4 className="text-13 font-semibold text-white">
            Import your LinkedIn connections (My Network)
          </h4>
          <p className="text-12 text-black-300 leading-relaxed">
            In LinkedIn, go to <strong className="text-black-100">Settings &amp; Privacy →
            Data privacy → Get a copy of your data</strong>, request the{" "}
            <strong className="text-black-100">Connections</strong> archive, and upload the{" "}
            <code className="text-black-100">Connections.csv</code> file you receive here.
          </p>
          <p className="text-12 text-black-300 leading-relaxed">
            The My Network export has <strong className="text-black-100">no email column</strong> —
            people are matched and deduplicated by their LinkedIn URL instead.
          </p>
        </div>
      )}

      {audienceCount !== undefined && audienceCount > 0 && stage === "pick" && (
        <p className="flex items-center gap-2 text-12 text-emerald-300">
          <Users className="h-4 w-4" />
          {audienceCount} {audienceCount === 1 ? "person" : "people"} already added to
          this campaign&apos;s audience — you can import more.
        </p>
      )}

      {stage === "pick" && (
        <>
          <div
            data-testid="csv-dropzone"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void handleFileChosen(file);
            }}
            className={`rounded-2xl border-2 border-dashed p-8 text-center space-y-3 transition-colors ${
              dragOver
                ? "border-purple-400 bg-purple-600/10"
                : "border-black-600 bg-black-900/50"
            }`}
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-600/10 text-purple-400 border border-purple-500/20">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <div>
              <p className="text-14 font-medium text-white">
                Drag &amp; drop a CSV file here, or{" "}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-purple-300 underline underline-offset-2 hover:text-purple-200"
                >
                  click to choose one
                </button>
              </p>
              <p className="text-12 text-black-400 mt-1">
                The file is parsed in your browser. You will match its columns to lead
                fields before anything is imported. Up to {MAX_CSV_DATA_ROWS.toLocaleString()}{" "}
                people per file.
              </p>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileChosen(file);
            }}
          />
          {isDemo && (
            <p className="text-12 text-orange-300/90">
              Demo mode: imported leads are stored in this browser (localStorage)
              only — they are not uploaded anywhere.
            </p>
          )}
        </>
      )}

      {stage === "map" && (
        <>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h4 className="text-15 font-semibold text-white">
                Match your CSV keys to the right column
              </h4>
              <p className="text-12 text-black-400 mt-1">
                {fileName} · {Math.max(rows.length - 1, 0)} data row(s). Match each key
                from your file to a lead field.
              </p>
            </div>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 text-13 text-black-300 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Upload another CSV
            </button>
          </div>

          <div className="rounded-xl border border-black-700 overflow-hidden">
            <div className="grid grid-cols-[1fr_1.2fr_180px] gap-3 px-4 py-2.5 bg-black-800/80 text-11 font-semibold uppercase tracking-wide text-black-400 max-sm:hidden">
              <span>Your CSV keys</span>
              <span>Example</span>
              <span className="text-right">Match</span>
            </div>
            <div className="divide-y divide-black-700/60">
              {headers.map((header) => (
                <div
                  key={header}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_1.2fr_180px] gap-2 sm:gap-3 items-center px-4 py-2.5"
                >
                  <span className="text-13 font-medium text-white break-all">{header}</span>
                  <span className="text-12 text-black-400 truncate">
                    {exampleValues(header) || "—"}
                  </span>
                  <select
                    aria-label={`Match for ${header}`}
                    value={headerField[header] ?? ""}
                    onChange={(e) => setFieldForHeader(header, e.target.value)}
                    className="w-full rounded-xl border border-black-600 bg-black-800 px-3 py-2 text-13 text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">— Unmapped —</option>
                    {LEAD_FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <p className="text-12 text-rose-300/90">
            * Required keys: First Name — and every row needs an Email or a LinkedIn
            URL. Rows that fail validation or duplicate an existing person are
            reported, not imported.
          </p>
        </>
      )}

      {stage === "done" && result && (
        <div className="space-y-4" data-testid="csv-summary">
          <h4 className="text-14 font-semibold text-white">Import summary</h4>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-emerald-950/30 border border-emerald-500/30 p-3">
              <div className="text-20 font-bold text-emerald-300">{result.leads.length}</div>
              <div className="text-11 text-black-300">Added</div>
            </div>
            <div className="rounded-xl bg-amber-950/30 border border-amber-500/30 p-3">
              <div className="text-20 font-bold text-amber-300">{result.duplicates.length}</div>
              <div className="text-11 text-black-300">Duplicates skipped</div>
            </div>
            <div className="rounded-xl bg-rose-950/30 border border-rose-500/30 p-3">
              <div className="text-20 font-bold text-rose-300">{result.errors.length}</div>
              <div className="text-11 text-black-300">Rows with errors</div>
            </div>
          </div>

          {result.duplicates.length > 0 && (
            <div>
              <h5 className="text-12 font-semibold text-amber-300 mb-1">
                Duplicates (by email or LinkedIn URL):
              </h5>
              <ul className="text-12 text-black-300 space-y-0.5 max-h-28 overflow-y-auto">
                {result.duplicates.slice(0, 10).map((d, i) => (
                  <li key={i}>
                    Row {d.row}: {d.identity} —{" "}
                    {d.reason === "existing"
                      ? "already in your leads"
                      : "duplicate inside the file"}
                  </li>
                ))}
                {result.duplicates.length > 10 && (
                  <li>…and {result.duplicates.length - 10} more</li>
                )}
              </ul>
            </div>
          )}

          {result.errors.length > 0 && (
            <div>
              <h5 className="text-12 font-semibold text-rose-300 mb-1">Row errors:</h5>
              <ul className="text-12 text-black-300 space-y-0.5 max-h-28 overflow-y-auto">
                {result.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>
                    Row {e.row}: {e.messages.join("; ")}
                  </li>
                ))}
                {result.errors.length > 10 && (
                  <li>…and {result.errors.length - 10} more</li>
                )}
              </ul>
            </div>
          )}

          {isDemo && (
            <p className="text-12 text-orange-300/90">
              Demo mode: the added leads were saved to this browser&apos;s demo store
              (localStorage).
            </p>
          )}

          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 text-13 text-black-300 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Upload another CSV
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/20 px-4 py-3 text-12 text-rose-200 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {(onCancel || stage === "map") && (
        <div className="flex justify-end gap-3 pt-3 border-t border-black-700">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl bg-black-800 hover:bg-black-700 px-4 py-2 text-13 font-medium text-white"
            >
              {stage === "done" ? "Close" : "Cancel"}
            </button>
          )}
          {stage === "map" && (
            <button
              type="button"
              data-testid="csv-import-button"
              disabled={isImporting || !canImport}
              onClick={handleRunImport}
              className="rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-2 text-13 font-semibold text-white shadow-glow-purple disabled:opacity-40"
              title={
                canImport
                  ? undefined
                  : "Map First Name and an Email or LinkedIn URL column first"
              }
            >
              {isImporting ? "Importing…" : "Validate & Import"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default CsvImport;
