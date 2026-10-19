/**
 * Browser-side event notifier (fire-and-forget).
 *
 * The data layer calls this after real user actions (lead created /
 * imported, campaign lifecycle). It carries NO secrets — the server
 * route resolves the workspace from the session, loads the workspace's
 * webhook config (URL + HMAC secret) server-side, signs and dispatches.
 * Failures are swallowed by design: a webhook problem must never break
 * the user's actual action, and the delivery log records the outcome.
 */

import type { WebhookEventType } from "./events";

export function notifyWebhookEvent(
  type: WebhookEventType,
  data: Record<string, unknown>
): void {
  if (typeof window === "undefined") return;
  try {
    void fetch("/api/webhooks/emit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, data }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Fire-and-forget: never surface webhook errors in data operations.
  }
}
