/**
 * Muse OAuth 2.1 server tests.
 *
 * What is being protected: PKCE S256 only (plain/missing refused),
 * authorize validation (bad client / bad redirect / missing
 * challenge / demo refusal), single-use expiring codes, refresh
 * rotation with reuse-revokes-grant, RFC 7009 revoke (unknown token
 * still 200), DCR validation + rate limit, and the fail-closed demo
 * rule (verify/resolve return null in demo mode). All through the
 * in-memory store seam — no database, no network.
 */

import { describe, it, expect } from "vitest";
import { randomBytes } from "crypto";
import {
  computeCodeChallenge,
  verifyCodeChallenge,
  isS256Method,
  parseMuseScopes,
  createMemoryMuseOAuthStore,
  registerMuseClient,
  isAllowedMuseRedirectUri,
  validateRedirectUri,
  verifyClientSecret,
  hashToken,
  issueMuseTokens,
  verifyMuseAccessToken,
  rotateRefreshToken,
  revokeMuseToken,
  signMuseAuthorizeState,
  verifyMuseAuthorizeState,
  validateAuthorizeRequest,
  issueAuthorizationCode,
  resolveMuseContext,
  handleMuseTokenRequest,
  handleMuseRevokeRequest,
  handleMuseRegisterRequest,
  createDcrRateLimiter,
  MUSE_OAUTH_CALLBACK,
  type MuseOAuthStore,
} from "../oauth";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const REDIRECT = MUSE_OAUTH_CALLBACK;
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

const TEST_KEY = randomBytes(32).toString("base64");
const TEST_ENV = { TOKEN_ENCRYPTION_KEY: TEST_KEY };

async function registeredClient(store: MuseOAuthStore, confidential = false) {
  const result = await registerMuseClient(
    store,
    { name: "Muse", redirectUris: [REDIRECT], confidential },
    new Date("2026-11-16T00:00:00Z")
  );
  if (!result.ok) throw new Error(`registration failed: ${result.error}`);
  return result;
}

function formRequest(url: string, params: Record<string, string>): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
}

