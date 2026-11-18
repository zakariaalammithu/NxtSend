/**
 * Shared shape for every productivity adapter.
 *
 * A productivity adapter moves NxtSend lead records in and out of a
 * provider (spreadsheet, database, board, task list, calendar) via
 * ProviderHttpClient. Field mapping is explicit: `FieldMapping`
 * rows (source = NxtSend lead field, target = provider column /
 * field name) so an operator can see exactly what lands where.
 *
 * Dedupe reuses the engine rule (`dedupeLeadsByEmail` from
 * ../sync.ts) — first occurrence wins, later rows with the same
 * normalised email are skipped and counted, never silently merged.
 *
 * Sync tracking: adapters return plain counts; the CALLER wraps the
 * call in `withSyncJob` (below) so the run is recorded in
 * `integration_sync_jobs` (migration 030). Adapters never write
 * jobs themselves.
 *
 * Unsupported operations throw a plain Error naming the provider
 * and the operation (e.g. Calendly cannot receive leads — its API
 * v2 has no create-event endpoint). That is honest, not a silent
 * no-op: the caller surfaces it as a failed sync with the reason.
 */

import type { FieldMapping, SyncResult } from "../types";
import {
  createSyncJob,
  finishSyncJob,
  recordSyncError,
  dedupeLeadsByEmail,
  type SyncJobStore,
} from "../sync";

/** One NxtSend lead, in provider-neutral shape. */
export interface ProviderLeadRecord {
  firstName: string;
  lastName?: string;
  email?: string;
  company?: string;
  jobTitle?: string;
  linkedinUrl?: string;
  tags?: string[];
  status?: string;
  /** Provider-side id, when the record came from an import. */
  sourceId?: string;
}

export interface ExportResult {
  /** Rows offered to the provider (before dedupe/skips). */
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  /** Provider-side ids of created records, when the provider returns them. */
  createdIds?: string[];
}

export interface ImportResult {
  leads: ProviderLeadRecord[];
  errors: string[];
}

export interface TaskResult {
  /** Provider-side task/issue/card/event id (or the scheduling link, for Calendly). */
  id: string;
  url: string | null;
}

export interface ProductivityAdapter {
  readonly provider: string;
  exportLeads(leads: ProviderLeadRecord[]): Promise<ExportResult>;
  importLeads(): Promise<ImportResult>;
  /**
   * Creates a follow-up task (or a calendar event / scheduling link,
   * for the calendar providers) for one interested lead. Returns
   * null only when the provider has no task concept AND no
   * scheduling concept — every adapter in this tree returns a
   * result or throws.
   */
  createTaskFromLead(
    lead: ProviderLeadRecord,
    opts?: { dueDate?: string; notes?: string }
  ): Promise<TaskResult | null>;
  checkConfiguration(): { configured: boolean; missing: string[] };
}

/** NxtSend lead field → default provider column/field name. */
export const DEFAULT_LEAD_FIELD_MAPPING: FieldMapping[] = [
  { source: "firstName", target: "First Name", required: true },
  { source: "lastName", target: "Last Name", required: false },
  { source: "email", target: "Email", required: false },
  { source: "company", target: "Company", required: false },
  { source: "jobTitle", target: "Job Title", required: false },
  { source: "linkedinUrl", target: "LinkedIn URL", required: false },
  { source: "tags", target: "Tags", required: false },
  { source: "status", target: "Status", required: false },
];

export function leadFieldValue(
  lead: ProviderLeadRecord,
  source: string
): string {
  switch (source) {
    case "firstName":
      return lead.firstName ?? "";
    case "lastName":
      return lead.lastName ?? "";
    case "email":
      return lead.email ?? "";
    case "company":
      return lead.company ?? "";
    case "jobTitle":
      return lead.jobTitle ?? "";
    case "linkedinUrl":
      return lead.linkedinUrl ?? "";
    case "tags":
      return (lead.tags ?? []).join(", ");
    case "status":
      return lead.status ?? "";
    default:
      return "";
  }
}

/** Maps one lead to a provider row keyed by target column/field name. */
export function leadToRow(
  mapping: FieldMapping[],
  lead: ProviderLeadRecord
): Record<string, string> {
  const row: Record<string, string> = {};
  for (const m of mapping) row[m.target] = leadFieldValue(lead, m.source);
  return row;
}

