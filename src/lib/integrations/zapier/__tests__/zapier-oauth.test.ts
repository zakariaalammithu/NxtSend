/**
 * Zapier OAuth extension tests.
 *
 * What is being protected: the Zapier redirect pattern (host +
 * App-ID path, wrong host/path/App-ID refused), PKCE optional for
 * confidential clients ONLY (public clients still refused without
 * a challenge; a stored challenge must still be satisfied),
 * refresh-token grace for Zapier re-presentations (genuine reuse
 * by other platforms still revokes the grant), zapier.* scopes
 * (issue / enforce / default), and resource validation for the
 * Zapier resource (valid / wrong / missing). All through the
 * in-memory store seam — no database, no network.
 */

import { describe, it, expect } from "vitest";
import {
  createMemoryMuseOAuthStore,
  registerMuseClient,
  isZapierRedirectUri,
  isAllowedOAuthRedirectUri,
  isAllowedRedirectUriForPlatform,
  clientPlatform,
  platformLabel,
  validateAuthorizeRequest,
  issueAuthorizationCode,
  handleMuseTokenRequest,
  rotateRefreshToken,
  verifyMuseAccessToken,
  resolveMuseContext,
  normalizeScopes,
  grantHasTier,
  defaultScopeForPlatform,
  getZapierResourceUrl,
  resourcePlatform,
  ZAPIER_SCOPES,
  ALL_OAUTH_SCOPES,
  MUSE_OAUTH_CALLBACK,
  type MuseOAuthStore,
} from "@/lib/muse-connector/oauth";

const ORIGIN = "https://nxtsend.com";
const ZAPIER_RESOURCE = getZapierResourceUrl(ORIGIN);
const ZAPIER_REDIRECT = "https://zapier.com/dashboard/auth/oauth/return/App1234567CLIAPI/";
const ZAPIER_REDIRECT_NO_SLASH = "https://zapier.com/dashboard/auth/oauth/return/App1234567CLIAPI";
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

async function registerZapierClient(store: MuseOAuthStore, confidential = true) {
  const result = await registerMuseClient(
    store,
    { name: "Zapier", redirectUris: [ZAPIER_REDIRECT], confidential },
    NOW
  );
  if (!result.ok) throw new Error(`registration failed: ${result.error}`);
  return result;
}

