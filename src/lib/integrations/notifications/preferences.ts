/**
 * Notification preferences — per-workspace shape + defaults.
 *
 * Preferences are DATA, not delivery: this module never sends
 * anything. Adapters read a workspace's preferences (loaded by the
 * caller from `integration_notification_preferences`, migration
 * 036) and decide which alert types go to which channel.
 *
 * Storage note: preferences live in their own table because
 * migration 030's `integration_connections` has no settings/JSONB
 * column — reusing it would mean abusing a credentials table for
 * UI settings. See supabase/migrations/036_notification_preferences.sql.
 */

import type { NotificationEventType } from "./templates";
import { NOTIFICATION_EVENT_TYPES } from "./templates";

export type NotificationChannel =
  | "slack"
  | "teams"
  | "discord"
  | "telegram"
  | "whatsapp"
  | "email";

export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = [
  "slack",
  "teams",
  "discord",
  "telegram",
  "whatsapp",
  "email",
];

export type NotificationChannelMap = Record<
  NotificationEventType,
  NotificationChannel[]
>;

export interface NotificationPreferences {
  workspaceId: string;
  /** Master switch — false silences every alert for the workspace. */
  enabled: boolean;
  /** Which channels receive each alert type. Empty list = no alert. */
  channels: NotificationChannelMap;
  /** Daily report goes out at this local hour (0–23), when enabled. */
  dailyReportHour: number;
  updatedAt: string;
}

/** Sensible defaults: errors + interested leads everywhere the user connects; daily report off until a channel is picked. */
export function defaultNotificationChannels(): NotificationChannelMap {
  return {
    "lead.created": [],
    "conversation.reply_created": [],
    "lead.interested": [],
    "campaign.status_changed": [],
    "daily.report": [],
    "sync.error": [],
  };
}

export function defaultNotificationPreferences(
  workspaceId: string
): NotificationPreferences {
  return {
    workspaceId,
    enabled: true,
    channels: defaultNotificationChannels(),
    dailyReportHour: 9,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Normalises a stored preferences blob (unknown shape — it came
 * from JSONB): unknown event types and unknown channels are
 * dropped, missing events default to [], dailyReportHour is
 * clamped to 0–23. Never throws.
 */
export function parseNotificationPreferences(
  workspaceId: string,
  raw: unknown
): NotificationPreferences {
  const base = defaultNotificationPreferences(workspaceId);
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.enabled === "boolean") base.enabled = obj.enabled;
  if (
    typeof obj.dailyReportHour === "number" &&
    Number.isFinite(obj.dailyReportHour)
  ) {
    base.dailyReportHour = Math.min(23, Math.max(0, Math.floor(obj.dailyReportHour)));
  }
  if (obj.channels && typeof obj.channels === "object") {
    const channels = obj.channels as Record<string, unknown>;
    for (const type of NOTIFICATION_EVENT_TYPES) {
      const list = channels[type];
      if (!Array.isArray(list)) continue;
      base.channels[type] = list.filter((c): c is NotificationChannel =>
        (NOTIFICATION_CHANNELS as readonly string[]).includes(String(c))
      );
    }
  }
  return base;
}

/** Channels that should receive this alert type (empty when disabled). */
export function resolveNotificationChannels(
  prefs: NotificationPreferences,
  type: NotificationEventType
): NotificationChannel[] {
  if (!prefs.enabled) return [];
  return [...(prefs.channels[type] ?? [])];
}
