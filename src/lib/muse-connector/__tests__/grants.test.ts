/**
 * Muse grants tests (Worker C).
 *
 * What is being protected: grouping tokens into grants by client,
 * active = a live (non-revoked, unexpired) refresh token, expired /
 * revoked-only grants listed as inactive, scopes de-duplicated,
 * "last used" is never invented (always null — migration 023 does
 * not store it), and revocation goes through the store's revokeGrant
 * and refuses an unknown grant with grant_not_found. All through
 * fake in-memory sources — no database, no network, no token values.
 */

import { describe, it, expect } from "vitest";
import {
  summarizeMuseGrants,
  listMuseGrants,
  revokeMuseGrant,
  grantOriginForClient,
  summarizeGrantsByOrigin,
  type MuseGrantTokenRow,
  type GrantCountRow,
  type MuseGrantsDataSource,
} from "../grants";
import { createMemoryMuseOAuthStore } from "../oauth/store";
import type { MuseOAuthClientRow } from "../oauth/store";

const NOW = new Date("2026-11-16T12:00:00Z");
const FUTURE = "2027-01-15T12:00:00Z";
const PAST = "2026-11-01T12:00:00Z";

const CLIENTS: MuseOAuthClientRow[] = [
  {
    id: "c1",
    client_id: "muse-client-a",
    client_secret_hash: null,
    name: "Muse",
    redirect_uris: ["https://agent.meta.ai/api/hatch/oauth/callback"],
    created_at: "2026-11-10T00:00:00Z",
  },
  {
    id: "c2",
    client_id: "muse-client-b",
    client_secret_hash: null,
    name: "Muse Test",
    redirect_uris: ["http://localhost:3000/callback"],
    created_at: "2026-11-11T00:00:00Z",
  },
];

function token(
  partial: Partial<MuseGrantTokenRow> & { client_id: string }
): MuseGrantTokenRow {
  return {
    kind: "refresh",
    scopes: ["muse.read"],
    expires_at: FUTURE,
    revoked_at: null,
    created_at: "2026-11-12T00:00:00Z",
    ...partial,
  };
}

describe("summarizeMuseGrants", () => {
  it("groups tokens by client and reports the client name + union of scopes", () => {
    const out = summarizeMuseGrants(
      [
        token({ client_id: "muse-client-a", scopes: ["muse.read"] }),
        token({
          client_id: "muse-client-a",
          kind: "access",
          scopes: ["muse.read", "muse.write"],
          created_at: "2026-11-13T00:00:00Z",
        }),
      ],
      CLIENTS,
      NOW
    );
    expect(out).toHaveLength(1);
    expect(out[0].clientId).toBe("muse-client-a");
    expect(out[0].clientName).toBe("Muse");
    expect(out[0].scopes).toEqual(["muse.read", "muse.write"]);
    expect(out[0].active).toBe(true);
    expect(out[0].createdAt).toBe("2026-11-12T00:00:00Z");
    expect(out[0].refreshExpiresAt).toBe(FUTURE);
  });

  it("never invents a last-used time — it is always null", () => {
    const out = summarizeMuseGrants(
      [token({ client_id: "muse-client-a" })],
      CLIENTS,
      NOW
    );
    expect(out[0].lastUsedAt).toBeNull();
  });

  it("an expired refresh token makes the grant inactive (still listed)", () => {
    const out = summarizeMuseGrants(
      [token({ client_id: "muse-client-a", expires_at: PAST })],
      CLIENTS,
      NOW
    );
    expect(out[0].active).toBe(false);
    expect(out[0].refreshExpiresAt).toBeNull();
  });

  it("a revoked refresh token makes the grant inactive (still listed)", () => {
    const out = summarizeMuseGrants(
      [
        token({
          client_id: "muse-client-a",
          revoked_at: "2026-11-15T00:00:00Z",
        }),
      ],
      CLIENTS,
      NOW
    );
    expect(out[0].active).toBe(false);
  });

  it("falls back to the client_id when the client row is unknown", () => {
    const out = summarizeMuseGrants(
      [token({ client_id: "unknown-client" })],
      CLIENTS,
      NOW
    );
    expect(out[0].clientName).toBe("unknown-client");
  });

  it("returns an empty list when there are no tokens", () => {
    expect(summarizeMuseGrants([], CLIENTS, NOW)).toEqual([]);
  });
});

