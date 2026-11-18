/**
 * RFC 9728 protected-resource metadata route tests (n8n).
 * No database involved: the origin falls back to the request
 * origin when N8N_API_BASE_URL / NEXT_PUBLIC_APP_URL are unset.
 * Also covers the root document's `?resource=` handling for the
 * n8n resource.
 */
import { describe, it, expect } from "vitest";
import { ALL_OAUTH_SCOPES } from "@/lib/muse-connector/oauth/scopes";
import { GET } from "../route";
import { GET as GET_ROOT } from "@/app/.well-known/oauth-protected-resource/route";

describe("GET /.well-known/oauth-protected-resource/api/integrations/n8n", () => {
  it("returns the n8n resource, authorization server and scopes", async () => {
    const res = await GET(
      new Request("http://localhost:3000/.well-known/oauth-protected-resource/api/integrations/n8n")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.resource).toBe("http://localhost:3000/api/integrations/n8n");
    expect(body.authorization_servers).toEqual(["http://localhost:3000"]);
    // One authorization server serves all nine platforms, so the
    // resource advertises every scope set the server issues.
    expect(body.scopes_supported).toEqual([...ALL_OAUTH_SCOPES]);
    expect(body.bearer_methods_supported).toEqual(["header"]);
  });
});

describe("GET /.well-known/oauth-protected-resource?resource=<n8n>", () => {
  it("accepts the n8n resource", async () => {
    const res = await GET_ROOT(
      new Request(
        "http://localhost:3000/.well-known/oauth-protected-resource?resource=http://localhost:3000/api/integrations/n8n"
      )
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.resource).toBe("http://localhost:3000/api/integrations/n8n");
  });

  it("still defaults to the Muse resource for an unknown resource", async () => {
    const res = await GET_ROOT(
      new Request(
        "http://localhost:3000/.well-known/oauth-protected-resource?resource=http://localhost:3000/api/integrations/unknown"
      )
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.resource).toBe("http://localhost:3000/api/mcp");
  });
});
