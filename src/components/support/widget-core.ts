/**
 * Support widget — pure client logic (P10 Stage F).
 *
 * Kept free of React so the merge / visibility / labelling rules are
 * unit-testable in the node test environment. The widget renders
 * message bodies as PLAIN TEXT only (React text nodes) — nothing in
 * this module produces HTML.
 */

import type {
  SupportConversationStatus,
  SupportHandlingMode,
  VisitorSupportMessage,
} from "@/lib/support/types";

/** Public projection of GET /api/support/config. */
export interface SupportWidgetConfig {
  mode: "demo" | "supabase" | string;
  display_name: string;
  greeting: string;
  welcome_message: string;
  offline_message: string;
  closing_message: string;
  support_email: string;
  ai_kb_enabled: boolean;
  live_support_enabled: boolean;
  allow_user_escalation: boolean;
  /** True only when an eligible agent has DECLARED themselves available. */
  live_available: boolean;
  ai_enhancement: "configured" | "not_configured" | string;
}

export interface WidgetConversation {
  id: string;
  status: SupportConversationStatus;
  handling_mode: SupportHandlingMode;
  visitor_unread_count: number;
  created_at: string;
  last_message_at: string;
}

/** A server-confirmed message plus the widget's local send state. */
export interface WidgetMessage extends VisitorSupportMessage {
  /** Present only for optimistic (not yet server-confirmed) copies. */
  localState?: "sending" | "failed";
  clientMessageId?: string;
}

/**
 * Merge a polled/posted batch into the confirmed list: dedupe by id,
 * keep sequence order. Optimistic copies (no server id match) are
 * preserved — the caller drops an optimistic copy explicitly once the
 * server version of that message arrives in a POST response.
 */
export function mergeMessages(
  existing: WidgetMessage[],
  incoming: VisitorSupportMessage[]
): WidgetMessage[] {
  const byId = new Map<string, WidgetMessage>();
  for (const message of existing) byId.set(message.id, message);
  for (const message of incoming) {
    byId.set(message.id, { ...message });
  }
  return Array.from(byId.values()).sort((a, b) => a.sequence_no - b.sequence_no);
}

/** Highest confirmed sequence number — the polling cursor. */
export function lastSequence(messages: WidgetMessage[]): number {
  let max = 0;
  for (const message of messages) {
    if (!message.localState && message.sequence_no > max) max = message.sequence_no;
  }
  return max;
}

let clientIdCounter = 0;

/** Idempotency key for a visitor message; a retry reuses the same id. */
export function newClientMessageId(): string {
  clientIdCounter += 1;
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `w-${random}-${clientIdCounter}`;
}

/** "Talk to a person" is offered only when settings allow it AND the
    conversation is still bot-handled and not resolved. */
export function canOfferEscalation(
  config: SupportWidgetConfig | null,
  conversation: WidgetConversation | null
): boolean {
  if (!config || !conversation) return false;
  return (
    config.live_support_enabled &&
    config.allow_user_escalation &&
    conversation.handling_mode === "bot" &&
    conversation.status !== "resolved"
  );
}

/** Who a bubble belongs to, for alignment + labelling. */
export function messageSide(message: VisitorSupportMessage): "own" | "other" | "system" {
  if (message.kind === "system") return "system";
  if (message.sender_type === "visitor" || message.sender_type === "user") return "own";
  return "other";
}

export function senderLabel(
  message: VisitorSupportMessage,
  config: SupportWidgetConfig | null
): string {
  if (message.sender_type === "visitor" || message.sender_type === "user") return "You";
  if (message.sender_type === "ai") {
    return message.sender_display_name ?? config?.display_name ?? "Support";
  }
  // admin / agent — a human from the support team.
  return message.sender_display_name ?? "NxtSend Support";
}

/** HH:MM in the viewer's locale. */
export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
