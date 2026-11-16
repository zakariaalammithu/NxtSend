/**
 * Claude flavor tests — handleMcpRequest with flavor: "claude"
 * (/api/mcp/claude).
 *
 * Covers: tools/list WITHOUT a token -> 401 with WWW-Authenticate
 * naming the Claude protected-resource metadata (unlike ChatGPT's
 * pre-auth list), initialize without a token -> 401, initialize with
 * a token returns Claude instructions + prompts/resources
 * capabilities, tool call with a valid token works, insufficient
 * scope -> Muse-style structured missing_scope error (NOT the
 * ChatGPT reconnect prompt), structuredContent present on tool
 * results, annotations correct on every tool, prompts/list +
 * prompts/get (valid/invalid args), resources/list + resources/read
 * auth behaviour incl. the nxtsend://account resource, user
 * isolation, rate limit, demo mode -> 503 with the "Claude MCP"
 * message. The Muse and ChatGPT flavors keep their exact prior
 * behaviour.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  handleMcpRequest,
  type McpHandleOptions,
  MCP_CLAUDE_SERVER_INSTRUCTIONS,
  NXT_SEND_ACCOUNT_RESOURCE_URI,
} from "../mcp";
import { NxtSendMuseConnectorAdapter } from "../adapter";
import { createRateLimiter } from "@/lib/admin/submissions-core";
import type { MuseGrantContext } from "../tokens";
import {
  FakeLeadsRepository,
  FakeCampaignsRepository,
  FakeInboxRepository,
  FakeUsageRepository,
  FakeIntegrationsRepository,
  FakeAccountsRepository,
  FakeSafetySettingsRepository,
  FakeScheduledRepliesRepository,
  FakeEmailAdapter,
  makeLead,
  makeCampaign,
} from "./fakes";

const WS_A = "ws_a";
const WS_B = "ws_b";

const CTX_A: MuseGrantContext = {
  userId: "user_a",
  workspaceId: WS_A,
  scopes: ["claude.read", "claude.write", "claude.send"],
  clientId: "client_1",
  grantId: "grant_a",
  resource: "https://nxtsend.com/api/mcp/claude",
};
const CTX_READ_ONLY: MuseGrantContext = {
  userId: "user_a",
  workspaceId: WS_A,
  scopes: ["claude.read"],
  clientId: "client_1",
  grantId: "grant_a",
  resource: "https://nxtsend.com/api/mcp/claude",
};

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

describe("handleMcpRequest (claude flavor)", () => {
  let leads: FakeLeadsRepository;
  let campaigns: FakeCampaignsRepository;
  let inbox: FakeInboxRepository;
  let email: FakeEmailAdapter;

  function baseOpts(over: Partial<McpHandleOptions> = {}): McpHandleOptions {
    return {
      mode: "supabase",
      mcpEnabled: true,
      request: new Request("https://app.example.com/api/mcp/claude"),
      body: { jsonrpc: "2.0", id: 1, method: "ping" },
      resolveContext: async () => CTX_A,
      createAdapter: () =>
        new NxtSendMuseConnectorAdapter({
          leads,
          campaigns,
          inbox,
          usage: new FakeUsageRepository(),
          integrations: new FakeIntegrationsRepository(),
          accounts: new FakeAccountsRepository(),
          safetySettings: new FakeSafetySettingsRepository(),
          scheduledReplies: new FakeScheduledRepliesRepository(),
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
      flavor: "claude",
      ...over,
    };
  }

  beforeEach(() => {
    leads = new FakeLeadsRepository();
    campaigns = new FakeCampaignsRepository();
    inbox = new FakeInboxRepository();
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

  it("tools/list without a token -> 401 with WWW-Authenticate naming the Claude resource", async () => {
    const res = await handleMcpRequest(
      baseOpts({
        resolveContext: async () => null,
        body: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      })
    );
    expect(res.status).toBe(401);
    expect(res.headers?.["WWW-Authenticate"]).toContain("Bearer resource_metadata=");
    expect(res.headers?.["WWW-Authenticate"]).toContain(
      "/.well-known/oauth-protected-resource/api/mcp/claude"
    );
    expect(rpcError(res.body).code).toBe(-32001);
  });

  it("initialize without a token -> 401 (no ChatGPT-style pre-auth discovery)", async () => {
    const res = await handleMcpRequest(
      baseOpts({
        resolveContext: async () => null,
        body: {
          jsonrpc: "2.0",
          id: 2,
          method: "initialize",
          params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude", version: "1" } },
        },
      })
    );
    expect(res.status).toBe(401);
  });

  it("initialize with a token returns Claude instructions + prompts/resources capabilities", async () => {
    const res = await handleMcpRequest(
      baseOpts({
        body: {
          jsonrpc: "2.0",
          id: 3,
          method: "initialize",
          params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude", version: "1" } },
        },
      })
    );
    expect(res.status).toBe(200);
    const result = rpcResult(res.body);
    expect(result.instructions).toBe(MCP_CLAUDE_SERVER_INSTRUCTIONS);
    const head = (result.instructions as string).slice(0, 512);
    expect(head).toContain("Confirm the exact lead, campaign, or conversation ID");
    expect(head).toContain("LinkedIn sends are NOT supported");
    expect(head).toContain("explicit confirmation");
    expect(head).toContain("connected workspace");
    expect(result.capabilities.tools).toBeDefined();
    expect(result.capabilities.prompts).toBeDefined();
    expect(result.capabilities.resources).toBeDefined();
    expect(result.serverInfo.name).toBe("nxtsend-mcp");
    expect(result.protocolVersion).toBe("2025-06-18");
  });

  it("tools/list with a token returns the same 54 tools with the same annotations", async () => {
    const res = await handleMcpRequest(
      baseOpts({ body: { jsonrpc: "2.0", id: 4, method: "tools/list" } })
    );
    expect(res.status).toBe(200);
    const result = rpcResult(res.body);
    expect(result.tools.length).toBe(54);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = result.tools as Array<Record<string, any>>;
    const byName = new Map(tools.map((t) => [t.name as string, t]));
    expect(byName.get("list_leads")).toBeDefined();
    expect(byName.get("send_email")).toBeDefined();
    // No LinkedIn-send tool exists.
    expect(Array.from(byName.keys()).some((n) => n.includes("linkedin") && n.includes("send"))).toBe(false);
    expect(byName.has("send_linkedin_message")).toBe(false);
    expect(byName.has("send_linkedin_connection")).toBe(false);
    // Annotations: destructive tools are marked, read tools are read-only.
    const destructive = new Set([
      "delete_lead",
      "delete_campaign",
      "send_email",
      "send_inbox_reply",
    ]);
    for (const tool of tools) {
      const annotations = tool.annotations as Record<string, unknown>;
      expect(annotations.openWorldHint).toBe(false);
      expect(annotations.destructiveHint).toBe(destructive.has(tool.name as string));
    }
    // No tool is annotated as requiring OAuth here: the caller is authenticated.
    expect(JSON.stringify(result.tools)).not.toContain("Requires OAuth");
  });

  it("tool call with a valid token works and carries structuredContent", async () => {
    const res = await handleMcpRequest(
      baseOpts({
        body: {
          jsonrpc: "2.0",
          id: 5,
          method: "tools/call",
          params: { name: "list_leads", arguments: {} },
        },
      })
    );
    const result = rpcResult(res.body);
    expect(result.isError).toBe(false);
    expect(result.structuredContent.total).toBe(1);
    expect(result.content[0].type).toBe("text");
    expect(JSON.parse(result.content[0].text).total).toBe(1);
  });

  it("call with insufficient scope -> Muse-style structured error, NOT a reconnect prompt", async () => {
    const res = await handleMcpRequest(
      baseOpts({
        resolveContext: async () => CTX_READ_ONLY,
        body: {
          jsonrpc: "2.0",
          id: 6,
          method: "tools/call",
          params: { name: "create_lead", arguments: { email: "x@example.com" } },
        },
      })
    );
    expect(res.status).toBe(200);
    const result = rpcResult(res.body);
    expect(result.isError).toBe(true);
    expect(result.structuredContent.code).toBe("missing_scope");
    expect(result.structuredContent.status).toBe("BLOCKED");
    // The adapter names the required tier by its canonical scope
    // (muse.write) — the same naming the ChatGPT reconnect prompt
    // uses today. The tier check itself is prefix-agnostic: a
    // claude.write grant would satisfy it.
    expect(result.structuredContent.message).toContain("muse.write");
    // The ChatGPT reconnect shape (reconnect: true) is NOT used here.
    expect(result.structuredContent.reconnect).toBeUndefined();
  });

  it("demo mode -> 503 not_configured with the Claude MCP message", async () => {
    const res = await handleMcpRequest(baseOpts({ mode: "demo" }));
    expect(res.status).toBe(503);
    expect((res.body as Record<string, unknown>).error).toBe("not_configured");
    expect((res.body as Record<string, unknown>).message as string).toContain("Claude MCP");
    expect((res.body as Record<string, unknown>).message as string).toContain("Demo Mode");
  });

  it("disabled flag -> 503 naming CLAUDE_MCP_ENABLED", async () => {
    const res = await handleMcpRequest(baseOpts({ mcpEnabled: false }));
    expect(res.status).toBe(503);
    expect((res.body as Record<string, unknown>).message as string).toContain("CLAUDE_MCP_ENABLED");
  });

  it("user isolation: workspace B cannot read workspace A's lead via Claude", async () => {
    const aLead = leads.leads.find((l) => l.workspace_id === WS_A)!;
    const res = await handleMcpRequest(
      baseOpts({
        resolveContext: async () => ({
          ...CTX_A,
          userId: "user_b",
          workspaceId: WS_B,
          grantId: "grant_b",
        }),
        body: {
          jsonrpc: "2.0",
          id: 7,
          method: "tools/call",
          params: { name: "get_lead", arguments: { leadId: aLead.id } },
        },
      })
    );
    const result = rpcResult(res.body);
    expect(result.isError).toBe(true);
    expect(result.structuredContent.code).toBe("not_found");
  });

  it("rate limit: the 121st call in a minute -> 429", async () => {
    const limiter = createRateLimiter({ maxAttempts: 120, windowMs: 60_000 });
    const opts = baseOpts({ rateLimiter: limiter, nowMs: () => 1_000_000 });
    for (let i = 0; i < 120; i++) {
      const res = await handleMcpRequest({ ...opts, body: { jsonrpc: "2.0", id: i, method: "ping" } });
      expect(res.status).toBe(200);
    }
    const limited = await handleMcpRequest({ ...opts, body: { jsonrpc: "2.0", id: 121, method: "ping" } });
    expect(limited.status).toBe(429);
  });

  it("claude.* scopes satisfy the same tiers as muse.* scopes", async () => {
    // A grant holding only claude.read can read; a muse.read grant
    // would do the same — the tier check is prefix-agnostic.
    const res = await handleMcpRequest(
      baseOpts({
        body: {
          jsonrpc: "2.0",
          id: 8,
          method: "tools/call",
          params: { name: "list_campaigns", arguments: {} },
        },
      })
    );
    expect(rpcResult(res.body).isError).toBe(false);
  });

  // ── Prompts ───────────────────────────────────────────────────────────────

  it("prompts/list returns the 4 reusable prompts with validated argument shapes", async () => {
    const res = await handleMcpRequest(
      baseOpts({ body: { jsonrpc: "2.0", id: 9, method: "prompts/list" } })
    );
    expect(res.status).toBe(200);
    const result = rpcResult(res.body);
    expect(result.prompts.length).toBe(4);
    const names = (result.prompts as Array<{ name: string }>).map((p) => p.name);
    expect(names).toEqual([
      "campaign-performance-summary",
      "lead-follow-up-draft",
      "weekly-performance-report",
      "duplicate-lead-cleanup",
    ]);
    const byName = new Map(
      (result.prompts as Array<{ name: string; arguments: Array<{ name: string; required: boolean }> }>).map((p) => [p.name, p])
    );
    expect(byName.get("campaign-performance-summary")!.arguments).toEqual([
      { name: "campaign", description: expect.any(String), required: true },
    ]);
    expect(byName.get("duplicate-lead-cleanup")!.arguments).toEqual([]);
    for (const prompt of result.prompts as Array<{ description: string }>) {
      expect(prompt.description).toContain("Template only");
    }
  });

  it("prompts/list without a token -> 401", async () => {
    const res = await handleMcpRequest(
      baseOpts({
        resolveContext: async () => null,
        body: { jsonrpc: "2.0", id: 10, method: "prompts/list" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("prompts/get renders a template message naming the argument; it never sends", async () => {
    const res = await handleMcpRequest(
      baseOpts({
        body: {
          jsonrpc: "2.0",
          id: 11,
          method: "prompts/get",
          params: { name: "lead-follow-up-draft", arguments: { leadId: "lead_1" } },
        },
      })
    );
    const result = rpcResult(res.body);
    expect(result.description).toContain("Template only");
    expect(result.messages.length).toBe(1);
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content.type).toBe("text");
    expect(result.messages[0].content.text).toContain("lead_1");
    expect(result.messages[0].content.text).toContain("never send");
    expect(result.messages[0].content.text).toContain("get_lead");
    // No data is fetched into the prompt: the lead's email is not in it.
    expect(result.messages[0].content.text).not.toContain("ana@example.com");
  });

  it("prompts/get for a data prompt tells the model which tools to call, with no invented numbers", async () => {
    const res = await handleMcpRequest(
      baseOpts({
        body: {
          jsonrpc: "2.0",
          id: 12,
          method: "prompts/get",
          params: { name: "campaign-performance-summary", arguments: { campaign: "A campaign" } },
        },
      })
    );
    const result = rpcResult(res.body);
    const text = result.messages[0].content.text as string;
    expect(text).toContain("A campaign");
    expect(text).toContain("get_campaign_performance");
    expect(text).toContain("Do not invent numbers");
  });

  it("prompts/get with no arguments works for the argument-less cleanup prompt", async () => {
    const res = await handleMcpRequest(
      baseOpts({
        body: {
          jsonrpc: "2.0",
          id: 13,
          method: "prompts/get",
          params: { name: "duplicate-lead-cleanup" },
        },
      })
    );
    const result = rpcResult(res.body);
    const text = result.messages[0].content.text as string;
    expect(text).toContain("detect_duplicate_leads");
    expect(text).toContain("Do not merge or delete anything");
  });

  it("prompts/get rejects a missing required argument, an unknown argument and an unknown prompt", async () => {
    const missing = await handleMcpRequest(
      baseOpts({
        body: {
          jsonrpc: "2.0",
          id: 14,
          method: "prompts/get",
          params: { name: "campaign-performance-summary", arguments: {} },
        },
      })
    );
    expect(rpcError(missing.body).code).toBe(-32602);
    expect(rpcError(missing.body).message).toContain("campaign");

    const blank = await handleMcpRequest(
      baseOpts({
        body: {
          jsonrpc: "2.0",
          id: 15,
          method: "prompts/get",
          params: { name: "lead-follow-up-draft", arguments: { leadId: "   " } },
        },
      })
    );
    expect(rpcError(blank.body).code).toBe(-32602);

    const unknownArg = await handleMcpRequest(
      baseOpts({
        body: {
          jsonrpc: "2.0",
          id: 16,
          method: "prompts/get",
          params: { name: "lead-follow-up-draft", arguments: { leadId: "lead_1", send: true } },
        },
      })
    );
    expect(rpcError(unknownArg.body).code).toBe(-32602);

    const unknownPrompt = await handleMcpRequest(
      baseOpts({
        body: {
          jsonrpc: "2.0",
          id: 17,
          method: "prompts/get",
          params: { name: "send-everything", arguments: {} },
        },
      })
    );
    expect(rpcError(unknownPrompt.body).code).toBe(-32602);
  });

  it("prompts are Claude-only: muse and chatgpt flavors answer method not found", async () => {
    for (const flavor of ["muse", "chatgpt"] as const) {
      const res = await handleMcpRequest(
        baseOpts({
          flavor,
          body: { jsonrpc: "2.0", id: 18, method: "prompts/list" },
        })
      );
      expect(rpcError(res.body).code).toBe(-32601);
      const get = await handleMcpRequest(
        baseOpts({
          flavor,
          body: {
            jsonrpc: "2.0",
            id: 19,
            method: "prompts/get",
            params: { name: "duplicate-lead-cleanup", arguments: {} },
          },
        })
      );
      expect(rpcError(get.body).code).toBe(-32601);
    }
  });

  // ── Resources ─────────────────────────────────────────────────────────────

  it("resources/list needs a token and returns the widget + account resources", async () => {
    const noAuth = await handleMcpRequest(
      baseOpts({
        resolveContext: async () => null,
        body: { jsonrpc: "2.0", id: 20, method: "resources/list" },
      })
    );
    expect(noAuth.status).toBe(401);

    const list = await handleMcpRequest(
      baseOpts({ body: { jsonrpc: "2.0", id: 21, method: "resources/list" } })
    );
    const result = rpcResult(list.body);
    expect(result.resources.length).toBe(2);
    expect(result.resources[0].uri).toBe("ui://widget/campaigns.html");
    expect(result.resources[1].uri).toBe(NXT_SEND_ACCOUNT_RESOURCE_URI);
    expect(result.resources[1].mimeType).toBe("application/json");
  });

  it("resources/read serves the widget and the account resource; the account carries no secrets", async () => {
    const widget = await handleMcpRequest(
      baseOpts({
        body: {
          jsonrpc: "2.0",
          id: 22,
          method: "resources/read",
          params: { uri: "ui://widget/campaigns.html" },
        },
      })
    );
    const widgetResult = rpcResult(widget.body);
    expect(widgetResult.contents[0].uri).toBe("ui://widget/campaigns.html");
    expect(widgetResult.contents[0].text).toContain("NxtSend campaigns");

    const account = await handleMcpRequest(
      baseOpts({
        body: {
          jsonrpc: "2.0",
          id: 23,
          method: "resources/read",
          params: { uri: NXT_SEND_ACCOUNT_RESOURCE_URI },
        },
      })
    );
    const accountResult = rpcResult(account.body);
    expect(accountResult.contents[0].uri).toBe(NXT_SEND_ACCOUNT_RESOURCE_URI);
    expect(accountResult.contents[0].mimeType).toBe("application/json");
    const data = JSON.parse(accountResult.contents[0].text);
    expect(data.userId).toBe("user_a");
    expect(data.workspaceId).toBe("ws_a");
    expect(data.clientId).toBe("client_1");
    expect(data.grantId).toBe("grant_a");
    expect(data.scopes).toEqual(["claude.read", "claude.write", "claude.send"]);
    expect(data.resource).toBe("https://nxtsend.com/api/mcp/claude");
    expect(JSON.stringify(data)).not.toContain("Bearer");
    expect(data.access_token).toBeUndefined();
    expect(data.plan).toBeUndefined();
  });

  it("resources/read without a token -> 401; unknown resource -> -32602", async () => {
    const noAuth = await handleMcpRequest(
      baseOpts({
        resolveContext: async () => null,
        body: {
          jsonrpc: "2.0",
          id: 24,
          method: "resources/read",
          params: { uri: NXT_SEND_ACCOUNT_RESOURCE_URI },
        },
      })
    );
    expect(noAuth.status).toBe(401);

    const unknown = await handleMcpRequest(
      baseOpts({
        body: {
          jsonrpc: "2.0",
          id: 25,
          method: "resources/read",
          params: { uri: "nxtsend://other" },
        },
      })
    );
    expect(rpcError(unknown.body).code).toBe(-32602);
  });

  it("chatgpt flavor still serves the account resource too (resources are shared)", async () => {
    const res = await handleMcpRequest(
      baseOpts({
        flavor: "chatgpt",
        body: {
          jsonrpc: "2.0",
          id: 26,
          method: "resources/read",
          params: { uri: NXT_SEND_ACCOUNT_RESOURCE_URI },
        },
      })
    );
    const result = rpcResult(res.body);
    expect(JSON.parse(result.contents[0].text).workspaceId).toBe("ws_a");
  });
});
