/**
 * Campaigns repository — one interface, two backends.
 *
 * Covers campaign CRUD, sequence steps, lifecycle actions
 * (pause/resume/archive/duplicate/delete) and the campaign activity log.
 * Every lifecycle action appends an activity entry through the same store:
 * - Demo backend: the localStorage demo store, seeded from MOCK_CAMPAIGNS /
 *   MOCK_CAMPAIGN_STEPS. Activity entries are flagged `simulated: true`.
 * - Supabase backend: the `campaigns` / `campaign_steps` tables, with
 *   activity written to the `campaign_activity` table (migration 003).
 *
 * IMPORTANT: nothing in THIS module executes a sequence — it only
 * records lifecycle state. Execution lives in src/lib/executor
 * (Round-2 Stage F): the `follow_up_due` worker advances enrollments
 * in active campaigns, sending email steps through the email adapter
 * and recording LinkedIn steps as skipped (no authorized provider).
 */

import type {
  Campaign,
  CampaignStatus,
  CampaignStep,
  CampaignType,
  StepType,
} from "@/types";
import { createClient } from "@/lib/supabase/client";
import { MOCK_CAMPAIGNS, MOCK_CAMPAIGN_STEPS } from "@/lib/db/mock/data";
import { generateId } from "@/lib/utils";
import { getDataMode, type DataMode } from "./mode";
import { loadDemoCollection, saveDemoCollection } from "./demo-store";
import { DEMO_USER_ID } from "./workspace";
import { withCampaignWebhookEvents } from "./webhook-emission";
import { withFollowUpProducer } from "./followup-producer";

const DEMO_CAMPAIGNS_KEY = "nxtsend_demo_campaigns_v1";
const DEMO_STEPS_KEY = "nxtsend_demo_campaign_steps_v1";
const DEMO_ACTIVITY_KEY = "nxtsend_demo_campaign_activity_v1";
const DEMO_ENROLLMENTS_KEY = "nxtsend_demo_enrollments_v1";

export interface CampaignStepDraft {
  step_type: StepType;
  delay_hours: number;
  subject?: string;
  content?: string;
  config?: Record<string, unknown>;
}

export interface CreateCampaignInput {
  name: string;
  type: CampaignType;
  status?: CampaignStatus;
  steps: CampaignStepDraft[];
}

export interface ActivityEntry {
  id: string;
  workspace_id: string;
  campaign_id: string | null;
  action: string;
  details: string;
  /** True when the entry was recorded by the demo/simulated backend. */
  simulated: boolean;
  created_at: string;
}

export interface EnrollmentRecord {
  id: string;
  campaign_id: string;
  lead_id: string;
  status: string;
  current_step: number;
  enrolled_at: string;
  /** When the previous step executed (migration 010); null before step 1. */
  last_step_at?: string | null;
}

export interface CampaignsRepository {
  readonly mode: DataMode;
  listCampaigns(workspaceId: string): Promise<Campaign[]>;
  getCampaign(workspaceId: string, id: string): Promise<Campaign | null>;
  getCampaignSteps(campaignId: string): Promise<CampaignStep[]>;
  createCampaign(workspaceId: string, input: CreateCampaignInput): Promise<Campaign>;
  updateCampaign(
    id: string,
    patch: Partial<Pick<Campaign, "name" | "type" | "status">>
  ): Promise<Campaign>;
  replaceCampaignSteps(
    campaignId: string,
    steps: CampaignStepDraft[]
  ): Promise<CampaignStep[]>;
  setCampaignStatus(
    workspaceId: string,
    id: string,
    status: CampaignStatus
  ): Promise<void>;
  duplicateCampaign(workspaceId: string, id: string): Promise<Campaign>;
  deleteCampaign(workspaceId: string, id: string): Promise<void>;
  listActivity(workspaceId: string, campaignId?: string): Promise<ActivityEntry[]>;
  appendActivity(
    workspaceId: string,
    entry: { campaign_id?: string | null; action: string; details: string }
  ): Promise<void>;
  /**
   * Assigns leads to a campaign as enrollment records (status "pending").
   * This records the assignment only — no step is executed at enroll
   * time. Execution happens in the sequence executor (src/lib/executor):
   * the follow_up_due worker in live mode, the campaign page's demo
   * runner in Demo Mode. Already-enrolled leads are skipped, not
   * duplicated.
   */
  enrollLeads(
    workspaceId: string,
    campaignId: string,
    leadIds: string[]
  ): Promise<{ enrolled: number; skipped: number }>;
  listEnrollments(campaignId: string): Promise<EnrollmentRecord[]>;
  /**
   * Advances/mutates one enrollment. Used by the sequence executor
   * (step progress, terminal states); lifecycle UI actions do not
   * call this.
   */
  updateEnrollment(
    enrollmentId: string,
    patch: {
      status?: string;
      current_step?: number;
      last_step_at?: string | null;
    }
  ): Promise<void>;
}

