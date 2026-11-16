/**
 * In-memory fake repositories for Muse connector tests.
 * Workspace-scoped exactly like the real repositories: every method
 * filters by the workspace id it is given, so isolation tests are
 * meaningful. Not exported to production code.
 */

import type { Lead, Campaign, CampaignStep, ConnectedAccount } from "@/types";
import type {
  LeadsRepository,
  CampaignsRepository,
  InboxRepository,
  UsageRepository,
  IntegrationsRepository,
  AccountsRepository,
  SafetySettingsRepository,
  ScheduledRepliesRepository,
  WorkspaceUsage,
  CreateLeadInput,
  ActivityEntry,
  EnrollmentRecord,
  CampaignStepDraft,
  CreateCampaignInput,
  SafetySettings,
  ScheduledReply,
  CreateAccountInput,
  UpdateAccountPatch,
} from "@/lib/data";
import { DEFAULT_SAFETY_SETTINGS } from "@/lib/data";
import type { WarmupUsageCounts } from "@/lib/linkedin/warmup";
import type { StepExecutionRecord } from "@/lib/executor/types";
import type {
  InboxConversation,
  InboxMessage,
  ConversationSummary,
  ListConversationsOptions,
  InsertMessageInput,
} from "@/lib/data/inbox";
import type { Integration } from "@/types";
import type { EmailProviderAdapter, SendEmailInput, SendEmailResult } from "@/lib/email/types";
import type { ProviderState } from "@/lib/env";

