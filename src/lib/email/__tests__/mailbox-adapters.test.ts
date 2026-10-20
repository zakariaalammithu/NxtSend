import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { GmailEmailAdapter } from "../gmail";
import {
  MicrosoftGraphEmailAdapter,
  type MicrosoftGraphAdapterDeps,
} from "../microsoft";
import { encryptToken, decryptToken } from "@/lib/oauth/crypto";
import type {
  OAuthConnectionRow,
  OAuthTokenStore,
} from "@/lib/oauth/types";
import type { SendEmailInput } from "../types";

/**
 * Mailbox adapter tests — mocked provider HTTP only. Both adapters
 * share the mailbox core: suppression fail-closed BEFORE any
 * provider call, Stage-C unsubscribe headers + footer applied at
 * send time, transparent token refresh (re-encrypted persist),
 * refresh failure → needs_reconnect, and `sent` only with a real
 * provider message id (Graph: the id from the create step — sendMail
 * itself returns 202 with no id, which is never invented around).
 */

const KEY = Buffer.alloc(32, 0x44).toString("base64");
const OAUTH_ENV = {
  GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "GOCSPX-secret",
  MICROSOFT_CLIENT_ID: "ms-client-id",
  MICROSOFT_CLIENT_SECRET: "ms-secret",
  TOKEN_ENCRYPTION_KEY: KEY,
  NEXT_PUBLIC_APP_URL: "https://app.nxtsend.example",
  NODE_ENV: "test",
};
const UNSUB_ENV = {
  NEXT_PUBLIC_APP_URL: "https://app.nxtsend.example",
  SUPABASE_SERVICE_ROLE_KEY: "svc-role-test-key",
};
const WS = "ws_1";

