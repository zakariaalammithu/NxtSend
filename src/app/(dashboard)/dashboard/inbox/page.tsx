"use client";

import * as React from "react";
import {
  MessageSquare,
  Search,
  Linkedin,
  Mail,
  Send,
  Check,
  CheckCheck,
  RefreshCw,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { DemoBanner, Badge } from "@/components/ui";
import { formatDate, generateId } from "@/lib/utils";
import {
  deriveReplySubject,
  type ConversationSummary,
  type InboxConversation,
  type InboxMessage,
} from "@/lib/data/inbox";
import type { ProviderState } from "@/lib/env";
import EmailContentHints from "@/components/dashboard/EmailContentHints";

const PAGE_SIZE = 25;

type ChannelFilter = "all" | "unread" | "linkedin" | "email";

interface ListResponse {
  mode: "demo" | "supabase";
  emailState: ProviderState;
  conversations: ConversationSummary[];
  total: number;
  unreadCount: number;
}

interface ThreadResponse {
  mode: "demo" | "supabase";
  emailState: ProviderState;
  conversation: InboxConversation;
  messages: InboxMessage[];
  unreadCount: number;
}

function announceUnreadChanged() {
  window.dispatchEvent(new Event("nxtsend:inbox-unread-changed"));
}

/** Honest, state-derived copy for the email provider banner. */
function emailBannerText(state: ProviderState | null): string {
  switch (state) {
    case "connected":
      return "Resend connected. Replies are sent through Resend and shown as Sent only with a provider message ID; delivery arrives via webhook.";
    case "not_connected":
      return "Resend is not configured (RESEND_API_KEY / EMAIL_FROM missing). Replies cannot be sent — see SETUP.md §6.";
    case "configuration_required":
      return "Resend is partially configured. Both RESEND_API_KEY and EMAIL_FROM are required before replies can be sent.";
    case "error":
      return "The email provider reported a configuration error. Replies cannot be sent.";
    case "demo":
    default:
      return "Demo Mode: replies go through the real send path but the provider simulates them — they are labelled Simulated and nothing is actually sent.";
  }
}

export default function InboxPage() {
  const [summaries, setSummaries] = React.useState<ConversationSummary[]>([]);
  const [total, setTotal] = React.useState(0);
  const [listLoading, setListLoading] = React.useState(true);
  const [listError, setListError] = React.useState<string | null>(null);
  const [emailState, setEmailState] = React.useState<ProviderState | null>(null);

  const [searchQuery, setSearchQuery] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [channelFilter, setChannelFilter] = React.useState<ChannelFilter>("all");

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [thread, setThread] = React.useState<ThreadResponse | null>(null);
  const [threadLoading, setThreadLoading] = React.useState(false);
  const [threadError, setThreadError] = React.useState<string | null>(null);

  const [replyText, setReplyText] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [retryingId, setRetryingId] = React.useState<string | null>(null);
  const [sendError, setSendError] = React.useState<string | null>(null);
  // One idempotency key per unsent draft, per conversation: a retry of
  // the same draft re-uses the key, so the server can never send twice.
  const draftKeys = React.useRef<Record<string, string>>({});
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);
  const autoSelected = React.useRef(false);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const loadList = React.useCallback(
    async (append: boolean) => {
      setListLoading(true);
      if (!append) setListError(null);
      try {
        const params = new URLSearchParams();
        if (debouncedSearch) params.set("search", debouncedSearch);
        if (channelFilter === "email" || channelFilter === "linkedin") {
          params.set("channel", channelFilter);
        }
        if (channelFilter === "unread") params.set("unread", "1");
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(append ? summaries.length : 0));
        const res = await fetch(`/api/inbox/conversations?${params.toString()}`);
        const data = (await res.json()) as ListResponse & { error?: string };
        if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
        setEmailState(data.emailState);
        setTotal(data.total);
        setSummaries((prev) =>
          append ? [...prev, ...data.conversations] : data.conversations
        );
        return data;
      } catch (err) {
        setListError(
          err instanceof Error ? err.message : "Failed to load conversations."
        );
        return null;
      } finally {
        setListLoading(false);
      }
    },
    [debouncedSearch, channelFilter, summaries.length]
  );

  React.useEffect(() => {
    loadList(false);
  }, [debouncedSearch, channelFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const openConversation = React.useCallback(async (id: string) => {
    setSelectedId(id);
    setThreadLoading(true);
    setThreadError(null);
    setSendError(null);
    try {
      const res = await fetch(`/api/inbox/conversations/${id}`);
      const data = (await res.json()) as ThreadResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setThread(data);
      setSubject(deriveReplySubject(data.conversation));
      setReplyText("");
      // Opening marks the thread read server-side; mirror that locally.
      setSummaries((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, unread: false, unread_count: 0 } : s
        )
      );
      announceUnreadChanged();
    } catch (err) {
      setThreadError(
        err instanceof Error ? err.message : "Failed to load this conversation."
      );
    } finally {
      setThreadLoading(false);
    }
  }, []);

  // Auto-open on first load: a ?conversation= deep link (reply
  // notifications, Stage D) wins; otherwise the most recent thread
  // (desktop flow).
  React.useEffect(() => {
    if (autoSelected.current || summaries.length === 0 || selectedId) return;
    autoSelected.current = true;
    const linked = new URLSearchParams(window.location.search).get(
      "conversation"
    );
    openConversation(linked || summaries[0].id);
  }, [summaries, selectedId, openConversation]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [thread?.messages.length]);

  const upsertMessage = React.useCallback((message: InboxMessage) => {
    setThread((prev) => {
      if (!prev) return prev;
      const exists = prev.messages.some((m) => m.id === message.id);
      return {
        ...prev,
        messages: exists
          ? prev.messages.map((m) => (m.id === message.id ? message : m))
          : [...prev.messages, message],
      };
    });
    setSummaries((prev) =>
      prev.map((s) =>
        s.id === message.conversation_id
          ? {
              ...s,
              last_message_preview: message.content,
              last_message_direction: message.direction,
              last_message_at: message.sent_at,
            }
          : s
      )
    );
  }, []);

  const postReply = React.useCallback(
    async (args: { content: string; subject?: string; idempotencyKey: string }) => {
      const conversationId = selectedId;
      if (!conversationId) return null;
      const res = await fetch(`/api/inbox/conversations/${conversationId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      const data = (await res.json()) as {
        message?: InboxMessage;
        duplicate?: boolean;
        error?: string;
      };
      return { res, data };
    },
    [selectedId]
  );

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedId || sending) return;
    setSending(true);
    setSendError(null);
    const key =
      draftKeys.current[selectedId] ??
      (draftKeys.current[selectedId] = `reply_${generateId()}`);
    try {
      const result = await postReply({
        content: replyText,
        subject,
        idempotencyKey: key,
      });
      if (result?.data.message) upsertMessage(result.data.message);
      if (result?.res.ok) {
        delete draftKeys.current[selectedId];
        setReplyText("");
      } else {
        setSendError(result?.data.error ?? "The reply could not be sent.");
      }
    } catch {
      setSendError("Network error — the reply was not sent. You can retry safely.");
    } finally {
      setSending(false);
    }
  };

  const handleRetry = async (message: InboxMessage) => {
    if (!message.idempotency_key || retryingId) return;
    setRetryingId(message.id);
    setSendError(null);
    try {
      const result = await postReply({
        content: message.content,
        subject: message.subject ?? undefined,
        idempotencyKey: message.idempotency_key,
      });
      if (result?.data.message) upsertMessage(result.data.message);
      if (!result?.res.ok) {
        setSendError(result?.data.error ?? "The retry failed.");
      }
    } catch {
      setSendError("Network error during retry — the reply was not sent again.");
    } finally {
      setRetryingId(null);
    }
  };

  const activeConversation = thread?.conversation ?? null;
  const isLinkedIn = activeConversation?.channel === "linkedin";

  const renderMessageStatus = (msg: InboxMessage) => {
    if (msg.direction === "inbound") {
      return <span className="capitalize">{msg.status}</span>;
    }
    switch (msg.status) {
      case "sent":
        return (
          <span
            className="inline-flex items-center gap-1 text-emerald-400"
            title={msg.provider_message_id ? `Provider ID: ${msg.provider_message_id}` : undefined}
          >
            <Check className="h-3 w-3" /> Sent
          </span>
        );
      case "delivered":
        return (
          <span className="inline-flex items-center gap-1 text-emerald-400">
            <CheckCheck className="h-3 w-3" /> Delivered
          </span>
        );
      case "simulated":
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-300">
            Simulated — not actually sent
          </span>
        );
      case "queued":
        return (
          <span className="inline-flex items-center gap-1 text-black-300">
            <Loader2 className="h-3 w-3 animate-spin" /> Sending…
          </span>
        );
      case "failed":
        return <span className="font-semibold text-rose-400">Failed</span>;
      case "suppressed":
        return (
          <span className="font-semibold text-rose-400">
            Blocked — recipient suppressed
          </span>
        );
      default:
        return <span className="capitalize">{msg.status}</span>;
    }
  };

  return (
    <div className="space-y-4 pb-6 h-[calc(100vh-140px)] flex flex-col">
      {/* Top Banners */}
      <div className="space-y-2 shrink-0">
        <DemoBanner feature="Unified Inbox" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 px-3.5 py-2 text-12 text-blue-200 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Linkedin className="h-4 w-4 text-blue-400 shrink-0" />
              <span>
                <strong>LinkedIn:</strong> No authorized LinkedIn integration is
                connected. Conversations are read-only — replies are disabled.
              </span>
            </span>
          </div>

          <div className="rounded-xl border border-purple-500/30 bg-purple-950/20 px-3.5 py-2 text-12 text-purple-200 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-purple-400 shrink-0" />
              <span>
                <strong>Email:</strong> {emailBannerText(emailState)}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Main Two-Panel Layout */}
      <div className="glass-card flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden border border-black-700/80">
        {/* Left Panel: Conversation List */}
        <div
          className={`w-full lg:w-[340px] shrink-0 border-r border-black-700/70 flex-col bg-black-900/40 ${
            selectedId ? "hidden lg:flex" : "flex"
          }`}
        >
          <div className="p-3.5 border-b border-black-700/70 space-y-2.5">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-black-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search conversations..."
                  className="input-field pl-9 py-2 text-12"
                />
              </div>
              <button
                type="button"
                onClick={() => loadList(false)}
                title="Refresh conversations"
                className="shrink-0 inline-flex items-center justify-center rounded-lg bg-black-800 px-2.5 text-black-300 hover:text-white transition-colors"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${listLoading ? "animate-spin" : ""}`} />
              </button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide text-12">
              {(
                [
                  { key: "all", label: "All" },
                  { key: "unread", label: "Unread" },
                  { key: "linkedin", label: "LinkedIn" },
                  { key: "email", label: "Email" },
                ] as { key: ChannelFilter; label: string }[]
              ).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setChannelFilter(f.key)}
                  className={`rounded-lg px-2.5 py-1 transition-colors whitespace-nowrap ${
                    channelFilter === f.key
                      ? "bg-purple-600 text-white font-medium shadow-glow-purple"
                      : "bg-black-800 text-black-400 hover:text-white"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-black-700/50">
            {listLoading && summaries.length === 0 ? (
              <div className="p-4 space-y-3" aria-label="Loading conversations">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse space-y-2">
                    <div className="h-3.5 w-2/3 rounded bg-black-700" />
                    <div className="h-3 w-1/2 rounded bg-black-800" />
                    <div className="h-3 w-full rounded bg-black-800" />
                  </div>
                ))}
              </div>
            ) : listError ? (
              <div className="p-8 text-center">
                <AlertTriangle className="mx-auto h-6 w-6 text-rose-400 mb-2" />
                <p className="text-12 text-rose-300">{listError}</p>
                <button
                  type="button"
                  onClick={() => loadList(false)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-black-800 px-3 py-1.5 text-12 text-white hover:bg-black-700"
                >
                  <RotateCcw className="h-3 w-3" /> Retry
                </button>
              </div>
            ) : summaries.length === 0 ? (
              <div className="p-8 text-center text-12 text-black-400">
                {debouncedSearch || channelFilter !== "all"
                  ? "No matching conversations found"
                  : "No conversations yet. Replies to your outreach will appear here."}
              </div>
            ) : (
              <>
                {summaries.map((c) => {
                  const isSelected = c.id === selectedId;
                  return (
                    <div
                      key={c.id}
                      data-testid={`conversation-${c.id}`}
                      onClick={() => openConversation(c.id)}
                      className={`p-3.5 cursor-pointer transition-colors relative ${
                        isSelected
                          ? "bg-purple-950/30 border-l-2 border-purple-500"
                          : "hover:bg-black-800/60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black-700 text-11 font-bold text-white">
                            {c.contact_name.charAt(0) || "?"}
                          </div>
                          <span
                            className={`text-13 truncate ${
                              c.unread ? "font-bold text-white" : "font-semibold text-black-100"
                            }`}
                          >
                            {c.contact_name}
                          </span>
                        </div>
                        <span className="text-11 text-black-400 shrink-0">
                          {formatDate(c.last_message_at, "short")}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-11 text-black-400 mb-1.5">
                        <span>{c.company ?? ""}</span>
                        {c.company && <span>&bull;</span>}
                        <span className="flex items-center gap-1 capitalize">
                          {c.channel === "linkedin" ? (
                            <Linkedin className="h-3 w-3 text-blue-400" />
                          ) : (
                            <Mail className="h-3 w-3 text-purple-400" />
                          )}
                          {c.channel}
                        </span>
                      </div>

                      <p
                        className={`text-12 line-clamp-2 leading-relaxed ${
                          c.unread ? "text-black-100" : "text-black-300"
                        }`}
                      >
                        {c.last_message_preview}
                      </p>

                      {c.unread && (
                        <span className="absolute top-3.5 right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-purple-500 px-1 text-9 font-bold text-white shadow-glow-purple">
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                  );
                })}
                {summaries.length < total && (
                  <button
                    type="button"
                    onClick={() => loadList(true)}
                    disabled={listLoading}
                    className="w-full py-3 text-12 font-medium text-purple-300 hover:text-white disabled:opacity-40"
                  >
                    {listLoading ? "Loading…" : `Load more (${total - summaries.length} more)`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right Panel: Active Message Thread */}
        <div
          className={`flex-1 flex-col min-h-0 bg-black-900/20 ${
            selectedId ? "flex" : "hidden lg:flex"
          }`}
        >
          {threadLoading && !thread ? (
            <div className="flex-1 flex items-center justify-center text-black-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : threadError ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <AlertTriangle className="h-8 w-8 text-rose-400 mb-3" />
              <p className="text-13 text-rose-300">{threadError}</p>
              {selectedId && (
                <button
                  type="button"
                  onClick={() => openConversation(selectedId)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-black-800 px-3 py-1.5 text-12 text-white hover:bg-black-700"
                >
                  <RotateCcw className="h-3 w-3" /> Retry
                </button>
              )}
            </div>
          ) : activeConversation && thread ? (
            <>
              {/* Thread Header */}
              <div className="h-16 shrink-0 border-b border-black-700/70 px-5 flex items-center justify-between bg-black-900/60">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(null);
                      setThread(null);
                    }}
                    className="lg:hidden shrink-0 text-black-300 hover:text-white"
                    aria-label="Back to conversations"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-600/20 text-purple-300 font-bold text-13 border border-purple-500/30">
                    {activeConversation.contact_name.charAt(0) || "?"}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-14 text-white truncate">
                        {activeConversation.contact_name}
                      </span>
                      {activeConversation.is_demo && (
                        <span className="demo-badge text-10 py-0 px-1.5">Demo Mode</span>
                      )}
                    </div>
                    <p className="text-12 text-black-400 truncate">
                      {activeConversation.company ? `${activeConversation.company} • ` : ""}
                      {activeConversation.contact_email}
                    </p>
                  </div>
                </div>

                <Badge
                  variant={activeConversation.channel === "linkedin" ? "blue" : "purple"}
                >
                  {activeConversation.channel.toUpperCase()}
                </Badge>
              </div>

              {/* Message History */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {thread.messages.map((msg) => {
                  const isOutbound = msg.direction === "outbound";
                  const isFailed = msg.status === "failed" || msg.status === "suppressed";
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isOutbound ? "items-end" : "items-start"}`}
                    >
                      <div className="flex items-center gap-1.5 mb-1 text-11 text-black-400">
                        <span>
                          {isOutbound ? "You" : activeConversation.contact_name}
                        </span>
                        <span>&bull;</span>
                        <span>{formatDate(msg.sent_at, "short")}</span>
                        {msg.is_demo && (
                          <span className="demo-badge text-9 py-0 px-1">Demo Mode</span>
                        )}
                      </div>

                      <div
                        className={`max-w-[80%] rounded-2xl p-4 text-13 leading-relaxed whitespace-pre-wrap ${
                          isOutbound
                            ? "bg-purple-600 text-white rounded-tr-none shadow-glow-purple"
                            : "bg-black-800 text-black-100 rounded-tl-none border border-black-700"
                        }`}
                      >
                        {msg.subject && (
                          <div className="font-semibold text-12 mb-1.5 pb-1 border-b border-white/20">
                            {msg.subject}
                          </div>
                        )}
                        <p>{msg.content}</p>
                      </div>

                      <div className="flex items-center gap-2 mt-1 text-10 text-black-500">
                        {renderMessageStatus(msg)}
                      </div>

                      {isOutbound && isFailed && (
                        <div className="mt-1.5 max-w-[80%] rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-11 text-rose-200">
                          <p>{msg.error ?? "The provider rejected this reply."}</p>
                          {msg.idempotency_key && (
                            <button
                              type="button"
                              onClick={() => handleRetry(msg)}
                              disabled={retryingId === msg.id}
                              className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-rose-600/80 px-2 py-1 font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
                            >
                              {retryingId === msg.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3 w-3" />
                              )}
                              Retry — safe, will not send twice
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply Composer / LinkedIn notice */}
              <div className="p-4 border-t border-black-700/70 bg-black-900/80 shrink-0">
                {isLinkedIn ? (
                  <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 px-4 py-3 text-12 text-blue-200 flex items-start gap-2.5">
                    <Linkedin className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                    <p>
                      Replies via LinkedIn require an authorized LinkedIn
                      integration. None is connected, so sending is disabled —
                      nothing here can message this contact.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSendReply} className="space-y-2.5">
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Subject"
                      className="input-field py-2 text-12"
                      aria-label="Reply subject"
                    />
                    <div className="flex gap-2.5">
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Write your reply…"
                        rows={3}
                        className="input-field py-2.5 text-13 flex-1 resize-none"
                        aria-label="Reply message"
                      />
                      <button
                        type="submit"
                        disabled={!replyText.trim() || sending}
                        className="inline-flex items-center gap-1.5 self-end rounded-xl bg-purple-600 hover:bg-purple-500 px-5 py-2.5 text-13 font-semibold text-white shadow-glow-purple transition-all disabled:opacity-40"
                      >
                        {sending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        <span>{sending ? "Sending…" : "Send"}</span>
                      </button>
                    </div>
                    <EmailContentHints
                      subject={subject}
                      body={replyText}
                      context="reply"
                    />
                    {sendError && (
                      <p className="flex items-center gap-1.5 text-12 text-rose-300">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        {sendError}
                      </p>
                    )}
                  </form>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-black-400">
              <MessageSquare className="h-10 w-10 text-black-600 mb-3" />
              <p className="text-14 font-medium text-white">No conversation selected</p>
              <p className="text-12 text-black-400 mt-1">
                Select a conversation from the left panel to inspect messages and reply.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
