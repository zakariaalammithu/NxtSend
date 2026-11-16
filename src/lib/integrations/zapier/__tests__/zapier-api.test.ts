/**
 * Zapier REST API v1 tests.
 *
 * Covers: auth-test label shape, polling order/cursor/limit,
 * workspace isolation on every route, action validation +
 * email-dedup + idempotency replay on replies, cross-workspace
 * 403s (reads return 404 — a token from another workspace must
 * never see the row), demo refusal + rate limiting (in auth
 * tests, src/lib/integrations/zapier/__tests__/zapier-auth.test.ts).
 * All through the repo fakes — no database, no network.
 */

import { describe, it, expect } from "vitest";
import {
  FakeLeadsRepository,
  FakeCampaignsRepository,
  FakeInboxRepository,
  FakeAccountsRepository,
  FakeUsageRepository,
  FakeEmailAdapter,
  makeLead,
  makeCampaign,
  makeConversation,
  makeAccount,
} from "@/lib/muse-connector/__tests__/fakes";
import { sendInboxReply } from "@/lib/inbox/reply";
import { InMemoryZapierStore } from "../outbox";
import type { ZapierApiDeps } from "../api";
import {
  zapierAuthTest,
  zapierListLeads,
  zapierGetLead,
  zapierCreateLead,
  zapierUpdateLead,
  zapierImportLeads,
  zapierListCampaigns,
  zapierGetCampaign,
  zapierCreateCampaign,
  zapierUpdateCampaign,
  zapierCampaignAction,
  zapierCampaignPerformance,
  zapierAddLeadsToCampaign,
  zapierRemoveLeadFromCampaign,
  zapierListConversations,
  zapierGetConversation,
  zapierSendReply,
  zapierListAccounts,
  zapierGetUsage,
  zapierSearchLeads,
  zapierSearchCampaigns,
  zapierDropdownCampaigns,
  zapierDropdownLeadStatuses,
  zapierDropdownSequences,
  zapierSubscribeWebhook,
  zapierUnsubscribeWebhook,
  zapierListWebhookSubscriptions,
  parseListParams,
} from "../api";
import type { MuseAccessContext } from "@/lib/muse-connector/oauth/tokens";

const WS_A = "ws_a";
const WS_B = "ws_b";
const USER_A = "user_a";

function ctx(scopes: string[] = ["zapier.read", "zapier.write"], workspaceId = WS_A): MuseAccessContext {
  return {
    userId: USER_A,
    workspaceId,
    scopes: scopes as MuseAccessContext["scopes"],
    clientId: "zapier_client",
    grantId: `zapier_client:${USER_A}`,
    resource: "https://nxtsend.com/api/integrations/zapier",
  };
}

interface Harness {
  deps: ZapierApiDeps;
  leads: FakeLeadsRepository;
  campaigns: FakeCampaignsRepository;
  inbox: FakeInboxRepository;
  accounts: FakeAccountsRepository;
  emitted: Array<{ type: string; workspaceId: string; data: Record<string, unknown> }>;
  audits: Array<{ action: string; resource: string }>;
}

function harness(): Harness {
  const leads = new FakeLeadsRepository();
  const campaigns = new FakeCampaignsRepository();
  const inbox = new FakeInboxRepository();
  const accounts = new FakeAccountsRepository();
  const usage = new FakeUsageRepository();
  const zapierStore = new InMemoryZapierStore();
  const emitted: Harness["emitted"] = [];
  const audits: Harness["audits"] = [];
  const adapter = new FakeEmailAdapter();
  const deps: ZapierApiDeps = {
    leads,
    campaigns,
    inbox,
    accounts,
    usage,
    mode: "demo",
    zapierStore,
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
  return { deps, leads, campaigns, inbox, accounts, emitted, audits };
}

function seedLeads(h: Harness) {
  h.leads.leads.push(
    makeLead({ workspace_id: WS_A, email: "a@example.com", created_at: "2026-11-10T00:00:00.000Z", updated_at: "2026-11-12T00:00:00.000Z" }),
    makeLead({ workspace_id: WS_A, email: "b@example.com", created_at: "2026-11-11T00:00:00.000Z", updated_at: "2026-11-11T00:00:00.000Z" }),
    makeLead({ workspace_id: WS_A, email: "c@example.com", created_at: "2026-11-12T00:00:00.000Z", updated_at: "2026-11-13T00:00:00.000Z" }),
    makeLead({ workspace_id: WS_B, email: "other@example.com", created_at: "2026-11-13T00:00:00.000Z" })
  );
}

// ── auth/test ───────────────────────────────────────────────────────────────

describe("auth/test", () => {
  it("returns the workspace name + user email as the connection label", async () => {
    const h = harness();
    const res = await zapierAuthTest(ctx(), h.deps);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { id: USER_A, email: "owner@example.com" },
      workspace: { id: WS_A, name: "Acme Workspace" },
      scopes: ["zapier.read", "zapier.write"],
    });
    expect(JSON.stringify(res.body)).not.toContain("token");
  });
});

