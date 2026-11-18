/**
 * Google Drive configuration — auth type, env vars, capabilities, setup.
 * No secrets here: env var NAMES only. Values live in the encrypted
 * connection store (see ./adapter.ts) or the deployment environment.
 */

import type { ProviderAuthType } from "../../types";

export interface DriveEnvVar {
  name: string;
  purpose: string;
  required: boolean;
}

export interface DriveSettings {
  /** Spreadsheet file id to import from (also accepted from credential.extra.fileId). */
  fileId?: string;
  /** Folder id new export files are created in (optional). */
  folderId?: string;
}

export const DRIVE_CONFIG = {
  id: "google-drive",
  name: "Google Drive",
  category: "productivity",
  authType: "oauth2" as ProviderAuthType,
  docsUrl: "https://developers.google.com/workspace/drive/api",
  apiBaseUrl: "https://www.googleapis.com/drive/v3",
  envVars: [
    { name: "GOOGLE_CLIENT_ID", purpose: "Existing Google OAuth client id (already used for Gmail).", required: true },
    { name: "GOOGLE_CLIENT_SECRET", purpose: "Existing Google OAuth client secret.", required: true },
  ] as DriveEnvVar[],
  capabilities: [
    "Create a NxtSend Leads spreadsheet file in Drive, list Drive files, and import leads by exporting a sheet as CSV",
    "File-content upload (multipart / resumable) is NOT implemented: ProviderHttpClient sends JSON bodies only, so raw-byte upload has no transport in the engine",
    "Reuses the existing Google OAuth connection — the drive.file scope is requested by the Google OAuth flow (src/lib/oauth/config.ts GOOGLE_SCOPES); a stored Gmail-only grant must re-connect Google before a live connection works",
    "Config-ready: no live Drive account has been connected from this environment; sync is mock-tested only",
  ],
  setupSteps: [
    "Re-connect Google so the new drive.file scope is granted.",
    "Export creates a spreadsheet file in Drive; use the Google Sheets adapter (same connection) to fill its rows.",
    "For import, store the spreadsheet file id in the connection settings.",
  ],
} as const;
