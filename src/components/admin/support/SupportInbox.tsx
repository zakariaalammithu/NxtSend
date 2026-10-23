"use client";

/**
 * Admin → Support → Support Inbox (P10 Stage F).
 *
 * Two-pane live-support inbox over the Stage E admin API. Polls the
 * queue + open thread every ~5s (the API is the transport; no
 * Realtime claims). Internal notes render only here — the visitor
 * projection never includes them. Controls mirror the server
 * permission matrix for presentation; the API enforces it and any
 * 403 is surfaced as a notice, never swallowed.
 */

import * as React from "react";
import {
  AlertTriangle,
  Bot,
  CheckCheck,
  ChevronDown,
  Loader2,
  NotebookPen,
  Search,
  Send,
  UserRound,
} from "lucide-react";
import { AdminPageHeader, ModeNote } from "@/components/admin/AdminBits";
import { cn } from "@/lib/utils";
import type {
  SupportAgentView,
  SupportConversation,
  SupportConversationEvent,
  SupportSavedReply,
} from "@/lib/support/types";
import {
  canActOn,
  clockTime,
  conversationIdentity,
  errorText,
  isSuper,
  relativeTime,
  resolveMe,
  supportApi,
  type AgentsResponse,
  type ConversationListResponse,
  type SavedRepliesResponse,
  type ThreadResponse,
} from "./api";

type TabKey = "all" | "open" | "waiting" | "mine" | "unassigned" | "resolved";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "waiting", label: "Waiting" },
  { key: "mine", label: "Mine" },
  { key: "unassigned", label: "Unassigned" },
  { key: "resolved", label: "Resolved" },
];

