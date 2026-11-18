/**
 * ClickUp configuration — auth type, env vars, capabilities, setup.
 * No secrets here: env var NAMES only. Values live in the encrypted
 * connection store (see ./adapter.ts) or the deployment environment.
 */

import type { ProviderAuthType } from "../../types";

export interface ClickupEnvVar {
  name: string;
  purpose: string;
  required: boolean;
}

export interface ClickupSettings {
  /** List id (also accepted from credential.extra.listId). */
  listId?: string;
}

export const CLICKUP_CONFIG = {
  id: "clickup",
  name: "ClickUp",
  category: "productivity",
  authType: "api_key" as ProviderAuthType,
  docsUrl: "https://developer.clickup.com/reference",
  apiBaseUrl: "https://api.clickup.com/api/v2",
  envVars: [
    { name: "CLICKUP_API_TOKEN", purpose: "Personal API token (pk_…) from Settings → Apps → API Token.", required: true },
    { name: "CLICKUP_LIST_ID", purpose: "List id the follow-up tasks are created in (numeric id in the list URL).", required: true },
  ] as ClickupEnvVar[],
  capabilities: [
    "Create follow-up tasks from interested leads in a ClickUp list, and import tasks back to leads (best-effort: name + description lines the adapter wrote)",
    "Authenticates with a personal API token (Bearer); one request per task (no bulk create endpoint)",
    "Config-ready: no live ClickUp list has been connected from this environment; sync is mock-tested only",
  ],
  setupSteps: [
    "Copy a personal API token (ClickUp Settings → Apps → API Token).",
    "Copy the target list id from the list URL (the number after /li/).",
    "Store the token + list id in the NxtSend ClickUp connection — encrypted with TOKEN_ENCRYPTION_KEY.",
  ],
} as const;
