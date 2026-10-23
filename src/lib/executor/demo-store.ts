/**
 * Sequence executor — Demo Mode store.
 *
 * In Demo Mode there is no server database: the demo dataset lives in
 * the browser demo store (localStorage). The executor therefore runs
 * in-app against the data-layer repositories — campaigns/leads/inbox —
 * with execution claims kept in their own demo collection. Every
 * record is flagged simulated, and the email adapter is in its demo
 * state, so a "send" here can only ever produce a labelled simulated
 * message. The live path (cron worker + SupabaseExecutorStore) runs
 * the identical core against the database.
 *
 * Demo stop-rule signals: replies are detected from the demo inbox
 * (inbound messages from the lead at/after enrollment). Suppressions
 * are read from the demo suppression store via GET
 * /api/email/suppressions (P5 Stage C): the public unsubscribe
 * endpoint and the suppression UI write to that same store, so an
 * unsubscribe or a manual block in Demo Mode stops the enrollment
 * here exactly like the live stop rules do. The read is browser-only
 * and fail-soft (an unreachable API yields no suppression signal) —
 * acceptable in demo, where the adapter only ever simulates; the
 * LIVE send path (Supabase store + adapter) remains fail-closed.
 */

import type { CampaignStep, Lead, WarmupHistoryEntry } from "@/types";
import type { CampaignsRepository } from "@/lib/data/campaigns";
import type { LeadsRepository } from "@/lib/data/leads";
import type { InboxRepository } from "@/lib/data/inbox";
import {
  createAccountsRepository,
  warmupPatchToAccountPatch,
  warmupStateOf,
} from "@/lib/data/accounts";
import { DEMO_WORKSPACE_ID } from "@/lib/data/workspace";
import { DEMO_WORKSPACE_PLAN } from "@/lib/data/usage";
import { generateId } from "@/lib/utils";
import type {
  AccountWarmupState,
  WarmupProgramPatch,
  WarmupUsageCounts,
} from "@/lib/linkedin/warmup";
import { loadDemoExecutions, saveDemoExecutions } from "./demo-executions";
import type {
  ClaimStepExecutionInput,
  ExecutorCampaign,
  ExecutorEnrollment,
  ExecutorStore,
  LeadSignals,
  SenderIdentity,
  StepExecutionRecord,
} from "./types";

export interface DemoExecutorStoreDeps {
  campaigns: CampaignsRepository;
  leads: LeadsRepository;
  inbox: InboxRepository;
}

export class DemoExecutorStore implements ExecutorStore {
  readonly simulated = true;
  private readonly deps: DemoExecutorStoreDeps;
  /** email → reason, fetched once per store instance (one scan run). */
  private suppressionCache: Promise<Map<string, string>> | null = null;

  constructor(deps: DemoExecutorStoreDeps) {
    this.deps = deps;
  }

  /**
   * The demo suppression list, from the same API the suppression UI
   * and the public unsubscribe endpoint use. Browser-only: anywhere
   * else (unit tests, SSR) there is no demo API to ask, so the map is
   * empty — demo sends there remain simple simulations.
   */
  private loadDemoSuppressions(): Promise<Map<string, string>> {
    if (!this.suppressionCache) {
      this.suppressionCache = (async () => {
        const map = new Map<string, string>();
        if (typeof window === "undefined" || typeof fetch !== "function") {
          return map;
        }
        try {
          const res = await fetch("/api/email/suppressions");
          if (!res.ok) return map;
          const body = (await res.json()) as {
            entries?: Array<{ email?: string; reason?: string }>;
          };
          for (const entry of body.entries ?? []) {
            if (entry.email) {
              map.set(entry.email.trim().toLowerCase(), entry.reason ?? "suppressed");
            }
          }
        } catch {
          // Fail soft in demo only (see header): no signal.
        }
        return map;
      })();
    }
    return this.suppressionCache;
  }

  private loadExecutions(): StepExecutionRecord[] {
    return loadDemoExecutions();
  }
  private saveExecutions(items: StepExecutionRecord[]): void {
    saveDemoExecutions(items);
  }

