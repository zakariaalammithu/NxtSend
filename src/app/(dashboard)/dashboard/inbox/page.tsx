"use client";

import * as React from "react";
import { MessageSquare, Search, Linkedin, Mail, Send, CheckCheck } from "lucide-react";
import { DemoBanner, Badge } from "@/components/ui";
import { MOCK_MESSAGES, MOCK_LEADS } from "@/lib/db/mock/data";
import { formatDate } from "@/lib/utils";
import type { Message, MessageChannel } from "@/types";

interface Conversation {
  leadId: string;
  leadName: string;
  leadEmail: string;
  company: string;
  channel: MessageChannel;
  messages: Message[];
  unread: boolean;
  lastMessage: Message;
}

export default function InboxPage() {
  // Group MOCK_MESSAGES into conversations
  const conversations: Conversation[] = React.useMemo(() => {
    const grouped: Record<string, Message[]> = {};
    MOCK_MESSAGES.forEach((m) => {
      if (!grouped[m.lead_id]) grouped[m.lead_id] = [];
      grouped[m.lead_id].push(m);
    });

    return Object.entries(grouped).map(([leadId, msgs]) => {
      const lead = MOCK_LEADS.find((l) => l.id === leadId);
      const leadName = lead ? `${lead.first_name} ${lead.last_name}` : "Prospect";
      const leadEmail = lead?.email || "prospect@company.com";
      const company = lead?.company || "Company";
      const lastMessage = msgs[msgs.length - 1];
      const channel = lastMessage.channel;
      const unread = msgs.some((m) => m.direction === "inbound" && m.status === "replied");

      return {
        leadId,
        leadName,
        leadEmail,
        company,
        channel,
        messages: msgs,
        unread,
        lastMessage,
      };
    });
  }, []);

  const [selectedLeadId, setSelectedLeadId] = React.useState<string>(
    conversations[0]?.leadId || ""
  );
  const [searchQuery, setSearchQuery] = React.useState("");
  const [channelFilter, setChannelFilter] = React.useState<string>("all");
  const [replyText, setReplyText] = React.useState("");
  const [localConversations, setLocalConversations] = React.useState(conversations);

  const activeConversation = localConversations.find(
    (c) => c.leadId === selectedLeadId
  );

  const filteredConversations = localConversations.filter((c) => {
    const matchesSearch =
      c.leadName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.lastMessage.content.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter =
      channelFilter === "all"
        ? true
        : channelFilter === "unread"
        ? c.unread
        : c.channel === channelFilter;

    return matchesSearch && matchesFilter;
  });

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !activeConversation) return;

    const newMsg: Message = {
      id: `msg_demo_${Date.now()}`,
      workspace_id: "ws_demo_001",
      lead_id: activeConversation.leadId,
      channel: activeConversation.channel,
      direction: "outbound",
      content: replyText,
      status: "delivered",
      is_demo: true,
      sent_at: new Date().toISOString(),
    };

    setLocalConversations((prev) =>
      prev.map((c) => {
        if (c.leadId === activeConversation.leadId) {
          return {
            ...c,
            messages: [...c.messages, newMsg],
            lastMessage: newMsg,
            unread: false,
          };
        }
        return c;
      })
    );

    setReplyText("");
  };

  return (
    <div className="space-y-4 pb-6 h-[calc(100vh-140px)] flex flex-col">
      {/* Top Banners */}
      <div className="space-y-2 shrink-0">
        <DemoBanner feature="Unified Inbox" />

        {/* Integration Status Notices */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 px-3.5 py-2 text-12 text-blue-200 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Linkedin className="h-4 w-4 text-blue-400" />
              <span>
                <strong>LinkedIn:</strong> Not connected to live cookies. Showing simulated inbox.
              </span>
            </span>
            <span className="demo-badge text-10 py-0 px-2">Demo</span>
          </div>

          <div className="rounded-xl border border-purple-500/30 bg-purple-950/20 px-3.5 py-2 text-12 text-purple-200 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-purple-400" />
              <span>
                <strong>Email:</strong> Resend API sandbox active. Live sending disabled.
              </span>
            </span>
            <span className="demo-badge text-10 py-0 px-2">Demo</span>
          </div>
        </div>
      </div>

      {/* Main Two-Panel Layout */}
      <div className="glass-card flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden border border-black-700/80">
        {/* Left Panel: Conversation List (320px) */}
        <div className="w-full lg:w-[340px] shrink-0 border-r border-black-700/70 flex flex-col bg-black-900/40">
          {/* Search & Channel Filter */}
          <div className="p-3.5 border-b border-black-700/70 space-y-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-black-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations..."
                className="input-field pl-9 py-2 text-12"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide text-12">
              {[
                { key: "all", label: "All" },
                { key: "unread", label: "Unread" },
                { key: "linkedin", label: "LinkedIn" },
                { key: "email", label: "Email" },
              ].map((f) => (
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

          {/* Conversation List Items */}
          <div className="flex-1 overflow-y-auto divide-y divide-black-700/50">
            {filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-12 text-black-400">
                No matching conversations found
              </div>
            ) : (
              filteredConversations.map((c) => {
                const isSelected = c.leadId === selectedLeadId;

                return (
                  <div
                    key={c.leadId}
                    onClick={() => setSelectedLeadId(c.leadId)}
                    className={`p-3.5 cursor-pointer transition-colors relative ${
                      isSelected
                        ? "bg-purple-950/30 border-l-2 border-purple-500"
                        : "hover:bg-black-800/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black-700 text-11 font-bold text-white">
                          {c.leadName.charAt(0)}
                        </div>
                        <span className="font-semibold text-13 text-white truncate">
                          {c.leadName}
                        </span>
                      </div>

                      <span className="text-11 text-black-400 shrink-0">
                        {formatDate(c.lastMessage.sent_at, "short")}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-11 text-black-400 mb-1.5">
                      <span>{c.company}</span>
                      <span>&bull;</span>
                      <span className="flex items-center gap-1 capitalize">
                        {c.channel === "linkedin" ? (
                          <Linkedin className="h-3 w-3 text-blue-400" />
                        ) : (
                          <Mail className="h-3 w-3 text-purple-400" />
                        )}
                        {c.channel}
                      </span>
                    </div>

                    <p className="text-12 text-black-300 line-clamp-2 leading-relaxed">
                      {c.lastMessage.content}
                    </p>

                    {c.unread && (
                      <span className="absolute top-3.5 right-2 h-2 w-2 rounded-full bg-purple-500 shadow-glow-purple" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel: Active Message Thread */}
        <div className="flex-1 flex flex-col min-h-0 bg-black-900/20">
          {activeConversation ? (
            <>
              {/* Thread Header */}
              <div className="h-16 shrink-0 border-b border-black-700/70 px-5 flex items-center justify-between bg-black-900/60">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-600/20 text-purple-300 font-bold text-13 border border-purple-500/30">
                    {activeConversation.leadName.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-14 text-white truncate">
                        {activeConversation.leadName}
                      </span>
                      <span className="demo-badge text-10 py-0 px-1.5">
                        Demo Mode
                      </span>
                    </div>
                    <p className="text-12 text-black-400 truncate">
                      {activeConversation.company} &bull; {activeConversation.leadEmail}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      activeConversation.channel === "linkedin" ? "blue" : "purple"
                    }
                  >
                    {activeConversation.channel.toUpperCase()}
                  </Badge>
                </div>
              </div>

              {/* Message History (Scrollable) */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {activeConversation.messages.map((msg) => {
                  const isOutbound = msg.direction === "outbound";

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${
                        isOutbound ? "items-end" : "items-start"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1 text-11 text-black-400">
                        <span>{isOutbound ? "You (Alex Vance)" : activeConversation.leadName}</span>
                        <span>&bull;</span>
                        <span>{formatDate(msg.sent_at, "short")}</span>
                        <span className="demo-badge text-9 py-0 px-1">
                          Demo Mode
                        </span>
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

                      <div className="flex items-center gap-1 mt-1 text-10 text-black-500">
                        {isOutbound && <CheckCheck className="h-3 w-3 text-purple-400" />}
                        <span className="capitalize">{msg.status}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reply Composer */}
              <div className="p-4 border-t border-black-700/70 bg-black-900/80">
                <form onSubmit={handleSendReply} className="flex gap-2.5">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={`Reply via ${activeConversation.channel}...`}
                    className="input-field py-2.5 text-13 flex-1"
                  />
                  <button
                    type="submit"
                    disabled={!replyText.trim()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 px-5 text-13 font-semibold text-white shadow-glow-purple transition-all disabled:opacity-40"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Send</span>
                  </button>
                </form>
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
