/**
 * Asana configuration — auth type, env vars, capabilities, setup.
 * No secrets here: env var NAMES only. Values live in the encrypted
 * connection store (see ./adapter.ts) or the deployment environment.
 */

import type { ProviderAuthType } from "../../types";

export interface AsanaEnvVar {
  name: string;
  purpose: string;
  required: boolean;
}

export interface AsanaSettings {
  /** Project gid (also accepted from credential.extra.projectGid). */
  projectGid?: string;
  /** Workspace gid (also accepted from credential.extra.workspaceGid). */
  workspaceGid?: string;
}

export const ASANA_CONFIG = {
  id: "asana",
  name: "Asana",
  category: "productivity",
  authType: "oauth2" as ProviderAuthType,
  docsUrl: "https://developers.asana.com/reference/rest-api-reference",
  apiBaseUrl: "https://app.asana.com/api/1.0",
  envVars: [
    { name: "ASANA_ACCESS_TOKEN", purpose: "Personal access token (Developer Console → Personal access tokens) or OAuth access token, with tasks:write.", required: true },
    { name: "ASANA_PROJECT_GID", purpose: "Project gid the follow-up tasks are created in.", required: true },
    { name: "ASANA_WORKSPACE_GID", purpose: "Workspace gid (required when creating a task without a project).", required: false },
  ] as AsanaEnvVar[],
  capabilities: [
    "Create follow-up tasks from interested leads in an Asana project, and import tasks back to leads (best-effort: name + description lines the adapter wrote)",
    "Authenticates with a personal access token (Bearer) or OAuth; task creation requires the tasks:write scope",
    "Config-ready: no live Asana project has been connected from this environment; sync is mock-tested only",
  ],
  setupSteps: [
    "Generate a personal access token (Asana Developer Console → Personal access tokens) or set up OAuth.",
    "Copy the project gid from the project URL (app.asana.com/0/<gid>/list).",
    "Store the token + project gid in the NxtSend Asana connection — encrypted with TOKEN_ENCRYPTION_KEY.",
  ],
} as const;
