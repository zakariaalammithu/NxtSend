/**
 * Shared REST auth tests (resolveRestContext).
 *
 * Covers: demo refusal (503, platform-aware message, both
 * platforms), OAuth happy path for n8n and Zapier (token bound
 * to the platform resource), wrong-resource 401, insufficient
 * scope 403, rate limiting (429), and the n8n API-key path
 * (memory store): valid key, read-only key denied write, revoked
 * key, expired key, garbage key. OAuth tokens are issued through
 * the real OAuth handlers against the in-memory store — no
 * database, no network.
 */

import { describe, it, expect } from "vitest";
import {
  createMemoryMuseOAuthStore,
  registerMuseClient,
  issueAuthorizationCode,
  handleMuseTokenRequest,
} from "@/lib/muse-connector/oauth";
import { createRateLimiter } from "@/lib/admin/submissions-core";
import { resolveRestContext, REST_RATE_LIMIT_PER_MINUTE } from "../auth";
import { getPlatformResourceUrl, N8N_PLATFORM, ZAPIER_PLATFORM, type RestPlatform } from "../config";
import {
  createApiKey,
  createMemoryApiKeyStore,
  revokeApiKey,
} from "@/lib/integrations/n8n/api-keys";

const ORIGIN = "https://nxtsend.com";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-11-17T00:00:00Z");

function formRequest(url: string, params: Record<string, string>): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
}

async function platformToken(
  platform: RestPlatform,
  scopes: string[] = [`${platform}.read`, `${platform}.write`],
  resource: string = getPlatformResourceUrl(platform, ORIGIN)
): Promise<{ store: ReturnType<typeof createMemoryMuseOAuthStore>; access: string }> {
  const store = createMemoryMuseOAuthStore();
  // The Zapier case uses the real Zapier return-URL shape — the
  // Zapier platform rule only accepts zapier.com return URLs, so a
  // fake `zapier.example` host is not a valid Zapier callback.
  const redirect =
    platform === "zapier"
      ? "https://zapier.com/dashboard/auth/oauth/return/App123456CLIAPI/"
      : `https://${platform}.example/oauth/return`;
  const reg = await registerMuseClient(
    store,
    {
      name: platform,
      redirectUris: [redirect],
      confidential: true,
      // Registration contract: an instance-specific https callback
      // is only accepted when the client declares the platform
      // scope (the closed global allowlist refuses arbitrary hosts).
      scopes: scopes.join(" "),
    },
    NOW
  );
  if (!reg.ok) throw new Error("registration failed");
  const code = await issueAuthorizationCode(
    store,
    {
      clientId: reg.client.client_id,
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      scopes: scopes as ("n8n.read" | "n8n.write" | "zapier.read" | "zapier.write")[],
      codeChallenge: null,
      redirectUri: redirect,
      resource,
    },
    NOW
  );
  const res = await handleMuseTokenRequest(
    formRequest("http://localhost:3000/api/muse/oauth/token", {
      grant_type: "authorization_code",
      client_id: reg.client.client_id,
      client_secret: reg.clientSecret ?? "",
      code,
      redirect_uri: redirect,
      resource,
    }),
    { store, now: NOW }
  );
  if (res.status !== 200) throw new Error(`exchange failed: ${JSON.stringify(res.body)}`);
  return { store, access: (res.body as { access_token: string }).access_token };
}

function apiRequest(platform: RestPlatform, access: string | null): Request {
  const headers: Record<string, string> = {};
  if (access) headers.authorization = `Bearer ${access}`;
  return new Request(`${ORIGIN}/api/integrations/${platform}/v1/leads`, { headers });
}

function freshLimiter(maxAttempts = 1000) {
  return createRateLimiter({ maxAttempts, windowMs: 60_000 });
}

