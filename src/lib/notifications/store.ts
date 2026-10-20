/**
 * Notification stores — one interface, two backends (P5 Stage D).
 *
 * - Supabase: rows in `notifications` (migration 012). Callers pass the
 *   client appropriate to the operation: the SESSION client for user
 *   reads/marks (RLS scopes rows to the caller's workspaces on top of
 *   the explicit workspace filter), the SERVICE-ROLE client for
 *   creation from system paths (the webhook ingestion runs tenant-less
 *   and inserts into the single workspace the matcher chose).
 * - Demo: the labelled demo collection `nxtsend_demo_notifications_v1`,
 *   through the same demo-store persistence the other demo backends
 *   use (localStorage in the browser, in-process memory on the
 *   server), so the bell, the API and the demo ingestion seam all see
 *   one list per process/browser.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadDemoCollection, saveDemoCollection } from "@/lib/data/demo-store";
import { generateId } from "@/lib/utils";
import {
  shapeNotification,
  sortNotifications,
  type AppNotification,
  type NewNotification,
} from "./core";

export interface NotificationStore {
  insert(input: NewNotification): Promise<AppNotification>;
  /** Newest first, capped at `limit`. */
  list(workspaceId: string, limit?: number): Promise<AppNotification[]>;
  unreadCount(workspaceId: string): Promise<number>;
  /** Marks one notification read. Returns false when not found in this workspace. */
  markRead(workspaceId: string, id: string): Promise<boolean>;
  /** Marks every unread notification in the workspace read. Returns how many changed. */
  markAllRead(workspaceId: string): Promise<number>;
}

// ── Supabase backend ────────────────────────────────────────────────────────

export function createSupabaseNotificationStore(
  client: SupabaseClient
): NotificationStore {
  return {
    async insert(input) {
      const { data, error } = await client
        .from("notifications")
        .insert({
          workspace_id: input.workspace_id,
          user_id: input.user_id ?? null,
          type: input.type,
          title: input.title,
          body: input.body,
          link: input.link ?? null,
        })
        .select("*")
        .single();
      if (error || !data) {
        throw new Error(`Failed to create notification: ${error?.message ?? "no row"}`);
      }
      return shapeNotification(data as Record<string, unknown>);
    },

    async list(workspaceId, limit = 30) {
      const { data, error } = await client
        .from("notifications")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(`Failed to list notifications: ${error.message}`);
      return sortNotifications(
        (data ?? []).map((r) => shapeNotification(r as Record<string, unknown>))
      );
    },

    async unreadCount(workspaceId) {
      const { count, error } = await client
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .is("read_at", null);
      if (error) throw new Error(`Failed to count notifications: ${error.message}`);
      return count ?? 0;
    },

    async markRead(workspaceId, id) {
      const { data, error } = await client
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("workspace_id", workspaceId)
        .eq("id", id)
        .is("read_at", null)
        .select("id");
      if (error) throw new Error(`Failed to mark notification read: ${error.message}`);
      return (data ?? []).length > 0;
    },

    async markAllRead(workspaceId) {
      const { data, error } = await client
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("workspace_id", workspaceId)
        .is("read_at", null)
        .select("id");
      if (error) throw new Error(`Failed to mark notifications read: ${error.message}`);
      return (data ?? []).length;
    },
  };
}

// ── Demo backend ────────────────────────────────────────────────────────────

export const DEMO_NOTIFICATIONS_KEY = "nxtsend_demo_notifications_v1";

export function createDemoNotificationStore(): NotificationStore {
  const loadAll = (): AppNotification[] =>
    loadDemoCollection<AppNotification>(DEMO_NOTIFICATIONS_KEY, () => []);
  const saveAll = (items: AppNotification[]): void =>
    saveDemoCollection(DEMO_NOTIFICATIONS_KEY, items);

  return {
    async insert(input) {
      const notification: AppNotification = {
        id: `notif_${generateId()}`,
        workspace_id: input.workspace_id,
        user_id: input.user_id ?? null,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link ?? null,
        read_at: null,
        created_at: new Date().toISOString(),
      };
      saveAll([notification, ...loadAll()]);
      return notification;
    },

    async list(workspaceId, limit = 30) {
      return sortNotifications(
        loadAll().filter((n) => n.workspace_id === workspaceId)
      ).slice(0, limit);
    },

    async unreadCount(workspaceId) {
      return loadAll().filter(
        (n) => n.workspace_id === workspaceId && !n.read_at
      ).length;
    },

    async markRead(workspaceId, id) {
      const items = loadAll();
      const target = items.find(
        (n) => n.id === id && n.workspace_id === workspaceId
      );
      if (!target || target.read_at) return false;
      target.read_at = new Date().toISOString();
      saveAll(items);
      return true;
    },

    async markAllRead(workspaceId) {
      const items = loadAll();
      let changed = 0;
      const now = new Date().toISOString();
      for (const n of items) {
        if (n.workspace_id === workspaceId && !n.read_at) {
          n.read_at = now;
          changed++;
        }
      }
      if (changed > 0) saveAll(items);
      return changed;
    },
  };
}
