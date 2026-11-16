/**
 * ChatGPT MCP route tests — HTTP-level behaviour of /api/mcp/chatgpt.
 *
 * Demo mode (the test env has no Supabase configured): POST -> 503
 * not_configured. With Supabase env present (live mode):
 * tools/list without a token -> 200 (discovery, tools annotated as
 * requiring OAuth, no data); tool calls and resources/read without
 * a token -> 401 with WWW-Authenticate.
 */

import { describe, it, expect, afterEach } from "vitest";
import { POST as chatgptPost, GET as chatgptGet } from "../route";

const SUPABASE_URL_KEY = "NEXT_PUBLIC_SUPABASE_URL";
const SUPABASE_KEY_KEY = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

function liveEnv() {
  process.env[SUPABASE_URL_KEY] = "https://test-project.supabase.co";
  process.env[SUPABASE_KEY_KEY] = "test-anon-key";
}

describe("POST /api/mcp/chatgpt", () => {
  afterEach(() => {
    delete process.env[SUPABASE_URL_KEY];
    delete process.env[SUPABASE_KEY_KEY];
  });

  it("demo mode -> 503 not_configured", async () => {
    const res = await chatgptPost(
      new Request("https://app.example.com/api/mcp/chatgpt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
      })
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("not_configured");
  });

  it("live mode tools/list without a token -> 200, tools annotated as requiring OAuth", async () => {
    liveEnv();
    const res = await chatgptPost(
      new Request("https://app.example.com/api/mcp/chatgpt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: { tools: Array<{ name: string; description: string; _meta: { requiresOAuth: boolean } }> };
    };
    expect(body.result.tools.length).toBe(54);
    for (const tool of body.result.tools) {
      expect(tool.description).toContain("Requires OAuth");
      expect(tool._meta.requiresOAuth).toBe(true);
    }
  });

  it("live mode initialize without a token -> 200 with instructions", async () => {
    liveEnv();
    const res = await chatgptPost(
      new Request("https://app.example.com/api/mcp/chatgpt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "chatgpt", version: "1" } },
        }),
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { instructions: string } };
    expect(body.result.instructions.slice(0, 512)).toContain("LinkedIn sends are NOT supported");
  });

  it("live mode tool call without a token -> 401 with WWW-Authenticate", async () => {
    liveEnv();
    const res = await chatgptPost(
      new Request("https://app.example.com/api/mcp/chatgpt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "list_leads", arguments: {} },
        }),
      })
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain(
      "/.well-known/oauth-protected-resource/api/mcp"
    );
  });

  it("live mode resources/read without a token -> 401", async () => {
    liveEnv();
    const res = await chatgptPost(
      new Request("https://app.example.com/api/mcp/chatgpt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "resources/read",
          params: { uri: "ui://widget/campaigns.html" },
        }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("GET -> 405", async () => {
    const res = await chatgptGet();
    expect(res.status).toBe(405);
  });
});