let seq = 0;
export function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq}`;
}

export function makeLead(over: Partial<Lead> & { workspace_id: string }): Lead {
  return {
    id: over.id ?? nextId("lead"),
    workspace_id: over.workspace_id,
    first_name: over.first_name ?? "Test",
    last_name: over.last_name ?? "Lead",
    email: over.email ?? "test@example.com",
    company: over.company ?? "Acme",
    job_title: over.job_title ?? "Founder",
    linkedin_url: over.linkedin_url,
    status: over.status ?? "new",
    tags: [...(over.tags ?? [])],
    custom_fields: { ...(over.custom_fields ?? {}) },
    created_at: over.created_at ?? new Date().toISOString(),
  };
}

export function makeCampaign(over: Partial<Campaign> & { workspace_id: string }): Campaign {
  return {
    id: over.id ?? nextId("cmp"),
    workspace_id: over.workspace_id,
    name: over.name ?? "Campaign",
    type: over.type ?? "email",
    status: over.status ?? "draft",
    created_by: over.created_by ?? "user_a",
    created_at: over.created_at ?? new Date().toISOString(),
    updated_at: over.updated_at ?? new Date().toISOString(),
  };
}

export class FakeLeadsRepository implements LeadsRepository {
  readonly mode = "demo" as const;
  leads: Lead[] = [];

  async listLeads(workspaceId: string): Promise<Lead[]> {
    return this.leads.filter((l) => l.workspace_id === workspaceId);
  }
  async createLead(workspaceId: string, input: CreateLeadInput): Promise<Lead> {
    const lead: Lead = {
      id: nextId("lead"),
      workspace_id: workspaceId,
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email,
      company: input.company,
      job_title: input.job_title,
      linkedin_url: input.linkedin_url,
      status: input.status ?? "new",
      tags: [...input.tags],
      custom_fields: {},
      created_at: new Date().toISOString(),
    };
    this.leads.unshift(lead);
    return lead;
  }
  async updateLead(id: string, patch: Partial<Lead>): Promise<Lead> {
    const idx = this.leads.findIndex((l) => l.id === id);
    if (idx < 0) throw new Error(`Lead not found: ${id}`);
    this.leads[idx] = { ...this.leads[idx], ...patch, id };
    return this.leads[idx];
  }
  async deleteLead(id: string): Promise<void> {
    this.leads = this.leads.filter((l) => l.id !== id);
  }
  async deleteLeads(ids: string[]): Promise<void> {
    const drop = new Set(ids);
    this.leads = this.leads.filter((l) => !drop.has(l.id));
  }
  async importLeads(workspaceId: string, inputs: CreateLeadInput[]): Promise<Lead[]> {
    const out: Lead[] = [];
    for (const i of inputs) out.push(await this.createLead(workspaceId, i));
    return out;
  }
  async listTags(workspaceId: string): Promise<string[]> {
    const tags = new Set<string>();
    for (const l of await this.listLeads(workspaceId)) for (const t of l.tags) tags.add(t);
    return Array.from(tags).sort();
  }
  async renameTag(): Promise<number> { return 0; }
  async deleteTag(): Promise<number> { return 0; }
  async applyTag(): Promise<number> { return 0; }
  async removeTag(): Promise<number> { return 0; }
}

export class FakeCampaignsRepository implements CampaignsRepository {
  readonly mode = "demo" as const;
  campaigns: Campaign[] = [];
  steps: CampaignStep[] = [];
  activity: ActivityEntry[] = [];
  enrollments: EnrollmentRecord[] = [];

  async listCampaigns(workspaceId: string): Promise<Campaign[]> {
    return this.campaigns.filter((c) => c.workspace_id === workspaceId);
  }
  async getCampaign(workspaceId: string, id: string): Promise<Campaign | null> {
    return this.campaigns.find((c) => c.id === id && c.workspace_id === workspaceId) ?? null;
  }
  async getCampaignSteps(campaignId: string): Promise<CampaignStep[]> {
    return this.steps.filter((s) => s.campaign_id === campaignId).sort((a, b) => a.step_order - b.step_order);
  }
  async createCampaign(workspaceId: string, input: CreateCampaignInput): Promise<Campaign> {
    const now = new Date().toISOString();
    const campaign = makeCampaign({
      workspace_id: workspaceId,
      name: input.name,
      type: input.type,
      status: input.status ?? "draft",
      created_at: now,
      updated_at: now,
    });
    this.campaigns.unshift(campaign);
    await this.replaceCampaignSteps(campaign.id, input.steps);
    await this.appendActivity(workspaceId, {
      campaign_id: campaign.id,
      action: "campaign_created",
      details: `Campaign "${campaign.name}" created.`,
    });
    return campaign;
  }
  async updateCampaign(id: string, patch: Partial<Campaign>): Promise<Campaign> {
    const idx = this.campaigns.findIndex((c) => c.id === id);
    if (idx < 0) throw new Error(`Campaign not found: ${id}`);
    this.campaigns[idx] = { ...this.campaigns[idx], ...patch, updated_at: new Date().toISOString() };
    return this.campaigns[idx];
  }
  async replaceCampaignSteps(campaignId: string, steps: CampaignStepDraft[]): Promise<CampaignStep[]> {
    this.steps = this.steps.filter((s) => s.campaign_id !== campaignId);
    const mine = steps.map((s, i) => ({
      id: nextId("step"),
      campaign_id: campaignId,
      step_order: i + 1,
      step_type: s.step_type,
      delay_hours: s.delay_hours,
      subject: s.subject,
      content: s.content,
      config: s.config ?? {},
    }));
    this.steps.push(...mine);
    return mine;
  }
  async setCampaignStatus(workspaceId: string, id: string, status: Campaign["status"]): Promise<void> {
    const c = await this.getCampaign(workspaceId, id);
    if (!c) throw new Error(`Campaign not found: ${id}`);
    await this.updateCampaign(id, { status });
    await this.appendActivity(workspaceId, {
      campaign_id: id,
      action: `campaign_${status}`,
      details: `Campaign "${c.name}" -> ${status}.`,
    });
  }
  async duplicateCampaign(workspaceId: string, id: string): Promise<Campaign> {
    const src = await this.getCampaign(workspaceId, id);
    if (!src) throw new Error(`Campaign not found: ${id}`);
    return this.createCampaign(workspaceId, {
      name: `${src.name} (Copy)`,
      type: src.type,
      status: "draft",
      steps: (await this.getCampaignSteps(id)).map((s) => ({
        step_type: s.step_type,
        delay_hours: s.delay_hours,
        subject: s.subject,
        content: s.content,
      })),
    });
  }
  async deleteCampaign(workspaceId: string, id: string): Promise<void> {
    this.campaigns = this.campaigns.filter((c) => c.id !== id);
    this.steps = this.steps.filter((s) => s.campaign_id !== id);
  }
  async listActivity(workspaceId: string, campaignId?: string): Promise<ActivityEntry[]> {
    return this.activity
      .filter((a) => a.workspace_id === workspaceId)
      .filter((a) => !campaignId || a.campaign_id === campaignId);
  }
  async appendActivity(workspaceId: string, entry: { campaign_id?: string | null; action: string; details: string }): Promise<void> {
    this.activity.unshift({
      id: nextId("act"),
      workspace_id: workspaceId,
      campaign_id: entry.campaign_id ?? null,
      action: entry.action,
      details: entry.details,
      simulated: true,
      created_at: new Date().toISOString(),
    });
  }
  async enrollLeads(workspaceId: string, campaignId: string, leadIds: string[]): Promise<{ enrolled: number; skipped: number }> {
    const existing = new Set(this.enrollments.filter((e) => e.campaign_id === campaignId).map((e) => e.lead_id));
    let enrolled = 0;
    for (const leadId of leadIds) {
      if (existing.has(leadId)) continue;
      this.enrollments.unshift({
        id: nextId("enr"),
        campaign_id: campaignId,
        lead_id: leadId,
        status: "pending",
        current_step: 0,
        enrolled_at: new Date().toISOString(),
      });
      enrolled++;
    }
    return { enrolled, skipped: leadIds.length - enrolled };
  }
  async removeEnrollment(campaignId: string, leadId: string): Promise<void> {
    this.enrollments = this.enrollments.filter((e) => !(e.campaign_id === campaignId && e.lead_id === leadId));
  }
  async listEnrollments(campaignId: string): Promise<EnrollmentRecord[]> {
    return this.enrollments.filter((e) => e.campaign_id === campaignId);
  }
  async updateEnrollment(enrollmentId: string, patch: { status?: string; current_step?: number; last_step_at?: string | null }): Promise<void> {
    const e = this.enrollments.find((x) => x.id === enrollmentId);
    if (e) Object.assign(e, patch);
  }
}

export function makeConversation(over: Partial<InboxConversation> & { workspace_id: string }): InboxConversation {
  return {
    id: over.id ?? nextId("conv"),
    workspace_id: over.workspace_id,
    lead_id: over.lead_id ?? null,
    channel: over.channel ?? "email",
    subject: over.subject ?? null,
    contact_name: over.contact_name ?? "Prospect",
    contact_email: over.contact_email ?? "prospect@example.com",
    company: over.company ?? null,
    status: over.status ?? "open",
    assignee_id: null,
    is_demo: true,
    last_message_at: over.last_message_at ?? new Date().toISOString(),
    created_at: over.created_at ?? new Date().toISOString(),
  };
}

export function makeMessage(over: Partial<InboxMessage> & { workspace_id: string; conversation_id: string }): InboxMessage {
  return {
    id: over.id ?? nextId("msg"),
    workspace_id: over.workspace_id,
    conversation_id: over.conversation_id,
    lead_id: over.lead_id ?? null,
    campaign_id: over.campaign_id ?? null,
    channel: over.channel ?? "email",
    direction: over.direction ?? "inbound",
    subject: over.subject ?? null,
    content: over.content ?? "hello",
    status: over.status ?? "received",
    is_demo: true,
    sent_at: over.sent_at ?? new Date().toISOString(),
    read_at: over.read_at ?? null,
    provider: over.provider ?? null,
    provider_message_id: over.provider_message_id ?? null,
    idempotency_key: over.idempotency_key ?? null,
    error: over.error ?? null,
  };
}

export class FakeInboxRepository implements InboxRepository {
  readonly mode = "demo" as const;
  conversations: InboxConversation[] = [];
  messages: InboxMessage[] = [];

  async listConversations(workspaceId: string, opts: ListConversationsOptions = {}) {
    let convs = this.conversations.filter((c) => c.workspace_id === workspaceId);
    if (opts.channel) convs = convs.filter((c) => c.channel === opts.channel);
    const summaries: ConversationSummary[] = convs.map((c) => {
      const msgs = this.messages
        .filter((m) => m.conversation_id === c.id)
        .sort((a, b) => a.sent_at.localeCompare(b.sent_at));
      const last = msgs[msgs.length - 1];
      const unread = msgs.filter((m) => m.direction === "inbound" && !m.read_at).length;
      return {
        ...c,
        last_message_preview: last ? last.content : "",
        last_message_direction: last ? last.direction : null,
        unread_count: unread,
        unread: unread > 0,
      };
    });
    const filtered = opts.unreadOnly ? summaries.filter((s) => s.unread) : summaries;
    const total = filtered.length;
    const offset = opts.offset ?? 0;
    const limit = opts.limit ?? total;
    return { conversations: filtered.slice(offset, offset + limit), total };
  }
  async getThread(workspaceId: string, conversationId: string) {
    const conversation = this.conversations.find(
      (c) => c.id === conversationId && c.workspace_id === workspaceId
    );
    if (!conversation) return null;
    const messages = this.messages
      .filter((m) => m.conversation_id === conversationId && m.workspace_id === workspaceId)
      .sort((a, b) => a.sent_at.localeCompare(b.sent_at));
    return { conversation, messages };
  }
  async markConversationRead(workspaceId: string, conversationId: string): Promise<number> {
    let marked = 0;
    const now = new Date().toISOString();
    for (const m of this.messages) {
      if (m.workspace_id === workspaceId && m.conversation_id === conversationId && m.direction === "inbound" && !m.read_at) {
        m.read_at = now;
        marked++;
      }
    }
    return marked;
  }
  async getUnreadConversationCount(workspaceId: string): Promise<number> {
    return new Set(
      this.messages.filter((m) => m.workspace_id === workspaceId && m.direction === "inbound" && !m.read_at).map((m) => m.conversation_id)
    ).size;
  }
  async findMessageByIdempotencyKey(workspaceId: string, conversationId: string, key: string): Promise<InboxMessage | null> {
    return this.messages.find((m) => m.workspace_id === workspaceId && m.conversation_id === conversationId && m.idempotency_key === key) ?? null;
  }
  async findOrCreateConversation(workspaceId: string, input: { lead_id: string | null; channel: "email" | "linkedin"; contact_name: string; contact_email: string; subject: string | null; is_demo: boolean }): Promise<string> {
    const existing = this.conversations.find(
      (c) => c.workspace_id === workspaceId && c.lead_id === input.lead_id && c.channel === input.channel && c.status === "open"
    );
    if (existing) return existing.id;
    const conv = makeConversation({
      workspace_id: workspaceId,
      lead_id: input.lead_id,
      channel: input.channel,
      contact_name: input.contact_name,
      contact_email: input.contact_email,
      subject: input.subject,
    });
    this.conversations.push(conv);
    return conv.id;
  }
  async insertMessage(input: InsertMessageInput): Promise<InboxMessage> {
    const msg = makeMessage({ ...input, sent_at: input.sent_at ?? new Date().toISOString() });
    this.messages.push(msg);
    return msg;
  }
  async updateMessage(workspaceId: string, id: string, patch: Partial<InboxMessage>): Promise<InboxMessage> {
    const idx = this.messages.findIndex((m) => m.id === id && m.workspace_id === workspaceId);
    if (idx < 0) throw new Error(`Inbox message not found: ${id}`);
    this.messages[idx] = { ...this.messages[idx], ...patch, id };
    return this.messages[idx];
  }
  async touchConversation(workspaceId: string, conversationId: string, at: string): Promise<void> {
    const c = this.conversations.find((x) => x.id === conversationId && x.workspace_id === workspaceId);
    if (c) c.last_message_at = at;
  }
}

export class FakeUsageRepository implements UsageRepository {
  readonly mode = "demo" as const;
  async getWorkspaceUsage(workspaceId: string): Promise<WorkspaceUsage> {
    return {
      workspace_id: workspaceId,
      plan: "growth",
      subscription_status: "active",
      entitlement_basis: null,
      current_period_end: null,
      period_start: "2026-11-01",
      source: "computed",
      metrics: { leads: 3, campaigns: 1, emailsPerMonth: 0 },
      checks: [],
    };
  }
}

export class FakeIntegrationsRepository implements IntegrationsRepository {
  readonly mode = "demo" as const;
  integrations: Integration[] = [];
  async listIntegrations(workspaceId: string): Promise<Integration[]> {
    return this.integrations.filter((i) => i.workspace_id === workspaceId);
  }
}

export function makeAccount(over: Partial<ConnectedAccount> & { workspace_id: string }): ConnectedAccount {
  return {
    id: over.id ?? nextId("acc"),
    workspace_id: over.workspace_id,
    channel: over.channel ?? "linkedin",
    provider: over.provider ?? "linkedin",
    display_name: over.display_name ?? "Test LinkedIn",
    handle_or_email: over.handle_or_email ?? "test-linkedin",
    avatar_url: over.avatar_url ?? null,
    status: over.status ?? "connected",
    provider_account_id: over.provider_account_id ?? null,
    auth_status: over.auth_status ?? "ok",
    last_sync_at: over.last_sync_at ?? null,
    last_error: over.last_error ?? null,
    warmup_enabled: over.warmup_enabled ?? false,
    daily_limits: over.daily_limits ?? {
      connection_requests: 5,
      messages: 10,
      profile_views: 20,
      like_post: 20,
      endorse_skills: 20,
      find_email: 20,
    },
    warmup_status: over.warmup_status ?? "not_started",
    warmup_preset: over.warmup_preset ?? null,
    warmup_schedule: over.warmup_schedule ?? null,
    warmup_overrides: over.warmup_overrides ?? null,
    warmup_started_at: over.warmup_started_at ?? null,
    warmup_paused_at: over.warmup_paused_at ?? null,
    warmup_paused_ms: over.warmup_paused_ms ?? 0,
    warmup_graduated_at: over.warmup_graduated_at ?? null,
    warmup_history: over.warmup_history ?? [],
    sender_first_name: over.sender_first_name ?? "Test",
    sender_last_name: over.sender_last_name ?? "User",
    sender_job_title: over.sender_job_title ?? "",
    sender_company: over.sender_company ?? "",
    created_at: over.created_at ?? new Date().toISOString(),
    updated_at: over.updated_at ?? new Date().toISOString(),
  };
}

export class FakeAccountsRepository implements AccountsRepository {
  readonly mode = "demo" as const;
  accounts: ConnectedAccount[] = [];
  /** Per-account counted usage returned by countLinkedInActionsToday. */
  usedToday: Record<string, WarmupUsageCounts> = {};

  async listAccounts(workspaceId: string): Promise<ConnectedAccount[]> {
    return this.accounts.filter((a) => a.workspace_id === workspaceId);
  }
  async getAccount(workspaceId: string, id: string): Promise<ConnectedAccount | null> {
    return this.accounts.find((a) => a.id === id && a.workspace_id === workspaceId) ?? null;
  }
  async createAccount(workspaceId: string, input: CreateAccountInput): Promise<ConnectedAccount> {
    const account = makeAccount({
      workspace_id: workspaceId,
      channel: input.channel,
      provider: input.provider,
      display_name: input.display_name,
      handle_or_email: input.handle_or_email,
    });
    this.accounts.unshift(account);
    return account;
  }
  async updateAccount(id: string, patch: UpdateAccountPatch): Promise<ConnectedAccount> {
    const idx = this.accounts.findIndex((a) => a.id === id);
    if (idx < 0) throw new Error(`Account not found: ${id}`);
    this.accounts[idx] = { ...this.accounts[idx], ...patch };
    return this.accounts[idx];
  }
  async deleteAccount(workspaceId: string, id: string): Promise<void> {
    this.accounts = this.accounts.filter((a) => !(a.id === id && a.workspace_id === workspaceId));
  }
  async countLinkedInActionsToday(
    _workspaceId: string,
    accountId: string
  ): Promise<WarmupUsageCounts> {
    return (
      this.usedToday[accountId] ?? {
        connection_requests: 0,
        messages: 0,
        profile_views: 0,
        like_post: 0,
        endorse_skills: 0,
        find_email: 0,
      }
    );
  }
}

export class FakeSafetySettingsRepository implements SafetySettingsRepository {
  readonly mode = "demo" as const;
  settings: Record<string, SafetySettings> = {};

  async get(workspaceId: string): Promise<SafetySettings> {
    return (
      this.settings[workspaceId] ?? {
        workspace_id: workspaceId,
        daily_connection_cap: DEFAULT_SAFETY_SETTINGS.daily_connection_cap,
        working_hours_start: DEFAULT_SAFETY_SETTINGS.working_hours_start,
        working_hours_end: DEFAULT_SAFETY_SETTINGS.working_hours_end,
        working_days: [...DEFAULT_SAFETY_SETTINGS.working_days],
        ramp_up_enabled: DEFAULT_SAFETY_SETTINGS.ramp_up_enabled,
      }
    );
  }
  async save(workspaceId: string, patch: Partial<SafetySettings>): Promise<SafetySettings> {
    const next = { ...(await this.get(workspaceId)), ...patch, workspace_id: workspaceId };
    this.settings[workspaceId] = next;
    return next;
  }
}

export function makeScheduledReply(over: Partial<ScheduledReply> & { workspace_id: string }): ScheduledReply {
  return {
    id: over.id ?? nextId("sr"),
    workspace_id: over.workspace_id,
    conversation_id: over.conversation_id ?? nextId("conv"),
    body: over.body ?? "Follow-up",
    scheduled_at: over.scheduled_at ?? new Date().toISOString(),
    status: over.status ?? "scheduled",
    created_at: over.created_at ?? new Date().toISOString(),
  };
}

export class FakeScheduledRepliesRepository implements ScheduledRepliesRepository {
  readonly mode = "demo" as const;
  replies: ScheduledReply[] = [];

  async schedule(workspaceId: string, input: { conversation_id: string; body: string; scheduled_at: string }): Promise<ScheduledReply> {
    const reply = makeScheduledReply({ workspace_id: workspaceId, ...input });
    this.replies.push(reply);
    return reply;
  }
  async listUpcoming(workspaceId: string): Promise<ScheduledReply[]> {
    return this.replies
      .filter((r) => r.workspace_id === workspaceId && r.status === "scheduled")
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  }
  async listDue(): Promise<ScheduledReply[]> {
    return this.replies.filter((r) => r.status === "scheduled");
  }
  async cancel(id: string): Promise<ScheduledReply> {
    const r = this.replies.find((x) => x.id === id);
    if (!r) throw new Error(`Scheduled reply not found: ${id}`);
    r.status = "cancelled";
    return r;
  }
  async markStatus(id: string, status: ScheduledReply["status"]): Promise<ScheduledReply> {
    const r = this.replies.find((x) => x.id === id);
    if (!r) throw new Error(`Scheduled reply not found: ${id}`);
    r.status = status;
    return r;
  }
  async markSent(id: string): Promise<ScheduledReply> {
    return this.markStatus(id, "sent");
  }
  async markSimulated(id: string): Promise<ScheduledReply> {
    return this.markStatus(id, "simulated");
  }
  async markFailed(id: string): Promise<ScheduledReply> {
    return this.markStatus(id, "failed");
  }
}

export function makeExecution(over: Partial<StepExecutionRecord> & { workspace_id: string; campaign_id: string }): StepExecutionRecord {
  return {
    id: over.id ?? nextId("exec"),
    workspace_id: over.workspace_id,
    campaign_id: over.campaign_id,
    enrollment_id: over.enrollment_id ?? nextId("enr"),
    lead_id: over.lead_id ?? nextId("lead"),
    step_order: over.step_order ?? 1,
    step_type: over.step_type ?? "email",
    channel: over.channel ?? "email",
    status: over.status ?? "sent",
    detail: over.detail ?? "",
    account_id: over.account_id ?? null,
    message_id: over.message_id ?? null,
    provider: over.provider ?? null,
    provider_message_id: over.provider_message_id ?? null,
    idempotency_key: over.idempotency_key ?? nextId("idem"),
    simulated: over.simulated ?? false,
    created_at: over.created_at ?? new Date().toISOString(),
    updated_at: over.updated_at ?? new Date().toISOString(),
  };
}

export class FakeEmailAdapter implements EmailProviderAdapter {
  readonly provider = "resend";
  calls: SendEmailInput[] = [];
  result: SendEmailResult = {
    status: "simulated",
    provider: "resend",
    providerMessageId: null,
    message: "Demo Mode: no email was sent.",
  };
  getState(): ProviderState {
    return "demo";
  }
  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    this.calls.push(input);
    return this.result;
  }
}
