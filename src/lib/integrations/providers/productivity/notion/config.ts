/**
 * Notion configuration — auth type, env vars, capabilities, setup.
 * No secrets here: env var NAMES only. Values live in the encrypted
 * connection store (see ./adapter.ts) or the deployment environment.
 */

import type { ProviderAuthType } from "../../types";

export interface NotionEnvVar {
  name: string;
  purpose: string;
  required: boolean;
}

export interface NotionSettings {
  /** Database id (also accepted from credential.extra.databaseId). */
  databaseId?: string;
}

export const NOTION_CONFIG = {
  id: "notion",
  name: "Notion",
  category: "productivity",
  authType: "api_key" as ProviderAuthType,
  docsUrl: "https://developers.notion.com/reference/intro",
  apiBaseUrl: "https://api.notion.com/v1",
  envVars: [
    { name: "NOTION_TOKEN", purpose: "Internal integration secret (ntn_… / secret_…). Create the integration in Notion → Settings → Connections, then share the target database with it.", required: true },
    { name: "NOTION_DATABASE_ID", purpose: "Database id (from the database URL).", required: true },
  ] as NotionEnvVar[],
  capabilities: [
    "Export leads to a Notion database (create page, upsert by email) and import database rows, with field mapping and email dedupe",
    "Authenticates with an internal integration secret (Bearer token) + Notion-Version header; the database must be shared with the integration",
    "Config-ready: no live Notion database has been connected from this environment; sync is mock-tested only",
  ],
  setupSteps: [
    "Create an internal integration in Notion and copy its secret.",
    "Create a database with properties: Name (title), Email (email), Company (rich_text), Job Title (rich_text), LinkedIn URL (url), Tags (multi_select), Status (select).",
    "Share the database with the integration (… → Add connections).",
    "Store the secret + database id in the NxtSend Notion connection — encrypted with TOKEN_ENCRYPTION_KEY.",
  ],
} as const;
