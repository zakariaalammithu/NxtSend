/**
 * Job producers — the enqueue side of the jobs system.
 *
 * follow_up_due design (Round-2 Stage F): the handler is a SCANNER,
 * not a per-enrollment job. One job per workspace per day is enough
 * because (a) the scan itself finds every due enrollment, (b) Vercel
 * Cron on the current plan fires the worker daily (see vercel.json +
 * PRODUCTION.md), and (c) per-enrollment at-most-once is guaranteed by
 * the executor's claim rows, not by job keys.
 *
 * The idempotency key is therefore bucketed by UTC date:
 * `followup-scan:<workspaceId>:<yyyy-mm-dd>`. Enqueueing is an
 * insert-ignore on the unique key — activating three campaigns in one
 * day still produces exactly one scan job, and the daily cron drain
 * executes it once. If a day's scan already completed, later same-day
 * activations are covered by the next day's scan (step delays are
 * measured in hours, and on the Hobby cron cadence that is the honest
 * scheduling granularity — documented in PRODUCTION.md).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export function followUpScanKey(workspaceId: string, date: Date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  return `followup-scan:${workspaceId}:${day}`;
}

/**
 * Enqueues today's follow_up_due scan for a workspace (service role).
 * Returns true when a new job row was created, false when today's
 * scan was already enqueued/completed.
 */
export async function enqueueFollowUpScan(
  admin: SupabaseClient,
  workspaceId: string,
  now: Date = new Date()
): Promise<boolean> {
  const { data, error } = await admin
    .from("jobs")
    .upsert(
      {
        workspace_id: workspaceId,
        type: "follow_up_due",
        payload: { source: "campaign_activation" },
        idempotency_key: followUpScanKey(workspaceId, now),
        status: "pending",
        run_after: now.toISOString(),
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true }
    )
    .select("id");
  if (error) {
    throw new Error(`Failed to enqueue follow_up_due scan: ${error.message}`);
  }
  return (data ?? []).length > 0;
}

/**
 * Daily webhook-retry jobs (Zapier + n8n).
 *
 * The 06:00 cron (POST /api/jobs/run) is the retry tick for both
 * platforms' outboxes — but until now nothing ever enqueued the
 * `zapier_webhook_retry` job rows (the handler existed, the
 * enqueue did not), so failed deliveries were only retried if a
 * job row happened to exist. These helpers enqueue one retry job
 * per platform per UTC day (idempotency-keyed, insert-ignore —
 * a repeated cron tick can never double-enqueue). The jobs/run
 * route calls enqueueDailyPlatformWebhookRetries on every live
 * tick before draining due jobs, so both platforms' failed
 * deliveries get their daily attempt. Latency honesty: a failed
 * delivery may wait up to ~24h for its next attempt.
 */

export function platformWebhookRetryKey(
  platform: "zapier" | "n8n",
  date: Date = new Date()
): string {
  const day = date.toISOString().slice(0, 10);
  return `${platform}-webhook-retry:${day}`;
}

/**
 * Enqueues today's `zapier_webhook_retry` and
 * `n8n_webhook_retry` jobs (service role). Returns, per
 * platform, true when a new job row was created, false when
 * today's job was already enqueued/completed.
 */
export async function enqueueDailyPlatformWebhookRetries(
  admin: SupabaseClient,
  now: Date = new Date()
): Promise<{ zapier: boolean; n8n: boolean }> {
  const out: { zapier: boolean; n8n: boolean } = { zapier: false, n8n: false };
  for (const platform of ["zapier", "n8n"] as const) {
    const { data, error } = await admin
      .from("jobs")
      .upsert(
        {
          workspace_id: null,
          type: `${platform}_webhook_retry`,
          payload: { source: "daily_cron" },
          idempotency_key: platformWebhookRetryKey(platform, now),
          status: "pending",
          run_after: now.toISOString(),
        },
        { onConflict: "idempotency_key", ignoreDuplicates: true }
      )
      .select("id");
    if (error) {
      throw new Error(`Failed to enqueue ${platform}_webhook_retry job: ${error.message}`);
    }
    out[platform] = (data ?? []).length > 0;
  }
  return out;
}
