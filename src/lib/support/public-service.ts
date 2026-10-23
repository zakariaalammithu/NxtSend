/**
 * Support public service (P10 Stage E) — the logic behind
 * /api/support/*. Routes stay thin: they resolve the visitor
 * identity, enforce rate limits, and hand over to these functions.
 * Everything here is store-agnostic (Supabase or demo) and unit-tested
 * against the demo store.
 *
 * Honesty rules enforced here:
 *  - the config projection exposes settings-derived copy and mode
 *    flags only — never token hashes, KB internals or agent names;
 *  - "live support available" is claimed ONLY when live support is
 *    enabled AND at least one eligible agent has DECLARED themselves
 *    available (support_agents.availability) — no presence fiction;
 *  - ai_enhancement reports "configured" only when the enhancement
 *    switch is on AND a provider key actually exists.
 */

import { getSupportAIEnhancementState } from "./ai";
import {
  GUEST_TOKEN_TTL_MS,
  generateGuestToken,
  hashGuestToken,
} from "./guest-auth";
import { runBotPipeline, type BotPipelineDeps } from "./pipeline";
import { authoriseConversationAccess, type VisitorIdentity } from "./request-auth";
import type { SupportStore } from "./store";
import {
  toVisitorConversation,
  toVisitorMessage,
  type SupportConversation,
  type SupportMessage,
  type SupportSettings,
  type VisitorSupportMessage,
} from "./types";
import { validateGuestIdentity, validateMessageBody } from "./validate";

export interface ServiceResult {
  status: number;
  body: Record<string, unknown>;
  /** Set only by guest conversation creation; the route turns it into the HttpOnly cookie. */
  rawGuestToken?: string;
}

function visitorMessages(messages: SupportMessage[]): VisitorSupportMessage[] {
  return messages
    .map(toVisitorMessage)
    .filter((m): m is VisitorSupportMessage => m !== null);
}

export async function anyAgentAvailable(
  store: SupportStore,
  settings: SupportSettings
): Promise<boolean> {
  if (!settings.live_support_enabled) return false;
  const agents = await store.listAgents();
  return agents.some((agent) => agent.eligible && agent.availability === "available");
}

// ── Config ─────────────────────────────────────────────────────────────────

export async function getSupportConfig(store: SupportStore): Promise<ServiceResult> {
  const settings = await store.getSettings();
  const aiState = getSupportAIEnhancementState();
  return {
    status: 200,
    body: {
      mode: store.mode,
      display_name: settings.display_name,
      greeting: settings.greeting,
      welcome_message: settings.welcome_message,
      offline_message: settings.offline_message,
      closing_message: settings.closing_message,
      support_email: settings.support_email,
      ai_kb_enabled: settings.ai_kb_enabled,
      live_support_enabled: settings.live_support_enabled,
      allow_user_escalation: settings.allow_user_escalation,
      live_available: await anyAgentAvailable(store, settings),
      ai_enhancement:
        settings.ai_enhancement_enabled && aiState.configured
          ? "configured"
          : "not_configured",
    },
  };
}

// ── Conversation creation ──────────────────────────────────────────────────

export async function createSupportConversation(
  store: SupportStore,
  identity: VisitorIdentity,
  input: { name?: unknown; email?: unknown; firstMessage?: unknown; entryPage?: unknown },
  deps: BotPipelineDeps = {}
): Promise<ServiceResult> {
  const settings = await store.getSettings();

  if (identity.user) {
    if (identity.user.status === "suspended") {
      return { status: 403, body: { error: "This account is suspended." } };
    }
    // One open thread per signed-in user: reuse it rather than
    // fragmenting the conversation across rows.
    const existing = await store.findLatestOpenConversationForUser(identity.user.userId);
    if (existing) {
      const messages = await store.listMessages(existing.id, { includeInternal: false });
      return {
        status: 200,
        body: {
          mode: store.mode,
          existing: true,
          conversation: toVisitorConversation(existing),
          messages: visitorMessages(messages),
        },
      };
    }
    const conversation = await store.createConversation({
      user_id: identity.user.userId,
      guest_name: null,
      guest_email: null,
      guest_access_token_hash: null,
      guest_token_expires_at: null,
      workspace_id: null,
      source: "marketing_widget",
      metadata: typeof input.entryPage === "string" ? { entry_page: input.entryPage.slice(0, 200) } : {},
    });
    return finishCreation(store, settings, conversation, identity, input, deps);
  }

  const guest = validateGuestIdentity({ name: input.name, email: input.email });
  if (!guest.ok) return { status: 400, body: { error: guest.error } };

  const rawToken = generateGuestToken();
  const expiresAt = new Date(Date.now() + GUEST_TOKEN_TTL_MS).toISOString();
  const conversation = await store.createConversation({
    user_id: null,
    guest_name: guest.value.name,
    guest_email: guest.value.email,
    guest_access_token_hash: hashGuestToken(rawToken),
    guest_token_expires_at: expiresAt,
    workspace_id: null,
    source: "marketing_widget",
    metadata: typeof input.entryPage === "string" ? { entry_page: input.entryPage.slice(0, 200) } : {},
  });
  const result = await finishCreation(store, settings, conversation, identity, input, deps);
  return { ...result, rawGuestToken: rawToken };
}

