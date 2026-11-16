/**
 * Claude MCP route tests — HTTP-level behaviour of /api/mcp/claude.
 *
 * Demo mode (the test env has no Supabase configured): POST -> 503
 * not_configured with the "Claude MCP" message. With Supabase env
 * present (live mode) and no token, POST -> 401 with
 * WWW-Authenticate naming the Claude protected-resource metadata —
 * unlike /api/mcp/chatgpt, there is no pre-auth tools/list.
 */

import { describe, it, expect, afterEach } from "vitest";
import { POST as claudePost, GET as claudeGet } from "../route";

const SUPABASE_URL_KEY = "NEXT_PUBLIC_SUPABASE_URL";
const SUPABASE_KEY_KEY = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

describe("POST /api/mcp/claude", () => {
  afterEach(() => {
    delete process.env[SUPABASE_URL_KEY];
    delete process.env[SUPABASE_KEY_KEY];
  });

  it("demo mode -> 503 not_configured with the Claude MCP message", async () => {
    const res = await claudePost(
      new Request("https://app.example.com/api/mcp/claude", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
      })
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("not_configured");
    expect(body.message as string).toContain("Claude MCP");
  });

  it("live mode without a token -> 401 with WWW-Authenticate naming the Claude resource", async () => {
    process.env[SUPABASE_URL_KEY] = "https://test-project.supabase.co";
    process.env[SUPABASE_KEY_KEY] = "test-anon-key";
    const res = await claudePost(
      new Request("https://app.example.com/api/mcp/claude", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      })
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain(
      "Bearer resource_metadata="
    );
    expect(res.headers.get("WWW-Authenticate")).toContain(
      "/.well-known/oauth-protected-resource/api/mcp/claude"
    );
  });

  it("oversized body -> 413, invalid JSON -> 400 parse error", async () => {
    const big = await claudePost(
      new Request("https://app.example.com/api/mcp/claude", {
        method: "POST",
        body: "x".repeat(70 * 1024),
      })
    );
    expect(big.status).toBe(413);

    const bad = await claudePost(
      new Request("https://app.example.com/api/mcp/claude", {
        method: "POST",
        body: "{not json",
      })
    );
    expect(bad.status).toBe(400);
    const body = (await bad.json()) as { error: { code: number } };
    expect(body.error.code).toBe(-32700);
  });

  it("GET -> 405", async () => {
    const res = await claudeGet();
    expect(res.status).toBe(405);
  });
});
