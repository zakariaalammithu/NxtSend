/**
 * Integration usage ledger — writes to the migration-030
 * `integration_usage` table (provider, event, credits_used).
 *
 * Adapters never touch Supabase directly: they receive a
 * `UsageRecorder` (event name + credits) and call it after each
 * billable provider call. The recorder is what knows the table.
 * Tests pass a collecting recorder; production passes the
 * Supabase-backed one built here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Records one billable provider event. Never throws for a missing table. */
export type UsageRecorder = (event: string, creditsUsed: number) => Promise<void>;

export function createNoopUsageRecorder(): UsageRecorder {
  return async () => {};
}

/**
 * Supabase-backed recorder over `integration_usage` (migration 030).
 * `admin` must be the service-role client — the table has RLS
 * enabled with zero policies (service-role only).
 */
export function createSupabaseUsageRecorder(
  admin: SupabaseClient,
  workspaceId: string,
  provider: string
): UsageRecorder {
  return async (event: string, creditsUsed: number) => {
    const { error } = await admin.from("integration_usage").insert({
      workspace_id: workspaceId,
      provider,
      event,
      credits_used: creditsUsed,
    });
    if (error) {
      throw new Error(`Failed to record ${provider} usage (${event}): ${error.message}`);
    }
  };
}
