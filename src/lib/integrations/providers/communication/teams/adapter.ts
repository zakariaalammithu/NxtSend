/**
 * Microsoft Teams adapter — sends NxtSend alerts to a Teams channel
 * via a Teams Workflows webhook.
 *
 * Verified (Microsoft Learn + Teams docs, checked 2026-11-19):
 *   - Office 365 Connectors / classic incoming webhooks are deprecated;
 *     new webhooks are created as a Teams Workflow ("When a Teams webhook
 *     request is received" trigger), which issues a webhook URL. POST
 *     JSON to that URL; the workflow posts it to the channel.
 *   - The payload shape the workflow expects depends on the workflow
 *     template the operator picks: this adapter sends { text } and the
 *     workflow must map the "text" field into its "Post card / Post
 *     message" action. That mapping is a per-workspace setup step —
 *     see docs/integrations/providers/comms-teams.md.
 *   - Microsoft Graph channel sends are NOT implemented on purpose:
 *     Graph application permissions cannot send channel messages
 *     (delegated ChatMessage.Send / ChannelMessage.Send only), so the
 *     webhook is the supported path for a service integration.
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
import { type TeamsSettings } from "./config";

export interface TeamsAdapterDeps {
  /** Decrypted credential from the connection store, or null. */
  credential: ProviderCredential | null;
  settings: TeamsSettings;
}

export function createTeamsAdapter(deps: TeamsAdapterDeps): CommunicationAdapter {
  const { credential, settings } = deps;
  const webhookUrl = readSetting(credential, settings, "webhookUrl");

  function checkConfiguration(): { configured: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!webhookUrl) missing.push("webhookUrl");
    return { configured: missing.length === 0, missing };
  }

  async function sendNotification(
    event: NotificationEventInput
  ): Promise<NotificationDelivery> {
    const message = buildNotificationMessage(event);
    if (!message) return failedDelivery("teams", "unknown_notification_event");
    const config = checkConfiguration();
    if (!config.configured) {
      return failedDelivery(
        "teams",
        "configuration_required: missing " + config.missing.join(", ")
      );
    }
    try {
      return await deliver(message);
    } catch (err) {
      return failedDelivery(
        "teams",
        err instanceof Error ? err.message : "teams delivery failed"
      );
    }
  }

  async function deliver(message: NotificationMessage): Promise<NotificationDelivery> {
    const client = new ProviderHttpClient({
      baseUrl: webhookUrl as string,
      getAuthHeaders: () => ({}),
    });
    // Workflows webhooks answer 202 with an empty body on success.
    await client.request<void>({
      method: "POST",
      path: "",
      body: { text: renderMessageText(message) },
    });
    return okDelivery("teams", null);
  }

  return { provider: "teams", sendNotification, checkConfiguration };
}