const STATUS_ACTIVITY: Partial<Record<CampaignStatus, { action: string; verb: string }>> = {
  active: { action: "campaign_resumed", verb: "resumed" },
  paused: { action: "campaign_paused", verb: "paused" },
  archived: { action: "campaign_archived", verb: "archived" },
  draft: { action: "campaign_status_changed", verb: "moved to draft" },
};

// ============================================================================
// Demo backend
// ============================================================================

function seedDemoSteps(): CampaignStep[] {
  // The mock module ships one example sequence; it belongs to the first
  // mock campaign. Other seeded campaigns honestly start with no steps.
  return MOCK_CAMPAIGN_STEPS.map((s) => ({
    id: s.id,
    campaign_id: "cmp_demo_001",
    step_order: s.step_order,
    step_type: s.step_type,
    delay_hours: s.delay_hours,
    subject: s.subject,
    content: s.content,
    config: {},
  }));
}

class DemoCampaignsRepository implements CampaignsRepository {
  readonly mode: DataMode = "demo";

  private loadCampaigns(): Campaign[] {
    return loadDemoCollection<Campaign>(DEMO_CAMPAIGNS_KEY, () =>
      MOCK_CAMPAIGNS.map((c) => ({ ...c }))
    );
  }
  private saveCampaigns(items: Campaign[]): void {
    saveDemoCollection(DEMO_CAMPAIGNS_KEY, items);
  }
  private loadSteps(): CampaignStep[] {
    return loadDemoCollection<CampaignStep>(DEMO_STEPS_KEY, seedDemoSteps);
  }
  private saveSteps(items: CampaignStep[]): void {
    saveDemoCollection(DEMO_STEPS_KEY, items);
  }
  private loadActivity(): ActivityEntry[] {
    return loadDemoCollection<ActivityEntry>(DEMO_ACTIVITY_KEY, () => []);
  }
  private saveActivity(items: ActivityEntry[]): void {
    saveDemoCollection(DEMO_ACTIVITY_KEY, items);
  }

