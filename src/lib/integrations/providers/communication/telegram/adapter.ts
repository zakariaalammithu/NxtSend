/**
 * Telegram adapter — sends NxtSend alerts via the Telegram Bot API.
 *
 * Verified endpoints (Telegram Bot API docs, checked 2026-11-19):
 *   GET  https://api.telegram.org/bot<token>/getMe
 *   POST https://api.telegram.org/bot<token>/sendMessage
 *     Body { chat_id, text } (text 1–4096 chars). Every call is
 *     https://api.telegram.org/bot<token>/METHOD — the token in the
 *     path IS the authentication (there is no header/OAuth form),
 *     so the token never appears in a log line here: the
 *     ProviderHttpClient redacts Bearer patterns, and this adapter
 *     never logs the request URL.
 * A bot cannot start a conversation: the user must message the bot
 * first, or the bot must be added to the target group/channel.
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
import { TELEGRAM_CONFIG, type TelegramSettings } from "./config";

export interface TelegramAdapterDeps {
  /** Decrypted credential from the connection store, or null. */
  credential: ProviderCredential | null;
  settings: TelegramSettings;
}

export function createTelegramAdapter(deps: TelegramAdapterDeps): CommunicationAdapter {
  const { credential, settings } = deps;
  const botToken = credential?.accessToken ?? settings.botToken;
  const chatId = readSetting(credential, settings, "chatId") ?? settings.chatId;

  function checkConfiguration(): { configured: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!botToken) missing.push("botToken");
    if (!chatId) missing.push("chatId");
    return { configured: missing.length === 0, missing };
  }

  async function sendNotification(
    event: NotificationEventInput
  ): Promise<NotificationDelivery> {
    const message = buildNotificationMessage(event);
    if (!message) return failedDelivery("telegram", "unknown_notification_event");
    const config = checkConfiguration();
    if (!config.configured) {
      return failedDelivery(
        "telegram",
        "configuration_required: missing " + config.missing.join(", ")
      );
    }
    try {
      return await deliver(message);
    } catch (err) {
      return failedDelivery(
        "telegram",
        err instanceof Error ? err.message : "telegram delivery failed"
      );
    }
  }

  async function deliver(message: NotificationMessage): Promise<NotificationDelivery> {
    const client = new ProviderHttpClient({
      baseUrl: TELEGRAM_CONFIG.apiBaseUrl,
      getAuthHeaders: () => ({}),
    });
    const text = renderMessageText(message);
    const res = await client.request<{
      ok: boolean;
      result?: { message_id?: number };
      description?: string;
    }>({
      method: "POST",
      path: "/bot" + botToken + "/sendMessage",
      body: { chat_id: chatId, text: text.slice(0, 4096) },
    });
    if (!res.ok) {
      return failedDelivery("telegram", "telegram_api_error: " + (res.description ?? "unknown"));
    }
    return okDelivery("telegram", res.result?.message_id != null ? String(res.result.message_id) : null);
  }

  return { provider: "telegram", sendNotification, checkConfiguration };
}
