/**
 * Sequence executor — types.
 *
 * The executor advances campaign enrollments one step at a time
 * (driven by the `follow_up_due` background job in live mode, and by
 * an in-app runner against the demo store in Demo Mode). It is built
 * around an ExecutorStore so the whole decision engine is testable
 * with in-memory fakes — no database, no network.
 *
 * Honesty rules baked into the model:
 *  - A step outcome of "sent" exists ONLY with a provider message ID
 *    returned by the email adapter (the adapter enforces suppression
 *    before any provider call and fails closed).
 *  - LinkedIn steps are NEVER sent or simulated-as-sent: they are
 *    recorded "skipped" because no authorized LinkedIn provider is
 *    integrated.
 *  - In Demo Mode every record is flagged `simulated`.
 */

import type {
  CampaignStep,
  CampaignType,
  Lead,
  PlanType,
  StepType,
  WarmupHistoryEntry,
} from "@/types";
import type { InboxMessage, InsertMessageInput } from "@/lib/data/inbox";
import type {
  AccountWarmupState,
  WarmupProgramPatch,
  WarmupUsageCounts,
} from "@/lib/linkedin/warmup";

export type StepChannel = "email" | "linkedin" | "none";

export type StepExecutionStatus =
  | "sending"
  | "sent"
  | "simulated"
  | "skipped"
  | "stopped"
  | "executed"
  | "failed";

export interface ExecutorEnrollment {
  id: string;
  workspace_id: string;
  campaign_id: string;
  lead_id: string;
  status: string;
  current_step: number;
  enrolled_at: string;
  last_step_at: string | null;
}

export interface ExecutorCampaign {
  id: string;
  workspace_id: string;
  name: string;
  type: CampaignType;
  status: string;
  /**
   * The campaign's connected accounts (migration 011). Optional so
   * older fakes keep compiling — both real stores always set them.
   * The warm-up gate resolves the LinkedIn sender from
   * `sender_account_id`; claim rows attribute executions to the
   * account of the step's channel.
   */
  sender_account_id?: string | null;
  email_account_id?: string | null;
}

