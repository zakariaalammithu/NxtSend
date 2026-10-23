"use client";

/**
 * NxtSend Support — visitor chat widget (P10 Stage F).
 *
 * Mounted in the marketing layout only. Talks to the Stage E public
 * API (/api/support/*) — short-interval polling behind plain fetch
 * calls (no WebSocket/Realtime claims). The conversation is created
 * lazily: opening the panel only READS (GET current); the thread is
 * created by the first message via POST /conversations with
 * first_message, so an optional guest name/email can ride along and
 * merely opening the widget never creates an empty inbox thread.
 *
 * Honesty rules: no presence or typing indicators exist in the API,
 * so none are shown; "an agent is available" is stated only when the
 * config endpoint's truthful `live_available` says so. Message
 * bodies render as plain text (React text nodes) — never HTML.
 */

import * as React from "react";
import { AlertCircle, MessageCircle, Minus, RotateCcw, Send, UserRound, X } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";
import {
  canOfferEscalation,
  formatClock,
  lastSequence,
  mergeMessages,
  messageSide,
  newClientMessageId,
  senderLabel,
  type SupportWidgetConfig,
  type WidgetConversation,
  type WidgetMessage,
} from "./widget-core";

const POLL_OPEN_MS = 4000;
const POLL_CLOSED_MS = 30000;
const MAX_BODY = 4000;

interface CurrentResponse {
  mode?: string;
  conversation: WidgetConversation;
  messages: WidgetMessage[];
}

async function apiJson(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body };
}

