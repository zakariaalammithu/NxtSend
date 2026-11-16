/**
 * Muse Connector adapter — REAL implementation (Worker B).
 * (Interface + unimplemented stub live in ./interface.ts — client-safe;
 * this file is server-only and is imported directly by the MCP server,
 * never through the client-imported barrel.)
 *
 * The UnimplementedMuseConnectorAdapter below is kept exported
 * (existing tests + the readiness story depend on it); the MCP route
 * uses NxtSendMuseConnectorAdapter, which implements all 18 manifest
 * tools against the real repositories, workspace-scoped by the OAuth
 * grant (caller.workspaceId — every repository call is scoped to the
 * grant's workspace; there is no fallback to another workspace).
 *
 * Honesty rules enforced here:
 *  - No LinkedIn-send tool exists and none is added; LinkedIn
 *    channels are refused 422 linkedin_unavailable by the send path.
 *  - A send reports `sent` only with a provider message ID,
 *    `simulated` in demo mode, `failed`/`suppressed` as recorded.
 *    A retry with the same idempotency key re-uses the recorded row
 *    and never sends twice.
 *  - Campaign stats come from computeCampaignStats/loadCampaignStats
 *    over real records; unavailable event counts stay null ("—"),
 *    never invented.
 *  - Every tool call records an audit entry (best-effort; an audit
 *    failure never fails the call) and enforces its required scope
 *    (muse.read / muse.write / muse.send) — a missing scope is a 403
 *    naming the missing scope.
 *  - create_campaign creates a DRAFT only and never activates sending.
 */

import {
  NXTSEND_TOOL_MANIFEST,
  type MuseToolDescriptor,
} from "./manifest";
import { requiredScope, validateToolInput } from "./schemas";
import type { MuseAuditInput } from "./audit";
import {
  getLeadsRepository,
  getCampaignsRepository,
  getInboxRepository,
  getUsageRepository,
  getIntegrationsRepository,
  type LeadsRepository,
  type CampaignsRepository,
  type InboxRepository,
  type UsageRepository,
  type IntegrationsRepository,
  type CampaignStepDraft,
} from "@/lib/data";
import { getLeadById } from "@/lib/data/leads";
import { normalizeEmail, findDuplicateGroups } from "@/lib/data/duplicates";
import { loadCampaignStats } from "@/lib/data/campaign-stats";
import { getDataMode, type DataMode } from "@/lib/data/mode";
import { isValidEmailAddress } from "@/lib/data/inbox";
import type { EmailProviderAdapter } from "@/lib/email/types";
import type { DraftRequest, DraftResult } from "@/lib/ai/types";
import { getEmailState } from "@/lib/email/state";
import { isMuseMcpEnabled } from "./oauth/config";
import type { CampaignStatus, StepType } from "@/types";

/**
 * Server-only modules are dynamic-imported at the point of use, never
 * statically imported: this adapter is re-exported through the
 * (client-imported) muse-connector barrel, and a static import of
 * @/lib/email (Resend SDK), @/lib/ai (provider SDKs),
 * @/lib/supabase/server (next/headers) or node:crypto would break the
 * dashboard client bundle. The dynamic imports below run server-side
 * only (MCP route / health check).
 */

export {
  UnimplementedMuseConnectorAdapter,
} from "./interface";
export type {
  MuseConnectorAdapter,
  MuseConnectorResult,
  MuseToolOutcomeStatus,
} from "./interface";
import type {
  MuseConnectorAdapter,
  MuseConnectorResult,
} from "./interface";
import type { MuseToolOutcomeStatus } from "./interface";

// ============================================================================
// Real adapter
// ============================================================================

