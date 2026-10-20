import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeAdmin, FakeDb } from "./fake-admin";
import { createSupabaseOAuthStore } from "../store";
import { signOAuthState } from "../state";
import { decryptToken } from "../crypto";
import {
  handleOAuthCallback,
  disconnectOAuthConnection,
  verifyOAuthConnection,
  OAuthFlowError,
  type OAuthServiceDeps,
} from "../service";

/**
 * OAuth service tests — mocked provider HTTP (no real Google /
 * Microsoft calls), the REAL Supabase store over an in-memory fake
 * admin client, so assertions inspect what was actually persisted:
 * success stores ENCRYPTED tokens (ciphertext ≠ plaintext, decrypts
 * back); any failure stores nothing.
 */

const KEY = Buffer.alloc(32, 0x33).toString("base64");
const ENV = {
  GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "GOCSPX-secret",
  MICROSOFT_CLIENT_ID: "ms-client-id",
  MICROSOFT_CLIENT_SECRET: "ms-secret",
  TOKEN_ENCRYPTION_KEY: KEY,
  NEXT_PUBLIC_APP_URL: "https://app.nxtsend.example",
  NODE_ENV: "test",
};
const WS = "ws_1";
const USER = "user_1";
const NOW = new Date("2026-10-20T01:00:00.000Z");