function fakeSource(tokens: MuseGrantTokenRow[]): MuseGrantsDataSource {
  return {
    async listTokensForUser() {
      return tokens;
    },
    async listClients() {
      return CLIENTS;
    },
    async revokeGrant() {
      // The fake source is not the revocation path — the store is.
      throw new Error("fake source revokeGrant must not be called");
    },
  };
}

describe("listMuseGrants / revokeMuseGrant (fake source + memory store)", () => {
  it("lists summaries through the source seam", async () => {
    const out = await listMuseGrants("user-1", {
      source: fakeSource([token({ client_id: "muse-client-a" })]),
      now: NOW,
    });
    expect(out).toHaveLength(1);
    expect(out[0].clientName).toBe("Muse");
  });

  it("revokes a live grant through the store and refuses an unknown one", async () => {
    const store = createMemoryMuseOAuthStore(() => NOW);
    // Seed the memory store with a live refresh token for client-a.
    const { hashToken } = await import("../oauth/tokens");
    await store.insertToken({
      token_hash: hashToken("refresh-value-a"),
      kind: "refresh",
      client_id: "muse-client-a",
      user_id: "user-1",
      workspace_id: "ws-1",
      scopes: ["muse.read"],
      resource: null,
      expires_at: FUTURE,
      revoked_at: null,
      rotated_from_hash: null,
    });
    const source = fakeSource([token({ client_id: "muse-client-a" })]);
    const ok = await revokeMuseGrant("muse-client-a", "user-1", {
      source,
      store,
      now: NOW,
    });
    expect(ok).toEqual({ ok: true, revoked: true });
    expect(
      (await store.getToken(hashToken("refresh-value-a")))?.revoked_at
    ).toBe(NOW.toISOString());

    const missing = await revokeMuseGrant("muse-client-b", "user-1", {
      source: fakeSource([]),
      store,
      now: NOW,
    });
    expect(missing).toEqual({ ok: false, error: "grant_not_found" });
  });
});

// ── Grants by client origin (Worker C) ──────────────────────────────────────

describe("grantOriginForClient", () => {
  it("classifies by registered redirect URI", () => {
    expect(
      grantOriginForClient("client-a", ["https://chatgpt.com/connector_platform_oauth_redirect"])
    ).toBe("ChatGPT");
    expect(
      grantOriginForClient("client-b", ["https://agent.meta.ai/api/hatch/oauth/callback"])
    ).toBe("Muse");
    expect(
      grantOriginForClient("client-d", ["https://claude.ai/api/mcp/auth_callback"])
    ).toBe("Claude");
    expect(
      grantOriginForClient("client-e", ["https://claude.com/api/mcp/auth_callback"])
    ).toBe("Claude");
    expect(grantOriginForClient("client-c", ["http://localhost:3000/callback"])).toBe("Other");
  });

  it("classifies an ephemeral CIMD client by its client_id URL origin", () => {
    // A CIMD client has no stored client row, so the URL is the only signal.
    expect(grantOriginForClient("https://chatgpt.com/some-client", [])).toBe("ChatGPT");
    expect(grantOriginForClient("https://agent.meta.ai/some-client", [])).toBe("Muse");
    expect(grantOriginForClient("https://claude.ai/some-client", [])).toBe("Claude");
    expect(grantOriginForClient("https://claude.com/some-client", [])).toBe("Claude");
    expect(grantOriginForClient("https://example.com/some-client", [])).toBe("Other");
  });

  it("classifies a Zapier client by its registered redirect URI (pattern, not a hardcoded App ID)", () => {
    expect(
      grantOriginForClient("zapier-client-a", [
        "https://zapier.com/dashboard/auth/oauth/return/App1234567CLIAPI/",
      ])
    ).toBe("Zapier");
    // Trailing-slash-tolerant, like the server's pattern check.
    expect(
      grantOriginForClient("zapier-client-b", [
        "https://zapier.com/dashboard/auth/oauth/return/App9876543CLIAPI",
      ])
    ).toBe("Zapier");
    // A non-Zapier zapier.com path is not a Zapier redirect.
    expect(
      grantOriginForClient("zapier-client-c", ["https://zapier.com/dashboard/"])
    ).toBe("Other");
  });
});