// ── Leads: polling ──────────────────────────────────────────────────────────

describe("leads polling", () => {
  it("lists newest first by created_at by default", async () => {
    const h = harness();
    seedLeads(h);
    const res = await zapierListLeads(ctx(), h.deps, new URLSearchParams());
    expect(res.status).toBe(200);
    const leads = res.body.leads as Array<{ email?: string }>;
    expect(leads.map((l) => l.email)).toEqual(["c@example.com", "b@example.com", "a@example.com"]);
    expect(res.body.count).toBe(3);
  });

  it("orders by updated_at_desc and honours the exclusive after cursor", async () => {
    const h = harness();
    seedLeads(h);
    const q = new URLSearchParams({ order: "updated_at_desc" });
    const first = await zapierListLeads(ctx(), h.deps, q);
    const leads = first.body.leads as Array<{ email?: string }>;
    expect(leads.map((l) => l.email)).toEqual(["c@example.com", "a@example.com", "b@example.com"]);
    const cursor = new URLSearchParams({
      order: "updated_at_desc",
      after: "2026-11-12T00:00:00.000Z",
      limit: "10",
    });
    const second = await zapierListLeads(ctx(), h.deps, cursor);
    const page2 = second.body.leads as Array<{ email?: string }>;
    expect(page2.map((l) => l.email)).toEqual(["b@example.com"]);
  });

  it("enforces limit 1–100 and rejects a bad cursor", async () => {
    const h = harness();
    seedLeads(h);
    const badLimit = await zapierListLeads(ctx(), h.deps, new URLSearchParams({ limit: "101" }));
    expect(badLimit.status).toBe(400);
    const badCursor = await zapierListLeads(ctx(), h.deps, new URLSearchParams({ after: "not-a-date" }));
    expect(badCursor.status).toBe(400);
    const one = await zapierListLeads(ctx(), h.deps, new URLSearchParams({ limit: "1" }));
    expect((one.body.leads as unknown[]).length).toBe(1);
    expect(parseListParams(new URLSearchParams({ limit: "0" })).error?.status).toBe(400);
  });

  it("never lists another workspace's leads", async () => {
    const h = harness();
    seedLeads(h);
    const res = await zapierListLeads(ctx(["zapier.read"], WS_B), h.deps, new URLSearchParams());
    const leads = res.body.leads as Array<{ email?: string }>;
    expect(leads.map((l) => l.email)).toEqual(["other@example.com"]);
    const missing = await zapierGetLead(ctx(), h.deps, h.leads.leads[3].id);
    expect(missing.status).toBe(404);
  });
});

// ── Leads: create / update / import ─────────────────────────────────────────