async function finishCreation(
  store: SupportStore,
  settings: SupportSettings,
  conversation: SupportConversation,
  identity: VisitorIdentity,
  input: { firstMessage?: unknown },
  deps: BotPipelineDeps
): Promise<ServiceResult> {
  const posted: SupportMessage[] = [];

  if (settings.welcome_message) {
    const { message } = await store.postMessage({
      conversation_id: conversation.id,
      sender_type: "ai",
      sender_profile_id: null,
      sender_display_name: settings.display_name,
      kind: "message",
      body: settings.welcome_message,
      metadata: { engine: "welcome" },
    });
    posted.push(message);
  }

  if (input.firstMessage !== undefined && input.firstMessage !== null && input.firstMessage !== "") {
    const result = await postVisitorMessageInternal(store, settings, conversation, identity, {
      body: input.firstMessage,
      clientMessageId: null,
    }, deps);
    if (result) posted.push(...result);
  }

  const messages = await store.listMessages(conversation.id, { includeInternal: false });
  const fresh = (await store.getConversation(conversation.id)) ?? conversation;
  return {
    status: 201,
    body: {
      mode: store.mode,
      conversation: toVisitorConversation(fresh),
      messages: visitorMessages(messages.length ? messages : posted),
    },
  };
}

// ── Current conversation (polling read) ────────────────────────────────────

export async function getCurrentSupportConversation(
  store: SupportStore,
  identity: VisitorIdentity,
  afterSequence?: number
): Promise<ServiceResult> {
  let conversation: SupportConversation | null = null;
  if (identity.user) {
    conversation = await store.findLatestOpenConversationForUser(identity.user.userId);
  }
  if (!conversation && identity.guestTokenHash) {
    const byGuest = await store.findConversationByGuestHash(identity.guestTokenHash);
    if (byGuest && authoriseConversationAccess(byGuest, identity)) conversation = byGuest;
  }
  if (!conversation) {
    return { status: 404, body: { error: "No current conversation" } };
  }
  const messages = await store.listMessages(conversation.id, {
    includeInternal: false,
    afterSequence,
  });
  return {
    status: 200,
    body: {
      mode: store.mode,
      conversation: toVisitorConversation(conversation),
      messages: visitorMessages(messages),
    },
  };
}

// ── Posting a visitor message ──────────────────────────────────────────────

export async function loadAuthorisedConversation(
  store: SupportStore,
  identity: VisitorIdentity,
  conversationId: string
): Promise<SupportConversation | null> {
  const conversation = await store.getConversation(conversationId);
  if (!conversation) return null;
  // Unauthorised looks exactly like missing: a conversation ID alone
  // never authorises, and probing IDs must not confirm existence.
  if (!authoriseConversationAccess(conversation, identity)) return null;
  return conversation;
}

async function postVisitorMessageInternal(
  store: SupportStore,
  settings: SupportSettings,
  conversation: SupportConversation,
  identity: VisitorIdentity,
  input: { body: unknown; clientMessageId: string | null },
  deps: BotPipelineDeps
): Promise<SupportMessage[] | null> {
  const validation = validateMessageBody(input.body);
  if (!validation.ok) return null;

  const isUser = !!identity.user && conversation.user_id === identity.user.userId;
  const senderName = isUser
    ? (identity.user?.displayName ?? conversation.guest_name)
    : conversation.guest_name;

  const { message, duplicate } = await store.postMessage({
    conversation_id: conversation.id,
    sender_type: isUser ? "user" : "visitor",
    sender_profile_id: isUser ? identity.user!.userId : null,
    sender_display_name: senderName,
    kind: "message",
    body: validation.value,
    client_message_id: input.clientMessageId,
  });
  if (duplicate) return [message];

  const fresh = (await store.getConversation(conversation.id)) ?? conversation;
  const botMessages = await runBotPipeline(store, settings, fresh, validation.value, deps);
  return [message, ...botMessages];
}

