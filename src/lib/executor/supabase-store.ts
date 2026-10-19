/**
 * Sequence executor — Supabase store (server-side, service role).
 *
 * Used by the `follow_up_due` job handler in live mode. All reads and
 * writes go through the service-role client: the worker is a system
 * actor, and `campaign_step_executions` deliberately has no client
 * write policies (migration 010). Workspace scoping is applied in
 * every query explicitly — the service role bypasses RLS, so the
 * scoping here IS the tenant isolation for executor writes.
 *
 * Message records go through the inbox repository bound to the same
 * admin client, so executor sends land in the exact thread model the
 * Inbox UI and message history read (find-or-create conversation +
 * message row carrying the provider outcome).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampaignStep, Lead, PlanType } from "@/types";
import { createInboxRepository, type InboxRepository } from "@/lib/data/inbox";
import { normalizeEmail } from "@/lib/email/suppression";
import type {
  ClaimStepExecutionInput,
  ExecutorCampaign,
  ExecutorEnrollment,
  ExecutorStore,
  LeadSignals,
  StepExecutionRecord,
} from "./types";

type Row = Record<string, unknown>;

function rowToExecution(row: Row): StepExecutionRecord {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    campaign_id: String(row.campaign_id),
    enrollment_id: String(row.enrollment_id),
    lead_id: String(row.lead_id),
    step_order: Number(row.step_order ?? 0),
    step_type: row.step_type as StepExecutionRecord["step_type"],
    channel: row.channel as StepExecutionRecord["channel"],
    status: row.status as StepExecutionRecord["status"],
    detail: String(row.detail ?? ""),
    message_id: (row.message_id as string | null) ?? null,
    provider: (row.provider as string | null) ?? null,
    provider_message_id: (row.provider_message_id as string | null) ?? null,
    idempotency_key: String(row.idempotency_key ?? ""),
    simulated: Boolean(row.simulated),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

export class SupabaseExecutorStore implements ExecutorStore {
  readonly simulated = false;
  private readonly admin: SupabaseClient;
  private readonly inbox: InboxRepository;

  constructor(admin: SupabaseClient) {
    this.admin = admin;
    this.inbox = createInboxRepository("supabase", admin);
  }

  async listEnrollments(
    workspaceId: string | null,
    limit: number
  ): Promise<ExecutorEnrollment[]> {
    let campaignQuery = this.admin
      .from("campaigns")
      .select("id, workspace_id")
      .eq("status", "active");
    if (workspaceId) campaignQuery = campaignQuery.eq("workspace_id", workspaceId);
    const { data: campaigns, error: campErr } = await campaignQuery;
    if (campErr) {
      throw new Error(`Executor: failed to list active campaigns: ${campErr.message}`);
    }
    const campaignRows = (campaigns ?? []) as Row[];
    if (campaignRows.length === 0) return [];
    const workspaceByCampaign = new Map(
      campaignRows.map((c) => [String(c.id), String(c.workspace_id)])
    );
    const { data, error } = await this.admin
      .from("campaign_enrollments")
      .select("*")
      .in("campaign_id", Array.from(workspaceByCampaign.keys()))
      .in("status", ["pending", "active"])
      .order("enrolled_at", { ascending: true })
      .limit(limit);
    if (error) {
      throw new Error(`Executor: failed to list enrollments: ${error.message}`);
    }
    return ((data ?? []) as Row[]).map((r) => ({
      id: String(r.id),
      workspace_id: workspaceByCampaign.get(String(r.campaign_id)) ?? "",
      campaign_id: String(r.campaign_id),
      lead_id: String(r.lead_id),
      status: String(r.status ?? "pending"),
      current_step: Number(r.current_step ?? 0),
      enrolled_at: String(r.enrolled_at ?? new Date().toISOString()),
      last_step_at: (r.last_step_at as string | null) ?? null,
    }));
  }

  async getCampaign(
    workspaceId: string,
    campaignId: string
  ): Promise<ExecutorCampaign | null> {
    const { data, error } = await this.admin
      .from("campaigns")
      .select("id, workspace_id, name, type, status")
      .eq("workspace_id", workspaceId)
      .eq("id", campaignId)
      .maybeSingle();
    if (error) throw new Error(`Executor: failed to load campaign: ${error.message}`);
    if (!data) return null;
    const r = data as Row;
    return {
      id: String(r.id),
      workspace_id: String(r.workspace_id),
      name: String(r.name ?? ""),
      type: (r.type as ExecutorCampaign["type"]) ?? "linkedin",
      status: String(r.status ?? "draft"),
    };
  }

  async getSteps(campaignId: string): Promise<CampaignStep[]> {
    const { data, error } = await this.admin
      .from("campaign_steps")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("step_order", { ascending: true });
    if (error) throw new Error(`Executor: failed to load steps: ${error.message}`);
    return ((data ?? []) as Row[]).map((r) => ({
      id: String(r.id),
      campaign_id: String(r.campaign_id),
      step_order: Number(r.step_order ?? 0),
      step_type: r.step_type as CampaignStep["step_type"],
      delay_hours: Number(r.delay_hours ?? 0),
      subject: (r.subject as string) ?? undefined,
      content: (r.content as string) ?? undefined,
      config:
        r.config && typeof r.config === "object"
          ? (r.config as Record<string, unknown>)
          : {},
    }));
  }

  async getLead(workspaceId: string, leadId: string): Promise<Lead | null> {
    const { data, error } = await this.admin
      .from("leads")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", leadId)
      .maybeSingle();
    if (error) throw new Error(`Executor: failed to load lead: ${error.message}`);
    if (!data) return null;
    const r = data as Row;
    return {
      id: String(r.id),
      workspace_id: String(r.workspace_id),
      first_name: (r.first_name as string) ?? undefined,
      last_name: (r.last_name as string) ?? undefined,
      email: (r.email as string) ?? undefined,
      linkedin_url: (r.linkedin_url as string) ?? undefined,
      company: (r.company as string) ?? undefined,
      job_title: (r.job_title as string) ?? undefined,
      status: String(r.status ?? "new"),
      tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
      custom_fields:
        r.custom_fields && typeof r.custom_fields === "object"
          ? (r.custom_fields as Record<string, unknown>)
          : {},
      created_at: String(r.created_at ?? new Date().toISOString()),
    };
  }

  async getLeadSignals(
    workspaceId: string,
    lead: Lead,
    enrolledAt: string
  ): Promise<LeadSignals> {
    const { data: reply } = await this.admin
      .from("messages")
      .select("sent_at")
      .eq("workspace_id", workspaceId)
      .eq("lead_id", lead.id)
      .eq("direction", "inbound")
      .gte("sent_at", enrolledAt)
      .order("sent_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    let suppressionReason: string | null = null;
    const email = normalizeEmail(lead.email ?? "");
    if (email) {
      const { data: sup } = await this.admin
        .from("suppression_list")
        .select("reason")
        .eq("workspace_id", workspaceId)
        .eq("email", email)
        .maybeSingle();
      if (sup) suppressionReason = String((sup as Row).reason ?? "suppressed");
    }
    return {
      repliedAt: reply ? String((reply as Row).sent_at) : null,
      suppressionReason,
    };
  }

  async getWorkspacePlan(workspaceId: string): Promise<PlanType> {
    const { data } = await this.admin
      .from("subscriptions")
      .select("plan")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (data?.plan) return String(data.plan) as PlanType;
    const { data: ws } = await this.admin
      .from("workspaces")
      .select("plan")
      .eq("id", workspaceId)
      .maybeSingle();
    return (ws?.plan ? String(ws.plan) : "free") as PlanType;
  }

  async countEmailsThisMonth(
    workspaceId: string,
    periodStartIso: string
  ): Promise<number> {
    const { count } = await this.admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("channel", "email")
      .eq("direction", "outbound")
      .eq("is_demo", false)
      .gte("sent_at", periodStartIso);
    return count ?? 0;
  }

  async claimStepExecution(
    input: ClaimStepExecutionInput
  ): Promise<StepExecutionRecord | null> {
    const { data, error } = await this.admin
      .from("campaign_step_executions")
      .insert({
        workspace_id: input.workspace_id,
        campaign_id: input.campaign_id,
        enrollment_id: input.enrollment_id,
        lead_id: input.lead_id,
        step_order: input.step_order,
        step_type: input.step_type,
        channel: input.channel,
        status: "sending",
        detail: "",
        idempotency_key: input.idempotency_key,
        simulated: input.simulated,
      })
      .select("*")
      .single();
    if (error) {
      // 23505 = unique_violation on (enrollment_id, step_order): the
      // step was already claimed/executed — at-most-once holds.
      if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
        return null;
      }
      throw new Error(`Executor: failed to claim step execution: ${error.message}`);
    }
    return rowToExecution(data as Row);
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
    const { error } = await this.admin
      .from("campaign_step_executions")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      throw new Error(`Executor: failed to complete step execution: ${error.message}`);
    }
  }

  async releaseStepExecution(id: string): Promise<void> {
    const { error } = await this.admin
      .from("campaign_step_executions")
      .delete()
      .eq("id", id);
    if (error) {
      throw new Error(`Executor: failed to release step execution: ${error.message}`);
    }
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
    return this.inbox.findOrCreateConversation(workspaceId, {
      lead_id: input.lead_id,
      channel: input.channel,
      contact_name: input.contact_name,
      contact_email: input.contact_email,
      subject: input.subject,
      is_demo: false,
    });
  }

  async insertMessage(
    input: Parameters<ExecutorStore["insertMessage"]>[0]
  ): Promise<import("@/lib/data/inbox").InboxMessage> {
    return this.inbox.insertMessage(input);
  }

  async updateEnrollment(
    enrollmentId: string,
    patch: { status?: string; current_step?: number; last_step_at?: string | null }
  ): Promise<void> {
    const { error } = await this.admin
      .from("campaign_enrollments")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", enrollmentId);
    if (error) {
      throw new Error(`Executor: failed to update enrollment: ${error.message}`);
    }
  }

  async appendActivity(
    workspaceId: string,
    entry: { campaign_id: string | null; action: string; details: string }
  ): Promise<void> {
    const { error } = await this.admin.from("campaign_activity").insert({
      workspace_id: workspaceId,
      campaign_id: entry.campaign_id,
      actor_id: null,
      action: entry.action,
      details: entry.details,
      simulated: false,
    });
    if (error) {
      // Activity is the audit trail for sends — surface loudly in the
      // worker log rather than failing a send that already committed.
      console.error("[Executor] Failed to record campaign activity:", error.message);
    }
  }
}
