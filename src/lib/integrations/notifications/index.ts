/**
 * Notification helpers — templates + per-workspace preferences.
 * Pure data builders only: nothing in here sends a message.
 * Delivery lives in the communication adapters
 * (src/lib/integrations/providers/communication/<provider>/).
 */

export {
  buildNotificationMessage,
  notificationEventLabel,
  NOTIFICATION_EVENT_TYPES,
  type NotificationEventType,
  type NotificationEventInput,
  type NotificationMessage,
} from "./templates";
export {
  defaultNotificationChannels,
  defaultNotificationPreferences,
  parseNotificationPreferences,
  resolveNotificationChannels,
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
  type NotificationChannelMap,
  type NotificationPreferences,
} from "./preferences";
