/**
 * Shared REST API tests — the new n8n-only functions plus
 * platform-parameterisation of the moved ones.
 *
 * Covers: lead DELETE (n8n-only, workspace isolation, audit),
 * campaign sequence get/replace (validation + replace), scheduled
 * follow-ups (schedule/list/cancel + ownership), execution
 * status (shape + 404), and the platform label in audit
 * resources / emit sources (n8n vs Zapier parity). All through
 * the repo fakes — no database, no network.
 */

import { describe, it, expect } from "vitest";
import {
  FakeLeadsRepository,
  FakeCampaignsRepository,
  FakeInboxRepository,
  FakeAccountsRepository,
  FakeUsageRepository,
  FakeScheduledRepliesRepository,
  FakeEmailAdapter,
  makeLead,
  makeCampaign,
  makeConversation,
} from "@/lib/muse-connector/__tests__/fakes";
import { sendInboxReply } from "@/lib/inbox/reply";
import { InMemoryPlatformStore } from "../outbox";
import { N8N_PLATFORM, ZAPIER_PLATFORM } from "../config";
import type { RestApiDeps } from "../api";
import {
  restAuthTest,
  restCreateLead,
  restDeleteLead,
  restGetAccount,
  restGetAccountStatus,
  restGetCampaignSequence,
  restReplaceCampaignSteps,
  restListScheduledFollowUps,
  restScheduleFollowUp,
  restCancelFollowUp,
  restGetSequenceExecutionStatus,
  parseListParams,
} from "../api";
import type { MuseAccessContext } from "@/lib/muse-connector/oauth/tokens";

const WS_A = "ws_a";
const WS_B = "ws_b";
const USER_A = "user_a";

function ctx(workspaceId = WS_A): MuseAccessContext {
  return {
    userId: USER_A,
    workspaceId,
    scopes: ["n8n.read", "n8n.write"],
    clientId: "n8n_client",
    grantId: `n8n_client:${USER_A}`,
    resource: "https://nxtsend.com/api/integrations/n8n",
  };
}

interface Harness {
  deps: RestApiDeps;
  leads: FakeLeadsRepository;
  campaigns: FakeCampaignsRepository;
  inbox: FakeInboxRepository;
  scheduled: FakeScheduledRepliesRepository;
  emitted: Array<{ type: string; workspaceId: string; data: Record<string, unknown> }>;
  audits: Array<{ action: string; resource: string }>;
}

function harness(): Harness {
  const leads = new FakeLeadsRepository();
  const campaigns = new FakeCampaignsRepository();
  const inbox = new FakeInboxRepository();
  const accounts = new FakeAccountsRepository();
  const usage = new FakeUsageRepository();
  const scheduled = new FakeScheduledRepliesRepository();
  const store = new InMemoryPlatformStore("n8n");
  const emitted: Harness["emitted"] = [];
  const audits: Harness["audits"] = [];
  const adapter = new FakeEmailAdapter();
  const deps: RestApiDeps = {
    platform: N8N_PLATFORM,
    leads,
    campaigns,
    inbox,
    accounts,
    usage,
    scheduledReplies: scheduled,
    mode: "demo",
    store,
    emit: async (type, workspaceId, data) => {
      emitted.push({ type, workspaceId, data });
    },
    sendReply: (args) => sendInboxReply({ repo: inbox, adapter }, args),
    getUserLabel: async (userId) => ({ id: userId, email: "owner@example.com" }),
    getWorkspaceLabel: async (workspaceId) => ({ id: workspaceId, name: "Acme Workspace" }),
    audit: async (input) => {
      audits.push({ action: input.action, resource: input.resource });
    },
  };
  return { deps, leads, campaigns, inbox, scheduled, emitted, audits };
}

function seedCampaign(h: Harness) {
  const campaign = makeCampaign({ workspace_id: WS_A, status: "draft" });
  h.campaigns.campaigns.push(campaign);
  return campaign;
}