async function exchangeCode(
  store: MuseOAuthStore,
  clientId: string,
  code: string,
  verifier: string,
  redirectUri = REDIRECT
) {
  return handleMuseTokenRequest(
    formRequest("http://localhost:3000/api/muse/oauth/token", {
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
    { store }
  );
}

// ── PKCE ────────────────────────────────────────────────────────────────────

describe("PKCE S256", () => {
  it("computes the RFC 7636 example challenge", () => {
    expect(computeCodeChallenge(VERIFIER)).toBe(CHALLENGE);
  });

  it("verifies a matching verifier and refuses a wrong one", () => {
    expect(verifyCodeChallenge(VERIFIER, CHALLENGE)).toBe(true);
    expect(verifyCodeChallenge("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", CHALLENGE)).toBe(false);
  });

  it("refuses missing challenge/verifier and short verifiers", () => {
    expect(verifyCodeChallenge(VERIFIER, null)).toBe(false);
    expect(verifyCodeChallenge(null, CHALLENGE)).toBe(false);
    expect(verifyCodeChallenge("short", CHALLENGE)).toBe(false);
  });

  it("accepts only the S256 method — plain is refused", () => {
    expect(isS256Method("S256")).toBe(true);
    expect(isS256Method("plain")).toBe(false);
    expect(isS256Method(null)).toBe(false);
    expect(isS256Method(undefined)).toBe(false);
  });
});

// ── Scopes ──────────────────────────────────────────────────────────────────

describe("scopes", () => {
  it("parses the three known scopes and de-duplicates", () => {
    expect(parseMuseScopes("muse.read muse.write muse.read")).toEqual(["muse.read", "muse.write"]);
  });

  it("defaults an empty scope to read-only", () => {
    expect(parseMuseScopes(null)).toEqual(["muse.read"]);
    expect(parseMuseScopes("")).toEqual(["muse.read"]);
  });

  it("refuses any unknown scope", () => {
    expect(parseMuseScopes("muse.read admin")).toBeNull();
    expect(parseMuseScopes("muse.everything")).toBeNull();
  });
});

// ── Authorize validation ────────────────────────────────────────────────────

describe("authorize validation", () => {
  it("rejects an unknown client", async () => {
    const result = validateAuthorizeRequest(
      { client_id: "nope", redirect_uri: REDIRECT, response_type: "code", code_challenge: CHALLENGE, code_challenge_method: "S256" },
      null
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("invalid_client");
      expect(result.redirectUri).toBeNull();
    }
  });

  it("rejects a redirect_uri that is not exactly registered", async () => {
    const store = createMemoryMuseOAuthStore();
    const { client } = await registeredClient(store);
    const result = validateAuthorizeRequest(
      { client_id: client.client_id, redirect_uri: "https://evil.example/callback", response_type: "code", code_challenge: CHALLENGE, code_challenge_method: "S256" },
      client
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.redirectUri).toBeNull();
  });

  it("rejects a missing challenge and a plain challenge method", async () => {
    const store = createMemoryMuseOAuthStore();
    const { client } = await registeredClient(store);
    const base = {
      client_id: client.client_id,
      redirect_uri: REDIRECT,
      response_type: "code",
      code_challenge_method: "S256",
    };
    expect(validateAuthorizeRequest({ ...base, code_challenge: null }, client).ok).toBe(false);
    expect(
      validateAuthorizeRequest({ ...base, code_challenge: CHALLENGE, code_challenge_method: "plain" }, client).ok
    ).toBe(false);
    expect(
      validateAuthorizeRequest({ ...base, code_challenge: CHALLENGE, code_challenge_method: null }, client).ok
    ).toBe(false);
  });

  it("rejects a non-code response_type and an unknown scope", async () => {
    const store = createMemoryMuseOAuthStore();
    const { client } = await registeredClient(store);
    const base = {
      client_id: client.client_id,
      redirect_uri: REDIRECT,
      code_challenge: CHALLENGE,
      code_challenge_method: "S256",
    };
    expect(validateAuthorizeRequest({ ...base, response_type: "token" }, client).ok).toBe(false);
    expect(validateAuthorizeRequest({ ...base, response_type: "code", scope: "admin" }, client).ok).toBe(false);
  });

  it("accepts a valid request, defaulting scope to muse.read", async () => {
    const store = createMemoryMuseOAuthStore();
    const { client } = await registeredClient(store);
    const result = validateAuthorizeRequest(
      { client_id: client.client_id, redirect_uri: REDIRECT, response_type: "code", code_challenge: CHALLENGE, code_challenge_method: "S256", state: "abc" },
      client
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.scopes).toEqual(["muse.read"]);
      expect(result.request.clientState).toBe("abc");
    }
  });
});

// ── Authorize state (HMAC) ──────────────────────────────────────────────────

describe("authorize state", () => {
  const claims = {
    clientId: "muse_test",
    redirectUri: REDIRECT,
    scopes: ["muse.read"] as const,
    codeChallenge: CHALLENGE,
    clientState: "xyz",
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
  };

  it("round-trips for the same session and refuses another user", () => {
    const signed = signMuseAuthorizeState({ ...claims, scopes: ["muse.read"] }, TEST_ENV);
    expect(signed).not.toBeNull();
    const verified = verifyMuseAuthorizeState(signed as string, { userId: USER_ID, workspaceId: WORKSPACE_ID }, TEST_ENV);
    expect(verified?.clientId).toBe("muse_test");
    expect(verified?.clientState).toBe("xyz");
    expect(
      verifyMuseAuthorizeState(signed as string, { userId: "other-user", workspaceId: WORKSPACE_ID }, TEST_ENV)
    ).toBeNull();
  });

  it("refuses a tampered payload and an expired state", () => {
    const signed = signMuseAuthorizeState({ ...claims, scopes: ["muse.read"] }, TEST_ENV) as string;
    const [payload, sig] = signed.split(".");
    const tampered = `${Buffer.from("{}", "utf8").toString("base64url")}.${sig}`;
    expect(tampered).not.toBe(signed);
    expect(
      verifyMuseAuthorizeState(tampered, { userId: USER_ID, workspaceId: WORKSPACE_ID }, TEST_ENV)
    ).toBeNull();
    void payload;
    const expired = verifyMuseAuthorizeState(
      signed,
      { userId: USER_ID, workspaceId: WORKSPACE_ID },
      TEST_ENV,
      new Date(Date.now() + 11 * 60 * 1000)
    );
    expect(expired).toBeNull();
  });

  it("returns null when no signing key is configured", () => {
    expect(signMuseAuthorizeState({ ...claims, scopes: ["muse.read"] }, {})).toBeNull();
  });
});

// ── Clients / DCR ───────────────────────────────────────────────────────────

describe("clients", () => {
  it("allows only the Muse callback and loopback redirect URIs", () => {
    expect(isAllowedMuseRedirectUri(MUSE_OAUTH_CALLBACK)).toBe(true);
    expect(isAllowedMuseRedirectUri("http://localhost:3000/callback")).toBe(true);
    expect(isAllowedMuseRedirectUri("http://127.0.0.1:8080/cb")).toBe(true);
    expect(isAllowedMuseRedirectUri("https://evil.example/callback")).toBe(false);
    expect(isAllowedMuseRedirectUri("http://localhost.evil.example/callback")).toBe(false);
    expect(isAllowedMuseRedirectUri("https://localhost:3000/callback")).toBe(false);
    expect(isAllowedMuseRedirectUri("not a url")).toBe(false);
  });

  it("requires exact-match redirect URIs per client", async () => {
    const store = createMemoryMuseOAuthStore();
    const { client } = await registeredClient(store);
    expect(validateRedirectUri(client, REDIRECT)).toBe(true);
    expect(validateRedirectUri(client, "http://localhost:3000/callback")).toBe(false);
  });

  it("registers a public client with no secret by default", async () => {
    const store = createMemoryMuseOAuthStore();
    const result = await registeredClient(store);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.clientSecret).toBeNull();
      expect(result.client.client_secret_hash).toBeNull();
      expect(verifyClientSecret(result.client, null)).toBe(true);
      expect(verifyClientSecret(result.client, "anything")).toBe(false);
    }
  });

  it("registers a confidential client only when requested, with a hashed secret", async () => {
    const store = createMemoryMuseOAuthStore();
    const result = await registeredClient(store, true);
    expect(result.ok).toBe(true);
    if (result.ok && result.clientSecret) {
      expect(result.client.client_secret_hash).toBe(hashToken(result.clientSecret));
      expect(verifyClientSecret(result.client, result.clientSecret)).toBe(true);
      expect(verifyClientSecret(result.client, "wrong-secret")).toBe(false);
      expect(verifyClientSecret(result.client, null)).toBe(false);
    }
  });

  it("rejects bad registration metadata", async () => {
    const store = createMemoryMuseOAuthStore();
    const bad = await registerMuseClient(store, { name: "  ", redirectUris: [REDIRECT] });
    expect(bad.ok).toBe(false);
    const badUri = await registerMuseClient(store, { name: "Muse", redirectUris: ["https://evil.example/x"] });
    expect(badUri.ok).toBe(false);
    const noUris = await registerMuseClient(store, { name: "Muse", redirectUris: [] });
    expect(noUris.ok).toBe(false);
  });

  it("evicts the oldest never-used client over the cap, and refuses when none qualifies", async () => {
    let clock = new Date("2026-11-10T00:00:00Z");
    const store = createMemoryMuseOAuthStore(() => clock);
    const old = new Date("2026-11-10T00:00:00Z");
    const now = new Date("2026-11-16T00:00:00Z");
    for (let i = 0; i < 50; i++) {
      await registerMuseClient(store, { name: `c${i}`, redirectUris: [REDIRECT] }, old);
    }
    clock = now;
    // One more registration evicts the oldest never-used client.
    const extra = await registerMuseClient(store, { name: "extra", redirectUris: [REDIRECT] }, now);
    expect(extra.ok).toBe(true);
    expect((await store.listClients()).length).toBe(50);

    // Now make every client "used" by issuing a code for the first one.
    const clients = await store.listClients();
    await issueAuthorizationCode(
      store,
      { clientId: clients[0].client_id, userId: USER_ID, workspaceId: WORKSPACE_ID, scopes: ["muse.read"], codeChallenge: CHALLENGE, redirectUri: REDIRECT },
      now
    );
    // And mark the rest used by issuing tokens for each (via direct insert through issue).
    for (const c of clients.slice(1)) {
      await issueMuseTokens(store, { clientId: c.client_id, userId: USER_ID, workspaceId: WORKSPACE_ID, scopes: ["muse.read"] }, now);
    }
    const refused = await registerMuseClient(store, { name: "one-more", redirectUris: [REDIRECT] }, now);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toBe("too_many_clients");
  });
});

