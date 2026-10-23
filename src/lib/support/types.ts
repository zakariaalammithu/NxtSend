/**
 * Support chat — shared types (P10 Stage E).
 *
 * The support system is platform-scoped (website visitors + any
 * registered user + platform support agents), deliberately separate
 * from the workspace-scoped prospect Inbox (migration 005). All rows
 * are accessed through the service role from gated API routes — the
 * tables have RLS enabled with zero client policies (migration 019).
 *
 * Content rule for this whole module tree: message bodies, KB answers
 * and saved replies are PLAIN TEXT end to end. Nothing here stores or
 * renders HTML.
 */

import type { DataMode } from "@/lib/data/mode";

export type { DataMode };

// ── Conversations ──────────────────────────────────────────────────────────

export type SupportConversationStatus = "open" | "pending" | "resolved";
export type SupportHandlingMode = "bot" | "human";
export type SupportConversationSource =
  | "marketing_widget"
  | "dashboard_widget"
  | "contact_form";

export interface SupportConversation {
  id: string;
  workspace_id: string | null;
  user_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  /** SHA-256 hex of the guest cookie token. Never leaves the server. */
  guest_access_token_hash: string | null;
  guest_token_expires_at: string | null;
  status: SupportConversationStatus;
  handling_mode: SupportHandlingMode;
  source: SupportConversationSource;
  subject: string | null;
  first_message_preview: string | null;
  last_message_preview: string | null;
  last_message_at: string;
  last_visitor_message_at: string | null;
  last_agent_message_at: string | null;
  visitor_unread_count: number;
  agent_unread_count: number;
  assignee_id: string | null;
  assigned_at: string | null;
  escalated_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  pii_redacted_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ── Messages ───────────────────────────────────────────────────────────────

export type SupportSenderType = "visitor" | "user" | "ai" | "admin" | "agent";
export type SupportMessageKind = "message" | "internal_note" | "system";
export type SupportAnswerEngine = "kb_match" | "ai_grounded" | "account_guard" | "fallback";

export interface SupportMessage {
  id: string;
  conversation_id: string;
  /** Monotonic polling cursor (identity column in live mode). */
  sequence_no: number;
  sender_type: SupportSenderType;
  sender_profile_id: string | null;
  sender_display_name: string | null;
  kind: SupportMessageKind;
  body: string;
  saved_reply_id: string | null;
  source_knowledge_id: string | null;
  visitor_read_at: string | null;
  agent_read_at: string | null;
  client_message_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Visitor-safe message projection. Internal notes never reach this
 * shape, and neither do the internal trace fields (source knowledge,
 * engine metadata, read watermarks of the agent side).
 */
export interface VisitorSupportMessage {
  id: string;
  sequence_no: number;
  sender_type: SupportSenderType;
  sender_display_name: string | null;
  kind: "message" | "system";
  body: string;
  created_at: string;
}

export function toVisitorMessage(message: SupportMessage): VisitorSupportMessage | null {
  if (message.kind === "internal_note") return null;
  return {
    id: message.id,
    sequence_no: message.sequence_no,
    sender_type: message.sender_type,
    sender_display_name: message.sender_display_name,
    kind: message.kind,
    body: message.body,
    created_at: message.created_at,
  };
}

/** Visitor-safe conversation projection (no token hash, no internals). */
export interface VisitorSupportConversation {
  id: string;
  status: SupportConversationStatus;
  handling_mode: SupportHandlingMode;
  visitor_unread_count: number;
  created_at: string;
  last_message_at: string;
}

export function toVisitorConversation(
  conversation: SupportConversation
): VisitorSupportConversation {
  return {
    id: conversation.id,
    status: conversation.status,
    handling_mode: conversation.handling_mode,
    visitor_unread_count: conversation.visitor_unread_count,
    created_at: conversation.created_at,
    last_message_at: conversation.last_message_at,
  };
}

// ── Knowledge base ─────────────────────────────────────────────────────────

export type SupportKnowledgeStatus = "draft" | "published" | "archived";

export interface SupportKnowledgeCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  enabled: boolean;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupportKnowledgeEntry {
  id: string;
  category_id: string;
  slug: string;
  title: string;
  question: string;
  answer: string;
  keywords: string[];
  related_url: string | null;
  /** Tie-breaker only — never a substitute for relevance. */
  priority: number;
  enabled: boolean;
  status: SupportKnowledgeStatus;
  search_text: string;
  content_hash: string | null;
  indexed_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** An entry is answerable only when published + enabled + indexed, in an enabled category. */
export function isAnswerable(
  entry: SupportKnowledgeEntry,
  category: SupportKnowledgeCategory | undefined
): boolean {
  return (
    entry.status === "published" &&
    entry.enabled &&
    entry.indexed_at !== null &&
    !!category &&
    category.enabled
  );
}

// ── Saved replies ──────────────────────────────────────────────────────────

export interface SupportSavedReply {
  id: string;
  title: string;
  category_id: string | null;
  shortcut: string | null;
  body: string;
  enabled: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Settings ───────────────────────────────────────────────────────────────

export interface SupportSettings {
  id: "global";
  /** Deterministic knowledge-base answers on/off. */
  ai_kb_enabled: boolean;
  /** Optional LLM grounded-rewriting layer (separate switch). */
  ai_enhancement_enabled: boolean;
  live_support_enabled: boolean;
  allow_user_escalation: boolean;
  display_name: string;
  greeting: string;
  welcome_message: string;
  offline_message: string;
  closing_message: string;
  support_email: string;
  updated_by: string | null;
  updated_at: string;
}

// ── Agents ─────────────────────────────────────────────────────────────────

export type SupportAgentAvailability = "offline" | "available" | "busy";

export interface SupportAgent {
  profile_id: string;
  enabled: boolean;
  /** Declared state (agent's own toggle) — NOT presence tracking. */
  availability: SupportAgentAvailability;
  availability_updated_at: string;
  last_assigned_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Agent row joined with the profile facts an admin needs to pick people. */
export interface SupportAgentView extends SupportAgent {
  email: string;
  full_name: string | null;
  role: "admin" | "super_admin" | "user";
  profile_status: "active" | "suspended";
  /** Computed server-side eligibility: role + active + enabled row. */
  eligible: boolean;
}

// ── Conversation events ────────────────────────────────────────────────────

export type SupportEventType =
  | "created"
  | "escalated"
  | "assigned"
  | "unassigned"
  | "transferred"
  | "status_changed"
  | "mode_changed"
  | "resolved"
  | "reopened"
  | "note_added";

export type SupportEventActorType = SupportSenderType | "system";

export interface SupportConversationEvent {
  id: string;
  conversation_id: string;
  event_type: SupportEventType;
  actor_type: SupportEventActorType;
  actor_profile_id: string | null;
  from_status: string | null;
  to_status: string | null;
  from_assignee_id: string | null;
  to_assignee_id: string | null;
  from_mode: string | null;
  to_mode: string | null;
  /** IDs and codes only — never message bodies or email addresses. */
  metadata: Record<string, unknown>;
  created_at: string;
}

// ── Store inputs ───────────────────────────────────────────────────────────

export interface CreateConversationInput {
  user_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_access_token_hash: string | null;
  guest_token_expires_at: string | null;
  workspace_id: string | null;
  source: SupportConversationSource;
  metadata: Record<string, unknown>;
}

export interface PostMessageInput {
  conversation_id: string;
  sender_type: SupportSenderType;
  sender_profile_id: string | null;
  sender_display_name: string | null;
  kind: SupportMessageKind;
  body: string;
  saved_reply_id?: string | null;
  source_knowledge_id?: string | null;
  client_message_id?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ConversationListFilters {
  status?: SupportConversationStatus;
  handling_mode?: SupportHandlingMode;
  assignee_id?: string;
  unassigned?: boolean;
  waiting_for_reply?: boolean;
  search?: string;
}

export interface ConversationQueueCounts {
  all: number;
  open: number;
  waiting_for_reply: number;
  assigned: number;
  unassigned: number;
  resolved: number;
}

export interface ConversationListResult {
  conversations: SupportConversation[];
  counts: ConversationQueueCounts;
}
