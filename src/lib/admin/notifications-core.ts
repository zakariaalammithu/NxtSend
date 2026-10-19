/**
 * Admin Notifications — pure core.
 *
 * Notifications are DERIVED, never stored: the admin platform service
 * merges three real sources — recent audit-log entries, failed job
 * runs, and failed webhook deliveries — each item labelled with its
 * source so an admin can always tell where a signal came from. This
 * module holds the shape + the merge/sort (unit-tested).
 */

export type NotificationSource = "audit" | "jobs" | "webhooks";

export interface AdminNotification {
  id: string;
  source: NotificationSource;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  created_at: string;
}

export function mergeNotifications(
  groups: AdminNotification[][],
  limit = 30
): AdminNotification[] {
  return groups
    .flat()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}
