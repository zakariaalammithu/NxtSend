/**
 * Jira configuration — auth type, env vars, capabilities, setup.
 * No secrets here: env var NAMES only. Values live in the encrypted
 * connection store (see ./adapter.ts) or the deployment environment.
 */

import type { ProviderAuthType } from "../../types";

export interface JiraEnvVar {
  name: string;
  purpose: string;
  required: boolean;
}

export interface JiraSettings {
  /** Site subdomain, e.g. "acme" (also accepted from credential.extra.siteDomain). */
  siteDomain?: string;
  /** Atlassian account email (also accepted from credential.extra.email). */
  email?: string;
  /** Project key, e.g. "OPS" (also accepted from credential.extra.projectKey). */
  projectKey?: string;
  /** Issue type name (default "Task"). */
  issueType?: string;
}

export const JIRA_CONFIG = {
  id: "jira",
  name: "Jira",
  category: "productivity",
  authType: "api_key" as ProviderAuthType,
  docsUrl: "https://developer.atlassian.com/cloud/jira/platform/rest/v3/",
  apiBaseUrl: "",
  envVars: [
    { name: "JIRA_SITE_DOMAIN", purpose: "Site subdomain, e.g. acme (for https://acme.atlassian.net).", required: true },
    { name: "JIRA_EMAIL", purpose: "Atlassian account email used for Basic auth.", required: true },
    { name: "JIRA_API_TOKEN", purpose: "API token from Atlassian account security settings (passwords have not worked for Cloud since 2019).", required: true },
    { name: "JIRA_PROJECT_KEY", purpose: "Project key, e.g. OPS.", required: true },
  ] as JiraEnvVar[],
  capabilities: [
    "Create follow-up issues from interested leads in a Jira Cloud project (ADF description) and import issues via JQL search, with field mapping",
    "Authenticates with email + API token (Basic auth); Jira Cloud only — Data Center uses the v2 API and is not covered",
    "Config-ready: no live Jira site has been connected from this environment; sync is mock-tested only",
  ],
  setupSteps: [
    "Generate an API token (Atlassian account → Security → API tokens).",
    "Note the site subdomain (https://<site>.atlassian.net) and the target project key.",
    "Store the email + token + site + project key in the NxtSend Jira connection — encrypted with TOKEN_ENCRYPTION_KEY.",
  ],
} as const;
