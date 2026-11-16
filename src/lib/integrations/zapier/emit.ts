/**
 * Server-side Zapier emit path.
 *
 * The browser decorator path (src/lib/data/webhook-emission.ts →
 * ./client.ts → POST /api/integrations/zapier/emit) covers
 * dashboard mutations made in the browser. Server-side mutations
 * (Zapier REST routes, the Stripe webhook, the inbox reply route)
 * call `emitZapierEvent` directly with the service-role store —
 * the browser notifier is a no-op on the server
 * (`typeof window === "undefined"`), so without this helper
 * server-side repo calls would emit NOTHING (the gap the generic
 * webhook system has today).
 *
 * `emitZapierEvent` never throws and never fails the caller's
 * mutation: the enqueue is attempted, the immediate delivery
 * attempt is fire-and-forget (void — a slow or failing hook must
 * not stall the response), and any error is logged, not raised.
 * The outbox row is the record of truth: a failed immediate
 * attempt is retried by the `zapier_webhook_retry` job.
 */

import type { ZapierSubscriptionStore, ZapierOutboxStore } from "./outbox";
import { attemptZapierDelivery, enqueueZapierEvent } from "./outbox";
import type { ZapierWebhookEventType } from "./events";
import { buildZapierEventEnvelope } from "./events";

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
  try {
    const envelope = buildZapierEventEnvelope(type, workspaceId, data);
    const deliveries = await enqueueZapierEvent(deps.store, envelope);
    for (const delivery of deliveries) {
      // Best-effort immediate attempt: fire-and-forget, never
      // awaited by the mutation, never allowed to throw.
      void attemptZapierDelivery({ store: deps.store, fetchFn: deps.fetchFn }, delivery).catch(
        (err) => console.error("[NxtSend] Zapier immediate delivery failed:", err)
      );
    }
  } catch (err) {
    console.error("[NxtSend] Zapier emit failed (mutation unaffected):", err);
  }
}
