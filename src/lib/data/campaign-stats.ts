/**
 * Campaign statistics — honest aggregates derived from real substrate.
 *
 * Every number in this module is computed from records that actually
 * exist in the data layer:
 *   - `campaign_enrollments`     → prospect + enrollment-state counts
 *   - inbox message history      → email sent/replied, LinkedIn replied
 *     (messages carry their campaign_id, channel, direction, status and
 *     provider/simulated classification — see message-history.ts)
 *   - `campaign_step_executions` → LinkedIn funnel + execution outcomes
 *     (migration 010; demo mode reads the same records from the demo
 *     executor store)
 *   - `email_events`             → opened/clicked/bounced/complained,
 *     via the Stage-D read path: the pure aggregator below for the
 *     counts shape, fed per campaign by the loader — in demo mode
 *     from SIMULATED events derived from demo message statuses, in
 *     live mode from GET /api/email/deliverability (service-role
 *     read, session-scoped). When no event source is available the
 *     loader passes `null` — the UI renders "—" rather than
 *     inventing a 0 that would claim "nobody opened anything".
 *
 * LinkedIn honesty rules (same as the executor's):
 *   - A LinkedIn step counts as "sent" ONLY when an execution record
 *     says so. Today every LinkedIn execution is recorded `skipped`
 *     (no authorized provider), so sent counts are a real 0.
 *   - "Accepted" has NO data source anywhere in the product, so it is
 *     always `null` (rendered "—"), never estimated.
 *   - `linkedinProviderConnected` is derived from the records: it is
 *     true only when a LinkedIn execution actually reached `sent`.
 */

import type { Campaign } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { DemoExecutorStore } from "@/lib/executor/demo-store";
import {
  aggregateEmailEvents,
  deriveSimulatedEmailData,
} from "@/lib/email/events-core";
import type { StepExecutionRecord } from "@/lib/executor/types";
import type { CampaignsRepository, EnrollmentRecord } from "./campaigns";
import type { InboxRepository } from "./inbox";
import type { LeadsRepository } from "./leads";
import { listMessageHistory, type HistoryMessage } from "./message-history";
import type { DataMode } from "./mode";

// ============================================================================
// Types
// ============================================================================

export interface EmailEventCounts {
  opened: number;
  clicked: number;
  /**
   * Distinct messages with a provider bounce / complaint event.
   * Optional in the counts shape: the legacy pure aggregator below
   * (countEmailEvents) predates them and reports opened/clicked
   * only; the Stage-D loader always supplies real values.
   */
  bounced?: number | null;
  complained?: number | null;
}

export interface LinkedInStats {
  /**
   * True only when the execution records prove a LinkedIn step was
   * actually sent (an authorized provider exists). False today by
   * design — every LinkedIn step is recorded `skipped`.
   */
  providerConnected: boolean;
  /** Connection-request executions with status `sent`. */
  connectionRequestsSent: number;
  /**
   * Accepted connections. No event source exists for this anywhere in
   * the product, so it is always null — the UI shows "—", not a guess.
   */
  accepted: number | null;
  /** LinkedIn-message executions with status `sent`. */
  messagesSent: number;
  /** Inbound LinkedIn messages recorded against the campaign. */
  replied: number;
  /** LinkedIn executions recorded `skipped` (no provider). */
  stepsSkipped: number;
}

export interface EmailStats {
  /** Outbound campaign emails with a positive recorded outcome. */
  sent: number;
  /** …of which provider-confirmed (provider message ID / delivered). */
  sentProviderConfirmed: number;
  /** …of which simulated (Demo Mode — never actually sent). */
  sentSimulated: number;
  /** Outbound attempts that failed or were blocked (suppressed). */
  failed: number;
  /** From email_events; null when the event log is not readable. */
  opened: number | null;
  clicked: number | null;
  /** Distinct bounced messages from email_events; null like opened. */
  bounced: number | null;
  /** Distinct complained messages from email_events; null like opened. */
  complained: number | null;
  /** Inbound email replies recorded against the campaign. */
  replied: number;
}

export interface ExecutionOutcomeStats {
  total: number;
  sent: number;
  simulated: number;
  skipped: number;
  stopped: number;
  executed: number;
  failed: number;
}

export interface CampaignStats {
  /** Campaign id, or null for a workspace-wide aggregate. */
  campaignId: string | null;
  /** Enrolled prospects (enrollment records). */
  prospects: number;
  enrollments: {
    total: number;
    /** status pending/active — sequence not finished. */
    inProgress: number;
    /** status completed — finished every step. */
    completed: number;
    /** status stopped/error — halted by a stop rule or an error. */
    stopped: number;
  };
  linkedin: LinkedInStats;
  email: EmailStats;
  /** Inbound replies across both channels. */
  repliesTotal: number;
  executions: ExecutionOutcomeStats;
}

