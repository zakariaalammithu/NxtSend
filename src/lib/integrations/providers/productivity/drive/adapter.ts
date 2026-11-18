/**
 * Google Drive adapter — create a NxtSend Leads spreadsheet file,
 * list Drive files, import leads by exporting a sheet as CSV.
 *
 * Verified endpoints (Google Drive API v3 docs, checked 2026-11-19):
 *   GET  /drive/v3/files?q=...&fields=files(id,name,mimeType,webViewLink)
 *   POST /drive/v3/files  Body { name, mimeType } — creates a file
 *        (mimeType application/vnd.google-apps.spreadsheet creates
 *        an empty spreadsheet; content upload is a SEPARATE media
 *        endpoint and is NOT implemented — see below)
 *   GET  /drive/v3/files/{fileId}/export?mimeType=text/csv
 * Auth: OAuth 2.0 Bearer token. Reuses the existing Google OAuth
 * connection — the drive.file scope is requested by the Google
 * OAuth flow (GOOGLE_SCOPES); a stored Gmail-only grant must
 * re-connect Google before a live connection works.
 * NOT IMPLEMENTED, honestly: file-content upload. ProviderHttpClient
 * sends JSON bodies only, and Drive content upload needs multipart /
 * resumable media upload (POST https://www.googleapis.com/upload/
 * drive/v3/files). So exportLeads creates the spreadsheet FILE and
 * the Google Sheets adapter fills its rows — the two adapters are
 * designed to be used together.
 */

import { ProviderHttpClient } from "../../client";
import type { ProviderCredential } from "../../connections";
import {
  DEFAULT_LEAD_FIELD_MAPPING,
  dedupeLeadsByEmail,
  emptyExportResult,
  leadToRow,
  rowToLead,
  type ExportResult,
  type ImportResult,
  type ProductivityAdapter,
  type ProviderLeadRecord,
  type TaskResult,
} from "../types";
import { DRIVE_CONFIG, type DriveSettings } from "./config";

/** Minimal CSV parser: handles quoted fields + embedded commas. Good enough for the adapter's own exports. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim().length > 0));
}

export const DRIVE_FIELD_MAPPING = DEFAULT_LEAD_FIELD_MAPPING;

export function mapLeadToDrive(
  lead: ProviderLeadRecord,
  _settings: DriveSettings = {}
): Record<string, string> {
  void _settings;
  return leadToRow(DEFAULT_LEAD_FIELD_MAPPING, lead);
}

export function mapDriveToLead(
  row: Record<string, string | undefined>,
  _settings: DriveSettings = {}
): ProviderLeadRecord {
  void _settings;
  return rowToLead(DEFAULT_LEAD_FIELD_MAPPING, row);
}


export interface DriveAdapterDeps {
  /** Decrypted credential from the connection store, or null. */
  credential: ProviderCredential | null;
  settings: DriveSettings;
}

export function createDriveAdapter(deps: DriveAdapterDeps): ProductivityAdapter {
  const { credential, settings } = deps;
  const accessToken = credential?.accessToken;
  const fileId = settings.fileId ?? credential?.extra?.fileId;
  const folderId = settings.folderId ?? credential?.extra?.folderId;
  const client = new ProviderHttpClient({
    baseUrl: DRIVE_CONFIG.apiBaseUrl,
    getAuthHeaders: () => ({ Authorization: "Bearer " + accessToken }),
  });

  function checkConfiguration(): { configured: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!accessToken) missing.push("accessToken (Google OAuth — reconnect Google)");
    return { configured: missing.length === 0, missing };
  }

  async function exportLeads(leads: ProviderLeadRecord[]): Promise<ExportResult> {
    const config = checkConfiguration();
    if (!config.configured) {
      throw new Error("google-drive: configuration_required: missing " + config.missing.join(", "));
    }
    const { unique, duplicates } = dedupeLeadsByEmail(leads);
    const result = emptyExportResult();
    result.processed = leads.length;
    result.skipped = duplicates.length;
    if (unique.length === 0) return result;
    // Drive export creates the spreadsheet FILE only — content upload
    // needs multipart media upload, which ProviderHttpClient cannot
    // send. The Google Sheets adapter fills the file's rows.
    const today = new Date().toISOString().slice(0, 10);
    const res = await client.request<{ id?: string; webViewLink?: string }>({
      method: "POST",
      path: "/files",
      body: {
        name: "NxtSend Leads " + today,
        mimeType: "application/vnd.google-apps.spreadsheet",
        ...(folderId ? { parents: [folderId] } : {}),
      },
    });
    result.created = 1;
    result.createdIds = res.id ? [res.id] : [];
    return result;
  }

  async function importLeads(): Promise<ImportResult> {
    const config = checkConfiguration();
    if (!config.configured) {
      throw new Error("google-drive: configuration_required: missing " + config.missing.join(", "));
    }
    if (!fileId) {
      throw new Error("google-drive: configuration_required: missing fileId (spreadsheet to import from)");
    }
    const csv = await client.request<string>({
      method: "GET",
      path: "/files/" + fileId + "/export",
      query: { mimeType: "text/csv" },
    });
    const rows = parseCsvRows(typeof csv === "string" ? csv : "");
    if (rows.length < 2) return { leads: [], errors: [] };
    const headers = rows[0];
    const leads: ProviderLeadRecord[] = [];
    const errors: string[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row: Record<string, string> = {};
      headers.forEach((h, j) => {
        row[h] = rows[i][j] ?? "";
      });
      if (Object.values(row).every((v) => !v.trim())) continue;
      const lead = rowToLead(DEFAULT_LEAD_FIELD_MAPPING, row);
      if (!lead.firstName && !lead.email) {
        errors.push("Row " + (i + 1) + " has neither a first name nor an email — skipped.");
        continue;
      }
      leads.push(lead);
    }
    const { unique, duplicates } = dedupeLeadsByEmail(leads);
    if (duplicates.length > 0) errors.push(duplicates.length + " duplicate email(s) skipped on import.");
    return { leads: unique, errors };
  }

  async function createTaskFromLead(
    lead: ProviderLeadRecord,
    opts?: { dueDate?: string; notes?: string }
  ): Promise<TaskResult | null> {
    void lead;
    void opts;
    throw new Error(
      "google-drive: createTaskFromLead is not supported — Drive stores files, not tasks. " +
        "Use Google Calendar to schedule the follow-up."
    );
  }

  return { provider: "google-drive", exportLeads, importLeads, createTaskFromLead, checkConfiguration };
}
