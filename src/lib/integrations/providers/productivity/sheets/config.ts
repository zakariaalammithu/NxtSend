/**
 * Google Sheets configuration — auth type, env vars, capabilities, setup.
 * No secrets here: env var NAMES only. Values live in the encrypted
 * connection store (see ./adapter.ts) or the deployment environment.
 */

import type { ProviderAuthType } from "../../types";

export interface SheetsEnvVar {
  name: string;
  purpose: string;
  required: boolean;
}

export interface SheetsSettings {
  /** Spreadsheet id (also accepted from credential.extra.spreadsheetId). */
  spreadsheetId?: string;
  /** A1 range, e.g. "Leads!A1:H" (default "Leads!A1:H"). */
  range?: string;
  /** Range used for follow-up rows (default: same as range). */
  followUpRange?: string;
}

export const SHEETS_CONFIG = {
  id: "google-sheets",
  name: "Google Sheets",
  category: "productivity",
  authType: "oauth2" as ProviderAuthType,
  docsUrl: "https://developers.google.com/workspace/sheets/api",
  apiBaseUrl: "https://sheets.googleapis.com/v4",
  envVars: [
    { name: "GOOGLE_CLIENT_ID", purpose: "Existing Google OAuth client id (already used for Gmail).", required: true },
    { name: "GOOGLE_CLIENT_SECRET", purpose: "Existing Google OAuth client secret.", required: true },
    { name: "GOOGLE_SHEETS_SPREADSHEET_ID", purpose: "Target spreadsheet id (the long id in the sheet URL).", required: true },
  ] as SheetsEnvVar[],
  capabilities: [
    "Export leads to a sheet (values.append) and import leads from a sheet (values.get), with field mapping and email dedupe",
    "Reuses the existing Google OAuth connection — the spreadsheets scope is requested by the Google OAuth flow (src/lib/oauth/config.ts GOOGLE_SCOPES); a stored Gmail-only grant must re-connect Google before a live connection works",
    "Config-ready: no live sheet has been connected from this environment; sync is mock-tested only",
  ],
  setupSteps: [
    "Re-connect Google so the new spreadsheets scope is granted (the stored Gmail-only grant cannot call Sheets).",
    "Create a sheet with the header row: First Name, Last Name, Email, Company, Job Title, LinkedIn URL, Tags, Status.",
    "Share the sheet with the connected Google account (or create it in that account).",
    "Store the spreadsheet id + range (e.g. Leads!A1:H) in the NxtSend Google Sheets connection.",
  ],
} as const;
