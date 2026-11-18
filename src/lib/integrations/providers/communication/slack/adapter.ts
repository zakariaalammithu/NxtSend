/**
 * Slack adapter — sends NxtSend alerts to a Slack channel.
 *
 * Verified endpoints (Slack developer docs, checked 2026-11-19):
 *   POST https://hooks.slack.com/services/<id>  (incoming webhook — one URL
 *     per channel; the URL itself is the credential; answers "ok")
 *   POST https://slack.com/api/chat.postMessage (bot token, chat:write scope;
 *     returns { ok, ts }; channel id required)
 * Webhook is the default path; chat.postMessage is used only when no
 * webhook URL is stored and a bot token + channel id are.
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
import { SLACK_CONFIG, type SlackSettings } from "./config";

export interface SlackAdapterDeps {
  /** Decrypted credential from the connection store, or null. */
  credential: ProviderCredential | null;
  settings: SlackSettings;
}

export function createSlackAdapter(deps: SlackAdapterDeps): CommunicationAdapter {
  const { credential, settings } = deps;
  const webhookUrl = readSetting(credential, settings, "webhookUrl");
  const botToken = credential?.accessToken ?? settings.botToken;
  const channelId = readSetting(credential, settings, "channelId") ?? settings.channelId;

  function checkConfiguration(): { configured: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!webhookUrl && !botToken) missing.push("webhookUrl or botToken");
    if (!webhookUrl && botToken && !channelId) missing.push("channelId");
    return { configured: missing.length === 0, missing };
  }

  async function sendNotification(
    event: NotificationEventInput
  ): Promise<NotificationDelivery> {
    const message = buildNotificationMessage(event);
    if (!message) return failedDelivery("slack", "unknown_notification_event");
    const config = checkConfiguration();
    if (!config.configured) {
      return failedDelivery(
        "slack",
        "configuration_required: missing " + config.missing.join(", ")
      );
    }
    try {
      return await deliver(message);
    } catch (err) {
      return failedDelivery(
        "slack",
        err instanceof Error ? err.message : "slack delivery failed"
      );
    }
  }

  async function deliver(message: NotificationMessage): Promise<NotificationDelivery> {
    if (webhookUrl) {
      const client = new ProviderHttpClient({
        baseUrl: webhookUrl,
        getAuthHeaders: () => ({}),
      });
      const res = await client.request<string>({
        method: "POST",
        path: "",
        body: { text: renderMessageText(message) },
      });
      if (typeof res === "string" && res.trim() !== "ok") {
        return failedDelivery("slack", "slack_webhook_rejected: " + res.slice(0, 200));
      }
      return okDelivery("slack", null);
    }
    const client = new ProviderHttpClient({
      baseUrl: SLACK_CONFIG.apiBaseUrl,
      getAuthHeaders: () => ({ Authorization: "Bearer " + botToken }),
    });
    const res = await client.request<{ ok: boolean; ts?: string; error?: string }>({
      method: "POST",
      path: "/chat.postMessage",
      body: { channel: channelId, text: renderMessageText(message) },
    });
    if (!res.ok) {
      return failedDelivery("slack", "slack_api_error: " + (res.error ?? "unknown"));
    }
    return okDelivery("slack", res.ts ?? null);
  }

  return { provider: "slack", sendNotification, checkConfiguration };
}