  async listEnrollments(
    workspaceId: string | null,
    limit: number
  ): Promise<ExecutorEnrollment[]> {
    const ws = workspaceId ?? DEMO_WORKSPACE_ID;
    const campaigns = await this.deps.campaigns.listCampaigns(ws);
    const out: ExecutorEnrollment[] = [];
    for (const campaign of campaigns) {
      if (campaign.status !== "active") continue;
      const enrollments = await this.deps.campaigns.listEnrollments(campaign.id);
      for (const e of enrollments) {
        if (e.status !== "pending" && e.status !== "active") continue;
        out.push({
          id: e.id,
          workspace_id: ws,
          campaign_id: e.campaign_id,
          lead_id: e.lead_id,
          status: e.status,
          current_step: e.current_step,
          enrolled_at: e.enrolled_at,
          last_step_at: e.last_step_at ?? null,
        });
        if (out.length >= limit) return out;
      }
    }
    return out;
  }

  async getCampaign(
    workspaceId: string,
    campaignId: string
  ): Promise<ExecutorCampaign | null> {
    const campaign = await this.deps.campaigns.getCampaign(workspaceId, campaignId);
    if (!campaign) return null;
    return {
      id: campaign.id,
      workspace_id: campaign.workspace_id,
      name: campaign.name,
      type: campaign.type,
      status: campaign.status,
      sender_account_id: campaign.sender_account_id ?? null,
      email_account_id: campaign.email_account_id ?? null,
    };
  }

  async getSteps(campaignId: string): Promise<CampaignStep[]> {
    return this.deps.campaigns.getCampaignSteps(campaignId);
  }

  /**
   * Sender identity for the {my_*} variables: the campaign's
   * connected account (demo store) for the requested channel.
   */
  async getSenderIdentity(
    workspaceId: string,
    campaignId: string,
    channel: "linkedin" | "email"
  ): Promise<SenderIdentity | null> {
    const campaign = await this.deps.campaigns.getCampaign(
      workspaceId,
      campaignId
    );
    if (!campaign) return null;
    const accountId =
      channel === "linkedin"
        ? campaign.sender_account_id
        : campaign.email_account_id;
    if (!accountId) return null;
    const account = await createAccountsRepository("demo").getAccount(
      workspaceId,
      accountId
    );
    if (!account) return null;
    return {
      firstName: account.sender_first_name || undefined,
      lastName: account.sender_last_name || undefined,
      jobTitle: account.sender_job_title || undefined,
      companyName: account.sender_company || undefined,
    };
  }

  /** Warm-up gate: the account's program state from the demo accounts repo. */
  async getAccountWarmupState(
    workspaceId: string,
    accountId: string
  ): Promise<AccountWarmupState | null> {
    const account = await createAccountsRepository("demo").getAccount(
      workspaceId,
      accountId
    );
    return account ? warmupStateOf(account) : null;
  }

  /** Warm-up gate + panel: today's usage under the DEMO counting rule. */
  async countLinkedInActionsToday(
    workspaceId: string,
    accountId: string,
    dayStartIso: string
  ): Promise<WarmupUsageCounts> {
    return createAccountsRepository("demo").countLinkedInActionsToday(
      workspaceId,
      accountId,
      dayStartIso
    );
  }

  /** Persists an engine transition (lazy graduation). Best-effort. */
  async persistWarmupTransition(
    _workspaceId: string,
    accountId: string,
    patch: WarmupProgramPatch,
    entryState: AccountWarmupState,
    entry: WarmupHistoryEntry
  ): Promise<void> {
    try {
      await createAccountsRepository("demo").updateAccount(
        accountId,
        warmupPatchToAccountPatch(entryState.history, patch, entry)
      );
    } catch {
      // Best-effort by contract: a failed graduation write must not
      // fail the executor run; the next scan re-derives it.
    }
  }

  async getLead(workspaceId: string, leadId: string): Promise<Lead | null> {
    const leads = await this.deps.leads.listLeads(workspaceId);
    return leads.find((l) => l.id === leadId) ?? null;
  }

