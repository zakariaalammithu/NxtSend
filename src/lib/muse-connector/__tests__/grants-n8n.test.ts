/**
 * n8n grants-by-origin tests (Worker B branch).
 *
 * n8n clients have arbitrary instance callbacks, so redirect
 * URIs cannot identify them — the `n8n.*` scope prefix is the
 * classifier (same fallback shape as Zapier's).
 */

import { describe, it, expect } from "vitest";
import {
  grantOriginForClient,
  summarizeGrantsByOrigin,
  EMPTY_GRANTS_BY_ORIGIN,
  type GrantCountRow,
} from "../grants";
import type { MuseOAuthClientRow } from "../oauth/store";

const NOW = new Date("2026-11-17T00:00:00Z");
const FUTURE = "2027-01-01T00:00:00Z";

const CLIENTS: MuseOAuthClientRow[] = [
  {
    id: "c1",
    client_id: "n8n-client-a",
    client_secret_hash: "hash",
    name: "n8n",
    redirect_uris: ["https://my-workspace.app.n8n.cloud/rest/oauth2-credential/callback"],
    created_at: "2026-11-17T00:00:00Z",
  },
  {
    id: "c2",
    client_id: "loopback-client",
    client_secret_hash: null,
    name: "Loopback",
    redirect_uris: ["http://localhost:3000/callback"],
    created_at: "2026-11-17T00:00:00Z",
  },
];

const countRow = (
  partial: Partial<GrantCountRow> & { client_id: string; user_id: string }
): GrantCountRow => ({
  kind: "refresh",
  expires_at: FUTURE,
  revoked_at: null,
  scopes: ["n8n.read"],
  ...partial,
});

describe("grantOriginForClient (n8n)", () => {
  it("classifies an n8n client by its n8n.* scopes", () => {
    expect(
      grantOriginForClient(
        "n8n-client-a",
        ["https://my-workspace.app.n8n.cloud/rest/oauth2-credential/callback"],
        ["n8n.read"]
      )
    ).toBe("n8n");
    // Same arbitrary callback, no scopes: not identifiable.
    expect(
      grantOriginForClient("n8n-client-a", [
        "https://my-workspace.app.n8n.cloud/rest/oauth2-credential/callback",
      ])
    ).toBe("Other");
  });

  it("still classifies Zapier before n8n", () => {
    expect(
      grantOriginForClient(
        "x",
        ["https://zapier.com/dashboard/auth/oauth/return/App123CLIAPI/"],
        ["n8n.read"]
      )
    ).toBe("Zapier");
  });
});

describe("summarizeGrantsByOrigin (n8n)", () => {
  it("counts n8n grants, including the n8n.* scope fallback for loopback-only clients", () => {
    const out = summarizeGrantsByOrigin(
      [
        countRow({ client_id: "n8n-client-a", user_id: "user-1", scopes: ["n8n.read"] }),
        countRow({
          client_id: "n8n-client-a",
          user_id: "user-2",
          scopes: ["n8n.read", "n8n.write"],
        }),
        // Loopback-only client: origin unknown, scope prefix decides.
        countRow({ client_id: "loopback-client", user_id: "user-3", scopes: ["n8n.read"] }),
        // Same client+user twice = one grant, not two.
        countRow({ client_id: "n8n-client-a", user_id: "user-1", scopes: ["n8n.read"] }),
      ],
      CLIENTS,
      NOW
    );
    expect(out).toEqual({
      muse: 0,
      chatgpt: 0,
      claude: 0,
      zapier: 0,
      n8n: 3,
      other: 0,
      total: 3,
    });
  });

  it("EMPTY_GRANTS_BY_ORIGIN carries the n8n branch", () => {
    expect(EMPTY_GRANTS_BY_ORIGIN.n8n).toBe(0);
  });
});
