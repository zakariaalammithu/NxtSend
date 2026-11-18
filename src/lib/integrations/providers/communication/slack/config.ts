/**
 * Slack configuration — auth type, env vars, capabilities, setup.
 * No secrets here: env var NAMES only. Values live in the encrypted
 * connection store (see ./adapter.ts) or the deployment environment.
 */

import type { ProviderAuthType } from "../../types";

export interface SlackEnvVar {
  name: string;
  purpose: string;
  required: boolean;
}

export interface SlackSettings {
  /** Incoming-webhook URL (also accepted from credential.extra.webhookUrl). */
  webhookUrl?: string;
  /** Bot token (also accepted from credential.accessToken). */
  botToken?: string;
  /** Channel id for chat.postMessage (also accepted from credential.extra.channelId). */
  channelId?: string;
}

export const SLACK_CONFIG = {
  id: "slack",
  name: "Slack",
  category: "communication",
  authType: "oauth2" as ProviderAuthType,
  docsUrl: "https://docs.slack.dev/",
  apiBaseUrl: "https://slack.com/api",
  envVars: [
    { name: "SLACK_WEBHOOK_URL", purpose: "Incoming-webhook URL for the target channel. Secret — store encrypted in the connection's extra bag, never in code.", required: false },
    { name: "SLACK_BOT_TOKEN", purpose: "Bot token (xoxb-…) with chat:write, for chat.postMessage delivery when no webhook is stored.", required: false },
    { name: "SLACK_CHANNEL_ID", purpose: "Channel id (C…) for chat.postMessage delivery.", required: false },
  ] as SlackEnvVar[],
  capabilities: [
    "Send NxtSend alerts (new lead, new reply, interested lead, campaign status, daily report, sync error) to a Slack channel",
    "Two delivery paths: incoming webhook (one URL per channel) or bot token + chat.postMessage (chat:write) — webhook is the default",
    "Config-ready: no live Slack workspace has been connected from this environment; delivery is mock-tested only",
  ],
  setupSteps: [
    "Create a Slack app at api.slack.com/apps.",
    "Enable Incoming Webhooks and add a webhook for the target channel — copy the URL (it is a secret).",
    "OR add the chat:write bot scope, install the app, and copy the bot token (xoxb-…) plus the channel id.",
    "Store the webhook URL (or bot token + channel id) in the NxtSend Slack connection — it is encrypted with TOKEN_ENCRYPTION_KEY.",
  ],
} as const;
