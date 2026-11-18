/**
 * Discord configuration — auth type, env vars, capabilities, setup.
 * No secrets here: env var NAMES only. Values live in the encrypted
 * connection store (see ./adapter.ts) or the deployment environment.
 */

import type { ProviderAuthType } from "../../types";

export interface DiscordEnvVar {
  name: string;
  purpose: string;
  required: boolean;
}

export interface DiscordSettings {
  /** Channel webhook URL (also accepted from credential.extra.webhookUrl). */
  webhookUrl?: string;
}

export const DISCORD_CONFIG = {
  id: "discord",
  name: "Discord",
  category: "communication",
  authType: "webhook" as ProviderAuthType,
  docsUrl: "https://discord.com/developers/docs/resources/webhook",
  apiBaseUrl: "https://discord.com/api/v10",
  envVars: [
    { name: "DISCORD_WEBHOOK_URL", purpose: "Channel webhook URL (https://discord.com/api/webhooks/<id>/<token>). Secret — store encrypted in the connection's extra bag, never in code.", required: true },
  ] as DiscordEnvVar[],
  capabilities: [
    "Send NxtSend alerts to a Discord channel via a channel webhook (POST /api/v10/webhooks/{id}/{token}) — one-way, no bot account needed",
    "Config-ready: no live Discord webhook has been connected from this environment; delivery is mock-tested only",
  ],
  setupSteps: [
    "In Discord: Server Settings → Integrations → Webhooks → New Webhook → pick the channel → Copy Webhook URL (you need Manage Webhooks).",
    "Store the webhook URL in the NxtSend Discord connection — it is encrypted with TOKEN_ENCRYPTION_KEY.",
  ],
} as const;