const PREV_KEY = process.env.TOKEN_ENCRYPTION_KEY;
beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = KEY;
});
afterAll(() => {
  if (PREV_KEY === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
  else process.env.TOKEN_ENCRYPTION_KEY = PREV_KEY;
});

class FakeOAuthStore implements OAuthTokenStore {
  connections = new Map<string, OAuthConnectionRow>();
  tokenPatches: Array<{ id: string; accessTokenEnc: string }> = [];
  statusPatches: Array<{ id: string; status: string }> = [];
  authPatches: Array<{ accountId: string; patch: Record<string, unknown> }> = [];

  add(row: OAuthConnectionRow) {
    this.connections.set(row.id, { ...row });
  }
  async getConnectionById(_ws: string, id: string) {
    const c = this.connections.get(id);
    return c ? { ...c } : null;
  }
  async getConnectionByAccountId(_ws: string, accountId: string) {
    for (const c of Array.from(this.connections.values())) {
      if (c.account_id === accountId) return { ...c };
    }
    return null;
  }
  async listConnectionViews() {
    return [];
  }
  async persistConnection(): Promise<{ accountId: string; connectionId: string }> {
    throw new Error("not used in adapter tests");
  }
  async updateTokens(id: string, patch: { accessTokenEnc: string; refreshTokenEnc?: string | null; tokenExpiresAt: string | null }) {
    this.tokenPatches.push({ id, accessTokenEnc: patch.accessTokenEnc });
    const c = this.connections.get(id);
    if (c) {
      c.access_token_enc = patch.accessTokenEnc;
      if (patch.refreshTokenEnc !== undefined && patch.refreshTokenEnc !== null) {
        c.refresh_token_enc = patch.refreshTokenEnc;
      }
      c.token_expires_at = patch.tokenExpiresAt;
    }
  }
  async setConnectionStatus(id: string, status: OAuthConnectionRow["status"]) {
    this.statusPatches.push({ id, status });
    const c = this.connections.get(id);
    if (c) c.status = status;
  }
  async updateAccountAuth(accountId: string, patch: Record<string, unknown>) {
    this.authPatches.push({ accountId, patch });
  }
  async deleteConnection() {}
}

function makeConnection(
  provider: "google" | "microsoft",
  overrides: Partial<OAuthConnectionRow> = {}
): OAuthConnectionRow {
  return {
    id: `conn_${provider}`,
    workspace_id: WS,
    account_id: `acct_${provider}`,
    provider,
    provider_account_email: provider === "google" ? "owner@gmail.com" : "owner@contoso.com",
    scopes: "test",
    access_token_enc: encryptToken("access-token-1", OAUTH_ENV),
    refresh_token_enc: encryptToken("refresh-token-1", OAUTH_ENV),
    token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

type RouteMatcher =
  | string
  | ((url: string, init?: RequestInit) => boolean);

function makeFetch(routes: Array<[RouteMatcher, unknown, number?]>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    for (const [matcher, body, status] of routes) {
      const hit =
        typeof matcher === "string" ? u.includes(matcher) : matcher(u, init);
      if (hit) {
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

const isGraphCreate = (u: string, init?: RequestInit) =>
  u.endsWith("/me/messages") && init?.method === "POST";
const isGraphSend = (u: string) => u.includes("/me/messages/") && u.endsWith("/send");
const isGraphDelete = (u: string, init?: RequestInit) =>
  u.includes("/me/messages/") && init?.method === "DELETE";

const INPUT: SendEmailInput = {
  workspaceId: WS,
  to: "lead@acme.test",
  subject: "Quick intro",
  text: "Hi Sarah, a short note about Acme.",
  replyTo: "replies@nxtsend.example",
  campaignId: "camp_1",
  leadId: "lead_1",
};

function decodeMime(calls: Array<{ url: string; init?: RequestInit }>): string {
  const send = calls.find((c) => c.url.includes("messages/send"));
  if (!send?.init?.body) throw new Error("no gmail send call captured");
  const { raw } = JSON.parse(String(send.init.body)) as { raw: string };
  return Buffer.from(raw, "base64url").toString("utf8");
}

describe("GmailEmailAdapter", () => {
  it("sends a MIME message with unsubscribe headers + footer and returns the Gmail id", async () => {
    const store = new FakeOAuthStore();
    store.add(makeConnection("google"));
    const { impl, calls } = makeFetch([
      ["gmail/v1/users/me/messages/send", { id: "gmail-msg-1", threadId: "t1" }],
    ]);
    const adapter = new GmailEmailAdapter({
      connectionId: "conn_google",
      store,
      adminClient: null,
      suppressionCheck: async () => false,
      stateOverride: "connected",
      skipMessageRecord: true,
      unsubscribeEnv: UNSUB_ENV,
      env: OAUTH_ENV,
      fetchFn: impl,
    });
    const result = await adapter.sendEmail(INPUT);
    expect(result.status).toBe("sent");
    expect(result.provider).toBe("gmail");
    expect(result.providerMessageId).toBe("gmail-msg-1");

    const mime = decodeMime(calls);
    expect(mime).toContain("From: owner@gmail.com");
    expect(mime).toContain("To: lead@acme.test");
    expect(mime).toContain("Reply-To: replies@nxtsend.example");
    expect(mime).toContain("List-Unsubscribe: <");
    expect(mime).toContain("https://app.nxtsend.example/api/unsubscribe/");
    expect(mime).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
    // The body part is base64 (RFC 2045) — decode it and check the
    // footer was appended to the sent copy.
    const bodyPart = mime.split("\r\n\r\n").pop() ?? "";
    const decodedBody = Buffer.from(
      bodyPart.replace(/\s+/g, ""),
      "base64"
    ).toString("utf8");
    expect(decodedBody).toContain("Hi Sarah, a short note about Acme.");
    expect(decodedBody).toContain("Unsubscribe:");
    expect(decodedBody).toContain("https://app.nxtsend.example/api/unsubscribe/");
    // The stored input body was NOT mutated.
    expect(INPUT.text).toBe("Hi Sarah, a short note about Acme.");
    // The bearer token used is the decrypted stored access token.
    const send = calls.find((c) => c.url.includes("messages/send"));
    expect((send?.init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer access-token-1"
    );
  });

  it("fails closed on suppression — the provider is never called", async () => {
    const store = new FakeOAuthStore();
    store.add(makeConnection("google"));
    const { impl, calls } = makeFetch([]);
    const adapter = new GmailEmailAdapter({
      connectionId: "conn_google",
      store,
      adminClient: null,
      suppressionCheck: async () => true,
      stateOverride: "connected",
      skipMessageRecord: true,
      unsubscribeEnv: UNSUB_ENV,
      env: OAUTH_ENV,
      fetchFn: impl,
    });
    const result = await adapter.sendEmail(INPUT);
    expect(result.status).toBe("suppressed");
    expect(calls).toHaveLength(0);
  });

  it("refuses when suppression cannot be checked at all", async () => {
    const store = new FakeOAuthStore();
    store.add(makeConnection("google"));
    const { impl, calls } = makeFetch([]);
    const adapter = new GmailEmailAdapter({
      connectionId: "conn_google",
      store,
      adminClient: null, // no service-role client…
      // …and no suppression seam → fail closed.
      stateOverride: "connected",
      skipMessageRecord: true,
      unsubscribeEnv: UNSUB_ENV,
      env: OAUTH_ENV,
      fetchFn: impl,
    });
    const result = await adapter.sendEmail(INPUT);
    expect(result.status).toBe("error");
    expect(result.message).toContain("suppression list could not be checked");
    expect(calls).toHaveLength(0);
  });

  it("refreshes an expired token, persists it re-encrypted, then sends", async () => {
    const store = new FakeOAuthStore();
    store.add(
      makeConnection("google", {
        token_expires_at: new Date(Date.now() - 60_000).toISOString(),
      })
    );
    const { impl, calls } = makeFetch([
      ["oauth2.googleapis.com/token", {
        access_token: "access-token-2",
        expires_in: 3600,
        scope: "test",
      }],
      ["gmail/v1/users/me/messages/send", { id: "gmail-msg-2" }],
    ]);
    const adapter = new GmailEmailAdapter({
      connectionId: "conn_google",
      store,
      adminClient: null,
      suppressionCheck: async () => false,
      stateOverride: "connected",
      skipMessageRecord: true,
      unsubscribeEnv: UNSUB_ENV,
      env: OAUTH_ENV,
      fetchFn: impl,
    });
    const result = await adapter.sendEmail(INPUT);
    expect(result.status).toBe("sent");
    // The refresh endpoint was hit with the refresh_token grant.
    const refreshCall = calls.find((c) => c.url.includes("oauth2.googleapis.com/token"));
    expect(refreshCall).toBeTruthy();
    expect(String(refreshCall?.init?.body)).toContain("grant_type=refresh_token");
    expect(String(refreshCall?.init?.body)).toContain("refresh_token=refresh-token-1");
    // New token persisted ENCRYPTED and used for the send.
    expect(store.tokenPatches).toHaveLength(1);
    expect(decryptToken(store.tokenPatches[0].accessTokenEnc, OAUTH_ENV)).toBe("access-token-2");
    const send = calls.find((c) => c.url.includes("messages/send"));
    expect((send?.init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer access-token-2"
    );
  });

  it("refresh failure marks the connection needs_reconnect and errors — no send", async () => {
    const store = new FakeOAuthStore();
    store.add(
      makeConnection("google", {
        token_expires_at: new Date(Date.now() - 60_000).toISOString(),
      })
    );
    const { impl, calls } = makeFetch([
      ["oauth2.googleapis.com/token", { error: "invalid_grant" }, 400],
    ]);
    const adapter = new GmailEmailAdapter({
      connectionId: "conn_google",
      store,
      adminClient: null,
      suppressionCheck: async () => false,
      stateOverride: "connected",
      skipMessageRecord: true,
      unsubscribeEnv: UNSUB_ENV,
      env: OAUTH_ENV,
      fetchFn: impl,
    });
    const result = await adapter.sendEmail(INPUT);
    expect(result.status).toBe("error");
    expect(result.message).toContain("Google rejected the token request");
    expect(store.statusPatches).toEqual([{ id: "conn_google", status: "needs_reconnect" }]);
    expect(store.authPatches).toHaveLength(1);
    expect(store.authPatches[0].patch.auth_status).toBe("needs_reconnect");
    expect(calls.filter((c) => c.url.includes("messages/send"))).toHaveLength(0);
  });

  it("a non-active connection refuses before any provider call", async () => {
    const store = new FakeOAuthStore();
    store.add(makeConnection("google", { status: "needs_reconnect" }));
    const { impl, calls } = makeFetch([]);
    const adapter = new GmailEmailAdapter({
      connectionId: "conn_google",
      store,
      adminClient: null,
      suppressionCheck: async () => false,
      stateOverride: "connected",
      skipMessageRecord: true,
      unsubscribeEnv: UNSUB_ENV,
      env: OAUTH_ENV,
      fetchFn: impl,
    });
    const result = await adapter.sendEmail(INPUT);
    expect(result.status).toBe("error");
    expect(result.message).toContain("not in an active state");
    expect(calls).toHaveLength(0);
  });
});

describe("MicrosoftGraphEmailAdapter", () => {
  function graphAdapter(
    store: FakeOAuthStore,
    impl: typeof fetch,
    extra: Partial<MicrosoftGraphAdapterDeps> = {}
  ) {
    return new MicrosoftGraphEmailAdapter({
      connectionId: "conn_microsoft",
      store,
      adminClient: null,
      suppressionCheck: async () => false,
      stateOverride: "connected",
      skipMessageRecord: true,
      unsubscribeEnv: UNSUB_ENV,
      env: OAUTH_ENV,
      fetchFn: impl,
      ...extra,
    });
  }

  it("creates + sends via Graph; the recorded id is the provider-assigned create id", async () => {
    const store = new FakeOAuthStore();
    store.add(makeConnection("microsoft"));
    const { impl, calls } = makeFetch([
      [isGraphCreate, { id: "graph-msg-1" }, 201],
      [isGraphSend, {}, 202],
    ]);
    const result = await graphAdapter(store, impl).sendEmail(INPUT);
    expect(result.status).toBe("sent");
    expect(result.provider).toBe("microsoft");
    expect(result.providerMessageId).toBe("graph-msg-1");

    const create = calls.find(
      (c) => c.url.endsWith("/me/messages") && c.init?.method === "POST"
    );
    if (!create?.init?.body) throw new Error("no graph create call captured");
    const payload = JSON.parse(String(create.init.body)) as {
      subject: string;
      body: { contentType: string; content: string };
      toRecipients: Array<{ emailAddress: { address: string } }>;
      internetMessageHeaders: Array<{ name: string; value: string }>;
    };
    expect(payload.subject).toBe("Quick intro");
    expect(payload.toRecipients[0].emailAddress.address).toBe("lead@acme.test");
    const headerNames = payload.internetMessageHeaders.map((h) => h.name);
    expect(headerNames).toContain("List-Unsubscribe");
    expect(headerNames).toContain("List-Unsubscribe-Post");
    const unsub = payload.internetMessageHeaders.find((h) => h.name === "List-Unsubscribe");
    expect(unsub?.value).toContain("https://app.nxtsend.example/api/unsubscribe/");
    expect(payload.body.content).toContain("Unsubscribe:");

    const send = calls.find((c) => c.url.includes("/me/messages/graph-msg-1/send"));
    expect(send).toBeTruthy();
  });

  it("fails closed on suppression — Graph is never called", async () => {
    const store = new FakeOAuthStore();
    store.add(makeConnection("microsoft"));
    const { impl, calls } = makeFetch([]);
    const result = await graphAdapter(store, impl, {
      suppressionCheck: async () => true,
    }).sendEmail(INPUT);
    expect(result.status).toBe("suppressed");
    expect(calls).toHaveLength(0);
  });

  it("create failure is an error; no send is attempted and no id is invented", async () => {
    const store = new FakeOAuthStore();
    store.add(makeConnection("microsoft"));
    const { impl, calls } = makeFetch([
      [isGraphCreate, { error: { message: "Mailbox full" } }, 403],
    ]);
    const result = await graphAdapter(store, impl).sendEmail(INPUT);
    expect(result.status).toBe("error");
    expect(result.providerMessageId).toBeNull();
    expect(calls.filter((c) => c.url.includes("/send"))).toHaveLength(0);
  });

  it("send failure deletes the draft best-effort and reports an error", async () => {
    const store = new FakeOAuthStore();
    store.add(makeConnection("microsoft"));
    const { impl, calls } = makeFetch([
      [isGraphCreate, { id: "graph-msg-2" }, 201],
      [isGraphSend, { error: { message: "Send denied" } }, 403],
      [isGraphDelete, {}, 204],
    ]);
    const result = await graphAdapter(store, impl).sendEmail(INPUT);
    expect(result.status).toBe("error");
    expect(result.providerMessageId).toBeNull();
    const del = calls.find(
      (c) => c.init?.method === "DELETE" && c.url.includes("graph-msg-2")
    );
    expect(del).toBeTruthy();
  });

  it("refreshes through the Microsoft token endpoint when expired", async () => {
    const store = new FakeOAuthStore();
    store.add(
      makeConnection("microsoft", {
        token_expires_at: new Date(Date.now() - 60_000).toISOString(),
      })
    );
    const { impl, calls } = makeFetch([
      ["login.microsoftonline.com/common/oauth2/v2.0/token", {
        access_token: "ms-access-2",
        refresh_token: "ms-refresh-2",
        expires_in: 3600,
        scope: "test",
      }],
      [isGraphCreate, { id: "graph-msg-3" }, 201],
      [isGraphSend, {}, 202],
    ]);
    const result = await graphAdapter(store, impl).sendEmail(INPUT);
    expect(result.status).toBe("sent");
    const refreshCall = calls.find((c) => c.url.includes("login.microsoftonline.com"));
    expect(String(refreshCall?.init?.body)).toContain("grant_type=refresh_token");
    expect(store.tokenPatches).toHaveLength(1);
    expect(decryptToken(store.tokenPatches[0].accessTokenEnc, OAUTH_ENV)).toBe("ms-access-2");
  });
});
