/**
 * LinkedIn page derivations — pure functions over REAL records
 * (P5 Stage F). Everything the /dashboard/linkedin page shows is
 * computed here from the campaigns repository (campaigns + their
 * steps), the step-execution records the executor wrote, and the
 * connected-accounts repository. There is no mock import and no
 * invented number anywhere in this module:
 *
 *   - "sent" counts only executions the executor recorded `sent`
 *     (impossible today — no approved provider — so it is a real 0);
 *   - every other LinkedIn execution is shown with the outcome and
 *     the detail the executor recorded (today: `skipped` + the
 *     no-provider reason);
 *   - campaigns qualify by their SEQUENCE containing LinkedIn steps,
 *     not by a label — a "linkedin" campaign with no LinkedIn steps
 *     has no LinkedIn activity to report.
 */

import type { Campaign, CampaignStep, Lead, StepType } from "@/types";
import type { StepExecutionRecord } from "@/lib/executor/types";

/** Step types that act on LinkedIn (mirrors the executor's
 *  stepChannel() mapping in src/lib/executor/core.ts). */
export const LINKEDIN_STEP_TYPES: readonly StepType[] = [
  "connection_request",
  "linkedin_message",
  "like_post",
  "view_profile",
  "endorse_skills",
];

const LINKEDIN_STEP_TYPE_SET: ReadonlySet<string> = new Set(LINKEDIN_STEP_TYPES);

export function isLinkedInStepType(stepType: StepType | string): boolean {
  return LINKEDIN_STEP_TYPE_SET.has(stepType);
}

export const LINKEDIN_STEP_TYPE_LABELS: Record<string, string> = {
  connection_request: "Connection request",
  linkedin_message: "LinkedIn message",
  like_post: "Like post",
  view_profile: "Profile view",
  endorse_skills: "Endorse skills",
};

export function linkedInStepTypeLabel(stepType: string): string {
  return LINKEDIN_STEP_TYPE_LABELS[stepType] ?? stepType;
}

/** The campaign's steps that act on LinkedIn, in sequence order. */
export function linkedInStepsOf(steps: CampaignStep[]): CampaignStep[] {
  return steps
    .filter((s) => isLinkedInStepType(s.step_type))
    .sort((a, b) => a.step_order - b.step_order);
}

/**
 * Campaigns whose sequences contain at least one LinkedIn step.
 * Type alone (linkedin/mixed) is not enough — the sequence is the
 * source of truth — and an email-only sequence never qualifies.
 */
export function filterLinkedInCampaigns(
  campaigns: Campaign[],
  stepsByCampaignId: ReadonlyMap<string, CampaignStep[]>
): Campaign[] {
  return campaigns.filter((c) => {
    if (c.type !== "linkedin" && c.type !== "mixed") return false;
    return linkedInStepsOf(stepsByCampaignId.get(c.id) ?? []).length > 0;
  });
}

export interface LinkedInExecutionSummary {
  /** All LinkedIn-channel execution records considered. */
  total: number;
  sent: number;
  skipped: number;
  failed: number;
  stopped: number;
  executed: number;
  simulated: number;
}

/** Outcome counts over LinkedIn-channel executions only. */
export function summarizeLinkedInExecutions(
  executions: StepExecutionRecord[]
): LinkedInExecutionSummary {
  const summary: LinkedInExecutionSummary = {
    total: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    stopped: 0,
    executed: 0,
    simulated: 0,
  };
  for (const x of executions) {
    if (x.channel !== "linkedin") continue;
    summary.total++;
    switch (x.status) {
      case "sent":
        summary.sent++;
        break;
      case "skipped":
        summary.skipped++;
        break;
      case "failed":
        summary.failed++;
        break;
      case "stopped":
        summary.stopped++;
        break;
      case "executed":
        summary.executed++;
        break;
      case "simulated":
        summary.simulated++;
        break;
      default:
        break; // in-flight claims etc. count toward the total only
    }
  }
  return summary;
}

export interface LinkedInActivityRow {
  id: string;
  stepType: string;
  stepTypeLabel: string;
  campaignId: string;
  campaignName: string;
  leadId: string;
  leadName: string;
  /** The executor's recorded outcome: sent / skipped / failed / … */
  status: StepExecutionRecord["status"];
  /** The recorded reason/detail, verbatim. */
  detail: string;
  createdAt: string;
  simulated: boolean;
}

function leadDisplayName(lead: Lead | undefined, leadId: string): string {
  if (!lead) return "Unknown lead";
  const name = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim();
  return name || lead.email || leadId;
}

/**
 * The activity list: LinkedIn-channel executions, newest first,
 * resolved against campaign/lead names. Records whose campaign or
 * lead was deleted still render (with honest fallbacks) — history
 * is not rewritten.
 */
export function buildLinkedInActivity(
  executions: StepExecutionRecord[],
  campaignsById: ReadonlyMap<string, Campaign>,
  leadsById: ReadonlyMap<string, Lead>,
  limit = 25
): LinkedInActivityRow[] {
  return executions
    .filter((x) => x.channel === "linkedin")
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, Math.max(0, limit))
    .map((x) => ({
      id: x.id,
      stepType: x.step_type,
      stepTypeLabel: linkedInStepTypeLabel(x.step_type),
      campaignId: x.campaign_id,
      campaignName: campaignsById.get(x.campaign_id)?.name ?? "Deleted campaign",
      leadId: x.lead_id,
      leadName: leadDisplayName(leadsById.get(x.lead_id), x.lead_id),
      status: x.status,
      detail: x.detail,
      createdAt: x.created_at,
      simulated: x.simulated,
    }));
}
