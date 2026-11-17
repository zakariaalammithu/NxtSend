/**
 * Shared webhook event registry + envelope (Zapier + n8n).
 *
 * This is the BASE registry — src/lib/integrations/zapier/events.ts
 * re-exports it under the Zapier names. Both platforms receive
 * exactly the same 8 events in the same envelope shape
 * ({ id, type, created_at, workspace_id, data }). The envelope
 * `id` is the stable dedup id — one event fans out to every
 * platform's subscriptions, and the outbox dedups on
 * (event_id, subscription_id).
 *
 * These are the events NxtSend genuinely produces — each one is
 * wired to a real mutation path (see ./emit.ts and the repository
 * decorators in src/lib/data/webhook-emission.ts). Nothing here is
 * emitted speculatively:
 *
 *   lead.created             — a lead was created (manual, import, REST API)
 *   lead.updated             — a lead was updated (any successful update;
 *                              payload carries `changed_fields`)
 *   lead.added_to_campaign   — leads enrolled into a campaign
 *   lead.removed_from_campaign — a lead's enrollment removed
 *   campaign.created         — a campaign is created
 *   campaign.status_changed  — pause / resume / archive / draft moves
 *   conversation.reply_created — an inbox reply reached a terminal
 *                              `sent` (or `simulated`) outcome
 *   subscription.changed     — a Stripe subscription mutation was
 *                              applied to a workspace (plan/status)
 *
 * NOT emitted (no data source / no send exists): anything
 * LinkedIn-send or connection-accept related — `accepted` is always
 * null and no LinkedIn send exists in the product.
 */

import { generateId } from "@/lib/utils";

/** The 8 webhook events, shared by Zapier and n8n. */
export const WEBHOOK_EVENT_TYPES = [
  "lead.created",
  "lead.updated",
  "lead.added_to_campaign",
  "lead.removed_from_campaign",
  "campaign.created",
  "campaign.status_changed",
  "conversation.reply_created",
  "subscription.changed",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export const WEBHOOK_EVENT_DESCRIPTIONS: Record<WebhookEventType, string> = {
  "lead.created": "A lead was created (manually, via CSV import, or via the REST API).",
  "lead.updated": "A lead was updated. The payload carries changed_fields.",
  "lead.added_to_campaign": "One or more leads were enrolled into a campaign.",
  "lead.removed_from_campaign": "A lead's enrollment was removed from a campaign.",
  "campaign.created": "A campaign was created.",
  "campaign.status_changed": "A campaign's lifecycle status changed (pause / resume / archive / draft).",
  "conversation.reply_created": "An inbox reply reached a terminal sent outcome (email channel only).",
  "subscription.changed": "A workspace's subscription (plan / status) changed via Stripe.",
};

export function isWebhookEventType(value: unknown): value is WebhookEventType {
  return (
    typeof value === "string" &&
    (WEBHOOK_EVENT_TYPES as readonly string[]).includes(value)
  );
}

export interface WebhookEnvelope {
  id: string;
  type: WebhookEventType;
  created_at: string;
  workspace_id: string;
  data: Record<string, unknown>;
}

export function buildEventEnvelope(
  type: WebhookEventType,
  workspaceId: string,
  data: Record<string, unknown>,
  id: string = generateId()
): WebhookEnvelope {
  return {
    id,
    type,
    created_at: new Date().toISOString(),
    workspace_id: workspaceId,
    data,
  };
}