describe("summarizeGrantsByOrigin", () => {
  const countRow = (
    partial: Partial<GrantCountRow> & { client_id: string; user_id: string }
  ): GrantCountRow => ({
    kind: "refresh",
    expires_at: FUTURE,
    revoked_at: null,
    scopes: ["muse.read"],
    ...partial,
  });

  it("splits distinct live client+user pairs by origin", () => {
    const clients: MuseOAuthClientRow[] = [
      ...CLIENTS,
      {
        id: "c3",
        client_id: "chatgpt-client-a",
        client_secret_hash: null,
        name: "ChatGPT",
        redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
        created_at: "2026-11-10T00:00:00Z",
      },
    ];
    const out = summarizeGrantsByOrigin(
      [
        countRow({ client_id: "muse-client-a", user_id: "user-1" }),
        countRow({ client_id: "muse-client-a", user_id: "user-2" }),
        countRow({
          client_id: "chatgpt-client-a",
          user_id: "user-1",
          scopes: ["nxtsend.read"],
        }),
        // CIMD client: no stored client row, classified by URL.
        countRow({
          client_id: "https://chatgpt.com/abc",
          user_id: "user-1",
          scopes: ["nxtsend.read", "nxtsend.write"],
        }),
        // Same client+user twice = one grant, not two.
        countRow({ client_id: "muse-client-a", user_id: "user-1" }),
      ],
      clients,
      NOW
    );
    expect(out).toEqual({ muse: 2, chatgpt: 2, claude: 0, zapier: 0, n8n: 0, other: 0, total: 4 });
  });

  it("splits Claude grants by origin, including the claude.* scope fallback", () => {
    const clients: MuseOAuthClientRow[] = [
      ...CLIENTS,
      {
        id: "c4",
        client_id: "claude-client-a",
        client_secret_hash: null,
        name: "Claude",
        redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
        created_at: "2026-11-10T00:00:00Z",
      },
    ];
    const out = summarizeGrantsByOrigin(
      [
        countRow({ client_id: "claude-client-a", user_id: "user-1", scopes: ["claude.read"] }),
        // CIMD client: no stored client row, classified by URL.
        countRow({
          client_id: "https://claude.com/abc",
          user_id: "user-1",
          scopes: ["claude.read", "claude.write"],
        }),
        // Loopback-only client (CLIENTS[1]): origin unknown, scope prefix decides.
        countRow({ client_id: "muse-client-b", user_id: "user-6", scopes: ["claude.read"] }),
      ],
      clients,
      NOW
    );
    expect(out).toEqual({ muse: 0, chatgpt: 0, claude: 3, zapier: 0, n8n: 0, other: 0, total: 3 });
  });

  it("ignores expired, revoked and access tokens, and falls back to scope prefix for loopback-only clients", () => {
    const out = summarizeGrantsByOrigin(
      [
        countRow({ client_id: "muse-client-b", user_id: "user-1", expires_at: PAST }),
        countRow({ client_id: "muse-client-b", user_id: "user-2", revoked_at: "2026-11-15T00:00:00Z" }),
        countRow({ client_id: "muse-client-b", user_id: "user-3", kind: "access" }),
        // Loopback-only client (CLIENTS[1]): origin unknown, scope prefix decides.
        countRow({ client_id: "muse-client-b", user_id: "user-4", scopes: ["nxtsend.read"] }),
        countRow({ client_id: "muse-client-b", user_id: "user-5", scopes: ["muse.read"] }),
      ],
      CLIENTS,
      NOW
    );
    expect(out).toEqual({ muse: 1, chatgpt: 1, claude: 0, zapier: 0, n8n: 0, other: 0, total: 2 });
  });

  it("splits Zapier grants by origin, including the zapier.* scope fallback", () => {
    const clients: MuseOAuthClientRow[] = [
      ...CLIENTS,
      {
        id: "c5",
        client_id: "zapier-client-a",
        client_secret_hash: "hash",
        name: "Zapier",
        redirect_uris: ["https://zapier.com/dashboard/auth/oauth/return/App1234567CLIAPI/"],
        created_at: "2026-11-17T00:00:00Z",
      },
    ];
    const out = summarizeGrantsByOrigin(
      [
        countRow({ client_id: "zapier-client-a", user_id: "user-1", scopes: ["zapier.read"] }),
        countRow({
          client_id: "zapier-client-a",
          user_id: "user-2",
          scopes: ["zapier.read", "zapier.write"],
        }),
        // Loopback-only client (CLIENTS[1]): origin unknown, scope prefix decides.
        countRow({ client_id: "muse-client-b", user_id: "user-6", scopes: ["zapier.write"] }),
        // Same client+user twice = one grant, not two.
        countRow({ client_id: "zapier-client-a", user_id: "user-1", scopes: ["zapier.read"] }),
      ],
      clients,
      NOW
    );
    expect(out).toEqual({ muse: 0, chatgpt: 0, claude: 0, zapier: 3, n8n: 0, other: 0, total: 3 });
  });
});
