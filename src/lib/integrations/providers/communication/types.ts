/**
 * Shared shape for every communication adapter.
 *
 * A communication adapter is deliberately small: it takes a
 * notification event, builds the message with the shared templates
 * (src/lib/integrations/notifications/templates.ts) and delivers it
 * through the provider's official API via ProviderHttpClient.
 *
 * Credentials are supplied by the CALLER (decrypted server-side
 * from `integration_connections` via
 * getDecryptedProviderCredential) — adapters never read the store
 * themselves and never log a credential. A missing credential is a
 * delivery failure (`ok: false`, error `credentials_missing`),
 * never an exception, so a failed alert never fails the mutation
 * that triggered it.
 *
 * `checkConfiguration` is a stored-state check only (no live call):
 * it reports which required settings are missing so a panel can
 * say "configuration required" honestly. There is no live "probe"
 * here — a provider is only ever "connected" after a real
 * authenticated check or a successful delivery.
 */

import type { ProviderCredential } from "../connections";
import type {
  NotificationEventInput,
  NotificationMessage,
} from "@/lib/integrations/notifications/templates";

export interface NotificationDelivery {
  ok: boolean;
  provider: string;
  /** Provider-side message id, when the provider returns one. */
  messageId: string | null;
  /** Short error code/message when ok is false. Never contains a secret. */
  error: string | null;
  deliveredAt: string;
}

export interface CommunicationAdapter {
  readonly provider: string;
  sendNotification(event: NotificationEventInput): Promise<NotificationDelivery>;
  checkConfiguration(): { configured: boolean; missing: string[] };
}

export interface CommunicationAdapterDeps {
  /** Decrypted credential from the connection store, or null. */
  credential: ProviderCredential | null;
}

/** Builds a failure delivery result (never throws). */
export function failedDelivery(
  provider: string,
  error: string
): NotificationDelivery {
  return {
    ok: false,
    provider,
    messageId: null,
    error,
    deliveredAt: new Date().toISOString(),
  };
}

/** Builds a success delivery result. */
export function okDelivery(
  provider: string,
  messageId: string | null
): NotificationDelivery {
  return {
    ok: true,
    provider,
    messageId,
    error: null,
    deliveredAt: new Date().toISOString(),
  };
}

/**
 * Reads a named setting from the credential's `extra` bag (where
 * per-workspace provider settings are stored, e.g. a channel id or
 * webhook URL) or from a plain settings object. Returns undefined
 * when absent — callers turn that into a `configuration_required`
 * failure, never a guess.
 */
export function readSetting(
  credential: ProviderCredential | null,
  settings: object,
  key: string
): string | undefined {
  const fromSettings = (settings as Record<string, unknown>)[key];
  if (typeof fromSettings === "string" && fromSettings.trim().length > 0) return fromSettings.trim();
  const fromCredential = credential?.extra?.[key];
  if (fromCredential && fromCredential.trim().length > 0) return fromCredential.trim();
  return undefined;
}

/** Renders a message as "title\ntext" for providers with one text field. */
export function renderMessageText(message: NotificationMessage): string {
  return `${message.title}\n${message.text}`;
}