export interface RealMuseConnectorDeps {
  leads?: LeadsRepository;
  campaigns?: CampaignsRepository;
  inbox?: InboxRepository;
  usage?: UsageRepository;
  integrations?: IntegrationsRepository;
  /** Email adapter used for standalone send_email (skipMessageRecord). */
  emailAdapter?: EmailProviderAdapter;
  /**
   * Per-conversation adapter for send_inbox_reply in live mode
   * (routes through the conversation's sending account, like the
   * inbox reply route). Defaults to the conversation routing adapter
   * in live mode, plain Resend in demo mode.
   */
  emailAdapterForConversation?: (conversationId: string) => EmailProviderAdapter;
  /** Test seam / override for AI drafting. Defaults to draftOutreachMessage. */
  draftFn?: (input: DraftRequest) => Promise<DraftResult>;
  /** Test seam / override for audit. Defaults to recordMuseAudit. */
  auditFn?: (entry: MuseAuditInput) => Promise<void>;
  mode?: DataMode;
}

export type MuseCaller = {
  subject: string;
  scopes: string[];
  workspaceId?: string;
};

const TERMINAL_MESSAGE_STATUSES = new Set(["sent", "simulated"]);

function errorResult(
  code: string,
  httpStatus: number,
  message: string,
  resultStatus: "FAILED" | "BLOCKED" = "FAILED",
  details?: string[]
): MuseConnectorResult {
  return { status: "error", code, httpStatus, message, resultStatus, details };
}

function pageOf<T>(items: T[], page: number, pageSize: number) {
  const p = Math.max(1, Math.floor(page) || 1);
  const size = Math.min(100, Math.max(1, Math.floor(pageSize) || 20));
  const start = (p - 1) * size;
  return {
    items: items.slice(start, start + size),
    page: p,
    pageSize: size,
    total: items.length,
  };
}

function asPage(input: Record<string, unknown>): { page: number; pageSize: number } {
  return {
    page: typeof input.page === "number" ? input.page : 1,
    pageSize: typeof input.pageSize === "number" ? input.pageSize : 20,
  };
}

