/**
 * Shared webhook outbox (Zapier + n8n) — platform discriminator
 * over the migration 025 tables.
 *
 * Tables keep their `zapier_` names (renaming would break the
 * live Zapier integration); migration 029 adds a `platform`
 * column (`zapier` | `n8n`, default `zapier`) to both tables.
 * This module is the BASE outbox layer:
 * src/lib/integrations/zapier/outbox.ts wraps it under the
 * Zapier-only names, so the Zapier and n8n surfaces share one
 * delivery model (outbox, idempotent enqueue, immediate attempt,
 * backoff 5m → 30m, max 3, 410 deactivation, HMAC signing).
 * It imports NO values from the Zapier module (only types, which
 * are erased) — the reverse dependency would be a load-time
 * cycle, since the Zapier module imports this one.
 *
 * Platform semantics, stated plainly — the column discriminates
 * MANAGEMENT and RETRY, not delivery:
 *   - `listActiveSubscriptions` is deliberately UNFILTERED by
 *     platform: one event fans out to EVERY platform's active
 *     subscriptions (see enqueuePlatformEvent). A lead.created
 *     reaches Zapier hooks AND n8n webhooks.
 *   - `listSubscriptions`, `listStaleInactive` and
 *     `listDueDeliveries` ARE filtered by the store's bound
 *     platform: the n8n settings list shows n8n subscriptions
 *     only, and each platform's retry worker retries only its
 *     own deliveries.
 *   - `subscribePlatformWebhook` dedups per (workspace, event,
 *     target_url, platform); `validatePlatformTargetUrl` enforces
 *     per-platform URL rules (Zapier: hooks.zapier.com only;
 *     n8n: any public https host, never a Zapier host).
 *   - Delivery rows inherit their platform from their
 *     subscription at enqueue time.
 *
 * Secrets are generated server-side and NEVER returned after
 * creation (subscribe returns the public subscription only).
 */

import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateId } from "@/lib/utils";
import { buildSignatureHeader } from "@/lib/webhooks/signing";
import {
  isLocalDeployment,
  isPrivateOrLoopbackHost,
} from "@/lib/muse-connector/oauth/clients";
import type {
  ZapierAttemptResult,
  ZapierDeliveryStatus,
  ZapierSubscriptionStore,
  ZapierOutboxStore,
  ZapierWebhookDelivery,
  ZapierWebhookSubscription,
} from "@/lib/integrations/zapier/outbox";
import { isWebhookEventType, type WebhookEnvelope, type WebhookEventType } from "./events";
import type { RestPlatform } from "./config";

/** Max delivery attempts before a delivery dead-letters. */
export const DELIVERY_MAX_ATTEMPTS = 3;
/** Backoff after each failed attempt (attempt 1 → 5 min, 2 → 30 min). */
export const RETRY_DELAYS_MS = [5 * 60_000, 30 * 60_000];
/** Immediate-attempt timeout — a slow hook must not stall a mutation. */
export const DELIVERY_TIMEOUT_MS = 8_000;
/** Subscriptions inactive longer than this are cleaned by the job. */
export const STALE_SUBSCRIPTION_DAYS = 30;

/** Backoff delay (ms) after `attempts` failed attempts, or null when the cap is hit. */
export function platformRetryDelayMs(attempts: number): number | null {
  if (attempts < 1) return RETRY_DELAYS_MS[0];
  return RETRY_DELAYS_MS[attempts - 1] ?? null;
}

export type PlatformDeliveryStatus = ZapierDeliveryStatus;

export interface PlatformWebhookSubscription extends ZapierWebhookSubscription {
  platform: RestPlatform;
}

export interface PlatformWebhookDelivery extends ZapierWebhookDelivery {
  platform: RestPlatform;
}

export type PublicPlatformSubscription = Omit<PlatformWebhookSubscription, "secret">;

export function publicPlatformSubscription(
  sub: PlatformWebhookSubscription
): PublicPlatformSubscription {
  const { secret: _secret, ...rest } = sub;
  void _secret;
  return rest;
}

/**
 * Contract aliases (shared REST layer spec): the generic
 * store/type names. `WebhookSubscriptionStore` and
 * `WebhookOutboxStore` are the same platform store — one store
 * object implements both halves.
 */
