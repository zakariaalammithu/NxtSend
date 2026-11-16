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
import { requiredTier, TIER_SCOPE, validateToolInput } from "./schemas";
import { grantHasTier } from "./oauth/scopes";
import type { MuseAuditInput } from "./audit";
import {
  getLeadsRepository,
  getCampaignsRepository,
  getInboxRepository,
  getUsageRepository,
  getIntegrationsRepository,
  getAccountsRepository,
  getSafetySettingsRepository,
  getScheduledRepliesRepository,
  type LeadsRepository,
  type CampaignsRepository,
  type InboxRepository,
  type UsageRepository,
  type IntegrationsRepository,
  type AccountsRepository,
  type SafetySettingsRepository,
  type ScheduledRepliesRepository,
  type CampaignStepDraft,
  type CreateLeadInput,
} from "@/lib/data";
import { getLeadById, searchLeads } from "@/lib/data/leads";
import { normalizeEmail, findDuplicateGroups } from "@/lib/data/duplicates";
import {
  loadCampaignStats,
  loadCampaignExecutions,
  aggregateCampaignStats,
  type CampaignStats,
} from "@/lib/data/campaign-stats";
import { listMessageHistory, classifyMessage } from "@/lib/data/message-history";
import { accountLimits } from "@/lib/data/accounts";
import type { StepExecutionRecord } from "@/lib/executor/types";
import type { Campaign, Lead } from "@/types";
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
  accounts?: AccountsRepository;
  safetySettings?: SafetySettingsRepository;
  scheduledReplies?: ScheduledRepliesRepository;
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
  /**
   * Test seam / override for step-execution reads. Defaults to
   * loadCampaignExecutions over the real repositories (demo store in
   * demo mode, campaign_step_executions in live mode).
   */
  executionsFn?: (
    workspaceId: string,
    campaigns: Campaign[]
  ) => Promise<StepExecutionRecord[]>;
  mode?: DataMode;
}

