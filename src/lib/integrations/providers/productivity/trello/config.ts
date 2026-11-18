/**
 * Trello configuration — auth type, env vars, capabilities, setup.
 * No secrets here: env var NAMES only. Values live in the encrypted
 * connection store (see ./adapter.ts) or the deployment environment.
 */

import type { ProviderAuthType } from "../../types";

export interface TrelloEnvVar {
  name: string;
  purpose: string;
  required: boolean;
}

export interface TrelloSettings {
  /** API key (also accepted from credential.extra.apiKey). */
  apiKey?: string;
  /** List id (also accepted from credential.extra.listId). */
  listId?: string;
}

export const TRELLO_CONFIG = {
  id: "trello",
  name: "Trello",
  category: "productivity",
  authType: "api_key" as ProviderAuthType,
  docsUrl: "https://developer.atlassian.com/cloud/trello/rest/",
  apiBaseUrl: "https://api.trello.com/1",
  envVars: [
    { name: "TRELLO_API_KEY", purpose: "API key from trello.com/app-key (identifies the app).", required: true },
    { name: "TRELLO_TOKEN", purpose: "API token from trello.com/app-key (grants access to the account — keep secret).", required: true },
    { name: "TRELLO_LIST_ID", purpose: "List id the follow-up cards are created in.", required: true },
  ] as TrelloEnvVar[],
  capabilities: [
    "Create follow-up cards from interested leads on a Trello list, and import cards back to leads (best-effort: name + description lines the adapter wrote)",
    "Authenticates with an API key + token passed as query parameters",
    "Config-ready: no live Trello board has been connected from this environment; sync is mock-tested only",
  ],
  setupSteps: [
    "Open trello.com/app-key, copy the API key, then generate a token (it grants access to your account — keep it secret).",
    "Copy the target list id (open the list; the id is in the board JSON or via GET /1/boards/{id}/lists).",
    "Store the key + token + list id in the NxtSend Trello connection — encrypted with TOKEN_ENCRYPTION_KEY.",
  ],
} as const;