  async getLeadSignals(
    workspaceId: string,
    lead: Lead,
    enrolledAt: string
  ): Promise<LeadSignals> {
    const { conversations } = await this.deps.inbox.listConversations(workspaceId, {
      limit: 200,
    });
    let repliedAt: string | null = null;
    for (const conv of conversations) {
      if (conv.lead_id !== lead.id) continue;
      const thread = await this.deps.inbox.getThread(workspaceId, conv.id);
      if (!thread) continue;
      for (const msg of thread.messages) {
        if (
          msg.direction === "inbound" &&
          msg.lead_id === lead.id &&
          msg.sent_at >= enrolledAt &&
          (!repliedAt || msg.sent_at < repliedAt)
        ) {
          repliedAt = msg.sent_at;
        }
      }
    }
    const suppressions = await this.loadDemoSuppressions();
    const suppressionReason = lead.email
      ? (suppressions.get(lead.email.trim().toLowerCase()) ?? null)
      : null;
    return { repliedAt, suppressionReason };
  }

  async getWorkspacePlan(): Promise<import("@/types").PlanType> {
    return DEMO_WORKSPACE_PLAN;
  }

  async countEmailsThisMonth(
    workspaceId: string,
    periodStartIso: string
  ): Promise<number> {
    const { conversations } = await this.deps.inbox.listConversations(workspaceId, {
      limit: 200,
    });
    let count = 0;
    for (const conv of conversations) {
      const thread = await this.deps.inbox.getThread(workspaceId, conv.id);
      if (!thread) continue;
      for (const msg of thread.messages) {
        if (
          msg.channel === "email" &&
          msg.direction === "outbound" &&
          msg.sent_at >= periodStartIso
        ) {
          count++;
        }
      }
    }
    return count;
  }

  async claimStepExecution(
    input: ClaimStepExecutionInput
  ): Promise<StepExecutionRecord | null> {
    const all = this.loadExecutions();
    const existing = all.find(
      (e) =>
        e.enrollment_id === input.enrollment_id &&
        e.step_order === input.step_order
    );
    if (existing) return null;
    const now = new Date().toISOString();
    const record: StepExecutionRecord = {
      id: `exec_demo_${generateId()}`,
      workspace_id: input.workspace_id,
      campaign_id: input.campaign_id,
      enrollment_id: input.enrollment_id,
      lead_id: input.lead_id,
      step_order: input.step_order,
      step_type: input.step_type,
      channel: input.channel,
      status: "sending",
      detail: "",
      account_id: input.account_id,
      message_id: null,
      provider: null,
      provider_message_id: null,
      idempotency_key: input.idempotency_key,
      simulated: true,
      created_at: now,
      updated_at: now,
    };
    all.push(record);
    this.saveExecutions(all);
    return record;
  }

  async completeStepExecution(
    id: string,
    patch: Partial<
      Pick<
        StepExecutionRecord,
        "status" | "detail" | "message_id" | "provider" | "provider_message_id"
      >
    >
  ): Promise<void> {
    const all = this.loadExecutions();
    const idx = all.findIndex((e) => e.id === id);
    if (idx < 0) return;
    all[idx] = { ...all[idx], ...patch, updated_at: new Date().toISOString() };
    this.saveExecutions(all);
  }

  async releaseStepExecution(id: string): Promise<void> {
    this.saveExecutions(this.loadExecutions().filter((e) => e.id !== id));
  }

  async ensureConversation(
    workspaceId: string,
    input: {
      lead_id: string;
      channel: "email" | "linkedin";
      contact_name: string;
      contact_email: string;
      company: string | null;
      subject: string | null;
    }
  ): Promise<string> {
    return this.deps.inbox.findOrCreateConversation(workspaceId, {
      lead_id: input.lead_id,
      channel: input.channel,
      contact_name: input.contact_name,
      contact_email: input.contact_email,
      subject: input.subject,
      is_demo: true,
    });
  }

  async insertMessage(
    input: Parameters<ExecutorStore["insertMessage"]>[0]
  ): Promise<import("@/lib/data/inbox").InboxMessage> {
    return this.deps.inbox.insertMessage(input);
  }

  async updateEnrollment(
    enrollmentId: string,
    patch: { status?: string; current_step?: number; last_step_at?: string | null }
  ): Promise<void> {
    await this.deps.campaigns.updateEnrollment(enrollmentId, patch);
  }

  async appendActivity(
    workspaceId: string,
    entry: { campaign_id: string | null; action: string; details: string }
  ): Promise<void> {
    await this.deps.campaigns.appendActivity(workspaceId, entry);
  }

  /** All execution records for a campaign (UI display + tests). */
  async listExecutions(campaignId: string): Promise<StepExecutionRecord[]> {
    return this.loadExecutions()
      .filter((e) => e.campaign_id === campaignId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}