export type WebhookSubscription = PlatformWebhookSubscription;
export type WebhookDelivery = PlatformWebhookDelivery;
export type WebhookDeliveryStatus = PlatformDeliveryStatus;
export type WebhookSubscriptionStore = PlatformWebhookStore;
export type WebhookOutboxStore = PlatformWebhookStore;
export type PublicWebhookSubscription = PublicPlatformSubscription;
export const publicSubscription = publicPlatformSubscription;

/**
 * A webhook store bound to one platform for management/retry
 * (see the module header for what is — and is not — filtered).
 * `createSubscription` / `enqueueDelivery` accept an optional
 * `platform` in the row; when omitted the store's bound platform
 * (create) or the subscription's platform (enqueue) is used.
 */
export interface PlatformWebhookStore
  extends ZapierSubscriptionStore,
    ZapierOutboxStore {
  readonly platform: RestPlatform;
  createSubscription(row: {
    workspace_id: string;
    user_id: string;
    event: WebhookEventType;
    target_url: string;
    secret: string;
    platform?: RestPlatform;
  }): Promise<PlatformWebhookSubscription>;
  listActiveSubscriptions(
    workspaceId: string,
    event: WebhookEventType,
    /**
     * Optional platform filter. Omitted = every platform (the
     * fan-out default — emit reaches all platforms' hooks).
     * Pass a platform to list only that platform's subscriptions.
     */
    platform?: RestPlatform
  ): Promise<PlatformWebhookSubscription[]>;
  listSubscriptions(workspaceId: string, platform?: RestPlatform): Promise<PlatformWebhookSubscription[]>;
  getSubscription(id: string): Promise<PlatformWebhookSubscription | null>;
  listStaleInactive(olderThanIso: string): Promise<PlatformWebhookSubscription[]>;
  enqueueDelivery(row: {
    event_id: string;
    subscription_id: string;
    workspace_id: string;
    event: WebhookEventType;
    payload: WebhookEnvelope;
    platform?: RestPlatform;
  }): Promise<PlatformWebhookDelivery>;
  getDelivery(id: string): Promise<PlatformWebhookDelivery | null>;
  listDueDeliveries(nowIso: string, limit?: number): Promise<PlatformWebhookDelivery[]>;
}

/** Generates a per-subscription HMAC secret (server-side only). */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString("base64url");
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

/**
 * Validates a webhook target URL for a platform.
 * Zapier: https + hooks.zapier.com / zapier.com (unchanged).
 * n8n: any https URL on a public host — n8n instances are
 * self-hosted/Cloud, so the host cannot be allowlisted — EXCEPT
 * localhost / private IPs (refused in production; http loopback
 * only on a local deployment) and Zapier hosts (a Zapier hook URL
 * is not an n8n webhook URL, and vice versa).
 */
export function validatePlatformTargetUrl(
  platform: RestPlatform,
  raw: string
): { ok: true; url: string } | { ok: false; error: string } {
  if (platform === "zapier") return validateZapierTargetUrl(raw);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: "target_url is not a valid URL." };
  }
  if (parsed.search || parsed.hash) {
    return { ok: false, error: "target_url must not contain a query string or fragment." };
  }
  if (parsed.protocol === "http:") {
    if (!isLocalDeployment()) {
      return {
        ok: false,
        error: "target_url must use https (http loopback is allowed only on a local deployment).",
      };
    }
    if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      return { ok: false, error: "target_url must use https." };
    }
    return { ok: true, url: parsed.toString() };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, error: "target_url must use https." };
  }
  const host = parsed.hostname.toLowerCase();
  if (!host) return { ok: false, error: "target_url must have a host." };
  if (host === "zapier.com" || host === "hooks.zapier.com") {
    return {
      ok: false,
      error: "target_url must be an n8n webhook URL, not a Zapier hook URL.",
    };
  }
  if (isPrivateOrLoopbackHost(host)) {
    return {
      ok: false,
      error: "target_url must be a public host (localhost and private IPs are not allowed).",
    };
  }
  return { ok: true, url: parsed.toString() };
}