export interface StepExecutionRecord {
  id: string;
  workspace_id: string;
  campaign_id: string;
  enrollment_id: string;
  lead_id: string;
  step_order: number;
  step_type: StepType;
  channel: StepChannel;
  status: StepExecutionStatus;
  detail: string;
  /**
   * The connected account this execution is attributed to (migration
   * 020), filled at claim time from the campaign's sender account for
   * the step's channel. Warm-up usage counters derive from this.
   * Null for non-account steps (wait/condition) and pre-020 rows.
   */
  account_id: string | null;
  message_id: string | null;
  provider: string | null;
  provider_message_id: string | null;
  idempotency_key: string;
  simulated: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClaimStepExecutionInput {
  workspace_id: string;
  campaign_id: string;
  enrollment_id: string;
  lead_id: string;
  step_order: number;
  step_type: StepType;
  channel: StepChannel;
  /** Account attribution for the claim row (migration 020). */
  account_id: string | null;
  idempotency_key: string;
  simulated: boolean;
}

export interface LeadSignals {
  /** ISO timestamp of the lead's first inbound reply at/after enrollment. */
  repliedAt: string | null;
  /**
   * Why the lead's email is on the workspace suppression list
   * ("bounced" / "complained" / "unsubscribed" / other), or null when
   * the address is not suppressed.
   */
  suppressionReason: string | null;
}

/**
 * The sender identity behind the {my_*} template variables, resolved
 * from the campaign's connected account for a channel (migration 011).
 */
export interface SenderIdentity {
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  companyName?: string;
}

export interface ExecutorStore {
  /** True for the Demo Mode store — every record is labelled simulated. */
  readonly simulated: boolean;
  /**
   * Optional: resolves the sender identity for a campaign's connected
   * account on the given channel (campaigns.sender_account_id for
   * LinkedIn, email_account_id for email). Stores that cannot resolve
   * it (or campaigns without an account) return null — the {my_*}
   * variables then render their template fallback/empty, exactly as
   * before the accounts model existed.
   */
  getSenderIdentity?(
    workspaceId: string,
    campaignId: string,
    channel: "linkedin" | "email"
  ): Promise<SenderIdentity | null>;
  /**
   * Optional (warm-up gate): the sender account's warm-up program
   * state. Stores that cannot resolve it return null and the gate
   * stays inert — warm-up is an additional throttle, never a
   * prerequisite for the pre-existing behaviour.
   */
  getAccountWarmupState?(
    workspaceId: string,
    accountId: string
  ): Promise<AccountWarmupState | null>;
  /**
   * Optional (warm-up gate): today's counted LinkedIn usage for one
   * account (UTC day from `dayStartIso`). Same counter the Accounts
   * panel renders, so the two can never disagree. Called at most
   * once per (account, scan) by the core.
   */
  countLinkedInActionsToday?(
    workspaceId: string,
    accountId: string,
    dayStartIso: string
  ): Promise<WarmupUsageCounts>;
  /**
   * Optional: persists a warm-up program transition computed by the
   * engine — used by the gate for LAZY GRADUATION (a warming program
   * whose schedule elapsed is recorded graduated, with its history
   * entry, the first time the gate observes it). Best-effort:
   * implementations swallow their own errors and the run continues.
   */
  persistWarmupTransition?(
    workspaceId: string,
    accountId: string,
    patch: WarmupProgramPatch,
    entryState: AccountWarmupState,
    entry: WarmupHistoryEntry
  ): Promise<void>;
  /**
   * Enrollments that may have a due step: status pending/active and
   * their campaign is active. Time-based due filtering happens in the
   * executor core (pure, tested), not here.
   */
  listEnrollments(
    workspaceId: string | null,
    limit: number
  ): Promise<ExecutorEnrollment[]>;
  getCampaign(
    workspaceId: string,
    campaignId: string
  ): Promise<ExecutorCampaign | null>;
  getSteps(campaignId: string): Promise<CampaignStep[]>;
  getLead(workspaceId: string, leadId: string): Promise<Lead | null>;
  getLeadSignals(
    workspaceId: string,
    lead: Lead,
    enrolledAt: string
  ): Promise<LeadSignals>;
  getWorkspacePlan(workspaceId: string): Promise<PlanType>;
  /** Outbound email messages recorded in the current month period. */
  countEmailsThisMonth(
    workspaceId: string,
    periodStartIso: string
  ): Promise<number>;
  /**
   * Inserts the at-most-once claim row for (enrollment, step_order).
   * Returns null when a row already exists — the step was claimed or
   * executed before and must not run again.
   */
  claimStepExecution(
    input: ClaimStepExecutionInput
  ): Promise<StepExecutionRecord | null>;
  completeStepExecution(
    id: string,
    patch: Partial<
      Pick<
        StepExecutionRecord,
        "status" | "detail" | "message_id" | "provider" | "provider_message_id"
      >
    >
  ): Promise<void>;
  /** Deletes a claim after a TRANSIENT failure so the step stays due. */
  releaseStepExecution(id: string): Promise<void>;
  /** Find-or-create the (lead, channel) conversation used for message records. */
  ensureConversation(
    workspaceId: string,
    input: {
      lead_id: string;
      channel: "email" | "linkedin";
      contact_name: string;
      contact_email: string;
      company: string | null;
      subject: string | null;
    }
  ): Promise<string>;
  insertMessage(
    input: InsertMessageInput & { campaign_id?: string | null }
  ): Promise<InboxMessage>;
  updateEnrollment(
    enrollmentId: string,
    patch: {
      status?: string;
      current_step?: number;
      last_step_at?: string | null;
    }
  ): Promise<void>;
  appendActivity(
    workspaceId: string,
    entry: { campaign_id: string | null; action: string; details: string }
  ): Promise<void>;
}

export interface ExecutorRunSummary {
  /** Enrollments inspected (in active campaigns). */
  scanned: number;
  /** Enrollments whose next step was due and got a terminal decision. */
  due: number;
  sent: number;
  simulated: number;
  skippedLinkedIn: number;
  skippedNoEmail: number;
  waitsExecuted: number;
  stoppedReply: number;
  stoppedSuppression: number;
  stoppedMissingLead: number;
  /** Sends deferred because the workspace hit its plan email limit. */
  overLimit: number;
  /**
   * LinkedIn steps deferred because the sender account's warm-up
   * program hit today's effective cap for that action. Deferred —
   * NOT claimed, NOT executed; the steps remain due.
   */
  warmupDeferred: number;
  /** Steps already claimed/executed by an earlier run (idempotency). */
  alreadyClaimed: number;
  /** Transient failures (provider error / not configured) — step stays due. */
  errors: number;
  /** Enrollments that finished their final step in this run. */
  completedEnrollments: number;
  log: string[];
}

export function emptyRunSummary(): ExecutorRunSummary {
  return {
    scanned: 0,
    due: 0,
    sent: 0,
    simulated: 0,
    skippedLinkedIn: 0,
    skippedNoEmail: 0,
    waitsExecuted: 0,
    stoppedReply: 0,
    stoppedSuppression: 0,
    stoppedMissingLead: 0,
    overLimit: 0,
    warmupDeferred: 0,
    alreadyClaimed: 0,
    errors: 0,
    completedEnrollments: 0,
    log: [],
  };
}

/** Deterministic per-step idempotency key (claim row + message row). */
export function stepExecutionKey(enrollmentId: string, stepOrder: number): string {
  return `step:${enrollmentId}:${stepOrder}`;
}
