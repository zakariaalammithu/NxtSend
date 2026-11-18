/**
 * Discord adapter — sends NxtSend alerts to a Discord channel via
 * a channel webhook.
 *
 * Verified endpoint (Discord developer docs, checked 2026-11-19):
 *   POST https://discord.com/api/v10/webhooks/{webhook.id}/{webhook.token}?wait=true
 *   Body { content } (max 2,000 characters). 204 No Content without
 *   ?wait=true; 200 + the created message (incl. id) with it.
 * The webhook URL is the credential: anyone holding it can post as
 * the webhook, so it is stored encrypted and never logged.
 */

import { ProviderHttpClient } from "../../client";
import type { ProviderCredential } from "../../connections";
import {
  buildNotificationMessage,
  type NotificationEventInput,
  type NotificationMessage,
} from "@/lib/integrations/notifications/templates";
import type {
  CommunicationAdapter,
  NotificationDelivery,
} from "../types";
import {
  failedDelivery,
  okDelivery,
  readSetting,
  renderMessageText,
} from "../types";
import { DISCORD_CONFIG, type DiscordSettings } from "./config";

/** Parses a Discord webhook URL into its id + token. Null when it is not one. */
export function parseDiscordWebhook(url: string): { id: string; token: string } | null {
  const match = /discord\.com\/api\/webhooks\/(\d+)\/([A-Za-z0-9_\-]+)/.exec(url);
  if (!match) return null;
  return { id: match[1], token: match[2] };
}

export interface DiscordAdapterDeps {
  /** Decrypted credential from the connection store, or null. */
  credential: ProviderCredential | null;
  settings: DiscordSettings;
}

export function createDiscordAdapter(deps: DiscordAdapterDeps): CommunicationAdapter {
  const { credential, settings } = deps;
  const webhookUrl = readSetting(credential, settings, "webhookUrl");

  function checkConfiguration(): { configured: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!webhookUrl) missing.push("webhookUrl");
    else if (!parseDiscordWebhook(webhookUrl)) missing.push("webhookUrl (not a discord.com/api/webhooks/<id>/<token> URL)");
    return { configured: missing.length === 0, missing };
  }

  async function sendNotification(
    event: NotificationEventInput
  ): Promise<NotificationDelivery> {
    const message = buildNotificationMessage(event);
    if (!message) return failedDelivery("discord", "unknown_notification_event");
    const config = checkConfiguration();
    if (!config.configured) {
      return failedDelivery(
        "discord",
        "configuration_required: missing " + config.missing.join(", ")
      );
    }
    try {
      return await deliver(message);
    } catch (err) {
      return failedDelivery(
        "discord",
        err instanceof Error ? err.message : "discord delivery failed"
      );
    }
  }

  async function deliver(message: NotificationMessage): Promise<NotificationDelivery> {
    const parsed = parseDiscordWebhook(webhookUrl as string);
    if (!parsed) {
      return failedDelivery("discord", "configuration_required: webhookUrl is not a discord.com/api/webhooks/<id>/<token> URL");
    }
    const client = new ProviderHttpClient({
      baseUrl: DISCORD_CONFIG.apiBaseUrl,
      getAuthHeaders: () => ({}),
    });
    const text = renderMessageText(message);
    const res = await client.request<{ id?: string }>({
      method: "POST",
      path: "/webhooks/" + parsed.id + "/" + parsed.token,
      query: { wait: "true" },
      body: { content: text.slice(0, 2000) },
    });
    return okDelivery("discord", res?.id ?? null);
  }

  return { provider: "discord", sendNotification, checkConfiguration };
}
