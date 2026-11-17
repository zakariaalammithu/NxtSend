/**
 * Zapier webhook event registry + envelope.
 *
 * Thin re-export of the shared registry
 * (src/lib/integrations/rest/events.ts): both platforms receive
 * exactly the same 8 events in the same envelope shape
 * ({ id, type, created_at, workspace_id, data }). Kept so
 * existing Zapier import sites keep working.
 */

export {
  WEBHOOK_EVENT_TYPES as ZAPIER_WEBHOOK_EVENT_TYPES,
  WEBHOOK_EVENT_DESCRIPTIONS as ZAPIER_WEBHOOK_EVENT_DESCRIPTIONS,
  isWebhookEventType as isZapierWebhookEventType,
  buildEventEnvelope as buildZapierEventEnvelope,
  type WebhookEventType as ZapierWebhookEventType,
  type WebhookEnvelope as ZapierWebhookEnvelope,
} from "@/lib/integrations/rest/events";
