/**
 * Supabase implementation of WebhookDeliveryStore (service role) +
 * workspace webhook-config access against the `integrations` table.
 *
 * Writes are service-role only (migration 004 gives webhook_deliveries
 * no client write policies); config reads/writes additionally require
 * the caller to be a workspace owner/admin — enforced in the route via
 * workspace_members, on top of migration 002's table-level restriction.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseWebhookConfig, type WebhookConfig } from "./config";
import type { WebhookDelivery, WebhookDeliveryStore } from "./dispatch";
import type { WebhookEnvelope } from "./events";

function rowToDelivery(row: Record<string, unknown>): WebhookDelivery {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    event_type: String(row.event_type),
    payload: row.payload as WebhookEnvelope,
    target_url: String(row.target_url),
    status: row.status as WebhookDelivery["status"],
    attempts: Number(row.attempts ?? 0),
    max_attempts: Number(row.max_attempts ?? 3),
    last_error: (row.last_error as string | null) ?? null,
    next_retry_at: (row.next_retry_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function createSupabaseWebhookStore(
  admin: SupabaseClient
): WebhookDeliveryStore {
  return {
    async createDelivery(row) {
      const { data, error } = await admin
        .from("webhook_deliveries")
        .insert({
          workspace_id: row.workspace_id,
          event_type: row.event_type,
          payload: row.payload as unknown as Record<string, unknown>,
          target_url: row.target_url,
          status: row.status,
          attempts: row.attempts,
          max_attempts: row.max_attempts,
          last_error: row.last_error,
          next_retry_at: row.next_retry_at,
        })
        .select("*")
        .single();
      if (error || !data) {
        throw new Error(`Failed to record webhook delivery: ${error?.message ?? "no row"}`);
      }
      return rowToDelivery(data as Record<string, unknown>);
    },
    async updateDelivery(id, patch) {
      const { error } = await admin
        .from("webhook_deliveries")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) {
        throw new Error(`Failed to update webhook delivery: ${error.message}`);
      }
    },
    async getDelivery(id) {
      const { data } = await admin
        .from("webhook_deliveries")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      return data ? rowToDelivery(data as Record<string, unknown>) : null;
    },
    async listDeliveries(workspaceId, limit = 20) {
      const { data } = await admin
        .from("webhook_deliveries")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(limit);
      return (data ?? []).map((r) => rowToDelivery(r as Record<string, unknown>));
    },
    async listDueRetries(nowIso, limit = 25) {
      const { data } = await admin
        .from("webhook_deliveries")
        .select("*")
        .eq("status", "failed")
        .not("next_retry_at", "is", null)
        .lte("next_retry_at", nowIso)
        .order("next_retry_at", { ascending: true })
        .limit(limit);
      return (data ?? [])
        .map((r) => rowToDelivery(r as Record<string, unknown>))
        .filter((d) => d.attempts < d.max_attempts);
    },
  };
}

export async function getWorkspaceWebhookConfig(
  admin: SupabaseClient,
  workspaceId: string
): Promise<WebhookConfig | null> {
  const { data } = await admin
    .from("integrations")
    .select("config")
    .eq("workspace_id", workspaceId)
    .eq("provider", "webhooks")
    .maybeSingle();
  return parseWebhookConfig(data?.config ?? null);
}

export async function saveWorkspaceWebhookConfig(
  admin: SupabaseClient,
  workspaceId: string,
  config: WebhookConfig
): Promise<void> {
  const { error } = await admin.from("integrations").upsert(
    {
      workspace_id: workspaceId,
      provider: "webhooks",
      status: config.enabled ? "connected" : "disconnected",
      config: config as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id,provider" }
  );
  if (error) {
    throw new Error(`Failed to save webhook config: ${error.message}`);
  }
}
