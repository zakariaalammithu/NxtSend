/**
 * Provider connection tests — in-memory store shim, no database.
 *
 * Covers: credential encrypt/decrypt round-trip via the existing
 * token vault, public shape never carrying a credential, error
 * marking, and workspace isolation. TOKEN_ENCRYPTION_KEY is set
 * only for this file's process env.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "crypto";
import {
  createMemoryProviderConnectionStore,
  upsertProviderConnection,
  getProviderConnection,
  listProviderConnections,
  markProviderConnectionError,
  getDecryptedProviderCredential,
} from "../connections";

const WS_A = "ws_a";
const WS_B = "ws_b";
const PREVIOUS_KEY = process.env.TOKEN_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

afterEach(() => {
  if (PREVIOUS_KEY === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
  else process.env.TOKEN_ENCRYPTION_KEY = PREVIOUS_KEY;
});

describe("upsertProviderConnection / getDecryptedProviderCredential", () => {
  it("round-trips a credential through encryption", async () => {
    const store = createMemoryProviderConnectionStore();
    const saved = await upsertProviderConnection(store, {
      workspaceId: WS_A,
      provider: "hubspot",
      authType: "oauth2",
      credentials: { accessToken: "tok_abc", refreshToken: "ref_xyz", expiresAt: "2030-01-01T00:00:00.000Z" },
    });
    expect(saved.status).toBe("connected");
    expect(saved.hasCredentials).toBe(true);
    expect(saved).not.toHaveProperty("encryptedCredentials");
    expect(JSON.stringify(saved)).not.toContain("tok_abc");

    const cred = await getDecryptedProviderCredential(store, WS_A, "hubspot");
    expect(cred).toEqual({
      accessToken: "tok_abc",
      refreshToken: "ref_xyz",
      expiresAt: "2030-01-01T00:00:00.000Z",
    });
  });

  it("returns null from the server-only getter when nothing is stored", async () => {
    const store = createMemoryProviderConnectionStore();
    await expect(getDecryptedProviderCredential(store, WS_A, "hubspot")).resolves.toBeNull();
  });

  it("throws before writing when TOKEN_ENCRYPTION_KEY is missing", async () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    const store = createMemoryProviderConnectionStore();
    await expect(
      upsertProviderConnection(store, {
        workspaceId: WS_A,
        provider: "hubspot",
        authType: "oauth2",
        credentials: { accessToken: "tok_abc" },
      })
    ).rejects.toThrow(/TOKEN_ENCRYPTION_KEY/);
    // Nothing was stored — no plaintext fallback.
    expect(await getProviderConnection(store, WS_A, "hubspot")).toBeNull();
  });
});

describe("getProviderConnection / listProviderConnections / markProviderConnectionError", () => {
  it("lists connections per workspace and never exposes credentials", async () => {
    const store = createMemoryProviderConnectionStore();
    await upsertProviderConnection(store, {
      workspaceId: WS_A,
      provider: "hubspot",
      authType: "oauth2",
      credentials: { apiKey: "secret-key-1" },
    });
    await upsertProviderConnection(store, {
      workspaceId: WS_B,
      provider: "hubspot",
      authType: "oauth2",
      credentials: { apiKey: "secret-key-2" },
    });

    const listed = await listProviderConnections(store, WS_A);
    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain("secret-key-1");
    expect(JSON.stringify(listed)).not.toContain("secret-key-2");
    expect(await listProviderConnections(store, WS_B)).toHaveLength(1);
  });

  it("marks an error with the message kept for the operator", async () => {
    const store = createMemoryProviderConnectionStore();
    await upsertProviderConnection(store, {
      workspaceId: WS_A,
      provider: "hubspot",
      authType: "oauth2",
      credentials: { accessToken: "tok" },
    });
    const marked = await markProviderConnectionError(store, WS_A, "hubspot", "provider 401");
    expect(marked?.status).toBe("error");
    expect(marked?.lastError).toBe("provider 401");
    expect(await markProviderConnectionError(store, WS_A, "no-such-provider", "x")).toBeNull();
  });
});
