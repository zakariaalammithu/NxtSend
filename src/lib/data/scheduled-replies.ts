/**
 * Scheduled-replies repository — inbox replies queued for a future
 * time. Scheduling stores a row and sends NOTHING immediately; a
 * worker (POST /api/jobs/run daily hook, or the guarded
 * /api/cron/scheduled-replies route) sends due rows through the
 * existing sendInboxReply path, and the row moves
 * scheduled -> sent | simulated | failed, or cancelled by the owner.
 *
 * One interface, two backends (same pattern as src/lib/data/leads.ts):
 * - Supabase backend (mode "supabase"): the `scheduled_replies` table
 *   (migration 022) through the client, workspace-scoped, with RLS
 *   (`is_workspace_member`) enforcing tenant isolation again. The
 *   server worker passes the service-role client, which bypasses RLS.
 * - Demo backend (mode "demo"): persisted through the localStorage
 *   demo store. Demo rows are never actually sent: the Inbox page
 *   marks due demo rows `simulated` when it loads them (the server
 *   worker cannot read the browser demo store).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { generateId } from "@/lib/utils";
import { getDataMode, type DataMode } from "./mode";
import { loadDemoCollection, saveDemoCollection } from "./demo-store";

export const DEMO_SCHEDULED_REPLIES_KEY = "nxtsend_demo_scheduled_replies_v1";

export type ScheduledReplyStatus =
  | "scheduled"
  | "sent"
  | "simulated"
  | "failed"
  | "cancelled";

export interface ScheduledReply {
  id: string;
  workspace_id: string;
  conversation_id: string;
  body: string;
  scheduled_at: string;
  status: ScheduledReplyStatus;
  created_at: string;
}

export interface ScheduleReplyInput {
  conversation_id: string;
  body: string;
  /** ISO timestamp the reply becomes due. */
  scheduled_at: string;
}

export interface ScheduledRepliesRepository {
  readonly mode: DataMode;
  /** Stores a reply for later. Sends nothing. */
  schedule(
    workspaceId: string,
    input: ScheduleReplyInput
  ): Promise<ScheduledReply>;
  /** Still-queued rows for a workspace, earliest due first. */
  listUpcoming(workspaceId: string): Promise<ScheduledReply[]>;
  /** Due rows (status scheduled, scheduled_at <= now), earliest first. */
  listDue(nowIso: string): Promise<ScheduledReply[]>;
  /** Owner cancels a queued reply; it will never be sent. */
  cancel(id: string): Promise<ScheduledReply>;
  markStatus(id: string, status: ScheduledReplyStatus): Promise<ScheduledReply>;
  markSent(id: string): Promise<ScheduledReply>;
  markSimulated(id: string): Promise<ScheduledReply>;
  markFailed(id: string): Promise<ScheduledReply>;
}

function normalizeScheduleInput(input: ScheduleReplyInput): {
  conversation_id: string;
  body: string;
  scheduled_at: string;
} {
  const body = input.body.trim().slice(0, 10000);
  if (!body) throw new Error("A scheduled reply needs a message body.");
  if (!input.conversation_id?.trim()) {
    throw new Error("A scheduled reply needs a conversation.");
  }
  const at = new Date(input.scheduled_at);
  if (Number.isNaN(at.getTime())) {
    throw new Error("A scheduled reply needs a valid date and time.");
  }
  return {
    conversation_id: input.conversation_id.trim(),
    body,
    scheduled_at: at.toISOString(),
  };
}

// ============================================================================
// Demo backend
// ============================================================================

class DemoScheduledRepliesRepository implements ScheduledRepliesRepository {
  readonly mode: DataMode = "demo";

  private load(): ScheduledReply[] {
    return loadDemoCollection<ScheduledReply>(DEMO_SCHEDULED_REPLIES_KEY, () => []);
  }

  private save(items: ScheduledReply[]): void {
    saveDemoCollection(DEMO_SCHEDULED_REPLIES_KEY, items);
  }

  async schedule(
    workspaceId: string,
    input: ScheduleReplyInput
  ): Promise<ScheduledReply> {
    const normalized = normalizeScheduleInput(input);
    const row: ScheduledReply = {
      id: `sched_demo_${generateId()}`,
      workspace_id: workspaceId,
      ...normalized,
      status: "scheduled",
      created_at: new Date().toISOString(),
    };
    const items = this.load();
    items.push(row);
    this.save(items);
    return row;
  }

