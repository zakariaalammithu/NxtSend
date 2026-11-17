/**
 * Claude OAuth tests — claude.* scopes, the Claude redirect URIs
 * (claude.ai + claude.com callbacks), platform-bound redirect
 * validation, CIMD clients (incl. Claude Code's published document),
 * RFC 8707 `resource` binding for /api/mcp/claude, RFC 9207 `iss`,
 * and the discovery metadata routes (incl. the CIMD flag).
 *
 * What is being protected: a Claude grant (claude.* scopes) has
 * exactly the same tiers as a Muse grant (muse.*) and no more;
 * `send` never implies `read`/`write`; a token bound to one MCP
 * resource never validates for another; a Muse client cannot use a
 * Claude callback URI and vice versa — even when the URI is
 * registered for the client; CIMD documents are fetched with a
 * timeout + size cap and fail closed; the AS metadata advertises
 * `client_id_metadata_document_supported: true` so Claude selects
 * CIMD. Muse's and ChatGPT's existing flows keep working unchanged.
 *
 * All through the in-memory store seam — no database. CIMD fetches
 * are stubbed with vi.stubGlobal("fetch", ...) and the cache is
 * cleared between tests. No CLAUDE_OAUTH_CLIENT_SECRET exists
 * anywhere: Claude connects as a public client.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  MUSE_SCOPES,
  NXT_SEND_SCOPES,
  CLAUDE_SCOPES,
  ALL_OAUTH_SCOPES,
  SCOPE_TIER_MAP,
  grantHasTier,
  normalizeScopes,
  defaultScopeForPlatform,
  scopeDescription,
  CHATGPT_OAUTH_CALLBACK,
  MUSE_OAUTH_CALLBACK,
  CLAUDE_OAUTH_CALLBACK,
  CLAUDE_COM_OAUTH_CALLBACK,
  CLAUDE_OAUTH_CALLBACKS,
  isAllowedOAuthRedirectUri,
  isAllowedClaudeRedirectUri,
  isAllowedRedirectUriForPlatform,
  registerMuseClient,
  validateRedirectUri,
  validateRedirectUriForPlatform,
  clientPlatform,
  platformLabel,
  createMemoryMuseOAuthStore,
  issueAuthorizationCode,
  issueMuseTokens,
  verifyMuseAccessToken,
  validateAuthorizeRequest,
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
import { GET as getClaudeMetadata } from "@/app/.well-known/oauth-protected-resource/api/mcp/claude/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const ORIGIN = "https://nxtsend.com";
const MUSE_RESOURCE = `${ORIGIN}/api/mcp`;
const CHATGPT_RESOURCE = `${ORIGIN}/api/mcp/chatgpt`;
const CLAUDE_RESOURCE = `${ORIGIN}/api/mcp/claude`;
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const NOW = new Date("2026-11-16T12:00:00Z");

const CIMD_URL = "https://claude.ai/.well-known/oauth-client";
const CIMD_DOC = {
  client_name: "Claude",
  redirect_uris: [CLAUDE_OAUTH_CALLBACK],
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
};
// Claude Code's published CIMD: loopback redirects only, public client.
const CLAUDE_CODE_CIMD_URL = "https://claude.ai/oauth/claude-code-client-metadata";
const CLAUDE_CODE_CIMD_DOC = {
  client_name: "Claude Code",
  redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"],
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

describe("claude.* scopes", () => {
  it("lists all four scope sets; muse.*, nxtsend.* and claude.* are unchanged", () => {
    expect([...MUSE_SCOPES]).toEqual(["muse.read", "muse.write", "muse.send"]);
    expect([...NXT_SEND_SCOPES]).toEqual(["nxtsend.read", "nxtsend.write", "nxtsend.send"]);
    expect([...CLAUDE_SCOPES]).toEqual(["claude.read", "claude.write", "claude.send"]);
    expect([...ALL_OAUTH_SCOPES]).toEqual([
      "muse.read",
      "muse.write",
      "muse.send",
      "nxtsend.read",
      "nxtsend.write",
      "nxtsend.send",
      "claude.read",
      "claude.write",
      "claude.send",
      "zapier.read",
      "zapier.write",
      "n8n.read",
      "n8n.write",
    ]);
  });

  it("maps claude.* to the same tiers as the other prefixes", () => {
    expect(SCOPE_TIER_MAP["claude.read"]).toBe("read");
    expect(SCOPE_TIER_MAP["claude.write"]).toBe("write");
    expect(SCOPE_TIER_MAP["claude.send"]).toBe("send");
  });

  it("grantHasTier: any scope of the tier satisfies it, any prefix", () => {
    expect(grantHasTier(["claude.read"], "read")).toBe(true);
    expect(grantHasTier(["claude.write", "muse.read"], "write")).toBe(true);
    expect(grantHasTier(["claude.send"], "send")).toBe(true);
    expect(grantHasTier(["claude.read"], "write")).toBe(false);
    expect(grantHasTier(["claude.send"], "read")).toBe(false);
    expect(grantHasTier(["claude.send"], "write")).toBe(false);
  });

  it("normalizeScopes accepts the claude.* prefix, de-duplicates, refuses unknowns", () => {
    expect(normalizeScopes("claude.read claude.send claude.read")).toEqual([
      "claude.read",
      "claude.send",
    ]);
    expect(normalizeScopes("muse.read claude.write")).toEqual(["muse.read", "claude.write"]);
    expect(normalizeScopes("claude.everything")).toBeNull();
  });

  it("defaults the least-privilege scope per platform", () => {
    expect(defaultScopeForPlatform("claude")).toBe("claude.read");
    expect(defaultScopeForPlatform("muse")).toBe("muse.read");
    expect(defaultScopeForPlatform("chatgpt")).toBe("nxtsend.read");
  });

  it("describes claude.* scopes in plain words, naming Claude", () => {
    expect(scopeDescription("claude.read")).toContain("Read your leads");
    expect(scopeDescription("claude.send")).toContain("Claude");
    expect(scopeDescription("claude.write")).toContain("never sends anything");
  });
});

// ── Redirect URIs ───────────────────────────────────────────────────────────

describe("Claude redirect URI allowlist", () => {
  it("allows both Claude callbacks, the Muse + ChatGPT callbacks and loopback — nothing else", () => {
    expect(isAllowedOAuthRedirectUri(CLAUDE_OAUTH_CALLBACK)).toBe(true);
    expect(isAllowedOAuthRedirectUri(CLAUDE_COM_OAUTH_CALLBACK)).toBe(true);
    expect([...CLAUDE_OAUTH_CALLBACKS]).toEqual([
      "https://claude.ai/api/mcp/auth_callback",
      "https://claude.com/api/mcp/auth_callback",
    ]);
    expect(isAllowedOAuthRedirectUri(MUSE_OAUTH_CALLBACK)).toBe(true);
    expect(isAllowedOAuthRedirectUri(CHATGPT_OAUTH_CALLBACK)).toBe(true);
    expect(isAllowedOAuthRedirectUri("http://localhost:3118/callback")).toBe(true);
    expect(isAllowedOAuthRedirectUri("http://127.0.0.1/callback")).toBe(true);
    expect(isAllowedOAuthRedirectUri("https://evil.example/callback")).toBe(false);
    expect(isAllowedOAuthRedirectUri("https://claude.ai.evil.example/api/mcp/auth_callback")).toBe(false);
    expect(isAllowedOAuthRedirectUri("https://claude.ai/other")).toBe(false);
    expect(isAllowedOAuthRedirectUri("https://claude.com.evil.example/api/mcp/auth_callback")).toBe(false);
  });

  it("isAllowedClaudeRedirectUri accepts Claude callbacks + loopback only", () => {
    expect(isAllowedClaudeRedirectUri(CLAUDE_OAUTH_CALLBACK)).toBe(true);
    expect(isAllowedClaudeRedirectUri(CLAUDE_COM_OAUTH_CALLBACK)).toBe(true);
    expect(isAllowedClaudeRedirectUri("http://localhost:3118/callback")).toBe(true);
    expect(isAllowedClaudeRedirectUri(MUSE_OAUTH_CALLBACK)).toBe(false);
    expect(isAllowedClaudeRedirectUri(CHATGPT_OAUTH_CALLBACK)).toBe(false);
    expect(isAllowedClaudeRedirectUri("https://evil.example/callback")).toBe(false);
  });

  it("platform binding: a redirect URI is valid only for its own platform (loopback excepted)", () => {
    expect(isAllowedRedirectUriForPlatform(CLAUDE_OAUTH_CALLBACK, "claude")).toBe(true);
    expect(isAllowedRedirectUriForPlatform(CLAUDE_OAUTH_CALLBACK, "muse")).toBe(false);
    expect(isAllowedRedirectUriForPlatform(CLAUDE_OAUTH_CALLBACK, "chatgpt")).toBe(false);
    expect(isAllowedRedirectUriForPlatform(MUSE_OAUTH_CALLBACK, "claude")).toBe(false);
    expect(isAllowedRedirectUriForPlatform(MUSE_OAUTH_CALLBACK, "muse")).toBe(true);
    expect(isAllowedRedirectUriForPlatform(CHATGPT_OAUTH_CALLBACK, "claude")).toBe(false);
    expect(isAllowedRedirectUriForPlatform(CHATGPT_OAUTH_CALLBACK, "chatgpt")).toBe(true);
    // Loopback is valid for every platform (local testing, Claude Code).
    expect(isAllowedRedirectUriForPlatform("http://localhost:3118/callback", "claude")).toBe(true);
    expect(isAllowedRedirectUriForPlatform("http://localhost:3118/callback", "muse")).toBe(true);
    expect(isAllowedRedirectUriForPlatform("http://127.0.0.1/callback", "chatgpt")).toBe(true);
  });

  it("registers a Claude client via DCR and validates its callbacks exactly", async () => {
    const store = createMemoryMuseOAuthStore();
    const client = await registeredClient(store, [CLAUDE_OAUTH_CALLBACK], "Claude");
    expect(clientPlatform(client)).toBe("claude");
    expect(platformLabel("claude")).toBe("Claude");
    expect(validateRedirectUri(client, CLAUDE_OAUTH_CALLBACK)).toBe(true);
    expect(validateRedirectUri(client, CLAUDE_COM_OAUTH_CALLBACK)).toBe(false);
    // The Muse callback is allowlisted globally but NOT registered for this client.
    expect(validateRedirectUri(client, MUSE_OAUTH_CALLBACK)).toBe(false);
    // Platform-bound validation refuses the Muse URI for a Claude client
    // even when it IS registered for it.
    const mixed = await registeredClient(
      store,
      [CLAUDE_OAUTH_CALLBACK, MUSE_OAUTH_CALLBACK],
      "Mixed"
    );
    expect(validateRedirectUri(mixed, MUSE_OAUTH_CALLBACK)).toBe(true);
    expect(validateRedirectUriForPlatform(mixed, MUSE_OAUTH_CALLBACK, "claude")).toBe(false);
    expect(validateRedirectUriForPlatform(mixed, CLAUDE_OAUTH_CALLBACK, "claude")).toBe(true);
  });

  it("a Muse client cannot use a Claude callback URI at authorize time", async () => {
    const store = createMemoryMuseOAuthStore();
    const muse = await registeredClient(store, [MUSE_OAUTH_CALLBACK], "Muse");
    const result = validateAuthorizeRequest(
      {
        client_id: muse.client_id,
        redirect_uri: CLAUDE_OAUTH_CALLBACK,
        response_type: "code",
        code_challenge: CHALLENGE,
        code_challenge_method: "S256",
      },
      muse,
      { origin: ORIGIN }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.redirectUri).toBeNull();
  });

  it("registers a Claude client through the register endpoint (public, no secret)", async () => {
    const store = createMemoryMuseOAuthStore();
    const req = new Request("http://localhost:3000/api/muse/oauth/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
      body: JSON.stringify({ client_name: "Claude", redirect_uris: [CLAUDE_OAUTH_CALLBACK] }),
    });
    const result = await handleMuseRegisterRequest(req, { store, limiter: createDcrRateLimiter() });
    expect(result.status).toBe(201);
    expect(result.body.redirect_uris).toEqual([CLAUDE_OAUTH_CALLBACK]);
    expect(result.body.token_endpoint_auth_method).toBe("none");
    expect(result.body.client_secret).toBeUndefined();
  });

  it("registers a client with the claude.com callback too", async () => {
    const store = createMemoryMuseOAuthStore();
    const client = await registeredClient(store, [CLAUDE_COM_OAUTH_CALLBACK], "Claude");
    expect(clientPlatform(client)).toBe("claude");
    expect(validateRedirectUri(client, CLAUDE_COM_OAUTH_CALLBACK)).toBe(true);
  });
});

// ── Authorize validation: defaults + resource ───────────────────────────────

describe("authorize validation (Claude defaults + resource)", () => {
  function baseParams(clientId: string, redirectUri: string) {
    return {
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      code_challenge: CHALLENGE,
      code_challenge_method: "S256",
    };
  }

  it("defaults scope and resource for a Claude client when none are sent", async () => {
    const store = createMemoryMuseOAuthStore();
    const claude = await registeredClient(store, [CLAUDE_OAUTH_CALLBACK], "Claude");
    const result = validateAuthorizeRequest(
      baseParams(claude.client_id, CLAUDE_OAUTH_CALLBACK),
      claude,
      { origin: ORIGIN }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.scopes).toEqual(["claude.read"]);
      expect(result.request.resource).toBe(CLAUDE_RESOURCE);
      expect(result.request.platform).toBe("claude");
    }
  });

  it("accepts an explicit valid resource and claude.* scopes", async () => {
    const store = createMemoryMuseOAuthStore();
    const claude = await registeredClient(store, [CLAUDE_OAUTH_CALLBACK], "Claude");
    const result = validateAuthorizeRequest(
      {
        ...baseParams(claude.client_id, CLAUDE_OAUTH_CALLBACK),
        scope: "claude.read claude.send",
        resource: CLAUDE_RESOURCE,
      },
      claude,
      { origin: ORIGIN }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.scopes).toEqual(["claude.read", "claude.send"]);
      expect(result.request.resource).toBe(CLAUDE_RESOURCE);
    }
  });

  it("refuses a wrong resource with invalid_target", async () => {
    const store = createMemoryMuseOAuthStore();
    const claude = await registeredClient(store, [CLAUDE_OAUTH_CALLBACK], "Claude");
    const wrong = validateAuthorizeRequest(
      {
        ...baseParams(claude.client_id, CLAUDE_OAUTH_CALLBACK),
        resource: "https://evil.example/api/mcp/claude",
      },
      claude,
      { origin: ORIGIN }
    );
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) {
      expect(wrong.error).toBe("invalid_target");
      expect(wrong.redirectUri).toBe(CLAUDE_OAUTH_CALLBACK);
    }
    // A resource for another platform is also refused (exact match only).
    for (const other of [MUSE_RESOURCE, CHATGPT_RESOURCE]) {
      const result = validateAuthorizeRequest(
        { ...baseParams(claude.client_id, CLAUDE_OAUTH_CALLBACK), resource: other },
        claude,
        { origin: ORIGIN }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("invalid_target");
    }
  });

  it("refuses the Muse callback URI for a Claude client", async () => {
    const store = createMemoryMuseOAuthStore();
    const claude = await registeredClient(store, [CLAUDE_OAUTH_CALLBACK], "Claude");
    const result = validateAuthorizeRequest(
      baseParams(claude.client_id, MUSE_OAUTH_CALLBACK),
      claude,
      { origin: ORIGIN }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.redirectUri).toBeNull();
  });
});

// ── Token exchange: resource preserved + iss ────────────────────────────────

describe("token exchange (Claude resource + iss)", () => {
  async function codeFor(
    store: MuseOAuthStore,
    clientId: string,
    resource: string | null,
    scopes: string[] = ["claude.read"]
  ) {
    return issueAuthorizationCode(
      store,
      {
        clientId,
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        scopes: scopes as never,
        codeChallenge: CHALLENGE,
        redirectUri: CLAUDE_OAUTH_CALLBACK,
        resource,
      },
      NOW
    );
  }

  it("preserves the Claude resource through code → token and reports iss; token verifies for Claude only", async () => {
    const store = createMemoryMuseOAuthStore();
    const claude = await registeredClient(store, [CLAUDE_OAUTH_CALLBACK], "Claude");
    const code = await codeFor(store, claude.client_id, CLAUDE_RESOURCE);
    const res = await handleMuseTokenRequest(
      formRequest("http://localhost:3000/api/muse/oauth/token", {
        grant_type: "authorization_code",
        client_id: claude.client_id,
        code,
        redirect_uri: CLAUDE_OAUTH_CALLBACK,
        code_verifier: VERIFIER,
        resource: CLAUDE_RESOURCE,
      }),
      { store, now: NOW }
    );
    expect(res.status).toBe(200);
    expect(res.body.iss).toBe("http://localhost:3000");
    expect(res.body.scope).toBe("claude.read");
    const access = res.body.access_token as string;
    const forClaude = await verifyMuseAccessToken(access, {
      store,
      mode: "supabase",
      resource: CLAUDE_RESOURCE,
      now: NOW,
    });
    expect(forClaude).not.toBeNull();
    expect(forClaude?.resource).toBe(CLAUDE_RESOURCE);
    expect(
      await verifyMuseAccessToken(access, { store, mode: "supabase", resource: MUSE_RESOURCE, now: NOW })
    ).toBeNull();
    expect(
      await verifyMuseAccessToken(access, { store, mode: "supabase", resource: CHATGPT_RESOURCE, now: NOW })
    ).toBeNull();
  });

  it("refresh responses carry iss and keep the Claude resource binding", async () => {
    const store = createMemoryMuseOAuthStore();
    const claude = await registeredClient(store, [CLAUDE_OAUTH_CALLBACK], "Claude");
    const first = await issueMuseTokens(store, {
      clientId: claude.client_id,
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      scopes: ["claude.read"],
      resource: CLAUDE_RESOURCE,
    });
    const res = await handleMuseTokenRequest(
      formRequest("http://localhost:3000/api/muse/oauth/token", {
        grant_type: "refresh_token",
        client_id: claude.client_id,
        refresh_token: first.refresh_token,
      }),
      { store }
    );
    expect(res.status).toBe(200);
    expect(res.body.iss).toBe("http://localhost:3000");
    const access = res.body.access_token as string;
    const ctx = await verifyMuseAccessToken(access, { store, mode: "supabase" });
    expect(ctx?.resource).toBe(CLAUDE_RESOURCE);
  });
});

// ── resolveMuseContext audience enforcement ─────────────────────────────────

describe("resolveMuseContext audience (Claude)", () => {
  it("a Claude token resolves for /api/mcp/claude and not for /api/mcp or /api/mcp/chatgpt", async () => {
    const store = createMemoryMuseOAuthStore();
    const claude = await registeredClient(store, [CLAUDE_OAUTH_CALLBACK], "Claude");
    const tokens = await issueMuseTokens(store, {
      clientId: claude.client_id,
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      scopes: ["claude.read"],
      resource: "http://localhost:3000/api/mcp/claude",
    });
    const claudeReq = new Request("http://localhost:3000/api/mcp/claude", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    const claudeCtx = await resolveMuseContext(claudeReq, { store, mode: "supabase" });
    expect(claudeCtx?.userId).toBe(USER_ID);
    expect(claudeCtx?.resource).toBe("http://localhost:3000/api/mcp/claude");
    const museReq = new Request("http://localhost:3000/api/mcp", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    expect(await resolveMuseContext(museReq, { store, mode: "supabase" })).toBeNull();
    const gptReq = new Request("http://localhost:3000/api/mcp/chatgpt", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    expect(await resolveMuseContext(gptReq, { store, mode: "supabase" })).toBeNull();
  });

  it("a Muse token does not resolve for /api/mcp/claude", async () => {
    const store = createMemoryMuseOAuthStore();
    const muse = await registeredClient(store, [MUSE_OAUTH_CALLBACK], "Muse");
    const tokens = await issueMuseTokens(store, {
      clientId: muse.client_id,
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      scopes: ["muse.read"],
      resource: "http://localhost:3000/api/mcp",
    });
    const claudeReq = new Request("http://localhost:3000/api/mcp/claude", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    expect(await resolveMuseContext(claudeReq, { store, mode: "supabase" })).toBeNull();
  });
});

// ── CIMD ────────────────────────────────────────────────────────────────────

describe("CIMD clients (Claude)", () => {
  function stubFetch(doc: unknown, status = 200) {
    const fetchFn = vi.fn(async () => jsonResponse(doc as Record<string, unknown>, status));
    vi.stubGlobal("fetch", fetchFn);
    return fetchFn;
  }

  it("resolves a valid Claude document to an ephemeral public client (never stored)", async () => {
    const fetchFn = stubFetch(CIMD_DOC);
    const store = createMemoryMuseOAuthStore();
    const resolved = await resolveCimdClient(CIMD_URL);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.client.client_id).toBe(CIMD_URL);
      expect(resolved.client.name).toBe("Claude");
      expect(resolved.client.redirect_uris).toEqual([CLAUDE_OAUTH_CALLBACK]);
      expect(resolved.client.client_secret_hash).toBeNull();
      expect(resolved.platform).toBe("claude");
      expect(resolved.privateKeyJwtDeclared).toBe(false);
      expect(resolved.document.token_endpoint_auth_method).toBe("none");
      expect(await store.getClient(CIMD_URL)).toBeNull();
    }
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("resolves Claude Code's published CIMD (loopback redirects only) as a Claude client", async () => {
    stubFetch(CLAUDE_CODE_CIMD_DOC);
    const resolved = await resolveCimdClient(CLAUDE_CODE_CIMD_URL);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.platform).toBe("claude");
      expect(resolved.client.client_secret_hash).toBeNull();
      expect(resolved.client.redirect_uris).toEqual([
        "http://localhost/callback",
        "http://127.0.0.1/callback",
      ]);
    }
  });

  it("validates an ephemeral Claude CIMD client at authorize time", async () => {
    stubFetch(CIMD_DOC);
    const resolved = await resolveCimdClient(CIMD_URL);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const result = validateAuthorizeRequest(
      {
        client_id: CIMD_URL,
        redirect_uri: CLAUDE_OAUTH_CALLBACK,
        response_type: "code",
        scope: "claude.read",
        code_challenge: CHALLENGE,
        code_challenge_method: "S256",
        resource: CLAUDE_RESOURCE,
      },
      resolved.client,
      { origin: ORIGIN }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.platform).toBe("claude");
      expect(result.request.clientOrigin).toBe("https://claude.ai");
      expect(result.request.resource).toBe(CLAUDE_RESOURCE);
    }
  });

  it("exchanges a code for a Claude CIMD client through the token endpoint", async () => {
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
        scopes: ["claude.read"],
        codeChallenge: CHALLENGE,
        redirectUri: CLAUDE_OAUTH_CALLBACK,
        resource: CLAUDE_RESOURCE,
      },
      NOW
    );
    const res = await handleMuseTokenRequest(
      formRequest("http://localhost:3000/api/muse/oauth/token", {
        grant_type: "authorization_code",
        client_id: CIMD_URL,
        code,
        redirect_uri: CLAUDE_OAUTH_CALLBACK,
        code_verifier: VERIFIER,
        resource: CLAUDE_RESOURCE,
      }),
      { store, now: NOW }
    );
    expect(res.status).toBe(200);
    expect(typeof res.body.access_token).toBe("string");
    expect(await store.getClient(CIMD_URL)).toBeNull();
  });

  it("fails closed on a Claude document listing a non-allowlisted redirect URI", async () => {
    stubFetch({ ...CIMD_DOC, redirect_uris: ["https://evil.example/callback"] });
    expect(await fetchCimdDocument(CIMD_URL)).toBeNull();
  });

  it("isCimdClientId accepts https URLs only", () => {
    expect(isCimdClientId(CIMD_URL)).toBe(true);
    expect(isCimdClientId(CLAUDE_CODE_CIMD_URL)).toBe(true);
    expect(isCimdClientId("muse_abc123")).toBe(false);
  });
});

// ── Discovery metadata routes ───────────────────────────────────────────────

describe("discovery metadata routes (Claude)", () => {
  it("root protected-resource metadata returns the Claude resource when asked", async () => {
    const res = await getRootMetadata(
      new Request("http://localhost:3000/.well-known/oauth-protected-resource?resource=http://localhost:3000/api/mcp/claude")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.resource).toBe("http://localhost:3000/api/mcp/claude");
    expect(body.scopes_supported).toContain("claude.read");
  });

  it("root protected-resource metadata still defaults to the Muse resource", async () => {
    const res = await getRootMetadata(new Request("http://localhost:3000/.well-known/oauth-protected-resource"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.resource).toBe("http://localhost:3000/api/mcp");
  });

  it("authorization-server metadata advertises client_id_metadata_document_supported: true", async () => {
    const res = await getAuthServerMetadata(new Request("http://localhost:3000/.well-known/oauth-authorization-server"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.client_id_metadata_document_supported).toBe(true);
    expect(body.token_endpoint_auth_methods_supported).toEqual(["none", "client_secret_post"]);
    expect((body.token_endpoint_auth_methods_supported as string[])).toContain("none");
    expect((body.token_endpoint_auth_methods_supported as string[])).not.toContain("private_key_jwt");
    expect(body.grant_types_supported).toEqual(["authorization_code", "refresh_token"]);
    expect(body.scopes_supported).toEqual([...ALL_OAUTH_SCOPES]);
  });

  it("the path-scoped /api/mcp/claude protected-resource document returns the Claude resource", async () => {
    const res = await getClaudeMetadata(
      new Request("http://localhost:3000/.well-known/oauth-protected-resource/api/mcp/claude")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.resource).toBe("http://localhost:3000/api/mcp/claude");
    expect(body.authorization_servers).toEqual(["http://localhost:3000"]);
    expect(body.scopes_supported).toEqual([...ALL_OAUTH_SCOPES]);
    expect(body.bearer_methods_supported).toEqual(["header"]);
  });
});

// ── Muse / ChatGPT backward compatibility ───────────────────────────────────

describe("Muse / ChatGPT backward compatibility", () => {
  it("a Muse client still resolves as Muse and a ChatGPT client as ChatGPT", async () => {
    const store = createMemoryMuseOAuthStore();
    const muse = await registeredClient(store, [MUSE_OAUTH_CALLBACK], "Muse");
    const chatgpt = await registeredClient(store, [CHATGPT_OAUTH_CALLBACK], "ChatGPT");
    expect(clientPlatform(muse)).toBe("muse");
    expect(clientPlatform(chatgpt)).toBe("chatgpt");
    expect(platformLabel("muse")).toBe("Muse");
    expect(platformLabel("chatgpt")).toBe("ChatGPT");
    expect(defaultScopeForPlatform("muse")).toBe("muse.read");
    expect(defaultScopeForPlatform("chatgpt")).toBe("nxtsend.read");
  });

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
    expect(result.request.resource).toBe(MUSE_RESOURCE);
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
  });
});