// ── Tokens ──────────────────────────────────────────────────────────────────

describe("tokens", () => {
  it("verifies an issued access token and refuses the demo persona", async () => {
    const store = createMemoryMuseOAuthStore();
    const { client } = await registeredClient(store);
    const tokens = await issueMuseTokens(store, {
      clientId: client.client_id, userId: USER_ID, workspaceId: WORKSPACE_ID, scopes: ["muse.read", "muse.write"],
    });
    const ctx = await verifyMuseAccessToken(tokens.access_token, { store, mode: "supabase" });
    expect(ctx?.userId).toBe(USER_ID);
    expect(ctx?.workspaceId).toBe(WORKSPACE_ID);
    expect(ctx?.scopes).toEqual(["muse.read", "muse.write"]);
    expect(ctx?.clientId).toBe(client.client_id);
    expect(ctx?.grantId).toBe(`${client.client_id}:${USER_ID}`);
    // A refresh token is not an access token.
    expect(await verifyMuseAccessToken(tokens.refresh_token, { store, mode: "supabase" })).toBeNull();
    // Demo mode fails closed.
    expect(await verifyMuseAccessToken(tokens.access_token, { store, mode: "demo" })).toBeNull();
    // Unknown token fails closed.
    expect(await verifyMuseAccessToken("nope", { store, mode: "supabase" })).toBeNull();
  });

  it("refuses expired and revoked access tokens", async () => {
    const store = createMemoryMuseOAuthStore();
    const { client } = await registeredClient(store);
    const tokens = await issueMuseTokens(store, {
      clientId: client.client_id, userId: USER_ID, workspaceId: WORKSPACE_ID, scopes: ["muse.read"],
    });
    expect(
      await verifyMuseAccessToken(tokens.access_token, { store, mode: "supabase", now: new Date(Date.now() + 2 * 60 * 60 * 1000) })
    ).toBeNull();
    await revokeMuseToken(tokens.access_token, { store });
    expect(await verifyMuseAccessToken(tokens.access_token, { store, mode: "supabase" })).toBeNull();
  });

  it("rotates a refresh token and revokes the grant on reuse of the old one", async () => {
    const store = createMemoryMuseOAuthStore();
    const { client } = await registeredClient(store);
    const first = await issueMuseTokens(store, {
      clientId: client.client_id, userId: USER_ID, workspaceId: WORKSPACE_ID, scopes: ["muse.read"],
    });
    const rotated = await rotateRefreshToken(first.refresh_token, { store });
    expect(rotated.ok).toBe(true);
    if (rotated.ok) {
      expect(rotated.tokens.refresh_token).not.toBe(first.refresh_token);
      // The new access token works; the old access token still works
      // (it was not revoked — only the refresh token rotated).
      expect(await verifyMuseAccessToken(rotated.tokens.access_token, { store, mode: "supabase" })).not.toBeNull();
      // Reusing the old refresh token revokes the whole grant.
      const reuse = await rotateRefreshToken(first.refresh_token, { store });
      expect(reuse.ok).toBe(false);
      if (!reuse.ok) expect(reuse.grantRevoked).toBe(true);
      expect(await verifyMuseAccessToken(rotated.tokens.access_token, { store, mode: "supabase" })).toBeNull();
      expect(await verifyMuseAccessToken(first.access_token, { store, mode: "supabase" })).toBeNull();
    }
  });
});

