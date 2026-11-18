/**
 * Monday.com configuration — auth type, env vars, capabilities, setup.
 * No secrets here: env var NAMES only. Values live in the encrypted
 * connection store (see ./adapter.ts) or the deployment environment.
 */

import type { ProviderAuthType } from "../../types";

export interface MondayEnvVar {
  name: string;
  purpose: string;
  required: boolean;
}

export interface MondaySettings {
  /** Board id (also accepted from credential.extra.boardId). */
  boardId?: string;
  /** Group id new items are created in (optional — monday default when omitted). */
  groupId?: string;
  /** Explicit column-id overrides: lead field -> column id. Resolved by title when omitted. */
  columnIds?: Record<string, string>;
}

export const MONDAY_CONFIG = {
  id: "monday",
  name: "Monday.com",
  category: "productivity",
  authType: "api_key" as ProviderAuthType,
  docsUrl: "https://developer.monday.com/api-reference/",
  apiBaseUrl: "https://api.monday.com/v2",
  envVars: [
    { name: "MONDAY_API_TOKEN", purpose: "API token (avatar → Administration → API, or Developers → My Access Tokens). Sent as the raw Authorization header value.", required: true },
    { name: "MONDAY_BOARD_ID", purpose: "Board id (numeric).", required: true },
  ] as MondayEnvVar[],
  capabilities: [
    "Export leads to a monday.com board as items (create_item) and import board items, with field mapping and email dedupe — productivity/task use only, NOT the CRM operations",
    "GraphQL API at api.monday.com/v2 with an API token; column ids are configurable per board",
    "Config-ready: no live monday.com board has been connected from this environment; sync is mock-tested only",
  ],
  setupSteps: [
    "Create a board with text columns titled: First Name, Last Name, Email, Company, Job Title, LinkedIn URL, Tags, Status.",
    "Generate an API token (avatar → Administration → API) and copy the board id from its URL.",
    "Store the token + board id in the NxtSend Monday.com connection — encrypted with TOKEN_ENCRYPTION_KEY.",
  ],
} as const;