// ── In-memory store (tests + Demo Mode process store) ───────────────────────

export class InMemoryPlatformStore implements PlatformWebhookStore {
  readonly platform: RestPlatform;
  private subs = new Map<string, PlatformWebhookSubscription>();
  private deliveries = new Map<string, PlatformWebhookDelivery>();
  private deliveryKeys = new Map<string, string>();

  constructor(platform: RestPlatform) {
    this.platform = platform;
  }

  async createSubscription(row: {
    workspace_id: string;
    user_id: string;
    event: WebhookEventType;
    target_url: string;
    secret: string;
    platform?: RestPlatform;
  }): Promise<PlatformWebhookSubscription> {
    const now = new Date().toISOString();
    const sub: PlatformWebhookSubscription = {
      id: generateId(),
      ...row,
      platform: row.platform ?? this.platform,
      active: true,
      created_at: now,
      updated_at: now,
    };
    this.subs.set(sub.id, sub);
    return sub;
  }

  async listActiveSubscriptions(
    workspaceId: string,
    event: WebhookEventType,
    platform?: RestPlatform
  ): Promise<PlatformWebhookSubscription[]> {
    // Unfiltered by platform on purpose — emit fans out to every
    // platform's subscriptions (see the module header) — unless
    // the caller asked for one platform explicitly.
    return Array.from(this.subs.values())
      .filter(
        (s) =>
          s.workspace_id === workspaceId &&
          s.event === event &&
          s.active &&
          (platform === undefined || s.platform === platform)
      )
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async listSubscriptions(
    workspaceId: string,
    platform?: RestPlatform
  ): Promise<PlatformWebhookSubscription[]> {
    const wanted = platform ?? this.platform;
    return Array.from(this.subs.values())
      .filter((s) => s.workspace_id === workspaceId && s.active && s.platform === wanted)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async getSubscription(id: string): Promise<PlatformWebhookSubscription | null> {
    return this.subs.get(id) ?? null;
  }

  async deactivateSubscription(id: string): Promise<boolean> {
    const sub = this.subs.get(id);
    if (!sub) return false;
    this.subs.set(id, { ...sub, active: false, updated_at: new Date().toISOString() });
    return true;
  }

  async listStaleInactive(olderThanIso: string): Promise<PlatformWebhookSubscription[]> {
    return Array.from(this.subs.values()).filter(
      (s) => !s.active && s.platform === this.platform && s.updated_at <= olderThanIso
    );
  }

  async deleteSubscription(id: string): Promise<void> {
    this.subs.delete(id);
  }

  async enqueueDelivery(row: {
    event_id: string;
    subscription_id: string;
    workspace_id: string;
    event: WebhookEventType;
    payload: WebhookEnvelope;
    platform?: RestPlatform;
  }): Promise<PlatformWebhookDelivery> {
    const key = `${row.event_id}:${row.subscription_id}`;
    const existingId = this.deliveryKeys.get(key);
    if (existingId) {
      const existing = this.deliveries.get(existingId);
      if (existing) return existing;
    }
    const now = new Date().toISOString();
    const sub = this.subs.get(row.subscription_id);
    const delivery: PlatformWebhookDelivery = {
      id: generateId(),
      ...row,
      platform: row.platform ?? sub?.platform ?? this.platform,
      status: "pending",
      attempts: 0,
      max_attempts: DELIVERY_MAX_ATTEMPTS,
      last_error: null,
      next_retry_at: null,
      created_at: now,
      updated_at: now,
    };
    this.deliveries.set(delivery.id, delivery);
    this.deliveryKeys.set(key, delivery.id);
    return delivery;
  }

  async getDelivery(id: string): Promise<PlatformWebhookDelivery | null> {
    return this.deliveries.get(id) ?? null;
  }

  async updateDelivery(id: string, patch: Partial<PlatformWebhookDelivery>): Promise<void> {
    const existing = this.deliveries.get(id);
    if (!existing) return;
    this.deliveries.set(id, { ...existing, ...patch, updated_at: new Date().toISOString() });
  }

  async listDueDeliveries(nowIso: string, limit = 25): Promise<PlatformWebhookDelivery[]> {
    return Array.from(this.deliveries.values())
      .filter(
        (d) =>
          d.platform === this.platform &&
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
let demoStore: InMemoryPlatformStore | null = null;
export function getDemoPlatformStore(): InMemoryPlatformStore {
  if (!demoStore) demoStore = new InMemoryPlatformStore("zapier");
  return demoStore;
}

// ── Supabase store (service role only; migrations 025 + 029) ───────────────

type Row = Record<string, unknown>;

function rowToSubscription(row: Row): PlatformWebhookSubscription {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    user_id: String(row.user_id),
    event: String(row.event) as WebhookEventType,
    target_url: String(row.target_url),
    secret: String(row.secret ?? ""),
    active: Boolean(row.active),
    platform: row.platform === "n8n" ? "n8n" : "zapier",
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function rowToDelivery(row: Row): PlatformWebhookDelivery {
  return {
    id: String(row.id),
    event_id: String(row.event_id),
    subscription_id: String(row.subscription_id),
    workspace_id: String(row.workspace_id),
    event: String(row.event) as WebhookEventType,
    payload: row.payload as WebhookEnvelope,
    status: String(row.status) as PlatformDeliveryStatus,
    attempts: Number(row.attempts ?? 0),
    max_attempts: Number(row.max_attempts ?? DELIVERY_MAX_ATTEMPTS),
    last_error: (row.last_error as string | null) ?? null,
    next_retry_at: (row.next_retry_at as string | null) ?? null,
    platform: row.platform === "n8n" ? "n8n" : "zapier",
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function createPlatformStore(
  admin: SupabaseClient,
  platform: RestPlatform
): PlatformWebhookStore {
  return {
    platform,
    async createSubscription(row) {
      const { data, error } = await admin
        .from("zapier_webhook_subscriptions")
        .insert({
          workspace_id: row.workspace_id,
          user_id: row.user_id,
          event: row.event,
          target_url: row.target_url,
          secret: row.secret,
          platform: row.platform ?? platform,
          active: true,
        })
        .select("*")
        .single();
      if (error || !data) {
        throw new Error(`Failed to create webhook subscription: ${error?.message ?? "no row"}`);
      }
      return rowToSubscription(data as Row);
    },

    async listActiveSubscriptions(workspaceId, event, platformFilter?: RestPlatform) {
      // Unfiltered by platform on purpose — emit fans out to every
      // platform's subscriptions (see the module header) — unless
      // the caller asked for one platform explicitly.
      let query = admin
        .from("zapier_webhook_subscriptions")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("event", event)
        .eq("active", true);
      if (platformFilter !== undefined) query = query.eq("platform", platformFilter);
      const { data, error } = await query.order("created_at", { ascending: true });
      if (error) throw new Error(`Failed to list webhook subscriptions: ${error.message}`);
      return (data ?? []).map((r) => rowToSubscription(r as Row));
    },

    async listSubscriptions(workspaceId, platformFilter?: RestPlatform) {
      const { data, error } = await admin
        .from("zapier_webhook_subscriptions")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("platform", platformFilter ?? platform)
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (error) throw new Error(`Failed to list webhook subscriptions: ${error.message}`);
      return (data ?? []).map((r) => rowToSubscription(r as Row));
    },

    async getSubscription(id) {
      const { data, error } = await admin
        .from("zapier_webhook_subscriptions")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(`Failed to load webhook subscription: ${error.message}`);
      return data ? rowToSubscription(data as Row) : null;
    },

    async deactivateSubscription(id) {
      const { data, error } = await admin
        .from("zapier_webhook_subscriptions")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("active", true)
        .select("id");
      if (error) throw new Error(`Failed to deactivate webhook subscription: ${error.message}`);
      return (data?.length ?? 0) > 0;
    },

    async listStaleInactive(olderThanIso) {
      const { data, error } = await admin
        .from("zapier_webhook_subscriptions")
        .select("*")
        .eq("platform", platform)
        .eq("active", false)
        .lte("updated_at", olderThanIso);
      if (error) throw new Error(`Failed to list stale webhook subscriptions: ${error.message}`);
      return (data ?? []).map((r) => rowToSubscription(r as Row));
    },

    async deleteSubscription(id) {
      const { error } = await admin.from("zapier_webhook_subscriptions").delete().eq("id", id);
      if (error) throw new Error(`Failed to delete webhook subscription: ${error.message}`);
    },

    async enqueueDelivery(row) {
      const { data: existing } = await admin
        .from("zapier_webhook_deliveries")
        .select("*")
        .eq("event_id", row.event_id)
        .eq("subscription_id", row.subscription_id)
        .maybeSingle();
      if (existing) return rowToDelivery(existing as Row);
      // The delivery inherits its platform from its subscription.
      const sub = await this.getSubscription(row.subscription_id);
      const deliveryPlatform = row.platform ?? sub?.platform ?? platform;
      const { data, error } = await admin
        .from("zapier_webhook_deliveries")
        .insert({
          event_id: row.event_id,
          subscription_id: row.subscription_id,
          workspace_id: row.workspace_id,
          event: row.event,
          payload: row.payload as unknown as Record<string, unknown>,
          platform: deliveryPlatform,
          status: "pending",
          attempts: 0,
          max_attempts: DELIVERY_MAX_ATTEMPTS,
        })
        .select("*")
        .single();
      if (error || !data) {
        if (typeof error?.message === "string" && error.message.includes("zapier_webhook_deliveries_event_subscription_unique")) {
          const { data: raced } = await admin
            .from("zapier_webhook_deliveries")
            .select("*")
            .eq("event_id", row.event_id)
            .eq("subscription_id", row.subscription_id)
            .maybeSingle();
          if (raced) return rowToDelivery(raced as Row);
        }
        throw new Error(`Failed to enqueue webhook delivery: ${error?.message ?? "no row"}`);
      }
      return rowToDelivery(data as Row);
    },

    async getDelivery(id) {
      const { data, error } = await admin
        .from("zapier_webhook_deliveries")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(`Failed to load webhook delivery: ${error.message}`);
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
      if (error) throw new Error(`Failed to update webhook delivery: ${error.message}`);
    },

    async listDueDeliveries(nowIso, limit = 25) {
      const { data, error } = await admin
        .from("zapier_webhook_deliveries")
        .select("*")
        .eq("platform", platform)
        .eq("status", "failed")
        .lte("next_retry_at", nowIso)
        .order("next_retry_at", { ascending: true })
        .limit(limit);
      if (error) throw new Error(`Failed to list due webhook deliveries: ${error.message}`);
      return (data ?? [])
        .map((r) => rowToDelivery(r as Row))
        .filter((d) => d.attempts < d.max_attempts);
    },
  };
}

/**
 * Adapts a legacy (pre-platform) Zapier store to the platform
 * store shape, bound to `platform`. Used only by the
 * `emitZapierEvent` backwards-compatibility wrapper: legacy
 * stores have no platform column, so their rows read as
 * `platform: "zapier"` and deliveries they enqueue inherit that.
 * All live paths use createPlatformStore / InMemoryPlatformStore.
 */
export function asPlatformStore(
  store: ZapierSubscriptionStore & ZapierOutboxStore,
  platform: RestPlatform
): PlatformWebhookStore {
  return {
    platform,
    createSubscription: (row) =>
      store.createSubscription(row).then((sub) => ({ ...sub, platform: row.platform ?? platform })),
    listActiveSubscriptions: (workspaceId, event, platformFilter?) =>
      // Legacy store takes no platform arg — filter in memory when asked.
      store.listActiveSubscriptions(workspaceId, event).then((subs) =>
        subs
          .filter(
            (s) =>
              platformFilter === undefined ||
              ((s as Partial<PlatformWebhookSubscription>).platform ?? platform) === platformFilter
          )
          .map((s) => ({
            ...s,
            platform: (s as Partial<PlatformWebhookSubscription>).platform ?? platform,
          }))
      ),
    listSubscriptions: (workspaceId, platformFilter?) =>
      // Legacy store takes no platform arg — filter in memory.
      store.listSubscriptions(workspaceId).then((subs) =>
        subs
          .filter(
            (s) => ((s as Partial<PlatformWebhookSubscription>).platform ?? platform) === (platformFilter ?? platform)
          )
          .map((s) => ({
            ...s,
            platform: (s as Partial<PlatformWebhookSubscription>).platform ?? platform,
          }))
      ),
    getSubscription: (id) =>
      store.getSubscription(id).then((sub) =>
        sub
          ? { ...sub, platform: (sub as Partial<PlatformWebhookSubscription>).platform ?? platform }
          : null
      ),
    deactivateSubscription: (id) => store.deactivateSubscription(id),
    listStaleInactive: (olderThanIso) =>
      store.listStaleInactive(olderThanIso).then((subs) =>
        subs
          .filter(
            (s) => ((s as Partial<PlatformWebhookSubscription>).platform ?? platform) === platform
          )
          .map((s) => ({
            ...s,
            platform: (s as Partial<PlatformWebhookSubscription>).platform ?? platform,
          }))
      ),
    deleteSubscription: (id) => store.deleteSubscription(id),
    enqueueDelivery: async (row) => {
      const sub = await store.getSubscription(row.subscription_id);
      const deliveryPlatform =
        row.platform ??
        (sub as Partial<PlatformWebhookSubscription> | null)?.platform ??
        platform;
      const created = await store.enqueueDelivery(row);
      return { ...created, platform: deliveryPlatform };
    },
    getDelivery: (id) =>
      store.getDelivery(id).then((d) =>
        d
          ? { ...d, platform: (d as Partial<PlatformWebhookDelivery>).platform ?? platform }
          : null
      ),
    updateDelivery: (id, patch) => store.updateDelivery(id, patch),
    listDueDeliveries: (nowIso, limit) =>
      store.listDueDeliveries(nowIso, limit).then((rows) =>
        rows
          .filter(
            (d) => ((d as Partial<PlatformWebhookDelivery>).platform ?? platform) === platform
          )
          .map((d) => ({
            ...d,
            platform: (d as Partial<PlatformWebhookDelivery>).platform ?? platform,
          }))
      ),
  };
}

// ── Subscription management (pure over the store) ───────────────────────────

export interface SubscribePlatformWebhookInput {
  event: unknown;
  target_url: unknown;
}

export type SubscribePlatformWebhookResult =
  | { ok: true; subscription: PublicPlatformSubscription }
  | { ok: false; status: number; error: string; code: string };

/**
 * Creates a subscription for a platform. A duplicate (same
 * workspace + event + target_url + platform, still active)
 * returns the existing subscription instead of a second row. The
 * per-subscription secret is generated here and is NEVER in the
 * returned value.
 */
export async function subscribePlatformWebhook(
  store: PlatformWebhookStore,
  platform: RestPlatform,
  workspaceId: string,
  userId: string,
  input: SubscribePlatformWebhookInput
): Promise<SubscribePlatformWebhookResult> {
  if (!isWebhookEventType(input.event)) {
    return {
      ok: false,
      status: 400,
      error: `event must be one of: ${[
        "lead.created",
        "lead.updated",
        "lead.added_to_campaign",
        "lead.removed_from_campaign",
        "campaign.created",
        "campaign.status_changed",
        "conversation.reply_created",
        "subscription.changed",
      ].join(", ")}.`,
      code: "invalid_event",
    };
  }
  if (typeof input.target_url !== "string" || !input.target_url.trim()) {
    return { ok: false, status: 400, error: "target_url is required.", code: "invalid_target_url" };
  }
  const checked = validatePlatformTargetUrl(platform, input.target_url.trim());
  if (!checked.ok) {
    return { ok: false, status: 400, error: checked.error, code: "invalid_target_url" };
  }
  const existing = await store.listActiveSubscriptions(workspaceId, input.event);
  const duplicate = existing.find(
    (s) => s.platform === platform && s.target_url === checked.url
  );
  if (duplicate) {
    return { ok: true, subscription: publicPlatformSubscription(duplicate) };
  }
  const created = await store.createSubscription({
    workspace_id: workspaceId,
    user_id: userId,
    event: input.event,
    target_url: checked.url,
    secret: generateWebhookSecret(),
    platform,
  });
  return { ok: true, subscription: publicPlatformSubscription(created) };
}

/** Unsubscribe is idempotent: unknown id / wrong platform → 404, already-inactive → 200. */
export async function unsubscribePlatformWebhook(
  store: PlatformWebhookStore,
  platform: RestPlatform,
  workspaceId: string,
  id: string
): Promise<{ ok: boolean; status: number; error?: string; code?: string }> {
  const sub = await store.getSubscription(id);
  if (!sub || sub.workspace_id !== workspaceId || sub.platform !== platform) {
    return { ok: false, status: 404, error: "Subscription not found in this workspace.", code: "not_found" };
  }
  await store.deactivateSubscription(id);
  return { ok: true, status: 200 };
}

// ── Delivery ────────────────────────────────────────────────────────────────

/**
 * Enqueues an event for every active subscription for
 * (workspace, event) — across ALL platforms (fan-out). Returns
 * the delivery rows created (empty when nobody subscribes — that
 * is normal, not an error). The store's listActiveSubscriptions
 * is unfiltered by platform by design (see the module header).
 */
export async function enqueuePlatformEvent(
  store: ZapierSubscriptionStore & ZapierOutboxStore,
  envelope: WebhookEnvelope
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

export type PlatformAttemptResult = ZapierAttemptResult;

export interface PlatformDeliveryAttemptDeps {
  store: ZapierSubscriptionStore & ZapierOutboxStore;
  fetchFn?: typeof fetch;
  now?: () => Date;
}

/**
 * Attempts ONE delivery: POSTs the signed envelope to the
 * subscription's target URL. 2xx → delivered. 410 → the
 * subscription is deactivated and the delivery is dead (the
 * receiver says the hook is gone; retrying would never succeed).
 * Anything else / network error → failed with backoff, or dead
 * after the final attempt.
 *
 * Signing reuses src/lib/webhooks/signing.ts (HMAC-SHA256,
 * `X-NxtSend-Signature: t=<ts>,v1=<hex>` + `X-NxtSend-Timestamp`,
 * 5-minute tolerance). Honest note: Zapier does NOT document
 * verifying these headers on REST Hook deliveries — the signature
 * is for receivers that do verify, and for our own delivery-log
 * integrity. Do not claim Zapier checks it.
 */
export async function attemptPlatformDelivery(
  deps: PlatformDeliveryAttemptDeps,
  delivery: ZapierWebhookDelivery
): Promise<PlatformAttemptResult> {
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
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
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
  const delay = attempts < delivery.max_attempts ? platformRetryDelayMs(attempts) : null;
  await deps.store.updateDelivery(delivery.id, {
    status: delay === null ? "dead" : "failed",
    attempts,
    last_error: outcome.error,
    next_retry_at: delay !== null ? new Date(now.getTime() + delay).toISOString() : null,
  });
  return { status: delay === null ? "dead" : "failed", attempts, unsubscribed: false };
}

/**
 * Retries every due delivery for one platform (the
 * `<platform>_webhook_retry` job). The store passed in MUST be
 * bound to `platform` — its listDueDeliveries is the
 * platform filter. Dead-letter rows are kept for inspection —
 * they are never deleted by the retry pass.
 */
export async function retryDuePlatformDeliveries(
  deps: PlatformDeliveryAttemptDeps & { store: PlatformWebhookStore },
  platform: RestPlatform,
  nowIso: string
): Promise<{ due: number; delivered: number; failed: number; dead: number; unsubscribed: number }> {
  if (deps.store.platform !== platform) {
    throw new Error(
      `retryDuePlatformDeliveries called for platform "${platform}" with a store bound to "${deps.store.platform}"`
    );
  }
  const due = await deps.store.listDueDeliveries(nowIso);
  let delivered = 0;
  let failed = 0;
  let dead = 0;
  let unsubscribed = 0;
  for (const delivery of due) {
    const current = (await deps.store.getDelivery(delivery.id)) ?? delivery;
    const result = await attemptPlatformDelivery(deps, current);
    if (result.status === "delivered") delivered++;
    else if (result.status === "failed") failed++;
    else dead++;
    if (result.unsubscribed) unsubscribed++;
  }
  return { due: due.length, delivered, failed, dead, unsubscribed };
}
