/**
 * ChatGPT OAuth gaps — tests for the platform-neutral scopes,
 * CIMD clients, RFC 8707 `resource` binding, RFC 9207 `iss`,
 * the ChatGPT redirect URI, and the discovery metadata routes.
 *
 * What is being protected: a ChatGPT grant (nxtsend.* scopes) has
 * exactly the same tiers as a Muse grant (muse.*) and no more;
 * `send` never implies `read`/`write`; a token bound to one MCP
 * resource never validates for the other; CIMD documents are
 * fetched with a timeout + size cap and fail closed; `iss` is
 * present in authorize redirects and token responses; Muse's
 * existing flow (no resource, muse.* scopes, Muse callback) keeps
 * working unchanged.
 *
 * All through the in-memory store seam — no database. CIMD fetches
 * are stubbed with vi.stubGlobal("fetch", ...) and the cache is
 * cleared between tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomBytes } from "crypto";
import {
  MUSE_SCOPES,
  NXT_SEND_SCOPES,
  ALL_OAUTH_SCOPES,
  SCOPE_TIER_MAP,
  grantHasTier,
  normalizeScopes,
  defaultScopeForPlatform,
  scopeDescription,
  CHATGPT_OAUTH_CALLBACK,
  MUSE_OAUTH_CALLBACK,
  isAllowedOAuthRedirectUri,
  registerMuseClient,
  validateRedirectUri,
  createMemoryMuseOAuthStore,
  issueAuthorizationCode,
  issueMuseTokens,
  verifyMuseAccessToken,
  validateAuthorizeRequest,
  buildOAuthSuccessRedirect,
  buildOAuthErrorRedirect,
  resolveCimdClient,
  fetchCimdDocument,
  clearCimdCache,
  isCimdClientId,
  resolveMuseContext,
  handleMuseTokenRequest,
  handleMuseRegisterRequest,
  createDcrRateLimiter,
  type MuseOAuthStore,
} from "../oauth";
import { GET as getRootMetadata } from "@/app/.well-known/oauth-protected-resource/route";
import { GET as getAuthServerMetadata } from "@/app/.well-known/oauth-authorization-server/route";
import { GET as getMcpMetadata } from "@/app/.well-known/oauth-protected-resource/api/mcp/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const ORIGIN = "https://nxtsend.com";
const MUSE_RESOURCE = `${ORIGIN}/api/mcp`;
const CHATGPT_RESOURCE = `${ORIGIN}/api/mcp/chatgpt`;
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const NOW = new Date("2026-11-16T12:00:00Z");

const CIMD_URL = "https://chatgpt.com/.well-known/oauth-client";
const CIMD_DOC = {
  client_name: "ChatGPT",
  redirect_uris: [CHATGPT_OAUTH_CALLBACK],
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
};

async function registeredClient(
  store: MuseOAuthStore,
  redirectUris: string[],
  name = "Test client"
) {
  const result = await registerMuseClient(store, { name, redirectUris }, NOW);
  if (!result.ok) throw new Error(`registration failed: ${result.error}`);
  return result.client;
}

function formRequest(url: string, params: Record<string, string>): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  clearCimdCache();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearCimdCache();
});

// ── Scopes & tiers ──────────────────────────────────────────────────────────

describe("platform-neutral scopes", () => {
  it("lists both scope sets; muse.* is unchanged", () => {
    expect([...MUSE_SCOPES]).toEqual(["muse.read", "muse.write", "muse.send"]);
    expect([...NXT_SEND_SCOPES]).toEqual(["nxtsend.read", "nxtsend.write", "nxtsend.send"]);
    expect([...ALL_OAUTH_SCOPES]).toEqual([
      "muse.read",
      "muse.write",
      "muse.send",
      "nxtsend.read",
      "nxtsend.write",
      "nxtsend.send",
    ]);
  });

  it("maps both prefixes to the same tier", () => {
    expect(SCOPE_TIER_MAP["muse.read"]).toBe("read");
    expect(SCOPE_TIER_MAP["nxtsend.read"]).toBe("read");
    expect(SCOPE_TIER_MAP["muse.write"]).toBe("write");
    expect(SCOPE_TIER_MAP["nxtsend.write"]).toBe("write");
    expect(SCOPE_TIER_MAP["muse.send"]).toBe("send");
    expect(SCOPE_TIER_MAP["nxtsend.send"]).toBe("send");
  });

  it("grantHasTier: any scope of the tier satisfies it, either prefix", () => {
    expect(grantHasTier(["nxtsend.read"], "read")).toBe(true);
    expect(grantHasTier(["muse.read"], "read")).toBe(true);
    expect(grantHasTier(["nxtsend.write", "muse.read"], "write")).toBe(true);
    expect(grantHasTier(["muse.send"], "send")).toBe(true);
    expect(grantHasTier([], "read")).toBe(false);
    expect(grantHasTier(["muse.read"], "write")).toBe(false);
  });

  it("send does NOT imply write or read — tiers are independent", () => {
    expect(grantHasTier(["muse.send"], "read")).toBe(false);
    expect(grantHasTier(["muse.send"], "write")).toBe(false);
    expect(grantHasTier(["nxtsend.send"], "read")).toBe(false);
    expect(grantHasTier(["nxtsend.write"], "read")).toBe(false);
    expect(grantHasTier(["nxtsend.read", "nxtsend.send"], "write")).toBe(false);
  });

  it("normalizeScopes accepts either prefix, de-duplicates, refuses unknowns", () => {
    expect(normalizeScopes("nxtsend.read nxtsend.send nxtsend.read")).toEqual([
      "nxtsend.read",
      "nxtsend.send",
    ]);
    expect(normalizeScopes("muse.read nxtsend.write")).toEqual(["muse.read", "nxtsend.write"]);
    expect(normalizeScopes(null)).toEqual(["muse.read"]);
    expect(normalizeScopes("nxtsend.read admin")).toBeNull();
    expect(normalizeScopes("muse.everything")).toBeNull();
  });

  it("defaults the least-privilege scope per platform", () => {
    expect(defaultScopeForPlatform("muse")).toBe("muse.read");
    expect(defaultScopeForPlatform("chatgpt")).toBe("nxtsend.read");
  });

  it("describes scopes in plain words for either set", () => {
    expect(scopeDescription("nxtsend.read")).toContain("Read your leads");
    expect(scopeDescription("nxtsend.send")).toContain("ChatGPT");
    expect(scopeDescription("muse.send")).toContain("Muse");
    expect(scopeDescription("unknown.scope")).toBeNull();
  });
});

// ── Redirect URIs ───────────────────────────────────────────────────────────

describe("redirect URI allowlist", () => {
  it("allows the Muse callback, the ChatGPT callback and loopback — nothing else", () => {
    expect(isAllowedOAuthRedirectUri(MUSE_OAUTH_CALLBACK)).toBe(true);
    expect(isAllowedOAuthRedirectUri(CHATGPT_OAUTH_CALLBACK)).toBe(true);
    expect(isAllowedOAuthRedirectUri("http://localhost:3000/callback")).toBe(true);
    expect(isAllowedOAuthRedirectUri("http://127.0.0.1:8080/cb")).toBe(true);
    expect(isAllowedOAuthRedirectUri("https://evil.example/callback")).toBe(false);
    expect(isAllowedOAuthRedirectUri("https://chatgpt.com.evil.example/connector_platform_oauth_redirect")).toBe(false);
    expect(isAllowedOAuthRedirectUri("https://chatgpt.com/other")).toBe(false);
  });

  it("registers a ChatGPT client via DCR and validates its callback exactly", async () => {
    const store = createMemoryMuseOAuthStore();
    const client = await registeredClient(store, [CHATGPT_OAUTH_CALLBACK], "ChatGPT");
    expect(validateRedirectUri(client, CHATGPT_OAUTH_CALLBACK)).toBe(true);
    // The Muse callback is allowlisted globally but NOT registered for this client.
    expect(validateRedirectUri(client, MUSE_OAUTH_CALLBACK)).toBe(false);
    expect(validateRedirectUri(client, "https://evil.example/callback")).toBe(false);
  });

  it("still registers a Muse client and allows the Muse callback", async () => {
    const store = createMemoryMuseOAuthStore();
    const client = await registeredClient(store, [MUSE_OAUTH_CALLBACK], "Muse");
    expect(validateRedirectUri(client, MUSE_OAUTH_CALLBACK)).toBe(true);
    expect(validateRedirectUri(client, CHATGPT_OAUTH_CALLBACK)).toBe(false);
  });

  it("registers a ChatGPT client through the register endpoint", async () => {
    const store = createMemoryMuseOAuthStore();
    const req = new Request("http://localhost:3000/api/muse/oauth/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
      body: JSON.stringify({ client_name: "ChatGPT", redirect_uris: [CHATGPT_OAUTH_CALLBACK] }),
    });
    const result = await handleMuseRegisterRequest(req, { store, limiter: createDcrRateLimiter() });
    expect(result.status).toBe(201);
    expect((result.body.redirect_uris as string[])).toEqual([CHATGPT_OAUTH_CALLBACK]);
  });
});

// ── Authorize validation: defaults + resource ───────────────────────────────

describe("authorize validation (resource + platform defaults)", () => {
  function baseParams(clientId: string, redirectUri: string) {
    return {
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      code_challenge: CHALLENGE,
      code_challenge_method: "S256",
    };
  }

  it("defaults scope and resource per platform when none are sent", async () => {
    const store = createMemoryMuseOAuthStore();
    const muse = await registeredClient(store, [MUSE_OAUTH_CALLBACK], "Muse");
    const chatgpt = await registeredClient(store, [CHATGPT_OAUTH_CALLBACK], "ChatGPT");
    const museResult = validateAuthorizeRequest(baseParams(muse.client_id, MUSE_OAUTH_CALLBACK), muse, { origin: ORIGIN });
    expect(museResult.ok).toBe(true);
    if (museResult.ok) {
      expect(museResult.request.scopes).toEqual(["muse.read"]);
      expect(museResult.request.resource).toBe(MUSE_RESOURCE);
      expect(museResult.request.platform).toBe("muse");
    }
    const gptResult = validateAuthorizeRequest(baseParams(chatgpt.client_id, CHATGPT_OAUTH_CALLBACK), chatgpt, { origin: ORIGIN });
    expect(gptResult.ok).toBe(true);
    if (gptResult.ok) {
      expect(gptResult.request.scopes).toEqual(["nxtsend.read"]);
      expect(gptResult.request.resource).toBe(CHATGPT_RESOURCE);
      expect(gptResult.request.platform).toBe("chatgpt");
    }
  });

  it("accepts an explicit valid resource and nxtsend.* scopes", async () => {
    const store = createMemoryMuseOAuthStore();
    const chatgpt = await registeredClient(store, [CHATGPT_OAUTH_CALLBACK], "ChatGPT");
    const result = validateAuthorizeRequest(
      {
        ...baseParams(chatgpt.client_id, CHATGPT_OAUTH_CALLBACK),
        scope: "nxtsend.read nxtsend.send",
        resource: CHATGPT_RESOURCE,
      },
      chatgpt,
      { origin: ORIGIN }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.scopes).toEqual(["nxtsend.read", "nxtsend.send"]);
      expect(result.request.resource).toBe(CHATGPT_RESOURCE);
    }
  });

  it("refuses a wrong resource with invalid_target", async () => {
    const store = createMemoryMuseOAuthStore();
    const chatgpt = await registeredClient(store, [CHATGPT_OAUTH_CALLBACK], "ChatGPT");
    const wrong = validateAuthorizeRequest(
      {
        ...baseParams(chatgpt.client_id, CHATGPT_OAUTH_CALLBACK),
        resource: "https://evil.example/api/mcp/chatgpt",
      },
      chatgpt,
      { origin: ORIGIN }
    );
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) {
      expect(wrong.error).toBe("invalid_target");
      expect(wrong.redirectUri).toBe(CHATGPT_OAUTH_CALLBACK);
    }
    // A resource for the OTHER platform is also refused (exact match only).
    const other = validateAuthorizeRequest(
      {
        ...baseParams(chatgpt.client_id, CHATGPT_OAUTH_CALLBACK),
        resource: MUSE_RESOURCE,
      },
      chatgpt,
      { origin: ORIGIN }
    );
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.error).toBe("invalid_target");
  });

  it("refuses a wrong redirect URI for a ChatGPT client", async () => {
    const store = createMemoryMuseOAuthStore();
    const chatgpt = await registeredClient(store, [CHATGPT_OAUTH_CALLBACK], "ChatGPT");
    const result = validateAuthorizeRequest(
      baseParams(chatgpt.client_id, "https://chatgpt.com/other-callback"),
      chatgpt,
      { origin: ORIGIN }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.redirectUri).toBeNull();
  });
});

// ── Token exchange: resource preserved + iss ────────────────────────────────

describe("token exchange (resource + iss)", () => {
  async function codeFor(
    store: MuseOAuthStore,
    clientId: string,
    resource: string | null,
    scopes: string[] = ["nxtsend.read"]
  ) {
    return issueAuthorizationCode(
      store,
      {
        clientId,
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        scopes: scopes as never,
        codeChallenge: CHALLENGE,
        redirectUri: CHATGPT_OAUTH_CALLBACK,
        resource,
      },
      NOW
    );
  }

  it("preserves a valid resource through code → token and reports iss", async () => {
    const store = createMemoryMuseOAuthStore();
    const chatgpt = await registeredClient(store, [CHATGPT_OAUTH_CALLBACK], "ChatGPT");
    const code = await codeFor(store, chatgpt.client_id, CHATGPT_RESOURCE);
    const res = await handleMuseTokenRequest(
      formRequest("http://localhost:3000/api/muse/oauth/token", {
        grant_type: "authorization_code",
        client_id: chatgpt.client_id,
        code,
        redirect_uri: CHATGPT_OAUTH_CALLBACK,
        code_verifier: VERIFIER,
        resource: CHATGPT_RESOURCE,
      }),
      { store, now: NOW }
    );
    expect(res.status).toBe(200);
    expect(res.body.iss).toBe("http://localhost:3000");
    expect(res.body.scope).toBe("nxtsend.read");
    const access = res.body.access_token as string;
    // Token verifies for its own resource only.
    const forChatGpt = await verifyMuseAccessToken(access, {
      store,
      mode: "supabase",
      resource: CHATGPT_RESOURCE,
      now: NOW,
    });
    expect(forChatGpt).not.toBeNull();
    expect(forChatGpt?.resource).toBe(CHATGPT_RESOURCE);
    expect(
      await verifyMuseAccessToken(access, {
        store,
        mode: "supabase",
        resource: MUSE_RESOURCE,
        now: NOW,
      })
    ).toBeNull();
  });

  it("exchanges without a resource parameter, bound to the code's resource", async () => {
    const store = createMemoryMuseOAuthStore();
    const chatgpt = await registeredClient(store, [CHATGPT_OAUTH_CALLBACK], "ChatGPT");
    const code = await codeFor(store, chatgpt.client_id, CHATGPT_RESOURCE);
    const res = await handleMuseTokenRequest(
      formRequest("http://localhost:3000/api/muse/oauth/token", {
        grant_type: "authorization_code",
        client_id: chatgpt.client_id,
        code,
        redirect_uri: CHATGPT_OAUTH_CALLBACK,
        code_verifier: VERIFIER,
      }),
      { store, now: NOW }
    );
    expect(res.status).toBe(200);
    const access = res.body.access_token as string;
    const ctx = await verifyMuseAccessToken(access, { store, mode: "supabase", now: NOW });
    expect(ctx?.resource).toBe(CHATGPT_RESOURCE);
  });

  it("refuses a code presented with a different resource (invalid_target)", async () => {
    const store = createMemoryMuseOAuthStore();
    const chatgpt = await registeredClient(store, [CHATGPT_OAUTH_CALLBACK], "ChatGPT");
    const code = await codeFor(store, chatgpt.client_id, CHATGPT_RESOURCE);
    const res = await handleMuseTokenRequest(
      formRequest("http://localhost:3000/api/muse/oauth/token", {
        grant_type: "authorization_code",
        client_id: chatgpt.client_id,
        code,
        redirect_uri: CHATGPT_OAUTH_CALLBACK,
        code_verifier: VERIFIER,
        resource: MUSE_RESOURCE,
      }),
      { store, now: NOW }
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_target");
  });

  it("refresh responses carry iss and keep the resource binding", async () => {
    const store = createMemoryMuseOAuthStore();
    const chatgpt = await registeredClient(store, [CHATGPT_OAUTH_CALLBACK], "ChatGPT");
    const first = await issueMuseTokens(store, {
      clientId: chatgpt.client_id,
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      scopes: ["nxtsend.read"],
      resource: CHATGPT_RESOURCE,
    });
    const res = await handleMuseTokenRequest(
      formRequest("http://localhost:3000/api/muse/oauth/token", {
        grant_type: "refresh_token",
        client_id: chatgpt.client_id,
        refresh_token: first.refresh_token,
      }),
      { store }
    );
    expect(res.status).toBe(200);
    expect(res.body.iss).toBe("http://localhost:3000");
    const access = res.body.access_token as string;
    const ctx = await verifyMuseAccessToken(access, { store, mode: "supabase" });
    expect(ctx?.resource).toBe(CHATGPT_RESOURCE);
  });

  it("legacy (resource-less) tokens verify for the Muse resource only", async () => {
    const store = createMemoryMuseOAuthStore();
    const muse = await registeredClient(store, [MUSE_OAUTH_CALLBACK], "Muse");
    const tokens = await issueMuseTokens(store, {
      clientId: muse.client_id,
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      scopes: ["muse.read"],
    });
    // No audience expectation: verifies, reports the Muse resource.
    const ctx = await verifyMuseAccessToken(tokens.access_token, { store, mode: "supabase" });
    expect(ctx?.resource).toBe("https://nxtsend.com/api/mcp");
    // Expected Muse resource (same origin): verifies.
    expect(
      await verifyMuseAccessToken(tokens.access_token, {
        store,
        mode: "supabase",
        resource: "https://nxtsend.com/api/mcp",
      })
    ).not.toBeNull();
    // Expected ChatGPT resource: refused.
    expect(
      await verifyMuseAccessToken(tokens.access_token, {
        store,
        mode: "supabase",
        resource: "https://nxtsend.com/api/mcp/chatgpt",
      })
    ).toBeNull();
  });
});

// ── resolveMuseContext audience enforcement ─────────────────────────────────

describe("resolveMuseContext audience", () => {
  it("a ChatGPT token resolves for /api/mcp/chatgpt and not for /api/mcp", async () => {
    const store = createMemoryMuseOAuthStore();
    const chatgpt = await registeredClient(store, [CHATGPT_OAUTH_CALLBACK], "ChatGPT");
    const tokens = await issueMuseTokens(store, {
      clientId: chatgpt.client_id,
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      scopes: ["nxtsend.read"],
      resource: "http://localhost:3000/api/mcp/chatgpt",
    });
    const gptReq = new Request("http://localhost:3000/api/mcp/chatgpt", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    const gptCtx = await resolveMuseContext(gptReq, { store, mode: "supabase" });
    expect(gptCtx?.userId).toBe(USER_ID);
    expect(gptCtx?.resource).toBe("http://localhost:3000/api/mcp/chatgpt");
    const museReq = new Request("http://localhost:3000/api/mcp", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    expect(await resolveMuseContext(museReq, { store, mode: "supabase" })).toBeNull();
  });

  it("a Muse token resolves for /api/mcp and not for /api/mcp/chatgpt", async () => {
    const store = createMemoryMuseOAuthStore();
    const muse = await registeredClient(store, [MUSE_OAUTH_CALLBACK], "Muse");
    const tokens = await issueMuseTokens(store, {
      clientId: muse.client_id,
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      scopes: ["muse.read"],
      resource: "http://localhost:3000/api/mcp",
    });
    const museReq = new Request("http://localhost:3000/api/mcp", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    expect(await resolveMuseContext(museReq, { store, mode: "supabase" })).not.toBeNull();
    const gptReq = new Request("http://localhost:3000/api/mcp/chatgpt", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    expect(await resolveMuseContext(gptReq, { store, mode: "supabase" })).toBeNull();
  });
});

// ── iss in authorize redirects ──────────────────────────────────────────────

describe("iss (RFC 9207)", () => {
  it("is present in success and error authorize redirects", () => {
    const ok = buildOAuthSuccessRedirect(CHATGPT_OAUTH_CALLBACK, "code123", "state1", ORIGIN);
    const okUrl = new URL(ok);
    expect(okUrl.searchParams.get("code")).toBe("code123");
    expect(okUrl.searchParams.get("state")).toBe("state1");
    expect(okUrl.searchParams.get("iss")).toBe(ORIGIN);
    const err = buildOAuthErrorRedirect(CHATGPT_OAUTH_CALLBACK, "invalid_target", "bad resource", "state1", ORIGIN);
    const errUrl = new URL(err);
    expect(errUrl.searchParams.get("error")).toBe("invalid_target");
    expect(errUrl.searchParams.get("iss")).toBe(ORIGIN);
  });

  it("is omitted when no issuer is given (old callers keep working)", () => {
    const ok = buildOAuthSuccessRedirect(MUSE_OAUTH_CALLBACK, "code123", null);
    expect(new URL(ok).searchParams.get("iss")).toBeNull();
  });
});

// ── CIMD ────────────────────────────────────────────────────────────────────

describe("CIMD clients", () => {
  function stubFetch(doc: unknown, status = 200) {
    const fetchFn = vi.fn(async () => jsonResponse(doc as Record<string, unknown>, status));
    vi.stubGlobal("fetch", fetchFn);
    return fetchFn;
  }

  it("resolves a valid ChatGPT document to an ephemeral client (never stored)", async () => {
    const fetchFn = stubFetch(CIMD_DOC);
    const store = createMemoryMuseOAuthStore();
    const resolved = await resolveCimdClient(CIMD_URL);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.client.client_id).toBe(CIMD_URL);
      expect(resolved.client.name).toBe("ChatGPT");
      expect(resolved.client.redirect_uris).toEqual([CHATGPT_OAUTH_CALLBACK]);
      expect(resolved.client.client_secret_hash).toBeNull();
      expect(resolved.platform).toBe("chatgpt");
      expect(resolved.privateKeyJwtDeclared).toBe(false);
      expect(await store.getClient(CIMD_URL)).toBeNull();
    }
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("caches the document briefly: a second resolve does not refetch", async () => {
    const fetchFn = stubFetch(CIMD_DOC);
    await resolveCimdClient(CIMD_URL);
    await resolveCimdClient(CIMD_URL);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("validates an ephemeral CIMD client at authorize time", async () => {
    stubFetch(CIMD_DOC);
    const resolved = await resolveCimdClient(CIMD_URL);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const result = validateAuthorizeRequest(
      {
        client_id: CIMD_URL,
        redirect_uri: CHATGPT_OAUTH_CALLBACK,
        response_type: "code",
        scope: "nxtsend.read",
        code_challenge: CHALLENGE,
        code_challenge_method: "S256",
        resource: CHATGPT_RESOURCE,
      },
      resolved.client,
      { origin: ORIGIN }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.platform).toBe("chatgpt");
      expect(result.request.clientOrigin).toBe("https://chatgpt.com");
      expect(result.request.resource).toBe(CHATGPT_RESOURCE);
    }
  });

  it("exchanges a code for a CIMD client through the token endpoint", async () => {
    stubFetch(CIMD_DOC);
    const store = createMemoryMuseOAuthStore();
    const resolved = await resolveCimdClient(CIMD_URL);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const code = await issueAuthorizationCode(
      store,
      {
        clientId: CIMD_URL,
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        scopes: ["nxtsend.read"],
        codeChallenge: CHALLENGE,
        redirectUri: CHATGPT_OAUTH_CALLBACK,
        resource: CHATGPT_RESOURCE,
      },
      NOW
    );
    const res = await handleMuseTokenRequest(
      formRequest("http://localhost:3000/api/muse/oauth/token", {
        grant_type: "authorization_code",
        client_id: CIMD_URL,
        code,
        redirect_uri: CHATGPT_OAUTH_CALLBACK,
        code_verifier: VERIFIER,
        resource: CHATGPT_RESOURCE,
      }),
      { store, now: NOW }
    );
    expect(res.status).toBe(200);
    expect(typeof res.body.access_token).toBe("string");
    // Still not stored as a registered client.
    expect(await store.getClient(CIMD_URL)).toBeNull();
  });

  it("fails closed on a non-https client_id", async () => {
    expect(isCimdClientId("http://chatgpt.com/.well-known/oauth-client")).toBe(false);
    expect(isCimdClientId("muse_abc123")).toBe(false);
    expect(isCimdClientId("not a url")).toBe(false);
    expect(await fetchCimdDocument("http://chatgpt.com/doc")).toBeNull();
    expect((await resolveCimdClient("http://chatgpt.com/doc")).ok).toBe(false);
  });

  it("fails closed on missing redirect_uris", async () => {
    stubFetch({ client_name: "ChatGPT" });
    expect(await fetchCimdDocument(CIMD_URL)).toBeNull();
    expect((await resolveCimdClient(CIMD_URL)).ok).toBe(false);
  });

  it("fails closed on a document listing a non-allowlisted redirect URI", async () => {
    stubFetch({ ...CIMD_DOC, redirect_uris: ["https://evil.example/callback"] });
    expect(await fetchCimdDocument(CIMD_URL)).toBeNull();
  });

  it("fails closed when grant_types / response_types do not include the code flow", async () => {
    stubFetch({ ...CIMD_DOC, grant_types: ["client_credentials"] });
    expect(await fetchCimdDocument(CIMD_URL)).toBeNull();
    clearCimdCache();
    stubFetch({ ...CIMD_DOC, response_types: ["token"] });
    expect(await fetchCimdDocument(CIMD_URL)).toBeNull();
  });

  it("fails closed on fetch failure and on a non-200 response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    expect(await fetchCimdDocument(CIMD_URL)).toBeNull();
    clearCimdCache();
    stubFetch({ error: "nope" }, 404);
    expect(await fetchCimdDocument(CIMD_URL)).toBeNull();
  });

  it("fails closed on malformed JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{not json", { status: 200 })));
    expect(await fetchCimdDocument(CIMD_URL)).toBeNull();
  });

  it("refuses an oversized response (>64KB)", async () => {
    const big = { ...CIMD_DOC, padding: "x".repeat(70 * 1024) };
    stubFetch(big);
    expect(await fetchCimdDocument(CIMD_URL)).toBeNull();
  });

  it("refuses a document declaring client_secret_* auth (no secret exists for CIMD)", async () => {
    stubFetch({ ...CIMD_DOC, token_endpoint_auth_method: "client_secret_post" });
    expect(await fetchCimdDocument(CIMD_URL)).toBeNull();
  });

  it("treats a private_key_jwt document as public, and refuses assertions at the token endpoint", async () => {
    stubFetch({ ...CIMD_DOC, token_endpoint_auth_method: "private_key_jwt" });
    const resolved = await resolveCimdClient(CIMD_URL);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.privateKeyJwtDeclared).toBe(true);
      expect(resolved.client.client_secret_hash).toBeNull();
    }
    const store = createMemoryMuseOAuthStore();
    const res = await handleMuseTokenRequest(
      formRequest("http://localhost:3000/api/muse/oauth/token", {
        grant_type: "authorization_code",
        client_id: CIMD_URL,
        client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        client_assertion: "eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJ4In0.sig",
        code: "x",
        redirect_uri: CHATGPT_OAUTH_CALLBACK,
        code_verifier: VERIFIER,
      }),
      { store }
    );
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_client");
  });
});

// ── Discovery metadata routes ───────────────────────────────────────────────

describe("discovery metadata routes", () => {
  it("root protected-resource metadata lists the canonical Muse resource by default", async () => {
    const res = await getRootMetadata(new Request("http://localhost:3000/.well-known/oauth-protected-resource"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.resource).toBe("http://localhost:3000/api/mcp");
    expect(body.authorization_servers).toEqual(["http://localhost:3000"]);
    expect(body.scopes_supported).toEqual([...ALL_OAUTH_SCOPES]);
    expect(body.bearer_methods_supported).toEqual(["header"]);
  });

  it("root protected-resource metadata returns the ChatGPT resource when asked", async () => {
    const res = await getRootMetadata(
      new Request("http://localhost:3000/.well-known/oauth-protected-resource?resource=http://localhost:3000/api/mcp/chatgpt")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.resource).toBe("http://localhost:3000/api/mcp/chatgpt");
  });

  it("authorization-server metadata has the exact RFC 8414 fields, S256 only", async () => {
    const res = await getAuthServerMetadata(new Request("http://localhost:3000/.well-known/oauth-authorization-server"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.issuer).toBe("http://localhost:3000");
    expect(body.authorization_endpoint).toBe("http://localhost:3000/api/muse/oauth/authorize");
    expect(body.token_endpoint).toBe("http://localhost:3000/api/muse/oauth/token");
    expect(body.revocation_endpoint).toBe("http://localhost:3000/api/muse/oauth/revoke");
    expect(body.registration_endpoint).toBe("http://localhost:3000/api/muse/oauth/register");
    expect(body.response_types_supported).toEqual(["code"]);
    expect(body.grant_types_supported).toEqual(["authorization_code", "refresh_token"]);
    expect(body.code_challenge_methods_supported).toEqual(["S256"]);
    expect(body.scopes_supported).toEqual([...ALL_OAUTH_SCOPES]);
    expect(body.token_endpoint_auth_methods_supported).toEqual(["none", "client_secret_post"]);
    expect((body.token_endpoint_auth_methods_supported as string[])).not.toContain("private_key_jwt");
  });

  it("the path-scoped /api/mcp protected-resource variant still works", async () => {
    const res = await getMcpMetadata(new Request("http://localhost:3000/.well-known/oauth-protected-resource/api/mcp"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.resource).toBe("http://localhost:3000/api/mcp");
    expect(body.scopes_supported).toEqual([...ALL_OAUTH_SCOPES]);
  });
});

// ── Muse backward compatibility ─────────────────────────────────────────────

describe("Muse backward compatibility", () => {
  it("a Muse grant with muse.* scopes still validates and exchanges", async () => {
    const store = createMemoryMuseOAuthStore();
    const muse = await registeredClient(store, [MUSE_OAUTH_CALLBACK], "Muse");
    const result = validateAuthorizeRequest(
      {
        client_id: muse.client_id,
        redirect_uri: MUSE_OAUTH_CALLBACK,
        response_type: "code",
        scope: "muse.read muse.write",
        code_challenge: CHALLENGE,
        code_challenge_method: "S256",
      },
      muse,
      { origin: ORIGIN }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.scopes).toEqual(["muse.read", "muse.write"]);
    const code = await issueAuthorizationCode(
      store,
      {
        clientId: muse.client_id,
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        scopes: result.request.scopes,
        codeChallenge: CHALLENGE,
        redirectUri: MUSE_OAUTH_CALLBACK,
        resource: result.request.resource,
      },
      NOW
    );
    const res = await handleMuseTokenRequest(
      formRequest("http://localhost:3000/api/muse/oauth/token", {
        grant_type: "authorization_code",
        client_id: muse.client_id,
        code,
        redirect_uri: MUSE_OAUTH_CALLBACK,
        code_verifier: VERIFIER,
      }),
      { store, now: NOW }
    );
    expect(res.status).toBe(200);
    expect(res.body.scope).toBe("muse.read muse.write");
    // Existing grants validate tiers through either prefix.
    expect(grantHasTier(["muse.read", "muse.write"], "read")).toBe(true);
    expect(grantHasTier(["muse.read", "muse.write"], "send")).toBe(false);
  });

  it("a random 32-byte token-encryption key still signs authorize state", async () => {
    // Covered by the Muse suite; this just pins the shared state
    // helper against the new claims shape (resource/platform).
    const { signMuseAuthorizeState, verifyMuseAuthorizeState } = await import("../oauth/state");
    const key = randomBytes(32).toString("base64");
    const env = { TOKEN_ENCRYPTION_KEY: key };
    const signed = signMuseAuthorizeState(
      {
        clientId: "muse_x",
        redirectUri: MUSE_OAUTH_CALLBACK,
        scopes: ["muse.read"],
        codeChallenge: CHALLENGE,
        clientState: "s",
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        resource: MUSE_RESOURCE,
        platform: "muse",
        clientOrigin: null,
      },
      env,
      NOW
    );
    expect(signed).not.toBeNull();
    const verified = verifyMuseAuthorizeState(
      signed as string,
      { userId: USER_ID, workspaceId: WORKSPACE_ID },
      env,
      NOW
    );
    expect(verified?.resource).toBe(MUSE_RESOURCE);
    expect(verified?.platform).toBe("muse");
  });
});