  async listUpcoming(workspaceId: string): Promise<ScheduledReply[]> {
    return this.load()
      .filter((r) => r.workspace_id === workspaceId && r.status === "scheduled")
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  }

  async listDue(nowIso: string): Promise<ScheduledReply[]> {
    return this.load()
      .filter((r) => r.status === "scheduled" && r.scheduled_at <= nowIso)
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  }

  async cancel(id: string): Promise<ScheduledReply> {
    return this.markStatus(id, "cancelled");
  }

  async markStatus(id: string, status: ScheduledReplyStatus): Promise<ScheduledReply> {
    const items = this.load();
    const idx = items.findIndex((r) => r.id === id);
    if (idx < 0) throw new Error(`Scheduled reply not found: ${id}`);
    items[idx] = { ...items[idx], status };
    this.save(items);
    return items[idx];
  }

  async markSent(id: string): Promise<ScheduledReply> {
    return this.markStatus(id, "sent");
  }

  async markSimulated(id: string): Promise<ScheduledReply> {
    return this.markStatus(id, "simulated");
  }

  async markFailed(id: string): Promise<ScheduledReply> {
    return this.markStatus(id, "failed");
  }
}

// ============================================================================
// Supabase backend
// ============================================================================

type ScheduledReplyRow = Record<string, unknown>;

function rowToScheduledReply(row: ScheduledReplyRow): ScheduledReply {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    conversation_id: String(row.conversation_id),
    body: String(row.body ?? ""),
    scheduled_at: String(row.scheduled_at),
    status: (row.status as ScheduledReplyStatus) ?? "scheduled",
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

class SupabaseScheduledRepliesRepository implements ScheduledRepliesRepository {
  readonly mode: DataMode = "supabase";
  private readonly clientFactory: () => SupabaseClient | null;

  constructor(client?: SupabaseClient | null) {
    this.clientFactory = client ? () => client : () => createClient();
  }

  private client(): SupabaseClient {
    const c = this.clientFactory();
    if (!c) throw new Error("Supabase client is not configured");
    return c;
  }

  async schedule(
    workspaceId: string,
    input: ScheduleReplyInput
  ): Promise<ScheduledReply> {
    const normalized = normalizeScheduleInput(input);
    const { data, error } = await this.client()
      .from("scheduled_replies")
      .insert({
        workspace_id: workspaceId,
        conversation_id: normalized.conversation_id,
        body: normalized.body,
        scheduled_at: normalized.scheduled_at,
        status: "scheduled",
      })
      .select("*")
      .single();
    if (error) throw new Error(`Failed to schedule reply: ${error.message}`);
    return rowToScheduledReply(data as ScheduledReplyRow);
  }

  async listUpcoming(workspaceId: string): Promise<ScheduledReply[]> {
    const { data, error } = await this.client()
      .from("scheduled_replies")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("status", "scheduled")
      .order("scheduled_at", { ascending: true });
    if (error) throw new Error(`Failed to load scheduled replies: ${error.message}`);
    return (data ?? []).map((r) => rowToScheduledReply(r as ScheduledReplyRow));
  }

  async listDue(nowIso: string): Promise<ScheduledReply[]> {
    const { data, error } = await this.client()
      .from("scheduled_replies")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true });
    if (error) throw new Error(`Failed to load due scheduled replies: ${error.message}`);
    return (data ?? []).map((r) => rowToScheduledReply(r as ScheduledReplyRow));
  }

  async cancel(id: string): Promise<ScheduledReply> {
    return this.markStatus(id, "cancelled");
  }

  async markStatus(
    id: string,
    status: ScheduledReplyStatus
  ): Promise<ScheduledReply> {
    const { data, error } = await this.client()
      .from("scheduled_replies")
      .update({ status })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(`Failed to update scheduled reply: ${error.message}`);
    return rowToScheduledReply(data as ScheduledReplyRow);
  }

  async markSent(id: string): Promise<ScheduledReply> {
    return this.markStatus(id, "sent");
  }

  async markSimulated(id: string): Promise<ScheduledReply> {
    return this.markStatus(id, "simulated");
  }

  async markFailed(id: string): Promise<ScheduledReply> {
    return this.markStatus(id, "failed");
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createScheduledRepliesRepository(
  mode: DataMode = getDataMode(),
  client?: SupabaseClient | null
): ScheduledRepliesRepository {
  return mode === "supabase"
    ? new SupabaseScheduledRepliesRepository(client)
    : new DemoScheduledRepliesRepository();
}