// ── lead DELETE ─────────────────────────────────────────────────────────────

describe("restDeleteLead", () => {
  it("deletes a lead in the workspace and audits with the n8n prefix", async () => {
    const h = harness();
    const lead = makeLead({ workspace_id: WS_A, email: "gone@example.com" });
    h.leads.leads.push(lead);
    const res = await restDeleteLead(ctx(), h.deps, lead.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: lead.id, deleted: true });
    expect(h.leads.leads.find((l) => l.id === lead.id)).toBeUndefined();
    expect(h.audits).toContainEqual({
      action: "lead_deleted",
      resource: `n8n:lead:${lead.id}`,
    });
  });

  it("404s for a lead in another workspace (never deletes across workspaces)", async () => {
    const h = harness();
    const lead = makeLead({ workspace_id: WS_B, email: "other@example.com" });
    h.leads.leads.push(lead);
    const res = await restDeleteLead(ctx(), h.deps, lead.id);
    expect(res.status).toBe(404);
    expect(h.leads.leads.find((l) => l.id === lead.id)).toBeDefined();
    expect(h.audits).toEqual([]);
  });

  it("404s for an unknown id", async () => {
    const h = harness();
    const res = await restDeleteLead(ctx(), h.deps, "nope");
    expect(res.status).toBe(404);
  });
});

// ── platform parameterisation ───────────────────────────────────────────────

describe("platform labels", () => {
  it("n8n creates emit with source n8n_api and audit resource n8n:…", async () => {
    const h = harness();
    const res = await restCreateLead(ctx(), h.deps, {
      email: "new@example.com",
      first_name: "New",
    });
    expect(res.status).toBe(201);
    expect(h.emitted[0]?.data.source).toBe("n8n_api");
    expect(h.audits[0]).toEqual({
      action: "lead_created",
      resource: expect.stringMatching(/^n8n:lead:/),
    });
  });

  it("the same function under Zapier emits zapier_api and audits zapier:…", async () => {
    const h = harness();
    h.deps.platform = ZAPIER_PLATFORM;
    const res = await restCreateLead(ctx(), h.deps, {
      email: "z@example.com",
      first_name: "Zed",
    });
    expect(res.status).toBe(201);
    expect(h.emitted[0]?.data.source).toBe("zapier_api");
    expect(h.audits[0]).toEqual({
      action: "lead_created",
      resource: expect.stringMatching(/^zapier:lead:/),
    });
  });

  it("auth/test returns the n8n scopes untouched", async () => {
    const h = harness();
    const res = await restAuthTest(ctx(), h.deps);
    expect(res.status).toBe(200);
    expect(res.body.scopes).toEqual(["n8n.read", "n8n.write"]);
  });
});

// ── campaign sequence ───────────────────────────────────────────────────────

