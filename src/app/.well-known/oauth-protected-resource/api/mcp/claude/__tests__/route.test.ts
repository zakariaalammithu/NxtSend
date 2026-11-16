/**
 * Path-scoped Claude protected-resource metadata route tests.
 *
 * Mirrors the ChatGPT path-scoped route test: the document names the
 * Claude MCP resource, the single authorization server, all issued
 * scopes, and header bearer auth.
 */

import { describe, it, expect } from "vitest";
import { ALL_OAUTH_SCOPES } from "@/lib/muse-connector/oauth";
import { GET } from "../route";

describe("GET /.well-known/oauth-protected-resource/api/mcp/claude", () => {
  it("returns the Claude resource with the authorization server and scopes", async () => {
    const res = await GET(
      new Request("http://localhost:3000/.well-known/oauth-protected-resource/api/mcp/claude")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.resource).toBe("http://localhost:3000/api/mcp/claude");
    expect(body.authorization_servers).toEqual(["http://localhost:3000"]);
    expect(body.scopes_supported).toEqual([...ALL_OAUTH_SCOPES]);
    expect(body.scopes_supported).toContain("claude.read");
    expect(body.bearer_methods_supported).toEqual(["header"]);
  });
});
