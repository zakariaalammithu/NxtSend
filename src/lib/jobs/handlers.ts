/**
 * Job handlers.
 *
 *   usage_rollup   — REAL: recomputes per-workspace usage for the
 *                    current month from the database, upserts
 *                    usage_records, and flags over-limit metrics in the
 *                    run log via the billing limit helpers.
 *   webhook_retry  — REAL: re-attempts due failed webhook deliveries
 *                    through the same signed dispatch path.
 *   zapier_webhook_retry — REAL: re-attempts due failed Zapier
 *                    REST Hook deliveries (migration 025 outbox)
 *                    and removes subscriptions inactive > 30 days.
 *   n8n_webhook_retry    — REAL: the same, for n8n webhook
 *                    deliveries (migration 029 platform column).
 *                    Both share one factory (platformWebhookRetry)
 *                    over the platform-parameterised context
 *                    methods; Zapier falls back to its legacy
 *                    context methods when the platform methods
 *                    are absent.
 *   follow_up_due  — REAL (Round-2 Stage F): runs the sequence
 *                    executor (src/lib/executor) over due enrollments.
 *                    Email steps go through the email adapter
 *                    (suppression-checked, provider-confirmed);
 *                    LinkedIn steps are recorded as skipped (no
 *                    authorized provider); stop rules halt enrollments
 *                    on reply/bounce/unsubscribe. When the context
 *                    provides no executor (Demo Mode server context —
 *                    demo data lives in the browser store), the
 *                    handler records an honest "skipped" outcome and
 *                    sends NOTHING.
 */

import { checkLimit, type UsageMetric } from "@/lib/billing/limits";
import { executeDueSteps } from "@/lib/executor/core";
import type { PlanType } from "@/types";
import type { JobHandler, JobsContext } from "./types";

