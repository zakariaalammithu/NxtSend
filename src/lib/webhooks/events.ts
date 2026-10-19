/**
 * Outbound webhook event registry + envelope.
 *
 * Emission points (data layer, Stage 2c):
 *   lead.created            — a lead is created manually or imported
 *   campaign.created        — a campaign is created via the repository
 *   campaign.status_changed — pause / resume / archive / draft moves
 *
 * The envelope is a stable, versioned shape receivers can rely on:
 *   { id, type, created_at, workspace_id, data }
 */

import { generateId } from "@/lib/utils";

export const WEBHOOK_EVENT_TYPES = [
  "lead.created",
  "campaign.created",
  "campaign.status_changed",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export const WEBHOOK_EVENT_DESCRIPTIONS: Record<WebhookEventType, string> = {
  "lead.created": "A lead was created (manually or via CSV import).",
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