  async listCampaigns(workspaceId: string): Promise<Campaign[]> {
    return this.loadCampaigns()
      .filter((c) => c.workspace_id === workspaceId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async getCampaign(workspaceId: string, id: string): Promise<Campaign | null> {
    return (
      this.loadCampaigns().find(
        (c) => c.id === id && c.workspace_id === workspaceId
      ) ?? null
    );
  }

  async getCampaignSteps(campaignId: string): Promise<CampaignStep[]> {
    return this.loadSteps()
      .filter((s) => s.campaign_id === campaignId)
      .sort((a, b) => a.step_order - b.step_order);
  }

  async createCampaign(
    workspaceId: string,
    input: CreateCampaignInput
  ): Promise<Campaign> {
    const now = new Date().toISOString();
    const campaign: Campaign = {
      id: `cmp_demo_${generateId()}`,
      workspace_id: workspaceId,
      name: input.name,
      type: input.type,
      status: input.status ?? "draft",
      created_by: DEMO_USER_ID,
      created_at: now,
      updated_at: now,
    };
    const campaigns = this.loadCampaigns();
    campaigns.unshift(campaign);
    this.saveCampaigns(campaigns);

    await this.replaceCampaignSteps(campaign.id, input.steps);
    await this.appendActivity(workspaceId, {
      campaign_id: campaign.id,
      action: "campaign_created",
      details: `Campaign "${campaign.name}" created (${input.steps.length} steps, status ${campaign.status}). Simulated demo store — no messages were sent.`,
    });
    return campaign;
  }

  async updateCampaign(
    id: string,
    patch: Partial<Pick<Campaign, "name" | "type" | "status">>
  ): Promise<Campaign> {
    const campaigns = this.loadCampaigns();
    const idx = campaigns.findIndex((c) => c.id === id);
    if (idx < 0) throw new Error(`Campaign not found: ${id}`);
    const updated = {
      ...campaigns[idx],
      ...patch,
      updated_at: new Date().toISOString(),
    };
    campaigns[idx] = updated;
    this.saveCampaigns(campaigns);
    return updated;
  }

  async replaceCampaignSteps(
    campaignId: string,
    steps: CampaignStepDraft[]
  ): Promise<CampaignStep[]> {
    const others = this.loadSteps().filter((s) => s.campaign_id !== campaignId);
    const mine: CampaignStep[] = steps.map((s, i) => ({
      id: `step_${generateId()}`,
      campaign_id: campaignId,
      step_order: i + 1,
      step_type: s.step_type,
      delay_hours: s.delay_hours,
      subject: s.subject,
      content: s.content,
      config: s.config ?? {},
    }));
    this.saveSteps([...others, ...mine]);
    return mine;
  }

  async setCampaignStatus(
    workspaceId: string,
    id: string,
    status: CampaignStatus
  ): Promise<void> {
    const campaign = await this.getCampaign(workspaceId, id);
    if (!campaign) throw new Error(`Campaign not found: ${id}`);
    await this.updateCampaign(id, { status });
    const meta = STATUS_ACTIVITY[status];
    if (meta) {
      await this.appendActivity(workspaceId, {
        campaign_id: id,
        action: meta.action,
        details: `Campaign "${campaign.name}" ${meta.verb}.`,
      });
    }
  }

  async duplicateCampaign(workspaceId: string, id: string): Promise<Campaign> {
    const source = await this.getCampaign(workspaceId, id);
    if (!source) throw new Error(`Campaign not found: ${id}`);
    const steps = await this.getCampaignSteps(id);
    const copy = await this.createCampaign(workspaceId, {
      name: `${source.name} (Copy)`,
      type: source.type,
      status: "draft",
      steps: steps.map((s) => ({
        step_type: s.step_type,
        delay_hours: s.delay_hours,
        subject: s.subject,
        content: s.content,
        config: s.config,
      })),
    });
    await this.appendActivity(workspaceId, {
      campaign_id: copy.id,
      action: "campaign_duplicated",
      details: `Duplicated from campaign "${source.name}".`,
    });
    return copy;
  }

  async deleteCampaign(workspaceId: string, id: string): Promise<void> {
    const campaign = await this.getCampaign(workspaceId, id);
    this.saveCampaigns(this.loadCampaigns().filter((c) => c.id !== id));
    this.saveSteps(this.loadSteps().filter((s) => s.campaign_id !== id));
    saveDemoCollection(
      DEMO_ENROLLMENTS_KEY,
      this.loadEnrollments().filter((e) => e.campaign_id !== id)
    );
    if (campaign) {
      await this.appendActivity(workspaceId, {
        campaign_id: null,
        action: "campaign_deleted",
        details: `Campaign "${campaign.name}" deleted.`,
      });
    }
  }

  async listActivity(workspaceId: string, campaignId?: string): Promise<ActivityEntry[]> {
    return this.loadActivity()
      .filter((a) => a.workspace_id === workspaceId)
      .filter((a) => !campaignId || a.campaign_id === campaignId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async appendActivity(
    workspaceId: string,
    entry: { campaign_id?: string | null; action: string; details: string }
  ): Promise<void> {
    const items = this.loadActivity();
    items.unshift({
      id: `act_${generateId()}`,
      workspace_id: workspaceId,
      campaign_id: entry.campaign_id ?? null,
      action: entry.action,
      details: entry.details,
      simulated: true, // demo backend: every entry is simulated by definition
      created_at: new Date().toISOString(),
    });
    this.saveActivity(items);
  }

  private loadEnrollments(): EnrollmentRecord[] {
    return loadDemoCollection<EnrollmentRecord>(DEMO_ENROLLMENTS_KEY, () => []);
  }

  async enrollLeads(
    workspaceId: string,
    campaignId: string,
    leadIds: string[]
  ): Promise<{ enrolled: number; skipped: number }> {
    const campaign = await this.getCampaign(workspaceId, campaignId);
    if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);
    const existing = this.loadEnrollments().filter(
      (e) => e.campaign_id === campaignId
    );
    const existingLeadIds = new Set(existing.map((e) => e.lead_id));
    const fresh = leadIds.filter((id) => !existingLeadIds.has(id));
    const now = new Date().toISOString();
    const all = this.loadEnrollments();
    for (const leadId of fresh) {
      all.unshift({
        id: `enr_${generateId()}`,
        campaign_id: campaignId,
        lead_id: leadId,
        status: "pending",
        current_step: 0,
        enrolled_at: now,
      });
    }
    saveDemoCollection(DEMO_ENROLLMENTS_KEY, all);
    if (fresh.length > 0) {
      await this.appendActivity(workspaceId, {
        campaign_id: campaignId,
        action: "leads_enrolled",
        details: `Enrolled ${fresh.length} lead(s) into "${campaign.name}" (assignment recorded; sequence execution is simulated in demo mode).`,
      });
    }
    return { enrolled: fresh.length, skipped: leadIds.length - fresh.length };
  }

  async listEnrollments(campaignId: string): Promise<EnrollmentRecord[]> {
    return this.loadEnrollments()
      .filter((e) => e.campaign_id === campaignId)
      .sort((a, b) => b.enrolled_at.localeCompare(a.enrolled_at));
  }

  async updateEnrollment(
    enrollmentId: string,
    patch: {
      status?: string;
      current_step?: number;
      last_step_at?: string | null;
    }
  ): Promise<void> {
    const all = this.loadEnrollments();
    const idx = all.findIndex((e) => e.id === enrollmentId);
    if (idx < 0) throw new Error(`Enrollment not found: ${enrollmentId}`);
    all[idx] = { ...all[idx], ...patch };
    saveDemoCollection(DEMO_ENROLLMENTS_KEY, all);
  }
}

// ============================================================================
// Supabase backend
// ============================================================================

type Row = Record<string, unknown>;

function rowToCampaign(row: Row): Campaign {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    name: String(row.name ?? ""),
    type: (row.type as CampaignType) ?? "linkedin",
    status: (row.status as CampaignStatus) ?? "draft",
    created_by: String(row.created_by ?? ""),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

function rowToStep(row: Row): CampaignStep {
  return {
    id: String(row.id),
    campaign_id: String(row.campaign_id),
    step_order: Number(row.step_order ?? 0),
    step_type: row.step_type as StepType,
    delay_hours: Number(row.delay_hours ?? 0),
    subject: (row.subject as string) ?? undefined,
    content: (row.content as string) ?? undefined,
    config:
      row.config && typeof row.config === "object"
        ? (row.config as Record<string, unknown>)
        : {},
  };
}

function rowToActivity(row: Row): ActivityEntry {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    campaign_id: (row.campaign_id as string) ?? null,
    action: String(row.action ?? ""),
    details: String(row.details ?? ""),
    simulated: Boolean(row.simulated),
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

class SupabaseCampaignsRepository implements CampaignsRepository {
  readonly mode: DataMode = "supabase";

  private client() {
    const supabase = createClient();
    if (!supabase) {
      throw new Error("Supabase client unavailable while data mode is 'supabase'");
    }
    return supabase;
  }

  private async actorId(): Promise<string | null> {
    const {
      data: { user },
    } = await this.client().auth.getUser();
    return user?.id ?? null;
  }

  /**
   * Internal lifecycle logging is best-effort: a failed activity write
   * (e.g. migration 003 not applied yet) must not fail the lifecycle action
   * itself, which has already committed. The public appendActivity()
   * remains strict and throws.
   */
  private async logActivity(
    workspaceId: string,
    entry: { campaign_id?: string | null; action: string; details: string }
  ): Promise<void> {
    try {
      await this.appendActivity(workspaceId, entry);
    } catch (err) {
      console.error("[NxtSend] Failed to record campaign activity:", err);
    }
  }

  async listCampaigns(workspaceId: string): Promise<Campaign[]> {
    const { data, error } = await this.client()
      .from("campaigns")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to load campaigns: ${error.message}`);
    return (data ?? []).map((r) => rowToCampaign(r as Row));
  }

  async getCampaign(workspaceId: string, id: string): Promise<Campaign | null> {
    const { data, error } = await this.client()
      .from("campaigns")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Failed to load campaign: ${error.message}`);
    return data ? rowToCampaign(data as Row) : null;
  }

  async getCampaignSteps(campaignId: string): Promise<CampaignStep[]> {
    const { data, error } = await this.client()
      .from("campaign_steps")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("step_order", { ascending: true });
    if (error) throw new Error(`Failed to load campaign steps: ${error.message}`);
    return (data ?? []).map((r) => rowToStep(r as Row));
  }

  async createCampaign(
    workspaceId: string,
    input: CreateCampaignInput
  ): Promise<Campaign> {
    const supabase = this.client();
    const createdBy = await this.actorId();
    const { data, error } = await supabase
      .from("campaigns")
      .insert({
        workspace_id: workspaceId,
        name: input.name,
        type: input.type,
        status: input.status ?? "draft",
        created_by: createdBy,
      })
      .select("*")
      .single();
    if (error) throw new Error(`Failed to create campaign: ${error.message}`);
    const campaign = rowToCampaign(data as Row);

    await this.replaceCampaignSteps(campaign.id, input.steps);
    await this.logActivity(workspaceId, {
      campaign_id: campaign.id,
      action: "campaign_created",
      details: `Campaign "${campaign.name}" created (${input.steps.length} steps, status ${campaign.status}).`,
    });
    return campaign;
  }

  async updateCampaign(
    id: string,
    patch: Partial<Pick<Campaign, "name" | "type" | "status">>
  ): Promise<Campaign> {
    const { data, error } = await this.client()
      .from("campaigns")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(`Failed to update campaign: ${error.message}`);
    return rowToCampaign(data as Row);
  }

  async replaceCampaignSteps(
    campaignId: string,
    steps: CampaignStepDraft[]
  ): Promise<CampaignStep[]> {
    const supabase = this.client();
    const { error: delError } = await supabase
      .from("campaign_steps")
      .delete()
      .eq("campaign_id", campaignId);
    if (delError) {
      throw new Error(`Failed to replace campaign steps: ${delError.message}`);
    }
    if (steps.length === 0) return [];
    const rows = steps.map((s, i) => ({
      campaign_id: campaignId,
      step_order: i + 1,
      step_type: s.step_type,
      delay_hours: s.delay_hours,
      subject: s.subject ?? null,
      content: s.content ?? null,
      config: s.config ?? {},
    }));
    const { data, error } = await supabase
      .from("campaign_steps")
      .insert(rows)
      .select("*");
    if (error) {
      throw new Error(`Failed to save campaign steps: ${error.message}`);
    }
    return (data ?? []).map((r) => rowToStep(r as Row));
  }

  async setCampaignStatus(
    workspaceId: string,
    id: string,
    status: CampaignStatus
  ): Promise<void> {
    const campaign = await this.getCampaign(workspaceId, id);
    if (!campaign) throw new Error(`Campaign not found: ${id}`);
    await this.updateCampaign(id, { status });
    const meta = STATUS_ACTIVITY[status];
    if (meta) {
      await this.logActivity(workspaceId, {
        campaign_id: id,
        action: meta.action,
        details: `Campaign "${campaign.name}" ${meta.verb}.`,
      });
    }
  }

  async duplicateCampaign(workspaceId: string, id: string): Promise<Campaign> {
    const source = await this.getCampaign(workspaceId, id);
    if (!source) throw new Error(`Campaign not found: ${id}`);
    const steps = await this.getCampaignSteps(id);
    const copy = await this.createCampaign(workspaceId, {
      name: `${source.name} (Copy)`,
      type: source.type,
      status: "draft",
      steps: steps.map((s) => ({
        step_type: s.step_type,
        delay_hours: s.delay_hours,
        subject: s.subject,
        content: s.content,
        config: s.config,
      })),
    });
    await this.logActivity(workspaceId, {
      campaign_id: copy.id,
      action: "campaign_duplicated",
      details: `Duplicated from campaign "${source.name}".`,
    });
    return copy;
  }

  async deleteCampaign(workspaceId: string, id: string): Promise<void> {
    const campaign = await this.getCampaign(workspaceId, id);
    const { error } = await this.client()
      .from("campaigns")
      .delete()
      .eq("id", id)
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(`Failed to delete campaign: ${error.message}`);
    if (campaign) {
      await this.logActivity(workspaceId, {
        campaign_id: null,
        action: "campaign_deleted",
        details: `Campaign "${campaign.name}" deleted.`,
      });
    }
  }

  async listActivity(workspaceId: string, campaignId?: string): Promise<ActivityEntry[]> {
    let query = this.client()
      .from("campaign_activity")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (campaignId) {
      query = query.eq("campaign_id", campaignId);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Failed to load activity: ${error.message}`);
    return (data ?? []).map((r) => rowToActivity(r as Row));
  }

  async appendActivity(
    workspaceId: string,
    entry: { campaign_id?: string | null; action: string; details: string }
  ): Promise<void> {
    const actorId = await this.actorId();
    const { error } = await this.client()
      .from("campaign_activity")
      .insert({
        workspace_id: workspaceId,
        campaign_id: entry.campaign_id ?? null,
        actor_id: actorId,
        action: entry.action,
        details: entry.details,
        simulated: false,
      });
    if (error) throw new Error(`Failed to record activity: ${error.message}`);
  }

  async enrollLeads(
    workspaceId: string,
    campaignId: string,
    leadIds: string[]
  ): Promise<{ enrolled: number; skipped: number }> {
    if (leadIds.length === 0) return { enrolled: 0, skipped: 0 };
    const campaign = await this.getCampaign(workspaceId, campaignId);
    if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);
    const rows = leadIds.map((leadId) => ({
      campaign_id: campaignId,
      lead_id: leadId,
      status: "pending" as const,
      current_step: 0,
    }));
    // The UNIQUE (campaign_id, lead_id) constraint + ignoreDuplicates makes
    // re-enrolling an already-enrolled lead a no-op instead of an error.
    const { data, error } = await this.client()
      .from("campaign_enrollments")
      .upsert(rows, { onConflict: "campaign_id,lead_id", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`Failed to enroll leads: ${error.message}`);
    const enrolled = data?.length ?? 0;
    if (enrolled > 0) {
      await this.logActivity(workspaceId, {
        campaign_id: campaignId,
        action: "leads_enrolled",
        details: `Enrolled ${enrolled} lead(s) into "${campaign.name}" (assignment recorded; no steps executed yet).`,
      });
    }
    return { enrolled, skipped: leadIds.length - enrolled };
  }

  async listEnrollments(campaignId: string): Promise<EnrollmentRecord[]> {
    const { data, error } = await this.client()
      .from("campaign_enrollments")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("enrolled_at", { ascending: false });
    if (error) throw new Error(`Failed to load enrollments: ${error.message}`);
    return (data ?? []).map((r) => {
      const row = r as Row;
      return {
        id: String(row.id),
        campaign_id: String(row.campaign_id),
        lead_id: String(row.lead_id),
        status: String(row.status ?? "pending"),
        current_step: Number(row.current_step ?? 0),
        enrolled_at: String(row.enrolled_at ?? new Date().toISOString()),
        last_step_at: (row.last_step_at as string | null) ?? null,
      };
    });
  }

  async updateEnrollment(
    enrollmentId: string,
    patch: {
      status?: string;
      current_step?: number;
      last_step_at?: string | null;
    }
  ): Promise<void> {
    const { error } = await this.client()
      .from("campaign_enrollments")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", enrollmentId);
    if (error) throw new Error(`Failed to update enrollment: ${error.message}`);
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createCampaignsRepository(
  mode: DataMode = getDataMode()
): CampaignsRepository {
  const repo =
    mode === "supabase"
      ? new SupabaseCampaignsRepository()
      : new DemoCampaignsRepository();
  return withFollowUpProducer(withCampaignWebhookEvents(repo));
}