export function SupportWidget() {
  const [config, setConfig] = React.useState<SupportWidgetConfig | null>(null);
  const [open, setOpen] = React.useState(false);
  const [conversation, setConversation] = React.useState<WidgetConversation | null>(null);
  const [messages, setMessages] = React.useState<WidgetMessage[]>([]);
  const [draft, setDraft] = React.useState("");
  const [guestName, setGuestName] = React.useState("");
  const [guestEmail, setGuestEmail] = React.useState("");
  const [loadingThread, setLoadingThread] = React.useState(false);
  const [escalating, setEscalating] = React.useState(false);
  const [escalatedNote, setEscalatedNote] = React.useState<string | null>(null);
  const [errorNote, setErrorNote] = React.useState<string | null>(null);

  const messagesRef = React.useRef<WidgetMessage[]>([]);
  messagesRef.current = messages;
  const conversationRef = React.useRef<WidgetConversation | null>(null);
  conversationRef.current = conversation;
  const openRef = React.useRef(false);
  openRef.current = open;
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const unread = conversation?.visitor_unread_count ?? 0;

  const scrollToBottom = React.useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  React.useEffect(() => {
    if (open) scrollToBottom();
  }, [messages, open, scrollToBottom]);

  const markRead = React.useCallback(async (id: string) => {
    const res = await apiJson(`/api/support/conversations/${id}/read`, { method: "POST" });
    if (res.ok && res.body.conversation) {
      setConversation(res.body.conversation as WidgetConversation);
    }
  }, []);

  /** One polling read: full when we have nothing, cursor-based after. */
  const pollCurrent = React.useCallback(async () => {
    const after = lastSequence(messagesRef.current);
    const url =
      conversationRef.current && after > 0
        ? `/api/support/conversations/current?after=${after}`
        : "/api/support/conversations/current";
    const res = await apiJson(url);
    if (res.status === 404) return;
    if (!res.ok) return;
    const data = res.body as unknown as CurrentResponse;
    setConversation(data.conversation);
    if (data.messages?.length) {
      setMessages((prev) => mergeMessages(prev, data.messages));
    }
    if (openRef.current && data.conversation.visitor_unread_count > 0) {
      void markRead(data.conversation.id);
    }
  }, [markRead]);

  // Initial load: config (button label) + an unread probe.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiJson("/api/support/config");
      if (!cancelled && res.ok) setConfig(res.body as unknown as SupportWidgetConfig);
      const current = await apiJson("/api/support/conversations/current");
      if (!cancelled && current.ok) {
        const data = current.body as unknown as CurrentResponse;
        setConversation(data.conversation);
        if (data.messages?.length) {
          setMessages((prev) => mergeMessages(prev, data.messages));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Polling while open (~4s, paused when the tab is hidden).
  React.useEffect(() => {
    if (!open) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void pollCurrent();
    };
    const interval = window.setInterval(tick, POLL_OPEN_MS);
    const onVisible = () => {
      if (!document.hidden) void pollCurrent();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [open, pollCurrent]);

  // Slow unread poll while closed (only once a conversation exists).
  React.useEffect(() => {
    if (open || !conversation) return;
    const interval = window.setInterval(() => {
      void pollCurrent();
    }, POLL_CLOSED_MS);
    return () => window.clearInterval(interval);
  }, [open, conversation, pollCurrent]);

  const openPanel = async () => {
    setOpen(true);
    if (!conversationRef.current) {
      setLoadingThread(true);
      await pollCurrent();
      setLoadingThread(false);
    } else if (conversationRef.current.visitor_unread_count > 0) {
      void markRead(conversationRef.current.id);
      void pollCurrent();
    }
  };

  const postMessage = async (pending: WidgetMessage) => {
    const body = pending.body;
    const clientMessageId = pending.clientMessageId!;
    try {
      let res: { ok: boolean; status: number; body: Record<string, unknown> };
      const current = conversationRef.current;
      if (!current) {
        // Lazy creation: first message creates the thread (guest
        // identity rides along; the welcome + bot reply come back in
        // the same response).
        res = await apiJson("/api/support/conversations", {
          method: "POST",
          body: JSON.stringify({
            name: guestName.trim() || undefined,
            email: guestEmail.trim() || undefined,
            first_message: body,
            entry_page: typeof window !== "undefined" ? window.location.pathname : undefined,
          }),
        });
      } else {
        res = await apiJson(`/api/support/conversations/${current.id}/messages`, {
          method: "POST",
          body: JSON.stringify({ body, client_message_id: clientMessageId }),
        });
      }
      if (!res.ok) {
        throw new Error(
          typeof res.body.error === "string" ? res.body.error : "Message failed to send."
        );
      }
      const data = res.body as unknown as CurrentResponse;
      if (data.conversation) setConversation(data.conversation);
      setMessages((prev) => {
        const confirmed = prev.filter((m) => m.clientMessageId !== clientMessageId);
        return mergeMessages(confirmed, data.messages ?? []);
      });
      if (data.conversation?.visitor_unread_count) void markRead(data.conversation.id);
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.clientMessageId === clientMessageId ? { ...m, localState: "failed" as const } : m
        )
      );
      setErrorNote(err instanceof Error ? err.message : "Message failed to send.");
    }
  };

  const sendDraft = () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    setErrorNote(null);
    const pending: WidgetMessage = {
      id: `local-${Date.now()}`,
      sequence_no: Number.MAX_SAFE_INTEGER,
      sender_type: "visitor",
      sender_display_name: null,
      kind: "message",
      body,
      created_at: new Date().toISOString(),
      localState: "sending",
      clientMessageId: newClientMessageId(),
    };
    setMessages((prev) => [...prev, pending]);
    void postMessage(pending);
  };

  const retry = (message: WidgetMessage) => {
    setErrorNote(null);
    setMessages((prev) =>
      prev.map((m) => (m.id === message.id ? { ...m, localState: "sending" as const } : m))
    );
    void postMessage({ ...message, localState: "sending" });
  };

  const escalate = async () => {
    const current = conversationRef.current;
    if (!current || escalating) return;
    setEscalating(true);
    setErrorNote(null);
    try {
      const res = await apiJson(`/api/support/conversations/${current.id}/escalate`, {
        method: "POST",
      });
      if (!res.ok) {
        const offline =
          typeof res.body.offline_message === "string" ? res.body.offline_message : null;
        throw new Error(
          offline ??
            (typeof res.body.error === "string"
              ? res.body.error
              : "Live support is not available right now.")
        );
      }
      const data = res.body as unknown as {
        conversation: WidgetConversation;
        agent_available?: boolean;
      };
      setConversation(data.conversation);
      setEscalatedNote(
        data.agent_available
          ? "You're now chatting with the support team — an agent will reply here."
          : config?.offline_message ??
              "The support team isn't available right now, but your message is saved and they'll reply here."
      );
      void pollCurrent();
    } catch (err) {
      setErrorNote(err instanceof Error ? err.message : "Could not reach the support team.");
    } finally {
      setEscalating(false);
    }
  };

  const reopen = async () => {
    const current = conversationRef.current;
    if (!current) return;
    const res = await apiJson(`/api/support/conversations/${current.id}/reopen`, {
      method: "POST",
    });
    if (res.ok && res.body.conversation) {
      setConversation(res.body.conversation as WidgetConversation);
      setEscalatedNote(null);
      void pollCurrent();
    }
  };

  const onComposerKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendDraft();
    }
  };

  // Textarea auto-grow (capped).
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

  const displayName = config?.display_name ?? "NxtSend Support";
  const offerEscalation = canOfferEscalation(config, conversation);
  const inHumanMode = conversation?.handling_mode === "human";
  const isResolved = conversation?.status === "resolved";
  // A bot answer directly follows a visitor message — surface the
  // "talk to a person" prompt prominently right under it.
  const lastConfirmed = [...messages].reverse().find((m) => !m.localState);
  const botJustAnswered =
    offerEscalation && lastConfirmed?.sender_type === "ai" && messages.length > 1;

  if (!config) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => void openPanel()}
          aria-expanded={false}
          aria-label={`Open ${displayName} chat${unread > 0 ? `, ${unread} unread` : ""}`}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-gradient-brand px-4 py-3 text-13 font-semibold text-white shadow-glow-purple transition hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
        >
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
          <span className="hidden sm:inline">{displayName}</span>
          {unread > 0 && (
            <span
              className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-11 font-bold text-purple-700"
              aria-hidden="true"
            >
              {unread}
            </span>
          )}
        </button>
      )}

      {open && (
        <section
          role="dialog"
          aria-label={`${displayName} chat`}
          className="fixed bottom-5 right-5 z-40 flex flex-col overflow-hidden rounded-2xl border border-black-700 bg-black-900 shadow-2xl"
          style={{
            width: "min(380px, calc(100vw - 24px))",
            height: "min(600px, calc(100dvh - 100px))",
          }}
        >
          {/* Header */}
          <header className="flex items-center gap-2.5 border-b border-black-700/70 bg-black-800/60 px-4 py-3">
            <Logo variant="mark" size={26} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-14 font-bold text-white">{displayName}</p>
              <p className="truncate text-11 text-black-400">
                {inHumanMode ? "Chatting with the support team" : "Ask a question any time"}
              </p>
            </div>
            {config.mode === "demo" && <span className="demo-badge">Demo</span>}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Minimise chat"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-black-300 hover:bg-black-700 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-black-300 hover:bg-black-700 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3.5 py-3.5">
            {!conversation && !loadingThread && (
              <div className="space-y-3">
                <div className="rounded-2xl rounded-bl-md bg-black-800 px-3.5 py-2.5 text-13 leading-relaxed text-black-100">
                  {config.greeting}
                </div>
                <div className="rounded-xl border border-black-700/70 bg-black-800/40 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-11 font-semibold uppercase tracking-wide text-black-400">
                    <UserRound className="h-3.5 w-3.5" /> Visiting as a guest? (optional)
                  </p>
                  <div className="space-y-2">
                    <input
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Your name"
                      aria-label="Your name (optional)"
                      className="w-full rounded-lg border border-black-700 bg-black-900 px-2.5 py-1.5 text-13 text-white placeholder:text-black-500 focus:border-purple-500 focus:outline-none"
                    />
                    <input
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="Email for replies"
                      type="email"
                      aria-label="Email for replies (optional)"
                      className="w-full rounded-lg border border-black-700 bg-black-900 px-2.5 py-1.5 text-13 text-white placeholder:text-black-500 focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                  <p className="mt-2 text-11 text-black-500">
                    You can start chatting right away — this only helps the team reply to you.
                  </p>
                </div>
              </div>
            )}

            {loadingThread && messages.length === 0 && (
              <p className="py-6 text-center text-13 text-black-400">Loading conversation…</p>
            )}

            {messages.map((message) => {
              const side = messageSide(message);
              if (side === "system") {
                return (
                  <p
                    key={message.id}
                    className="mx-auto max-w-[85%] rounded-full bg-black-800/80 px-3 py-1.5 text-center text-11 leading-relaxed text-black-300"
                  >
                    {message.body}
                  </p>
                );
              }
              const own = side === "own";
              return (
                <div key={message.id} className={cn("flex flex-col", own ? "items-end" : "items-start")}>
                  <span className="mb-1 px-1 text-11 font-medium text-black-400">
                    {senderLabel(message, config)} · {formatClock(message.created_at)}
                  </span>
                  <div
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-13 leading-relaxed",
                      own
                        ? "rounded-br-md bg-purple-600 text-white"
                        : "rounded-bl-md bg-black-800 text-black-100"
                    )}
                  >
                    {message.body}
                  </div>
                  {message.localState === "sending" && (
                    <span className="mt-1 px-1 text-11 text-black-400">Sending…</span>
                  )}
                  {message.localState === "failed" && (
                    <span className="mt-1 flex items-center gap-2 px-1 text-11 text-rose-300">
                      <AlertCircle className="h-3.5 w-3.5" /> Not sent
                      <button
                        type="button"
                        onClick={() => retry(message)}
                        className="font-semibold text-rose-200 underline underline-offset-2 hover:text-white"
                      >
                        Retry
                      </button>
                    </span>
                  )}
                </div>
              );
            })}

            {botJustAnswered && (
              <div className="rounded-xl border border-purple-500/30 bg-purple-950/20 px-3 py-2.5 text-12 text-purple-200">
                Not the answer you needed?{" "}
                <button
                  type="button"
                  onClick={() => void escalate()}
                  disabled={escalating}
                  className="font-semibold text-white underline underline-offset-2 hover:text-purple-100 disabled:opacity-60"
                >
                  Talk to a person
                </button>
              </div>
            )}

            {escalatedNote && inHumanMode && (
              <div
                role="status"
                className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-3 py-2.5 text-12 leading-relaxed text-emerald-200"
              >
                {escalatedNote}
              </div>
            )}

            {isResolved && (
              <div className="space-y-2 rounded-xl border border-black-700 bg-black-800/50 px-3 py-2.5 text-center">
                <p className="text-12 text-black-300">This conversation was resolved.</p>
                <button
                  type="button"
                  onClick={() => void reopen()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-black-700 px-3 py-1.5 text-12 font-semibold text-white hover:bg-black-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Start a new conversation
                </button>
              </div>
            )}

            {errorNote && (
              <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-12 text-rose-200">
                {errorNote}
              </p>
            )}
          </div>

          {/* Escalation strip */}
          {offerEscalation && !botJustAnswered && (
            <div className="border-t border-black-800 px-3.5 py-2">
              <button
                type="button"
                onClick={() => void escalate()}
                disabled={escalating}
                className="text-12 font-semibold text-purple-300 hover:text-purple-200 disabled:opacity-60"
              >
                {escalating ? "Connecting you…" : "Talk to a person instead"}
              </button>
            </div>
          )}

          {/* Composer */}
          <div className="border-t border-black-700/70 px-3 py-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onComposerKey}
                placeholder="Type your message…"
                aria-label="Type your message"
                rows={1}
                maxLength={MAX_BODY}
                className="max-h-[120px] flex-1 resize-none rounded-xl border border-black-700 bg-black-800 px-3 py-2.5 text-13 text-white placeholder:text-black-500 focus:border-purple-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={sendDraft}
                disabled={!draft.trim()}
                aria-label="Send message"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white transition hover:bg-purple-500 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1.5 text-11 text-black-500">Enter to send · Shift+Enter for a new line</p>
          </div>
        </section>
      )}
    </>
  );
}
