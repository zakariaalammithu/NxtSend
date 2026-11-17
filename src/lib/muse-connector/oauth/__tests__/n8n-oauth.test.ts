/**
 * n8n OAuth extension tests.
 *
 * What is being protected: n8n.* scopes (issue / enforce /
 * default, no .send tier), platform detection order (known
 * redirect hosts → scope prefix → resource path → arbitrary
 * https callback host → muse), the n8n redirect rules (any
 * public https host allowed, localhost/private IPs refused in
 * production, exact-match registration still required), PKCE
 * optional for confidential clients ONLY, refresh-token grace
 * for n8n re-presentations (genuine reuse by other platforms
 * still revokes the grant), and resource validation for the n8n
 * resource (valid / wrong / missing, cross-platform rejection
 * both ways). All through the in-memory store seam — no
 * database, no network.
 */

import { describe, it, expect } from "vitest";
import { randomBytes } from "crypto";
import {
  createMemoryMuseOAuthStore,
  registerMuseClient,
  isN8nRedirectUri,
  isPrivateOrLoopbackHost,
  isAllowedOAuthRedirectUri,
  isAllowedRedirectUriForPlatform,
  clientPlatform,
  platformLabel,
  validateAuthorizeRequest,
  issueAuthorizationCode,
  handleMuseTokenRequest,
  verifyMuseAccessToken,
  resolveMuseContext,
  normalizeScopes,
  grantHasTier,
  defaultScopeForPlatform,
  getN8nResourceUrl,
  getZapierResourceUrl,
  resourcePlatform,
  isGraceGrant,
  N8N_SCOPES,
  ALL_OAUTH_SCOPES,
  MUSE_OAUTH_CALLBACK,
  signMuseAuthorizeState,
  verifyMuseAuthorizeState,
  type MuseOAuthStore,
} from "@/lib/muse-connector/oauth";

const ORIGIN = "https://nxtsend.com";
const N8N_RESOURCE = getN8nResourceUrl(ORIGIN);
const ZAPIER_RESOURCE = getZapierResourceUrl(ORIGIN);
const N8N_CLOUD_REDIRECT = "https://my-workspace.app.n8n.cloud/rest/oauth2-credential/callback";
const N8N_SELF_HOSTED_REDIRECT = "https://n8n.example.com/rest/oauth2-credential/callback";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-11-17T00:00:00Z");
const TEST_KEY = randomBytes(32).toString("base64");
const TEST_ENV = { TOKEN_ENCRYPTION_KEY: TEST_KEY };

function formRequest(url: string, params: Record<string, string>): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
}

async function registerN8nClient(store: MuseOAuthStore, confidential = true) {
  const result = await registerMuseClient(
    store,
    {
      name: "n8n",
      redirectUris: [N8N_CLOUD_REDIRECT],
      confidential,
      // The scope hint is what lets registration accept an
      // instance-specific https callback (closed allowlist otherwise).
      scopes: "n8n.read n8n.write",
    },
    NOW
  );
  if (!result.ok) throw new Error(`registration failed: ${result.error}`);
  return result;
}

