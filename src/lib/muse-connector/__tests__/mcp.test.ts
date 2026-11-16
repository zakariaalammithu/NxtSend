/**
 * MCP handler tests (Worker B) — handleMcpRequest with injected fakes.
 *
 * Covers: initialize handshake, ping, notifications no-op, tools/list
 * (18 manifest tools with classifications), read/write/sensitive tool
 * calls, missing scope -> isError naming the scope, unknown tool ->
 * -32601, invalid params -> -32602, unauthenticated -> 401 with
 * WWW-Authenticate, user isolation across workspaces, rate limit
 * (121st call -> 429), demo mode -> 503.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { handleMcpRequest, type McpHandleOptions } from "../mcp";
import { NxtSendMuseConnectorAdapter } from "../adapter";
import { createRateLimiter } from "@/lib/admin/submissions-core";
import type { MuseGrantContext } from "../tokens";
import {
  FakeLeadsRepository,
  FakeCampaignsRepository,
  FakeInboxRepository,
  FakeUsageRepository,
  FakeIntegrationsRepository,
  FakeEmailAdapter,
  makeLead,
  makeCampaign,
} from "./fakes";

const WS_A = "ws_a";
const WS_B = "ws_b";

const CTX_A: MuseGrantContext = {
  userId: "user_a",
  workspaceId: WS_A,
  scopes: ["muse.read", "muse.write", "muse.send"],
  clientId: "client_1",
  grantId: "grant_a",
};
const CTX_B: MuseGrantContext = {
  userId: "user_b",
  workspaceId: WS_B,
  scopes: ["muse.read", "muse.write", "muse.send"],
  clientId: "client_1",
  grantId: "grant_b",
};

// Test helpers: JSON-RPC payloads are untyped JSON by design.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rpcResult(body: unknown): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = body as Record<string, any>;
  expect(b.jsonrpc).toBe("2.0");
  expect(b.error).toBeUndefined();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return b.result as Record<string, any>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rpcError(body: unknown): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = body as Record<string, any>;
  expect(b.error).toBeDefined();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return b.error as Record<string, any>;
}

describe("handleMcpRequest", () => {
  let leads: FakeLeadsRepository;
  let campaigns: FakeCampaignsRepository;
  let email: FakeEmailAdapter;

  function baseOpts(over: Partial<McpHandleOptions> = {}): McpHandleOptions {
    return {
      mode: "supabase",
      mcpEnabled: true,
      request: new Request("https://app.example.com/api/mcp"),
      body: { jsonrpc: "2.0", id: 1, method: "ping" },
      resolveContext: async () => CTX_A,
      createAdapter: () =>
        new NxtSendMuseConnectorAdapter({
          leads,
          campaigns,
          inbox: new FakeInboxRepository(),
          usage: new FakeUsageRepository(),
          integrations: new FakeIntegrationsRepository(),
          emailAdapter: email,
          draftFn: async () => ({
            status: "simulated",
            provider: null,
            draft: "draft text",
            aiGenerated: false,
            message: "Demo draft.",
          }),
          auditFn: async () => {},
          mode: "demo",
        }),
      ...over,
    };
  }

  beforeEach(() => {
    leads = new FakeLeadsRepository();
    campaigns = new FakeCampaignsRepository();
    email = new FakeEmailAdapter();
    leads.leads.push(
      makeLead({ workspace_id: WS_A, email: "ana@example.com", first_name: "Ana" }),
      makeLead({ workspace_id: WS_B, email: "cy@example.com", first_name: "Cy" })
    );
    campaigns.campaigns.push(
      makeCampaign({ workspace_id: WS_A, name: "A campaign", status: "active" }),
      makeCampaign({ workspace_id: WS_B, name: "B campaign", status: "active" })
    );
  });

  it("initialize negotiates the protocol and identifies the server", async () => {
    const res = await handleMcpRequest(
      baseOpts({
        body: {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "muse", version: "1" } },
        },
      })
    );
    expect(res.status).toBe(200);
    const result = rpcResult(res.body);
    expect(result.protocolVersion).toBe("2025-06-18");
    expect(result.serverInfo.name).toBe("nxtsend-mcp");
    expect(result.capabilities.tools).toBeDefined();
  });

  it("ping returns an empty result and notifications are a 202 no-op", async () => {
    const ping = await handleMcpRequest(baseOpts());
    expect(ping.status).toBe(200);
    expect(rpcResult(ping.body)).toEqual({});

    const notif = await handleMcpRequest(
      baseOpts({ body: { jsonrpc: "2.0", method: "notifications/initialized" } })
    );
    expect(notif.status).toBe(202);
    expect(notif.body).toBeNull();
  });

  it("tools/list returns the 18 manifest tools with classifications in the description", async () => {
    const res = await handleMcpRequest(
      baseOpts({ body: { jsonrpc: "2.0", id: 2, method: "tools/list" } })
    );
    const result = rpcResult(res.body);
    expect(result.tools.length).toBe(18);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = result.tools as Array<Record<string, any>>;
    const byName = new Map(tools.map((t) => [t.name as string, t]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = (name: string): Record<string, any> => {
      const entry = byName.get(name);
      expect(entry).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return entry as Record<string, any>;
    };
    for (const name of ["list_leads", "send_email", "delete_lead", "draft_outreach_message"]) {
      expect(byName.has(name)).toBe(true);
      expect(tool(name).inputSchema).toBeDefined();
    }
    expect(tool("send_email").description).toContain("[Sensitive write]");
    expect(tool("list_leads").description).toContain("[Read]");
    expect(tool("create_lead").description).toContain("[Write]");
    expect(tool("delete_lead").description).toContain("[Sensitive write]");
  });

  it("tools/call read returns data; write performs the action", async () => {
    const read = await handleMcpRequest(
      baseOpts({
        body: {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "list_leads", arguments: {} },
        },
      })
    );
    const readResult = rpcResult(read.body);
    expect(readResult.isError).toBe(false);
    expect(readResult.structuredContent.total).toBe(1);

    const write = await handleMcpRequest(
      baseOpts({
        body: {
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: { name: "create_lead", arguments: { email: "new@example.com", firstName: "New" } },
        },
      })
    );
    const writeResult = rpcResult(write.body);
    expect(writeResult.isError).toBe(false);
    expect(leads.leads.filter((l) => l.workspace_id === WS_A).length).toBe(2);
  });

  it("tools/call send returns the recorded outcome (simulated, never fake sent)", async () => {
    const res = await handleMcpRequest(
      baseOpts({
        body: {
          jsonrpc: "2.0",
          id: 5,
          method: "tools/call",
          params: {
            name: "send_email",
            arguments: { to: "ana@example.com", subject: "Hi", body: "Hello" },
          },
        },
      })
    );
    const result = rpcResult(res.body);
    expect(result.isError).toBe(false);
    expect(result.structuredContent.outcome).toBe("simulated");
    expect(result.structuredContent.providerMessageId).toBeNull();
    expect(email.calls.length).toBe(1);
  });

  it("missing scope -> isError naming the scope", async () => {
    const res = await handleMcpRequest(
      baseOpts({
        resolveContext: async () => ({ ...CTX_A, scopes: ["muse.read"] }),
        body: {
          jsonrpc: "2.0",
          id: 6,
          method: "tools/call",
          params: { name: "create_lead", arguments: { email: "x@example.com" } },
        },
      })
    );
    const result = rpcResult(res.body);
    expect(result.isError).toBe(true);
    expect(result.structuredContent.code).toBe("missing_scope");
    expect(result.structuredContent.message).toContain("muse.write");
    expect(result.structuredContent.status).toBe("BLOCKED");
  });

  it("unknown tool -> -32601, invalid params -> -32602, unknown method -> -32601", async () => {
    const unknown = await handleMcpRequest(
      baseOpts({
        body: { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "nope", arguments: {} } },
      })
    );
    expect(rpcError(unknown.body).code).toBe(-32601);

    const invalid = await handleMcpRequest(
      baseOpts({
        body: {
          jsonrpc: "2.0",
          id: 8,
          method: "tools/call",
          params: { name: "create_lead", arguments: { email: "not-an-email" } },
        },
      })
    );
    expect(rpcError(invalid.body).code).toBe(-32602);

    const method = await handleMcpRequest(
      baseOpts({ body: { jsonrpc: "2.0", id: 9, method: "resources/list" } })
    );
    expect(rpcError(method.body).code).toBe(-32601);
  });

  it("unauthenticated -> 401 with WWW-Authenticate naming the protected resource", async () => {
    const res = await handleMcpRequest(
      baseOpts({ resolveContext: async () => null })
    );
    expect(res.status).toBe(401);
    expect(res.headers?.["WWW-Authenticate"]).toContain("Bearer resource_metadata=");
    expect(res.headers?.["WWW-Authenticate"]).toContain("/.well-known/oauth-protected-resource/api/mcp");
    expect(rpcError(res.body).code).toBe(-32001);
  });

  it("user isolation: workspace B cannot read workspace A's campaign via MCP", async () => {
    const aCamp = campaigns.campaigns.find((c) => c.workspace_id === WS_A)!;
    const res = await handleMcpRequest(
      baseOpts({
        resolveContext: async () => CTX_B,
        body: {
          jsonrpc: "2.0",
          id: 10,
          method: "tools/call",
          params: { name: "get_campaign_activity", arguments: { campaignId: aCamp.id } },
        },
      })
    );
    const result = rpcResult(res.body);
    expect(result.isError).toBe(true);
    expect(result.structuredContent.code).toBe("not_found");
  });

  it("rate limit: the 121st call in a minute -> 429 with Retry-After", async () => {
    const limiter = createRateLimiter({ maxAttempts: 120, windowMs: 60_000 });
    const opts = baseOpts({ rateLimiter: limiter, nowMs: () => 1_000_000 });
    for (let i = 0; i < 120; i++) {
      const res = await handleMcpRequest({ ...opts, body: { jsonrpc: "2.0", id: i, method: "ping" } });
      expect(res.status).toBe(200);
    }
    const limited = await handleMcpRequest({ ...opts, body: { jsonrpc: "2.0", id: 121, method: "ping" } });
    expect(limited.status).toBe(429);
    expect(limited.headers?.["Retry-After"]).toBe("60");
  });

  it("demo mode -> 503 not_configured, never the demo persona", async () => {
    const res = await handleMcpRequest(baseOpts({ mode: "demo" }));
    expect(res.status).toBe(503);
    expect((res.body as Record<string, unknown>).error).toBe("not_configured");
  });

  it("malformed body -> -32600, disabled MCP -> 503", async () => {
    const bad = await handleMcpRequest(baseOpts({ body: "not-an-object" }));
    expect(bad.status).toBe(400);
    expect(rpcError(bad.body).code).toBe(-32600);
    const disabled = await handleMcpRequest(baseOpts({ mcpEnabled: false }));
    expect(disabled.status).toBe(503);
  });
});