// The store encrypts with the ambient process env (the same source of
// truth as production); the service deps env covers state/config.
const PREV_KEY = process.env.TOKEN_ENCRYPTION_KEY;
beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = KEY;
});
afterAll(() => {
  if (PREV_KEY === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
  else process.env.TOKEN_ENCRYPTION_KEY = PREV_KEY;
});

function makeFetch(routes: Array<[string, unknown, number?]>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    for (const [needle, body, status] of routes) {
      if (u.includes(needle)) {
        return {
          ok: (status ?? 200) < 400,
          status: status ?? 200,
          json: async () => body,
          text: async () => JSON.stringify(body),
        } as unknown as Response;
      }
    }
    throw new Error(`unexpected fetch: ${u}`);
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

function setup(routes: Array<[string, unknown, number?]>) {
  const db = new FakeDb();
  const admin = new FakeAdmin(db);
  const { impl, calls } = makeFetch(routes);
  const deps: OAuthServiceDeps = {
    admin: admin as unknown as SupabaseClient,
    env: ENV,
    fetchFn: impl,
    now: () => NOW,
  };
  return { db, deps, calls };
}

function stateFor(provider: "google" | "microsoft", workspaceId = WS) {
  return signOAuthState(
    { provider, workspaceId, userId: USER },
    ENV,
    NOW
  ) as string;
}

const GOOGLE_ROUTES: Array<[string, unknown, number?]> = [
  ["oauth2.googleapis.com/token", {
    access_token: "ya29.access-token-1",
    refresh_token: "1//refresh-token-1",
    expires_in: 3599,
    scope: "openid email profile https://www.googleapis.com/auth/gmail.send",
  }],
  ["openidconnect.googleapis.com/v1/userinfo", {
    sub: "google-sub-42",
    email: "owner@gmail.com",
    name: "Olivia Owner",
  }],
  ["gmail/v1/users/me/profile", { emailAddress: "owner@gmail.com", messagesTotal: 12 }],
  ["oauth2.googleapis.com/revoke", {}],
];

const MS_ROUTES: Array<[string, unknown, number?]> = [
  ["login.microsoftonline.com/common/oauth2/v2.0/token", {
    access_token: "ms-access-token",
    refresh_token: "ms-refresh-token",
    expires_in: 3600,
    scope: "openid profile User.Read Mail.Send Mail.Read",
  }],
  ["graph.microsoft.com/v1.0/me", {
    id: "ms-user-7",
    mail: null,
    userPrincipalName: "owner@contoso.com",
    displayName: "Olivia Owner",
  }],
];

describe("Google callback", () => {
  it("stores ENCRYPTED tokens + the connected account on success", async () => {
    const { db, deps } = setup(GOOGLE_ROUTES);
    const result = await handleOAuthCallback(
      "google",
      { code: "4/0auth-code", stateToken: stateFor("google"), userId: USER, workspaceId: WS },
      deps
    );
    expect(result.email).toBe("owner@gmail.com");

    const conns = db.table("oauth_connections");
    expect(conns).toHaveLength(1);
    const row = conns[0];
    expect(row.provider).toBe("google");
    expect(row.provider_account_email).toBe("owner@gmail.com");
    expect(row.status).toBe("active");
    expect(row.access_token_enc).not.toBe("ya29.access-token-1");
    expect(String(row.access_token_enc)).not.toContain("ya29.access-token-1");
    expect(decryptToken(String(row.access_token_enc), ENV)).toBe("ya29.access-token-1");
    expect(decryptToken(String(row.refresh_token_enc), ENV)).toBe("1//refresh-token-1");

    const accounts = db.table("connected_accounts");
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      channel: "email",
      provider: "gmail",
      handle_or_email: "owner@gmail.com",
      status: "connected",
      auth_status: "ok",
      provider_account_id: "google-sub-42",
      sender_first_name: "Olivia",
      sender_last_name: "Owner",
    });

    // The metadata the API serves carries NO token material at all.
    const store = createSupabaseOAuthStore(deps.admin);
    const views = await store.listConnectionViews(WS);
    expect(views).toHaveLength(1);
    const json = JSON.stringify(views[0]);
    expect(json).not.toContain("_enc");
    expect(json).not.toContain("ya29");
    expect(json).not.toContain("refresh-token");
    expect(views[0]).toMatchObject({
      provider: "google",
      email: "owner@gmail.com",
      status: "active",
      authStatus: "ok",
    });

    // The connect was audit-logged without any token material.
    const audit = db.table("audit_logs");
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe("oauth_connected");
    expect(JSON.stringify(audit[0])).not.toContain("ya29");
  });

  it("stores NOTHING when the code exchange fails", async () => {
    const { db, deps } = setup([
      ["oauth2.googleapis.com/token", { error: "invalid_grant" }, 400],
    ]);
    await expect(
      handleOAuthCallback(
        "google",
        { code: "bad-code", stateToken: stateFor("google"), userId: USER, workspaceId: WS },
        deps
      )
    ).rejects.toMatchObject({ code: "exchange_failed" });
    expect(db.table("oauth_connections")).toHaveLength(0);
    expect(db.table("connected_accounts")).toHaveLength(0);
  });

  it("stores NOTHING when the profile fetch fails", async () => {
    const { db, deps } = setup([
      GOOGLE_ROUTES[0],
      ["openidconnect.googleapis.com/v1/userinfo", { error: "bad" }, 401],
    ]);
    await expect(
      handleOAuthCallback(
        "google",
        { code: "code", stateToken: stateFor("google"), userId: USER, workspaceId: WS },
        deps
      )
    ).rejects.toMatchObject({ code: "profile_failed" });
    expect(db.table("oauth_connections")).toHaveLength(0);
    expect(db.table("connected_accounts")).toHaveLength(0);
  });

  it("rejects a state bound to another workspace before any provider call", async () => {
    const { db, deps, calls } = setup(GOOGLE_ROUTES);
    await expect(
      handleOAuthCallback(
        "google",
        { code: "code", stateToken: stateFor("google", "ws_other"), userId: USER, workspaceId: WS },
        deps
      )
    ).rejects.toBeInstanceOf(OAuthFlowError);
    await expect(
      handleOAuthCallback(
        "google",
        { code: "code", stateToken: stateFor("google", "ws_other"), userId: USER, workspaceId: WS },
        deps
      )
    ).rejects.toMatchObject({ code: "state_invalid" });
    expect(calls).toHaveLength(0);
    expect(db.table("oauth_connections")).toHaveLength(0);
  });
});

