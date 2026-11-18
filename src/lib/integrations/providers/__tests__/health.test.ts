/**
 * Provider health tests — stored-state mapping only, no live calls.
 */

import { describe, it, expect } from "vitest";
import { checkProviderHealth } from "../health";
import type { ProviderConnection } from "../connections";

function connection(overrides: Partial<ProviderConnection> = {}): ProviderConnection {
  return {
    id: "conn_1",
    workspaceId: "ws_a",
    provider: "hubspot",
    authType: "oauth2",
    status: "connected",
    lastSyncAt: null,
    lastError: null,
    createdAt: "2026-11-19T00:00:00.000Z",
    updatedAt: "2026-11-19T00:00:00.000Z",
    hasCredentials: true,
    credentialExpiresAt: null,
    ...overrides,
  };
}

describe("checkProviderHealth", () => {
  it("reports disconnected when no connection exists", () => {
    const result = checkProviderHealth("hubspot", null);
    expect(result.status).toBe("disconnected");
    expect(result.detail).toContain("No hubspot connection");
    expect(result.lastCheckedAt).toBeTruthy();
  });

  it("reports connected when stored connected with a credential and no expiry", () => {
    const result = checkProviderHealth("hubspot", connection());
    expect(result.status).toBe("connected");
    expect(result.detail).toContain("No sync has run yet");
  });

  it("mentions the last sync when one ran", () => {
    const result = checkProviderHealth(
      "hubspot",
      connection({ lastSyncAt: "2026-11-18T10:00:00.000Z" })
    );
    expect(result.status).toBe("connected");
    expect(result.detail).toContain("2026-11-18T10:00:00.000Z");
  });

  it("reports credentials_missing when stored connected but no credential blob exists", () => {
    const result = checkProviderHealth("hubspot", connection({ hasCredentials: false }));
    expect(result.status).toBe("credentials_missing");
    expect(result.detail).toContain("no credential is stored");
  });

  it("reports error when the stored credential is expired", () => {
    const result = checkProviderHealth(
      "hubspot",
      connection({ credentialExpiresAt: "2020-01-01T00:00:00.000Z" })
    );
    expect(result.status).toBe("error");
    expect(result.detail).toContain("expired");
  });

  it("reports connected when the credential expiry is in the future", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = checkProviderHealth("hubspot", connection({ credentialExpiresAt: future }));
    expect(result.status).toBe("connected");
  });

  it("passes a stored error status through with its last_error", () => {
    const result = checkProviderHealth(
      "hubspot",
      connection({ status: "error", lastError: "provider returned 401" })
    );
    expect(result.status).toBe("error");
    expect(result.detail).toBe("provider returned 401");
  });

  it("passes through disconnected / configuration_required / credentials_missing / coming_soon", () => {
    expect(checkProviderHealth("x", connection({ status: "disconnected" })).status).toBe(
      "disconnected"
    );
    expect(
      checkProviderHealth("x", connection({ status: "configuration_required" })).status
    ).toBe("configuration_required");
    expect(
      checkProviderHealth("x", connection({ status: "credentials_missing" })).status
    ).toBe("credentials_missing");
    expect(checkProviderHealth("x", connection({ status: "coming_soon" })).status).toBe(
      "coming_soon"
    );
  });
});