describe("resolveRestContext — OAuth", () => {
  it("resolves an n8n token with the read tier", async () => {
    const { store, access } = await platformToken("n8n");
    const res = await resolveRestContext(apiRequest("n8n", access), N8N_PLATFORM, "read", {
      store,
      mode: "supabase",
      now: NOW,
      rateLimiter: freshLimiter(),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.ctx.workspaceId).toBe(WORKSPACE_ID);
      expect(res.ctx.userId).toBe(USER_ID);
      expect(res.ctx.resource).toBe(getPlatformResourceUrl("n8n", ORIGIN));
    }
  });

  it("resolves a Zapier token with the read tier", async () => {
    const { store, access } = await platformToken("zapier");
    const res = await resolveRestContext(apiRequest("zapier", access), ZAPIER_PLATFORM, "read", {
      store,
      mode: "supabase",
      now: NOW,
      rateLimiter: freshLimiter(),
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.ctx.workspaceId).toBe(WORKSPACE_ID);
  });

  it("refuses Demo Mode with a platform-aware 503 for both platforms", async () => {
    for (const platform of [N8N_PLATFORM, ZAPIER_PLATFORM] as const) {
      const { store, access } = await platformToken(platform.platform);
      const res = await resolveRestContext(
        apiRequest(platform.platform, access),
        platform,
        "read",
        { store, mode: "demo", now: NOW, rateLimiter: freshLimiter() }
      );
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.status).toBe(503);
        expect(res.error.body.code).toBe("demo_mode");
        expect(res.error.body.error).toContain("Demo Mode");
        expect(res.error.body.error).toContain(platform.platform === "n8n" ? "n8n" : "Zapier");
      }
    }
  });

  it("answers 401 for a missing token, a garbage token, and a wrong-resource token", async () => {
    const { store, access } = await platformToken("n8n");
    const base = { store, mode: "supabase" as const, now: NOW, rateLimiter: freshLimiter() };
    const missing = await resolveRestContext(apiRequest("n8n", null), N8N_PLATFORM, "read", base);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.status).toBe(401);
    const garbage = await resolveRestContext(apiRequest("n8n", "garbage"), N8N_PLATFORM, "read", base);
    expect(garbage.ok).toBe(false);
    if (!garbage.ok) expect(garbage.error.status).toBe(401);
    // A Zapier-resource token does not verify for n8n.
    const zapier = await platformToken("zapier");
    const wrong = await resolveRestContext(apiRequest("n8n", zapier.access), N8N_PLATFORM, "read", {
      store: zapier.store,
      mode: "supabase",
      now: NOW,
      rateLimiter: freshLimiter(),
    });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error.status).toBe(401);
    void access;
  });

  it("answers 403 when the grant lacks the tier", async () => {
    const { store, access } = await platformToken("n8n", ["n8n.read"]);
    const res = await resolveRestContext(apiRequest("n8n", access), N8N_PLATFORM, "write", {
      store,
      mode: "supabase",
      now: NOW,
      rateLimiter: freshLimiter(),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.status).toBe(403);
      expect(res.error.body.code).toBe("insufficient_scope");
    }
  });

  it("rate-limits after the per-token budget", async () => {
    const { store, access } = await platformToken("n8n");
    const limiter = createRateLimiter({ maxAttempts: 2, windowMs: 60_000 });
    const base = { store, mode: "supabase" as const, now: NOW, rateLimiter: limiter };
    expect((await resolveRestContext(apiRequest("n8n", access), N8N_PLATFORM, "read", base)).ok).toBe(true);
    expect((await resolveRestContext(apiRequest("n8n", access), N8N_PLATFORM, "read", base)).ok).toBe(true);
    const third = await resolveRestContext(apiRequest("n8n", access), N8N_PLATFORM, "read", base);
    expect(third.ok).toBe(false);
    if (!third.ok) {
      expect(third.error.status).toBe(429);
      expect(third.error.body.error).toContain(String(REST_RATE_LIMIT_PER_MINUTE));
    }
  });
});

describe("resolveRestContext — n8n API keys", () => {
  async function makeKey(scopes: ("n8n.read" | "n8n.write")[] = ["n8n.read", "n8n.write"]) {
    const store = createMemoryApiKeyStore();
    const created = await createApiKey(store, {
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      name: "test key",
      scopes,
    });
    if (!created.ok) throw new Error(`create failed: ${created.error}`);
    return { store, key: created.key };
  }

  it("resolves a valid API key to its workspace with the key's scopes", async () => {
    const { store, key } = await makeKey();
    const res = await resolveRestContext(apiRequest("n8n", key), N8N_PLATFORM, "write", {
      mode: "supabase",
      now: NOW,
      rateLimiter: freshLimiter(),
      apiKeyStore: store,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.ctx.workspaceId).toBe(WORKSPACE_ID);
      expect(res.ctx.userId).toBe(USER_ID);
      expect(res.ctx.scopes).toEqual(["n8n.read", "n8n.write"]);
      expect(res.ctx.clientId).toBe("n8n-api-key");
    }
  });

  it("denies a read-only key the write tier (403)", async () => {
    const { store, key } = await makeKey(["n8n.read"]);
    const res = await resolveRestContext(apiRequest("n8n", key), N8N_PLATFORM, "write", {
      mode: "supabase",
      now: NOW,
      rateLimiter: freshLimiter(),
      apiKeyStore: store,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.status).toBe(403);
      expect(res.error.body.code).toBe("insufficient_scope");
    }
  });

  it("401s a revoked key, an expired key and a garbage key", async () => {
    const { store, key } = await makeKey();
    const created = await createApiKey(store, {
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      name: "revoked",
      scopes: ["n8n.read"],
    });
    if (!created.ok) throw new Error("create failed");
    await revokeApiKey(store, WORKSPACE_ID, created.id);
    const base = {
      mode: "supabase" as const,
      now: NOW,
      rateLimiter: freshLimiter(),
      apiKeyStore: store,
    };
    const revoked = await resolveRestContext(apiRequest("n8n", created.key), N8N_PLATFORM, "read", base);
    expect(revoked.ok).toBe(false);
    if (!revoked.ok) {
      expect(revoked.error.status).toBe(401);
      expect(revoked.error.body.error).toContain("revoked");
    }
    const garbage = await resolveRestContext(apiRequest("n8n", "nxt_live_doesnotexist000000000000000000"), N8N_PLATFORM, "read", base);
    expect(garbage.ok).toBe(false);
    if (!garbage.ok) expect(garbage.error.status).toBe(401);
    void key;
  });

  it("401s an expired key", async () => {
    const store = createMemoryApiKeyStore();
    const created = await createApiKey(store, {
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      name: "old",
      scopes: ["n8n.read"],
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    if (!created.ok) throw new Error("create failed");
    const res = await resolveRestContext(apiRequest("n8n", created.key), N8N_PLATFORM, "read", {
      mode: "supabase",
      now: NOW,
      rateLimiter: freshLimiter(),
      apiKeyStore: store,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.status).toBe(401);
      expect(res.error.body.error).toContain("expired");
    }
  });

  it("never treats an API key as a Zapier token", async () => {
    const { store, key } = await makeKey();
    const res = await resolveRestContext(apiRequest("zapier", key), ZAPIER_PLATFORM, "read", {
      mode: "supabase",
      now: NOW,
      rateLimiter: freshLimiter(),
      apiKeyStore: store,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.status).toBe(401);
  });
});
