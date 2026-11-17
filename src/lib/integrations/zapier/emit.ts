/**
 * Server-side Zapier emit path.
 *
 * Thin wrapper over the shared platform emit
 * (src/lib/integrations/rest/emit.ts): a Zapier emit fans out to
 * EVERY platform's active subscriptions — Zapier hooks AND n8n
 * webhooks subscribed to the same event. That is the intended
 * fan-out, not a leak: both platforms subscribed to the event.
 * See rest/emit.ts for the never-throws contract.
 *
 * The browser decorator path (src/lib/data/webhook-emission.ts →
 * ./client.ts → POST /api/integrations/zapier/emit) and the
 * server-side call sites (the Stripe webhook, the inbox reply
 * route) all flow through here, so server-side repo calls emit
 * exactly like browser ones.
 */

import type { ZapierSubscriptionStore, ZapierOutboxStore } from "./outbox";
import { emitZapierEvent as emitZapierEventRest } from "@/lib/integrations/rest/emit";
import type { ZapierWebhookEventType } from "./events";

export interface EmitZapierEventDeps {
  store: ZapierSubscriptionStore & ZapierOutboxStore;
  fetchFn?: typeof fetch;
}

export async function emitZapierEvent(
  deps: EmitZapierEventDeps,
  type: ZapierWebhookEventType,
  workspaceId: string,
  data: Record<string, unknown>
): Promise<void> {
  return emitZapierEventRest(deps, type, workspaceId, data);
}