describe("leads mutations", () => {
  it("creates a lead, dedups by email (case-insensitive), and emits lead.created once", async () => {
    const h = harness();
    seedLeads(h);
    const created = await zapierCreateLead(ctx(), h.deps, {
      first_name: "New",
      email: "new@example.com",
      company: "NewCo",
    });
    expect(created.status).toBe(201);
    expect((created.body as { duplicate: boolean }).duplicate).toBe(false);
    const dup = await zapierCreateLead(ctx(), h.deps, {
      first_name: "New",
      email: "NEW@example.com",
    });
    expect(dup.status).toBe(200);
    expect((dup.body as { duplicate: boolean }).duplicate).toBe(true);
    expect(h.leads.leads.filter((l) => l.workspace_id === WS_A).length).toBe(4);
    expect(h.emitted.filter((e) => e.type === "lead.created").length).toBe(1);
    expect(h.audits.some((a) => a.action === "zapier.lead_created")).toBe(true);
  });

  it("refuses an invalid email", async () => {
    const h = harness();
    const res = await zapierCreateLead(ctx(), h.deps, { first_name: "No", email: "not-an-email" });
    expect(res.status).toBe(400);
    expect((res.body as { code: string }).code).toBe("invalid_email");
  });

  it("updates incl. status, verifies ownership first, and emits lead.updated with changed_fields", async () => {
    const h = harness();
    seedLeads(h);
    const target = h.leads.leads[0];
    const res = await zapierUpdateLead(ctx(), h.deps, target.id, {
      status: "contacted",
      company: "Renamed Co",
    });
    expect(res.status).toBe(200);
    expect((res.body.lead as { status: string }).status).toBe("contacted");
    expect(h.emitted).toHaveLength(1);
    expect(h.emitted[0].type).toBe("lead.updated");
    expect(h.emitted[0].data.changed_fields).toEqual(["company", "status"]);
    const other = await zapierUpdateLead(ctx(), h.deps, h.leads.leads[3].id, { status: "contacted" });
    expect(other.status).toBe(404);
    const bad = await zapierUpdateLead(ctx(), h.deps, target.id, { status: "nope" });
    expect(bad.status).toBe(400);
  });

  it("imports in bulk with created/skipped counts and email dedup", async () => {
    const h = harness();
    seedLeads(h);
    const res = await zapierImportLeads(ctx(), h.deps, {
      leads: [
        { first_name: "D", email: "d@example.com" },
        { first_name: "Dup", email: "a@example.com" },
        { first_name: "Bad", email: "nope" },
        { first_name: "D2", email: "d@example.com" },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(1);
    expect(res.body.skipped).toBe(3);
    expect(h.emitted.filter((e) => e.type === "lead.created").length).toBe(1);
  });
});

// ── Campaigns ───────────────────────────────────────────────────────────────

describe("campaigns", () => {
  function seedCampaign(h: Harness, status: "draft" | "active" | "paused" | "archived" = "draft") {
    const campaign = makeCampaign({ workspace_id: WS_A, status });
    h.campaigns.campaigns.push(campaign);
    return campaign;
  }

  it("creates draft-only and refuses an explicit active status", async () => {
    const h = harness();
    const created = await zapierCreateCampaign(ctx(), h.deps, {
      name: "Outreach",
      type: "email",
      steps: [{ step_type: "email", delay_hours: 0, content: "Hi" }],
    });
    expect(created.status).toBe(201);
    expect((created.body.campaign as { status: string }).status).toBe("draft");
    expect(h.emitted.some((e) => e.type === "campaign.created")).toBe(true);
    const launch = await zapierCreateCampaign(ctx(), h.deps, {
      name: "Launch",
      type: "email",
      status: "active",
      steps: [{ step_type: "email", delay_hours: 0, content: "Hi" }],
    });
    expect(launch.status).toBe(400);
  });

  it("validates steps like the MCP adapter", async () => {
    const h = harness();
    const noSteps = await zapierCreateCampaign(ctx(), h.deps, { name: "X", type: "email", steps: [] });
    expect(noSteps.status).toBe(400);
    const badType = await zapierCreateCampaign(ctx(), h.deps, {
      name: "X",
      type: "email",
      steps: [{ step_type: "teleport", delay_hours: 0 }],
    });
    expect(badType.status).toBe(400);
    const emptyContent = await zapierCreateCampaign(ctx(), h.deps, {
      name: "X",
      type: "email",
      steps: [{ step_type: "email", delay_hours: 0, content: "  " }],
    });
    expect(emptyContent.status).toBe(400);
  });

  it("enforces pause/resume/stop transition rules (MCP requiredFrom)", async () => {
    const h = harness();
    const draft = seedCampaign(h, "draft");
    expect((await zapierCampaignAction(ctx(), h.deps, draft.id, "pause")).status).toBe(400);
    expect((await zapierCampaignAction(ctx(), h.deps, draft.id, "resume")).status).toBe(400);
    const active = seedCampaign(h, "active");
    const paused = await zapierCampaignAction(ctx(), h.deps, active.id, "pause");
    expect(paused.status).toBe(200);
    expect((paused.body.campaign as { status: string }).status).toBe("paused");
    const resumed = await zapierCampaignAction(ctx(), h.deps, active.id, "resume");
    expect(resumed.status).toBe(200);
    const stopped = await zapierCampaignAction(ctx(), h.deps, active.id, "stop");
    expect(stopped.status).toBe(200);
    expect((stopped.body.campaign as { status: string }).status).toBe("archived");
    expect((await zapierCampaignAction(ctx(), h.deps, active.id, "stop")).status).toBe(400);
    expect(h.emitted.filter((e) => e.type === "campaign.status_changed").length).toBe(3);
    const other = seedCampaign(h, "active");
    h.campaigns.campaigns[h.campaigns.campaigns.length - 1].workspace_id = WS_B;
    expect((await zapierCampaignAction(ctx(), h.deps, other.id, "pause")).status).toBe(404);
  });

  it("PATCH routes a status through the same transition rules", async () => {
    const h = harness();
    const active = seedCampaign(h, "active");
    const res = await zapierUpdateCampaign(ctx(), h.deps, active.id, { status: "paused" });
    expect(res.status).toBe(200);
    const bad = await zapierUpdateCampaign(ctx(), h.deps, active.id, { status: "draft" });
    expect(bad.status).toBe(400);
  });

  it("returns real performance stats with accepted always null", async () => {
    const h = harness();
    const campaign = seedCampaign(h, "active");
    const res = await zapierCampaignPerformance(ctx(), h.deps, campaign.id);
    expect(res.status).toBe(200);
    const stats = (res.body as { stats: Record<string, unknown> }).stats;
    expect(stats).toBeDefined();
    expect((stats.linkedin as { accepted: unknown }).accepted).toBeNull();
    expect((await zapierCampaignPerformance(ctx(), h.deps, "missing")).status).toBe(404);
  });

  it("enrolls leads (skipping unknown ids) and removes one enrollment", async () => {
    const h = harness();
    seedLeads(h);
    const campaign = seedCampaign(h, "active");
    const [l1, l2] = h.leads.leads;
    const added = await zapierAddLeadsToCampaign(ctx(), h.deps, campaign.id, {
      lead_ids: [l1.id, l2.id, "ghost"],
    });
    expect(added.status).toBe(200);
    expect(added.body.enrolled).toBe(2);
    expect(added.body.notFound).toEqual(["ghost"]);
    expect(h.emitted.some((e) => e.type === "lead.added_to_campaign")).toBe(true);
    const again = await zapierAddLeadsToCampaign(ctx(), h.deps, campaign.id, { lead_ids: [l1.id] });
    expect(again.body.enrolled).toBe(0);
    expect(again.body.skipped).toBe(1);
    const removed = await zapierRemoveLeadFromCampaign(ctx(), h.deps, campaign.id, l1.id);
    expect(removed.status).toBe(200);
    expect(h.emitted.some((e) => e.type === "lead.removed_from_campaign")).toBe(true);
    const foreign = await zapierRemoveLeadFromCampaign(ctx(), h.deps, campaign.id, h.leads.leads[3].id);
    expect(foreign.status).toBe(404);
  });

  it("isolates campaigns and lists newest first", async () => {
    const h = harness();
    seedCampaign(h, "draft");
    const other = makeCampaign({ workspace_id: WS_B, name: "Other" });
    h.campaigns.campaigns.push(other);
    const res = await zapierListCampaigns(ctx(), h.deps, new URLSearchParams());
    expect((res.body.campaigns as Array<{ id: string }>).length).toBe(1);
    expect((await zapierGetCampaign(ctx(), h.deps, other.id)).status).toBe(404);
  });
});

// ── Conversations / replies ─────────────────────────────────────────────────

describe("conversations and replies", () => {
  it("lists threads and returns a thread, workspace-scoped", async () => {
    const h = harness();
    h.inbox.conversations.push(
      makeConversation({ workspace_id: WS_A, contact_email: "a@example.com" }),
      makeConversation({ workspace_id: WS_B, contact_email: "b@example.com" })
    );
    const res = await zapierListConversations(ctx(), h.deps, new URLSearchParams());
    expect((res.body.conversations as unknown[]).length).toBe(1);
    const thread = await zapierGetConversation(ctx(), h.deps, h.inbox.conversations[0].id);
    expect(thread.status).toBe(200);
    expect((await zapierGetConversation(ctx(), h.deps, h.inbox.conversations[1].id)).status).toBe(404);
  });

  it("sends an email reply, replays the idempotency key without re-sending, and emits once", async () => {
    const h = harness();
    const conv = makeConversation({ workspace_id: WS_A, channel: "email", contact_email: "a@example.com" });
    h.inbox.conversations.push(conv);
    const body = { content: "Hello", idempotencyKey: "zap-key-1" };
    const first = await zapierSendReply(ctx(), h.deps, conv.id, body);
    expect(first.status).toBe(201);
    expect((first.body as { duplicate: boolean }).duplicate).toBe(false);
    const replay = await zapierSendReply(ctx(), h.deps, conv.id, body);
    expect(replay.status).toBe(201);
    expect((replay.body as { duplicate: boolean }).duplicate).toBe(true);
    expect(h.emitted.filter((e) => e.type === "conversation.reply_created").length).toBe(1);
    expect(h.audits.some((a) => a.action === "zapier.reply_sent")).toBe(true);
    // The fake adapter recorded exactly one send.
    expect(h.inbox.messages.filter((m) => m.conversation_id === conv.id).length).toBe(1);
  });

  it("refuses LinkedIn replies 422 and missing idempotency keys 400", async () => {
    const h = harness();
    const li = makeConversation({ workspace_id: WS_A, channel: "linkedin", contact_email: "a@example.com" });
    h.inbox.conversations.push(li);
    const refused = await zapierSendReply(ctx(), h.deps, li.id, { content: "Hi", idempotencyKey: "k" });
    expect(refused.status).toBe(422);
    expect((refused.body as { code: string }).code).toBe("linkedin_unavailable");
    const email = makeConversation({ workspace_id: WS_A, channel: "email", contact_email: "a@example.com" });
    h.inbox.conversations.push(email);
    const noKey = await zapierSendReply(ctx(), h.deps, email.id, { content: "Hi" });
    expect(noKey.status).toBe(400);
    expect(h.emitted.length).toBe(0);
  });
});

// ── Accounts / usage / search / dropdowns ───────────────────────────────────

describe("accounts, usage, search, dropdowns", () => {
  it("lists accounts and usage, workspace-scoped", async () => {
    const h = harness();
    h.accounts.accounts.push(
      makeAccount({ workspace_id: WS_A, provider: "resend", display_name: "Resend" }),
      makeAccount({ workspace_id: WS_B, provider: "resend", display_name: "Other" })
    );
    const accounts = await zapierListAccounts(ctx(), h.deps);
    expect((accounts.body.accounts as unknown[]).length).toBe(1);
    const usage = await zapierGetUsage(ctx(), h.deps);
    expect(usage.status).toBe(200);
    expect((usage.body.usage as { plan: string }).plan).toBe("growth");
  });

  it("searches leads by q/email/id and campaigns by q/status", async () => {
    const h = harness();
    seedLeads(h);
    h.campaigns.campaigns.push(makeCampaign({ workspace_id: WS_A, name: "Alpha Outreach", status: "active" }));
    const byEmail = await zapierSearchLeads(ctx(), h.deps, new URLSearchParams({ email: "B@EXAMPLE.com" }));
    expect((byEmail.body.leads as Array<{ email?: string }>).map((l) => l.email)).toEqual(["b@example.com"]);
    const byQ = await zapierSearchLeads(ctx(), h.deps, new URLSearchParams({ q: "acme" }));
    expect((byQ.body.leads as unknown[]).length).toBe(3);
    const none = await zapierSearchLeads(ctx(), h.deps, new URLSearchParams({ q: "zzz-no-match" }));
    expect((none.body.leads as unknown[]).length).toBe(0);
    const camps = await zapierSearchCampaigns(ctx(), h.deps, new URLSearchParams({ status: "active" }));
    expect((camps.body.campaigns as unknown[]).length).toBe(1);
    const badStatus = await zapierSearchCampaigns(ctx(), h.deps, new URLSearchParams({ status: "nope" }));
    expect(badStatus.status).toBe(400);
  });

  it("returns dropdowns incl. lead statuses and per-campaign sequences", async () => {
    const h = harness();
    const campaign = makeCampaign({ workspace_id: WS_A, name: "Alpha" });
    h.campaigns.campaigns.push(campaign);
    await h.deps.campaigns.replaceCampaignSteps(campaign.id, [
      { step_type: "email", delay_hours: 0, content: "Hi" },
      { step_type: "wait", delay_hours: 24 },
    ]);
    const camps = await zapierDropdownCampaigns(ctx(), h.deps);
    expect((camps.body.items as Array<{ name: string }>).map((i) => i.name)).toEqual(["Alpha"]);
    const statuses = zapierDropdownLeadStatuses();
    expect((statuses.body.items as Array<{ id: string }>).map((i) => i.id)).toEqual([
      "new",
      "contacted",
      "replied",
      "converted",
      "unresponsive",
    ]);
    const seqs = await zapierDropdownSequences(ctx(), h.deps, new URLSearchParams({ campaign_id: campaign.id }));
    expect((seqs.body.items as unknown[]).length).toBe(2);
    const noCampaign = await zapierDropdownSequences(ctx(), h.deps, new URLSearchParams());
    expect(noCampaign.status).toBe(400);
  });
});

// ── Webhook subscriptions ───────────────────────────────────────────────────

describe("webhook subscriptions (API layer)", () => {
  it("subscribes, lists without secrets, dedups, and unsubscribes idempotently", async () => {
    const h = harness();
    const sub = await zapierSubscribeWebhook(ctx(), h.deps, {
      event: "lead.created",
      target_url: "https://hooks.zapier.com/hooks/catch/123456/abcdef/",
    });
    expect(sub.status).toBe(201);
    const id = (sub.body as { id: string }).id;
    expect(JSON.stringify(sub.body)).not.toContain("secret");
    const dup = await zapierSubscribeWebhook(ctx(), h.deps, {
      event: "lead.created",
      target_url: "https://hooks.zapier.com/hooks/catch/123456/abcdef/",
    });
    expect((dup.body as { id: string }).id).toBe(id);
    const bad = await zapierSubscribeWebhook(ctx(), h.deps, {
      event: "lead.created",
      target_url: "https://evil.example/hook",
    });
    expect(bad.status).toBe(400);
    const badEvent = await zapierSubscribeWebhook(ctx(), h.deps, {
      event: "lead.faxed",
      target_url: "https://hooks.zapier.com/hooks/catch/123456/abcdef/",
    });
    expect(badEvent.status).toBe(400);
    const list = await zapierListWebhookSubscriptions(ctx(), h.deps);
    expect((list.body.subscriptions as unknown[]).length).toBe(1);
    expect(JSON.stringify(list.body)).not.toContain("secret");
    const unsub = await zapierUnsubscribeWebhook(ctx(), h.deps, { id });
    expect(unsub.status).toBe(200);
    const again = await zapierUnsubscribeWebhook(ctx(), h.deps, { id });
    expect(again.status).toBe(200);
    const ghost = await zapierUnsubscribeWebhook(ctx(), h.deps, { id: "nope" });
    expect(ghost.status).toBe(404);
    const foreign = await zapierSubscribeWebhook(ctx(["zapier.read", "zapier.write"], WS_B), h.deps, {
      event: "lead.created",
      target_url: "https://hooks.zapier.com/hooks/catch/999/xyz/",
    });
    expect(foreign.status).toBe(201);
    const listA = await zapierListWebhookSubscriptions(ctx(), h.deps);
    expect((listA.body.subscriptions as unknown[]).length).toBe(0);
  });
});
