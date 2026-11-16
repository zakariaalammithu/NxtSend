/**
 * New-tool tests (Worker B, ChatGPT expansion) — adapter-level, fake
 * repositories, no network.
 *
 * Covers: account tools, campaign search/stop/delete/performance/
 * execution-status, lead search/import/enroll/remove/duplicates/
 * activity/by-campaign, sequence create/update/reorder + scheduled
 * follow-ups + execution status, LinkedIn-automation read-only
 * reports, inbox search/message-status/failed, analytics (compare,
 * date-range honest BLOCKED, performance summary, usage report),
 * profile/search/fetch/render widget, scope-tier enforcement
 * (nxtsend.* aliases, tiers independent), idempotency key echo.
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
  FakeAccountsRepository,
  FakeSafetySettingsRepository,
  FakeScheduledRepliesRepository,
  FakeEmailAdapter,
  makeLead,
  makeCampaign,
  makeAccount,
  makeConversation,
  makeMessage,
  makeScheduledReply,
  makeExecution,
} from "./fakes";

const WS_A = "ws_a";
const WS_B = "ws_b";
const ALL_SCOPES = ["muse.read", "muse.write", "muse.send"];

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

describe("NxtSendMuseConnectorAdapter — ChatGPT expansion tools", () => {
  let leads: FakeLeadsRepository;
  let campaigns: FakeCampaignsRepository;
  let inbox: FakeInboxRepository;
  let accounts: FakeAccountsRepository;
  let scheduledReplies: FakeScheduledRepliesRepository;
  let email: FakeEmailAdapter;
  let audits: MuseAuditInput[];
  let adapter: NxtSendMuseConnectorAdapter;
  let campA: ReturnType<typeof makeCampaign>;
  let campB: ReturnType<typeof makeCampaign>;
  let ana: ReturnType<typeof makeLead>;
  let bo: ReturnType<typeof makeLead>;
  let convA: ReturnType<typeof makeConversation>;
  let sentMsg: ReturnType<typeof makeMessage>;
  let failedMsg: ReturnType<typeof makeMessage>;

  beforeEach(async () => {
    leads = new FakeLeadsRepository();
    campaigns = new FakeCampaignsRepository();
    inbox = new FakeInboxRepository();
    accounts = new FakeAccountsRepository();
    scheduledReplies = new FakeScheduledRepliesRepository();
    email = new FakeEmailAdapter();
    audits = [];
    adapter = new NxtSendMuseConnectorAdapter({
      leads,
      campaigns,
      inbox,
      usage: new FakeUsageRepository(),
      integrations: new FakeIntegrationsRepository(),
      accounts,
      safetySettings: new FakeSafetySettingsRepository(),
      scheduledReplies,
      emailAdapter: email,
      auditFn: async (entry) => {
        audits.push(entry);
      },
      executionsFn: async (_ws, camps) => {
        const ids = new Set(camps.map((c) => c.id));
        return [
          makeExecution({ workspace_id: WS_A, campaign_id: campA.id, step_order: 1, step_type: "email", channel: "email", status: "sent" }),
          makeExecution({ workspace_id: WS_A, campaign_id: campA.id, step_order: 1, step_type: "email", channel: "email", status: "failed", detail: "bounce" }),
          makeExecution({ workspace_id: WS_A, campaign_id: campA.id, step_order: 2, step_type: "connection_request", channel: "linkedin", status: "skipped", detail: "LinkedIn steps are skipped: no authorized provider." }),
          makeExecution({ workspace_id: WS_A, campaign_id: campA.id, step_order: 2, step_type: "linkedin_message", channel: "linkedin", status: "sending" }),
        ].filter((e) => ids.has(e.campaign_id));
      },
      mode: "demo",
    });

    ana = makeLead({ workspace_id: WS_A, email: "ana@example.com", first_name: "Ana", company: "Acme" });
    bo = makeLead({ workspace_id: WS_A, email: "bo@example.com", first_name: "Bo", company: "Beta" });
    const anaClone = makeLead({ workspace_id: WS_A, email: "ana@example.com", first_name: "Ana", last_name: "Clone" });
    leads.leads.push(
      ana,
      bo,
      anaClone,
      makeLead({ workspace_id: WS_B, email: "cy@example.com", first_name: "Cy" })
    );

    campA = makeCampaign({ workspace_id: WS_A, name: "Alpha outreach", status: "active", type: "email" });
    campB = makeCampaign({ workspace_id: WS_A, name: "Beta nurture", status: "draft", type: "email" });
    campaigns.campaigns.push(
      campA,
      campB,
      makeCampaign({ workspace_id: WS_B, name: "Gamma", status: "active" })
    );
    await campaigns.replaceCampaignSteps(campA.id, [
      { step_type: "email", delay_hours: 0, subject: "Hi", content: "Hello" },
      { step_type: "wait", delay_hours: 24 },
    ]);
    await campaigns.appendActivity(WS_A, {
      campaign_id: campA.id,
      action: "campaign_created",
      details: "Alpha created.",
    });
    await campaigns.enrollLeads(WS_A, campA.id, [bo.id, ana.id]);
    const enrollments = await campaigns.listEnrollments(campA.id);
    const anaEnrollment = enrollments.find((e) => e.lead_id === ana.id)!;
    await campaigns.updateEnrollment(anaEnrollment.id, { current_step: 1 });

    accounts.accounts.push(
      makeAccount({ workspace_id: WS_A, channel: "linkedin", display_name: "Ana LinkedIn" }),
      makeAccount({ workspace_id: WS_A, channel: "email", provider: "resend", display_name: "Ana Email" })
    );
    accounts.usedToday[accounts.accounts[0].id] = {
      connection_requests: 2,
      messages: 0,
      profile_views: 0,
      like_post: 0,
      endorse_skills: 0,
      find_email: 0,
    };

    convA = makeConversation({
      workspace_id: WS_A,
      contact_name: "Ana Alvarez",
      contact_email: "ana@example.com",
      channel: "email",
    });
    inbox.conversations.push(convA);
    sentMsg = makeMessage({
      workspace_id: WS_A,
      conversation_id: convA.id,
      lead_id: ana.id,
      direction: "outbound",
      status: "sent",
      provider: "resend",
      provider_message_id: "pm_123",
      idempotency_key: "key-sent-1",
    });
    // A provider-confirmed send, not a demo record: classifyMessage
    // must report it as "provider" (the demo default is "simulated").
    sentMsg.is_demo = false;
    failedMsg = makeMessage({
      workspace_id: WS_A,
      conversation_id: convA.id,
      lead_id: ana.id,
      direction: "outbound",
      status: "failed",
      error: "mailbox full",
    });
    inbox.messages.push(
      sentMsg,
      failedMsg,
      makeMessage({
        workspace_id: WS_A,
        conversation_id: convA.id,
        lead_id: ana.id,
        direction: "inbound",
        status: "received",
        content: "Thanks, let's talk.",
      })
    );
    scheduledReplies.replies.push(
      makeScheduledReply({ workspace_id: WS_A, conversation_id: convA.id, body: "Bump" })
    );
  });

  const callerA = { subject: "user_a", scopes: ALL_SCOPES, workspaceId: WS_A };

  // ── Account ────────────────────────────────────────────────────────────

  it("list_linkedin_accounts returns only LinkedIn accounts", async () => {
    const data = okData(await adapter.handleToolCall("list_linkedin_accounts", {}, callerA));
    expect(data.total).toBe(1);
    expect(data.accounts[0].displayName).toBe("Ana LinkedIn");
    expect(data.accounts[0].dailyLimits.connection_requests).toBe(5);
  });

  it("get_linkedin_account returns limits + today's usage; email account is not a LinkedIn account", async () => {
    const li = accounts.accounts[0];
    const data = okData(
      await adapter.handleToolCall("get_linkedin_account", { accountId: li.id }, callerA)
    );
    expect(data.account.usedToday.connection_requests).toBe(2);
    expect(data.account.dailyLimits.messages).toBe(10);

    const emailAccount = accounts.accounts[1];
    const err = errData(
      await adapter.handleToolCall("get_linkedin_account", { accountId: emailAccount.id }, callerA)
    );
    expect(err.httpStatus).toBe(404);
    const missing = errData(
      await adapter.handleToolCall("get_linkedin_account", { accountId: "nope" }, callerA)
    );
    expect(missing.httpStatus).toBe(404);
  });

  it("get_subscription_info returns plan and status", async () => {
    const data = okData(await adapter.handleToolCall("get_subscription_info", {}, callerA));
    expect(data.plan).toBe("growth");
    expect(data.subscriptionStatus).toBe("active");
    expect(data.periodStart).toBe("2026-11-01");
  });

  it("get_account_limits returns per-account limits + safety settings", async () => {
    const data = okData(await adapter.handleToolCall("get_account_limits", {}, callerA));
    expect(data.accounts.length).toBe(1);
    expect(data.accounts[0].dailyLimits.connection_requests).toBe(5);
    expect(data.accounts[0].usedToday.connection_requests).toBe(2);
    expect(data.safetySettings.daily_connection_cap).toBe(15);
    expect(data.safetySettings.working_hours_start).toBe("09:00");
  });

  // ── Campaign ───────────────────────────────────────────────────────────

  it("search_campaigns matches by name and filters by status", async () => {
    const all = okData(
      await adapter.handleToolCall("search_campaigns", { query: "outreach" }, callerA)
    );
    expect(all.total).toBe(1);
    expect(all.campaigns[0].name).toBe("Alpha outreach");
    const drafts = okData(
      await adapter.handleToolCall("search_campaigns", { status: "draft" }, callerA)
    );
    expect(drafts.total).toBe(1);
    expect(drafts.campaigns[0].name).toBe("Beta nurture");
  });

  it("stop_campaign archives; delete_campaign removes (then 404)", async () => {
    const stopped = okData(
      await adapter.handleToolCall("stop_campaign", { campaignId: campA.id }, callerA)
    );
    expect(stopped.campaign.status).toBe("archived");

    const deleted = okData(
      await adapter.handleToolCall("delete_campaign", { campaignId: campB.id }, callerA)
    );
    expect(deleted.deleted).toBe(true);
    const again = errData(
      await adapter.handleToolCall("delete_campaign", { campaignId: campB.id }, callerA)
    );
    expect(again.httpStatus).toBe(404);
  });

  it("get_campaign_performance returns real stats for the campaign", async () => {
    const data = okData(
      await adapter.handleToolCall("get_campaign_performance", { campaignId: campA.id }, callerA)
    );
    expect(data.campaign.id).toBe(campA.id);
    expect(data.stats.campaignId).toBe(campA.id);
    expect(data.stats.prospects).toBe(2);
  });

  it("get_campaign_execution_status returns steps, activity and executions", async () => {
    const data = okData(
      await adapter.handleToolCall("get_campaign_execution_status", { campaignId: campA.id }, callerA)
    );
    expect(data.steps.length).toBe(2);
    expect(data.total).toBe(1);
    expect(data.executions.length).toBe(4);
  });

  // ── Leads ──────────────────────────────────────────────────────────────

  it("search_leads matches name/email/company, workspace-scoped", async () => {
    const data = okData(
      await adapter.handleToolCall("search_leads", { query: "bo" }, callerA)
    );
    expect(data.total).toBe(1);
    expect(data.leads[0].email).toBe("bo@example.com");
    const all = okData(
      await adapter.handleToolCall("search_leads", { query: "example.com" }, callerA)
    );
    expect(all.total).toBe(3);
  });

  it("import_leads imports new, skips duplicates and invalid emails", async () => {
    const data = okData(
      await adapter.handleToolCall(
        "import_leads",
        {
          leads: [
            { email: "new@example.com", first_name: "New" },
            { email: "ana@example.com", first_name: "Ana" },
            { email: "not-an-email", first_name: "Bad" },
            { email: "new@example.com", first_name: "New again" },
          ],
        },
        callerA
      )
    );
    expect(data.importedCount).toBe(1);
    expect(data.imported[0].email).toBe("new@example.com");
    expect(data.skippedCount).toBe(3);
    expect(data.skipped.map((s: { reason: string }) => s.reason).sort()).toEqual([
      "duplicate",
      "duplicate",
      "invalid_email",
    ]);
    expect(data.idempotencyKey).toMatch(/^muse_import_leads_/);
  });

  it("import_leads rejects more than 100 leads", async () => {
    const err = errData(
      await adapter.handleToolCall(
        "import_leads",
        { leads: Array.from({ length: 101 }, (_, i) => ({ email: `u${i}@example.com` })) },
        callerA
      )
    );
    expect(err.code).toBe("invalid_params");
  });

  it("add/remove leads to campaign dedupes and reports not-found", async () => {
    const added = okData(
      await adapter.handleToolCall(
        "add_leads_to_campaign",
        { campaignId: campB.id, leadIds: [ana.id, bo.id, "ghost"] },
        callerA
      )
    );
    expect(added.enrolled).toBe(2);
    expect(added.notFound).toEqual(["ghost"]);

    const again = okData(
      await adapter.handleToolCall(
        "add_leads_to_campaign",
        { campaignId: campB.id, leadIds: [ana.id] },
        callerA
      )
    );
    expect(again.enrolled).toBe(0);
    expect(again.skipped).toBe(1);

    const removed = okData(
      await adapter.handleToolCall(
        "remove_leads_from_campaign",
        { campaignId: campB.id, leadIds: [ana.id, "ghost"] },
        callerA
      )
    );
    expect(removed.removed).toBe(1);
    expect(removed.notEnrolled).toEqual(["ghost"]);
  });

  it("detect_duplicate_leads finds the shared-email group", async () => {
    const data = okData(await adapter.handleToolCall("detect_duplicate_leads", {}, callerA));
    expect(data.groupCount).toBe(1);
    expect(data.duplicateLeadCount).toBe(2);
    expect(data.groups[0].key).toContain("ana@example.com");
  });

  it("get_lead_activity_history returns messages + campaign activity", async () => {
    const data = okData(
      await adapter.handleToolCall("get_lead_activity_history", { leadId: ana.id }, callerA)
    );
    expect(data.messages.length).toBe(3);
    expect(data.campaignIds).toContain(campA.id);
    expect(data.campaignActivity.length).toBe(1);
  });

  it("list_leads_by_campaign returns enrolled leads with status", async () => {
    const data = okData(
      await adapter.handleToolCall("list_leads_by_campaign", { campaignId: campA.id }, callerA)
    );
    expect(data.total).toBe(2);
    expect(data.leads[0].enrollment.status).toBe("pending");
    expect(data.leads[0].lead).toBeDefined();
  });

  // ── Sequences ──────────────────────────────────────────────────────────

  it("get_campaign_sequence returns steps in order", async () => {
    const data = okData(
      await adapter.handleToolCall("get_campaign_sequence", { campaignId: campA.id }, callerA)
    );
    expect(data.steps.length).toBe(2);
    expect(data.steps[0].step_type).toBe("email");
    expect(data.steps[1].step_type).toBe("wait");
  });

  it("create_sequence_step appends; email step without content is refused", async () => {
    const created = okData(
      await adapter.handleToolCall(
        "create_sequence_step",
        { campaignId: campA.id, stepType: "wait", delayHours: 48 },
        callerA
      )
    );
    expect(created.steps.length).toBe(3);
    expect(created.step.step_type).toBe("wait");
    expect(created.step.step_order).toBe(3);

    const bad = errData(
      await adapter.handleToolCall(
        "create_sequence_step",
        { campaignId: campA.id, stepType: "email", delayHours: 0 },
        callerA
      )
    );
    expect(bad.code).toBe("invalid_params");
  });

  it("update_sequence_step changes a step in place and keeps order", async () => {
    const steps = await campaigns.getCampaignSteps(campA.id);
    const updated = okData(
      await adapter.handleToolCall(
        "update_sequence_step",
        { campaignId: campA.id, stepId: steps[0].id, delayHours: 48 },
        callerA
      )
    );
    expect(updated.steps[0].delay_hours).toBe(48);
    expect(updated.steps[0].step_type).toBe("email");
    expect(updated.steps[1].step_type).toBe("wait");

    const missing = errData(
      await adapter.handleToolCall(
        "update_sequence_step",
        { campaignId: campA.id, stepId: "nope", delayHours: 1 },
        callerA
      )
    );
    expect(missing.httpStatus).toBe(404);
  });

  it("reorder_sequence_steps reorders; a wrong set is refused", async () => {
    const steps = await campaigns.getCampaignSteps(campA.id);
    const reordered = okData(
      await adapter.handleToolCall(
        "reorder_sequence_steps",
        { campaignId: campA.id, stepIds: [steps[1].id, steps[0].id] },
        callerA
      )
    );
    expect(reordered.steps[0].step_type).toBe("wait");
    expect(reordered.steps[1].step_type).toBe("email");

    const bad = errData(
      await adapter.handleToolCall(
        "reorder_sequence_steps",
        { campaignId: campA.id, stepIds: [steps[0].id] },
        callerA
      )
    );
    expect(bad.code).toBe("invalid_params");
  });

  it("get_scheduled_follow_ups lists upcoming, filterable by conversation", async () => {
    const all = okData(await adapter.handleToolCall("get_scheduled_follow_ups", {}, callerA));
    expect(all.total).toBe(1);
    expect(all.followUps[0].body).toBe("Bump");
    const none = okData(
      await adapter.handleToolCall(
        "get_scheduled_follow_ups",
        { conversationId: "other" },
        callerA
      )
    );
    expect(none.total).toBe(0);
  });

  it("get_sequence_execution_status groups executions per step", async () => {
    const data = okData(
      await adapter.handleToolCall("get_sequence_execution_status", { campaignId: campA.id }, callerA)
    );
    expect(data.steps.length).toBe(2);
    expect(data.steps[0].counts.total).toBe(2);
    expect(data.steps[0].counts.sent).toBe(1);
    expect(data.steps[0].counts.failed).toBe(1);
    expect(data.steps[1].counts.skipped).toBe(1);
    expect(data.totals.total).toBe(4);
  });

  // ── LinkedIn automation (read-only) ────────────────────────────────────

  it("get_pending_actions lists pending steps + in-progress executions", async () => {
    const data = okData(await adapter.handleToolCall("get_pending_actions", {}, callerA));
    // Bo: steps 1+2 pending; Ana (current_step 1): step 2 pending; + 1 sending execution.
    expect(data.total).toBe(4);
    expect(data.actions.every((a: { status: string }) => a.status === "pending" || a.status === "sending")).toBe(true);
  });

  it("get_failed_actions lists failed and skipped executions", async () => {
    const data = okData(await adapter.handleToolCall("get_failed_actions", {}, callerA));
    expect(data.total).toBe(2);
    expect(data.actions.map((a: { status: string }) => a.status).sort()).toEqual([
      "failed",
      "skipped",
    ]);
    const skipped = data.actions.find((a: { status: string }) => a.status === "skipped");
    expect(skipped.detail).toContain("no authorized provider");
  });

  it("get_automation_execution_report summarises per campaign + totals", async () => {
    const data = okData(
      await adapter.handleToolCall("get_automation_execution_report", {}, callerA)
    );
    expect(data.campaigns.length).toBe(2);
    const a = data.campaigns.find((c: { campaignId: string }) => c.campaignId === campA.id);
    expect(a.counts.total).toBe(4);
    expect(a.counts.sent).toBe(1);
    expect(a.counts.skipped).toBe(1);
    expect(a.counts.failed).toBe(1);
    expect(data.totals.total).toBe(4);
    expect(data.note).toContain("never reported as sent");
  });

  // ── Inbox ──────────────────────────────────────────────────────────────

  it("search_conversations matches contact name/email/subject", async () => {
    const data = okData(
      await adapter.handleToolCall("search_conversations", { query: "ana" }, callerA)
    );
    expect(data.total).toBe(1);
    expect(data.conversations[0].contact_email).toBe("ana@example.com");
    const none = okData(
      await adapter.handleToolCall("search_conversations", { query: "zzz" }, callerA)
    );
    expect(none.total).toBe(0);
  });

  it("get_message_execution_status by id and by idempotency key", async () => {
    const byId = okData(
      await adapter.handleToolCall(
        "get_message_execution_status",
        { messageId: failedMsg.id },
        callerA
      )
    );
    expect(byId.verification).toBe("failed");
    expect(byId.message.status).toBe("failed");

    const byKey = okData(
      await adapter.handleToolCall(
        "get_message_execution_status",
        { idempotencyKey: "key-sent-1", conversationId: convA.id },
        callerA
      )
    );
    expect(byKey.message.id).toBe(sentMsg.id);
    expect(byKey.verification).toBe("provider");

    const bad = errData(
      await adapter.handleToolCall("get_message_execution_status", {}, callerA)
    );
    expect(bad.code).toBe("invalid_params");
  });

  it("get_failed_messages lists only failed/suppressed messages", async () => {
    const data = okData(await adapter.handleToolCall("get_failed_messages", {}, callerA));
    expect(data.total).toBe(1);
    expect(data.messages[0].id).toBe(failedMsg.id);
  });

  // ── Analytics ──────────────────────────────────────────────────────────

  it("compare_campaigns aggregates and deltas 2+ campaigns; 1 is refused", async () => {
    const data = okData(
      await adapter.handleToolCall(
        "compare_campaigns",
        { campaignIds: [campA.id, campB.id] },
        callerA
      )
    );
    expect(data.campaigns.length).toBe(2);
    expect(data.aggregate.prospects).toBe(2);
    expect(data.deltas.length).toBe(2);
    expect(data.deltas[0].delta.prospects).toBe(1);
    expect(data.deltas[1].delta.prospects).toBe(-1);

    const bad = errData(
      await adapter.handleToolCall("compare_campaigns", { campaignIds: [campA.id] }, callerA)
    );
    expect(bad.code).toBe("invalid_params");
  });

  it("get_date_range_report is an honest BLOCKED not-supported result", async () => {
    const blocked = errData(
      await adapter.handleToolCall(
        "get_date_range_report",
        { startDate: "2026-10-01", endDate: "2026-10-31" },
        callerA
      )
    );
    expect(blocked.code).toBe("date_range_not_supported");
    expect(blocked.resultStatus).toBe("BLOCKED");
    expect(blocked.message).toContain("not supported");
    expect(blocked.message).toContain("all-time");

    const bad = errData(
      await adapter.handleToolCall(
        "get_date_range_report",
        { startDate: "not-a-date", endDate: "2026-10-31" },
        callerA
      )
    );
    expect(bad.code).toBe("invalid_params");
  });

  it("get_performance_summary totals the workspace", async () => {
    const data = okData(await adapter.handleToolCall("get_performance_summary", {}, callerA));
    expect(data.totalLeads).toBe(3);
    expect(data.totalCampaigns).toBe(2);
    expect(data.stats.prospects).toBe(2);
  });

  it("get_usage_report combines usage, limits and safety settings", async () => {
    const data = okData(await adapter.handleToolCall("get_usage_report", {}, callerA));
    expect(data.usage.plan).toBe("growth");
    expect(data.accountLimits.length).toBe(1);
    expect(data.safetySettings.daily_connection_cap).toBe(15);
  });

  // ── Profile / knowledge / UI ───────────────────────────────────────────

  it("get_profile returns the grant identity, never input", async () => {
    const data = okData(await adapter.handleToolCall("get_profile", {}, callerA));
    expect(data.userId).toBe("user_a");
    expect(data.workspaceId).toBe("ws_a");
    expect(data.scopes).toEqual(ALL_SCOPES);
    expect(data.plan).toBe("growth");
  });

  it("search + fetch work as a knowledge source", async () => {
    const found = okData(
      await adapter.handleToolCall("search", { query: "Alpha" }, callerA)
    );
    expect(found.total).toBe(1);
    expect(found.hits[0].type).toBe("campaign");
    expect(found.hits[0].url).toBe(`/dashboard/campaigns/${campA.id}`);

    const fetched = okData(
      await adapter.handleToolCall("fetch", { id: campA.id }, callerA)
    );
    expect(fetched.type).toBe("campaign");
    expect(fetched.record.name).toBe("Alpha outreach");
  });

  it("render_campaigns_widget renders from ids only and reports missing ids", async () => {
    const data = okData(
      await adapter.handleToolCall(
        "render_campaigns_widget",
        { campaignIds: [campA.id, "ghost"] },
        callerA
      )
    );
    expect(data.campaigns.length).toBe(1);
    expect(data.campaigns[0].name).toBe("Alpha outreach");
    expect(data.campaigns[0].enrollments).toBe(2);
    expect(data.missingIds).toEqual(["ghost"]);
    expect(data.widget.resourceUri).toBe("ui://widget/campaigns.html");

    const empty = errData(
      await adapter.handleToolCall("render_campaigns_widget", { campaignIds: [] }, callerA)
    );
    expect(empty.code).toBe("invalid_params");
  });

  // ── Scope tiers ────────────────────────────────────────────────────────

  it("scope tiers: nxtsend.read satisfies the read tier; send does not imply read/write", async () => {
    const aliasCaller = { subject: "user_a", scopes: ["nxtsend.read"], workspaceId: WS_A };
    const read = okData(
      await adapter.handleToolCall("list_leads", {}, aliasCaller)
    );
    expect(read.total).toBe(3);

    const sendOnly = { subject: "user_a", scopes: ["muse.send"], workspaceId: WS_A };
    const noRead = errData(
      await adapter.handleToolCall("list_leads", {}, sendOnly)
    );
    expect(noRead.code).toBe("missing_scope");
    expect(noRead.message).toContain("muse.read");

    const readOnly = { subject: "user_a", scopes: ["muse.read"], workspaceId: WS_A };
    const noWrite = errData(
      await adapter.handleToolCall("create_lead", { email: "x@example.com" }, readOnly)
    );
    expect(noWrite.code).toBe("missing_scope");
    expect(noWrite.message).toContain("muse.write");
  });

  it("write tools echo an idempotency key (provided, or muse_<tool>_<hash>)", async () => {
    const provided = okData(
      await adapter.handleToolCall(
        "create_lead",
        { email: "keyed@example.com", idempotencyKey: "client-key-9" },
        callerA
      )
    );
    expect(provided.idempotencyKey).toBe("client-key-9");
    const def = okData(
      await adapter.handleToolCall("create_lead", { email: "def@example.com" }, callerA)
    );
    expect(def.idempotencyKey).toMatch(/^muse_create_lead_[0-9a-f]{8}$/);
  });
});