export interface CampaignStatsSource {
  enrollments: EnrollmentRecord[];
  messages: HistoryMessage[];
  executions: StepExecutionRecord[];
  /**
   * Provider event counts PRE-SCOPED to the campaign being computed
   * (or to the workspace when campaignId is null), or null when no
   * event source is available. The loader builds one source per
   * campaign — see loadCampaignStats.
   */
  emailEvents: EmailEventCounts | null;
}

// ============================================================================
// Pure derivations (unit-tested)
// ============================================================================

/** Outbound email statuses that mean a send actually happened. */
const EMAIL_SENT_STATUSES = new Set([
  "sent",
  "delivered",
  "opened",
  "clicked",
  "simulated",
]);

/** Outbound email statuses that mean the attempt failed / was blocked. */
const EMAIL_FAILED_STATUSES = new Set(["failed", "suppressed", "error"]);

/**
 * Counts opened/clicked from raw provider webhook events, restricted
 * to the given provider message IDs (the campaign's own sends) and
 * de-duplicated by provider event id (the table itself is unique on
 * it; this keeps the pure function safe for any caller).
 */
export function countEmailEvents(
  events: Array<{
    provider_event_id: string;
    event_type: string;
    provider_message_id: string | null;
  }>,
  providerMessageIds: ReadonlySet<string>
): EmailEventCounts {
  const seen = new Set<string>();
  let opened = 0;
  let clicked = 0;
  for (const evt of events) {
    if (!evt.provider_message_id) continue;
    if (!providerMessageIds.has(evt.provider_message_id)) continue;
    if (seen.has(evt.provider_event_id)) continue;
    seen.add(evt.provider_event_id);
    if (evt.event_type === "email.opened") opened++;
    else if (evt.event_type === "email.clicked") clicked++;
  }
  return { opened, clicked };
}

/**
 * Derives the stats for ONE campaign (campaignId set) or for the whole
 * workspace (campaignId null → every record counts). Inputs may be
 * workspace-wide in both cases; scoping happens here.
 */
export function computeCampaignStats(
  campaignId: string | null,
  source: CampaignStatsSource
): CampaignStats {
  const inScope = (rowCampaignId: string | null | undefined): boolean =>
    campaignId === null || rowCampaignId === campaignId;

  const enrollments = source.enrollments.filter((e) =>
    inScope(e.campaign_id)
  );
  const messages = source.messages.filter((m) => inScope(m.campaign_id));
  const executions = source.executions.filter((x) => inScope(x.campaign_id));

  // ---- Enrollments -------------------------------------------------------
  let inProgress = 0;
  let completed = 0;
  let stopped = 0;
  for (const e of enrollments) {
    if (e.status === "pending" || e.status === "active") inProgress++;
    else if (e.status === "completed") completed++;
    else if (e.status === "stopped" || e.status === "error") stopped++;
  }

  // ---- Messages ----------------------------------------------------------
  let emailSent = 0;
  let emailSentProvider = 0;
  let emailSentSimulated = 0;
  let emailFailed = 0;
  let emailReplied = 0;
  let linkedinReplied = 0;
  for (const m of messages) {
    if (m.channel === "email") {
      if (m.direction === "inbound") {
        emailReplied++;
      } else if (EMAIL_FAILED_STATUSES.has(m.status)) {
        emailFailed++;
      } else if (EMAIL_SENT_STATUSES.has(m.status)) {
        emailSent++;
        if (m.verification === "provider") emailSentProvider++;
        else if (m.verification === "simulated") emailSentSimulated++;
      }
    } else if (m.channel === "linkedin" && m.direction === "inbound") {
      linkedinReplied++;
    }
  }

  // ---- Step executions ---------------------------------------------------
  let connectionRequestsSent = 0;
  let linkedinMessagesSent = 0;
  let linkedinSkipped = 0;
  let linkedinProviderConnected = false;
  const outcomes: ExecutionOutcomeStats = {
    total: executions.length,
    sent: 0,
    simulated: 0,
    skipped: 0,
    stopped: 0,
    executed: 0,
    failed: 0,
  };
  for (const x of executions) {
    switch (x.status) {
      case "sent":
        outcomes.sent++;
        break;
      case "simulated":
        outcomes.simulated++;
        break;
      case "skipped":
        outcomes.skipped++;
        break;
      case "stopped":
        outcomes.stopped++;
        break;
      case "executed":
        outcomes.executed++;
        break;
      case "failed":
        outcomes.failed++;
        break;
      default:
        break; // "sending" claims are in-flight, not outcomes
    }
    if (x.channel === "linkedin") {
      if (x.status === "skipped") linkedinSkipped++;
      if (x.status === "sent") {
        linkedinProviderConnected = true;
        if (x.step_type === "connection_request") connectionRequestsSent++;
        else if (x.step_type === "linkedin_message") linkedinMessagesSent++;
      }
    }
  }

  return {
    campaignId,
    prospects: enrollments.length,
    enrollments: {
      total: enrollments.length,
      inProgress,
      completed,
      stopped,
    },
    linkedin: {
      providerConnected: linkedinProviderConnected,
      connectionRequestsSent,
      accepted: null,
      messagesSent: linkedinMessagesSent,
      replied: linkedinReplied,
      stepsSkipped: linkedinSkipped,
    },
    email: {
      sent: emailSent,
      sentProviderConfirmed: emailSentProvider,
      sentSimulated: emailSentSimulated,
      failed: emailFailed,
      opened: source.emailEvents ? source.emailEvents.opened : null,
      clicked: source.emailEvents ? source.emailEvents.clicked : null,
      bounced: source.emailEvents ? (source.emailEvents.bounced ?? null) : null,
      complained: source.emailEvents
        ? (source.emailEvents.complained ?? null)
        : null,
      replied: emailReplied,
    },
    repliesTotal: emailReplied + linkedinReplied,
    executions: outcomes,
  };
}