describe("restGetCampaignSequence / restReplaceCampaignSteps", () => {
  it("returns steps in order, 404 for an unknown campaign", async () => {
    const h = harness();
    const campaign = seedCampaign(h);
    await h.campaigns.replaceCampaignSteps(campaign.id, [
      { step_type: "email", delay_hours: 0, content: "Hello" },
      { step_type: "wait", delay_hours: 24 },
    ]);
    const res = await restGetCampaignSequence(ctx(), h.deps, campaign.id);
    expect(res.status).toBe(200);
    const body = res.body as { steps: Array<{ step_type: string; step_order: number }> };
    expect(body.steps.map((s) => s.step_type)).toEqual(["email", "wait"]);
    expect(body.steps.map((s) => s.step_order)).toEqual([1, 2]);
    const missing = await restGetCampaignSequence(ctx(), h.deps, "nope");
    expect(missing.status).toBe(404);
  });

  it("replaces the whole sequence and audits", async () => {
    const h = harness();
    const campaign = seedCampaign(h);
    await h.campaigns.replaceCampaignSteps(campaign.id, [
      { step_type: "email", delay_hours: 0, content: "Old" },
    ]);
    const res = await restReplaceCampaignSteps(ctx(), h.deps, campaign.id, {
      steps: [
        { step_type: "email", delay_hours: 0, subject: "Hi", content: "New one" },
        { step_type: "wait", delay_hours: 48 },
      ],
    });
    expect(res.status).toBe(200);
    const body = res.body as { steps: Array<{ content?: string }> };
    expect(body.steps).toHaveLength(2);
    expect(body.steps[0].content).toBe("New one");
    expect(h.audits).toContainEqual({
      action: "campaign_sequence_replaced",
      resource: `n8n:campaign:${campaign.id}`,
    });
  });

  it("rejects empty steps, bad step types and content-less email steps", async () => {
    const h = harness();
    const campaign = seedCampaign(h);
    expect((await restReplaceCampaignSteps(ctx(), h.deps, campaign.id, { steps: [] })).status).toBe(400);
    expect(
      (await restReplaceCampaignSteps(ctx(), h.deps, campaign.id, {
        steps: [{ step_type: "teleport", delay_hours: 0 }],
      })).status
    ).toBe(400);
    expect(
      (await restReplaceCampaignSteps(ctx(), h.deps, campaign.id, {
        steps: [{ step_type: "email", delay_hours: 0, content: "  " }],
      })).status
    ).toBe(400);
    expect((await restReplaceCampaignSteps(ctx(), h.deps, "nope", { steps: [{ step_type: "wait" }] })).status).toBe(404);
  });
});

// ── scheduled follow-ups ────────────────────────────────────────────────────

describe("scheduled follow-ups", () => {
  function seedConversation(h: Harness) {
    const conv = makeConversation({ workspace_id: WS_A });
    h.inbox.conversations.push(conv);
    return conv;
  }

  it("schedules, lists and cancels a follow-up", async () => {
    const h = harness();
    const campaign = seedCampaign(h);
    const conv = seedConversation(h);
    const scheduled = await restScheduleFollowUp(ctx(), h.deps, campaign.id, {
      conversation_id: conv.id,
      body: "Checking in",
      scheduled_at: "2026-11-20T10:00:00.000Z",
    });
    expect(scheduled.status).toBe(201);
    const followUp = (scheduled.body as { follow_up: { id: string; status: string } }).follow_up;
    expect(followUp.status).toBe("scheduled");
    expect(h.audits).toContainEqual({
      action: "follow_up_scheduled",
      resource: `n8n:campaign:${campaign.id}`,
    });

    const listed = await restListScheduledFollowUps(ctx(), h.deps, campaign.id);
    expect(listed.status).toBe(200);
    expect((listed.body as { count: number }).count).toBe(1);

    const cancelled = await restCancelFollowUp(ctx(), h.deps, campaign.id, followUp.id);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toEqual({ id: followUp.id, cancelled: true });
    // A cancelled follow-up is gone from the upcoming list, and a
    // second cancel 404s.
    expect((await restListScheduledFollowUps(ctx(), h.deps, campaign.id)).body).toMatchObject({ count: 0 });
    expect((await restCancelFollowUp(ctx(), h.deps, campaign.id, followUp.id)).status).toBe(404);
  });

  it("refuses unknown campaigns, unknown conversations and bad input", async () => {
    const h = harness();
    const campaign = seedCampaign(h);
    const conv = seedConversation(h);
    expect((await restScheduleFollowUp(ctx(), h.deps, "nope", { conversation_id: conv.id, body: "x", scheduled_at: "2026-11-20T10:00:00Z" })).status).toBe(404);
    expect((await restScheduleFollowUp(ctx(), h.deps, campaign.id, { conversation_id: "nope", body: "x", scheduled_at: "2026-11-20T10:00:00Z" })).status).toBe(404);
    expect((await restScheduleFollowUp(ctx(), h.deps, campaign.id, { conversation_id: conv.id, body: "  ", scheduled_at: "2026-11-20T10:00:00Z" })).status).toBe(400);
    expect((await restScheduleFollowUp(ctx(), h.deps, campaign.id, { conversation_id: conv.id, body: "x", scheduled_at: "not-a-date" })).status).toBe(400);
    expect((await restListScheduledFollowUps(ctx(), h.deps, "nope")).status).toBe(404);
    expect((await restCancelFollowUp(ctx(), h.deps, campaign.id, "nope")).status).toBe(404);
  });
});

