/**
 * n8n API-key tests.
 *
 * Covers: generate/hash format + prefix, uniqueness, create
 * (key shown once), list (never returns the key or the hash),
 * revoke (then resolve → revoked), expired (resolve → expired),
 * scope denial (apiKeyHasTier — write does NOT imply read),
 * cross-workspace isolation (list/revoke), and resolveApiKey
 * never throwing on a broken store.
 */

import { describe, it, expect } from "vitest";
import {
  generateApiKey,
  hashApiKey,
  apiKeyHasTier,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  resolveApiKey,
  createMemoryApiKeyStore,
  API_KEY_PREFIX,
} from "../api-keys";

const WS_A = "ws_a";
const WS_B = "ws_b";
const USER_A = "user_a";

describe("generateApiKey / hashApiKey", () => {
  it("generates nxt_live_ keys with the right shape and prefix", () => {
    const a = generateApiKey();
    expect(a.key.startsWith(`${API_KEY_PREFIX}_`)).toBe(true);
    expect(a.key.length).toBe("nxt_live_".length + 32);
    expect(a.keyPrefix).toBe("nxt_live");
    expect(a.keyHash).toBe(hashApiKey(a.key));
    expect(a.keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates unique keys", () => {
    const keys = new Set(Array.from({ length: 20 }, () => generateApiKey().key));
    expect(keys.size).toBe(20);
  });
});

describe("createApiKey / listApiKeys / revokeApiKey", () => {
  it("returns the key exactly once at creation and never in lists", async () => {
    const store = createMemoryApiKeyStore();
    const created = await createApiKey(store, {
      workspaceId: WS_A,
      userId: USER_A,
      name: "n8n prod",
      scopes: ["n8n.read", "n8n.write"],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.key.startsWith("nxt_live_")).toBe(true);

    const listed = await listApiKeys(store, WS_A);
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty("key");
    expect(listed[0]).not.toHaveProperty("key_hash");
    expect(listed[0]).toMatchObject({
      id: created.id,
      name: "n8n prod",
      scopes: ["n8n.read", "n8n.write"],
      key_prefix: "nxt_live",
      revoked_at: null,
    });
    // The stored record resolves by the created key value.
    expect(await resolveApiKey(store, created.key)).toMatchObject({ ok: true, workspaceId: WS_A });
  });

  it("validates name and scopes", async () => {
    const store = createMemoryApiKeyStore();
    expect(
      await createApiKey(store, { workspaceId: WS_A, userId: USER_A, name: "  ", scopes: ["n8n.read"] })
    ).toMatchObject({ ok: false, code: "invalid_params" });
    expect(
      await createApiKey(store, { workspaceId: WS_A, userId: USER_A, name: "x", scopes: [] })
    ).toMatchObject({ ok: false, code: "invalid_params" });
    expect(
      await createApiKey(store, { workspaceId: WS_A, userId: USER_A, name: "x", scopes: ["n8n.read"], expiresAt: "not-a-date" })
    ).toMatchObject({ ok: false, code: "invalid_params" });
  });

  it("revokes, and a revoked key no longer resolves", async () => {
    const store = createMemoryApiKeyStore();
    const created = await createApiKey(store, {
      workspaceId: WS_A,
      userId: USER_A,
      name: "temp",
      scopes: ["n8n.read"],
    });
    if (!created.ok) throw new Error("create failed");
    expect(await resolveApiKey(store, created.key)).toMatchObject({ ok: true });
    expect(await revokeApiKey(store, WS_A, created.id)).toEqual({ ok: true, id: created.id });
    expect(await resolveApiKey(store, created.key)).toEqual({ ok: false, reason: "revoked" });
    // Revoking twice is a no-op success path through the store (id still known).
    expect((await listApiKeys(store, WS_A))[0].revoked_at).not.toBeNull();
  });

  it("keeps workspaces apart on list and revoke", async () => {
    const store = createMemoryApiKeyStore();
    const a = await createApiKey(store, { workspaceId: WS_A, userId: USER_A, name: "a", scopes: ["n8n.read"] });
    const b = await createApiKey(store, { workspaceId: WS_B, userId: "user_b", name: "b", scopes: ["n8n.read"] });
    if (!a.ok || !b.ok) throw new Error("create failed");
    expect((await listApiKeys(store, WS_A)).map((k) => k.id)).toEqual([a.id]);
    expect((await listApiKeys(store, WS_B)).map((k) => k.id)).toEqual([b.id]);
    // Cross-workspace revoke is a 404, and the key still works.
    expect(await revokeApiKey(store, WS_A, b.id)).toEqual({ ok: false, reason: "not_found" });
    expect(await resolveApiKey(store, b.key)).toMatchObject({ ok: true });
    expect(await revokeApiKey(store, WS_A, "nope")).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("resolveApiKey", () => {
  it("reports invalid / expired distinctly", async () => {
    const store = createMemoryApiKeyStore();
    expect(await resolveApiKey(store, "nxt_live_nope00000000000000000000000000")).toEqual({
      ok: false,
      reason: "invalid",
    });
    const expired = await createApiKey(store, {
      workspaceId: WS_A,
      userId: USER_A,
      name: "old",
      scopes: ["n8n.read"],
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
    if (!expired.ok) throw new Error("create failed");
    expect(await resolveApiKey(store, expired.key)).toEqual({ ok: false, reason: "expired" });
    const live = await createApiKey(store, {
      workspaceId: WS_A,
      userId: USER_A,
      name: "live",
      scopes: ["n8n.write"],
      expiresAt: "2999-01-01T00:00:00.000Z",
    });
    if (!live.ok) throw new Error("create failed");
    const resolved = await resolveApiKey(store, live.key);
    expect(resolved).toMatchObject({ ok: true, scopes: ["n8n.write"] });
    // A successful resolve stamps last_used_at.
    const listed = await listApiKeys(store, WS_A);
    expect(listed.find((k) => k.id === live.id)?.last_used_at).not.toBeNull();
  });

  it("never throws on a broken store", async () => {
    const broken = {
      create: async () => { throw new Error("boom"); },
      listByWorkspace: async () => { throw new Error("boom"); },
      findByHash: async () => { throw new Error("boom"); },
      touchLastUsed: async () => { throw new Error("boom"); },
      revoke: async () => { throw new Error("boom"); },
    };
    await expect(resolveApiKey(broken, generateApiKey().key)).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});

describe("apiKeyHasTier", () => {
  it("requires the exact tier — write does NOT imply read (like OAuth)", () => {
    expect(apiKeyHasTier(["n8n.read"], "read")).toBe(true);
    expect(apiKeyHasTier(["n8n.read"], "write")).toBe(false);
    expect(apiKeyHasTier(["n8n.write"], "write")).toBe(true);
    expect(apiKeyHasTier(["n8n.write"], "read")).toBe(false);
    expect(apiKeyHasTier(["n8n.read", "n8n.write"], "read")).toBe(true);
    expect(apiKeyHasTier([], "read")).toBe(false);
  });
});
