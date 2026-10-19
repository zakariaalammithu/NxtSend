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

import type { CampaignStep, CampaignType, Lead, PlanType, StepType } from "@/types";
import type { InboxMessage, InsertMessageInput } from "@/lib/data/inbox";

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

export interface ExecutorStore {
  /** True for the Demo Mode store — every record is labelled simulated. */
  readonly simulated: boolean;
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
