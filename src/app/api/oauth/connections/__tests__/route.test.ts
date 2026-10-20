import { describe, it, expect } from "vitest";
import { GET } from "../route";

/**
 * The connections metadata route in Demo Mode (the test environment
 * has no Supabase configured): an honest empty list, per-provider
 * configuration booleans, and — critically — NO token fields
 * anywhere in the payload, at any depth.
 */
describe("GET /api/oauth/connections (demo)", () => {
  it("returns metadata only — empty connections, config booleans, no token material", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      mode: string;
      providers: Array<Record<string, unknown>>;
      connections: unknown[];
    };
    expect(body.mode).toBe("demo");
    expect(body.connections).toEqual([]);
    expect(body.providers.map((p) => p.provider)).toEqual(["google", "microsoft"]);
    for (const p of body.providers) {
      expect(typeof p.clientConfigured).toBe("boolean");
      expect(typeof p.vaultConfigured).toBe("boolean");
      expect(typeof p.ready).toBe("boolean");
      expect(Array.isArray(p.missing)).toBe(true);
    }
    // No token FIELDS or values anywhere. (The string
    // "TOKEN_ENCRYPTION_KEY" legitimately appears inside `missing` —
    // it is a variable NAME the owner must set, not token material.)
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("access_token_enc");
    expect(serialized).not.toContain("refresh_token_enc");
    expect(serialized).not.toContain('"access_token"');
    expect(serialized).not.toContain('"refresh_token"');
    expect(serialized.toLowerCase()).not.toContain("ciphertext");
  });
});