async function issueZapierTokens(
  store: MuseOAuthStore,
  opts: { confidential?: boolean; withChallenge?: boolean } = {}
): Promise<{ clientId: string; clientSecret: string | null; access: string; refresh: string }> {
  const { client, clientSecret } = await registerZapierClient(store, opts.confidential ?? true);
  const challenge = opts.withChallenge === false ? null : "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
  const code = await issueAuthorizationCode(
    store,
    {
      clientId: client.client_id,
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      scopes: ["zapier.read", "zapier.write"],
      codeChallenge: challenge,
      redirectUri: ZAPIER_REDIRECT,
      resource: ZAPIER_RESOURCE,
    },
    NOW
  );
  const params: Record<string, string> = {
    grant_type: "authorization_code",
    client_id: client.client_id,
    code,
    redirect_uri: ZAPIER_REDIRECT,
    resource: ZAPIER_RESOURCE,
  };
  if (clientSecret) params.client_secret = clientSecret;
  if (challenge) {
    params.code_verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  }
  const res = await handleMuseTokenRequest(
    formRequest("http://localhost:3000/api/muse/oauth/token", params),
    { store, now: NOW }
  );
  if (res.status !== 200) {
    throw new Error(`token exchange failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const body = res.body as { access_token: string; refresh_token: string };
  return { clientId: client.client_id, clientSecret, access: body.access_token, refresh: body.refresh_token };
}

async function refreshGrant(
  store: MuseOAuthStore,
  clientId: string,
  clientSecret: string | null,
  refreshToken: string,
  now: Date
) {
  const params: Record<string, string> = {
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: refreshToken,
  };
  if (clientSecret) params.client_secret = clientSecret;
  return handleMuseTokenRequest(
    formRequest("http://localhost:3000/api/muse/oauth/token", params),
    { store, now }
  );
}

// ── Redirect pattern ────────────────────────────────────────────────────────

describe("Zapier redirect URIs", () => {
  it("allows the Zapier return URL with and without trailing slash", () => {
    expect(isZapierRedirectUri(ZAPIER_REDIRECT)).toBe(true);
    expect(isZapierRedirectUri(ZAPIER_REDIRECT_NO_SLASH)).toBe(true);
    expect(isZapierRedirectUri("https://zapier.com/dashboard/auth/oauth/return/App99CLIAPI/")).toBe(true);
    expect(isAllowedOAuthRedirectUri(ZAPIER_REDIRECT)).toBe(true);
  });

  it("refuses wrong hosts, wrong paths and malformed App IDs", () => {
    expect(isZapierRedirectUri("https://evilzapier.com/dashboard/auth/oauth/return/App123CLIAPI/")).toBe(false);
    expect(isZapierRedirectUri("https://hooks.zapier.com/dashboard/auth/oauth/return/App123CLIAPI/")).toBe(false);
    expect(isZapierRedirectUri("https://zapier.com/dashboard/auth/oauth/return/AppCLIAPI/")).toBe(false);
    expect(isZapierRedirectUri("https://zapier.com/dashboard/auth/oauth/return/123CLIAPI/")).toBe(false);
    expect(isZapierRedirectUri("https://zapier.com/dashboard/auth/oauth/return/App123CLIAPI/extra")).toBe(false);
    expect(isZapierRedirectUri("http://zapier.com/dashboard/auth/oauth/return/App123CLIAPI/")).toBe(false);
    expect(isZapierRedirectUri("https://zapier.com/dashboard/auth/oauth/return/App123CLIAPI/?x=1")).toBe(false);
    expect(isZapierRedirectUri("not a url")).toBe(false);
  });

  it("binds the Zapier redirect to the zapier platform only", async () => {
    const store = createMemoryMuseOAuthStore();
    const { client } = await registerZapierClient(store);
    expect(clientPlatform(client)).toBe("zapier");
    expect(platformLabel("zapier")).toBe("Zapier");
    expect(isAllowedRedirectUriForPlatform(ZAPIER_REDIRECT, "zapier")).toBe(true);
    expect(isAllowedRedirectUriForPlatform(ZAPIER_REDIRECT, "muse")).toBe(false);
    expect(isAllowedRedirectUriForPlatform(MUSE_OAUTH_CALLBACK, "zapier")).toBe(false);
    expect(isAllowedRedirectUriForPlatform("http://localhost:3000/cb", "zapier")).toBe(true);
  });
});

// ── Scopes ──────────────────────────────────────────────────────────────────

describe("zapier.* scopes", () => {
  it("registers zapier.read + zapier.write only (no .send tier)", () => {
    expect([...ZAPIER_SCOPES]).toEqual(["zapier.read", "zapier.write"]);
    expect((ALL_OAUTH_SCOPES as readonly string[]).includes("zapier.send")).toBe(false);
    expect(normalizeScopes("zapier.read zapier.write")).toEqual(["zapier.read", "zapier.write"]);
    expect(normalizeScopes("zapier.send")).toBeNull();
  });

  it("enforces tiers through grantHasTier and defaults to zapier.read", () => {
    expect(grantHasTier(["zapier.read"], "read")).toBe(true);
    expect(grantHasTier(["zapier.read"], "write")).toBe(false);
    expect(grantHasTier(["zapier.write"], "write")).toBe(true);
    expect(grantHasTier(["zapier.write"], "send")).toBe(false);
    expect(defaultScopeForPlatform("zapier")).toBe("zapier.read");
  });
});

// ── Resource ────────────────────────────────────────────────────────────────

describe("Zapier resource", () => {
  it("resolves the Zapier resource URL and platform", () => {
    expect(ZAPIER_RESOURCE).toBe("https://nxtsend.com/api/integrations/zapier");
    expect(resourcePlatform(ZAPIER_RESOURCE)).toBe("zapier");
    expect(resourcePlatform("https://nxtsend.com/api/mcp")).toBe("muse");
    expect(resourcePlatform("https://nxtsend.com/api/integrations/zapier/v1/leads")).toBeNull();
  });

  it("refuses a Zapier client asking for the Muse resource at authorize time", async () => {
    const store = createMemoryMuseOAuthStore();
    const { client } = await registerZapierClient(store);
    const base = {
      client_id: client.client_id,
      redirect_uri: ZAPIER_REDIRECT,
      response_type: "code",
      scope: "zapier.read",
      resource: "https://nxtsend.com/api/mcp",
    };
    const wrong = validateAuthorizeRequest(base, client, { origin: ORIGIN });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error).toBe("invalid_target");
    const right = validateAuthorizeRequest({ ...base, resource: ZAPIER_RESOURCE }, client, {
      origin: ORIGIN,
    });
    expect(right.ok).toBe(true);
  });

  it("verifies a Zapier token only for the Zapier resource", async () => {
    const store = createMemoryMuseOAuthStore();
    const { access } = await issueZapierTokens(store);
    const req = (url: string) =>
      new Request(url, { headers: { authorization: `Bearer ${access}` } });
    const zapierCtx = await resolveMuseContext(req(`${ORIGIN}/api/integrations/zapier/v1/leads`), {
      store,
      mode: "supabase",
      resource: ZAPIER_RESOURCE,
    });
    expect(zapierCtx?.workspaceId).toBe(WORKSPACE_ID);
    const museCtx = await resolveMuseContext(req(`${ORIGIN}/api/mcp`), {
      store,
      mode: "supabase",
      resource: `${ORIGIN}/api/mcp`,
    });
    expect(museCtx).toBeNull();
    const direct = await verifyMuseAccessToken(access, {
      store,
      mode: "supabase",
      resource: ZAPIER_RESOURCE,
    });
    expect(direct?.scopes).toEqual(["zapier.read", "zapier.write"]);
  });
});

// ── PKCE optional for confidential clients ──────────────────────────────────

describe("PKCE optional for confidential clients", () => {
  it("authorizes a confidential Zapier client with no code_challenge", async () => {
    const store = createMemoryMuseOAuthStore();
    const { client } = await registerZapierClient(store, true);
    const result = validateAuthorizeRequest(
      {
        client_id: client.client_id,
        redirect_uri: ZAPIER_REDIRECT,
        response_type: "code",
        scope: "zapier.read",
        resource: ZAPIER_RESOURCE,
      },
      client,
      { origin: ORIGIN }
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.request.codeChallenge).toBeNull();
  });

  it("still refuses a public client with no code_challenge", async () => {
    const store = createMemoryMuseOAuthStore();
    const { client } = await registerZapierClient(store, false);
    const result = validateAuthorizeRequest(
      {
        client_id: client.client_id,
        redirect_uri: ZAPIER_REDIRECT,
        response_type: "code",
        scope: "zapier.read",
        resource: ZAPIER_RESOURCE,
      },
      client,
      { origin: ORIGIN }
    );
    expect(result.ok).toBe(false);
  });

  it("exchanges a challengeless code on client_secret alone", async () => {
    const store = createMemoryMuseOAuthStore();
    const { access, refresh } = await issueZapierTokens(store, { withChallenge: false });
    expect(typeof access).toBe("string");
    expect(typeof refresh).toBe("string");
  });

  it("still requires the verifier when a challenge WAS stored", async () => {
    const store = createMemoryMuseOAuthStore();
    const { client, clientSecret } = await registerZapierClient(store, true);
    const code = await issueAuthorizationCode(
      store,
      {
        clientId: client.client_id,
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        scopes: ["zapier.read"],
        codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
        redirectUri: ZAPIER_REDIRECT,
        resource: ZAPIER_RESOURCE,
      },
      NOW
    );
    const params: Record<string, string> = {
      grant_type: "authorization_code",
      client_id: client.client_id,
      code,
      redirect_uri: ZAPIER_REDIRECT,
    };
    if (clientSecret) params.client_secret = clientSecret;
    // No verifier at all → refused.
    const noVerifier = await handleMuseTokenRequest(
      formRequest("http://localhost:3000/api/muse/oauth/token", params),
      { store, now: NOW }
    );
    expect(noVerifier.status).toBe(400);
    // Wrong verifier → refused.
    const wrong = await handleMuseTokenRequest(
      formRequest("http://localhost:3000/api/muse/oauth/token", {
        ...params,
        code_verifier: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      }),
      { store, now: NOW }
    );
    expect(wrong.status).toBe(400);
  });

  it("refuses a challengeless exchange when the client secret is wrong", async () => {
    const store = createMemoryMuseOAuthStore();
    const { client } = await registerZapierClient(store, true);
    const code = await issueAuthorizationCode(
      store,
      {
        clientId: client.client_id,
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        scopes: ["zapier.read"],
        codeChallenge: null,
        redirectUri: ZAPIER_REDIRECT,
        resource: ZAPIER_RESOURCE,
      },
      NOW
    );
    const res = await handleMuseTokenRequest(
      formRequest("http://localhost:3000/api/muse/oauth/token", {
        grant_type: "authorization_code",
        client_id: client.client_id,
        code,
        redirect_uri: ZAPIER_REDIRECT,
        client_secret: "wrong-secret",
      }),
      { store, now: NOW }
    );
    expect(res.status).toBe(401);
  });
});

// ── Refresh grace ───────────────────────────────────────────────────────────

describe("refresh-token grace for Zapier", () => {
  it("lets Zapier re-present an already-rotated refresh token inside the window", async () => {
    const store = createMemoryMuseOAuthStore();
    const { clientId, clientSecret, refresh } = await issueZapierTokens(store);
    const first = await refreshGrant(store, clientId, clientSecret, refresh, new Date(NOW.getTime() + 60_000));
    expect(first.status).toBe(200);
    // Zapier re-presents the OLD token 5 minutes after the rotation.
    const replay = await refreshGrant(
      store,
      clientId,
      clientSecret,
      refresh,
      new Date(NOW.getTime() + 6 * 60_000)
    );
    expect(replay.status).toBe(200);
    // And the grant still works: the newest refresh token rotates normally.
    const newest = (replay.body as { refresh_token: string }).refresh_token;
    const third = await refreshGrant(store, clientId, clientSecret, newest, new Date(NOW.getTime() + 7 * 60_000));
    expect(third.status).toBe(200);
  });

  it("still revokes on a Zapier re-presentation outside the window", async () => {
    const store = createMemoryMuseOAuthStore();
    const { clientId, clientSecret, refresh } = await issueZapierTokens(store);
    const first = await refreshGrant(store, clientId, clientSecret, refresh, new Date(NOW.getTime() + 60_000));
    expect(first.status).toBe(200);
    const late = await refreshGrant(
      store,
      clientId,
      clientSecret,
      refresh,
      new Date(NOW.getTime() + 12 * 60_000)
    );
    expect(late.status).toBe(400);
    // The grant is revoked: even the current token no longer works.
    const newest = (first.body as { refresh_token: string }).refresh_token;
    const after = await refreshGrant(store, clientId, clientSecret, newest, new Date(NOW.getTime() + 13 * 60_000));
    expect(after.status).toBe(400);
  });

  it("still revokes a Muse grant on genuine refresh reuse (no grace)", async () => {
    const store = createMemoryMuseOAuthStore();
    const reg = await registerMuseClient(
      store,
      { name: "Muse", redirectUris: [MUSE_OAUTH_CALLBACK], confidential: true },
      NOW
    );
    if (!reg.ok) throw new Error("registration failed");
    const code = await issueAuthorizationCode(
      store,
      {
        clientId: reg.client.client_id,
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        scopes: ["muse.read"],
        codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
        redirectUri: MUSE_OAUTH_CALLBACK,
        resource: `${ORIGIN}/api/mcp`,
      },
      NOW
    );
    const exchanged = await handleMuseTokenRequest(
      formRequest("http://localhost:3000/api/muse/oauth/token", {
        grant_type: "authorization_code",
        client_id: reg.client.client_id,
        client_secret: reg.clientSecret ?? "",
        code,
        redirect_uri: MUSE_OAUTH_CALLBACK,
        code_verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      }),
      { store, now: NOW }
    );
    expect(exchanged.status).toBe(200);
    const refreshToken = (exchanged.body as { refresh_token: string }).refresh_token;
    const first = await rotateRefreshToken(refreshToken, {
      store,
      now: new Date(NOW.getTime() + 60_000),
    });
    expect(first.ok).toBe(true);
    // Re-presenting the rotated token 1 minute later revokes the Muse grant.
    const replay = await rotateRefreshToken(refreshToken, {
      store,
      now: new Date(NOW.getTime() + 2 * 60_000),
    });
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.grantRevoked).toBe(true);
  });
});
