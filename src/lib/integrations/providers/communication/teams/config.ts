/**
 * Microsoft Teams configuration — auth type, env vars, capabilities, setup.
 * No secrets here: env var NAMES only. Values live in the encrypted
 * connection store (see ./adapter.ts) or the deployment environment.
 */

import type { ProviderAuthType } from "../../types";

export interface TeamsEnvVar {
  name: string;
  purpose: string;
  required: boolean;
}

export interface TeamsSettings {
  /** Teams Workflows webhook URL (also accepted from credential.extra.webhookUrl). */
  webhookUrl?: string;
}

export const TEAMS_CONFIG = {
  id: "teams",
  name: "Microsoft Teams",
  category: "communication",
  authType: "webhook" as ProviderAuthType,
  docsUrl: "https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/what-are-webhooks-and-connectors",
  envVars: [
    { name: "TEAMS_WEBHOOK_URL", purpose: "Teams Workflows webhook URL for the target channel. Secret — store encrypted in the connection's extra bag, never in code.", required: true },
  ] as TeamsEnvVar[],
  capabilities: [
    "Send NxtSend alerts to a Teams channel via a Teams Workflows webhook (the Office 365 Connector / incoming-webhook path is deprecated — new webhooks must be created as Workflows)",
    "Microsoft Graph channel-message sending is NOT implemented: Graph application permissions cannot send channel messages (delegated ChatMessage.Send / ChannelMessage.Send only), so the webhook is the supported path",
    "Config-ready: no live Teams webhook has been connected from this environment; delivery is mock-tested only",
  ],
  setupSteps: [
    "In Teams, open the target channel → … → Workflows → pick the 'Post to a channel when a webhook request is received' template (or build one from the webhook trigger).",
    "Copy the webhook URL the workflow issues (it is a secret).",
    "In the workflow, map the incoming 'text' field into the message the workflow posts — the adapter sends { text: '<title>\n<body>' }.",
    "Store the webhook URL in the NxtSend Teams connection — it is encrypted with TOKEN_ENCRYPTION_KEY.",
  ],
} as const;