// ── Token endpoint (code exchange) ──────────────────────────────────────────

describe("token endpoint", () => {
  it("exchanges a code once, then refuses reuse, expiry and a wrong verifier", async () => {
    const store = createMemoryMuseOAuthStore();
    const { client } = await registeredClient(store);
    const now = new Date("2026-11-16T12:00:00Z");

    const code = await issueAuthorizationCode(
      store,
      { clientId: client.client_id, userId: USER_ID, workspaceId: WORKSPACE_ID, scopes: ["muse.read"], codeChallenge: CHALLENGE, redirectUri: REDIRECT },
      now
    );
    const ok = await handleMuseTokenRequest(
      formRequest("http://localhost:3000/api/muse/oauth/token", {
        grant_type: "authorization_code",
        client_id: client.client_id,
        code,
        redirect_uri: REDIRECT,
        code_verifier: VERIFIER,
      }),
      { store, now }
    );
    expect(ok.status).toBe(200);
    expect(ok.body.token_type).toBe("Bearer");
    expect(typeof ok.body.access_token).toBe("string");

    // Reuse is refused.
    const reuse = await exchangeCode(store, client.client_id, code, VERIFIER);
    expect(reuse.status).toBe(400);
    expect(reuse.body.error).toBe("invalid_grant");

    // Wrong verifier is refused.
    const code2 = await issueAuthorizationCode(
      store,
      { clientId: client.client_id, userId: USER_ID, workspaceId: WORKSPACE_ID, scopes: ["muse.read"], codeChallenge: CHALLENGE, redirectUri: REDIRECT },
      now
    );
    const wrongVerifier = await exchangeCode(store, client.client_id, code2, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    expect(wrongVerifier.status).toBe(400);
    expect(wrongVerifier.body.error).toBe("invalid_grant");

    // Expired code is refused.
    const code3 = await issueAuthorizationCode(
      store,
      { clientId: client.client_id, userId: USER_ID, workspaceId: WORKSPACE_ID, scopes: ["muse.read"], codeChallenge: CHALLENGE, redirectUri: REDIRECT },
      now
    );
    const expired = await handleMuseTokenRequest(
      formRequest("http://localhost:3000/api/muse/oauth/token", {
        grant_type: "authorization_code",
        client_id: client.client_id,
        code: code3,
        redirect_uri: REDIRECT,
        code_verifier: VERIFIER,
      }),
      { store, now: new Date(now.getTime() + 11 * 60 * 1000) }
    );
    expect(expired.status).toBe(400);
    expect(expired.body.error).toBe("invalid_grant");
  });

  it("refuses an unknown client and an unsupported grant type", async () => {
    const store = createMemoryMuseOAuthStore();
    const unknown = await handleMuseTokenRequest(
      formRequest("http://localhost:3000/api/muse/oauth/token", {
        grant_type: "authorization_code",
        client_id: "nope",
        code: "x",
        redirect_uri: REDIRECT,
        code_verifier: VERIFIER,
      }),
      { store }
    );
    expect(unknown.status).toBe(401);
    expect(unknown.body.error).toBe("invalid_client");
    const badGrant = await handleMuseTokenRequest(
      formRequest("http://localhost:3000/api/muse/oauth/token", { grant_type: "client_credentials" }),
      { store }
    );
    expect(badGrant.status).toBe(400);
    expect(badGrant.body.error).toBe("unsupported_grant_type");
  });

  it("rotates refresh tokens through the endpoint", async () => {
    const store = createMemoryMuseOAuthStore();
    const { client } = await registeredClient(store);
    const first = await issueMuseTokens(store, {
      clientId: client.client_id, userId: USER_ID, workspaceId: WORKSPACE_ID, scopes: ["muse.read"],
    });
    const rotated = await handleMuseTokenRequest(
      formRequest("http://localhost:3000/api/muse/oauth/token", {
        grant_type: "refresh_token",
        client_id: client.client_id,
        refresh_token: first.refresh_token,
      }),
      { store }
    );
    expect(rotated.status).toBe(200);
    expect(rotated.body.refresh_token).not.toBe(first.refresh_token);
  });
});

// ── Revoke endpoint ─────────────────────────────────────────────────────────

describe("revoke endpoint", () => {
  it("revokes an access token and still answers 200 for an unknown token", async () => {
    const store = createMemoryMuseOAuthStore();
    const { client } = await registeredClient(store);
    const tokens = await issueMuseTokens(store, {
      clientId: client.client_id, userId: USER_ID, workspaceId: WORKSPACE_ID, scopes: ["muse.read"],
    });
    const ok = await handleMuseRevokeRequest(
      formRequest("http://localhost:3000/api/muse/oauth/revoke", {
        client_id: client.client_id,
        token: tokens.access_token,
      }),
      { store }
    );
    expect(ok.status).toBe(200);
    expect(await verifyMuseAccessToken(tokens.access_token, { store, mode: "supabase" })).toBeNull();
    // The refresh token still works after only the access token was revoked.
    const stillThere = await rotateRefreshToken(tokens.refresh_token, { store });
    expect(stillThere.ok).toBe(true);

    const unknown = await handleMuseRevokeRequest(
      formRequest("http://localhost:3000/api/muse/oauth/revoke", {
        client_id: client.client_id,
        token: "does-not-exist",
      }),
      { store }
    );
    expect(unknown.status).toBe(200);
  });

  it("revoking a refresh token revokes the whole grant", async () => {
    const store = createMemoryMuseOAuthStore();
    const { client } = await registeredClient(store);
    const tokens = await issueMuseTokens(store, {
      clientId: client.client_id, userId: USER_ID, workspaceId: WORKSPACE_ID, scopes: ["muse.read"],
    });
    const ok = await handleMuseRevokeRequest(
      formRequest("http://localhost:3000/api/muse/oauth/revoke", {
        client_id: client.client_id,
        token: tokens.refresh_token,
      }),
      { store }
    );
    expect(ok.status).toBe(200);
    expect(await verifyMuseAccessToken(tokens.access_token, { store, mode: "supabase" })).toBeNull();
    expect((await rotateRefreshToken(tokens.refresh_token, { store })).ok).toBe(false);
  });
});

// ── Register endpoint (DCR) ─────────────────────────────────────────────────

describe("register endpoint", () => {
  function registerRequest(body: Record<string, unknown>, ip = "203.0.113.1") {
    return new Request("http://localhost:3000/api/muse/oauth/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    });
  }

  it("registers a public client and ignores unknown fields", async () => {
    const store = createMemoryMuseOAuthStore();
    const result = await handleMuseRegisterRequest(
      registerRequest({ client_name: "Muse", redirect_uris: [REDIRECT], client_uri: "https://example.com", logo_uri: "https://example.com/logo.png" }),
      { store, limiter: createDcrRateLimiter() }
    );
    expect(result.status).toBe(201);
    expect(typeof result.body.client_id).toBe("string");
    expect(result.body.client_secret).toBeUndefined();
    expect(result.body.token_endpoint_auth_method).toBe("none");
  });

  it("issues a secret only for an explicitly confidential client", async () => {
    const store = createMemoryMuseOAuthStore();
    const result = await handleMuseRegisterRequest(
      registerRequest({ client_name: "Muse", redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_post" }),
      { store, limiter: createDcrRateLimiter() }
    );
    expect(result.status).toBe(201);
    expect(typeof result.body.client_secret).toBe("string");
  });

  it("rate-limits: burst of 5, then 1 per 6 minutes per IP", async () => {
    const store = createMemoryMuseOAuthStore();
    const limiter = createDcrRateLimiter();
    const t0 = Date.now();
    const results: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await handleMuseRegisterRequest(
        registerRequest({ client_name: `c${i}`, redirect_uris: [REDIRECT] }),
        { store, limiter, now: new Date(t0) }
      );
      results.push(r.status);
    }
    expect(results).toEqual([201, 201, 201, 201, 201, 429]);
    // 6 minutes later one more is allowed, then blocked again.
    const after = await handleMuseRegisterRequest(
      registerRequest({ client_name: "later", redirect_uris: [REDIRECT] }),
      { store, limiter, now: new Date(t0 + 6 * 60 * 1000) }
    );
    expect(after.status).toBe(201);
    const again = await handleMuseRegisterRequest(
      registerRequest({ client_name: "again", redirect_uris: [REDIRECT] }),
      { store, limiter, now: new Date(t0 + 6 * 60 * 1000) }
    );
    expect(again.status).toBe(429);
  });
});

// ── resolveMuseContext ──────────────────────────────────────────────────────

describe("resolveMuseContext", () => {
  it("returns the grant context for a valid Bearer token", async () => {
    const store = createMemoryMuseOAuthStore();
    const { client } = await registeredClient(store);
    const tokens = await issueMuseTokens(store, {
      clientId: client.client_id, userId: USER_ID, workspaceId: WORKSPACE_ID, scopes: ["muse.read"],
    });
    const req = new Request("http://localhost:3000/api/mcp", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    const ctx = await resolveMuseContext(req, { store, mode: "supabase" });
    expect(ctx?.userId).toBe(USER_ID);
    expect(ctx?.workspaceId).toBe(WORKSPACE_ID);
    expect(ctx?.grantId).toBe(`${client.client_id}:${USER_ID}`);
  });

  it("returns null without a Bearer token, and in demo mode", async () => {
    const store = createMemoryMuseOAuthStore();
    const { client } = await registeredClient(store);
    const tokens = await issueMuseTokens(store, {
      clientId: client.client_id, userId: USER_ID, workspaceId: WORKSPACE_ID, scopes: ["muse.read"],
    });
    expect(await resolveMuseContext(new Request("http://localhost:3000/api/mcp"), { store, mode: "supabase" })).toBeNull();
    const req = new Request("http://localhost:3000/api/mcp", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    expect(await resolveMuseContext(req, { store, mode: "demo" })).toBeNull();
  });
});
