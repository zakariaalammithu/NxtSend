/**
 * Provider health — stored-state checks only, no live calls.
 *
 * `checkProviderHealth` never calls the provider: a "connected"
 * claim must come from a verified check (an adapter's own probe or
 * a successful sync), never from the mere presence of a row. This
 * module only reads back what is already stored:
 *
 *   - a stored "error" status (with its last_error) → "error"
 *   - a stored "connected" status but no credential blob →
 *     "credentials_missing"
 *   - a stored "connected" status with an expired credential →
 *     "error" (the credential must be refreshed / reconnected)
 *   - anything else → the stored status, passed through
 *
 * `getSystemHealth()` (src/lib/admin/platform-server.ts) was NOT
 * extended: it already has a generic `integrations` entry built
 * from env-derived integration statuses, and it takes no
 * workspace/admin context to read `integration_connections` from,
 * so there is no clean extension point — wiring this in would mean
 * changing the admin health shape its tests pin down. Provider
 * workers surface per-provider health through their own panels
 * instead.
 */

import type { ProviderConnectionStatus } from "./types";
import type { ProviderConnection } from "./connections";

export interface ProviderHealthResult {
  status: ProviderConnectionStatus;
  lastCheckedAt: string;
  detail: string;
}

export function checkProviderHealth(
  provider: string,
  connection: ProviderConnection | null
): ProviderHealthResult {
  const now = new Date().toISOString();
  if (!connection) {
    return {
      status: "disconnected",
      lastCheckedAt: now,
      detail: `No ${provider} connection has been set up for this workspace.`,
    };
  }

  switch (connection.status) {
    case "error":
      return {
        status: "error",
        lastCheckedAt: now,
        detail: connection.lastError ?? `${provider} reported an error.`,
      };
    case "coming_soon":
      return {
        status: "coming_soon",
        lastCheckedAt: now,
        detail: `${provider} is not available yet.`,
      };
    case "disconnected":
      return {
        status: "disconnected",
        lastCheckedAt: now,
        detail: `${provider} is disconnected.`,
      };
    case "configuration_required":
      return {
        status: "configuration_required",
        lastCheckedAt: now,
        detail: `${provider} needs configuration before it can connect.`,
      };
    case "credentials_missing":
      return {
        status: "credentials_missing",
        lastCheckedAt: now,
        detail: `No ${provider} credential is stored — reconnect to supply one.`,
      };
    case "connected": {
      if (!connection.hasCredentials) {
        return {
          status: "credentials_missing",
          lastCheckedAt: now,
          detail: `${provider} is marked connected but no credential is stored — reconnect.`,
        };
      }
      if (
        connection.credentialExpiresAt &&
        new Date(connection.credentialExpiresAt).getTime() <= Date.now()
      ) {
        return {
          status: "error",
          lastCheckedAt: now,
          detail: `The stored ${provider} credential expired at ${connection.credentialExpiresAt} — reconnect.`,
        };
      }
      return {
        status: "connected",
        lastCheckedAt: now,
        detail: connection.lastSyncAt
          ? `${provider} is connected. Last sync ${connection.lastSyncAt}.`
          : `${provider} is connected. No sync has run yet.`,
      };
    }
  }
}
