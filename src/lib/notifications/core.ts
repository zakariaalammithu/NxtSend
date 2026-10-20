/**
 * In-app notifications — core types + pure shaping (P5 Stage D).
 *
 * Notifications are STORED records (migration 012), created by real
 * product events — today: an inbound reply being filed into a
 * conversation by the ingestion pipeline. This replaces the dashboard
 * shell's old hard-coded sample list: the bell now renders only rows
 * that exist, so an empty list honestly means "nothing has happened
 * yet".
 *
 * A notification is workspace-scoped; `user_id` null means it is for
 * the whole workspace (every member sees it), otherwise it targets one
 * user. Read state is the row's `read_at`.
 */

export interface AppNotification {
  id: string;
  workspace_id: string;
  user_id: string | null;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NewNotification {
  workspace_id: string;
  user_id?: string | null;
  type: string;
  title: string;
  body: string;
  link?: string | null;
}

export const NOTIFICATION_TYPE_REPLY = "reply_received";

/** Shapes a notifications-table row (or a demo record) for the API/UI. */
export function shapeNotification(row: Record<string, unknown>): AppNotification {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    user_id: (row.user_id as string | null) ?? null,
    type: String(row.type ?? "info"),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    link: (row.link as string | null) ?? null,
    read_at: (row.read_at as string | null) ?? null,
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

export function countUnread(notifications: AppNotification[]): number {
  return notifications.filter((n) => !n.read_at).length;
}

/** Newest first (stable for equal timestamps via id tiebreak). */
export function sortNotifications(notifications: AppNotification[]): AppNotification[] {
  return [...notifications].sort(
    (a, b) =>
      b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)
  );
}

/**
 * The notification created when ingestion files a reply. Kept pure so
 * both stores (Supabase + demo) and the ingestion tests share exactly
 * one wording.
 */
export function buildReplyNotification(input: {
  workspaceId: string;
  conversationId: string;
  senderName: string;
  senderEmail: string;
  subject: string | null;
  preview: string;
}): NewNotification {
  const who = input.senderName.trim() || input.senderEmail;
  const preview = input.preview.replace(/\s+/g, " ").trim().slice(0, 140);
  return {
    workspace_id: input.workspaceId,
    user_id: null,
    type: NOTIFICATION_TYPE_REPLY,
    title: `New reply from ${who}`,
    body: input.subject
      ? `${input.subject} — ${preview}`
      : preview || "Open the conversation to read the reply.",
    link: `/dashboard/inbox?conversation=${encodeURIComponent(input.conversationId)}`,
  };
}

/** Compact relative time for the bell dropdown ("5m ago", "2h ago", "3d ago"). */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffMs = Math.max(0, now.getTime() - then);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
