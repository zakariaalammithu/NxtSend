/**
 * Sequence executor — the decision engine.
 *
 * Pure helpers (channel mapping, due-time math, stop-rule evaluation)
 * plus `executeDueSteps`, the orchestrator that walks enrollments
 * against an injected ExecutorStore + EmailProviderAdapter.
 *
 * Per enrollment, at most ONE step is processed per scan (the next
 * step); pacing comes from each step's `delay_hours`, measured from
 * the previous step's execution (or from enrollment for step 1).
 *
 * Stop rules are evaluated BEFORE the step executes:
 *   - the lead replied (any inbound message at/after enrollment)
 *     → enrollment stops, reason "reply received";
 *   - the lead's email is suppressed (bounce / complaint / unsubscribe
 *     / manual) → enrollment stops. The email adapter independently
 *     re-checks suppression before any provider call and fails closed,
 *     so this is a second, earlier line of defence with better records.
 *
 * At-most-once: the store claims (enrollment, step_order) BEFORE any
 * send. Terminal outcomes keep the claim; transient ones (provider
 * error, not configured, plan limit) release it so the step stays due
 * for the next scan — those attempts are still recorded in the
 * campaign activity log and the run summary.
 */

import type { CampaignStep, Lead } from "@/types";
import { checkLimit } from "@/lib/billing/limits";
import { renderTemplate } from "@/lib/ai/prompt";
import type { EmailProviderAdapter } from "@/lib/email/types";
import { getEmailReplyTo } from "@/lib/email/state";
import {
  stepExecutionKey,
  emptyRunSummary,
  type ExecutorEnrollment,
  type ExecutorStore,
  type ExecutorRunSummary,
  type LeadSignals,
  type SenderIdentity,
  type StepChannel,
} from "./types";

// ── Pure helpers ────────────────────────────────────────────────────────────

export function stepChannel(step: Pick<CampaignStep, "step_type">): StepChannel {
  switch (step.step_type) {
    case "email":
      return "email";
    case "connection_request":
    case "linkedin_message":
    // Closely-style LinkedIn touch steps (migration 011): same
    // treatment as every LinkedIn step — recorded skipped, never sent.
    case "like_post":
    case "view_profile":
    case "endorse_skills":
      return "linkedin";
    default:
      return "none"; // wait / condition — time-based, no message
  }
}

/** When the enrollment's NEXT step becomes due. */
export function stepDueAt(
  enrollment: Pick<ExecutorEnrollment, "enrolled_at" | "last_step_at">,
  step: Pick<CampaignStep, "delay_hours">
): string {
  const base = enrollment.last_step_at ?? enrollment.enrolled_at;
  return new Date(
    new Date(base).getTime() + Math.max(0, step.delay_hours) * 3_600_000
  ).toISOString();
}

export function isStepDue(
  enrollment: Pick<ExecutorEnrollment, "enrolled_at" | "last_step_at">,
  step: Pick<CampaignStep, "delay_hours">,
  now: Date
): boolean {
  return new Date(stepDueAt(enrollment, step)).getTime() <= now.getTime();
}

export type StopDecision =
  | { reason: "reply"; detail: string }
  | { reason: "suppressed"; suppression: string; detail: string }
  | null;

export function evaluateStopRules(signals: LeadSignals): StopDecision {
  if (signals.repliedAt) {
    return {
      reason: "reply",
      detail: `Lead replied at ${signals.repliedAt}; sequence stopped before the next step.`,
    };
  }
  if (signals.suppressionReason) {
    const r = signals.suppressionReason.toLowerCase();
    const label = r.includes("unsub")
      ? "unsubscribed"
      : r.includes("complain")
        ? "complained (spam complaint)"
        : r.includes("bounce")
          ? "bounced"
          : `suppressed (${signals.suppressionReason})`;
    return {
      reason: "suppressed",
      suppression: signals.suppressionReason,
      detail: `Recipient is on the suppression list (${label}); sequence stopped and no email was sent.`,
    };
  }
  return null;
}

export function monthPeriodStartIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export function leadDisplayName(lead: Lead): string {
  const name = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim();
  return name || lead.email || "Prospect";
}

