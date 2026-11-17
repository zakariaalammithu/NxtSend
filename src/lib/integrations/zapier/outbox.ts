/**
 * Zapier webhook (REST Hook) subscriptions + delivery outbox.
 *
 * Thin wrapper over the shared platform outbox
 * (src/lib/integrations/rest/outbox.ts): the tables, the delivery
 * model (outbox, idempotent enqueue, immediate attempt, backoff
 * 5m → 30m, max 3, 410 deactivation) and the signing are all
 * shared now. This module keeps the Zapier-only names and the
 * Zapier-only shapes (legacy stores carry no `platform` field —
 * they are adapted to a zapier-bound platform store on entry)
 * so existing import sites (routes, jobs, tests) keep working.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  asPlatformStore,
  attemptPlatformDelivery,
  createPlatformStore,
  enqueuePlatformEvent,
  generateWebhookSecret,
  getDemoPlatformStore,
  InMemoryPlatformStore,
  retryDuePlatformDeliveries,
  subscribePlatformWebhook,
  unsubscribePlatformWebhook,
  validatePlatformTargetUrl,
  DELIVERY_MAX_ATTEMPTS,
  DELIVERY_TIMEOUT_MS,
  RETRY_DELAYS_MS,
  STALE_SUBSCRIPTION_DAYS,
  type PlatformWebhookStore,
} from "@/lib/integrations/rest/outbox";
import type { ZapierWebhookEnvelope, ZapierWebhookEventType } from "./events";

export const ZAPIER_DELIVERY_MAX_ATTEMPTS = DELIVERY_MAX_ATTEMPTS;
export const ZAPIER_RETRY_DELAYS_MS = RETRY_DELAYS_MS;
export const ZAPIER_DELIVERY_TIMEOUT_MS = DELIVERY_TIMEOUT_MS;
export const ZAPIER_STALE_SUBSCRIPTION_DAYS = STALE_SUBSCRIPTION_DAYS;

export type ZapierDeliveryStatus = "pending" | "delivered" | "failed" | "dead";

export interface ZapierWebhookSubscription {
  id: string;
  workspace_id: string;
  user_id: string;
  event: ZapierWebhookEventType;
  target_url: string;
  /** Per-subscription HMAC secret — stored only, never returned. */
  secret: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ZapierWebhookDelivery {
  id: string;
  event_id: string;
  subscription_id: string;
  workspace_id: string;
  event: ZapierWebhookEventType;
  payload: ZapierWebhookEnvelope;
  status: ZapierDeliveryStatus;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  next_retry_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ZapierSubscriptionStore {
  createSubscription(row: {
    workspace_id: string;
    user_id: string;
    event: ZapierWebhookEventType;
    target_url: string;
    secret: string;
  }): Promise<ZapierWebhookSubscription>;
  /** Active subscriptions for one workspace + event (delivery fan-out). */
  listActiveSubscriptions(
    workspaceId: string,
    event: ZapierWebhookEventType
  ): Promise<ZapierWebhookSubscription[]>;
  /** Active subscriptions for one workspace (the subscriptions list). */
  listSubscriptions(workspaceId: string): Promise<ZapierWebhookSubscription[]>;
  getSubscription(id: string): Promise<ZapierWebhookSubscription | null>;
  /** Deactivates (never hard-deletes — the audit trail stays). */
  deactivateSubscription(id: string): Promise<boolean>;
  /** Subscriptions inactive for longer than `olderThanIso`. */
  listStaleInactive(olderThanIso: string): Promise<ZapierWebhookSubscription[]>;
  deleteSubscription(id: string): Promise<void>;
}

export interface ZapierOutboxStore {
  /** Idempotent on (event_id, subscription_id): returns the existing row on a repeat. */
  enqueueDelivery(row: {
    event_id: string;
    subscription_id: string;
    workspace_id: string;
    event: ZapierWebhookEventType;
    payload: ZapierWebhookEnvelope;
  }): Promise<ZapierWebhookDelivery>;
  getDelivery(id: string): Promise<ZapierWebhookDelivery | null>;
  updateDelivery(id: string, patch: Partial<ZapierWebhookDelivery>): Promise<void>;
  /** Failed deliveries whose retry time has arrived and cap not hit. */
  listDueDeliveries(nowIso: string, limit?: number): Promise<ZapierWebhookDelivery[]>;
}

/** Validates a Zapier REST Hook target URL (https + Zapier host). */
export function validateZapierTargetUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  return validatePlatformTargetUrl("zapier", raw);
}

/** Generates a per-subscription HMAC secret (server-side only). */
export function generateZapierWebhookSecret(): string {
  return generateWebhookSecret();
}

export function zapierRetryDelayMs(attempts: number): number | null {
  if (attempts < 1) return ZAPIER_RETRY_DELAYS_MS[0];
  return ZAPIER_RETRY_DELAYS_MS[attempts - 1] ?? null;
}

