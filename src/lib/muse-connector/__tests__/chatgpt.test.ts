/**
 * ChatGPT flavor tests (Worker B) — handleMcpRequest with
 * flavor: "chatgpt" (/api/mcp/chatgpt).
 *
 * Covers: tools/list WITHOUT a token (tools visible, each annotated
 * as requiring OAuth, no data leaked), initialize returns
 * instructions (first 512 chars carry the key guidance) and runs
 * without a token, tool call without a token -> 401 with
 * WWW-Authenticate, call with insufficient scope -> structured
 * reconnect prompt (normal tool result, isError true, no transport
 * error), structuredContent present on tool results, annotations
 * correct on every tool, profile tool returns grant identity +
 * _meta["openai/profile"], search/fetch, user isolation, rate limit,
 * duplicate send idempotency, widget resource list/read (unauthenticated
 * read refused), demo mode -> 503. The Muse flavor keeps requiring a
 * token for tools/list.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { handleMcpRequest, type McpHandleOptions, MCP_SERVER_INSTRUCTIONS } from "../mcp";
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
  scopes: ["muse.read", "muse.write", "muse.send"],
  clientId: "client_1",
  grantId: "grant_a",
  resource: "https://nxtsend.com/api/mcp",
};
const CTX_READ_ONLY: MuseGrantContext = {
  userId: "user_a",
  workspaceId: WS_A,
  scopes: ["muse.read"],
  clientId: "client_1",
  grantId: "grant_a",
  resource: "https://nxtsend.com/api/mcp",
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

describe("handleMcpRequest (chatgpt flavor)", () => {
  let leads: FakeLeadsRepository;
  let campaigns: FakeCampaignsRepository;
  let inbox: FakeInboxRepository;
  let email: FakeEmailAdapter;

  function baseOpts(over: Partial<McpHandleOptions> = {}): McpHandleOptions {
    return {
      mode: "supabase",
      mcpEnabled: true,
      request: new Request("https://app.example.com/api/mcp/chatgpt"),
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
      flavor: "chatgpt",
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

  it("tools/list without a token: tools visible, each annotated as requiring OAuth, no data leaked", async () => {
    const res = await handleMcpRequest(
      baseOpts({
        resolveContext: async () => null,
        body: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      })
    );
    expect(res.status).toBe(200);
    const result = rpcResult(res.body);
    expect(result.tools.length).toBe(54);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const tool of result.tools as Array<Record<string, any>>) {
      expect(tool.description).toContain("Requires OAuth");
      expect(tool._meta.requiresOAuth).toBe(true);
    }
    // No workspace data in a discovery response.
    expect(JSON.stringify(res.body)).not.toContain("ana@example.com");
    expect(JSON.stringify(res.body)).not.toContain("A campaign");
  });

  it("initialize without a token returns instructions; first 512 chars carry the key guidance", async () => {
    const res = await handleMcpRequest(
      baseOpts({
        resolveContext: async () => null,
        body: {
          jsonrpc: "2.0",
          id: 2,
          method: "initialize",
          params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "chatgpt", version: "1" } },
        },
      })
    );
    expect(res.status).toBe(200);
    const result = rpcResult(res.body);
    expect(result.instructions).toBe(MCP_SERVER_INSTRUCTIONS);
    const head = (result.instructions as string).slice(0, 512);
    expect(head).toContain("Confirm the exact lead, campaign, or conversation ID");
    expect(head).toContain("LinkedIn sends are NOT supported");
    expect(head).toContain("explicit confirmation");
    expect(head).toContain("connected workspace");
  });

  it("tool call without a token -> 401 with WWW-Authenticate", async () => {
    const res = await handleMcpRequest(
      baseOpts({
        resolveContext: async () => null,
        body: {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "list_leads", arguments: {} },
        },
      })
    );
    expect(res.status).toBe(401);
    expect(res.headers?.["WWW-Authenticate"]).toContain("Bearer resource_metadata=");
    expect(rpcError(res.body).code).toBe(-32001);
  });

  it("call with insufficient scope -> structured reconnect prompt, not a transport error", async () => {
    const res = await handleMcpRequest(
      baseOpts({
        resolveContext: async () => CTX_READ_ONLY,
        body: {
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: { name: "create_lead", arguments: { email: "x@example.com" } },
        },
      })
    );
    // A normal tool result (HTTP 200, JSON-RPC result, no error).
    expect(res.status).toBe(200);
    const result = rpcResult(res.body);
    expect(result.isError).toBe(true);
    expect(result.structuredContent.code).toBe("missing_scope");
    expect(result.structuredContent.status).toBe("BLOCKED");
    expect(result.structuredContent.reconnect).toBe(true);
    expect(result.structuredContent.requiredScope).toBe("muse.write");
    expect(result.structuredContent.message).toContain("reconnect");
    expect(result.structuredContent.message).toContain("muse.write");
    expect(result.content[0].text).toContain("reconnect");
  });

  it("tool results carry structuredContent alongside content", async () => {
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

  it("annotations are correct on every tool", async () => {
    const res = await handleMcpRequest(
      baseOpts({ body: { jsonrpc: "2.0", id: 6, method: "tools/list" } })
    );
    const result = rpcResult(res.body);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = result.tools as Array<Record<string, any>>;
    const byName = new Map(tools.map((t) => [t.name as string, t]));
    const destructive = new Set([
      "delete_lead",
      "delete_campaign",
      "send_email",
      "send_inbox_reply",
    ]);
    for (const tool of tools) {
      const name = tool.name as string;
      const annotations = tool.annotations as Record<string, unknown>;
      expect(annotations).toBeDefined();
      expect(annotations.openWorldHint).toBe(false);
      expect(annotations.destructiveHint).toBe(destructive.has(name));
      // readOnlyHint is true ONLY for tools that cannot change state.
      // get_conversation is the one Read tool that changes state
      // (opening marks inbound messages read).
      const isRead = (tool.description as string).startsWith("[Read]");
      if (name === "get_conversation") {
        expect(annotations.readOnlyHint).toBe(false);
      } else {
        expect(annotations.readOnlyHint).toBe(isRead);
      }
    }
    // Spot-check the profile + render tools carry their _meta.
    expect(byName.get("get_profile")?._meta["openai/profile"]).toBe(true);
    expect(byName.get("render_campaigns_widget")?._meta.ui.resourceUri).toBe(
      "ui://widget/campaigns.html"
    );
    expect(
      byName.get("render_campaigns_widget")?._meta["openai/outputTemplate"]
    ).toBe("ui://widget/campaigns.html");
  });

  it("get_profile returns the grant identity and _meta openai/profile", async () => {
    const res = await handleMcpRequest(
      baseOpts({
        body: {
          jsonrpc: "2.0",
          id: 7,
          method: "tools/call",
          params: { name: "get_profile", arguments: {} },
        },
      })
    );
    const result = rpcResult(res.body);
    expect(result.isError).toBe(false);
    expect(result.structuredContent.userId).toBe("user_a");
    expect(result.structuredContent.workspaceId).toBe("ws_a");
    expect(result.structuredContent.scopes).toEqual([
      "muse.read",
      "muse.write",
      "muse.send",
    ]);
    expect(result.structuredContent.clientId).toBe("client_1");
    expect(result.structuredContent.grantId).toBe("grant_a");
    expect(result._meta["openai/profile"]).toBe(true);
  });

  it("search finds leads and campaigns; fetch returns the record", async () => {
    const searched = await handleMcpRequest(
      baseOpts({
        body: {
          jsonrpc: "2.0",
          id: 8,
          method: "tools/call",
          params: { name: "search", arguments: { query: "Ana" } },
        },
      })
    );
    const searchResult = rpcResult(searched.body);
    expect(searchResult.structuredContent.total).toBe(1);
    const hit = searchResult.structuredContent.hits[0];
    expect(hit.type).toBe("lead");
    expect(hit.id).toBe(leads.leads[0].id);
    expect(hit.url).toBe("/dashboard/leads");

    const fetched = await handleMcpRequest(
      baseOpts({
        body: {
          jsonrpc: "2.0",
          id: 9,
          method: "tools/call",
          params: { name: "fetch", arguments: { id: hit.id } },
        },
      })
    );
    const fetchResult = rpcResult(fetched.body);
    expect(fetchResult.structuredContent.type).toBe("lead");
    expect(fetchResult.structuredContent.record.email).toBe("ana@example.com");

    const missing = await handleMcpRequest(
      baseOpts({
        body: {
          jsonrpc: "2.0",
          id: 10,
          method: "tools/call",
          params: { name: "fetch", arguments: { id: "nope" } },
        },
      })
    );
    const missingResult = rpcResult(missing.body);
    expect(missingResult.isError).toBe(true);
    expect(missingResult.structuredContent.code).toBe("not_found");
  });

  it("user isolation: workspace B cannot read workspace A's lead via ChatGPT", async () => {
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
          id: 11,
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

  it("duplicate send with the same idempotency key sends once", async () => {
    const args = {
      to: "ana@example.com",
      subject: "Hi",
      body: "Hello",
      idempotencyKey: "test-key-1",
    };
    const first = await handleMcpRequest(
      baseOpts({
        body: { jsonrpc: "2.0", id: 12, method: "tools/call", params: { name: "send_email", arguments: args } },
      })
    );
    expect(rpcResult(first.body).structuredContent.duplicate).toBe(false);
    const second = await handleMcpRequest(
      baseOpts({
        body: { jsonrpc: "2.0", id: 13, method: "tools/call", params: { name: "send_email", arguments: args } },
      })
    );
    const secondResult = rpcResult(second.body);
    expect(secondResult.structuredContent.duplicate).toBe(true);
    expect(secondResult.structuredContent.outcome).toBe("simulated");
    expect(email.calls.length).toBe(1);
  });

  it("resources/list without a token serves the widget resource; resources/read needs a token", async () => {
    const list = await handleMcpRequest(
      baseOpts({
        resolveContext: async () => null,
        body: { jsonrpc: "2.0", id: 14, method: "resources/list" },
      })
    );
    expect(list.status).toBe(200);
    const listResult = rpcResult(list.body);
    expect(listResult.resources.length).toBe(1);
    expect(listResult.resources[0].uri).toBe("ui://widget/campaigns.html");
    expect(listResult.resources[0].mimeType).toBe("text/html;profile=mcp-app");
    expect(listResult.resources[0]._meta.ui.prefersBorder).toBe(true);

    const readNoAuth = await handleMcpRequest(
      baseOpts({
        resolveContext: async () => null,
        body: {
          jsonrpc: "2.0",
          id: 15,
          method: "resources/read",
          params: { uri: "ui://widget/campaigns.html" },
        },
      })
    );
    expect(readNoAuth.status).toBe(401);

    const read = await handleMcpRequest(
      baseOpts({
        body: {
          jsonrpc: "2.0",
          id: 16,
          method: "resources/read",
          params: { uri: "ui://widget/campaigns.html" },
        },
      })
    );
    expect(read.status).toBe(200);
    const readResult = rpcResult(read.body);
    const content = readResult.contents[0];
    expect(content.uri).toBe("ui://widget/campaigns.html");
    expect(content.mimeType).toBe("text/html;profile=mcp-app");
    expect(content.text).toContain("NxtSend campaigns");
    expect(content.text).toContain("window.openai");
    expect(content.text).toContain("toolOutput");
    expect(content._meta.ui.prefersBorder).toBe(true);

    const unknown = await handleMcpRequest(
      baseOpts({
        body: {
          jsonrpc: "2.0",
          id: 17,
          method: "resources/read",
          params: { uri: "ui://widget/other.html" },
        },
      })
    );
    expect(rpcError(unknown.body).code).toBe(-32602);
  });

  it("render_campaigns_widget result carries the widget _meta", async () => {
    const res = await handleMcpRequest(
      baseOpts({
        body: {
          jsonrpc: "2.0",
          id: 18,
          method: "tools/call",
          params: {
            name: "render_campaigns_widget",
            arguments: {
              campaignIds: [campaigns.campaigns[0].id],
              campaigns: [
                { id: campaigns.campaigns[0].id, name: "A campaign", status: "active", type: "email" },
              ],
            },
          },
        },
      })
    );
    const result = rpcResult(res.body);
    expect(result.isError).toBe(false);
    expect(result._meta.ui.resourceUri).toBe("ui://widget/campaigns.html");
    expect(result._meta["openai/outputTemplate"]).toBe("ui://widget/campaigns.html");
    expect(result.structuredContent.campaigns[0].name).toBe("A campaign");
  });

  it("demo mode -> 503 not_configured on the chatgpt flavor too", async () => {
    const res = await handleMcpRequest(baseOpts({ mode: "demo" }));
    expect(res.status).toBe(503);
    expect((res.body as Record<string, unknown>).error).toBe("not_configured");
  });

  it("muse flavor still requires a token for tools/list", async () => {
    const res = await handleMcpRequest(
      baseOpts({
        flavor: "muse",
        resolveContext: async () => null,
        body: { jsonrpc: "2.0", id: 19, method: "tools/list" },
      })
    );
    expect(res.status).toBe(401);
  });
});