// ── Orchestrator ────────────────────────────────────────────────────────────

export interface ExecuteDueStepsDeps {
  store: ExecutorStore;
  adapter: EmailProviderAdapter;
  now?: Date;
  /** Max enrollments inspected per scan (worker-friendly bound). */
  limit?: number;
}

export async function executeDueSteps(
  deps: ExecuteDueStepsDeps,
  opts: { workspaceId: string | null }
): Promise<ExecutorRunSummary> {
  const { store, adapter } = deps;
  const now = deps.now ?? new Date();
  const nowIso = now.toISOString();
  const summary = emptyRunSummary();

  const enrollments = await store.listEnrollments(
    opts.workspaceId,
    deps.limit ?? 200
  );

  const stepsByCampaign = new Map<string, CampaignStep[]>();
  const campaignNames = new Map<string, string>();
  // Per-workspace monthly email usage, counted once and incremented
  // locally as this run sends — the plan limit can never be overshot
  // by a single scan.
  const usageByWorkspace = new Map<string, { plan: string; used: number; limit: number }>();
  const overLimitCampaigns = new Map<string, { workspaceId: string; name: string; deferred: number }>();
  // Sender identities ({my_*} variables) resolved once per campaign.
  const senderByCampaign = new Map<string, SenderIdentity | null>();

  for (const enrollment of enrollments) {
    summary.scanned++;
    const campaign = await store.getCampaign(
      enrollment.workspace_id,
      enrollment.campaign_id
    );
    if (!campaign || campaign.status !== "active") continue;
    campaignNames.set(campaign.id, campaign.name);
    const workspaceId = campaign.workspace_id;

    let steps = stepsByCampaign.get(campaign.id);
    if (!steps) {
      steps = (await store.getSteps(campaign.id)).slice().sort(
        (a, b) => a.step_order - b.step_order
      );
      stepsByCampaign.set(campaign.id, steps);
    }
    if (steps.length === 0) continue;

    if (enrollment.current_step >= steps.length) {
      await store.updateEnrollment(enrollment.id, { status: "completed" });
      summary.completedEnrollments++;
      continue;
    }

    const step = steps[enrollment.current_step];
    if (!isStepDue(enrollment, step, now)) continue;
    summary.due++;

    const lead = await store.getLead(workspaceId, enrollment.lead_id);
    if (!lead) {
      // The lead row vanished (deleted after enrollment): stop with a
      // recorded reason instead of looping forever.
      const claim = await store.claimStepExecution({
        workspace_id: workspaceId,
        campaign_id: campaign.id,
        enrollment_id: enrollment.id,
        lead_id: enrollment.lead_id,
        step_order: step.step_order,
        step_type: step.step_type,
        channel: stepChannel(step),
        idempotency_key: stepExecutionKey(enrollment.id, step.step_order),
        simulated: store.simulated,
      });
      if (!claim) {
        summary.alreadyClaimed++;
        continue;
      }
      await store.completeStepExecution(claim.id, {
        status: "stopped",
        detail: "Lead no longer exists; enrollment stopped.",
      });
      await store.updateEnrollment(enrollment.id, { status: "stopped" });
      summary.stoppedMissingLead++;
      await store.appendActivity(workspaceId, {
        campaign_id: campaign.id,
        action: "enrollment_stopped",
        details: `Enrollment stopped before step ${step.step_order}: the lead no longer exists.`,
      });
      continue;
    }

    // ── Stop rules ──────────────────────────────────────────────────
    const signals = await store.getLeadSignals(workspaceId, lead, enrollment.enrolled_at);
    const stop = evaluateStopRules(signals);
    if (stop) {
      const claim = await store.claimStepExecution({
        workspace_id: workspaceId,
        campaign_id: campaign.id,
        enrollment_id: enrollment.id,
        lead_id: lead.id,
        step_order: step.step_order,
        step_type: step.step_type,
        channel: stepChannel(step),
        idempotency_key: stepExecutionKey(enrollment.id, step.step_order),
        simulated: store.simulated,
      });
      if (!claim) {
        summary.alreadyClaimed++;
        continue;
      }
      await store.completeStepExecution(claim.id, {
        status: "stopped",
        detail: stop.detail,
      });
      await store.updateEnrollment(enrollment.id, { status: "stopped" });
      if (stop.reason === "reply") summary.stoppedReply++;
      else summary.stoppedSuppression++;
      await store.appendActivity(workspaceId, {
        campaign_id: campaign.id,
        action: "enrollment_stopped",
        details: `${leadDisplayName(lead)}: ${stop.detail}`,
      });
      continue;
    }

    const channel = stepChannel(step);

    // ── Wait / condition steps: time passing IS the execution ──────
    if (channel === "none") {
      const claim = await store.claimStepExecution({
        workspace_id: workspaceId,
        campaign_id: campaign.id,
        enrollment_id: enrollment.id,
        lead_id: lead.id,
        step_order: step.step_order,
        step_type: step.step_type,
        channel,
        idempotency_key: stepExecutionKey(enrollment.id, step.step_order),
        simulated: store.simulated,
      });
      if (!claim) {
        summary.alreadyClaimed++;
        continue;
      }
      await store.completeStepExecution(claim.id, {
        status: "executed",
        detail:
          step.step_type === "condition"
            ? "Condition step elapsed. (Step conditions beyond the executor's stop rules are not evaluated in this version.)"
            : `Wait step elapsed (${step.delay_hours}h).`,
      });
      await advance(store, enrollment, steps.length, nowIso, summary);
      summary.waitsExecuted++;
      continue;
    }

    // ── LinkedIn steps: never sent, never simulated-as-sent ────────
    // PROVIDER SEAM (P5 Stage F): this branch is where an approved
    // LinkedIn provider plugs in. When createLinkedInAdapter()
    // (src/lib/linkedin) returns a real vendor adapter whose state
    // is "connected", LinkedIn steps dispatch through it here —
    // sendConnectionRequest / sendMessage — and the execution is
    // recorded with the provider's outcome + provider message id
    // (the duplicate-prevention key, alongside the claim below).
    // While the adapter is the NotConfigured implementation (the
    // only one today), behavior is exactly what follows: the step is
    // claimed once (at-most-once) and recorded `skipped` with the
    // reason — never sent, never simulated as sent.
    if (channel === "linkedin") {
      const claim = await store.claimStepExecution({
        workspace_id: workspaceId,
        campaign_id: campaign.id,
        enrollment_id: enrollment.id,
        lead_id: lead.id,
        step_order: step.step_order,
        step_type: step.step_type,
        channel,
        idempotency_key: stepExecutionKey(enrollment.id, step.step_order),
        simulated: store.simulated,
      });
      if (!claim) {
        summary.alreadyClaimed++;
        continue;
      }
      await store.completeStepExecution(claim.id, {
        status: "skipped",
        detail:
          "Skipped: no authorized LinkedIn provider is integrated, so this step cannot be executed. It was NOT sent and is not simulated as sent.",
      });
      await store.appendActivity(workspaceId, {
        campaign_id: campaign.id,
        action: "step_skipped",
        details: `Step ${step.step_order} (${step.step_type}) for ${leadDisplayName(lead)} skipped: no authorized LinkedIn provider.`,
      });
      await advance(store, enrollment, steps.length, nowIso, summary);
      summary.skippedLinkedIn++;
      continue;
    }

    // ── Email steps ─────────────────────────────────────────────────
    const recipient = (lead.email ?? "").trim().toLowerCase();
    if (!recipient) {
      const claim = await store.claimStepExecution({
        workspace_id: workspaceId,
        campaign_id: campaign.id,
        enrollment_id: enrollment.id,
        lead_id: lead.id,
        step_order: step.step_order,
        step_type: step.step_type,
        channel,
        idempotency_key: stepExecutionKey(enrollment.id, step.step_order),
        simulated: store.simulated,
      });
      if (!claim) {
        summary.alreadyClaimed++;
        continue;
      }
      await store.completeStepExecution(claim.id, {
        status: "skipped",
        detail: "Lead has no email address; email step skipped.",
      });
      await advance(store, enrollment, steps.length, nowIso, summary);
      summary.skippedNoEmail++;
      continue;
    }

    // Plan sending limit — checked BEFORE claiming so the step stays
    // due for a later scan (e.g. next month or after a plan upgrade).
    let usage = usageByWorkspace.get(workspaceId);
    if (!usage) {
      const plan = await store.getWorkspacePlan(workspaceId);
      const used = await store.countEmailsThisMonth(
        workspaceId,
        monthPeriodStartIso(now)
      );
      const check = checkLimit(plan, "emailsPerMonth", used);
      usage = { plan, used, limit: check.limit };
      usageByWorkspace.set(workspaceId, usage);
    }
    if (usage.used >= usage.limit) {
      summary.overLimit++;
      const entry = overLimitCampaigns.get(campaign.id) ?? {
        workspaceId,
        name: campaign.name,
        deferred: 0,
      };
      entry.deferred++;
      overLimitCampaigns.set(campaign.id, entry);
      continue;
    }

    // Claim BEFORE sending — the at-most-once guard.
    const claim = await store.claimStepExecution({
      workspace_id: workspaceId,
      campaign_id: campaign.id,
      enrollment_id: enrollment.id,
      lead_id: lead.id,
      step_order: step.step_order,
      step_type: step.step_type,
      channel,
      idempotency_key: stepExecutionKey(enrollment.id, step.step_order),
      simulated: store.simulated,
    });
    if (!claim) {
      summary.alreadyClaimed++;
      continue;
    }

    // Sender ("my_*") variables resolve from the campaign's connected
    // email account when the store can provide it (accounts model,
    // migration 011); otherwise they render their {my_*:fallback}.
    let sender = senderByCampaign.get(campaign.id);
    if (sender === undefined) {
      sender = store.getSenderIdentity
        ? await store
            .getSenderIdentity(workspaceId, campaign.id, "email")
            .catch(() => null)
        : null;
      senderByCampaign.set(campaign.id, sender);
    }
    const vars = {
      firstName: lead.first_name,
      lastName: lead.last_name,
      company: lead.company,
      jobTitle: lead.job_title,
      myFirstName: sender?.firstName,
      myLastName: sender?.lastName,
      myJobTitle: sender?.jobTitle,
      myCompanyName: sender?.companyName,
      // Custom fields (e.g. extra CSV columns) resolve {{custom_name}}
      // variables.
      customFields: lead.custom_fields ?? {},
    };
    const subject = renderTemplate(step.subject ?? "", vars);
    const content = renderTemplate(step.content ?? "", vars);

    const result = await adapter.sendEmail({
      workspaceId,
      to: recipient,
      subject,
      text: content,
      // Reply routing (P5 Stage C): when EMAIL_REPLY_TO is set,
      // replies land on the receiving domain and reach the Inbox;
      // unset keeps the previous behaviour (replies to EMAIL_FROM).
      replyTo: getEmailReplyTo(),
      leadId: lead.id,
      campaignId: campaign.id,
    });

    if (result.status === "sent" || result.status === "simulated") {
      const conversationId = await store.ensureConversation(workspaceId, {
        lead_id: lead.id,
        channel: "email",
        contact_name: leadDisplayName(lead),
        contact_email: recipient,
        company: lead.company ?? null,
        subject: subject || null,
      });
      const message = await store.insertMessage({
        workspace_id: workspaceId,
        conversation_id: conversationId,
        lead_id: lead.id,
        campaign_id: campaign.id,
        channel: "email",
        direction: "outbound",
        subject,
        content,
        status: result.status === "sent" ? "sent" : "simulated",
        is_demo: store.simulated,
        provider: result.provider,
        provider_message_id: result.providerMessageId,
        idempotency_key: stepExecutionKey(enrollment.id, step.step_order),
        sent_at: nowIso,
      });
      await store.completeStepExecution(claim.id, {
        status: result.status === "sent" ? "sent" : "simulated",
        detail: result.message,
        message_id: message.id,
        provider: result.provider,
        provider_message_id: result.providerMessageId,
      });
      usage.used++;
      if (result.status === "sent") summary.sent++;
      else summary.simulated++;
      await store.appendActivity(workspaceId, {
        campaign_id: campaign.id,
        action: result.status === "sent" ? "step_sent" : "step_simulated",
        details:
          result.status === "sent"
            ? `Step ${step.step_order} email sent to ${recipient} (provider message ID ${result.providerMessageId}).`
            : `Step ${step.step_order} email to ${recipient} simulated in Demo Mode — not actually sent.`,
      });
      await advance(store, enrollment, steps.length, nowIso, summary);
      continue;
    }

    if (result.status === "suppressed") {
      // The adapter's own fail-closed check caught a suppression the
      // signal query missed (e.g. added mid-run). Terminal: stop.
      const conversationId = await store.ensureConversation(workspaceId, {
        lead_id: lead.id,
        channel: "email",
        contact_name: leadDisplayName(lead),
        contact_email: recipient,
        company: lead.company ?? null,
        subject: subject || null,
      });
      const message = await store.insertMessage({
        workspace_id: workspaceId,
        conversation_id: conversationId,
        lead_id: lead.id,
        campaign_id: campaign.id,
        channel: "email",
        direction: "outbound",
        subject,
        content,
        status: "suppressed",
        is_demo: store.simulated,
        provider: result.provider,
        error: result.message,
        idempotency_key: stepExecutionKey(enrollment.id, step.step_order),
        sent_at: nowIso,
      });
      await store.completeStepExecution(claim.id, {
        status: "stopped",
        detail: result.message,
        message_id: message.id,
        provider: result.provider,
      });
      await store.updateEnrollment(enrollment.id, { status: "stopped" });
      summary.stoppedSuppression++;
      await store.appendActivity(workspaceId, {
        campaign_id: campaign.id,
        action: "enrollment_stopped",
        details: `${leadDisplayName(lead)}: ${result.message}`,
      });
      continue;
    }

    // not_configured / error — transient. Release the claim so the
    // step stays due; the attempt is recorded in the activity log.
    await store.releaseStepExecution(claim.id);
    summary.errors++;
    summary.log.push(
      `Step ${step.step_order} for ${recipient} not sent (${result.status}): ${result.message}`
    );
    await store.appendActivity(workspaceId, {
      campaign_id: campaign.id,
      action: "step_send_failed",
      details: `Step ${step.step_order} email to ${recipient} was NOT sent (${result.status}): ${result.message} The step remains due and will be retried by a later scan.`,
    });
  }

  // One aggregated activity entry per campaign for limit deferrals.
  for (const [campaignId, entry] of Array.from(overLimitCampaigns.entries())) {
    const usage = usageByWorkspace.get(entry.workspaceId);
    await store.appendActivity(entry.workspaceId, {
      campaign_id: campaignId,
      action: "step_deferred_limit",
      details: `${entry.deferred} due email send(s) deferred: the workspace reached its plan email limit (${usage?.used ?? "?"} / ${usage?.limit ?? "?"} this month, plan ${usage?.plan ?? "unknown"}). Nothing was sent; the steps remain due.`,
    });
    summary.log.push(
      `Campaign "${entry.name}": ${entry.deferred} send(s) deferred — plan email limit reached.`
    );
  }

  summary.log.push(
    `Scanned ${summary.scanned} enrollment(s): ${summary.sent} sent, ${summary.simulated} simulated, ${summary.skippedLinkedIn} LinkedIn skipped, ${summary.waitsExecuted} wait/condition executed, ${summary.stoppedReply + summary.stoppedSuppression + summary.stoppedMissingLead} stopped, ${summary.overLimit} over-limit deferred, ${summary.errors} transient error(s).`
  );
  return summary;
}

async function advance(
  store: ExecutorStore,
  enrollment: ExecutorEnrollment,
  totalSteps: number,
  nowIso: string,
  summary: ExecutorRunSummary
): Promise<void> {
  const next = enrollment.current_step + 1;
  const completed = next >= totalSteps;
  await store.updateEnrollment(enrollment.id, {
    current_step: next,
    last_step_at: nowIso,
    status: completed ? "completed" : "active",
  });
  if (completed) summary.completedEnrollments++;
}
