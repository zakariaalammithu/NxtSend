/**
 * WhatsApp adapter — sends NxtSend alerts via the OFFICIAL Meta
 * WhatsApp Business Cloud API only.
 *
 * Verified endpoint (Meta WhatsApp Cloud API docs, checked 2026-11-19):
 *   POST https://graph.facebook.com/v21.0/{phone-number-id}/messages
 *   Bearer <system-user token>. Body { messaging_product: "whatsapp",
 *   to, type: "template" | "text", ... }. 200 returns
 *   { messages: [{ id }] } (accepted, not delivered).
 * No unofficial workarounds, no green-API-style hacks: the On-Premises
 * API was sunset 23 Oct 2025, so the Cloud API is the only supported
 * path. Business-initiated messages outside the 24-hour customer
 * service window MUST use a Meta-approved template — free-form text
 * fails with error 131047 — so the default mode is "template" and
 * the template name is configurable. Text mode is offered only for
 * replies inside an open window, and the adapter surfaces Meta's
 * 131047 failure honestly instead of hiding it.
 * CREDENTIALS REQUIRED: a Meta app with the WhatsApp product, a
 * registered business number (phone number id), an approved template
 * and a permanent system-user token with whatsapp_business_messaging.
 * None of that exists in this environment.
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
import { WHATSAPP_CONFIG, type WhatsappSettings } from "./config";

export interface WhatsappAdapterDeps {
  /** Decrypted credential from the connection store, or null. */
  credential: ProviderCredential | null;
  settings: WhatsappSettings;
}

export function createWhatsappAdapter(deps: WhatsappAdapterDeps): CommunicationAdapter {
  const { credential, settings } = deps;
  const accessToken = credential?.accessToken;
  const phoneNumberId = readSetting(credential, settings, "phoneNumberId") ?? settings.phoneNumberId;
  const recipient = readSetting(credential, settings, "recipient") ?? settings.recipient;
  const templateName = settings.templateName ?? credential?.extra?.templateName ?? "hello_world";
  const templateLanguage = settings.templateLanguage ?? credential?.extra?.templateLanguage ?? "en_US";
  const mode = settings.mode ?? "template";

  function checkConfiguration(): { configured: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!accessToken) missing.push("accessToken");
    if (!phoneNumberId) missing.push("phoneNumberId");
    if (!recipient) missing.push("recipient");
    return { configured: missing.length === 0, missing };
  }

  async function sendNotification(
    event: NotificationEventInput
  ): Promise<NotificationDelivery> {
    const message = buildNotificationMessage(event);
    if (!message) return failedDelivery("whatsapp", "unknown_notification_event");
    const config = checkConfiguration();
    if (!config.configured) {
      return failedDelivery(
        "whatsapp",
        "configuration_required: missing " + config.missing.join(", ")
      );
    }
    try {
      return await deliver(message);
    } catch (err) {
      return failedDelivery(
        "whatsapp",
        err instanceof Error ? err.message : "whatsapp delivery failed"
      );
    }
  }

  async function deliver(message: NotificationMessage): Promise<NotificationDelivery> {
    const client = new ProviderHttpClient({
      baseUrl: WHATSAPP_CONFIG.apiBaseUrl,
      getAuthHeaders: () => ({ Authorization: "Bearer " + accessToken }),
    });
    const body =
      mode === "text"
        ? {
            messaging_product: "whatsapp",
            to: recipient,
            type: "text",
            text: { body: renderMessageText(message) },
          }
        : {
            messaging_product: "whatsapp",
            to: recipient,
            type: "template",
            template: {
              name: templateName,
              language: { code: templateLanguage },
              components: [
                {
                  type: "body",
                  parameters: [{ type: "text", text: renderMessageText(message).slice(0, 1024) }],
                },
              ],
            },
          };
    const res = await client.request<{ messages?: Array<{ id?: string }> }>({
      method: "POST",
      path: "/" + phoneNumberId + "/messages",
      body,
    });
    return okDelivery("whatsapp", res.messages?.[0]?.id ?? null);
  }

  return { provider: "whatsapp", sendNotification, checkConfiguration };
}
