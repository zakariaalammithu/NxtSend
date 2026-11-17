/**
 * Server-side platform emit path (Zapier + n8n fan-out).
 *
 * `emitPlatformEvent` never throws and never fails the caller's
 * mutation: the envelope is built once, enqueued for EVERY
 * platform's active subscriptions (fan-out — see
 * ./outbox.ts), the immediate delivery attempt per delivery is
 * fire-and-forget (a slow or failing hook must not stall the
 * response), and any error is logged, not raised. The outbox row
 * is the record of truth: a failed immediate attempt is retried
 * by the `<platform>_webhook_retry` job.
 *
 * `emitZapierEvent` is the backwards-compatible Zapier-only
 * entry point: it fans out exactly like emitPlatformEvent (a
 * Zapier emit now also reaches n8n subscriptions — that is the
 * intended fan-out, not a leak: both platforms subscribed to
 * the same event). Callers that only have a legacy Zapier store
 * are adapted via asPlatformStore.
 */

import type { ZapierSubscriptionStore, ZapierOutboxStore } from "@/lib/integrations/zapier/outbox";
import {
  asPlatformStore,
  enqueuePlatformEvent,
  attemptPlatformDelivery,
  type PlatformWebhookStore,
} from "./outbox";
import { buildEventEnvelope, type WebhookEventType } from "./events";

export interface EmitPlatformEventDeps {
  store: PlatformWebhookStore;
  fetchFn?: typeof fetch;
}

export async function emitPlatformEvent(
  deps: EmitPlatformEventDeps,
  type: WebhookEventType,
  workspaceId: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const envelope = buildEventEnvelope(type, workspaceId, data);
    const deliveries = await enqueuePlatformEvent(deps.store, envelope);
    for (const delivery of deliveries) {
      // Best-effort immediate attempt: fire-and-forget, never
      // awaited by the mutation, never allowed to throw.
      void attemptPlatformDelivery({ store: deps.store, fetchFn: deps.fetchFn }, delivery).catch(
        (err) => console.error("[NxtSend] Platform immediate delivery failed:", err)
      );
    }
  } catch (err) {
    console.error("[NxtSend] Platform emit failed (mutation unaffected):", err);
  }
}

export interface EmitZapierEventDeps {
  store: ZapierSubscriptionStore & ZapierOutboxStore;
  fetchFn?: typeof fetch;
}

/** Thin wrapper over emitPlatformEvent (see the module header). */
export async function emitZapierEvent(
  deps: EmitZapierEventDeps,
  type: WebhookEventType,
  workspaceId: string,
  data: Record<string, unknown>
): Promise<void> {
  const store: PlatformWebhookStore =
    "platform" in deps.store
      ? (deps.store as PlatformWebhookStore)
      : asPlatformStore(deps.store, "zapier");
  await emitPlatformEvent({ store, fetchFn: deps.fetchFn }, type, workspaceId, data);
}