function tabQuery(tab: TabKey, me: SupportAgentView | null, search: string): string {
  const params = new URLSearchParams();
  if (tab === "open") params.set("status", "open");
  if (tab === "resolved") params.set("status", "resolved");
  if (tab === "waiting") params.set("waiting", "1");
  if (tab === "unassigned") params.set("unassigned", "1");
  if (tab === "mine" && me) params.set("assignee_id", me.profile_id);
  const q = search.trim();
  if (q) params.set("search", q);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function statusChip(conversation: SupportConversation) {
  if (conversation.status === "resolved")
    return <span className="rounded-full bg-black-700 px-2 py-0.5 text-10 font-bold text-black-200">Resolved</span>;
  if (conversation.status === "pending")
    return <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-10 font-bold text-amber-300">Pending</span>;
  return <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-10 font-bold text-emerald-300">Open</span>;
}

function eventText(event: SupportConversationEvent): string {
  switch (event.event_type) {
    case "created": return "Conversation created";
    case "escalated": return "Escalated to the support team";
    case "assigned": return "Assigned";
    case "unassigned": return "Unassigned";
    case "transferred": return "Transferred";
    case "status_changed": return `Status ${event.from_status ?? ""} → ${event.to_status ?? ""}`.trim();
    case "mode_changed": return `Mode ${event.from_mode ?? ""} → ${event.to_mode ?? ""}`.trim();
    case "resolved": return "Resolved";
    case "reopened": return "Reopened";
    case "note_added": return "Internal note added";
    default: return event.event_type;
  }
}

export function SupportInbox() {
  const [mode, setMode] = React.useState<string>("demo");
  const [tab, setTab] = React.useState<TabKey>("all");
  const [search, setSearch] = React.useState("");
  const [list, setList] = React.useState<ConversationListResponse | null>(null);
  const [listError, setListError] = React.useState<string | null>(null);
  const [forbidden, setForbidden] = React.useState(false);
  const [agents, setAgents] = React.useState<SupportAgentView[]>([]);
  const [me, setMe] = React.useState<SupportAgentView | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [thread, setThread] = React.useState<ThreadResponse | null>(null);
  const [threadError, setThreadError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [noteMode, setNoteMode] = React.useState(false);
  const [pickedReplyId, setPickedReplyId] = React.useState<string | null>(null);
  const [replies, setReplies] = React.useState<SupportSavedReply[]>([]);
  const [sending, setSending] = React.useState(false);
  const [showEvents, setShowEvents] = React.useState(false);

  const stateRef = React.useRef({ tab, search, me, selectedId });
  stateRef.current = { tab, search, me, selectedId };
  const threadScrollRef = React.useRef<HTMLDivElement | null>(null);

  const agentName = React.useCallback(
    (profileId: string | null): string | null => {
      if (!profileId) return null;
      const agent = agents.find((a) => a.profile_id === profileId);
      return agent ? agent.full_name ?? agent.email : "Support agent";
    },
    [agents]
  );

  const loadList = React.useCallback(async () => {
    const { tab: t, search: s, me: m } = stateRef.current;
    const res = await supportApi<ConversationListResponse>(
      `/api/admin/support/conversations${tabQuery(t, m, s)}`
    );
    if (res.status === 403) {
      setForbidden(true);
      setListError(null);
      return;
    }
    if (!res.ok) {
      setListError(errorText(res));
      return;
    }
    setForbidden(false);
    setListError(null);
    setList(res.body);
    setMode(res.body.mode);
  }, []);

  const loadThread = React.useCallback(async (id: string) => {
    const res = await supportApi<ThreadResponse>(`/api/admin/support/conversations/${id}`);
    if (!res.ok) {
      setThreadError(errorText(res));
      return;
    }
    setThreadError(null);
    setThread(res.body);
  }, []);

  // Initial loads: agents (for names + "me"), saved replies, the queue.
  React.useEffect(() => {
    (async () => {
      const agentsRes = await supportApi<AgentsResponse>("/api/admin/support/agents");
      if (agentsRes.ok) {
        setAgents(agentsRes.body.agents);
        setMe(await resolveMe(agentsRes.body.agents, agentsRes.body.mode));
      }
      const repliesRes = await supportApi<SavedRepliesResponse>("/api/admin/support/saved-replies");
      if (repliesRes.ok) setReplies(repliesRes.body.replies.filter((r) => r.enabled));
      await loadList();
    })();
  }, [loadList]);

  // Refetch when tab/search/me changes.
  React.useEffect(() => {
    void loadList();
  }, [tab, search, me, loadList]);

  // Poll queue + open thread.
  React.useEffect(() => {
    const interval = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void loadList();
      const id = stateRef.current.selectedId;
      if (id) void loadThread(id);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [loadList, loadThread]);

  React.useEffect(() => {
    const el = threadScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread?.messages.length, selectedId]);

  const selectConversation = async (id: string) => {
    setSelectedId(id);
    setThread(null);
    setNotice(null);
    setShowEvents(false);
    await loadThread(id);
    await supportApi(`/api/admin/support/conversations/${id}/read`, { method: "POST" });
    void loadList();
  };

  const patchConversation = async (patch: { status?: string; assignee_id?: string | null }) => {
    if (!selectedId) return;
    setNotice(null);
    const res = await supportApi(`/api/admin/support/conversations/${selectedId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      setNotice(errorText(res));
      return;
    }
    await loadThread(selectedId);
    void loadList();
  };

  const pickReply = (reply: SupportSavedReply) => {
    setDraft(reply.body);
    setPickedReplyId(reply.id);
    setNoteMode(false);
  };

  const send = async () => {
    if (!selectedId || !draft.trim() || sending) return;
    setSending(true);
    setNotice(null);
    const res = await supportApi(`/api/admin/support/conversations/${selectedId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        body: draft,
        kind: noteMode ? "internal_note" : "message",
        ...(noteMode ? {} : pickedReplyId ? { saved_reply_id: pickedReplyId } : {}),
      }),
    });
    setSending(false);
    if (!res.ok) {
      setNotice(errorText(res));
      return;
    }
    setDraft("");
    setPickedReplyId(null);
    setNoteMode(false);
    await loadThread(selectedId);
    void loadList();
  };

  const counts = list?.counts;
  const countFor = (key: TabKey): number | null => {
    if (!counts) return null;
    switch (key) {
      case "all": return counts.all;
      case "open": return counts.open;
      case "waiting": return counts.waiting_for_reply;
      case "unassigned": return counts.unassigned;
      case "resolved": return counts.resolved;
      default: return null;
    }
  };

  const conversation = thread?.conversation ?? null;
  const eligibleAgents = agents.filter((a) => a.eligible);
  const actorCanAct = conversation ? canActOn(me, conversation) : false;
  const superAdmin = isSuper(me);

  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        title="Support Inbox"
        description="Live support conversations from the website chat widget. Internal notes are visible to the support team only — visitors never see them."
        badge={mode === "demo" ? "Demo Mode" : undefined}
      />
      <ModeNote mode={mode} />

      {forbidden ? (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-950/20 px-5 py-4 text-13 text-amber-200 flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong>No support permission.</strong> Your admin account is not an enabled
            support agent, so the support inbox is not available. A super admin can enable
            your account under Chat Settings → Support agents.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          {/* Queue pane */}
          <div className="glass-card flex min-h-[480px] flex-col overflow-hidden">
            <div className="border-b border-black-700/60 p-3 space-y-3">
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Conversation filters">
                {TABS.map((t) => {
                  const count = countFor(t.key);
                  const disabled = t.key === "mine" && !me;
                  return (
                    <button
                      key={t.key}
                      role="tab"
                      aria-selected={tab === t.key}
                      disabled={disabled}
                      title={disabled ? "Your support agent profile could not be determined" : undefined}
                      onClick={() => setTab(t.key)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-11 font-semibold transition",
                        tab === t.key
                          ? "bg-rose-600/20 text-white border border-rose-500/40"
                          : "bg-black-800 text-black-300 border border-black-700 hover:text-white",
                        disabled && "opacity-40"
                      )}
                    >
                      {t.label}
                      {count !== null && <span className="ml-1 text-black-400">{count}</span>}
                    </button>
                  );
                })}
              </div>
              <label className="flex items-center gap-2 rounded-xl border border-black-700 bg-black-800 px-3 py-2">
                <Search className="h-4 w-4 text-black-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, email or message…"
                  aria-label="Search conversations"
                  className="w-full bg-transparent text-13 text-white placeholder:text-black-500 focus:outline-none"
                />
              </label>
            </div>

            <div className="flex-1 overflow-y-auto">
              {listError && (
                <p className="px-4 py-6 text-13 text-rose-300">{listError}</p>
              )}
              {!listError && list && list.conversations.length === 0 && (
                <p className="px-4 py-8 text-center text-13 text-black-400">
                  No conversations in this view yet.
                </p>
              )}
              {list?.conversations.map((c) => {
                const identity = conversationIdentity(c);
                const active = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => void selectConversation(c.id)}
                    className={cn(
                      "block w-full border-b border-black-800 px-4 py-3 text-left transition",
                      active ? "bg-rose-600/10" : "hover:bg-black-800/60"
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {c.handling_mode === "bot" ? (
                          <Bot className="h-3.5 w-3.5 shrink-0 text-purple-300" aria-label="Bot handled" />
                        ) : (
                          <UserRound className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-label="Human handled" />
                        )}
                        <span className="truncate text-13 font-semibold text-white">{identity.name}</span>
                      </span>
                      <span className="shrink-0 text-11 text-black-500">{relativeTime(c.last_message_at)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-12 text-black-400">
                      {c.last_message_preview ?? "—"}
                    </span>
                    <span className="mt-1.5 flex items-center gap-1.5">
                      {statusChip(c)}
                      {c.assignee_id ? (
                        <span className="text-11 text-black-400">{agentName(c.assignee_id)}</span>
                      ) : (
                        <span className="text-11 text-black-500">Unassigned</span>
                      )}
                      {c.agent_unread_count > 0 && (
                        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-11 font-bold text-white">
                          {c.agent_unread_count}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Thread pane */}
          <div className="glass-card flex min-h-[480px] flex-col overflow-hidden">
            {!conversation && (
              <div className="flex flex-1 items-center justify-center p-10 text-center text-13 text-black-400">
                {threadError ?? "Select a conversation to read and reply."}
              </div>
            )}
            {conversation && (
              <>
                <div className="border-b border-black-700/60 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-14 font-bold text-white">
                      {conversationIdentity(conversation).name}
                    </p>
                    <span className="text-12 text-black-400">
                      {conversationIdentity(conversation).detail}
                    </span>
                    {statusChip(conversation)}
                    <span className="rounded-full bg-black-700 px-2 py-0.5 text-10 font-bold text-black-200">
                      {conversation.handling_mode === "bot" ? "Bot" : "Support team"}
                    </span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {!conversation.assignee_id && me && (
                      <button
                        type="button"
                        onClick={() => void patchConversation({ assignee_id: me.profile_id })}
                        className="rounded-lg bg-rose-600/20 border border-rose-500/40 px-2.5 py-1.5 text-12 font-semibold text-rose-200 hover:bg-rose-600/30"
                      >
                        Claim conversation
                      </button>
                    )}
                    <label className="flex items-center gap-1.5 text-12 text-black-300">
                      Assign
                      <span className="relative inline-flex items-center">
                        <select
                          aria-label="Assign conversation"
                          value={conversation.assignee_id ?? ""}
                          disabled={!superAdmin}
                          title={!superAdmin ? "Only a super admin can assign to another agent" : undefined}
                          onChange={(e) =>
                            void patchConversation({
                              assignee_id: e.target.value ? e.target.value : null,
                            })
                          }
                          className="appearance-none rounded-lg border border-black-700 bg-black-800 py-1.5 pl-2.5 pr-7 text-12 text-white disabled:opacity-50"
                        >
                          <option value="">Unassigned</option>
                          {eligibleAgents.map((a) => (
                            <option key={a.profile_id} value={a.profile_id}>
                              {a.full_name ?? a.email}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-black-400" />
                      </span>
                    </label>
                    {conversation.status !== "resolved" ? (
                      <button
                        type="button"
                        disabled={!actorCanAct}
                        title={!actorCanAct ? "Assigned to another agent" : undefined}
                        onClick={() => void patchConversation({ status: "resolved" })}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/40 px-2.5 py-1.5 text-12 font-semibold text-emerald-200 hover:bg-emerald-600/30 disabled:opacity-40"
                      >
                        <CheckCheck className="h-3.5 w-3.5" /> Resolve
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!actorCanAct}
                        title={!actorCanAct ? "Assigned to another agent" : undefined}
                        onClick={() => void patchConversation({ status: "open" })}
                        className="rounded-lg bg-black-700 border border-black-600 px-2.5 py-1.5 text-12 font-semibold text-white hover:bg-black-600 disabled:opacity-40"
                      >
                        Reopen
                      </button>
                    )}
                  </div>
                </div>

                <div ref={threadScrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                  {threadError && <p className="text-13 text-rose-300">{threadError}</p>}
                  {thread?.messages.map((message) => {
                    if (message.kind === "internal_note") {
                      return (
                        <div
                          key={message.id}
                          className="rounded-xl border border-amber-500/40 bg-amber-950/25 px-3.5 py-2.5"
                        >
                          <p className="mb-1 flex items-center gap-1.5 text-11 font-bold uppercase tracking-wide text-amber-300">
                            <NotebookPen className="h-3.5 w-3.5" /> Internal note ·{" "}
                            {message.sender_display_name ?? "Support"} · {clockTime(message.created_at)}
                          </p>
                          <p className="whitespace-pre-wrap text-13 leading-relaxed text-amber-100">
                            {message.body}
                          </p>
                        </div>
                      );
                    }
                    if (message.kind === "system") {
                      return (
                        <p key={message.id} className="mx-auto max-w-[85%] rounded-full bg-black-800 px-3 py-1.5 text-center text-11 text-black-300">
                          {message.body}
                        </p>
                      );
                    }
                    const ownTeam =
                      message.sender_type === "admin" || message.sender_type === "agent";
                    return (
                      <div key={message.id} className={cn("flex flex-col", ownTeam ? "items-end" : "items-start")}>
                        <span className="mb-1 px-1 text-11 text-black-400">
                          {message.sender_type === "ai"
                            ? message.sender_display_name ?? "Assistant"
                            : ownTeam
                              ? `${message.sender_display_name ?? "Support"} (support team)`
                              : `${message.sender_display_name ?? conversationIdentity(conversation).name} (${message.sender_type === "user" ? "user" : "visitor"})`}{" "}
                          · {clockTime(message.created_at)}
                        </span>
                        <div
                          className={cn(
                            "max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-13 leading-relaxed",
                            ownTeam
                              ? "rounded-br-md bg-rose-600/25 text-rose-50 border border-rose-500/20"
                              : "rounded-bl-md bg-black-800 text-black-100"
                          )}
                        >
                          {message.body}
                        </div>
                      </div>
                    );
                  })}

                  {thread && thread.events.length > 0 && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setShowEvents((v) => !v)}
                        aria-expanded={showEvents}
                        className="text-12 font-semibold text-black-300 hover:text-white"
                      >
                        {showEvents ? "Hide" : "Show"} conversation history ({thread.events.length})
                      </button>
                      {showEvents && (
                        <ul className="mt-2 space-y-1 border-l border-black-700 pl-3">
                          {thread.events.map((event) => (
                            <li key={event.id} className="text-12 text-black-400">
                              {eventText(event)} · {clockTime(event.created_at)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                <div className="border-t border-black-700/60 px-4 py-3 space-y-2.5">
                  {notice && (
                    <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-12 text-rose-200">
                      {notice}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5 text-12 text-black-300">
                      Saved reply
                      <span className="relative inline-flex items-center">
                        <select
                          aria-label="Insert a saved reply"
                          value=""
                          onChange={(e) => {
                            const reply = replies.find((r) => r.id === e.target.value);
                            if (reply) pickReply(reply);
                          }}
                          className="appearance-none rounded-lg border border-black-700 bg-black-800 py-1.5 pl-2.5 pr-7 text-12 text-white"
                        >
                          <option value="">Insert…</option>
                          {replies.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.title}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-black-400" />
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5 text-12 text-black-300">
                      <input
                        type="checkbox"
                        checked={noteMode}
                        onChange={(e) => setNoteMode(e.target.checked)}
                        className="h-3.5 w-3.5 accent-amber-500"
                      />
                      <NotebookPen className="h-3.5 w-3.5 text-amber-300" /> Internal note
                    </label>
                    {pickedReplyId && !noteMode && (
                      <span className="text-11 text-black-400">
                        Using a saved reply — edit freely before sending.
                      </span>
                    )}
                  </div>
                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                      }}
                      placeholder={noteMode ? "Write an internal note (team only)…" : "Reply to the visitor…"}
                      aria-label={noteMode ? "Internal note" : "Reply to the visitor"}
                      rows={2}
                      maxLength={4000}
                      className={cn(
                        "flex-1 resize-none rounded-xl border bg-black-800 px-3 py-2.5 text-13 text-white placeholder:text-black-500 focus:outline-none",
                        noteMode ? "border-amber-500/50" : "border-black-700 focus:border-rose-500"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => void send()}
                      disabled={!draft.trim() || sending}
                      className={cn(
                        "inline-flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-13 font-semibold text-white disabled:opacity-40",
                        noteMode ? "bg-amber-600 hover:bg-amber-500" : "bg-rose-600 hover:bg-rose-500"
                      )}
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      {noteMode ? "Add note" : "Send"}
                    </button>
                  </div>
                  {!actorCanAct && conversation.assignee_id && (
                    <p className="text-11 text-black-500">
                      This conversation is assigned to {agentName(conversation.assignee_id)} — replies
                      are limited to the assignee or a super admin. Internal notes are still allowed.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