/** Maps one provider row back to a lead, matching target names. */
export function rowToLead(
  mapping: FieldMapping[],
  row: Record<string, string | undefined>
): ProviderLeadRecord {
  const byTarget = new Map(mapping.map((m) => [m.target, m.source]));
  const lead: ProviderLeadRecord = { firstName: "" };
  for (const [target, value] of Object.entries(row)) {
    const source = byTarget.get(target);
    if (!source || value === undefined) continue;
    switch (source) {
      case "firstName":
        lead.firstName = value;
        break;
      case "lastName":
        lead.lastName = value;
        break;
      case "email":
        lead.email = value;
        break;
      case "company":
        lead.company = value;
        break;
      case "jobTitle":
        lead.jobTitle = value;
        break;
      case "linkedinUrl":
        lead.linkedinUrl = value;
        break;
      case "tags":
        lead.tags = value
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        break;
      case "status":
        lead.status = value;
        break;
    }
  }
  return lead;
}

/** Splits a full name into first/last on the first space. */
export function splitName(fullName: string): { firstName: string; lastName?: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "" };
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/** Task title for a follow-up task created from a lead. */
export function taskTitleForLead(lead: ProviderLeadRecord): string {
  const name = `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() || "Unknown lead";
  const company = lead.company ? ` (${lead.company})` : "";
  return `Follow up: ${name}${company}`;
}

/** Task body for a follow-up task created from a lead. */
export function taskDescriptionForLead(lead: ProviderLeadRecord): string {
  const lines = [`Follow up with ${`${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() || "this lead"}.`];
  if (lead.email) lines.push(`Email: ${lead.email}`);
  if (lead.company) lines.push(`Company: ${lead.company}`);
  if (lead.jobTitle) lines.push(`Job title: ${lead.jobTitle}`);
  if (lead.linkedinUrl) lines.push(`LinkedIn: ${lead.linkedinUrl}`);
  if (lead.tags && lead.tags.length > 0) lines.push(`Tags: ${lead.tags.join(", ")}`);
  lines.push("Created from NxtSend (interested lead).");
  return lines.join("\n");
}

/**
 * Parses the task description this adapter writes back into fields.
 * Best-effort: only the "Email: / Company: / Job title: / LinkedIn:"
 * lines the adapter itself wrote are recognised.
 */
export function parseTaskDescription(description: string): Partial<ProviderLeadRecord> {
  const out: Partial<ProviderLeadRecord> = {};
  for (const line of description.split("\n")) {
    const match = /^(Email|Company|Job title|LinkedIn):\s*(.+)$/.exec(line.trim());
    if (!match) continue;
    const value = match[2].trim();
    if (match[1] === "Email") out.email = value;
    if (match[1] === "Company") out.company = value;
    if (match[1] === "Job title") out.jobTitle = value;
    if (match[1] === "LinkedIn") out.linkedinUrl = value;
  }
  return out;
}

export function emptyExportResult(): ExportResult {
  return { processed: 0, created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
}

/** Dedupe helper — re-exported so adapters import from one place. */
export { dedupeLeadsByEmail };

/**
 * Runs one import/export function inside a sync job: creates the
 * job, runs `fn` (which returns the counts), finishes the job, and
 * records any thrown error on the job before rethrowing. The
 * caller supplies the store; adapters stay job-free.
 */
export async function withSyncJob(
  store: SyncJobStore,
  input: { workspaceId: string; provider: string; direction: "import" | "export" },
  fn: () => Promise<Omit<SyncResult, "jobId" | "provider" | "direction">>
): Promise<SyncResult> {
  const job = await createSyncJob(store, input);
  try {
    const counts = await fn();
    await finishSyncJob(store, job.id, counts);
    return {
      jobId: job.id,
      provider: input.provider,
      direction: input.direction,
      processed: counts.processed,
      created: counts.created,
      updated: counts.updated,
      skipped: counts.skipped,
      failed: counts.failed,
      errors: counts.errors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed.";
    await recordSyncError(store, job.id, message);
    throw err;
  }
}