async function issueN8nTokens(
  store: MuseOAuthStore,
  opts: { confidential?: boolean; withChallenge?: boolean } = {}
): Promise<{ clientId: string; clientSecret: string | null; access: string; refresh: string }> {
  const { client, clientSecret } = await registerN8nClient(store, opts.confidential ?? true);
  const challenge = opts.withChallenge === false ? null : "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
  const code = await issueAuthorizationCode(
    store,
    {
      clientId: client.client_id,
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      scopes: ["n8n.read", "n8n.write"],
      codeChallenge: challenge,
      redirectUri: N8N_CLOUD_REDIRECT,
      resource: N8N_RESOURCE,
    },
    NOW
  );
  const params: Record<string, string> = {
    grant_type: "authorization_code",
    client_id: client.client_id,
    code,
    redirect_uri: N8N_CLOUD_REDIRECT,
    resource: N8N_RESOURCE,
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

// ── Redirect rules ──────────────────────────────────────────────────────────

describe("n8n redirect URIs", () => {
  it("allows any public https callback host (Cloud + self-hosted)", () => {
    expect(isN8nRedirectUri(N8N_CLOUD_REDIRECT)).toBe(true);
    expect(isN8nRedirectUri(N8N_SELF_HOSTED_REDIRECT)).toBe(true);
    expect(isN8nRedirectUri("https://n8n.internal.example:5678/webhook/callback")).toBe(true);
    // The PLATFORM check accepts them — but the GLOBAL allowlist
    // stays closed: an arbitrary https host is only an n8n
    // callback once the client declares n8n scopes.
    expect(isAllowedRedirectUriForPlatform(N8N_CLOUD_REDIRECT, "n8n")).toBe(true);
    expect(isAllowedRedirectUriForPlatform(N8N_SELF_HOSTED_REDIRECT, "n8n")).toBe(true);
    expect(isAllowedOAuthRedirectUri(N8N_CLOUD_REDIRECT)).toBe(false);
    expect(isAllowedOAuthRedirectUri(N8N_SELF_HOSTED_REDIRECT)).toBe(false);
  });

  it("refuses localhost / private IPs and non-https callbacks", () => {
    expect(isPrivateOrLoopbackHost("localhost")).toBe(true);
    expect(isPrivateOrLoopbackHost("127.0.0.1")).toBe(true);
    expect(isPrivateOrLoopbackHost("192.168.1.10")).toBe(true);
    expect(isPrivateOrLoopbackHost("10.0.0.5")).toBe(true);
    expect(isPrivateOrLoopbackHost("172.16.0.1")).toBe(true);
    expect(isPrivateOrLoopbackHost("8.8.8.8")).toBe(false);
    expect(isN8nRedirectUri("https://localhost:5678/rest/oauth2-credential/callback")).toBe(false);
    expect(isN8nRedirectUri("https://192.168.1.10/rest/oauth2-credential/callback")).toBe(false);
    expect(isN8nRedirectUri("https://10.0.0.5/rest/oauth2-credential/callback")).toBe(false);
    expect(isN8nRedirectUri("http://n8n.example.com/rest/oauth2-credential/callback")).toBe(false);
    expect(isN8nRedirectUri("https://n8n.example.com/cb?x=1")).toBe(false);
    expect(isN8nRedirectUri("not a url")).toBe(false);
    // Known platforms' callbacks are never n8n callbacks.
    expect(isN8nRedirectUri("https://zapier.com/dashboard/auth/oauth/return/App123CLIAPI/")).toBe(false);
    expect(isN8nRedirectUri("https://chatgpt.com/connector_platform_oauth_redirect")).toBe(false);
  });

  it("allows http loopback only on a local deployment", () => {
    const prod = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
    const local = { NODE_ENV: "development" } as NodeJS.ProcessEnv;
    expect(isN8nRedirectUri("http://localhost:5678/rest/oauth2-credential/callback", local)).toBe(true);
    expect(isN8nRedirectUri("http://localhost:5678/rest/oauth2-credential/callback", prod)).toBe(false);
    expect(isAllowedRedirectUriForPlatform("http://localhost:5678/cb", "n8n")).toBe(true);
  });

  it("binds the n8n redirect to the n8n platform only", async () => {
    const store = createMemoryMuseOAuthStore();
    const { client } = await registerN8nClient(store);
    expect(clientPlatform(client)).toBe("n8n");
    expect(platformLabel("n8n")).toBe("n8n");
    expect(isAllowedRedirectUriForPlatform(N8N_CLOUD_REDIRECT, "n8n")).toBe(true);
    expect(isAllowedRedirectUriForPlatform(N8N_CLOUD_REDIRECT, "muse")).toBe(false);
    expect(isAllowedRedirectUriForPlatform(N8N_CLOUD_REDIRECT, "zapier")).toBe(false);
    expect(isAllowedRedirectUriForPlatform(MUSE_OAUTH_CALLBACK, "n8n")).toBe(false);
    // Exact-match registration is still required: an unregistered
    // n8n URL is allowlisted in shape but not usable.
    expect(isAllowedRedirectUriForPlatform(N8N_SELF_HOSTED_REDIRECT, "n8n")).toBe(true);
    const validation = validateAuthorizeRequest(
      {
        client_id: client.client_id,
        redirect_uri: N8N_SELF_HOSTED_REDIRECT,
        response_type: "code",
        scope: "n8n.read",
        resource: N8N_RESOURCE,
      },
      client,
      { origin: ORIGIN }
    );
    expect(validation.ok).toBe(false);
  });
});

// ── Platform detection order ────────────────────────────────────────────────

describe("clientPlatform detection order", () => {
  it("detects n8n from the requested scope prefix", () => {
    const client = { redirect_uris: ["http://localhost:5678/cb"] };
    expect(clientPlatform(client, { scopes: ["n8n.read"] })).toBe("n8n");
    expect(clientPlatform(client, { scopes: ["zapier.read"] })).toBe("zapier");
    expect(clientPlatform(client, { scopes: ["muse.read"] })).toBe("muse");
  });

  it("detects n8n from the presented resource path", () => {
    const client = { redirect_uris: ["http://localhost:5678/cb"] };
    expect(clientPlatform(client, { resource: N8N_RESOURCE })).toBe("n8n");
    expect(clientPlatform(client, { resource: ZAPIER_RESOURCE })).toBe("zapier");
  });

  it("detects n8n from an arbitrary https callback host, but not from loopback", () => {
    expect(clientPlatform({ redirect_uris: [N8N_SELF_HOSTED_REDIRECT] })).toBe("n8n");
    // Loopback-only clients stay Muse (local-test callbacks for
    // any platform are not an n8n signal).
    expect(clientPlatform({ redirect_uris: ["http://localhost:3000/cb"] })).toBe("muse");
  });

  it("known redirect hosts win over scope hints", () => {
    const zapierClient = {
      redirect_uris: ["https://zapier.com/dashboard/auth/oauth/return/App1234567CLIAPI/"],
    };
    expect(clientPlatform(zapierClient, { scopes: ["n8n.read"] })).toBe("zapier");
  });
});

// ── Scopes ──────────────────────────────────────────────────────────────────

describe("n8n.* scopes", () => {
  it("registers n8n.read + n8n.write only (no .send tier)", () => {
    expect([...N8N_SCOPES]).toEqual(["n8n.read", "n8n.write"]);
    expect((ALL_OAUTH_SCOPES as readonly string[]).includes("n8n.send")).toBe(false);
    expect(normalizeScopes("n8n.read n8n.write")).toEqual(["n8n.read", "n8n.write"]);
    expect(normalizeScopes("n8n.send")).toBeNull();
  });

  it("enforces tiers through grantHasTier and defaults to n8n.read", () => {
    expect(grantHasTier(["n8n.read"], "read")).toBe(true);
    expect(grantHasTier(["n8n.read"], "write")).toBe(false);
    expect(grantHasTier(["n8n.write"], "write")).toBe(true);
    expect(grantHasTier(["n8n.write"], "send")).toBe(false);
    expect(defaultScopeForPlatform("n8n")).toBe("n8n.read");
  });

  it("classifies n8n grants as grace grants (and Muse grants as not)", () => {
    expect(isGraceGrant(["n8n.read"], null)).toBe(true);
    expect(isGraceGrant([], N8N_RESOURCE)).toBe(true);
    expect(isGraceGrant(["zapier.read"], null)).toBe(true);
    expect(isGraceGrant(["muse.read"], null)).toBe(false);
    expect(isGraceGrant([], "https://nxtsend.com/api/mcp")).toBe(false);
  });
});

// ── Resource ────────────────────────────────────────────────────────────────

describe("n8n resource", () => {
  it("resolves the n8n resource URL and platform", () => {
    expect(N8N_RESOURCE).toBe("https://nxtsend.com/api/integrations/n8n");
    expect(resourcePlatform(N8N_RESOURCE)).toBe("n8n");
    expect(resourcePlatform(ZAPIER_RESOURCE)).toBe("zapier");
    expect(resourcePlatform("https://nxtsend.com/api/integrations/n8n/v1/leads")).toBeNull();
  });

  it("authorizes with resource=/api/integrations/n8n + scopes n8n.read", async () => {
    const store = createMemoryMuseOAuthStore();
    const { client } = await registerN8nClient(store);
    const result = validateAuthorizeRequest(
      {
        client_id: client.client_id,
        redirect_uri: N8N_CLOUD_REDIRECT,
        response_type: "code",
        scope: "n8n.read",
        resource: N8N_RESOURCE,
      },
      client,
      { origin: ORIGIN }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.platform).toBe("n8n");
      expect(result.request.resource).toBe(N8N_RESOURCE);
    }
  });

  it("defaults to the n8n resource when none is presented", async () => {
    const store = createMemoryMuseOAuthStore();
    const { client } = await registerN8nClient(store);
    const result = validateAuthorizeRequest(
      {
        client_id: client.client_id,
        redirect_uri: N8N_CLOUD_REDIRECT,
        response_type: "code",
        scope: "n8n.read",
      },
      client,
      { origin: ORIGIN }
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.request.resource).toBe(N8N_RESOURCE);
  });

  it("refuses an n8n client asking for the Zapier resource at authorize time", async () => {
    const store = createMemoryMuseOAuthStore();
    const { client } = await registerN8nClient(store);
    const wrong = validateAuthorizeRequest(
      {
        client_id: client.client_id,
        redirect_uri: N8N_CLOUD_REDIRECT,
        response_type: "code",
        scope: "n8n.read",
        resource: ZAPIER_RESOURCE,
      },
      client,
      { origin: ORIGIN }
    );
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error).toBe("invalid_target");
  });

  it("verifies an n8n token only for the n8n resource (cross-platform rejection both ways)", async () => {
    const store = createMemoryMuseOAuthStore();
    const { access } = await issueN8nTokens(store);
    const req = (url: string) =>
      new Request(url, { headers: { authorization: `Bearer ${access}` } });
    const n8nCtx = await resolveMuseContext(req(`${ORIGIN}/api/integrations/n8n/v1/leads`), {
      store,
      mode: "supabase",
      now: NOW,
      resource: N8N_RESOURCE,
    });
    expect(n8nCtx?.workspaceId).toBe(WORKSPACE_ID);
    const zapierCtx = await resolveMuseContext(req(`${ORIGIN}/api/integrations/zapier/v1/leads`), {
      store,
      mode: "supabase",
      now: NOW,
      resource: ZAPIER_RESOURCE,
    });
    expect(zapierCtx).toBeNull();
    const direct = await verifyMuseAccessToken(access, {
      store,
      mode: "supabase",
      now: NOW,
      resource: N8N_RESOURCE,
    });
    expect(direct?.scopes).toEqual(["n8n.read", "n8n.write"]);
    const directWrong = await verifyMuseAccessToken(access, {
      store,
      mode: "supabase",
      now: NOW,
      resource: ZAPIER_RESOURCE,
    });
    expect(directWrong).toBeNull();
  });

  it("binds the token at exchange time: a code issued for n8n rejects the Zapier resource", async () => {
    const store = createMemoryMuseOAuthStore();
    const { client, clientSecret } = await registerN8nClient(store);
    const code = await issueAuthorizationCode(
      store,
      {
        clientId: client.client_id,
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        scopes: ["n8n.read"],
        codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
        redirectUri: N8N_CLOUD_REDIRECT,
        resource: N8N_RESOURCE,
      },
      NOW
    );
    const params: Record<string, string> = {
      grant_type: "authorization_code",
      client_id: client.client_id,
      code,
      redirect_uri: N8N_CLOUD_REDIRECT,
      resource: ZAPIER_RESOURCE,
      code_verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
    };
    if (clientSecret) params.client_secret = clientSecret;
    const res = await handleMuseTokenRequest(
      formRequest("http://localhost:3000/api/muse/oauth/token", params),
      { store, now: NOW }
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_target");
  });
});

// ── DCR register ────────────────────────────────────────────────────────────

describe("DCR register with n8n scopes", () => {
  it("registers a client with an n8n callback and authorizes it as n8n", async () => {
    const store = createMemoryMuseOAuthStore();
    const result = await registerMuseClient(
      store,
      {
        name: "n8n",
        redirectUris: [N8N_SELF_HOSTED_REDIRECT],
        confidential: true,
        scopes: "n8n.read n8n.write",
      },
      NOW
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(clientPlatform(result.client)).toBe("n8n");
    const validation = validateAuthorizeRequest(
      {
        client_id: result.client.client_id,
        redirect_uri: N8N_SELF_HOSTED_REDIRECT,
        response_type: "code",
        scope: "n8n.read n8n.write",
        resource: N8N_RESOURCE,
      },
      result.client,
      { origin: ORIGIN }
    );
    expect(validation.ok).toBe(true);
    if (validation.ok) expect(validation.request.platform).toBe("n8n");
  });

  it("refuses to register a private-IP n8n callback", async () => {
    const store = createMemoryMuseOAuthStore();
    const result = await registerMuseClient(
      store,
      {
        name: "n8n",
        redirectUris: ["https://192.168.1.10/rest/oauth2-credential/callback"],
        confidential: true,
        scopes: "n8n.read n8n.write",
      },
      NOW
    );
    expect(result.ok).toBe(false);
  });

  it("refuses an arbitrary https callback when no n8n scope is declared", async () => {
    // Closed by default: the redirect host alone must never make a
    // client an n8n client — only a declared n8n.* scope (or n8n
    // resource) opens the instance-specific callback rule. This is
    // what keeps https://evil.example/x unregistrable.
    const store = createMemoryMuseOAuthStore();
    const result = await registerMuseClient(
      store,
      {
        name: "n8n",
        redirectUris: [N8N_SELF_HOSTED_REDIRECT],
        confidential: true,
      },
      NOW
    );
    expect(result.ok).toBe(false);
  });
});

// ── PKCE optional for confidential clients ──────────────────────────────────

describe("PKCE optional for confidential n8n clients", () => {
  it("authorizes a confidential n8n client with no code_challenge", async () => {
    const store = createMemoryMuseOAuthStore();
    const { client } = await registerN8nClient(store, true);
    const result = validateAuthorizeRequest(
      {
        client_id: client.client_id,
        redirect_uri: N8N_CLOUD_REDIRECT,
        response_type: "code",
        scope: "n8n.read",
        resource: N8N_RESOURCE,
      },
      client,
      { origin: ORIGIN }
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.request.codeChallenge).toBeNull();
  });

  it("still refuses a public client with no code_challenge", async () => {
    const store = createMemoryMuseOAuthStore();
    const { client } = await registerN8nClient(store, false);
    const result = validateAuthorizeRequest(
      {
        client_id: client.client_id,
        redirect_uri: N8N_CLOUD_REDIRECT,
        response_type: "code",
        scope: "n8n.read",
        resource: N8N_RESOURCE,
      },
      client,
      { origin: ORIGIN }
    );
    expect(result.ok).toBe(false);
  });

  it("exchanges a challengeless code on client_secret alone", async () => {
    const store = createMemoryMuseOAuthStore();
    const { access, refresh } = await issueN8nTokens(store, { withChallenge: false });
    expect(typeof access).toBe("string");
    expect(typeof refresh).toBe("string");
  });
});

// ── Refresh grace ───────────────────────────────────────────────────────────

describe("refresh-token grace for n8n", () => {
  it("lets n8n re-present an already-rotated refresh token inside the window", async () => {
    const store = createMemoryMuseOAuthStore();
    const { clientId, clientSecret, refresh } = await issueN8nTokens(store);
    const first = await refreshGrant(store, clientId, clientSecret, refresh, new Date(NOW.getTime() + 60_000));
    expect(first.status).toBe(200);
    // n8n re-presents the OLD token 5 minutes after the rotation.
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

  it("still revokes on an n8n re-presentation outside the window", async () => {
    const store = createMemoryMuseOAuthStore();
    const { clientId, clientSecret, refresh } = await issueN8nTokens(store);
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
        codeChallenge: null,
        redirectUri: MUSE_OAUTH_CALLBACK,
        resource: "https://nxtsend.com/api/mcp",
      },
      NOW
    );
    const exchange = await handleMuseTokenRequest(
      formRequest("http://localhost:3000/api/muse/oauth/token", {
        grant_type: "authorization_code",
        client_id: reg.client.client_id,
        client_secret: reg.clientSecret ?? "",
        code,
        redirect_uri: MUSE_OAUTH_CALLBACK,
        resource: "https://nxtsend.com/api/mcp",
      }),
      { store, now: NOW }
    );
    expect(exchange.status).toBe(200);
    const refresh = (exchange.body as { refresh_token: string }).refresh_token;
    const first = await refreshGrant(
      store,
      reg.client.client_id,
      reg.clientSecret,
      refresh,
      new Date(NOW.getTime() + 60_000)
    );
    expect(first.status).toBe(200);
    const replay = await refreshGrant(
      store,
      reg.client.client_id,
      reg.clientSecret,
      refresh,
      new Date(NOW.getTime() + 6 * 60_000)
    );
    expect(replay.status).toBe(400);
  });
});

// ── Authorize state round-trip ──────────────────────────────────────────────

describe("authorize state with platform n8n", () => {
  it("round-trips the n8n platform through the signed state", () => {
    const signed = signMuseAuthorizeState(
      {
        clientId: "muse_abc",
        redirectUri: N8N_CLOUD_REDIRECT,
        scopes: ["n8n.read"],
        codeChallenge: null,
        clientState: "xyz",
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        resource: N8N_RESOURCE,
        platform: "n8n",
        clientOrigin: null,
      },
      TEST_ENV,
      NOW
    );
    expect(signed).not.toBeNull();
    const claims = verifyMuseAuthorizeState(
      signed as string,
      { userId: USER_ID, workspaceId: WORKSPACE_ID },
      TEST_ENV,
      NOW
    );
    expect(claims?.platform).toBe("n8n");
    expect(claims?.resource).toBe(N8N_RESOURCE);
  });
});
