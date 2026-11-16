/**
 * Zapier webhook (REST Hook) subscriptions + delivery outbox.
 *
 * Storage (migration 025): `zapier_webhook_subscriptions` and
 * `zapier_webhook_deliveries`, RLS enabled with ZERO policies —
 * service-role only, like migration 023. Every secret is generated
 * server-side (32 random bytes, base64url) and NEVER returned after
 * creation — not in the subscribe response, not in any list.
 *
 * Delivery model (outbox pattern):
 *  1. A mutation enqueues one delivery row per ACTIVE subscription
 *     for (workspace, event). Enqueue is idempotent on
 *     (event_id, subscription_id): re-enqueueing the same envelope
 *     never creates a second row. (The brief's migration sketch
 *     said `event_id UUID UNIQUE`; the composite unique is used
 *     instead, because one event fans out to several subscriptions
 *     and a bare UNIQUE would make the second subscription
 *     un-enqueueable. The envelope `id` is still the receiver-facing
 *     stable dedup id.)
 *  2. Best-effort IMMEDIATE attempt at enqueue time (short timeout,
 *     fire-and-forget-safe — a failed delivery never fails the
 *     user's mutation).
 *  3. Failures stay in the outbox for the `zapier_webhook_retry`
 *     job (exponential backoff, max 3 attempts, then `dead`).
 *     The cron that runs the job is daily 06:00, so a failed
 *     delivery may wait up to ~24h for its next retry — the
 *     immediate attempt is best-effort, not a delivery guarantee.
 *  4. A 410 from Zapier means the Zap was deleted/unsubscribed:
 *     the subscription is deactivated so later events stop
 *     posting to a dead hook.
 *
 * Signing reuses src/lib/webhooks/signing.ts (HMAC-SHA256,
 * `X-NxtSend-Signature: t=<ts>,v1=<hex>` + `X-NxtSend-Timestamp`,
 * 5-minute tolerance). Honest note: Zapier does NOT document
 * verifying these headers on REST Hook deliveries — the signature
 * is for receivers that do verify, and for our own delivery-log
 * integrity. Do not claim Zapier checks it.
 *
 * Target URL policy: https only, host must be `hooks.zapier.com`
 * (the real Catch Hook host — Zapier REST Hook `targetUrl`s look
 * like https://hooks.zapier.com/hooks/catch/<id>/<token>/) or
 * `zapier.com`. Verified 2026-11-17 against Zapier platform docs
 * and community references; `hooks.zapier.com` is the host Zapier
 * actually issues.
 */

import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateId } from "@/lib/utils";
import { buildSignatureHeader } from "@/lib/webhooks/signing";
import type {
  ZapierWebhookEnvelope,
  ZapierWebhookEventType,
} from "./events";
import { isZapierWebhookEventType } from "./events";

export const ZAPIER_DELIVERY_MAX_ATTEMPTS = 3;
/** Backoff after each failed attempt (attempt 1 → 5 min, 2 → 30 min). */
export const ZAPIER_RETRY_DELAYS_MS = [5 * 60_000, 30 * 60_000];
/** Immediate-attempt timeout — a slow hook must not stall a mutation. */
export const ZAPIER_DELIVERY_TIMEOUT_MS = 8_000;
/** Subscriptions inactive longer than this are cleaned by the job. */
export const ZAPIER_STALE_SUBSCRIPTION_DAYS = 30;

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
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: "target_url is not a valid URL." };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, error: "target_url must use https." };
  }
  if (parsed.hostname !== "hooks.zapier.com" && parsed.hostname !== "zapier.com") {
    return {
      ok: false,
      error: "target_url must be a Zapier hook URL (hooks.zapier.com).",
    };
  }
  return { ok: true, url: parsed.toString() };
}

/** Generates a per-subscription HMAC secret (server-side only). */
export function generateZapierWebhookSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function zapierRetryDelayMs(attempts: number): number | null {
  if (attempts < 1) return ZAPIER_RETRY_DELAYS_MS[0];
  return ZAPIER_RETRY_DELAYS_MS[attempts - 1] ?? null;
}

// ── In-memory stores (tests + Demo Mode process store) ──────────────────────

function publicSubscription(
  sub: ZapierWebhookSubscription
): Omit<ZapierWebhookSubscription, "secret"> {
  const { secret: _secret, ...rest } = sub;
  void _secret;
  return rest;
}

export type PublicZapierSubscription = ReturnType<typeof publicSubscription>;
export { publicSubscription };