export function publicSubscription(
  sub: ZapierWebhookSubscription
): Omit<ZapierWebhookSubscription, "secret"> {
  const { secret: _secret, ...rest } = sub;
  void _secret;
  return rest;
}

export type PublicZapierSubscription = ReturnType<typeof publicSubscription>;

/** Adapts a legacy Zapier store (no `platform`) to a zapier-bound platform store. */
function toPlatformStore(
  store: ZapierSubscriptionStore & ZapierOutboxStore
): PlatformWebhookStore {
  if ("platform" in store) return store as unknown as PlatformWebhookStore;
  return asPlatformStore(store, "zapier");
}

/** In-memory Zapier store (tests + Demo Mode process store). */
export class InMemoryZapierStore extends InMemoryPlatformStore {
  constructor() {
    super("zapier");
  }
}

/** Process-wide demo store: demo subscriptions/deliveries survive across requests in one process. */
export function getDemoZapierStore(): InMemoryZapierStore {
  return getDemoPlatformStore() as unknown as InMemoryZapierStore;
}

export function createSupabaseZapierStore(admin: SupabaseClient): PlatformWebhookStore {
  return createPlatformStore(admin, "zapier");
}

export interface SubscribeZapierWebhookInput {
  event: unknown;
  target_url: unknown;
}

export type SubscribeZapierWebhookResult =
  | { ok: true; subscription: PublicZapierSubscription }
  | { ok: false; status: number; error: string; code: string };

/**
 * Creates a subscription. A duplicate (same workspace + event +
 * target_url, still active) returns the existing subscription
 * instead of a second row. The per-subscription secret is
 * generated here and is NEVER in the returned value.
 */
export async function subscribeZapierWebhook(
  store: ZapierSubscriptionStore & ZapierOutboxStore,
  workspaceId: string,
  userId: string,
  input: SubscribeZapierWebhookInput
): Promise<SubscribeZapierWebhookResult> {
  const result = await subscribePlatformWebhook(
    toPlatformStore(store),
    "zapier",
    workspaceId,
    userId,
    input
  );
  if (!result.ok) return result;
  // The platform subscription carries `platform`; the Zapier
  // public shape has no platform field (and never the secret).
  const { platform: _platform, ...zapierSub } = result.subscription;
  void _platform;
  return { ok: true, subscription: zapierSub };
}

/** Unsubscribe is idempotent: unknown id → 404, already-inactive → 200. */
export async function unsubscribeZapierWebhook(
  store: ZapierSubscriptionStore & ZapierOutboxStore,
  workspaceId: string,
  id: string
): Promise<{ ok: boolean; status: number; error?: string; code?: string }> {
  return unsubscribePlatformWebhook(toPlatformStore(store), "zapier", workspaceId, id);
}

export interface ZapierDeliveryAttemptDeps {
  store: ZapierSubscriptionStore & ZapierOutboxStore;
  fetchFn?: typeof fetch;
  now?: () => Date;
}

/**
 * Enqueues an event for every active subscription for
 * (workspace, event). Returns the delivery rows created (empty
 * when nobody subscribes — that is normal, not an error).
 */
export async function enqueueZapierEvent(
  store: ZapierSubscriptionStore & ZapierOutboxStore,
  envelope: ZapierWebhookEnvelope
): Promise<ZapierWebhookDelivery[]> {
  const rows = await enqueuePlatformEvent(toPlatformStore(store), envelope);
  return rows as unknown as ZapierWebhookDelivery[];
}

export interface ZapierAttemptResult {
  status: ZapierDeliveryStatus;
  attempts: number;
  /** True when the receiver answered 410 (subscription deactivated). */
  unsubscribed: boolean;
}

/**
 * Attempts ONE delivery: POSTs the signed envelope to the
 * subscription's target URL. 2xx → delivered. 410 → the
 * subscription is deactivated and the delivery is dead. Anything
 * else / network error → failed with backoff, or dead after the
 * final attempt.
 */
export async function attemptZapierDelivery(
  deps: ZapierDeliveryAttemptDeps,
  delivery: ZapierWebhookDelivery
): Promise<ZapierAttemptResult> {
  return attemptPlatformDelivery(
    { store: toPlatformStore(deps.store), fetchFn: deps.fetchFn, now: deps.now },
    delivery
  );
}

/**
 * Retries every due Zapier delivery (the `zapier_webhook_retry`
 * job). Returns counts for the job log. Dead-letter rows are kept
 * for inspection — they are never deleted by the retry pass.
 */
export async function retryDueZapierDeliveries(
  deps: ZapierDeliveryAttemptDeps,
  nowIso: string
): Promise<{ due: number; delivered: number; failed: number; dead: number; unsubscribed: number }> {
  return retryDuePlatformDeliveries(
    { store: toPlatformStore(deps.store), fetchFn: deps.fetchFn, now: deps.now },
    "zapier",
    nowIso
  );
}
