/**
 * Linear configuration — auth type, env vars, capabilities, setup.
 * No secrets here: env var NAMES only. Values live in the encrypted
 * connection store (see ./adapter.ts) or the deployment environment.
 */

import type { ProviderAuthType } from "../../types";

export interface LinearEnvVar {
  name: string;
  purpose: string;
  required: boolean;
}

export interface LinearSettings {
  /** Team UUID (also accepted from credential.extra.teamId). */
  teamId?: string;
  /** Default issue priority 0–4 (optional). */
  priority?: number;
}

export const LINEAR_CONFIG = {
  id: "linear",
  name: "Linear",
  category: "productivity",
  authType: "api_key" as ProviderAuthType,
  docsUrl: "https://linear.app/developers",
  apiBaseUrl: "https://api.linear.app/graphql",
  envVars: [
    { name: "LINEAR_API_KEY", purpose: "Personal API key from Linear Settings → API (or an OAuth access token).", required: true },
    { name: "LINEAR_TEAM_ID", purpose: "Team UUID the follow-up issues are created in.", required: true },
  ] as LinearEnvVar[],
  capabilities: [
    "Create follow-up issues from interested leads in a Linear team (issueCreate) and import issues, with field mapping",
    "GraphQL API at api.linear.app/graphql with a personal API key or OAuth token",
    "Config-ready: no live Linear workspace has been connected from this environment; sync is mock-tested only",
  ],
  setupSteps: [
    "Generate a personal API key (Linear Settings → API).",
    "Copy the team id (Settings → Teams → the team's UUID).",
    "Store the key + team id in the NxtSend Linear connection — encrypted with TOKEN_ENCRYPTION_KEY.",
  ],
} as const;
