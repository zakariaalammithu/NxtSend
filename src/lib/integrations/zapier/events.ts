/**
 * Zapier webhook (REST Hook) event registry + envelope.
 *
 * These are the events NxtSend genuinely produces — each one is
 * wired to a real mutation path (see ./emit.ts and the repository
 * decorators in src/lib/data/webhook-emission.ts). Nothing here is
 * emitted speculatively:
 *
 *   lead.created             — a lead is created (manual, import, Zapier API)
 *   lead.updated             — a lead is updated (any successful update;
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
 *
 * The envelope is the same stable shape as the generic outbound
 * webhooks (src/lib/webhooks/events.ts): { id, type, created_at,
 * workspace_id, data }. `id` is the stable dedup id — Zapier
 * instant triggers do not dedup, so receivers key on it, and the
 * outbox stores it UNIQUE so a redelivered event is never
 * enqueued twice.
 */

import { generateId } from "@/lib/utils";

export const ZAPIER_WEBHOOK_EVENT_TYPES = [
  "lead.created",
  "lead.updated",
  "lead.added_to_campaign",
  "lead.removed_from_campaign",
  "campaign.created",
  "campaign.status_changed",
  "conversation.reply_created",
  "subscription.changed",
] as const;

export type ZapierWebhookEventType = (typeof ZAPIER_WEBHOOK_EVENT_TYPES)[number];

export const ZAPIER_WEBHOOK_EVENT_DESCRIPTIONS: Record<ZapierWebhookEventType, string> = {
  "lead.created": "A lead was created (manually, via CSV import, or via the Zapier API).",
  "lead.updated": "A lead was updated. The payload carries changed_fields.",
  "lead.added_to_campaign": "One or more leads were enrolled into a campaign.",
  "lead.removed_from_campaign": "A lead's enrollment was removed from a campaign.",
  "campaign.created": "A campaign was created.",
  "campaign.status_changed": "A campaign's lifecycle status changed (pause / resume / archive / draft).",
  "conversation.reply_created": "An inbox reply reached a terminal sent outcome (email channel only).",
  "subscription.changed": "A workspace's subscription (plan / status) changed via Stripe.",
};

export function isZapierWebhookEventType(value: unknown): value is ZapierWebhookEventType {
  return (
    typeof value === "string" &&
    (ZAPIER_WEBHOOK_EVENT_TYPES as readonly string[]).includes(value)
  );
}

export interface ZapierWebhookEnvelope {
  id: string;
  type: ZapierWebhookEventType;
  created_at: string;
  workspace_id: string;
  data: Record<string, unknown>;
}

export function buildZapierEventEnvelope(
  type: ZapierWebhookEventType,
  workspaceId: string,
  data: Record<string, unknown>,
  id: string = generateId()
): ZapierWebhookEnvelope {
  return {
    id,
    type,
    created_at: new Date().toISOString(),
    workspace_id: workspaceId,
    data,
  };
}
