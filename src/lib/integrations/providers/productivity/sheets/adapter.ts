/**
 * Google Sheets adapter — export leads to a sheet, import leads
 * from a sheet.
 *
 * Verified endpoints (Google Sheets API v4 docs, checked 2026-11-19):
 *   GET  /v4/spreadsheets/{spreadsheetId}/values/{range}
 *   POST /v4/spreadsheets/{spreadsheetId}/values/{range}:append
 *        ?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS
 *        Body { values: [[...]] }. Response { updates: { updatedRows,
 *        updatedRange } }.
 *   PUT  /v4/spreadsheets/{spreadsheetId}/values/{range}
 * Auth: OAuth 2.0 Bearer token. Reuses the existing Google OAuth
 * connection (src/lib/oauth/google.ts) — the spreadsheets scope
 * is requested by the Google OAuth flow (GOOGLE_SCOPES); a stored
 * Gmail-only grant must re-connect Google before a live connection
 * works. Until then this adapter reports
 * credentials/configuration errors honestly.
 * The target sheet must already have the header row
 * (First Name, Last Name, Email, Company, Job Title, LinkedIn URL,
 * Tags, Status) — export appends data rows below it.
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
import { SHEETS_CONFIG, type SheetsSettings } from "./config";

/** Default column order — the header row the sheet must already have. */
export const SHEETS_COLUMNS = DEFAULT_LEAD_FIELD_MAPPING.map((m) => m.target);

export const SHEETS_FIELD_MAPPING = DEFAULT_LEAD_FIELD_MAPPING;

export function mapLeadToSheets(
  lead: ProviderLeadRecord,
  _settings: SheetsSettings = {}
): Record<string, string> {
  void _settings;
  return leadToRow(DEFAULT_LEAD_FIELD_MAPPING, lead);
}

export function mapSheetsToLead(
  row: Record<string, string | undefined>,
  _settings: SheetsSettings = {}
): ProviderLeadRecord {
  void _settings;
  return rowToLead(DEFAULT_LEAD_FIELD_MAPPING, row);
}


export interface SheetsAdapterDeps {
  /** Decrypted credential from the connection store, or null. */
  credential: ProviderCredential | null;
  settings: SheetsSettings;
}

export function createSheetsAdapter(deps: SheetsAdapterDeps): ProductivityAdapter {
  const { credential, settings } = deps;
  const accessToken = credential?.accessToken;
  const spreadsheetId = settings.spreadsheetId ?? credential?.extra?.spreadsheetId;
  const range = settings.range ?? "Leads!A1:H";
  const followUpRange = settings.followUpRange ?? range;
  const client = new ProviderHttpClient({
    baseUrl: SHEETS_CONFIG.apiBaseUrl,
    getAuthHeaders: () => ({ Authorization: "Bearer " + accessToken }),
  });

  function checkConfiguration(): { configured: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!accessToken) missing.push("accessToken (Google OAuth — reconnect Google)");
    if (!spreadsheetId) missing.push("spreadsheetId");
    return { configured: missing.length === 0, missing };
  }

  async function exportLeads(leads: ProviderLeadRecord[]): Promise<ExportResult> {
    const config = checkConfiguration();
    if (!config.configured) {
      throw new Error("google-sheets: configuration_required: missing " + config.missing.join(", "));
    }
    const { unique, duplicates } = dedupeLeadsByEmail(leads);
    const result = emptyExportResult();
    result.processed = leads.length;
    result.skipped = duplicates.length;
    if (unique.length === 0) return result;
    const values = unique.map((lead) => {
      const row = leadToRow(DEFAULT_LEAD_FIELD_MAPPING, lead);
      return SHEETS_COLUMNS.map((col) => row[col] ?? "");
    });
    const res = await client.request<{ updates?: { updatedRows?: number } }>({
      method: "POST",
      path: "/spreadsheets/" + spreadsheetId + "/values/" + encodeURIComponent(range) + ":append",
      query: { valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS" },
      body: { values },
    });
    result.created = res.updates?.updatedRows ?? values.length;
    return result;
  }

  async function importLeads(): Promise<ImportResult> {
    const config = checkConfiguration();
    if (!config.configured) {
      throw new Error("google-sheets: configuration_required: missing " + config.missing.join(", "));
    }
    const res = await client.request<{ values?: string[][] }>({
      method: "GET",
      path: "/spreadsheets/" + spreadsheetId + "/values/" + encodeURIComponent(range),
    });
    const rows = res.values ?? [];
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
    if (duplicates.length > 0) {
      errors.push(duplicates.length + " duplicate email(s) skipped on import.");
    }
    return { leads: unique, errors };
  }

  async function createTaskFromLead(
    lead: ProviderLeadRecord,
    opts?: { dueDate?: string; notes?: string }
  ): Promise<TaskResult | null> {
    void opts;
    const config = checkConfiguration();
    if (!config.configured) {
      throw new Error("google-sheets: configuration_required: missing " + config.missing.join(", "));
    }
    const row = leadToRow(DEFAULT_LEAD_FIELD_MAPPING, lead);
    const values = [SHEETS_COLUMNS.map((col) => row[col] ?? "")];
    const res = await client.request<{ updates?: { updatedRange?: string } }>({
      method: "POST",
      path: "/spreadsheets/" + spreadsheetId + "/values/" + encodeURIComponent(followUpRange) + ":append",
      query: { valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS" },
      body: { values },
    });
    return {
      id: res.updates?.updatedRange ?? followUpRange,
      url: "https://docs.google.com/spreadsheets/d/" + spreadsheetId,
    };
  }

  return { provider: "google-sheets", exportLeads, importLeads, createTaskFromLead, checkConfiguration };
}
