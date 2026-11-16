/**
 * Real-adapter tests (Worker B) — injected fake repos, no network.
 *
 * Covers: reads return workspace-scoped data, writes perform the
 * action, sensitive sends return the recorded outcome (simulated in
 * demo, never a fake `sent`), missing scope -> 403 naming the scope,
 * unknown tool, invalid params, user isolation across workspaces,
 * duplicate sends with the same idempotency key -> a single record,
 * and audit entries for every call.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  NxtSendMuseConnectorAdapter,
  type MuseConnectorResult,
} from "../adapter";
import type { MuseAuditInput } from "../audit";
import {
  FakeLeadsRepository,
  FakeCampaignsRepository,
  FakeInboxRepository,
  FakeUsageRepository,
  FakeIntegrationsRepository,
  FakeEmailAdapter,
  makeLead,
  makeCampaign,
  makeConversation,
  makeMessage,
} from "./fakes";

const WS_A = "ws_a";
const WS_B = "ws_b";
const ALL_SCOPES = ["muse.read", "muse.write", "muse.send"];

// Test helper: tool results are untyped JSON payloads by design.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function okData(result: MuseConnectorResult): Record<string, any> {
  expect(result.status).toBe("ok");
  if (result.status !== "ok") throw new Error("expected ok");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return result.data as Record<string, any>;
}

function errData(result: MuseConnectorResult) {
  expect(result.status).toBe("error");
  if (result.status !== "error") throw new Error("expected error");
  return result;
}

describe("NxtSendMuseConnectorAdapter", () => {
  let leads: FakeLeadsRepository;
  let campaigns: FakeCampaignsRepository;
  let inbox: FakeInboxRepository;
  let usage: FakeUsageRepository;
  let integrations: FakeIntegrationsRepository;
  let email: FakeEmailAdapter;
  let audits: MuseAuditInput[];
  let adapter: NxtSendMuseConnectorAdapter;

  beforeEach(() => {
    leads = new FakeLeadsRepository();
    campaigns = new FakeCampaignsRepository();
    inbox = new FakeInboxRepository();
    usage = new FakeUsageRepository();
    integrations = new FakeIntegrationsRepository();
    email = new FakeEmailAdapter();
    audits = [];
    adapter = new NxtSendMuseConnectorAdapter({
      leads,
      campaigns,
      inbox,
      usage,
      integrations,
      emailAdapter: email,
      draftFn: async (input) => ({
        status: "simulated",
        provider: null,
        draft: `Draft for ${input.stepType} (${input.channel})`,
        aiGenerated: false,
        message: "Demo draft.",
      }),
      auditFn: async (entry) => {
        audits.push(entry);
      },
      mode: "demo",
    });
    leads.leads.push(
      makeLead({ workspace_id: WS_A, email: "ana@example.com", first_name: "Ana", tags: ["vip"] }),
      makeLead({ workspace_id: WS_A, email: "bo@example.com", first_name: "Bo" }),
      makeLead({ workspace_id: WS_B, email: "cy@example.com", first_name: "Cy" })
    );
    campaigns.campaigns.push(
      makeCampaign({ workspace_id: WS_A, name: "A campaign", status: "active" }),
      makeCampaign({ workspace_id: WS_B, name: "B campaign", status: "active" })
    );
    integrations.integrations.push({
      id: "int_1",
      workspace_id: WS_A,
      provider: "resend",
      status: "connected",
      config: { apiKey: "secret-that-must-never-appear" },
      updated_at: new Date().toISOString(),
    } as never);
  });

  const callerA = { subject: "user_a", scopes: ALL_SCOPES, workspaceId: WS_A };

  it("list_leads returns only the grant workspace's leads", async () => {
    const data = okData(await adapter.handleToolCall("list_leads", {}, callerA));
    expect(data.total).toBe(2);
    expect((data.leads as Array<{ email: string }>).map((l) => l.email)).toEqual(
      expect.arrayContaining(["ana@example.com", "bo@example.com"])
    );
    expect(JSON.stringify(data)).not.toContain("cy@example.com");
  });

  it("get_lead is isolated: user A cannot read user B's lead", async () => {
    const bLead = leads.leads.find((l) => l.workspace_id === WS_B)!;
    const err = errData(await adapter.handleToolCall("get_lead", { leadId: bLead.id }, callerA));
    expect(err.httpStatus).toBe(404);
    expect(err.code).toBe("not_found");
  });

  it("create_lead creates and deduplicates by email", async () => {
    const created = okData(
      await adapter.handleToolCall("create_lead", { email: "new@example.com", firstName: "New" }, callerA)
    );
    expect(created.duplicate).toBe(false);
    expect(created.lead.email).toBe("new@example.com");
    const dupe = okData(
      await adapter.handleToolCall("create_lead", { email: "ANA@example.com", firstName: "Ana2" }, callerA)
    );
    expect(dupe.duplicate).toBe(true);
    expect(dupe.lead.email).toBe("ana@example.com");
    expect(leads.leads.filter((l) => l.workspace_id === WS_A).length).toBe(3);
  });

  it("update_lead and delete_lead perform the action, workspace-scoped", async () => {
    const ana = leads.leads.find((l) => l.email === "ana@example.com")!;
    const updated = okData(
      await adapter.handleToolCall("update_lead", { leadId: ana.id, company: "NewCo" }, callerA)
    );
    expect(updated.lead.company).toBe("NewCo");
    const deleted = okData(await adapter.handleToolCall("delete_lead", { leadId: ana.id }, callerA));
    expect(deleted.deleted).toBe(true);
    expect(leads.leads.some((l) => l.id === ana.id)).toBe(false);
  });

  it("list_campaigns + get_campaign_activity return real records with stats", async () => {
    const listed = okData(await adapter.handleToolCall("list_campaigns", {}, callerA));
    expect(listed.total).toBe(1);
    expect(listed.campaigns[0].name).toBe("A campaign");
    expect(listed.campaigns[0].enrollments).toBe(0);
    const activity = okData(
      await adapter.handleToolCall(
        "get_campaign_activity",
        { campaignId: campaigns.campaigns[0].id },
        callerA
      )
    );
    expect(activity.campaign.id).toBe(campaigns.campaigns[0].id);
    expect(Array.isArray(activity.activity)).toBe(true);
    // Stats come from real records (or null when no source) — never invented.
    expect(activity.stats === null || typeof activity.stats === "object").toBe(true);
    if (activity.stats) expect(activity.stats.prospects).toBe(0);
  });

  it("user A cannot read user B's campaign activity", async () => {
    const bCamp = campaigns.campaigns.find((c) => c.workspace_id === WS_B)!;
    const err = errData(
      await adapter.handleToolCall("get_campaign_activity", { campaignId: bCamp.id }, callerA)
    );
    expect(err.httpStatus).toBe(404);
  });

  it("create_campaign creates a DRAFT only and validates steps", async () => {
    const created = okData(
      await adapter.handleToolCall(
        "create_campaign",
        {
          name: "Drafty",
          channel: "email",
          steps: [{ step_type: "email", delay_hours: 0, content: "Hi" }],
        },
        callerA
      )
    );
    expect(created.campaign.status).toBe("draft");
    expect(created.campaign.type).toBe("email");
    const noSteps = errData(
      await adapter.handleToolCall("create_campaign", { name: "X", channel: "email", steps: [] }, callerA)
    );
    expect(noSteps.code).toBe("invalid_params");
    const emptyEmail = errData(
      await adapter.handleToolCall(
        "create_campaign",
        { name: "X", channel: "email", steps: [{ step_type: "email", delay_hours: 0, content: "  " }] },
        callerA
      )
    );
    expect(emptyEmail.httpStatus).toBe(400);
  });

  it("pause/resume/archive follow the existing status transitions only", async () => {
    const camp = campaigns.campaigns.find((c) => c.workspace_id === WS_A)!;
    const paused = okData(await adapter.handleToolCall("pause_campaign", { campaignId: camp.id }, callerA));
    expect(paused.campaign.status).toBe("paused");
    const pauseAgain = errData(await adapter.handleToolCall("pause_campaign", { campaignId: camp.id }, callerA));
    expect(pauseAgain.httpStatus).toBe(400);
    const resumed = okData(await adapter.handleToolCall("resume_campaign", { campaignId: camp.id }, callerA));
    expect(resumed.campaign.status).toBe("active");
    const archived = okData(await adapter.handleToolCall("archive_campaign", { campaignId: camp.id }, callerA));
    expect(archived.campaign.status).toBe("archived");
  });

  it("draft_outreach_message returns text only, never a send", async () => {
    const data = okData(
      await adapter.handleToolCall(
        "draft_outreach_message",
        { channel: "email", stepType: "email", campaignName: "Launch" },
        callerA
      )
    );
    expect(data.draft).toContain("Draft for email");
    expect(data.reviewRequired).toBe(true);
    expect(email.calls.length).toBe(0);
  });

  it("send_email returns the recorded outcome (simulated in demo, never fake sent)", async () => {
    const data = okData(
      await adapter.handleToolCall(
        "send_email",
        { to: "ana@example.com", subject: "Hi", body: "Hello Ana", idempotencyKey: "k1" },
        callerA
      )
    );
    expect(data.outcome).toBe("simulated");
    expect(data.status).toBe("SUCCESS");
    expect(data.providerMessageId).toBeNull();
    expect(email.calls.length).toBe(1);
    expect(email.calls[0].to).toBe("ana@example.com");
  });

  it("duplicate send_email with the same idempotency key creates a single record", async () => {
    const input = { to: "bo@example.com", subject: "Hi", body: "Hello Bo", idempotencyKey: "dup-key" };
    const first = okData(await adapter.handleToolCall("send_email", input, callerA));
    const second = okData(await adapter.handleToolCall("send_email", input, callerA));
    expect(second.duplicate).toBe(true);
    expect(second.messageId).toBe(first.messageId);
    expect(email.calls.length).toBe(1);
    expect(inbox.messages.filter((m) => m.idempotency_key === "dup-key").length).toBe(1);
  });

  it("send_inbox_reply sends email threads and refuses LinkedIn with 422", async () => {
    const conv = makeConversation({ workspace_id: WS_A, channel: "email", contact_email: "ana@example.com" });
    inbox.conversations.push(conv);
    inbox.messages.push(
      makeMessage({ workspace_id: WS_A, conversation_id: conv.id, direction: "inbound", content: "Hi there" })
    );
    const data = okData(
      await adapter.handleToolCall(
        "send_inbox_reply",
        { conversationId: conv.id, body: "Thanks!", idempotencyKey: "r1" },
        callerA
      )
    );
    expect(data.outcome).toBe("simulated");
    expect(data.status).toBe("SUCCESS");

    const li = makeConversation({ workspace_id: WS_A, channel: "linkedin", contact_email: "" });
    inbox.conversations.push(li);
    const err = errData(
      await adapter.handleToolCall(
        "send_inbox_reply",
        { conversationId: li.id, body: "Hi", idempotencyKey: "r2" },
        callerA
      )
    );
    expect(err.httpStatus).toBe(422);
    expect(err.code).toBe("linkedin_unavailable");
  });

  it("list_conversations / get_conversation work and mark the thread read", async () => {
    const conv = makeConversation({ workspace_id: WS_A, channel: "email", contact_email: "ana@example.com" });
    inbox.conversations.push(conv);
    inbox.messages.push(
      makeMessage({ workspace_id: WS_A, conversation_id: conv.id, direction: "inbound", content: "Ping" })
    );
    const listed = okData(await adapter.handleToolCall("list_conversations", {}, callerA));
    expect(listed.total).toBe(1);
    expect(listed.conversations[0].unread).toBe(true);
    const thread = okData(await adapter.handleToolCall("get_conversation", { conversationId: conv.id }, callerA));
    expect(thread.messages.length).toBe(1);
    expect(thread.markedRead).toBe(1);
  });

  it("get_usage_summary and get_integration_statuses return redacted data", async () => {
    const usageData = okData(await adapter.handleToolCall("get_usage_summary", {}, callerA));
    expect(usageData.usage.plan).toBe("growth");
    const ints = okData(await adapter.handleToolCall("get_integration_statuses", {}, callerA));
    expect(ints.integrations.length).toBe(1);
    expect(ints.integrations[0].provider).toBe("resend");
    expect(JSON.stringify(ints)).not.toContain("secret-that-must-never-appear");
    expect("config" in ints.integrations[0]).toBe(false);
  });

  it("missing scope -> 403 naming the missing scope", async () => {
    const readOnly = { subject: "user_a", scopes: ["muse.read"], workspaceId: WS_A };
    const err = errData(
      await adapter.handleToolCall("create_lead", { email: "x@example.com" }, readOnly)
    );
    expect(err.httpStatus).toBe(403);
    expect(err.code).toBe("missing_scope");
    expect(err.message).toContain("muse.write");
    const sendErr = errData(
      await adapter.handleToolCall(
        "send_email",
        { to: "a@example.com", subject: "s", body: "b" },
        { subject: "user_a", scopes: ["muse.read", "muse.write"], workspaceId: WS_A }
      )
    );
    expect(sendErr.httpStatus).toBe(403);
    expect(sendErr.message).toContain("muse.send");
  });

  it("unknown tool and invalid params are errors, not crashes", async () => {
    const unknown = errData(await adapter.handleToolCall("nope", {}, callerA));
    expect(unknown.code).toBe("unknown_tool");
    expect(unknown.httpStatus).toBe(404);
    const bad = errData(
      await adapter.handleToolCall("create_lead", { email: "not-an-email" }, callerA)
    );
    expect(bad.code).toBe("invalid_params");
    expect(bad.httpStatus).toBe(400);
  });

  it("every tool call records an audit entry", async () => {
    await adapter.handleToolCall("list_leads", {}, callerA);
    await adapter.handleToolCall("create_lead", { email: "bad" }, callerA);
    expect(audits.length).toBe(2);
    expect(audits[0].action).toBe("muse.tool.list_leads");
    expect(audits[0].workspaceId).toBe(WS_A);
    expect(audits[1].action).toBe("muse.tool.create_lead");
    expect(audits[1].details).toContain("invalid_params");
  });

  it("healthCheck is honest about mode and OAuth state", async () => {
    const health = okData(await adapter.healthCheck());
    expect(health.mode).toBe("demo");
    expect(health.toolCount).toBe(18);
    expect(health.oauthConfigured).toBe(false);
    expect(health.email).toBe("demo");
  });
});
