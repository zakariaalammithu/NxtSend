/**
 * MCP route tests — HTTP-level behaviour of /api/mcp and /api/mcp/health.
 *
 * Demo mode (the test env has no Supabase configured): POST -> 503
 * not_configured. Health is public and honest. With Supabase env
 * present (live mode) and no token, POST -> 401 with WWW-Authenticate.
 */

import { describe, it, expect, afterEach } from "vitest";
import { POST as mcpPost, GET as mcpGet } from "../route";
import { GET as healthGet } from "../health/route";

const SUPABASE_URL_KEY = "NEXT_PUBLIC_SUPABASE_URL";
const SUPABASE_KEY_KEY = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

describe("POST /api/mcp", () => {
  afterEach(() => {
    delete process.env[SUPABASE_URL_KEY];
    delete process.env[SUPABASE_KEY_KEY];
  });

  it("demo mode -> 503 not_configured", async () => {
    const res = await mcpPost(
      new Request("https://app.example.com/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
      })
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("not_configured");
  });

  it("live mode without a token -> 401 with WWW-Authenticate", async () => {
    process.env[SUPABASE_URL_KEY] = "https://test-project.supabase.co";
    process.env[SUPABASE_KEY_KEY] = "test-anon-key";
    const res = await mcpPost(
      new Request("https://app.example.com/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
      })
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain(
      "Bearer resource_metadata="
    );
    expect(res.headers.get("WWW-Authenticate")).toContain(
      "/.well-known/oauth-protected-resource/api/mcp"
    );
  });

  it("oversized body -> 413, invalid JSON -> 400 parse error", async () => {
    const big = await mcpPost(
      new Request("https://app.example.com/api/mcp", {
        method: "POST",
        body: "x".repeat(70 * 1024),
      })
    );
    expect(big.status).toBe(413);

    const bad = await mcpPost(
      new Request("https://app.example.com/api/mcp", {
        method: "POST",
        body: "{not json",
      })
    );
    expect(bad.status).toBe(400);
    const body = (await bad.json()) as { error: { code: number } };
    expect(body.error.code).toBe(-32700);
  });

  it("GET -> 405", async () => {
    const res = await mcpGet();
    expect(res.status).toBe(405);
  });
});

describe("GET /api/mcp/health", () => {
  it("is public and honest: demo mode, 54 tools, OAuth not configured", async () => {
    const res = await healthGet();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.mode).toBe("demo");
    expect(body.mcpEnabled).toBe(true);
    expect(body.toolCount).toBe(54);
    expect(body.oauthConfigured).toBe(false);
    expect(body.protocolVersion).toBe("2025-06-18");
  });
});