/**
 * Sums per-campaign stats into one aggregate. `accepted` stays null
 * (no source). Opened/clicked sum the campaigns that have event data;
 * if none do, the aggregate stays null (unavailable).
 */
export function aggregateCampaignStats(
  all: CampaignStats[]
): CampaignStats {
  const sum = (pick: (s: CampaignStats) => number): number =>
    all.reduce((acc, s) => acc + pick(s), 0);
  const sumNullable = (
    pick: (s: CampaignStats) => number | null
  ): number | null => {
    let total: number | null = null;
    for (const s of all) {
      const v = pick(s);
      if (v !== null) total = (total ?? 0) + v;
    }
    return total;
  };

  return {
    campaignId: null,
    prospects: sum((s) => s.prospects),
    enrollments: {
      total: sum((s) => s.enrollments.total),
      inProgress: sum((s) => s.enrollments.inProgress),
      completed: sum((s) => s.enrollments.completed),
      stopped: sum((s) => s.enrollments.stopped),
    },
    linkedin: {
      providerConnected: all.some((s) => s.linkedin.providerConnected),
      connectionRequestsSent: sum((s) => s.linkedin.connectionRequestsSent),
      accepted: null,
      messagesSent: sum((s) => s.linkedin.messagesSent),
      replied: sum((s) => s.linkedin.replied),
      stepsSkipped: sum((s) => s.linkedin.stepsSkipped),
    },
    email: {
      sent: sum((s) => s.email.sent),
      sentProviderConfirmed: sum((s) => s.email.sentProviderConfirmed),
      sentSimulated: sum((s) => s.email.sentSimulated),
      failed: sum((s) => s.email.failed),
      opened: sumNullable((s) => s.email.opened),
      clicked: sumNullable((s) => s.email.clicked),
      bounced: sumNullable((s) => s.email.bounced),
      complained: sumNullable((s) => s.email.complained),
      replied: sum((s) => s.email.replied),
    },
    repliesTotal: sum((s) => s.repliesTotal),
    executions: {
      total: sum((s) => s.executions.total),
      sent: sum((s) => s.executions.sent),
      simulated: sum((s) => s.executions.simulated),
      skipped: sum((s) => s.executions.skipped),
      stopped: sum((s) => s.executions.stopped),
      executed: sum((s) => s.executions.executed),
      failed: sum((s) => s.executions.failed),
    },
  };
}

// ============================================================================
// Loader — gathers the substrate through the repositories
// ============================================================================

export interface CampaignStatsDeps {
  campaignsRepo: CampaignsRepository;
  inboxRepo: InboxRepository;
  leadsRepo: LeadsRepository;
  mode: DataMode;
}

