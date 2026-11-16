/**
 * RFC 9728 protected-resource metadata route test (ChatGPT resource).
 * No database involved: the origin falls back to the request origin
 * when CHATGPT_MCP_PUBLIC_URL / MUSE_MCP_PUBLIC_URL /
 * NEXT_PUBLIC_APP_URL are unset.
 */
import { describe, it, expect } from "vitest";
import { GET } from "../route";

describe("GET /.well-known/oauth-protected-resource/api/mcp/chatgpt", () => {
  it("returns the ChatGPT MCP resource, authorization server and scopes", async () => {
    const res = await GET(
      new Request(
        "http://localhost:3000/.well-known/oauth-protected-resource/api/mcp/chatgpt"
      )
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.resource).toBe("http://localhost:3000/api/mcp/chatgpt");
    expect(body.authorization_servers).toEqual(["http://localhost:3000"]);
    // One authorization server serves all three platforms, so the
    // resource advertises all three scope sets (muse.*, nxtsend.*
    // and claude.*).
    expect(body.scopes_supported).toEqual([
      "muse.read",
      "muse.write",
      "muse.send",
      "nxtsend.read",
      "nxtsend.write",
      "nxtsend.send",
      "claude.read",
      "claude.write",
      "claude.send",
    ]);
    expect(body.bearer_methods_supported).toEqual(["header"]);
  });
});