// ── execution status ────────────────────────────────────────────────────────

describe("restGetSequenceExecutionStatus", () => {
  it("returns a zero summary (never invented numbers) for a campaign with no executions", async () => {
    const h = harness();
    const campaign = seedCampaign(h);
    const res = await restGetSequenceExecutionStatus(ctx(), h.deps, campaign.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      campaign_id: campaign.id,
      status: "draft",
      executions: { total: 0, by_status: {}, steps: [] },
    });
  });

  it("404s for an unknown campaign", async () => {
    const h = harness();
    expect((await restGetSequenceExecutionStatus(ctx(), h.deps, "nope")).status).toBe(404);
  });
});

// ── account get / status (n8n-only) ──────────────────────────────────────────

describe("restGetAccount / restGetAccountStatus", () => {
  async function seedAccount(h: Harness, over: Record<string, unknown> = {}) {
    const account = await h.deps.accounts.createAccount(WS_A, {
      channel: "linkedin",
      provider: "linkedin",
      display_name: "Test LinkedIn",
      handle_or_email: "test-linkedin",
    } as never);
    // createAccount only takes identity fields — apply state overrides
    // directly to the stored row (createAccount returns the same
    // object reference the fake stores).
    Object.assign(account, over);
    return account;
  }

  it("returns the account for its workspace", async () => {
    const h = harness();
    const account = await seedAccount(h);
    const res = await restGetAccount(ctx(), h.deps, account.id);
    expect(res.status).toBe(200);
    expect((res.body as { account: { id: string } }).account.id).toBe(account.id);
  });

  it("404s for an unknown account and for another workspace's account", async () => {
    const h = harness();
    const account = await seedAccount(h);
    expect((await restGetAccount(ctx(), h.deps, "nope")).status).toBe(404);
    expect((await restGetAccount(ctx(WS_B), h.deps, account.id)).status).toBe(404);
  });

  it("status reports the recorded state, connected only when status is connected", async () => {
    const h = harness();
    const connected = await seedAccount(h);
    const res = await restGetAccountStatus(ctx(), h.deps, connected.id);
    expect(res.status).toBe(200);
    const status = (res.body as { account_status: Record<string, unknown> }).account_status;
    expect(status.account_id).toBe(connected.id);
    expect(status.auth_status).toBe("ok");
    expect(status.connected).toBe(true);

    const broken = await seedAccount(h, { status: "error", auth_status: "error" });
    const res2 = await restGetAccountStatus(ctx(), h.deps, broken.id);
    const status2 = (res2.body as { account_status: Record<string, unknown> }).account_status;
    expect(status2.connected).toBe(false);
    expect(status2.auth_status).toBe("error");
  });

  it("status 404s for an unknown account", async () => {
    const h = harness();
    expect((await restGetAccountStatus(ctx(), h.deps, "nope")).status).toBe(404);
  });
});

// ── list params ─────────────────────────────────────────────────────────────

describe("parseListParams", () => {
  it("rejects out-of-range limits and bad cursors", () => {
    expect(parseListParams(new URLSearchParams("limit=0")).error?.status).toBe(400);
    expect(parseListParams(new URLSearchParams("limit=101")).error?.status).toBe(400);
    expect(parseListParams(new URLSearchParams("limit=abc")).error?.status).toBe(400);
    expect(parseListParams(new URLSearchParams("after=not-a-date")).error?.status).toBe(400);
    expect(parseListParams(new URLSearchParams("limit=10")).limit).toBe(10);
  });
});
