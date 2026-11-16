/**
 * RFC 9728 protected-resource metadata route test.
 * No database involved: the origin falls back to the request origin
 * when MUSE_MCP_PUBLIC_URL / NEXT_PUBLIC_APP_URL are unset.
 */
import { describe, it, expect } from "vitest";
import { GET } from "../route";

describe("GET /.well-known/oauth-protected-resource/api/mcp", () => {
  it("returns the MCP resource, authorization server and scopes", async () => {
    const res = await GET(new Request("http://localhost:3000/.well-known/oauth-protected-resource/api/mcp"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.resource).toBe("http://localhost:3000/api/mcp");
    expect(body.authorization_servers).toEqual(["http://localhost:3000"]);
    expect(body.scopes_supported).toEqual(["muse.read", "muse.write", "muse.send"]);
    expect(body.bearer_methods_supported).toEqual(["header"]);
  });
});
