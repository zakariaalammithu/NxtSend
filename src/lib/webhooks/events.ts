/**
 * Outbound webhook event registry + envelope.
 *
 * Emission points (data layer, Stage 2c):
 *   lead.created            — a lead is created manually or imported
 *   lead.updated            — a lead is updated (any successful update)
 *   lead.added_to_campaign  — leads enrolled into a campaign
 *   lead.removed_from_campaign — a lead's enrollment removed
 *   campaign.created        — a campaign is created via the repository
 *   campaign.status_changed — pause / resume / archive / draft moves
 *
 * The three lead.* events after lead.created were added when the
 * n8n integration closed the generic-system gap: they used to
 * fire only through the Zapier browser notifier, so the generic
 * one-endpoint webhooks system never saw them. They are emitted
 * by the same data-layer decorators as the other events now.
 *
 * The envelope is a stable, versioned shape receivers can rely on:
 *   { id, type, created_at, workspace_id, data }
 */

import { generateId } from "@/lib/utils";

export const WEBHOOK_EVENT_TYPES = [
  "lead.created",
  "lead.updated",
  "lead.added_to_campaign",
  "lead.removed_from_campaign",
  "campaign.created",
  "campaign.status_changed",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export const WEBHOOK_EVENT_DESCRIPTIONS: Record<WebhookEventType, string> = {
  "lead.created": "A lead was created (manually or via CSV import).",
  "lead.updated": "A lead was updated. The payload carries changed_fields.",
  "lead.added_to_campaign": "One or more leads were enrolled into a campaign.",
  "lead.removed_from_campaign": "A lead's enrollment was removed from a campaign.",
  "campaign.created": "A campaign was created.",
  "campaign.status_changed": "A campaign's lifecycle status changed (pause / resume / archive / draft).",
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
  data: Record<string, unknown>
): WebhookEnvelope {
  return {
    id: generateId(),
    type,
    created_at: new Date().toISOString(),
    workspace_id: workspaceId,
    data,
  };
}
