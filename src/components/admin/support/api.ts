/**
 * Admin Support UI — shared API client (P10 Stage F).
 *
 * Thin typed wrapper over the Stage E admin routes. Every helper
 * returns the HTTP status alongside the body so pages can render a
 * clear permission notice on 403 instead of crashing. The server
 * remains the only enforcement point — the permission-aware control
 * states computed here are presentation only.
 *
 * "Me" resolution: the admin APIs deliberately do not echo the
 * caller. In live mode the caller's Supabase session id is matched
 * against the agents list (profile_id) to find their own agent row;
 * in Demo Mode the demo actor is the labelled demo super-admin
 * persona, which is the eligible super_admin in the agents list.
 */

import { createClient } from "@/lib/supabase/client";
import type {
  ConversationQueueCounts,
  SupportAgentView,
  SupportConversation,
  SupportConversationEvent,
  SupportKnowledgeCategory,
  SupportKnowledgeEntry,
  SupportMessage,
  SupportSavedReply,
  SupportSettings,
} from "@/lib/support/types";

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  body: T & { error?: string; code?: string };
}

export async function supportApi<T>(
  url: string,
  init?: RequestInit
): Promise<ApiResult<T>> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    code?: string;
  };
  return { ok: res.ok, status: res.status, body };
}

export function errorText(result: { status: number; body: { error?: string } }): string {
  return result.body.error ?? `Request failed (${result.status})`;
}

// ── Response shapes ────────────────────────────────────────────────────────

export interface ConversationListResponse {
  mode: string;
  conversations: SupportConversation[];
  counts: ConversationQueueCounts;
}

export interface ThreadResponse {
  mode: string;
  conversation: SupportConversation;
  messages: SupportMessage[];
  events: SupportConversationEvent[];
}

export interface KnowledgeListResponse {
  mode: string;
  entries: SupportKnowledgeEntry[];
  categories: SupportKnowledgeCategory[];
}

export interface SavedRepliesResponse {
  mode: string;
  replies: SupportSavedReply[];
}

export interface AgentsResponse {
  mode: string;
  agents: SupportAgentView[];
}

export interface SettingsResponse {
  mode: string;
  settings: SupportSettings;
  ai_enhancement_provider: string | null;
  ai_enhancement_configured: boolean;
}

export interface PreviewResponse {
  mode: string;
  preview: {
    band: string;
    score: number;
    margin: number;
    engine: string;
    answer: string;
    source_knowledge_ids: string[];
    candidates: Array<{ id: string; slug: string; title: string; score: number }>;
  };
}

// ── Identity ───────────────────────────────────────────────────────────────

/**
 * Find the signed-in admin's own agent row (for "Mine", claim and
 * own-availability controls). Returns null when it cannot be
 * determined — controls then stay conservative and the API's 403s
 * are surfaced verbatim.
 */
export async function resolveMe(
  agents: SupportAgentView[],
  mode: string | undefined
): Promise<SupportAgentView | null> {
  const supabase = createClient();
  if (supabase) {
    try {
      const { data } = await supabase.auth.getUser();
      const id = data.user?.id;
      if (id) return agents.find((a) => a.profile_id === id) ?? null;
    } catch {
      // fall through to the demo heuristic below
    }
  }
  if (mode === "demo") {
    // The demo actor is the demo super-admin persona (Stage E §7).
    return agents.find((a) => a.role === "super_admin" && a.eligible) ?? null;
  }
  return null;
}

/** May this actor work a conversation (reply / status), mirroring the
    server's canActOnConversation scoping for presentation only. */
export function canActOn(
  me: SupportAgentView | null,
  conversation: SupportConversation
): boolean {
  if (!me) return false;
  if (me.role === "super_admin") return true;
  return conversation.assignee_id === null || conversation.assignee_id === me.profile_id;
}

export function isSuper(me: SupportAgentView | null): boolean {
  return me?.role === "super_admin";
}

/** Display identity for a conversation row / thread header. */
export function conversationIdentity(conversation: SupportConversation): {
  name: string;
  detail: string;
  kind: "user" | "guest";
} {
  if (conversation.user_id) {
    return {
      name: conversation.guest_name ?? "Registered user",
      detail: "Registered user",
      kind: "user",
    };
  }
  return {
    name: conversation.guest_name ?? "Guest visitor",
    detail: conversation.guest_email ?? "Guest visitor",
    kind: "guest",
  };
}

/** "3m ago" style relative time for list rows. */
export function relativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function clockTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