describe("Microsoft callback", () => {
  it("connects via Graph /me identity and stores encrypted tokens", async () => {
    const { db, deps } = setup(MS_ROUTES);
    const result = await handleOAuthCallback(
      "microsoft",
      { code: "ms-code", stateToken: stateFor("microsoft"), userId: USER, workspaceId: WS },
      deps
    );
    expect(result.email).toBe("owner@contoso.com");
    const accounts = db.table("connected_accounts");
    expect(accounts[0]).toMatchObject({
      provider: "microsoft",
      handle_or_email: "owner@contoso.com",
      provider_account_id: "ms-user-7",
      auth_status: "ok",
    });
    const row = db.table("oauth_connections")[0];
    expect(decryptToken(String(row.access_token_enc), ENV)).toBe("ms-access-token");
    expect(decryptToken(String(row.refresh_token_enc), ENV)).toBe("ms-refresh-token");
  });
});

describe("disconnect", () => {
  it("Google: revokes at Google, deletes tokens, marks account, audits", async () => {
    const ctx = setup(GOOGLE_ROUTES);
    const connected = await handleOAuthCallback(
      "google",
      { code: "code", stateToken: stateFor("google"), userId: USER, workspaceId: WS },
      ctx.deps
    );
    const result = await disconnectOAuthConnection(
      { connectionId: connected.connectionId, workspaceId: WS, userId: USER },
      ctx.deps
    );
    expect(result).toMatchObject({
      provider: "google",
      email: "owner@gmail.com",
      revokedAtProvider: true,
    });
    expect(ctx.calls.some((c) => c.url.includes("oauth2.googleapis.com/revoke"))).toBe(true);
    expect(ctx.db.table("oauth_connections")).toHaveLength(0);
    expect(ctx.db.table("connected_accounts")[0]).toMatchObject({
      auth_status: "not_connected",
      status: "disconnected",
    });
    const audit = ctx.db.table("audit_logs").filter((a) => a.action === "oauth_disconnected");
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0])).not.toContain("ya29");
  });

  it("Microsoft: deletes tokens locally; no revocation call (none exists)", async () => {
    const ctx = setup(MS_ROUTES);
    const connected = await handleOAuthCallback(
      "microsoft",
      { code: "code", stateToken: stateFor("microsoft"), userId: USER, workspaceId: WS },
      ctx.deps
    );
    const callsBefore = ctx.calls.length;
    const result = await disconnectOAuthConnection(
      { connectionId: connected.connectionId, workspaceId: WS, userId: USER },
      ctx.deps
    );
    expect(result).toMatchObject({ provider: "microsoft", revokedAtProvider: null });
    expect(ctx.calls.slice(callsBefore).filter((c) => c.url.includes("revoke"))).toHaveLength(0);
    expect(ctx.db.table("oauth_connections")).toHaveLength(0);
    expect(ctx.db.table("connected_accounts")[0].auth_status).toBe("not_connected");
    const audit = ctx.db.table("audit_logs").filter((a) => a.action === "oauth_disconnected");
    expect(JSON.stringify(audit[0])).toContain("no revocation endpoint");
  });

  it("throws for a connection that does not exist", async () => {
    const { deps } = setup([]);
    await expect(
      disconnectOAuthConnection(
        { connectionId: "missing", workspaceId: WS, userId: USER },
        deps
      )
    ).rejects.toMatchObject({ code: "storage_failed" });
  });
});

describe("verify (Test Connection)", () => {
  it("verifies the stored grant against the live profile", async () => {
    const ctx = setup(GOOGLE_ROUTES);
    await handleOAuthCallback(
      "google",
      { code: "code", stateToken: stateFor("google"), userId: USER, workspaceId: WS },
      ctx.deps
    );
    const ok = await verifyOAuthConnection("google", { workspaceId: WS }, ctx.deps);
    expect(ok.attempted).toBe(true);
    expect(ok.ok).toBe(true);
    expect(ok.message).toContain("owner@gmail.com");

    const none = await verifyOAuthConnection("microsoft", { workspaceId: WS }, ctx.deps);
    expect(none).toMatchObject({ attempted: false, ok: false });
  });
});
