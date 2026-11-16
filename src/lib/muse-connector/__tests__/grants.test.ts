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
  type MuseGrantTokenRow,
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