export async function postSupportMessage(
  store: SupportStore,
  identity: VisitorIdentity,
  conversationId: string,
  input: { body?: unknown; clientMessageId?: string | null },
  deps: BotPipelineDeps = {}
): Promise<ServiceResult> {
  if (identity.user?.status === "suspended") {
    return { status: 403, body: { error: "This account is suspended." } };
  }
  const conversation = await loadAuthorisedConversation(store, identity, conversationId);
  if (!conversation) return { status: 404, body: { error: "Conversation not found" } };

  const validation = validateMessageBody(input.body);
  if (!validation.ok) return { status: 400, body: { error: validation.error } };

  // Idempotent retry: the original message (and its bot reply, if any
  // followed) already exists — return it without duplicating or
  // re-running the pipeline.
  if (input.clientMessageId) {
    const existing = await store.findMessageByClientId(conversationId, input.clientMessageId);
    if (existing) {
      const fresh = (await store.getConversation(conversationId)) ?? conversation;
      return {
        status: 200,
        body: {
          mode: store.mode,
          duplicate: true,
          conversation: toVisitorConversation(fresh),
          messages: visitorMessages([existing]),
        },
      };
    }
  }

  const settings = await store.getSettings();
  const posted = await postVisitorMessageInternal(
    store,
    settings,
    conversation,
    identity,
    { body: input.body, clientMessageId: input.clientMessageId ?? null },
    deps
  );
  const fresh = (await store.getConversation(conversationId)) ?? conversation;
  return {
    status: 201,
    body: {
      mode: store.mode,
      conversation: toVisitorConversation(fresh),
      messages: visitorMessages(posted ?? []),
    },
  };
}

// ── Escalation / read / reopen ─────────────────────────────────────────────

export async function escalateSupportConversation(
  store: SupportStore,
  identity: VisitorIdentity,
  conversationId: string
): Promise<ServiceResult> {
  if (identity.user?.status === "suspended") {
    return { status: 403, body: { error: "This account is suspended." } };
  }
  const conversation = await loadAuthorisedConversation(store, identity, conversationId);
  if (!conversation) return { status: 404, body: { error: "Conversation not found" } };

  const settings = await store.getSettings();
  if (!settings.live_support_enabled || !settings.allow_user_escalation) {
    return {
      status: 403,
      body: {
        error: "Live support escalation is not available right now.",
        code: "escalation_unavailable",
        offline_message: settings.offline_message,
        support_email: settings.support_email,
      },
    };
  }

  const available = await anyAgentAvailable(store, settings);
  if (conversation.handling_mode === "human") {
    return {
      status: 200,
      body: {
        mode: store.mode,
        already: true,
        agent_available: available,
        conversation: toVisitorConversation(conversation),
      },
    };
  }

  const now = new Date().toISOString();
  const updated = await store.updateConversation(conversationId, {
    handling_mode: "human",
    status: "open",
    escalated_at: now,
  });
  await store.appendEvent({
    conversation_id: conversationId,
    event_type: "escalated",
    actor_type: conversation.user_id ? "user" : "visitor",
    actor_profile_id: conversation.user_id,
    from_mode: "bot",
    to_mode: "human",
    metadata: {},
  });
  await store.postMessage({
    conversation_id: conversationId,
    sender_type: "ai",
    sender_profile_id: null,
    sender_display_name: settings.display_name,
    kind: "system",
    body: available
      ? "You're now chatting with the support team — an agent will reply in this conversation."
      : settings.offline_message,
    metadata: { system_copy: "escalation" },
  });

  const fresh = (await store.getConversation(conversationId)) ?? updated ?? conversation;
  return {
    status: 200,
    body: {
      mode: store.mode,
      agent_available: available,
      conversation: toVisitorConversation(fresh),
    },
  };
}

export async function markSupportVisitorRead(
  store: SupportStore,
  identity: VisitorIdentity,
  conversationId: string
): Promise<ServiceResult> {
  const conversation = await loadAuthorisedConversation(store, identity, conversationId);
  if (!conversation) return { status: 404, body: { error: "Conversation not found" } };
  await store.markVisitorRead(conversationId);
  const fresh = (await store.getConversation(conversationId)) ?? conversation;
  return {
    status: 200,
    body: { mode: store.mode, conversation: toVisitorConversation(fresh) },
  };
}

export async function reopenSupportConversation(
  store: SupportStore,
  identity: VisitorIdentity,
  conversationId: string
): Promise<ServiceResult> {
  if (identity.user?.status === "suspended") {
    return { status: 403, body: { error: "This account is suspended." } };
  }
  const conversation = await loadAuthorisedConversation(store, identity, conversationId);
  if (!conversation) return { status: 404, body: { error: "Conversation not found" } };
  if (conversation.status !== "resolved") {
    return {
      status: 200,
      body: { mode: store.mode, conversation: toVisitorConversation(conversation) },
    };
  }
  await store.updateConversation(conversationId, {
    status: "open",
    resolved_at: null,
    resolved_by: null,
  });
  await store.appendEvent({
    conversation_id: conversationId,
    event_type: "reopened",
    actor_type: conversation.user_id ? "user" : "visitor",
    actor_profile_id: conversation.user_id,
    from_status: "resolved",
    to_status: "open",
    metadata: { reason: "visitor_reopen" },
  });
  const fresh = (await store.getConversation(conversationId)) ?? conversation;
  return {
    status: 200,
    body: { mode: store.mode, conversation: toVisitorConversation(fresh) },
  };
}
