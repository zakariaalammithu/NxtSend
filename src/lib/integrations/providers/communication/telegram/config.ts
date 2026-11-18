/**
 * Telegram Bot configuration — auth type, env vars, capabilities, setup.
 * No secrets here: env var NAMES only. Values live in the encrypted
 * connection store (see ./adapter.ts) or the deployment environment.
 */

import type { ProviderAuthType } from "../../types";

export interface TelegramEnvVar {
  name: string;
  purpose: string;
  required: boolean;
}

export interface TelegramSettings {
  /** Bot token (also accepted from credential.accessToken). */
  botToken?: string;
  /** Target chat id (also accepted from credential.extra.chatId). */
  chatId?: string;
}

export const TELEGRAM_CONFIG = {
  id: "telegram",
  name: "Telegram Bot",
  category: "communication",
  authType: "bearer_token" as ProviderAuthType,
  docsUrl: "https://core.telegram.org/bots/api",
  apiBaseUrl: "https://api.telegram.org",
  envVars: [
    { name: "TELEGRAM_BOT_TOKEN", purpose: "Bot token from @BotFather. Secret — store encrypted in the connection's extra bag, never in code.", required: true },
    { name: "TELEGRAM_CHAT_ID", purpose: "Target chat id (user, group or channel). Get it from getUpdates after the bot receives a message.", required: true },
  ] as TelegramEnvVar[],
  capabilities: [
    "Send NxtSend alerts to a Telegram chat / group / channel via the Bot API (POST /bot<token>/sendMessage) — bot token from @BotFather, no OAuth",
    "A bot cannot start a conversation: the user must message the bot first, or the bot must be added to the target group/channel",
    "Config-ready: no live Telegram bot has been connected from this environment; delivery is mock-tested only",
  ],
  setupSteps: [
    "Message @BotFather in Telegram → /newbot → pick a name and a username ending in 'bot' → copy the token (it is a secret).",
    "Start a chat with the bot (or add it to the target group/channel) and send it a message.",
    "Read the chat id from GET /bot<token>/getUpdates (message.chat.id).",
    "Store the bot token + chat id in the NxtSend Telegram connection — encrypted with TOKEN_ENCRYPTION_KEY.",
  ],
} as const;
