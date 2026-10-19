/**
 * Webhook subscription configuration.
 *
 * Stored in the `integrations` table as provider = "webhooks" — the
 * config JSONB there is restricted to workspace owners/admins by
 * migration 002 (F8), which is exactly the audience allowed to manage
 * outbound webhooks. In Demo Mode the same shape is held in a
 * server-memory store and every delivery is labelled simulated.
 */

import { isConfiguredValue, type ProviderState } from "@/lib/env";
import { getDataMode, type DataMode } from "@/lib/data/mode";
import { WEBHOOK_EVENT_TYPES, type WebhookEventType } from "./events";

export interface WebhookConfig {
  url: string;
  /** Shared HMAC secret — server-side only, never sent to the client. */
  secret: string;
  events: WebhookEventType[];
  enabled: boolean;
}

export function parseWebhookConfig(raw: unknown): WebhookConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const url = typeof r.url === "string" ? r.url : "";
  const secret = typeof r.secret === "string" ? r.secret : "";
  if (!url) return null;
  const events = Array.isArray(r.events)
    ? r.events.filter(
        (e): e is WebhookEventType =>
          typeof e === "string" &&
          (WEBHOOK_EVENT_TYPES as readonly string[]).includes(e)
      )
    : [...WEBHOOK_EVENT_TYPES];
  return {
    url,
    secret,
    events: events.length > 0 ? events : [...WEBHOOK_EVENT_TYPES],
    enabled: r.enabled !== false,
  };
}

/** Public (browser-safe) view: the secret value is never included. */
export function publicWebhookConfig(config: WebhookConfig | null): {
  url: string | null;
  events: WebhookEventType[];
  enabled: boolean;
  hasSecret: boolean;
} {
  if (!config) {
    return { url: null, events: [], enabled: false, hasSecret: false };
  }
  return {
    url: config.url,
    events: config.events,
    enabled: config.enabled,
    hasSecret: isConfiguredValue(config.secret),
  };
}

export function getWebhookState(
  config: WebhookConfig | null,
  mode: DataMode = getDataMode()
): ProviderState {
  if (mode === "demo") return "demo";
  if (!config) return "not_connected";
  if (!isConfiguredValue(config.secret)) return "configuration_required";
  return "connected";
}

/** URL policy: https everywhere, except localhost for local n8n dev. */
export function validateWebhookUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: "That is not a valid URL." };
  }
  const isLocalhost =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol === "https:" || (parsed.protocol === "http:" && isLocalhost)) {
    return { ok: true, url: parsed.toString() };
  }
  return {
    ok: false,
    error: "Webhook URLs must be https:// (http:// is allowed only for localhost, e.g. a local n8n instance).",
  };
}