function defaultIdempotencyKey(tool: string, input: Record<string, unknown>): string {
  // Deterministic 32-bit FNV-1a hash, hex — no node:crypto import so
  // this module stays importable from the client barrel.
  const text = JSON.stringify(input);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `muse_${tool}_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

const VALID_STEP_TYPES: StepType[] = [
  "connection_request",
  "linkedin_message",
  "email",
  "wait",
  "condition",
  "like_post",
  "view_profile",
  "endorse_skills",
];

const VALID_CAMPAIGN_TYPES = ["linkedin", "email", "mixed"] as const;

export class NxtSendMuseConnectorAdapter implements MuseConnectorAdapter {
  private readonly deps: Required<
    Pick<RealMuseConnectorDeps, "leads" | "campaigns" | "inbox" | "usage" | "integrations">
  > &
    RealMuseConnectorDeps;

  constructor(deps: RealMuseConnectorDeps = {}) {
    this.deps = {
      leads: deps.leads ?? getLeadsRepository(),
      campaigns: deps.campaigns ?? getCampaignsRepository(),
      inbox: deps.inbox ?? getInboxRepository(),
      usage: deps.usage ?? getUsageRepository(),
      integrations: deps.integrations ?? getIntegrationsRepository(),
      emailAdapter: deps.emailAdapter,
      emailAdapterForConversation: deps.emailAdapterForConversation,
      draftFn: deps.draftFn ?? undefined,
      auditFn: deps.auditFn ?? undefined,
      mode: deps.mode ?? getDataMode(),
    };
  }

  listTools(): MuseToolDescriptor[] {
    return NXTSEND_TOOL_MANIFEST;
  }

  async healthCheck(): Promise<MuseConnectorResult> {
    const { isMuseOAuthConfigured } = await import("./tokens");
    return {
      status: "ok",
      data: {
        mode: this.deps.mode,
        mcpEnabled: isMuseMcpEnabled(),
        toolCount: NXTSEND_TOOL_MANIFEST.length,
        oauthConfigured: isMuseOAuthConfigured(),
        // Honest provider state, not a fake "connected": "demo" /
        // "not_connected" / "configuration_required" / "connected".
        email: getEmailState(),
      },
    };
  }

  async handleToolCall(
    toolName: string,
    input: Record<string, unknown>,
    caller: MuseCaller
  ): Promise<MuseConnectorResult> {
    const workspaceId = caller.workspaceId;
    let outcome: MuseConnectorResult;
    try {
      outcome = await this.dispatch(toolName, input, caller);
    } catch (err) {
      outcome = errorResult(
        "internal_error",
        500,
        err instanceof Error ? err.message : "Internal error while handling the tool call."
      );
    }
    // Every tool call records an audit entry (allowed, denied and
    // failed alike). Best-effort: an audit failure never changes the
    // result the caller already got. The audit module is
    // dynamic-imported (it needs the service-role client, which is
    // server-only) unless a test injected an auditFn.
    try {
      const audit =
        this.deps.auditFn ?? (await import("./audit")).recordMuseAudit;
      const succeeded = outcome.status === "ok";
      await audit({
        workspaceId: workspaceId ?? "unknown",
        userId: caller.subject,
        action: `muse.tool.${toolName}`,
        resource: toolName,
        details: succeeded
          ? `Tool ${toolName} succeeded.`
          : outcome.status === "error"
            ? `Tool ${toolName} failed (${outcome.code}): ${outcome.message}`
            : `Tool ${toolName} not implemented.`,
      });
    } catch {
      // Audit is best-effort by design (see audit.ts).
    }
    return outcome;
  }

  private async dispatch(
    toolName: string,
    input: Record<string, unknown>,
    caller: MuseCaller
  ): Promise<MuseConnectorResult> {
    const scope = requiredScope(toolName);
    if (!scope) {
      return errorResult("unknown_tool", 404, `Unknown tool: ${toolName}.`);
    }
    if (!caller.scopes.includes(scope)) {
      return errorResult(
        "missing_scope",
        403,
        `This tool requires the ${scope} scope, which the grant does not include.`,
        "BLOCKED"
      );
    }
    const workspaceId = caller.workspaceId;
    if (!workspaceId) {
      return errorResult(
        "missing_workspace",
        401,
        "No workspace is bound to this grant, so no data can be served.",
        "BLOCKED"
      );
    }
    const validation = validateToolInput(toolName, input);
    if (validation) {
      return errorResult(
        "invalid_params",
        400,
        validation.message,
        "FAILED",
        validation.details
      );
    }

    switch (toolName) {
      case "list_leads":
        return this.listLeads(workspaceId, input);
      case "get_lead":
        return this.getLead(workspaceId, input);
      case "list_campaigns":
        return this.listCampaigns(workspaceId, input);
      case "get_campaign_activity":
        return this.getCampaignActivity(workspaceId, input);
      case "list_conversations":
        return this.listConversations(workspaceId, input);
      case "get_conversation":
        return this.getConversation(workspaceId, input);
      case "get_usage_summary":
        return this.getUsageSummary(workspaceId);
      case "get_integration_statuses":
        return this.getIntegrationStatuses(workspaceId);
      case "create_lead":
        return this.createLead(workspaceId, input);
      case "update_lead":
        return this.updateLead(workspaceId, input);
      case "delete_lead":
        return this.deleteLead(workspaceId, input);
      case "create_campaign":
        return this.createCampaign(workspaceId, input);
      case "pause_campaign":
        return this.setCampaignStatus(workspaceId, input, "paused", "active");
      case "resume_campaign":
        return this.setCampaignStatus(workspaceId, input, "active", "paused");
      case "archive_campaign":
        return this.setCampaignStatus(workspaceId, input, "archived", null);
      case "draft_outreach_message":
        return this.draftOutreachMessage(input);
      case "send_email":
        return this.sendEmail(workspaceId, input);
      case "send_inbox_reply":
        return this.sendInboxReply(workspaceId, input);
      default:
        return errorResult("unknown_tool", 404, `Unknown tool: ${toolName}.`);
    }
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  private async listLeads(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const all = await this.deps.leads.listLeads(workspaceId);
    const query = typeof input.query === "string" ? input.query.trim().toLowerCase() : "";
    const tag = typeof input.tag === "string" ? input.tag : "";
    let filtered = all;
    if (query) {
      filtered = filtered.filter((l) =>
        `${l.first_name ?? ""} ${l.last_name ?? ""} ${l.email ?? ""} ${l.company ?? ""}`
          .toLowerCase()
          .includes(query)
      );
    }
    if (tag) filtered = filtered.filter((l) => (l.tags ?? []).includes(tag));
    const { page, pageSize } = asPage(input);
    const paged = pageOf(filtered, page, pageSize);
    return {
      status: "ok",
      data: { leads: paged.items, page: paged.page, pageSize: paged.pageSize, total: paged.total },
    };
  }

  private async getLead(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const lead = await getLeadById(this.deps.leads, workspaceId, String(input.leadId));
    if (!lead) {
      return errorResult("not_found", 404, `Lead not found: ${String(input.leadId)}.`);
    }
    // Duplicate evidence for this lead (tags are the list model; the
    // duplicate groups are the "list membership" cross-check).
    const all = await this.deps.leads.listLeads(workspaceId);
    const groups = findDuplicateGroups(all).filter((g) =>
      g.leads.some((l) => l.id === lead.id)
    );
    return {
      status: "ok",
      data: {
        lead,
        duplicateGroups: groups.map((g) => ({
          reason: g.reason,
          key: g.key,
          leadIds: g.leads.map((l) => l.id),
        })),
      },
    };
  }

  private async listCampaigns(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const all = await this.deps.campaigns.listCampaigns(workspaceId);
    const status = typeof input.status === "string" ? input.status : "";
    const filtered = status ? all.filter((c) => c.status === status) : all;
    const { page, pageSize } = asPage(input);
    const paged = pageOf(filtered, page, pageSize);
    // Enrollment counts per campaign (real records, no fabrication).
    const counts = await Promise.all(
      paged.items.map(async (c) => {
        const enrollments = await this.deps.campaigns
          .listEnrollments(c.id)
          .catch(() => []);
        return { campaignId: c.id, enrollments: enrollments.length };
      })
    );
    return {
      status: "ok",
      data: {
        campaigns: paged.items.map((c) => ({
          ...c,
          enrollments:
            counts.find((x) => x.campaignId === c.id)?.enrollments ?? null,
        })),
        page: paged.page,
        pageSize: paged.pageSize,
        total: paged.total,
      },
    };
  }

  private async getCampaignActivity(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const campaign = await this.deps.campaigns.getCampaign(
      workspaceId,
      String(input.campaignId)
    );
    if (!campaign) {
      return errorResult(
        "not_found",
        404,
        `Campaign not found: ${String(input.campaignId)}.`
      );
    }
    const activity = await this.deps.campaigns.listActivity(
      workspaceId,
      campaign.id
    );
    const { page, pageSize } = asPage(input);
    const paged = pageOf(activity, page, pageSize);
    // Stats over real records; unavailable event counts stay null.
    let stats: unknown = null;
    try {
      const { byCampaign } = await loadCampaignStats(
        {
          campaignsRepo: this.deps.campaigns,
          inboxRepo: this.deps.inbox,
          leadsRepo: this.deps.leads,
          mode: this.deps.mode ?? "demo",
        },
        workspaceId,
        [campaign]
      );
      stats = byCampaign.get(campaign.id) ?? null;
    } catch {
      stats = null;
    }
    const steps = await this.deps.campaigns
      .getCampaignSteps(campaign.id)
      .catch(() => []);
    return {
      status: "ok",
      data: {
        campaign,
        steps,
        activity: paged.items,
        page: paged.page,
        pageSize: paged.pageSize,
        total: paged.total,
        stats,
      },
    };
  }

  private async listConversations(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const { page, pageSize } = asPage(input);
    const { conversations, total } = await this.deps.inbox.listConversations(
      workspaceId,
      {
        channel:
          input.channel === "email" || input.channel === "linkedin"
            ? input.channel
            : undefined,
        unreadOnly: input.unreadOnly === true,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }
    );
    return {
      status: "ok",
      data: { conversations, page, pageSize, total },
    };
  }

  private async getConversation(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const thread = await this.deps.inbox.getThread(
      workspaceId,
      String(input.conversationId)
    );
    if (!thread) {
      return errorResult(
        "not_found",
        404,
        `Conversation not found: ${String(input.conversationId)}.`
      );
    }
    // Declared side effect (manifest): opening marks inbound read.
    const markedRead = await this.deps.inbox
      .markConversationRead(workspaceId, thread.conversation.id)
      .catch(() => 0);
    return {
      status: "ok",
      data: { ...thread, markedRead },
    };
  }

  private async getUsageSummary(
    workspaceId: string
  ): Promise<MuseConnectorResult> {
    const usage = await this.deps.usage.getWorkspaceUsage(workspaceId);
    return { status: "ok", data: { usage } };
  }

  private async getIntegrationStatuses(
    workspaceId: string
  ): Promise<MuseConnectorResult> {
    const integrations = await this.deps.integrations.listIntegrations(workspaceId);
    // Presence/status only — config (where secrets would live) is
    // never surfaced; the repository already redacts it.
    return {
      status: "ok",
      data: {
        integrations: integrations.map((i) => ({
          id: i.id,
          provider: i.provider,
          status: i.status,
          updated_at: i.updated_at,
        })),
      },
    };
  }

  // ── Writes ───────────────────────────────────────────────────────────────

  private async createLead(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const email = String(input.email).trim().toLowerCase();
    if (!isValidEmailAddress(email)) {
      return errorResult("invalid_params", 400, "A valid email address is required.");
    }
    const existing = (await this.deps.leads.listLeads(workspaceId)).find(
      (l) => normalizeEmail(l.email) === email
    );
    if (existing) {
      // Deduplicated by email: return the existing lead, create nothing.
      return { status: "ok", data: { lead: existing, duplicate: true } };
    }
    const lead = await this.deps.leads.createLead(workspaceId, {
      first_name: typeof input.firstName === "string" ? input.firstName : "",
      last_name: typeof input.lastName === "string" ? input.lastName : undefined,
      email,
      company: typeof input.company === "string" ? input.company : undefined,
      job_title: typeof input.jobTitle === "string" ? input.jobTitle : undefined,
      linkedin_url:
        typeof input.linkedinUrl === "string" ? input.linkedinUrl : undefined,
      tags: Array.isArray(input.tags) ? (input.tags as string[]) : [],
      status:
        typeof input.status === "string"
          ? (input.status as Parameters<LeadsRepository["createLead"]>[1]["status"])
          : undefined,
    });
    return { status: "ok", data: { lead, duplicate: false } };
  }

  private async updateLead(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const lead = await getLeadById(this.deps.leads, workspaceId, String(input.leadId));
    if (!lead) {
      return errorResult("not_found", 404, `Lead not found: ${String(input.leadId)}.`);
    }
    if (typeof input.email === "string" && !isValidEmailAddress(input.email.trim())) {
      return errorResult("invalid_params", 400, "email must be a valid email address.");
    }
    const patch: Record<string, unknown> = {};
    if (typeof input.firstName === "string") patch.first_name = input.firstName;
    if (typeof input.lastName === "string") patch.last_name = input.lastName;
    if (typeof input.email === "string") patch.email = input.email.trim().toLowerCase();
    if (typeof input.company === "string") patch.company = input.company;
    if (typeof input.jobTitle === "string") patch.job_title = input.jobTitle;
    if (typeof input.linkedinUrl === "string") patch.linkedin_url = input.linkedinUrl;
    if (Array.isArray(input.tags)) patch.tags = input.tags;
    if (typeof input.status === "string") patch.status = input.status;
    const updated = await this.deps.leads.updateLead(
      lead.id,
      patch as Parameters<LeadsRepository["updateLead"]>[1]
    );
    return { status: "ok", data: { lead: updated } };
  }

  private async deleteLead(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const lead = await getLeadById(this.deps.leads, workspaceId, String(input.leadId));
    if (!lead) {
      return errorResult("not_found", 404, `Lead not found: ${String(input.leadId)}.`);
    }
    await this.deps.leads.deleteLead(lead.id);
    return {
      status: "ok",
      data: { deleted: true, leadId: lead.id, status: "SUCCESS" as MuseToolOutcomeStatus },
    };
  }

  private async createCampaign(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const name = String(input.name).trim();
    if (!name) {
      return errorResult("invalid_params", 400, "Campaign name is required.");
    }
    const channel = String(input.channel);
    if (!(VALID_CAMPAIGN_TYPES as readonly string[]).includes(channel)) {
      return errorResult(
        "invalid_params",
        400,
        "channel must be one of: linkedin, email, mixed."
      );
    }
    const rawSteps = Array.isArray(input.steps) ? input.steps : [];
    if (rawSteps.length === 0) {
      return errorResult("invalid_params", 400, "At least one sequence step is required.");
    }
    const steps: CampaignStepDraft[] = [];
    for (let i = 0; i < rawSteps.length; i++) {
      const s = rawSteps[i] as Record<string, unknown>;
      if (!VALID_STEP_TYPES.includes(s.step_type as StepType)) {
        return errorResult(
          "invalid_params",
          400,
          `Step ${i + 1}: step_type must be a valid step type.`
        );
      }
      const delay = typeof s.delay_hours === "number" ? s.delay_hours : 0;
      if (delay < 0) {
        return errorResult("invalid_params", 400, `Step ${i + 1}: delay_hours must be >= 0.`);
      }
      if (
        (s.step_type === "email" || s.step_type === "linkedin_message") &&
        !(typeof s.content === "string" && s.content.trim())
      ) {
        return errorResult(
          "invalid_params",
          400,
          `Step ${i + 1}: ${String(s.step_type)} steps require non-empty content.`
        );
      }
      steps.push({
        step_type: s.step_type as StepType,
        delay_hours: delay,
        subject: typeof s.subject === "string" ? s.subject : undefined,
        content: typeof s.content === "string" ? s.content : undefined,
        config:
          s.config && typeof s.config === "object"
            ? (s.config as Record<string, unknown>)
            : undefined,
      });
    }
    // Draft ONLY — status is forced to "draft"; this tool never
    // activates sending.
    const campaign = await this.deps.campaigns.createCampaign(workspaceId, {
      name,
      type: channel as (typeof VALID_CAMPAIGN_TYPES)[number],
      status: "draft",
      steps,
      description: typeof input.description === "string" ? input.description : undefined,
    });
    const createdSteps = await this.deps.campaigns
      .getCampaignSteps(campaign.id)
      .catch(() => []);
    return {
      status: "ok",
      data: { campaign, steps: createdSteps, status: "SUCCESS" as MuseToolOutcomeStatus },
    };
  }

  private async setCampaignStatus(
    workspaceId: string,
    input: Record<string, unknown>,
    target: CampaignStatus,
    requiredFrom: CampaignStatus | null
  ): Promise<MuseConnectorResult> {
    const campaign = await this.deps.campaigns.getCampaign(
      workspaceId,
      String(input.campaignId)
    );
    if (!campaign) {
      return errorResult(
        "not_found",
        404,
        `Campaign not found: ${String(input.campaignId)}.`
      );
    }
    if (target === "archived" && campaign.status === "archived") {
      return errorResult("invalid_params", 400, "Campaign is already archived.");
    }
    if (requiredFrom && campaign.status !== requiredFrom) {
      const verb =
        target === "paused"
          ? "Only an active campaign can be paused"
          : "Only a paused campaign can be resumed";
      return errorResult(
        "invalid_params",
        400,
        `${verb} (current status: ${campaign.status}).`
      );
    }
    await this.deps.campaigns.setCampaignStatus(workspaceId, campaign.id, target);
    const updated = await this.deps.campaigns.getCampaign(workspaceId, campaign.id);
    return {
      status: "ok",
      data: { campaign: updated ?? { ...campaign, status: target }, status: "SUCCESS" as MuseToolOutcomeStatus },
    };
  }

  private async draftOutreachMessage(
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const draftInput: DraftRequest = {
      channel: input.channel as "email" | "linkedin",
      stepType: String(input.stepType),
      campaignName: typeof input.campaignName === "string" ? input.campaignName : undefined,
      campaignGoal: typeof input.campaignGoal === "string" ? input.campaignGoal : undefined,
      existingContent:
        typeof input.existingContent === "string" ? input.existingContent : undefined,
      lead: {
        firstName: typeof input.leadFirstName === "string" ? input.leadFirstName : undefined,
        company: typeof input.leadCompany === "string" ? input.leadCompany : undefined,
        jobTitle: typeof input.leadJobTitle === "string" ? input.leadJobTitle : undefined,
      },
    };
    // Server-only AI module is dynamic-imported (provider SDKs);
    // a test-injected draftFn wins when present.
    const draftFn =
      this.deps.draftFn ?? (await import("@/lib/ai")).draftOutreachMessage;
    const result = await draftFn(draftInput);
    // Text only — this tool cannot send anything. not_configured is a
    // data state (like /api/ai/draft), not a transport error.
    return {
      status: "ok",
      data: {
        draft: result.draft,
        state: result.status,
        provider: result.provider,
        aiGenerated: result.aiGenerated,
        message: result.message,
        reviewRequired: true,
      },
    };
  }

  // ── Sensitive writes ─────────────────────────────────────────────────────

  private async resolveEmailAdapter(): Promise<EmailProviderAdapter> {
    if (this.deps.emailAdapter) return this.deps.emailAdapter;
    const { ResendEmailAdapter } = await import("@/lib/email");
    return new ResendEmailAdapter({ skipMessageRecord: true });
  }

  private async resolveReplyAdapter(
    conversationId: string
  ): Promise<EmailProviderAdapter> {
    if (this.deps.emailAdapterForConversation) {
      return this.deps.emailAdapterForConversation(conversationId);
    }
    const { ResendEmailAdapter, createConversationRoutingAdapter } =
      await import("@/lib/email");
    if ((this.deps.mode ?? "demo") !== "demo") {
      const { createAdminClient } = await import("@/lib/supabase/server");
      const admin = createAdminClient();
      if (admin) return createConversationRoutingAdapter(admin, conversationId);
    }
    return new ResendEmailAdapter({ skipMessageRecord: true });
  }

  private async sendEmail(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const to = String(input.to).trim().toLowerCase();
    const subject = String(input.subject);
    const body = String(input.body);
    const idempotencyKey =
      typeof input.idempotencyKey === "string" && input.idempotencyKey.trim()
        ? input.idempotencyKey.trim()
        : defaultIdempotencyKey("send_email", { workspaceId, to, subject, body });

    // The send is recorded under the idempotency key in the workspace's
    // inbox thread for the recipient, exactly like sendInboxReply:
    // a retry with the same key re-uses the row and never sends twice.
    const lead = (await this.deps.leads.listLeads(workspaceId)).find(
      (l) => normalizeEmail(l.email) === to
    );
    const conversationId = await this.deps.inbox.findOrCreateConversation(workspaceId, {
      lead_id: lead?.id ?? null,
      channel: "email",
      contact_name:
        lead && (lead.first_name || lead.last_name)
          ? `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim()
          : to,
      contact_email: to,
      subject: subject || null,
      is_demo: (this.deps.mode ?? "demo") === "demo",
    });

    const existing = await this.deps.inbox.findMessageByIdempotencyKey(
      workspaceId,
      conversationId,
      idempotencyKey
    );
    if (existing && TERMINAL_MESSAGE_STATUSES.has(existing.status)) {
      return {
        status: "ok",
        data: {
          messageId: existing.id,
          conversationId,
          status: "SUCCESS" as MuseToolOutcomeStatus,
          outcome: existing.status,
          provider: existing.provider,
          providerMessageId: existing.provider_message_id,
          duplicate: true,
        },
      };
    }

    let attempt = existing;
    if (!attempt) {
      attempt = await this.deps.inbox.insertMessage({
        workspace_id: workspaceId,
        conversation_id: conversationId,
        lead_id: lead?.id ?? null,
        channel: "email",
        direction: "outbound",
        subject,
        content: body,
        status: "queued",
        is_demo: (this.deps.mode ?? "demo") === "demo",
        idempotency_key: idempotencyKey,
      });
    } else {
      attempt = await this.deps.inbox.updateMessage(workspaceId, attempt.id, {
        status: "queued",
        error: null,
        content: body,
        subject,
      });
    }

    const result = await (await this.resolveEmailAdapter()).sendEmail({
      workspaceId,
      to,
      subject,
      text: body,
      leadId: lead?.id ?? null,
    });

    const now = new Date().toISOString();
    if (result.status === "sent") {
      const updated = await this.deps.inbox.updateMessage(workspaceId, attempt.id, {
        status: "sent",
        provider: result.provider,
        provider_message_id: result.providerMessageId,
        error: null,
        sent_at: now,
      });
      await this.deps.inbox.touchConversation(workspaceId, conversationId, now);
      return {
        status: "ok",
        data: {
          messageId: updated.id,
          conversationId,
          status: "SUCCESS" as MuseToolOutcomeStatus,
          outcome: "sent",
          provider: result.provider,
          providerMessageId: result.providerMessageId,
          duplicate: false,
        },
      };
    }
    if (result.status === "simulated") {
      const updated = await this.deps.inbox.updateMessage(workspaceId, attempt.id, {
        status: "simulated",
        provider: result.provider,
        provider_message_id: null,
        error: null,
        sent_at: now,
      });
      await this.deps.inbox.touchConversation(workspaceId, conversationId, now);
      return {
        status: "ok",
        data: {
          messageId: updated.id,
          conversationId,
          status: "SUCCESS" as MuseToolOutcomeStatus,
          outcome: "simulated",
          provider: result.provider,
          providerMessageId: null,
          duplicate: false,
          note: "Demo Mode: no email was actually sent.",
        },
      };
    }
    // suppressed / not_configured / error — the recorded outcome, never
    // a claimed success.
    const recordedStatus = result.status === "suppressed" ? "suppressed" : "failed";
    await this.deps.inbox.updateMessage(workspaceId, attempt.id, {
      status: recordedStatus,
      provider: result.provider,
      error: result.message,
    });
    return errorResult(
      result.status === "suppressed"
        ? "suppressed"
        : result.status === "not_configured"
          ? "not_configured"
          : "provider_error",
      result.status === "not_configured" ? 503 : result.status === "suppressed" ? 422 : 502,
      result.message,
      result.status === "not_configured" ? "BLOCKED" : "FAILED"
    );
  }

  private async sendInboxReply(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const conversationId = String(input.conversationId);
    const body = String(input.body);
    const idempotencyKey =
      typeof input.idempotencyKey === "string" && input.idempotencyKey.trim()
        ? input.idempotencyKey.trim()
        : defaultIdempotencyKey("send_inbox_reply", {
            workspaceId,
            conversationId,
            body,
          });
    const { sendInboxReply } = await import("@/lib/inbox/reply");
    const outcome = await sendInboxReply(
      { repo: this.deps.inbox, adapter: await this.resolveReplyAdapter(conversationId) },
      {
        workspaceId,
        conversationId,
        content: body,
        subject: typeof input.subject === "string" ? input.subject : undefined,
        idempotencyKey,
      }
    );
    if (outcome.ok) {
      return {
        status: "ok",
        data: {
          messageId: outcome.message.id,
          conversationId,
          status: "SUCCESS" as MuseToolOutcomeStatus,
          outcome: outcome.message.status,
          provider: outcome.message.provider,
          providerMessageId: outcome.message.provider_message_id,
          duplicate: outcome.duplicate,
          ...(outcome.message.status === "simulated"
            ? { note: "Demo Mode: no email was actually sent." }
            : {}),
        },
      };
    }
    const httpStatus =
      outcome.code === "not_found"
        ? 404
        : outcome.code === "empty_content" || outcome.code === "missing_idempotency_key" || outcome.code === "invalid_recipient"
          ? 400
          : outcome.code === "linkedin_unavailable" || outcome.code === "suppressed"
            ? 422
            : outcome.code === "not_configured"
              ? 503
              : 502;
    return errorResult(
      outcome.code,
      httpStatus,
      outcome.error,
      outcome.code === "not_configured" || outcome.code === "linkedin_unavailable"
        ? "BLOCKED"
        : "FAILED"
    );
  }
}

/** Default real adapter over the app's repositories (used by the MCP route). */
export function createMuseConnectorAdapter(
  deps: RealMuseConnectorDeps = {}
): NxtSendMuseConnectorAdapter {
  return new NxtSendMuseConnectorAdapter(deps);
}