export function monthPeriodStart(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

const usageRollup: JobHandler = async (job, ctx: JobsContext) => {
  const now = new Date();
  const periodStart = monthPeriodStart(now);
  const periodStartIso = `${periodStart}T00:00:00.000Z`;
  const workspaces = job.workspace_id ? [job.workspace_id] : await ctx.listWorkspaces();
  const metrics: Array<"leads" | "campaigns" | "emailsPerMonth"> = [
    "leads",
    "campaigns",
    "emailsPerMonth",
  ];
  const overLimit: string[] = [];
  let rolled = 0;

  for (const workspaceId of workspaces) {
    const plan = (await ctx.getWorkspacePlan(workspaceId)) as PlanType;
    for (const metric of metrics) {
      const count = await ctx.countWorkspaceMetric(workspaceId, metric, periodStartIso);
      await ctx.upsertUsageRecord(workspaceId, metric, periodStart, count);
      rolled++;
      const check = checkLimit(plan, metric as UsageMetric, count);
      if (!check.allowed) {
        overLimit.push(`${workspaceId}:${metric}=${count}/${check.limit} (${plan})`);
      }
    }
  }

  return {
    status: "completed",
    message:
      `Usage rollup for ${periodStart}: ${rolled} metric(s) across ${workspaces.length} workspace(s).` +
      (overLimit.length > 0
        ? ` Over plan limit: ${overLimit.join(", ")}.`
        : " No workspace is over its plan limit."),
  };
};

const webhookRetry: JobHandler = async (_job, ctx: JobsContext) => {
  const due = await ctx.listDueWebhookRetries(new Date().toISOString());
  let delivered = 0;
  let stillFailing = 0;
  let noConfig = 0;
  for (const delivery of due) {
    const result = await ctx.retryWebhookDelivery(delivery.id);
    if (result.status === "delivered") delivered++;
    else if (result.status === "no_config") noConfig++;
    else stillFailing++;
  }
  return {
    status: "completed",
    message: `Webhook retries: ${due.length} due — ${delivered} delivered, ${stillFailing} still failing, ${noConfig} without a subscription (left as-is).`,
  };
};

/**
 * Platform webhook outbox retries (migration 025 + 029). One
 * factory serves both platforms: re-attempts due failed
 * deliveries through the same signed attempt path, then deletes
 * subscriptions inactive for over 30 days. Dead-letter rows are
 * kept for inspection — they are never deleted here. Latency
 * honesty: this job runs on the daily 06:00 cron, so a failed
 * delivery may wait up to ~24h for its next attempt.
 *
 * Platform methods are preferred; for Zapier the legacy
 * Zapier-specific context methods are the fallback (contexts
 * written before the platform methods existed). n8n has no
 * legacy methods — a context without the platform methods
 * records an honest "skipped" outcome.
 */
function platformWebhookRetry(
  platform: "zapier" | "n8n",
  label: string
): JobHandler {
  return async (_job, ctx: JobsContext) => {
    const nowIso = new Date().toISOString();
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    let due: Array<{ id: string }> = [];
    let delivered = 0;
    let stillFailing = 0;
    let dead = 0;
    let cleaned = 0;
    if (ctx.listDuePlatformRetries && ctx.retryPlatformDelivery) {
      due = await ctx.listDuePlatformRetries(platform, nowIso);
      for (const delivery of due) {
        const result = await ctx.retryPlatformDelivery(platform, delivery.id);
        if (result.status === "delivered") delivered++;
        else if (result.status === "dead") dead++;
        else stillFailing++;
      }
      if (ctx.cleanupStalePlatformSubscriptions) {
        cleaned = await ctx.cleanupStalePlatformSubscriptions(platform, cutoff);
      }
    } else if (
      platform === "zapier" &&
      ctx.listDueZapierRetries &&
      ctx.retryZapierDelivery
    ) {
      // Legacy Zapier-only context (no platform methods).
      due = await ctx.listDueZapierRetries(nowIso);
      for (const delivery of due) {
        const result = await ctx.retryZapierDelivery(delivery.id);
        if (result.status === "delivered") delivered++;
        else if (result.status === "dead") dead++;
        else stillFailing++;
      }
      if (ctx.cleanupStaleZapierSubscriptions) {
        cleaned = await ctx.cleanupStaleZapierSubscriptions(cutoff);
      }
    } else {
      return {
        status: "skipped",
        message:
          `${label} outbox is not available in this worker context (no ${label} store). Nothing was retried.`,
      };
    }
    return {
      status: "completed",
      message: `${label} webhook retries: ${due.length} due — ${delivered} delivered, ${stillFailing} still failing, ${dead} dead. ${cleaned} stale inactive subscription(s) removed.`,
    };
  };
}

const zapierWebhookRetry: JobHandler = platformWebhookRetry("zapier", "Zapier");

const n8nWebhookRetry: JobHandler = platformWebhookRetry("n8n", "n8n");

const followUpDue: JobHandler = async (job, ctx: JobsContext) => {
  const executor = ctx.getSequenceExecutor?.() ?? null;
  if (!executor) {
    return {
      status: "skipped",
      message:
        "Sequence executor is not available in this worker context (Demo Mode keeps its data in the browser demo store, which a server worker cannot read — use the in-app demo runner on a campaign page). Nothing was sent.",
    };
  }
  const summary = await executeDueSteps(
    {
      store: executor.store,
      adapter: executor.adapter,
      resolveVoiceAttachment: executor.resolveVoiceAttachment,
    },
    { workspaceId: job.workspace_id ?? null }
  );
  return {
    status: "completed",
    message:
      `Sequence scan${job.workspace_id ? ` for workspace ${job.workspace_id}` : " (all workspaces)"}: ` +
      summary.log[summary.log.length - 1],
  };
};

export function createJobHandlers(): Record<string, JobHandler> {
  return {
    usage_rollup: usageRollup,
    webhook_retry: webhookRetry,
    zapier_webhook_retry: zapierWebhookRetry,
    n8n_webhook_retry: n8nWebhookRetry,
    follow_up_due: followUpDue,
  };
}