export class InMemoryZapierStore implements ZapierSubscriptionStore, ZapierOutboxStore {
  private subs = new Map<string, ZapierWebhookSubscription>();
  private deliveries = new Map<string, ZapierWebhookDelivery>();
  private deliveryKeys = new Map<string, string>(); // `${event_id}:${subscription_id}` → delivery id

  async createSubscription(row: {
    workspace_id: string;
    user_id: string;
    event: ZapierWebhookEventType;
    target_url: string;
    secret: string;
  }): Promise<ZapierWebhookSubscription> {
    const now = new Date().toISOString();
    const sub: ZapierWebhookSubscription = {
      id: generateId(),
      ...row,
      active: true,
      created_at: now,
      updated_at: now,
    };
    this.subs.set(sub.id, sub);
    return sub;
  }

  async listActiveSubscriptions(
    workspaceId: string,
    event: ZapierWebhookEventType
  ): Promise<ZapierWebhookSubscription[]> {
    return Array.from(this.subs.values())
      .filter((s) => s.workspace_id === workspaceId && s.event === event && s.active)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async listSubscriptions(workspaceId: string): Promise<ZapierWebhookSubscription[]> {
    return Array.from(this.subs.values())
      .filter((s) => s.workspace_id === workspaceId && s.active)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async getSubscription(id: string): Promise<ZapierWebhookSubscription | null> {
    return this.subs.get(id) ?? null;
  }

  async deactivateSubscription(id: string): Promise<boolean> {
    const sub = this.subs.get(id);
    if (!sub) return false;
    this.subs.set(id, { ...sub, active: false, updated_at: new Date().toISOString() });
    return true;
  }

  async listStaleInactive(olderThanIso: string): Promise<ZapierWebhookSubscription[]> {
    return Array.from(this.subs.values()).filter(
      (s) => !s.active && s.updated_at <= olderThanIso
    );
  }

  async deleteSubscription(id: string): Promise<void> {
    this.subs.delete(id);
  }

  async enqueueDelivery(row: {
    event_id: string;
    subscription_id: string;
    workspace_id: string;
    event: ZapierWebhookEventType;
    payload: ZapierWebhookEnvelope;
  }): Promise<ZapierWebhookDelivery> {
    const key = `${row.event_id}:${row.subscription_id}`;
    const existingId = this.deliveryKeys.get(key);
    if (existingId) {
      const existing = this.deliveries.get(existingId);
      if (existing) return existing;
    }
    const now = new Date().toISOString();
    const delivery: ZapierWebhookDelivery = {
      id: generateId(),
      ...row,
      status: "pending",
      attempts: 0,
      max_attempts: ZAPIER_DELIVERY_MAX_ATTEMPTS,
      last_error: null,
      next_retry_at: null,
      created_at: now,
      updated_at: now,
    };
    this.deliveries.set(delivery.id, delivery);
    this.deliveryKeys.set(key, delivery.id);
    return delivery;
  }

  async getDelivery(id: string): Promise<ZapierWebhookDelivery | null> {
    return this.deliveries.get(id) ?? null;
  }

  async updateDelivery(id: string, patch: Partial<ZapierWebhookDelivery>): Promise<void> {
    const existing = this.deliveries.get(id);
    if (!existing) return;
    this.deliveries.set(id, { ...existing, ...patch, updated_at: new Date().toISOString() });
  }

  async listDueDeliveries(nowIso: string, limit = 25): Promise<ZapierWebhookDelivery[]> {
    return Array.from(this.deliveries.values())
      .filter(
        (d) =>
          d.status === "failed" &&
          d.attempts < d.max_attempts &&
          d.next_retry_at !== null &&
          d.next_retry_at <= nowIso
      )
      .sort((a, b) => (a.next_retry_at ?? "").localeCompare(b.next_retry_at ?? ""))
      .slice(0, limit);
  }
}

/** Process-wide demo store: demo subscriptions/deliveries survive across requests in one process. */
let demoStore: InMemoryZapierStore | null = null;
export function getDemoZapierStore(): InMemoryZapierStore {
  if (!demoStore) demoStore = new InMemoryZapierStore();
  return demoStore;
}

// ── Supabase stores (service role only; migration 025) ─────────────────────

type Row = Record<string, unknown>;

function rowToSubscription(row: Row): ZapierWebhookSubscription {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    user_id: String(row.user_id),
    event: String(row.event) as ZapierWebhookEventType,
    target_url: String(row.target_url),
    secret: String(row.secret ?? ""),
    active: Boolean(row.active),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function rowToDelivery(row: Row): ZapierWebhookDelivery {
  return {
    id: String(row.id),
    event_id: String(row.event_id),
    subscription_id: String(row.subscription_id),
    workspace_id: String(row.workspace_id),
    event: String(row.event) as ZapierWebhookEventType,
    payload: row.payload as ZapierWebhookEnvelope,
    status: String(row.status) as ZapierDeliveryStatus,
    attempts: Number(row.attempts ?? 0),
    max_attempts: Number(row.max_attempts ?? ZAPIER_DELIVERY_MAX_ATTEMPTS),
    last_error: (row.last_error as string | null) ?? null,
    next_retry_at: (row.next_retry_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function createSupabaseZapierStore(admin: SupabaseClient): ZapierSubscriptionStore & ZapierOutboxStore {
  return {
    async createSubscription(row) {
      const { data, error } = await admin
        .from("zapier_webhook_subscriptions")
        .insert({
          workspace_id: row.workspace_id,
          user_id: row.user_id,
          event: row.event,
          target_url: row.target_url,
          secret: row.secret,
          active: true,
        })
        .select("*")
        .single();
      if (error || !data) {
        throw new Error(`Failed to create Zapier webhook subscription: ${error?.message ?? "no row"}`);
      }
      return rowToSubscription(data as Row);
    },

    async listActiveSubscriptions(workspaceId, event) {
      const { data, error } = await admin
        .from("zapier_webhook_subscriptions")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("event", event)
        .eq("active", true)
        .order("created_at", { ascending: true });
      if (error) throw new Error(`Failed to list Zapier webhook subscriptions: ${error.message}`);
      return (data ?? []).map((r) => rowToSubscription(r as Row));
    },

    async listSubscriptions(workspaceId) {
      const { data, error } = await admin
        .from("zapier_webhook_subscriptions")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (error) throw new Error(`Failed to list Zapier webhook subscriptions: ${error.message}`);
      return (data ?? []).map((r) => rowToSubscription(r as Row));
    },

    async getSubscription(id) {
      const { data, error } = await admin
        .from("zapier_webhook_subscriptions")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(`Failed to load Zapier webhook subscription: ${error.message}`);
      return data ? rowToSubscription(data as Row) : null;
    },

    async deactivateSubscription(id) {
      const { data, error } = await admin
        .from("zapier_webhook_subscriptions")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("active", true)
        .select("id");
      if (error) throw new Error(`Failed to deactivate Zapier webhook subscription: ${error.message}`);
      return (data?.length ?? 0) > 0;
    },

    async listStaleInactive(olderThanIso) {
      const { data, error } = await admin
        .from("zapier_webhook_subscriptions")
        .select("*")
        .eq("active", false)
        .lte("updated_at", olderThanIso);
      if (error) throw new Error(`Failed to list stale Zapier webhook subscriptions: ${error.message}`);
      return (data ?? []).map((r) => rowToSubscription(r as Row));
    },

    async deleteSubscription(id) {
      const { error } = await admin.from("zapier_webhook_subscriptions").delete().eq("id", id);
      if (error) throw new Error(`Failed to delete Zapier webhook subscription: ${error.message}`);
    },

    async enqueueDelivery(row) {
      // Idempotent on (event_id, subscription_id): a repeat enqueue
      // returns the existing row instead of violating the unique key.
      const { data: existing } = await admin
        .from("zapier_webhook_deliveries")
        .select("*")
        .eq("event_id", row.event_id)
        .eq("subscription_id", row.subscription_id)
        .maybeSingle();
      if (existing) return rowToDelivery(existing as Row);
      const { data, error } = await admin
        .from("zapier_webhook_deliveries")
        .insert({
          event_id: row.event_id,
          subscription_id: row.subscription_id,
          workspace_id: row.workspace_id,
          event: row.event,
          payload: row.payload as unknown as Record<string, unknown>,
          status: "pending",
          attempts: 0,
          max_attempts: ZAPIER_DELIVERY_MAX_ATTEMPTS,
        })
        .select("*")
        .single();
      if (error || !data) {
        // Race: another enqueue just inserted the same key.
        if (typeof error?.message === "string" && error.message.includes("zapier_webhook_deliveries_event_subscription_unique")) {
          const { data: raced } = await admin
            .from("zapier_webhook_deliveries")
            .select("*")
            .eq("event_id", row.event_id)
            .eq("subscription_id", row.subscription_id)
            .maybeSingle();
          if (raced) return rowToDelivery(raced as Row);
        }
        throw new Error(`Failed to enqueue Zapier webhook delivery: ${error?.message ?? "no row"}`);
      }
      return rowToDelivery(data as Row);
    },

    async getDelivery(id) {
      const { data, error } = await admin
        .from("zapier_webhook_deliveries")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(`Failed to load Zapier webhook delivery: ${error.message}`);
      return data ? rowToDelivery(data as Row) : null;
    },

    async updateDelivery(id, patch) {
      const dbPatch: Record<string, unknown> = { ...patch };
      delete dbPatch.id;
      delete dbPatch.payload;
      const { error } = await admin
        .from("zapier_webhook_deliveries")
        .update({ ...dbPatch, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(`Failed to update Zapier webhook delivery: ${error.message}`);
    },

    async listDueDeliveries(nowIso, limit = 25) {
      const { data, error } = await admin
        .from("zapier_webhook_deliveries")
        .select("*")
        .eq("status", "failed")
        .lte("next_retry_at", nowIso)
        .order("next_retry_at", { ascending: true })
        .limit(limit);
      if (error) throw new Error(`Failed to list due Zapier webhook deliveries: ${error.message}`);
      return (data ?? [])
        .map((r) => rowToDelivery(r as Row))
        .filter((d) => d.attempts < d.max_attempts);
    },
  };
}

// ── Subscription management (pure over the store) ───────────────────────────

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
 * instead of a second row — Zapier may re-subscribe when a Zap is
 * re-activated. The per-subscription secret is generated here and
 * is NEVER in the returned value.
 */
export async function subscribeZapierWebhook(
  store: ZapierSubscriptionStore,
  workspaceId: string,
  userId: string,
  input: SubscribeZapierWebhookInput
): Promise<SubscribeZapierWebhookResult> {
  if (!isZapierWebhookEventType(input.event)) {
    return {
      ok: false,
      status: 400,
      error: `event must be one of: ${["lead.created", "lead.updated", "lead.added_to_campaign", "lead.removed_from_campaign", "campaign.created", "campaign.status_changed", "conversation.reply_created", "subscription.changed"].join(", ")}.`,
      code: "invalid_event",
    };
  }
  if (typeof input.target_url !== "string" || !input.target_url.trim()) {
    return { ok: false, status: 400, error: "target_url is required.", code: "invalid_target_url" };
  }
  const checked = validateZapierTargetUrl(input.target_url.trim());
  if (!checked.ok) {
    return { ok: false, status: 400, error: checked.error, code: "invalid_target_url" };
  }
  const existing = await store.listActiveSubscriptions(workspaceId, input.event);
  const duplicate = existing.find((s) => s.target_url === checked.url);
  if (duplicate) {
    return { ok: true, subscription: publicSubscription(duplicate) };
  }
  const created = await store.createSubscription({
    workspace_id: workspaceId,
    user_id: userId,
    event: input.event,
    target_url: checked.url,
    secret: generateZapierWebhookSecret(),
  });
  return { ok: true, subscription: publicSubscription(created) };
}

/** Unsubscribe is idempotent: unknown id → 404, already-inactive → 200. */
export async function unsubscribeZapierWebhook(
  store: ZapierSubscriptionStore,
  workspaceId: string,
  id: string
): Promise<{ ok: boolean; status: number; error?: string; code?: string }> {
  const sub = await store.getSubscription(id);
  if (!sub || sub.workspace_id !== workspaceId) {
    return { ok: false, status: 404, error: "Subscription not found in this workspace.", code: "not_found" };
  }
  await store.deactivateSubscription(id);
  return { ok: true, status: 200 };
}

// ── Delivery ────────────────────────────────────────────────────────────────

export interface ZapierDeliveryAttemptDeps {
  store: ZapierSubscriptionStore & ZapierOutboxStore;
  fetchFn?: typeof fetch;
  now?: () => Date;
}

/**
 * Enqueues an event for every active subscription for
 * (workspace, event). Returns the delivery rows created (empty
 * when nobody subscribes — that is normal, not an error). Never
 * throws for a missing subscription; a store failure DOES throw
 * so the caller can decide (the emit helper swallows it — a
 * webhook problem must never break the user's mutation).
 */
export async function enqueueZapierEvent(
  store: ZapierSubscriptionStore & ZapierOutboxStore,
  envelope: ZapierWebhookEnvelope
): Promise<ZapierWebhookDelivery[]> {
  const subs = await store.listActiveSubscriptions(envelope.workspace_id, envelope.type);
  const rows: ZapierWebhookDelivery[] = [];
  for (const sub of subs) {
    rows.push(
      await store.enqueueDelivery({
        event_id: envelope.id,
        subscription_id: sub.id,
        workspace_id: envelope.workspace_id,
        event: envelope.type,
        payload: envelope,
      })
    );
  }
  return rows;
}

export interface ZapierAttemptResult {
  status: ZapierDeliveryStatus;
  attempts: number;
  /** True when Zapier answered 410 (subscription deactivated). */
  unsubscribed: boolean;
}

/**
 * Attempts ONE delivery: POSTs the signed envelope to the
 * subscription's target URL. 2xx → delivered. 410 → the
 * subscription is deactivated and the delivery is dead (Zapier
 * says the Zap is gone; retrying would never succeed). Anything
 * else / network error → failed with backoff, or dead after the
 * final attempt.
 */
export async function attemptZapierDelivery(
  deps: ZapierDeliveryAttemptDeps,
  delivery: ZapierWebhookDelivery
): Promise<ZapierAttemptResult> {
  const fetchFn = deps.fetchFn ?? fetch;
  const now = (deps.now ?? (() => new Date()))();
  const sub = await deps.store.getSubscription(delivery.subscription_id);
  if (!sub || !sub.active) {
    await deps.store.updateDelivery(delivery.id, {
      status: "dead",
      last_error: "Subscription is no longer active.",
      next_retry_at: null,
    });
    return { status: "dead", attempts: delivery.attempts, unsubscribed: true };
  }
  const attempts = delivery.attempts + 1;
  const rawBody = JSON.stringify(delivery.payload);
  const timestamp = Math.floor(now.getTime() / 1000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ZAPIER_DELIVERY_TIMEOUT_MS);
  let outcome: { ok: true } | { ok: false; status?: number; error: string };
  try {
    const res = await fetchFn(sub.target_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-NxtSend-Event": delivery.event,
        "X-NxtSend-Timestamp": String(timestamp),
        "X-NxtSend-Signature": buildSignatureHeader(sub.secret, timestamp, rawBody),
      },
      body: rawBody,
      signal: controller.signal,
    });
    if (res.status >= 200 && res.status < 300) outcome = { ok: true };
    else if (res.status === 410) outcome = { ok: false, status: 410, error: "Receiver responded HTTP 410 (subscription gone)." };
    else outcome = { ok: false, status: res.status, error: `Receiver responded HTTP ${res.status}` };
  } catch (err) {
    outcome = { ok: false, error: err instanceof Error ? err.message : "network error" };
  } finally {
    clearTimeout(timeout);
  }
  if (outcome.ok) {
    await deps.store.updateDelivery(delivery.id, {
      status: "delivered",
      attempts,
      last_error: null,
      next_retry_at: null,
    });
    return { status: "delivered", attempts, unsubscribed: false };
  }
  if (outcome.status === 410) {
    await deps.store.deactivateSubscription(sub.id);
    await deps.store.updateDelivery(delivery.id, {
      status: "dead",
      attempts,
      last_error: outcome.error,
      next_retry_at: null,
    });
    return { status: "dead", attempts, unsubscribed: true };
  }
  const delay = attempts < delivery.max_attempts ? zapierRetryDelayMs(attempts) : null;
  await deps.store.updateDelivery(delivery.id, {
    status: delay === null ? "dead" : "failed",
    attempts,
    last_error: outcome.error,
    next_retry_at: delay !== null ? new Date(now.getTime() + delay).toISOString() : null,
  });
  return { status: delay === null ? "dead" : "failed", attempts, unsubscribed: false };
}

/**
 * Retries every due delivery (the `zapier_webhook_retry` job).
 * Returns counts for the job log. Dead-letter rows are kept for
 * inspection — they are never deleted by the retry pass.
 */
export async function retryDueZapierDeliveries(
  deps: ZapierDeliveryAttemptDeps,
  nowIso: string
): Promise<{ due: number; delivered: number; failed: number; dead: number; unsubscribed: number }> {
  const due = await deps.store.listDueDeliveries(nowIso);
  let delivered = 0;
  let failed = 0;
  let dead = 0;
  let unsubscribed = 0;
  for (const delivery of due) {
    const current = (await deps.store.getDelivery(delivery.id)) ?? delivery;
    const result = await attemptZapierDelivery(deps, current);
    if (result.status === "delivered") delivered++;
    else if (result.status === "failed") failed++;
    else dead++;
    if (result.unsubscribed) unsubscribed++;
  }
  return { due: due.length, delivered, failed, dead, unsubscribed };
}