function rowToExecution(row: Record<string, unknown>): StepExecutionRecord {
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
    account_id: (row.account_id as string | null) ?? null,
    message_id: (row.message_id as string | null) ?? null,
    provider: (row.provider as string | null) ?? null,
    provider_message_id: (row.provider_message_id as string | null) ?? null,
    idempotency_key: String(row.idempotency_key ?? ""),
    simulated: Boolean(row.simulated),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

/**
 * Step executions for the workspace. Demo Mode reads the demo executor
 * store (the same records the demo runner writes); live mode reads
 * `campaign_step_executions`, which migration 010 makes readable by
 * workspace members. Any failure degrades to "no executions readable"
 * — the stats then rest on enrollments + messages alone.
 */
async function loadExecutions(
  deps: CampaignStatsDeps,
  workspaceId: string,
  campaigns: Campaign[]
): Promise<StepExecutionRecord[]> {
  try {
    if (deps.mode === "demo") {
      const store = new DemoExecutorStore({
        campaigns: deps.campaignsRepo,
        leads: deps.leadsRepo,
        inbox: deps.inboxRepo,
      });
      const perCampaign = await Promise.all(
        campaigns.map((c) => store.listExecutions(c.id))
      );
      return perCampaign.flat();
    }
    const supabase = createClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("campaign_step_executions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) return [];
    return (data ?? []).map((r) => rowToExecution(r as Record<string, unknown>));
  } catch {
    return [];
  }
}

/**
 * Public wrapper over loadExecutions for surfaces that need the raw
 * execution records themselves (the LinkedIn page's activity view,
 * P5 Stage F) rather than aggregates. Same substrate, same
 * degrade-to-empty honesty.
 */
export async function loadCampaignExecutions(
  deps: CampaignStatsDeps,
  workspaceId: string,
  campaigns: Campaign[]
): Promise<StepExecutionRecord[]> {
  return loadExecutions(deps, workspaceId, campaigns);
}

/**
 * Per-campaign provider event counts (Stage D read path).
 *
 * - Demo mode: derived locally from the SIMULATED event set that the
 *   demo messages imply (events-core) — the same messages the stats
 *   are computed from, so the numbers always agree with this page.
 * - Live mode: fetched from GET /api/email/deliverability, the
 *   session-scoped service-role read over `email_events`. A failed
 *   fetch degrades to null (the UI shows "—"), never to invented 0s.
 *
 * A campaign is present in the map only when it has provider-linked
 * messages; absent campaigns get null counts (unavailable), while a
 * present campaign with zero opens gets a real 0.
 */
async function loadEmailEventCounts(
  deps: CampaignStatsDeps,
  workspaceId: string,
  campaigns: Campaign[],
  messages: HistoryMessage[]
): Promise<Map<string, EmailEventCounts> | null> {
  try {
    if (deps.mode === "demo") {
      const { events, links } = deriveSimulatedEmailData(messages);
      const linkedCampaigns = new Set(
        links.filter((l) => l.campaign_id).map((l) => l.campaign_id as string)
      );
      const map = new Map<string, EmailEventCounts>();
      for (const campaign of campaigns) {
        if (!linkedCampaigns.has(campaign.id)) continue;
        const agg = aggregateEmailEvents(events, links, {
          workspaceId,
          campaignId: campaign.id,
        });
        map.set(campaign.id, {
          opened: agg.counts.opened,
          clicked: agg.counts.clicked,
          bounced: agg.counts.bounced,
          complained: agg.counts.complained,
        });
      }
      return map;
    }

    if (typeof fetch !== "function") return null;
    const res = await fetch("/api/email/deliverability?days=3650", {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      perCampaign?: Array<{
        campaignId: string;
        counts: {
          opened: number;
          clicked: number;
          bounced: number;
          complained: number;
        };
      }>;
    };
    const map = new Map<string, EmailEventCounts>();
    for (const row of json.perCampaign ?? []) {
      map.set(row.campaignId, {
        opened: row.counts.opened,
        clicked: row.counts.clicked,
        bounced: row.counts.bounced,
        complained: row.counts.complained,
      });
    }
    return map;
  } catch {
    return null;
  }
}

/**
 * Loads stats for every given campaign plus the aggregate over exactly
 * those campaigns. Opened/clicked/bounced/complained come from the
 * Stage-D event read path (see loadEmailEventCounts); when it is
 * unavailable the per-campaign source carries null and the UI renders
 * "—" instead of an invented number.
 */
export async function loadCampaignStats(
  deps: CampaignStatsDeps,
  workspaceId: string,
  campaigns: Campaign[]
): Promise<{ byCampaign: Map<string, CampaignStats>; aggregate: CampaignStats }> {
  const [messages, executions, enrollmentLists] = await Promise.all([
    listMessageHistory(deps.inboxRepo, workspaceId, 1000),
    loadExecutions(deps, workspaceId, campaigns),
    Promise.all(campaigns.map((c) => deps.campaignsRepo.listEnrollments(c.id))),
  ]);
  const eventCounts = await loadEmailEventCounts(
    deps,
    workspaceId,
    campaigns,
    messages
  );

  const baseSource: Omit<CampaignStatsSource, "emailEvents"> = {
    enrollments: enrollmentLists.flat(),
    messages,
    executions,
  };

  const byCampaign = new Map<string, CampaignStats>();
  for (const campaign of campaigns) {
    byCampaign.set(
      campaign.id,
      computeCampaignStats(campaign.id, {
        ...baseSource,
        emailEvents: eventCounts?.get(campaign.id) ?? null,
      })
    );
  }
  return {
    byCampaign,
    aggregate: aggregateCampaignStats(Array.from(byCampaign.values())),
  };
}
