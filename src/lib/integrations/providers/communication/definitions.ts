/**
 * Communication provider definitions (Stage 6).
 *
 * Exported here — NOT appended to `./registry.ts` (the coordinator
 * merges these in). Capabilities are honest: anything config-ready
 * but not live-verified says so in the capability text itself.
 * Nothing here claims a connection.
 */

import type { ProviderDefinition } from "../types";

export const COMMUNICATION_PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: "slack",
    name: "Slack",
    category: "communication",
    authType: "oauth2",
    docsUrl: "https://docs.slack.dev/",
    capabilities: [
      "Send NxtSend alerts (new lead, new reply, interested lead, campaign status, daily report, sync error) to a Slack channel",
      "Two delivery paths: incoming webhook (one URL per channel) or bot token + chat.postMessage (chat:write) — webhook is the default",
      "Config-ready: no live Slack workspace has been connected from this environment; delivery is mock-tested only",
    ],
    twoWaySync: false,
    scopes: ["chat:write", "incoming-webhook"],
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    category: "communication",
    authType: "webhook",
    docsUrl: "https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/what-are-webhooks-and-connectors",
    capabilities: [
      "Send NxtSend alerts to a Teams channel via a Teams Workflows webhook (the Office 365 Connector / incoming-webhook path is deprecated — new webhooks must be created as Workflows)",
      "Microsoft Graph channel-message sending is NOT implemented: Graph application permissions cannot send channel messages (delegated ChatMessage.Send / ChannelMessage.Send only), so the webhook is the supported path",
      "Config-ready: no live Teams webhook has been connected from this environment; delivery is mock-tested only",
    ],
    twoWaySync: false,
  },
  {
    id: "discord",
    name: "Discord",
    category: "communication",
    authType: "webhook",
    docsUrl: "https://discord.com/developers/docs/resources/webhook",
    capabilities: [
      "Send NxtSend alerts to a Discord channel via a channel webhook (POST /api/v10/webhooks/{id}/{token}) — one-way, no bot account needed",
      "Config-ready: no live Discord webhook has been connected from this environment; delivery is mock-tested only",
    ],
    twoWaySync: false,
  },
  {
    id: "telegram",
    name: "Telegram Bot",
    category: "communication",
    authType: "bearer_token",
    docsUrl: "https://core.telegram.org/bots/api",
    capabilities: [
      "Send NxtSend alerts to a Telegram chat / group / channel via the Bot API (POST /bot<token>/sendMessage) — bot token from @BotFather, no OAuth",
      "A bot cannot start a conversation: the user must message the bot first, or the bot must be added to the target group/channel",
      "Config-ready: no live Telegram bot has been connected from this environment; delivery is mock-tested only",
    ],
    twoWaySync: false,
  },
  {
    id: "whatsapp",
    name: "WhatsApp Business Platform",
    category: "communication",
    authType: "bearer_token",
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api",
    capabilities: [
      "Send NxtSend alerts via the official Meta WhatsApp Business Cloud API only (POST /v21.0/{phone-number-id}/messages) — no unofficial workarounds",
      "Business-initiated messages outside the 24-hour customer-service window must use a Meta-approved template; free-form text only works inside an open window",
      "CREDENTIALS REQUIRED: a Meta app with the WhatsApp product, a registered business number and a permanent system-user token — none of which exists in this environment; delivery is mock-tested only",
    ],
    twoWaySync: false,
    scopes: ["whatsapp_business_messaging"],
  },
];
