/**
 * Airtable configuration — auth type, env vars, capabilities, setup.
 * No secrets here: env var NAMES only. Values live in the encrypted
 * connection store (see ./adapter.ts) or the deployment environment.
 */

import type { ProviderAuthType } from "../../types";

export interface AirtableEnvVar {
  name: string;
  purpose: string;
  required: boolean;
}

export interface AirtableSettings {
  /** Base id (also accepted from credential.extra.baseId). */
  baseId?: string;
  /** Table id or name (also accepted from credential.extra.tableId). */
  tableId?: string;
}

export const AIRTABLE_CONFIG = {
  id: "airtable",
  name: "Airtable",
  category: "productivity",
  authType: "api_key" as ProviderAuthType,
  docsUrl: "https://airtable.com/developers/web/api/introduction",
  apiBaseUrl: "https://api.airtable.com/v0",
  envVars: [
    { name: "AIRTABLE_PAT", purpose: "Personal access token with data.records:read + data.records:write on the target base.", required: true },
    { name: "AIRTABLE_BASE_ID", purpose: "Base id (app…).", required: true },
    { name: "AIRTABLE_TABLE_ID", purpose: "Table id or name (prefer the id — renames do not break it).", required: true },
  ] as AirtableEnvVar[],
  capabilities: [
    "Export leads to an Airtable table (up to 10 records per request, chunked) and import records, with field mapping and email dedupe",
    "Authenticates with a personal access token (legacy API keys were shut off 1 Feb 2024); scopes data.records:read / data.records:write",
    "Config-ready: no live Airtable base has been connected from this environment; sync is mock-tested only",
  ],
  setupSteps: [
    "Create a personal access token (Airtable account → Developer → Personal access tokens) with data.records:read + data.records:write on the target base.",
    "Create a table with fields: First Name, Last Name, Email, Company, Job Title, LinkedIn URL, Tags, Status.",
    "Copy the base id + table id from the base's API documentation page.",
    "Store the token + base/table ids in the NxtSend Airtable connection — encrypted with TOKEN_ENCRYPTION_KEY.",
  ],
} as const;
