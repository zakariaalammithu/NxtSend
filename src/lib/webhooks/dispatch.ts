/**
 * Outbound webhook dispatch — signed delivery with retry bookkeeping.
 *
 * Every dispatch is recorded FIRST in the delivery log, then attempted.
 * Failures schedule a retry (5 min, then 30 min) up to the delivery's
 * max_attempts; the `webhook_retry` background job performs the retries.
 * In Demo Mode (or when explicitly simulated) no HTTP call is made at
 * all — the delivery is recorded with status "simulated" so the log
 * never pretends an endpoint was reached.
 */

import { generateId } from "@/lib/utils";
import { buildSignatureHeader } from "./signing";
import type { WebhookConfig } from "./config";
import type { WebhookEnvelope } from "./events";

export type DeliveryStatus = "pending" | "delivered" | "failed" | "simulated";

export interface WebhookDelivery {
  id: string;
  workspace_id: string;
  event_type: string;
  payload: WebhookEnvelope;
  target_url: string;
  status: DeliveryStatus;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  next_retry_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookDeliveryStore {
  createDelivery(row: Omit<WebhookDelivery, "id" | "created_at" | "updated_at">): Promise<WebhookDelivery>;
  updateDelivery(id: string, patch: Partial<WebhookDelivery>): Promise<void>;
  getDelivery(id: string): Promise<WebhookDelivery | null>;
  listDeliveries(workspaceId: string, limit?: number): Promise<WebhookDelivery[]>;
  /** Failed deliveries whose retry time has arrived and cap not hit. */
  listDueRetries(nowIso: string, limit?: number): Promise<WebhookDelivery[]>;
}

export const DEFAULT_MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [5 * 60_000, 30 * 60_000];

export function nextRetryDelayMs(attempts: number): number | null {
  // attempts = attempts already made (1-based after first failure).
  if (attempts < 1) return RETRY_DELAYS_MS[0];
  return RETRY_DELAYS_MS[attempts - 1] ?? null;
}

export interface DispatchDeps {
  store: WebhookDeliveryStore;
  fetchFn?: typeof fetch;
  /** When true, record a simulated delivery and never call out. */
  simulated?: boolean;
  now?: () => Date;
}

async function attemptHttpDelivery(
  fetchFn: typeof fetch,
  config: WebhookConfig,
  envelope: WebhookEnvelope
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rawBody = JSON.stringify(envelope);
  const timestamp = Math.floor(Date.now() / 1000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetchFn(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-NxtSend-Event": envelope.type,
        "X-NxtSend-Timestamp": String(timestamp),
        "X-NxtSend-Signature": buildSignatureHeader(config.secret, timestamp, rawBody),
      },
      body: rawBody,
      signal: controller.signal,
    });
    if (res.status >= 200 && res.status < 300) return { ok: true };
    return { ok: false, error: `Receiver responded HTTP ${res.status}` };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "network error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Records + attempts one delivery. Used by the emit route (first
 * attempt) and by the webhook_retry job (subsequent attempts, via
 * retryDelivery on an existing row).
 */
export async function dispatchEvent(
  deps: DispatchDeps,
  config: WebhookConfig,
  envelope: WebhookEnvelope
): Promise<WebhookDelivery> {
  const delivery = await deps.store.createDelivery({
    workspace_id: envelope.workspace_id,
    event_type: envelope.type,
    payload: envelope,
    target_url: config.url,
    status: "pending",
    attempts: 0,
    max_attempts: DEFAULT_MAX_ATTEMPTS,
    last_error: null,
    next_retry_at: null,
  });
  if (deps.simulated) {
    await deps.store.updateDelivery(delivery.id, {
      status: "simulated",
      attempts: 1,
      last_error: null,
    });
    return { ...delivery, status: "simulated", attempts: 1 };
  }
  return runDeliveryAttempt(deps, config, delivery);
}

export async function runDeliveryAttempt(
  deps: DispatchDeps,
  config: WebhookConfig,
  delivery: WebhookDelivery
): Promise<WebhookDelivery> {
  const fetchFn = deps.fetchFn ?? fetch;
  const now = (deps.now ?? (() => new Date()))();
  const attempts = delivery.attempts + 1;
  const result = await attemptHttpDelivery(fetchFn, config, delivery.payload);
  if (result.ok) {
    const patch: Partial<WebhookDelivery> = {
      status: "delivered",
      attempts,
      last_error: null,
      next_retry_at: null,
    };
    await deps.store.updateDelivery(delivery.id, patch);
    return { ...delivery, ...patch };
  }
  const delay = attempts < delivery.max_attempts ? nextRetryDelayMs(attempts) : null;
  const patch: Partial<WebhookDelivery> = {
    status: "failed",
    attempts,
    last_error: result.error,
    next_retry_at:
      delay !== null ? new Date(now.getTime() + delay).toISOString() : null,
  };
  await deps.store.updateDelivery(delivery.id, patch);
  return { ...delivery, ...patch };
}

// ── In-memory store (Demo Mode + tests) ─────────────────────────────────────

export class InMemoryWebhookStore implements WebhookDeliveryStore {
  private rows = new Map<string, WebhookDelivery>();

  async createDelivery(
    row: Omit<WebhookDelivery, "id" | "created_at" | "updated_at">
  ): Promise<WebhookDelivery> {
    const ts = new Date().toISOString();
    const delivery: WebhookDelivery = {
      ...row,
      id: generateId(),
      created_at: ts,
      updated_at: ts,
    };
    this.rows.set(delivery.id, delivery);
    return delivery;
  }

  async updateDelivery(id: string, patch: Partial<WebhookDelivery>): Promise<void> {
    const existing = this.rows.get(id);
    if (!existing) return;
    this.rows.set(id, {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString(),
    });
  }

  async getDelivery(id: string): Promise<WebhookDelivery | null> {
    return this.rows.get(id) ?? null;
  }

  async listDeliveries(workspaceId: string, limit = 20): Promise<WebhookDelivery[]> {
    return Array.from(this.rows.values())
      .filter((d) => d.workspace_id === workspaceId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }

  async listDueRetries(nowIso: string, limit = 25): Promise<WebhookDelivery[]> {
    return Array.from(this.rows.values())
      .filter(
        (d) =>
          d.status === "failed" &&
          d.attempts < d.max_attempts &&
          d.next_retry_at !== null &&
          d.next_retry_at <= nowIso
      )
      .slice(0, limit);
  }
}

/** Process-wide demo store: demo deliveries survive across requests
 *  within one server process (and are labelled simulated). */
let demoStore: InMemoryWebhookStore | null = null;
export function getDemoWebhookStore(): InMemoryWebhookStore {
  if (!demoStore) demoStore = new InMemoryWebhookStore();
  return demoStore;
}