export type MuseCaller = {
  subject: string;
  scopes: string[];
  workspaceId?: string;
  /** OAuth client id, when the transport resolved one (profile tool). */
  clientId?: string;
  /** Grant id (client + user pair), when the transport resolved one. */
  grantId?: string;
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
    Pick<
      RealMuseConnectorDeps,
      | "leads"
      | "campaigns"
      | "inbox"
      | "usage"
      | "integrations"
      | "accounts"
      | "safetySettings"
      | "scheduledReplies"
    >
  > &
    RealMuseConnectorDeps;

  constructor(deps: RealMuseConnectorDeps = {}) {
    this.deps = {
      leads: deps.leads ?? getLeadsRepository(),
      campaigns: deps.campaigns ?? getCampaignsRepository(),
      inbox: deps.inbox ?? getInboxRepository(),
      usage: deps.usage ?? getUsageRepository(),
      integrations: deps.integrations ?? getIntegrationsRepository(),
      accounts: deps.accounts ?? getAccountsRepository(),
      safetySettings: deps.safetySettings ?? getSafetySettingsRepository(),
      scheduledReplies: deps.scheduledReplies ?? getScheduledRepliesRepository(),
      emailAdapter: deps.emailAdapter,
      emailAdapterForConversation: deps.emailAdapterForConversation,
      draftFn: deps.draftFn ?? undefined,
      auditFn: deps.auditFn ?? undefined,
      executionsFn: deps.executionsFn ?? undefined,
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
    // Scope-tier enforcement (Worker A owns SCOPE_TIER_MAP /
    // grantHasTier in ./oauth/scopes.ts): a tool requires one tier
    // (read/write/send) and a grant satisfies it when it holds ANY
    // scope mapping to that tier. Tiers are independent — `send`
    // does NOT imply `write` or `read`. The error names the
    // canonical muse.* scope for the tier.
    const tier = requiredTier(toolName);
    if (!tier) {
      return errorResult("unknown_tool", 404, `Unknown tool: ${toolName}.`);
    }
    if (!grantHasTier(caller.scopes, tier)) {
      const scope = TIER_SCOPE[tier];
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
        return this.setCampaignStatus(workspaceId, input, "paused", "active", "pause_campaign");
      case "resume_campaign":
        return this.setCampaignStatus(workspaceId, input, "active", "paused", "resume_campaign");
      case "archive_campaign":
        return this.setCampaignStatus(workspaceId, input, "archived", null, "archive_campaign");
      case "draft_outreach_message":
        return this.draftOutreachMessage(input);
      case "send_email":
        return this.sendEmail(workspaceId, input);
      case "send_inbox_reply":
        return this.sendInboxReply(workspaceId, input);
      // ── ChatGPT expansion: account ──
      case "list_linkedin_accounts":
        return this.listLinkedinAccounts(workspaceId);
      case "get_linkedin_account":
        return this.getLinkedinAccount(workspaceId, input);
      case "get_subscription_info":
        return this.getSubscriptionInfo(workspaceId);
      case "get_account_limits":
        return this.getAccountLimits(workspaceId);
      // ── ChatGPT expansion: campaign ──
      case "search_campaigns":
        return this.searchCampaigns(workspaceId, input);
      case "stop_campaign":
        return this.setCampaignStatus(workspaceId, input, "archived", null, "stop_campaign");
      case "delete_campaign":
        return this.deleteCampaign(workspaceId, input);
      case "get_campaign_performance":
        return this.getCampaignPerformance(workspaceId, input);
      case "get_campaign_execution_status":
        return this.getCampaignExecutionStatus(workspaceId, input);
      // ── ChatGPT expansion: leads ──
      case "search_leads":
        return this.searchLeadsTool(workspaceId, input);
      case "import_leads":
        return this.importLeads(workspaceId, input);
      case "add_leads_to_campaign":
        return this.addLeadsToCampaign(workspaceId, input);
      case "remove_leads_from_campaign":
        return this.removeLeadsFromCampaign(workspaceId, input);
      case "detect_duplicate_leads":
        return this.detectDuplicateLeads(workspaceId);
      case "get_lead_activity_history":
        return this.getLeadActivityHistory(workspaceId, input);
      case "list_leads_by_campaign":
        return this.listLeadsByCampaign(workspaceId, input);
      // ── ChatGPT expansion: sequences ──
      case "get_campaign_sequence":
        return this.getCampaignSequence(workspaceId, input);
      case "create_sequence_step":
        return this.createSequenceStep(workspaceId, input);
      case "update_sequence_step":
        return this.updateSequenceStep(workspaceId, input);
      case "reorder_sequence_steps":
        return this.reorderSequenceSteps(workspaceId, input);
      case "get_scheduled_follow_ups":
        return this.getScheduledFollowUps(workspaceId, input);
      case "get_sequence_execution_status":
        return this.getSequenceExecutionStatus(workspaceId, input);
      // ── ChatGPT expansion: LinkedIn automation (read-only) ──
      case "get_pending_actions":
        return this.getPendingActions(workspaceId, input);
      case "get_failed_actions":
        return this.getFailedActions(workspaceId, input);
      case "get_automation_execution_report":
        return this.getAutomationExecutionReport(workspaceId, input);
      // ── ChatGPT expansion: inbox ──
      case "search_conversations":
        return this.searchConversations(workspaceId, input);
      case "get_message_execution_status":
        return this.getMessageExecutionStatus(workspaceId, input);
      case "get_failed_messages":
        return this.getFailedMessages(workspaceId, input);
      // ── ChatGPT expansion: analytics ──
      case "compare_campaigns":
        return this.compareCampaigns(workspaceId, input);
      case "get_date_range_report":
        return this.getDateRangeReport(input);
      case "get_performance_summary":
        return this.getPerformanceSummary(workspaceId);
      case "get_usage_report":
        return this.getUsageReport(workspaceId);
      // ── ChatGPT expansion: profile / knowledge / UI ──
      case "get_profile":
        return this.getProfile(workspaceId, caller);
      case "search":
        return this.searchKnowledge(workspaceId, input);
      case "fetch":
        return this.fetchRecord(workspaceId, input);
      case "render_campaigns_widget":
        return this.renderCampaignsWidget(workspaceId, input);
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

  // ── ChatGPT expansion: shared helpers ──────────────────────────────────

  /** Deps object the campaign-stats loaders need. */
  private statsDeps() {
    return {
      campaignsRepo: this.deps.campaigns,
      inboxRepo: this.deps.inbox,
      leadsRepo: this.deps.leads,
      mode: this.deps.mode ?? "demo",
    };
  }

  private async loadStatsFor(
    workspaceId: string,
    campaigns: Campaign[]
  ): Promise<Map<string, CampaignStats>> {
    const { byCampaign } = await loadCampaignStats(
      this.statsDeps(),
      workspaceId,
      campaigns
    );
    return byCampaign;
  }

  private async loadExecutionsFor(
    workspaceId: string,
    campaigns: Campaign[]
  ): Promise<StepExecutionRecord[]> {
    if (this.deps.executionsFn) {
      return this.deps.executionsFn(workspaceId, campaigns);
    }
    return loadCampaignExecutions(this.statsDeps(), workspaceId, campaigns);
  }

  /**
   * Effective idempotency key for a write: the caller's key when one
   * was given, otherwise the deterministic `muse_<tool>_<hash>` of
   * the inputs (same helper as the send paths — no second pattern).
   * The key is echoed in the result so a retry can be correlated.
   * Full server-side replay-dedupe exists only where the product
   * already has a dedupe store: sends (message idempotency_key),
   * create_lead (email) and enrollments (existing-enrollment skip).
   * Other writes accept the key for client correlation; a retried
   * create_campaign / create_sequence_step still creates a second
   * row — there is no persistent idempotency ledger in this codebase
   * (future work, same as the in-memory rate limiter's caveat).
   */
  private effectiveIdempotencyKey(
    tool: string,
    input: Record<string, unknown>,
    keyFields?: Record<string, unknown>
  ): string {
    if (
      typeof input.idempotencyKey === "string" &&
      input.idempotencyKey.trim()
    ) {
      return input.idempotencyKey.trim();
    }
    const rest: Record<string, unknown> = { ...input };
    delete rest.idempotencyKey;
    return defaultIdempotencyKey(tool, keyFields ?? rest);
  }

  private async requireCampaign(
    workspaceId: string,
    campaignId: string
  ): Promise<Campaign | null> {
    return this.deps.campaigns.getCampaign(workspaceId, campaignId);
  }

  // ── ChatGPT expansion: account reads ───────────────────────────────────

  private async listLinkedinAccounts(
    workspaceId: string
  ): Promise<MuseConnectorResult> {
    const accounts = await this.deps.accounts.listAccounts(workspaceId);
    const linkedin = accounts.filter((a) => a.channel === "linkedin");
    return {
      status: "ok",
      data: {
        accounts: linkedin.map((a) => ({
          id: a.id,
          displayName: a.display_name,
          provider: a.provider,
          handleOrEmail: a.handle_or_email,
          status: a.status,
          authStatus: a.auth_status,
          warmupStatus: a.warmup_status,
          warmupEnabled: a.warmup_enabled,
          dailyLimits: accountLimits(a),
        })),
        total: linkedin.length,
      },
    };
  }

  private async getLinkedinAccount(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const account = await this.deps.accounts.getAccount(
      workspaceId,
      String(input.accountId)
    );
    if (!account || account.channel !== "linkedin") {
      return errorResult(
        "not_found",
        404,
        `LinkedIn account not found: ${String(input.accountId)}.`
      );
    }
    const now = new Date();
    const dayStartIso = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    ).toISOString();
    const usedToday = await this.deps.accounts
      .countLinkedInActionsToday(workspaceId, account.id, dayStartIso)
      .catch(() => null);
    return {
      status: "ok",
      data: {
        account: {
          id: account.id,
          displayName: account.display_name,
          provider: account.provider,
          handleOrEmail: account.handle_or_email,
          status: account.status,
          authStatus: account.auth_status,
          lastSyncAt: account.last_sync_at,
          lastError: account.last_error,
          warmupStatus: account.warmup_status,
          warmupPreset: account.warmup_preset,
          warmupEnabled: account.warmup_enabled,
          dailyLimits: accountLimits(account),
          usedToday,
        },
      },
    };
  }

  private async getSubscriptionInfo(
    workspaceId: string
  ): Promise<MuseConnectorResult> {
    const usage = await this.deps.usage.getWorkspaceUsage(workspaceId);
    return {
      status: "ok",
      data: {
        plan: usage.plan,
        subscriptionStatus: usage.subscription_status,
        currentPeriodEnd: usage.current_period_end,
        periodStart: usage.period_start,
        entitlementBasis: usage.entitlement_basis,
      },
    };
  }

  private async getAccountLimits(
    workspaceId: string
  ): Promise<MuseConnectorResult> {
    const accounts = await this.deps.accounts.listAccounts(workspaceId);
    const linkedin = accounts.filter((a) => a.channel === "linkedin");
    const now = new Date();
    const dayStartIso = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    ).toISOString();
    const perAccount = await Promise.all(
      linkedin.map(async (a) => ({
        accountId: a.id,
        displayName: a.display_name,
        status: a.status,
        dailyLimits: accountLimits(a),
        usedToday: await this.deps.accounts
          .countLinkedInActionsToday(workspaceId, a.id, dayStartIso)
          .catch(() => null),
      }))
    );
    const safety = await this.deps.safetySettings
      .get(workspaceId)
      .catch(() => null);
    return {
      status: "ok",
      data: {
        accounts: perAccount,
        safetySettings: safety,
      },
    };
  }

  // ── ChatGPT expansion: campaign reads ──────────────────────────────────

  private async searchCampaigns(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const all = await this.deps.campaigns.listCampaigns(workspaceId);
    const query =
      typeof input.query === "string" ? input.query.trim().toLowerCase() : "";
    const status = typeof input.status === "string" ? input.status : "";
    let filtered = all;
    if (query) {
      filtered = filtered.filter((c) => c.name.toLowerCase().includes(query));
    }
    if (status) filtered = filtered.filter((c) => c.status === status);
    const { page, pageSize } = asPage(input);
    const paged = pageOf(filtered, page, pageSize);
    return {
      status: "ok",
      data: {
        campaigns: paged.items,
        page: paged.page,
        pageSize: paged.pageSize,
        total: paged.total,
      },
    };
  }

  private async deleteCampaign(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const campaign = await this.requireCampaign(workspaceId, String(input.campaignId));
    if (!campaign) {
      return errorResult(
        "not_found",
        404,
        `Campaign not found: ${String(input.campaignId)}.`
      );
    }
    await this.deps.campaigns.deleteCampaign(workspaceId, campaign.id);
    return {
      status: "ok",
      data: {
        deleted: true,
        campaignId: campaign.id,
        status: "SUCCESS" as MuseToolOutcomeStatus,
        idempotencyKey: this.effectiveIdempotencyKey("delete_campaign", input, {
          workspaceId,
          campaignId: campaign.id,
        }),
      },
    };
  }

  private async getCampaignPerformance(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const campaign = await this.requireCampaign(workspaceId, String(input.campaignId));
    if (!campaign) {
      return errorResult(
        "not_found",
        404,
        `Campaign not found: ${String(input.campaignId)}.`
      );
    }
    const byCampaign = await this.loadStatsFor(workspaceId, [campaign]);
    return {
      status: "ok",
      data: {
        campaign,
        stats: byCampaign.get(campaign.id) ?? null,
      },
    };
  }

  private async getCampaignExecutionStatus(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const campaign = await this.requireCampaign(workspaceId, String(input.campaignId));
    if (!campaign) {
      return errorResult(
        "not_found",
        404,
        `Campaign not found: ${String(input.campaignId)}.`
      );
    }
    const [steps, activity, executions] = await Promise.all([
      this.deps.campaigns.getCampaignSteps(campaign.id).catch(() => []),
      this.deps.campaigns.listActivity(workspaceId, campaign.id),
      this.loadExecutionsFor(workspaceId, [campaign]).catch(() => []),
    ]);
    const { page, pageSize } = asPage(input);
    const paged = pageOf(activity, page, pageSize);
    return {
      status: "ok",
      data: {
        campaign,
        steps,
        activity: paged.items,
        executions,
        page: paged.page,
        pageSize: paged.pageSize,
        total: paged.total,
      },
    };
  }

  // ── ChatGPT expansion: lead reads ──────────────────────────────────────

  private async searchLeadsTool(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const matches = await searchLeads(
      this.deps.leads,
      workspaceId,
      String(input.query)
    );
    const { page, pageSize } = asPage(input);
    const paged = pageOf(matches, page, pageSize);
    return {
      status: "ok",
      data: {
        leads: paged.items,
        page: paged.page,
        pageSize: paged.pageSize,
        total: paged.total,
      },
    };
  }

  private async detectDuplicateLeads(
    workspaceId: string
  ): Promise<MuseConnectorResult> {
    const all = await this.deps.leads.listLeads(workspaceId);
    const groups = findDuplicateGroups(all);
    return {
      status: "ok",
      data: {
        groups: groups.map((g) => ({
          reason: g.reason,
          key: g.key,
          leads: g.leads.map((l) => ({
            id: l.id,
            email: l.email,
            firstName: l.first_name,
            lastName: l.last_name,
            company: l.company,
          })),
        })),
        groupCount: groups.length,
        duplicateLeadCount: groups.reduce((n, g) => n + g.leads.length, 0),
      },
    };
  }

  private async getLeadActivityHistory(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const lead = await getLeadById(this.deps.leads, workspaceId, String(input.leadId));
    if (!lead) {
      return errorResult("not_found", 404, `Lead not found: ${String(input.leadId)}.`);
    }
    const messages = (await listMessageHistory(this.deps.inbox, workspaceId, 1000)).filter(
      (m) => m.lead_id === lead.id
    );
    // Campaign activity for every campaign the lead is enrolled in.
    const campaigns = await this.deps.campaigns.listCampaigns(workspaceId);
    const enrolledCampaignIds: string[] = [];
    for (const campaign of campaigns) {
      const enrollments = await this.deps.campaigns
        .listEnrollments(campaign.id)
        .catch(() => []);
      if (enrollments.some((e) => e.lead_id === lead.id)) {
        enrolledCampaignIds.push(campaign.id);
      }
    }
    const activityLists = await Promise.all(
      enrolledCampaignIds.map((id) =>
        this.deps.campaigns.listActivity(workspaceId, id).catch(() => [])
      )
    );
    return {
      status: "ok",
      data: {
        lead,
        messages,
        campaignActivity: activityLists.flat(),
        campaignIds: enrolledCampaignIds,
      },
    };
  }

  private async listLeadsByCampaign(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const campaign = await this.requireCampaign(workspaceId, String(input.campaignId));
    if (!campaign) {
      return errorResult(
        "not_found",
        404,
        `Campaign not found: ${String(input.campaignId)}.`
      );
    }
    const enrollments = await this.deps.campaigns.listEnrollments(campaign.id);
    const leads = await this.deps.leads.listLeads(workspaceId);
    const byId = new Map(leads.map((l) => [l.id, l]));
    const rows = enrollments
      .map((e) => ({ enrollment: e, lead: byId.get(e.lead_id) ?? null }))
      .filter((r) => r.lead !== null);
    const { page, pageSize } = asPage(input);
    const paged = pageOf(rows, page, pageSize);
    return {
      status: "ok",
      data: {
        campaignId: campaign.id,
        leads: paged.items,
        page: paged.page,
        pageSize: paged.pageSize,
        total: paged.total,
      },
    };
  }

  // ── ChatGPT expansion: sequence reads ──────────────────────────────────

  private async getCampaignSequence(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const campaign = await this.requireCampaign(workspaceId, String(input.campaignId));
    if (!campaign) {
      return errorResult(
        "not_found",
        404,
        `Campaign not found: ${String(input.campaignId)}.`
      );
    }
    const steps = await this.deps.campaigns.getCampaignSteps(campaign.id);
    return { status: "ok", data: { campaignId: campaign.id, steps } };
  }

  private async getScheduledFollowUps(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const upcoming = await this.deps.scheduledReplies.listUpcoming(workspaceId);
    const conversationId =
      typeof input.conversationId === "string" ? input.conversationId : "";
    const filtered = conversationId
      ? upcoming.filter((r) => r.conversation_id === conversationId)
      : upcoming;
    const { page, pageSize } = asPage(input);
    const paged = pageOf(filtered, page, pageSize);
    return {
      status: "ok",
      data: {
        followUps: paged.items,
        page: paged.page,
        pageSize: paged.pageSize,
        total: paged.total,
      },
    };
  }

  private async getSequenceExecutionStatus(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const campaign = await this.requireCampaign(workspaceId, String(input.campaignId));
    if (!campaign) {
      return errorResult(
        "not_found",
        404,
        `Campaign not found: ${String(input.campaignId)}.`
      );
    }
    const [steps, executions] = await Promise.all([
      this.deps.campaigns.getCampaignSteps(campaign.id).catch(() => []),
      this.loadExecutionsFor(workspaceId, [campaign]).catch(() => []),
    ]);
    const byStep = new Map<number, StepExecutionRecord[]>();
    for (const e of executions) {
      const list = byStep.get(e.step_order) ?? [];
      list.push(e);
      byStep.set(e.step_order, list);
    }
    const counts = (list: StepExecutionRecord[]) => ({
      total: list.length,
      sent: list.filter((e) => e.status === "sent").length,
      simulated: list.filter((e) => e.status === "simulated").length,
      skipped: list.filter((e) => e.status === "skipped").length,
      stopped: list.filter((e) => e.status === "stopped").length,
      executed: list.filter((e) => e.status === "executed").length,
      failed: list.filter((e) => e.status === "failed").length,
    });
    return {
      status: "ok",
      data: {
        campaignId: campaign.id,
        steps: steps.map((s) => ({
          step: s,
          executions: byStep.get(s.step_order) ?? [],
          counts: counts(byStep.get(s.step_order) ?? []),
        })),
        totals: counts(executions),
      },
    };
  }

  // ── ChatGPT expansion: LinkedIn automation (read-only) ────────────────

  private async getPendingActions(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const campaigns =
      typeof input.campaignId === "string"
        ? [await this.requireCampaign(workspaceId, String(input.campaignId))].filter(
            (c): c is Campaign => c !== null
          )
        : await this.deps.campaigns.listCampaigns(workspaceId);
    if (typeof input.campaignId === "string" && campaigns.length === 0) {
      return errorResult(
        "not_found",
        404,
        `Campaign not found: ${String(input.campaignId)}.`
      );
    }
    const actions: Array<Record<string, unknown>> = [];
    for (const campaign of campaigns) {
      const [steps, enrollments, executions] = await Promise.all([
        this.deps.campaigns.getCampaignSteps(campaign.id).catch(() => []),
        this.deps.campaigns.listEnrollments(campaign.id).catch(() => []),
        this.loadExecutionsFor(workspaceId, [campaign]).catch(() => []),
      ]);
      for (const enrollment of enrollments.filter((e) => e.status === "pending")) {
        for (const step of steps.filter((s) => s.step_order > enrollment.current_step)) {
          actions.push({
            type: "pending_step",
            campaignId: campaign.id,
            campaignName: campaign.name,
            enrollmentId: enrollment.id,
            leadId: enrollment.lead_id,
            stepOrder: step.step_order,
            stepType: step.step_type,
            status: "pending",
          });
        }
      }
      for (const execution of executions.filter((e) => e.status === "sending")) {
        actions.push({
          type: "execution_in_progress",
          campaignId: campaign.id,
          campaignName: campaign.name,
          enrollmentId: execution.enrollment_id,
          leadId: execution.lead_id,
          stepOrder: execution.step_order,
          stepType: execution.step_type,
          status: execution.status,
        });
      }
    }
    const { page, pageSize } = asPage(input);
    const paged = pageOf(actions, page, pageSize);
    return {
      status: "ok",
      data: {
        actions: paged.items,
        page: paged.page,
        pageSize: paged.pageSize,
        total: paged.total,
      },
    };
  }

  private async getFailedActions(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const campaigns =
      typeof input.campaignId === "string"
        ? [await this.requireCampaign(workspaceId, String(input.campaignId))].filter(
            (c): c is Campaign => c !== null
          )
        : await this.deps.campaigns.listCampaigns(workspaceId);
    if (typeof input.campaignId === "string" && campaigns.length === 0) {
      return errorResult(
        "not_found",
        404,
        `Campaign not found: ${String(input.campaignId)}.`
      );
    }
    const executions = (
      await Promise.all(
        campaigns.map((c) => this.loadExecutionsFor(workspaceId, [c]).catch(() => []))
      )
    ).flat();
    const failed = executions.filter(
      (e) => e.status === "failed" || e.status === "skipped"
    );
    const { page, pageSize } = asPage(input);
    const paged = pageOf(failed, page, pageSize);
    return {
      status: "ok",
      data: {
        actions: paged.items.map((e) => ({
          id: e.id,
          campaignId: e.campaign_id,
          enrollmentId: e.enrollment_id,
          leadId: e.lead_id,
          stepOrder: e.step_order,
          stepType: e.step_type,
          channel: e.channel,
          status: e.status,
          detail: e.detail,
          simulated: e.simulated,
          createdAt: e.created_at,
        })),
        page: paged.page,
        pageSize: paged.pageSize,
        total: paged.total,
      },
    };
  }

  private async getAutomationExecutionReport(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const campaigns =
      typeof input.campaignId === "string"
        ? [await this.requireCampaign(workspaceId, String(input.campaignId))].filter(
            (c): c is Campaign => c !== null
          )
        : await this.deps.campaigns.listCampaigns(workspaceId);
    if (typeof input.campaignId === "string" && campaigns.length === 0) {
      return errorResult(
        "not_found",
        404,
        `Campaign not found: ${String(input.campaignId)}.`
      );
    }
    const countBy = (list: StepExecutionRecord[]) => ({
      total: list.length,
      sent: list.filter((e) => e.status === "sent").length,
      simulated: list.filter((e) => e.status === "simulated").length,
      skipped: list.filter((e) => e.status === "skipped").length,
      stopped: list.filter((e) => e.status === "stopped").length,
      executed: list.filter((e) => e.status === "executed").length,
      failed: list.filter((e) => e.status === "failed").length,
    });
    const perCampaign = await Promise.all(
      campaigns.map(async (campaign) => {
        const executions = await this.loadExecutionsFor(workspaceId, [campaign]).catch(
          () => []
        );
        return {
          campaignId: campaign.id,
          campaignName: campaign.name,
          status: campaign.status,
          counts: countBy(executions),
        };
      })
    );
    const totals = {
      total: perCampaign.reduce((n, c) => n + c.counts.total, 0),
      sent: perCampaign.reduce((n, c) => n + c.counts.sent, 0),
      simulated: perCampaign.reduce((n, c) => n + c.counts.simulated, 0),
      skipped: perCampaign.reduce((n, c) => n + c.counts.skipped, 0),
      stopped: perCampaign.reduce((n, c) => n + c.counts.stopped, 0),
      executed: perCampaign.reduce((n, c) => n + c.counts.executed, 0),
      failed: perCampaign.reduce((n, c) => n + c.counts.failed, 0),
    };
    return {
      status: "ok",
      data: {
        campaigns: perCampaign,
        totals,
        note: "LinkedIn steps are recorded as skipped until an authorized provider exists — a skipped LinkedIn step is never reported as sent.",
      },
    };
  }

  // ── ChatGPT expansion: inbox reads ─────────────────────────────────────

  private async searchConversations(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const query = String(input.query).trim().toLowerCase();
    const { conversations } = await this.deps.inbox.listConversations(workspaceId, {
      channel:
        input.channel === "email" || input.channel === "linkedin"
          ? input.channel
          : undefined,
      limit: 100,
    });
    const filtered = conversations.filter((c) =>
      `${c.contact_name ?? ""} ${c.contact_email ?? ""} ${c.company ?? ""} ${c.subject ?? ""} ${c.last_message_preview ?? ""}`
        .toLowerCase()
        .includes(query)
    );
    const { page, pageSize } = asPage(input);
    const paged = pageOf(filtered, page, pageSize);
    return {
      status: "ok",
      data: {
        conversations: paged.items,
        page: paged.page,
        pageSize: paged.pageSize,
        total: paged.total,
      },
    };
  }

  private async getMessageExecutionStatus(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const messageId =
      typeof input.messageId === "string" ? input.messageId : "";
    const idempotencyKey =
      typeof input.idempotencyKey === "string" ? input.idempotencyKey : "";
    const conversationId =
      typeof input.conversationId === "string" ? input.conversationId : "";
    if (!messageId && !idempotencyKey) {
      return errorResult(
        "invalid_params",
        400,
        "Provide messageId, or idempotencyKey with conversationId."
      );
    }
    if (idempotencyKey && !conversationId) {
      return errorResult(
        "invalid_params",
        400,
        "conversationId is required when looking up by idempotencyKey."
      );
    }
    let found: Awaited<
      ReturnType<InboxRepository["findMessageByIdempotencyKey"]>
    > = null;
    if (messageId) {
      const history = await listMessageHistory(this.deps.inbox, workspaceId, 1000);
      found = history.find((m) => m.id === messageId) ?? null;
    } else {
      found = await this.deps.inbox.findMessageByIdempotencyKey(
        workspaceId,
        conversationId,
        idempotencyKey
      );
    }
    if (!found) {
      return errorResult("not_found", 404, "Message not found.");
    }
    return {
      status: "ok",
      data: {
        message: found,
        verification: classifyMessage(found),
      },
    };
  }

  private async getFailedMessages(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const history = await listMessageHistory(this.deps.inbox, workspaceId, 1000);
    const failed = history.filter((m) => classifyMessage(m) === "failed");
    const { page, pageSize } = asPage(input);
    const paged = pageOf(failed, page, pageSize);
    return {
      status: "ok",
      data: {
        messages: paged.items,
        page: paged.page,
        pageSize: paged.pageSize,
        total: paged.total,
      },
    };
  }

  // ── ChatGPT expansion: analytics reads ─────────────────────────────────

  private async compareCampaigns(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const ids = Array.isArray(input.campaignIds)
      ? (input.campaignIds as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    if (ids.length < 2) {
      return errorResult(
        "invalid_params",
        400,
        "compare_campaigns needs at least two campaign ids."
      );
    }
    const campaigns: Campaign[] = [];
    for (const id of ids) {
      const campaign = await this.requireCampaign(workspaceId, id);
      if (!campaign) {
        return errorResult("not_found", 404, `Campaign not found: ${id}.`);
      }
      campaigns.push(campaign);
    }
    const byCampaign = await this.loadStatsFor(workspaceId, campaigns);
    const stats = campaigns.map((c) => byCampaign.get(c.id) ?? null);
    const aggregate = aggregateCampaignStats(
      stats.filter((s): s is CampaignStats => s !== null)
    );
    // Deltas: each campaign vs the group mean on the headline numbers.
    const mean = (pick: (s: CampaignStats) => number): number => {
      const values = stats
        .filter((s): s is CampaignStats => s !== null)
        .map(pick);
      return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    };
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const deltas = campaigns.map((c, i) => {
      const s = stats[i];
      if (!s) return { campaignId: c.id, delta: null };
      return {
        campaignId: c.id,
        delta: {
          prospects: round2(s.prospects - mean((x) => x.prospects)),
          repliesTotal: round2(s.repliesTotal - mean((x) => x.repliesTotal)),
          meetingsBooked: round2(s.meetingsBooked - mean((x) => x.meetingsBooked)),
          emailsSent: round2(s.email.sent - mean((x) => x.email.sent)),
          executionsSent: round2(s.executions.sent - mean((x) => x.executions.sent)),
        },
      };
    });
    return {
      status: "ok",
      data: {
        campaigns: campaigns.map((c, i) => ({ campaign: c, stats: stats[i] })),
        aggregate,
        deltas,
      },
    };
  }

  private async getDateRangeReport(
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const start = Date.parse(String(input.startDate));
    const end = Date.parse(String(input.endDate));
    if (Number.isNaN(start) || Number.isNaN(end)) {
      return errorResult(
        "invalid_params",
        400,
        "startDate and endDate must be ISO dates (e.g. 2026-10-01)."
      );
    }
    if (start > end) {
      return errorResult(
        "invalid_params",
        400,
        "startDate must be on or before endDate."
      );
    }
    // HONEST LIMITATION (documented): the stats loaders
    // (loadCampaignStats / loadCampaignExecutions) compute over
    // all-time records and expose no date filter, so a date-range
    // report would have to invent filtered numbers. Answer BLOCKED
    // instead, and point at the all-time summaries that do exist.
    return errorResult(
      "date_range_not_supported",
      501,
      "Date-range reports are not supported: campaign stats are computed over all-time records and the stats loaders cannot filter by date. Use get_performance_summary for the workspace-wide all-time summary, or get_campaign_performance for one campaign.",
      "BLOCKED"
    );
  }

  private async getPerformanceSummary(
    workspaceId: string
  ): Promise<MuseConnectorResult> {
    const [campaigns, leads, unread] = await Promise.all([
      this.deps.campaigns.listCampaigns(workspaceId),
      this.deps.leads.listLeads(workspaceId),
      this.deps.inbox.getUnreadConversationCount(workspaceId).catch(() => null),
    ]);
    const { aggregate } = await loadCampaignStats(
      this.statsDeps(),
      workspaceId,
      campaigns
    );
    return {
      status: "ok",
      data: {
        totalLeads: leads.length,
        totalCampaigns: campaigns.length,
        unreadConversations: unread,
        stats: aggregate,
      },
    };
  }

  private async getUsageReport(
    workspaceId: string
  ): Promise<MuseConnectorResult> {
    const [usage, limits] = await Promise.all([
      this.deps.usage.getWorkspaceUsage(workspaceId),
      this.getAccountLimits(workspaceId),
    ]);
    const limitsData =
      limits.status === "ok" ? (limits.data as Record<string, unknown>) : null;
    return {
      status: "ok",
      data: {
        usage,
        accountLimits: limitsData?.accounts ?? null,
        safetySettings: limitsData?.safetySettings ?? null,
      },
    };
  }

  // ── ChatGPT expansion: profile / knowledge / UI ────────────────────────

  private async getProfile(
    workspaceId: string,
    caller: MuseCaller
  ): Promise<MuseConnectorResult> {
    // Identity comes from the validated grant ONLY — never from input.
    // No display name or email is stored on the grant, so none is
    // returned; the user id + workspace id ARE the identity.
    const usage = await this.deps.usage
      .getWorkspaceUsage(workspaceId)
      .catch(() => null);
    return {
      status: "ok",
      data: {
        userId: caller.subject,
        workspaceId,
        scopes: caller.scopes,
        clientId: caller.clientId ?? null,
        grantId: caller.grantId ?? null,
        plan: usage?.plan ?? null,
      },
    };
  }

  private async searchKnowledge(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const query = String(input.query);
    const leads = await searchLeads(this.deps.leads, workspaceId, query);
    const campaigns = (await this.deps.campaigns.listCampaigns(workspaceId)).filter(
      (c) => c.name.toLowerCase().includes(query.trim().toLowerCase())
    );
    const hits: Array<{
      id: string;
      type: "lead" | "campaign";
      title: string;
      snippet: string;
      url: string;
    }> = [];
    for (const lead of leads.slice(0, 20)) {
      const name = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim();
      hits.push({
        id: lead.id,
        type: "lead",
        title: name || lead.email || lead.id,
        snippet: [lead.company, lead.job_title, lead.email]
          .filter(Boolean)
          .join(" · "),
        url: "/dashboard/leads",
      });
    }
    for (const campaign of campaigns.slice(0, 20)) {
      hits.push({
        id: campaign.id,
        type: "campaign",
        title: campaign.name,
        snippet: `${campaign.status} · ${campaign.type}`,
        url: `/dashboard/campaigns/${campaign.id}`,
      });
    }
    return { status: "ok", data: { hits, total: hits.length } };
  }

  private async fetchRecord(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const id = String(input.id);
    const lead = await getLeadById(this.deps.leads, workspaceId, id);
    if (lead) {
      return { status: "ok", data: { type: "lead", record: lead } };
    }
    const campaign = await this.requireCampaign(workspaceId, id);
    if (campaign) {
      return { status: "ok", data: { type: "campaign", record: campaign } };
    }
    return errorResult("not_found", 404, `No lead or campaign found with id: ${id}.`);
  }

  private async renderCampaignsWidget(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const campaignIds = Array.isArray(input.campaignIds)
      ? (input.campaignIds as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    if (campaignIds.length === 0) {
      return errorResult(
        "invalid_params",
        400,
        "render_campaigns_widget needs at least one campaign id (call list_campaigns first)."
      );
    }
    // The model should pass list_campaigns results; when it passes
    // ids only, fetch the summaries here (read-only either way).
    let summaries: Array<Record<string, unknown>>;
    if (Array.isArray(input.campaigns) && input.campaigns.length > 0) {
      summaries = (input.campaigns as Record<string, unknown>[]).filter(
        (c) => c && typeof c.id === "string"
      );
    } else {
      const all = await this.deps.campaigns.listCampaigns(workspaceId);
      const byId = new Map(all.map((c) => [c.id, c]));
      summaries = campaignIds
        .map((id) => byId.get(id))
        .filter((c): c is Campaign => c !== undefined)
        .map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          type: c.type,
        }));
      // Enrollment counts for the fetched summaries.
      for (const summary of summaries) {
        const enrollments = await this.deps.campaigns
          .listEnrollments(String(summary.id))
          .catch(() => []);
        summary.enrollments = enrollments.length;
      }
    }
    const foundIds = new Set(summaries.map((s) => String(s.id)));
    const missingIds = campaignIds.filter((id) => !foundIds.has(id));
    return {
      status: "ok",
      data: {
        campaignIds,
        campaigns: summaries,
        summary:
          input.summary && typeof input.summary === "object"
            ? input.summary
            : null,
        missingIds,
        widget: { resourceUri: "ui://widget/campaigns.html" },
        status: "SUCCESS" as MuseToolOutcomeStatus,
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
      return {
        status: "ok",
        data: {
          lead: existing,
          duplicate: true,
          idempotencyKey: this.effectiveIdempotencyKey("create_lead", input, {
            workspaceId,
            email,
          }),
        },
      };
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
    return {
      status: "ok",
      data: {
        lead,
        duplicate: false,
        idempotencyKey: this.effectiveIdempotencyKey("create_lead", input, {
          workspaceId,
          email,
        }),
      },
    };
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
    return {
      status: "ok",
      data: {
        lead: updated,
        idempotencyKey: this.effectiveIdempotencyKey("update_lead", input, {
          workspaceId,
          leadId: lead.id,
        }),
      },
    };
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
      data: {
        deleted: true,
        leadId: lead.id,
        status: "SUCCESS" as MuseToolOutcomeStatus,
        idempotencyKey: this.effectiveIdempotencyKey("delete_lead", input, {
          workspaceId,
          leadId: lead.id,
        }),
      },
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
      data: {
        campaign,
        steps: createdSteps,
        status: "SUCCESS" as MuseToolOutcomeStatus,
        idempotencyKey: this.effectiveIdempotencyKey("create_campaign", input, {
          workspaceId,
          name,
          channel,
        }),
      },
    };
  }

  private async setCampaignStatus(
    workspaceId: string,
    input: Record<string, unknown>,
    target: CampaignStatus,
    requiredFrom: CampaignStatus | null,
    toolName: string = "archive_campaign"
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
      data: {
        campaign: updated ?? { ...campaign, status: target },
        status: "SUCCESS" as MuseToolOutcomeStatus,
        idempotencyKey: this.effectiveIdempotencyKey(toolName, input, {
          workspaceId,
          campaignId: campaign.id,
        }),
      },
    };
  }

  // ── ChatGPT expansion: lead writes ─────────────────────────────────────

  private async importLeads(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const raw = Array.isArray(input.leads) ? input.leads : [];
    if (raw.length === 0) {
      return errorResult("invalid_params", 400, "import_leads needs at least one lead.");
    }
    if (raw.length > 100) {
      return errorResult(
        "invalid_params",
        400,
        "import_leads accepts at most 100 leads per call."
      );
    }
    const existing = await this.deps.leads.listLeads(workspaceId);
    const existingEmails = new Set(existing.map((l) => normalizeEmail(l.email)));
    const seen = new Set<string>();
    const toImport: CreateLeadInput[] = [];
    const skipped: Array<{ email: string; reason: string }> = [];
    for (const item of raw) {
      const row = (item ?? {}) as Record<string, unknown>;
      const email =
        typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
      if (!email || !isValidEmailAddress(email)) {
        skipped.push({ email: email || String(row.email ?? ""), reason: "invalid_email" });
        continue;
      }
      if (existingEmails.has(email) || seen.has(email)) {
        skipped.push({ email, reason: "duplicate" });
        continue;
      }
      seen.add(email);
      toImport.push({
        first_name: typeof row.first_name === "string" ? row.first_name : "",
        last_name: typeof row.last_name === "string" ? row.last_name : undefined,
        email,
        company: typeof row.company === "string" ? row.company : undefined,
        job_title: typeof row.job_title === "string" ? row.job_title : undefined,
        linkedin_url: typeof row.linkedin_url === "string" ? row.linkedin_url : undefined,
        tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
      });
    }
    let imported: Lead[] = [];
    if (toImport.length > 0) {
      try {
        imported = await this.deps.leads.importLeads(workspaceId, toImport);
      } catch (err) {
        return errorResult(
          "import_failed",
          502,
          err instanceof Error ? err.message : "Lead import failed."
        );
      }
    }
    return {
      status: "ok",
      data: {
        imported,
        importedCount: imported.length,
        skipped,
        skippedCount: skipped.length,
        idempotencyKey: this.effectiveIdempotencyKey("import_leads", input, {
          workspaceId,
          count: raw.length,
        }),
        status: "SUCCESS" as MuseToolOutcomeStatus,
      },
    };
  }

  private async addLeadsToCampaign(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const campaign = await this.requireCampaign(workspaceId, String(input.campaignId));
    if (!campaign) {
      return errorResult(
        "not_found",
        404,
        `Campaign not found: ${String(input.campaignId)}.`
      );
    }
    const leadIds = Array.isArray(input.leadIds)
      ? (input.leadIds as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    if (leadIds.length === 0) {
      return errorResult("invalid_params", 400, "At least one lead id is required.");
    }
    const leads = await this.deps.leads.listLeads(workspaceId);
    const known = new Set(leads.map((l) => l.id));
    const notFound = leadIds.filter((id) => !known.has(id));
    const toEnroll = leadIds.filter((id) => known.has(id));
    const { enrolled, skipped } = await this.deps.campaigns.enrollLeads(
      workspaceId,
      campaign.id,
      toEnroll
    );
    return {
      status: "ok",
      data: {
        campaignId: campaign.id,
        enrolled,
        skipped,
        notFound,
        idempotencyKey: this.effectiveIdempotencyKey("add_leads_to_campaign", input, {
          workspaceId,
          campaignId: campaign.id,
          leadIds,
        }),
        status: "SUCCESS" as MuseToolOutcomeStatus,
      },
    };
  }

  private async removeLeadsFromCampaign(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const campaign = await this.requireCampaign(workspaceId, String(input.campaignId));
    if (!campaign) {
      return errorResult(
        "not_found",
        404,
        `Campaign not found: ${String(input.campaignId)}.`
      );
    }
    const leadIds = Array.isArray(input.leadIds)
      ? (input.leadIds as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    if (leadIds.length === 0) {
      return errorResult("invalid_params", 400, "At least one lead id is required.");
    }
    const before = await this.deps.campaigns.listEnrollments(campaign.id);
    const enrolledSet = new Set(before.map((e) => e.lead_id));
    let removed = 0;
    const notEnrolled: string[] = [];
    for (const id of leadIds) {
      if (enrolledSet.has(id)) {
        await this.deps.campaigns.removeEnrollment(campaign.id, id);
        removed++;
      } else {
        notEnrolled.push(id);
      }
    }
    return {
      status: "ok",
      data: {
        campaignId: campaign.id,
        removed,
        notEnrolled,
        idempotencyKey: this.effectiveIdempotencyKey(
          "remove_leads_from_campaign",
          input,
          { workspaceId, campaignId: campaign.id, leadIds }
        ),
        status: "SUCCESS" as MuseToolOutcomeStatus,
      },
    };
  }

  // ── ChatGPT expansion: sequence writes ────────────────────────────────
  //
  // No single-step repository method exists, so create/update/reorder
  // are read-modify-write via getCampaignSteps + replaceCampaignSteps.
  // Concurrent writers can overwrite each other (last writer wins);
  // sequence edits over MCP are human-paced, so this is acceptable,
  // and a single-step repository method would make it atomic.

  /** Validates one step draft (same rules as create_campaign). */
  private toStepDraft(
    raw: Record<string, unknown>
  ): { draft?: CampaignStepDraft; error?: string } {
    if (!VALID_STEP_TYPES.includes(raw.step_type as StepType)) {
      return { error: "step_type must be a valid step type." };
    }
    const delay = typeof raw.delay_hours === "number" ? raw.delay_hours : 0;
    if (delay < 0) {
      return { error: "delay_hours must be >= 0." };
    }
    if (
      (raw.step_type === "email" || raw.step_type === "linkedin_message") &&
      !(typeof raw.content === "string" && raw.content.trim())
    ) {
      return {
        error: `${String(raw.step_type)} steps require non-empty content.`,
      };
    }
    return {
      draft: {
        step_type: raw.step_type as StepType,
        delay_hours: delay,
        subject: typeof raw.subject === "string" ? raw.subject : undefined,
        content: typeof raw.content === "string" ? raw.content : undefined,
        config:
          raw.config && typeof raw.config === "object"
            ? (raw.config as Record<string, unknown>)
            : undefined,
      },
    };
  }

  private stepToDraft(s: {
    step_type: StepType;
    delay_hours: number;
    subject?: string;
    content?: string;
    config: Record<string, unknown>;
  }): CampaignStepDraft {
    return {
      step_type: s.step_type,
      delay_hours: s.delay_hours,
      subject: s.subject,
      content: s.content,
      config: s.config,
    };
  }

  private async createSequenceStep(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const campaign = await this.requireCampaign(workspaceId, String(input.campaignId));
    if (!campaign) {
      return errorResult(
        "not_found",
        404,
        `Campaign not found: ${String(input.campaignId)}.`
      );
    }
    const checked = this.toStepDraft({
      step_type: input.stepType,
      delay_hours: typeof input.delayHours === "number" ? input.delayHours : 0,
      subject: input.subject,
      content: input.content,
      config: input.config,
    });
    if (checked.error) {
      return errorResult("invalid_params", 400, checked.error);
    }
    const current = await this.deps.campaigns.getCampaignSteps(campaign.id);
    const drafts = current.map((s) => this.stepToDraft(s));
    drafts.push(checked.draft!);
    const steps = await this.deps.campaigns.replaceCampaignSteps(campaign.id, drafts);
    return {
      status: "ok",
      data: {
        campaignId: campaign.id,
        step: steps[steps.length - 1] ?? null,
        steps,
        idempotencyKey: this.effectiveIdempotencyKey("create_sequence_step", input, {
          workspaceId,
          campaignId: campaign.id,
        }),
        status: "SUCCESS" as MuseToolOutcomeStatus,
      },
    };
  }

  private async updateSequenceStep(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const campaign = await this.requireCampaign(workspaceId, String(input.campaignId));
    if (!campaign) {
      return errorResult(
        "not_found",
        404,
        `Campaign not found: ${String(input.campaignId)}.`
      );
    }
    const steps = await this.deps.campaigns.getCampaignSteps(campaign.id);
    const idx = steps.findIndex((s) => s.id === String(input.stepId));
    if (idx < 0) {
      return errorResult(
        "not_found",
        404,
        `Sequence step not found: ${String(input.stepId)}.`
      );
    }
    const target = steps[idx];
    const checked = this.toStepDraft({
      step_type:
        typeof input.stepType === "string" ? input.stepType : target.step_type,
      delay_hours:
        typeof input.delayHours === "number" ? input.delayHours : target.delay_hours,
      subject: typeof input.subject === "string" ? input.subject : target.subject,
      content: typeof input.content === "string" ? input.content : target.content,
      config:
        input.config && typeof input.config === "object"
          ? input.config
          : target.config,
    });
    if (checked.error) {
      return errorResult("invalid_params", 400, checked.error);
    }
    const drafts = steps.map((s, i) =>
      i === idx ? checked.draft! : this.stepToDraft(s)
    );
    const updated = await this.deps.campaigns.replaceCampaignSteps(campaign.id, drafts);
    return {
      status: "ok",
      data: {
        campaignId: campaign.id,
        step: updated[idx] ?? null,
        steps: updated,
        idempotencyKey: this.effectiveIdempotencyKey("update_sequence_step", input, {
          workspaceId,
          campaignId: campaign.id,
          stepId: target.id,
        }),
        status: "SUCCESS" as MuseToolOutcomeStatus,
      },
    };
  }

  private async reorderSequenceSteps(
    workspaceId: string,
    input: Record<string, unknown>
  ): Promise<MuseConnectorResult> {
    const campaign = await this.requireCampaign(workspaceId, String(input.campaignId));
    if (!campaign) {
      return errorResult(
        "not_found",
        404,
        `Campaign not found: ${String(input.campaignId)}.`
      );
    }
    const steps = await this.deps.campaigns.getCampaignSteps(campaign.id);
    const wanted = Array.isArray(input.stepIds)
      ? (input.stepIds as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    const currentIds = new Set(steps.map((s) => s.id));
    if (
      wanted.length !== steps.length ||
      new Set(wanted).size !== wanted.length ||
      !wanted.every((id) => currentIds.has(id))
    ) {
      return errorResult(
        "invalid_params",
        400,
        "stepIds must contain exactly the campaign's current steps, in the new order."
      );
    }
    const byId = new Map(steps.map((s) => [s.id, s]));
    const drafts = wanted.map((id) => this.stepToDraft(byId.get(id)!));
    const reordered = await this.deps.campaigns.replaceCampaignSteps(
      campaign.id,
      drafts
    );
    return {
      status: "ok",
      data: {
        campaignId: campaign.id,
        steps: reordered,
        idempotencyKey: this.effectiveIdempotencyKey("reorder_sequence_steps", input, {
          workspaceId,
          campaignId: campaign.id,
          stepIds: wanted,
        }),
        status: "SUCCESS" as MuseToolOutcomeStatus,
      },
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
