/**
 * RFC 9728 protected-resource metadata route tests for the four
 * automation platforms (Make, Pabbly Connect, Albato, Activepieces).
 *
 * Covers: each platform's document returns its own resource,
 * authorization server and bearer method, and scopes_supported
 * equals ALL_OAUTH_SCOPES (asserted dynamically — never a
 * hardcoded list, so other workers' new scopes do not break
 * this file). Also covers the root document's ?resource=
 * handling for a Make resource. No database involved: the
 * origin falls back to the request origin when the platform
 * base-URL env vars are unset.
 */
import { describe, it, expect } from "vitest";
import { ALL_OAUTH_SCOPES } from "@/lib/muse-connector/oauth/scopes";
import { GET as GET_MAKE } from "@/app/.well-known/oauth-protected-resource/api/integrations/make/route";
import { GET as GET_PABBLY } from "@/app/.well-known/oauth-protected-resource/api/integrations/pabbly/route";
import { GET as GET_ALBATO } from "@/app/.well-known/oauth-protected-resource/api/integrations/albato/route";
import { GET as GET_ACTIVEPIECES } from "@/app/.well-known/oauth-protected-resource/api/integrations/activepieces/route";
import { GET as GET_ROOT } from "@/app/.well-known/oauth-protected-resource/route";

const PLATFORMS = [
  { id: "make", get: GET_MAKE },
  { id: "pabbly", get: GET_PABBLY },
  { id: "albato", get: GET_ALBATO },
  { id: "activepieces", get: GET_ACTIVEPIECES },
] as const;

describe("GET /.well-known/oauth-protected-resource/api/integrations/<platform>", () => {
  for (const p of PLATFORMS) {
    it(`returns the ${p.id} resource, authorization server and scopes`, async () => {
      const res = await p.get(
        new Request(
          `http://localhost:3000/.well-known/oauth-protected-resource/api/integrations/${p.id}`
        )
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.resource).toBe(`http://localhost:3000/api/integrations/${p.id}`);
      expect(body.authorization_servers).toEqual(["http://localhost:3000"]);
      // Dynamic assertion: the full scope list, whatever it is now.
      expect(body.scopes_supported).toEqual([...ALL_OAUTH_SCOPES]);
      expect((body.scopes_supported as string[])).toContain(`${p.id}.read`);
      expect((body.scopes_supported as string[])).toContain(`${p.id}.write`);
      expect((body.scopes_supported as string[])).not.toContain(`${p.id}.send`);
      expect(body.bearer_methods_supported).toEqual(["header"]);
    });
  }
});

describe("GET /.well-known/oauth-protected-resource?resource=<automation platform>", () => {
  it("accepts the Make resource", async () => {
    const res = await GET_ROOT(
      new Request(
        "http://localhost:3000/.well-known/oauth-protected-resource?resource=http://localhost:3000/api/integrations/make"
      )
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.resource).toBe("http://localhost:3000/api/integrations/make");
  });

  it("accepts the Activepieces resource", async () => {
    const res = await GET_ROOT(
      new Request(
        "http://localhost:3000/.well-known/oauth-protected-resource?resource=http://localhost:3000/api/integrations/activepieces"
      )
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.resource).toBe("http://localhost:3000/api/integrations/activepieces");
  });
});
