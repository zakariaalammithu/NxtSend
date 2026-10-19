/**
 * Outbound webhooks module (n8n / Zapier / generic receivers).
 *
 * Server pieces: config (stored in `integrations`, workspace-admin
 * only), HMAC-signed dispatch with a retry-capped delivery log, and the
 * /api/webhooks/* routes. Client piece: notifyWebhookEvent() — a
 * secret-free fire-and-forget notifier used by the data layer.
 */

export {
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_EVENT_DESCRIPTIONS,
  isWebhookEventType,
  buildEventEnvelope,
} from "./events";
export type { WebhookEventType, WebhookEnvelope } from "./events";
export {
  parseWebhookConfig,
  publicWebhookConfig,
  getWebhookState,
  validateWebhookUrl,
} from "./config";
export type { WebhookConfig } from "./config";
export { signWebhookPayload, buildSignatureHeader, verifyWebhookSignature } from "./signing";
export {
  dispatchEvent,
  runDeliveryAttempt,
  InMemoryWebhookStore,
  getDemoWebhookStore,
} from "./dispatch";
export type { WebhookDelivery, WebhookDeliveryStore, DeliveryStatus } from "./dispatch";
