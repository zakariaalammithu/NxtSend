/**
 * Browser-side Zapier event notifier (fire-and-forget).
 *
 * Mirrors src/lib/webhooks/client.ts: the data layer calls this
 * after real user actions in the browser. It carries NO secrets —
 * the server route (/api/integrations/zapier/emit) resolves the
 * workspace from the session and enqueues server-side. Failures
 * are swallowed by design: a webhook problem must never break the
 * user's actual action.
 */

import type { ZapierWebhookEventType } from "./events";

export function notifyZapierEvent(
  type: ZapierWebhookEventType,
  data: Record<string, unknown>
): void {
  if (typeof window === "undefined") return;
  try {
    void fetch("/api/integrations/zapier/emit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, data }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Fire-and-forget: never surface webhook errors in data operations.
  }
}
