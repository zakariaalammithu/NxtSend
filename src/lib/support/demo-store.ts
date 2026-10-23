/**
 * Support store — Demo Mode implementation (P10 Stage E).
 *
 * An in-process store implementing the exact SupportStore interface,
 * seeded with the real KB content (seeds.ts) plus a few CLEARLY
 * LABELLED demo conversations (fake visitors, demo personas). It
 * exists so every support surface is genuinely explorable in Demo
 * Mode: ask a seeded question → seeded answer; escalate → the thread
 * appears in the demo inbox; reply as an agent → the widget shows it
 * on its next poll. The matcher pipeline runs over this store exactly
 * as it does over Supabase.
 *
 * Writes live only in this process and reset on restart. Nothing here
 * is ever written to Supabase, and the AI enhancement layer never
 * calls a provider in Demo Mode (the pipeline checks the mode).
 */

import { generateId } from "@/lib/utils";
import { buildSearchText, contentHash } from "./answer-core";
import {
  DEFAULT_SUPPORT_SETTINGS,
  SEED_CATEGORIES,
  SEED_KNOWLEDGE,
  SEED_SAVED_REPLIES,
} from "./seeds";
import {
  computeMessageEffects,
  computeQueueCounts,
  filterConversations,
} from "./store-helpers";
import type { AppendEventInput, AnswerableEntry, SupportStore } from "./store";
import type {
  CategoryInput,
  KnowledgeInput,
  SavedReplyInput,
  SettingsPatch,
} from "./validate";
import { slugify } from "./validate";
import type {
  ConversationListFilters,
  ConversationListResult,
  CreateConversationInput,
  PostMessageInput,
  SupportAgent,
  SupportAgentView,
  SupportConversation,
  SupportConversationEvent,
  SupportKnowledgeCategory,
  SupportKnowledgeEntry,
  SupportMessage,
  SupportSavedReply,
  SupportSettings,
} from "./types";

// ── Demo personas (all visibly fake) ───────────────────────────────────────

export const DEMO_SUPPORT_PROFILES = [
  {
    id: "demo-profile-super",
    email: "demo-super-admin@nxtsend.example",
    full_name: "Demo Super Admin",
    role: "super_admin" as const,
    status: "active" as const,
  },
  {
    id: "demo-profile-agent",
    email: "demo-agent@nxtsend.example",
    full_name: "Demo Support Agent",
    role: "admin" as const,
    status: "active" as const,
  },
  {
    id: "demo-profile-admin-off",
    email: "demo-admin-off@nxtsend.example",
    full_name: "Demo Admin (not on support)",
    role: "admin" as const,
    status: "active" as const,
  },
];

const minutesAgo = (base: number, minutes: number) =>
  new Date(base - minutes * 60_000).toISOString();

export class DemoSupportStore implements SupportStore {
  readonly mode = "demo" as const;

  private categories = new Map<string, SupportKnowledgeCategory>();
  private categoryIdBySlug = new Map<string, string>();
  private knowledge = new Map<string, SupportKnowledgeEntry>();
  private savedReplies = new Map<string, SupportSavedReply>();
  private agents = new Map<string, SupportAgent>();
  private conversations = new Map<string, SupportConversation>();
  private messages: SupportMessage[] = [];
  private events: SupportConversationEvent[] = [];
  private settings: SupportSettings;
  private sequence = 0;

  constructor() {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    for (const seed of SEED_CATEGORIES) {
      const id = generateId();
      this.categoryIdBySlug.set(seed.slug, id);
      this.categories.set(id, {
        id,
        name: seed.name,
        slug: seed.slug,
        description: seed.description,
        enabled: true,
        sort_order: seed.sort_order,
        created_by: null,
        updated_by: null,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }
    for (const seed of SEED_KNOWLEDGE) {
      const categoryId = this.categoryIdBySlug.get(seed.category_slug)!;
      const category = this.categories.get(categoryId)!;
      const searchText = buildSearchText({
        title: seed.title,
        question: seed.question,
        keywords: seed.keywords,
        category_name: category.name,
        answer: seed.answer,
      });
      const id = generateId();
      this.knowledge.set(id, {
        id,
        category_id: categoryId,
        slug: seed.slug,
        title: seed.title,
        question: seed.question,
        answer: seed.answer,
        keywords: [...seed.keywords],
        related_url: seed.related_url,
        priority: seed.priority,
        enabled: true,
        status: "published",
        search_text: searchText,
        content_hash: contentHash(searchText),
        indexed_at: nowIso,
        created_by: null,
        updated_by: null,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }
    for (const seed of SEED_SAVED_REPLIES) {
      const id = generateId();
      this.savedReplies.set(id, {
        id,
        title: seed.title,
        category_id: seed.category_slug
          ? (this.categoryIdBySlug.get(seed.category_slug) ?? null)
          : null,
        shortcut: seed.shortcut,
        body: seed.body,
        enabled: true,
        created_by: null,
        updated_by: null,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }
    this.settings = {
      ...DEFAULT_SUPPORT_SETTINGS,
      updated_by: null,
      updated_at: nowIso,
    };

    // Demo agents: the super admin and one agent are on support; the
    // third admin deliberately has NO enabled row (permission demos).
    this.agents.set(DEMO_SUPPORT_PROFILES[0].id, {
      profile_id: DEMO_SUPPORT_PROFILES[0].id,
      enabled: true,
      availability: "available",
      availability_updated_at: nowIso,
      last_assigned_at: minutesAgo(now, 60),
      created_at: nowIso,
      updated_at: nowIso,
    });
    this.agents.set(DEMO_SUPPORT_PROFILES[1].id, {
      profile_id: DEMO_SUPPORT_PROFILES[1].id,
      enabled: true,
      availability: "busy",
      availability_updated_at: nowIso,
      last_assigned_at: minutesAgo(now, 30),
      created_at: nowIso,
      updated_at: nowIso,
    });

    this.seedDemoConversations(now);
  }

  private seedDemoConversations(now: number) {
    const pricing = Array.from(this.knowledge.values()).find(
      (entry) => entry.slug === "how-much-does-nxtsend-cost"
    );

    const mkConversation = (
      partial: Partial<SupportConversation> & { createdMinutesAgo: number }
    ): SupportConversation => {
      const created = minutesAgo(now, partial.createdMinutesAgo);
      const conversation: SupportConversation = {
        id: generateId(),
        workspace_id: null,
        user_id: null,
        guest_name: null,
        guest_email: null,
        guest_access_token_hash: null,
        guest_token_expires_at: null,
        status: "open",
        handling_mode: "bot",
        source: "marketing_widget",
        subject: null,
        first_message_preview: null,
        last_message_preview: null,
        last_message_at: created,
        last_visitor_message_at: null,
        last_agent_message_at: null,
        visitor_unread_count: 0,
        agent_unread_count: 0,
        assignee_id: null,
        assigned_at: null,
        escalated_at: null,
        resolved_at: null,
        resolved_by: null,
        pii_redacted_at: null,
        metadata: { demo_fixture: true },
        created_at: created,
        updated_at: created,
        ...partial,
      };
      delete (conversation as Partial<SupportConversation> & { createdMinutesAgo?: number })
        .createdMinutesAgo;
      this.conversations.set(conversation.id, conversation);
      this.events.push({
        id: generateId(),
        conversation_id: conversation.id,
        event_type: "created",
        actor_type: conversation.user_id ? "user" : "visitor",
        actor_profile_id: conversation.user_id,
        from_status: null,
        to_status: "open",
        from_assignee_id: null,
        to_assignee_id: null,
        from_mode: null,
        to_mode: "bot",
        metadata: { demo_fixture: true },
        created_at: created,
      });
      return conversation;
    };

    const post = (
      conversation: SupportConversation,
      input: Omit<PostMessageInput, "conversation_id" | "sender_profile_id"> & {
        sender_profile_id?: string | null;
      },
      minutes: number
    ) => {
      const message: SupportMessage = {
        id: generateId(),
        conversation_id: conversation.id,
        sequence_no: ++this.sequence,
        sender_type: input.sender_type,
        sender_profile_id: input.sender_profile_id ?? null,
        sender_display_name: input.sender_display_name ?? null,
        kind: input.kind,
        body: input.body,
        saved_reply_id: input.saved_reply_id ?? null,
        source_knowledge_id: input.source_knowledge_id ?? null,
        visitor_read_at: null,
        agent_read_at: null,
        client_message_id: input.client_message_id ?? null,
        metadata: input.metadata ?? {},
        created_at: minutesAgo(now, minutes),
      };
      this.messages.push(message);
      const { patch } = computeMessageEffects(conversation, message, message.created_at);
      Object.assign(conversation, patch);
      return message;
    };

    // 1) Guest asked about pricing; the bot answered. Open, bot mode.
    const maya = mkConversation({
      createdMinutesAgo: 95,
      guest_name: "Demo Visitor — Maya",
      guest_email: "maya@demo.example",
      guest_access_token_hash: "demo-fixture-hash-maya",
    });
    post(
      maya,
      {
        sender_type: "ai",
        sender_display_name: this.settings.display_name,
        kind: "message",
        body: this.settings.welcome_message,
      },
      95
    );
    post(
      maya,
      { sender_type: "visitor", sender_display_name: "Demo Visitor — Maya", kind: "message", body: "How much does NxtSend cost?" },
      94
    );
    if (pricing) {
      post(
        maya,
        {
          sender_type: "ai",
          sender_display_name: this.settings.display_name,
          kind: "message",
          body: pricing.answer,
          source_knowledge_id: pricing.id,
          metadata: { engine: "kb_match", score: 100, source_knowledge_ids: [pricing.id] },
        },
        94
      );
    }

    // 2) Guest escalated and is WAITING for a human reply. Unassigned.
    const tom = mkConversation({
      createdMinutesAgo: 42,
      guest_name: "Demo Visitor — Tom",
      guest_email: "tom@demo.example",
      guest_access_token_hash: "demo-fixture-hash-tom",
      handling_mode: "human",
      escalated_at: minutesAgo(now, 40),
    });
    post(
      tom,
      {
        sender_type: "ai",
        sender_display_name: this.settings.display_name,
        kind: "message",
        body: this.settings.welcome_message,
      },
      42
    );
    post(
      tom,
      {
        sender_type: "visitor",
        sender_display_name: "Demo Visitor — Tom",
        kind: "message",
        body: "My CSV import skipped half my rows and I cannot tell why. Can a person look at this with me?",
      },
      41
    );
    post(
      tom,
      {
        sender_type: "ai",
        sender_display_name: this.settings.display_name,
        kind: "system",
        body: "You're now chatting with the support team. An agent will reply here.",
      },
      40
    );
    this.events.push({
      id: generateId(),
      conversation_id: tom.id,
      event_type: "escalated",
      actor_type: "visitor",
      actor_profile_id: null,
      from_status: null,
      to_status: null,
      from_assignee_id: null,
      to_assignee_id: null,
      from_mode: "bot",
      to_mode: "human",
      metadata: { demo_fixture: true },
      created_at: minutesAgo(now, 40),
    });

    // 3) Registered demo user, assigned to the demo agent, agent replied (pending).
    const alex = mkConversation({
      createdMinutesAgo: 180,
      user_id: "demo-user-alex",
      handling_mode: "human",
      escalated_at: minutesAgo(now, 170),
      assignee_id: DEMO_SUPPORT_PROFILES[1].id,
      assigned_at: minutesAgo(now, 165),
      status: "pending",
    });
    post(
      alex,
      { sender_type: "user", sender_display_name: "Demo User — Alex", kind: "message", body: "My mailbox grant expired — how do I reconnect it?" },
      175
    );
    post(
      alex,
      {
        sender_type: "agent",
        sender_profile_id: DEMO_SUPPORT_PROFILES[1].id,
        sender_display_name: "Demo Support Agent",
        kind: "message",
        body: "You can reconnect it from the Accounts page — OAuth grants can be revoked or expire on the provider's side. Shout here if it still shows expired afterwards.",
      },
      160
    );

    // 4) A resolved guest thread (bot answered; agent closed it).
    // The resolution is applied AFTER the messages are posted — a
    // visitor message on a resolved thread reopens it by design, so
    // the fixture must close the thread last, like a real agent does.
    const sam = mkConversation({
      createdMinutesAgo: 600,
      guest_name: "Demo Visitor — Sam",
      guest_access_token_hash: "demo-fixture-hash-sam",
    });
    post(
      sam,
      { sender_type: "visitor", sender_display_name: "Demo Visitor — Sam", kind: "message", body: "Where are the Terms and Privacy policies?" },
      599
    );
    const legal = Array.from(this.knowledge.values()).find((entry) => entry.slug === "legal-policies");
    if (legal) {
      post(
        sam,
        {
          sender_type: "ai",
          sender_display_name: this.settings.display_name,
          kind: "message",
          body: legal.answer,
          source_knowledge_id: legal.id,
          metadata: { engine: "kb_match", score: 100, source_knowledge_ids: [legal.id] },
        },
        599
      );
    }
    sam.status = "resolved";
    sam.resolved_at = minutesAgo(now, 590);
    sam.resolved_by = DEMO_SUPPORT_PROFILES[0].id;
  }

  async ensureSeeded(): Promise<void> {
    // Fixtures are seeded synchronously in the constructor.
  }

  // ── Settings ─────────────────────────────────────────────────────

  async getSettings(): Promise<SupportSettings> {
    return { ...this.settings };
  }

  async updateSettings(patch: SettingsPatch, updatedBy: string | null): Promise<SupportSettings> {
    this.settings = {
      ...this.settings,
      ...patch,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    };
    return { ...this.settings };
  }

  // ── Categories ───────────────────────────────────────────────────

  async listCategories(): Promise<SupportKnowledgeCategory[]> {
    return Array.from(this.categories.values()).sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
    );
  }

  async createCategory(
    input: Required<CategoryInput>,
    actorId: string | null
  ): Promise<SupportKnowledgeCategory> {
    const now = new Date().toISOString();
    const slug = slugify(input.name);
    if (this.categoryIdBySlug.has(slug)) {
      throw new Error(`Category slug already exists: ${slug}`);
    }
    const category: SupportKnowledgeCategory = {
      id: generateId(),
      ...input,
      slug,
      created_by: actorId,
      updated_by: actorId,
      created_at: now,
      updated_at: now,
    };
    this.categories.set(category.id, category);
    this.categoryIdBySlug.set(slug, category.id);
    return category;
  }

  async updateCategory(
    id: string,
    patch: Partial<CategoryInput>,
    actorId: string | null
  ): Promise<SupportKnowledgeCategory | null> {
    const existing = this.categories.get(id);
    if (!existing) return null;
    const updated = {
      ...existing,
      ...patch,
      updated_by: actorId,
      updated_at: new Date().toISOString(),
    };
    this.categories.set(id, updated);
    return updated;
  }

  async deleteCategory(id: string): Promise<boolean> {
    const inUse = Array.from(this.knowledge.values()).some((entry) => entry.category_id === id);
    if (inUse) return false;
    const category = this.categories.get(id);
    if (category) this.categoryIdBySlug.delete(category.slug);
    return this.categories.delete(id);
  }

  // ── Knowledge ────────────────────────────────────────────────────

  async listKnowledge(): Promise<SupportKnowledgeEntry[]> {
    return Array.from(this.knowledge.values()).sort(
      (a, b) => b.priority - a.priority || a.title.localeCompare(b.title)
    );
  }

  async getKnowledge(id: string): Promise<SupportKnowledgeEntry | null> {
    return this.knowledge.get(id) ?? null;
  }

  private indexFields(entry: KnowledgeInput) {
    const category = this.categories.get(entry.category_id);
    const searchText = buildSearchText({
      title: entry.title,
      question: entry.question,
      keywords: entry.keywords,
      category_name: category?.name ?? "",
      answer: entry.answer,
    });
    return {
      search_text: searchText,
      content_hash: contentHash(searchText),
      indexed_at: new Date().toISOString(),
    };
  }

  async createKnowledge(
    input: KnowledgeInput & { slug: string },
    actorId: string | null
  ): Promise<SupportKnowledgeEntry> {
    const now = new Date().toISOString();
    const entry: SupportKnowledgeEntry = {
      id: generateId(),
      ...input,
      keywords: [...input.keywords],
      ...this.indexFields(input),
      created_by: actorId,
      updated_by: actorId,
      created_at: now,
      updated_at: now,
    };
    this.knowledge.set(entry.id, entry);
    return entry;
  }

  async updateKnowledge(
    id: string,
    patch: Partial<KnowledgeInput>,
    actorId: string | null
  ): Promise<SupportKnowledgeEntry | null> {
    const existing = this.knowledge.get(id);
    if (!existing) return null;
    const merged: KnowledgeInput = {
      category_id: patch.category_id ?? existing.category_id,
      title: patch.title ?? existing.title,
      question: patch.question ?? existing.question,
      answer: patch.answer ?? existing.answer,
      keywords: patch.keywords ?? existing.keywords,
      related_url: patch.related_url !== undefined ? patch.related_url : existing.related_url,
      priority: patch.priority ?? existing.priority,
      enabled: patch.enabled ?? existing.enabled,
      status: patch.status ?? existing.status,
    };
    const updated: SupportKnowledgeEntry = {
      ...existing,
      ...merged,
      keywords: [...merged.keywords],
      ...this.indexFields(merged),
      updated_by: actorId,
      updated_at: new Date().toISOString(),
    };
    this.knowledge.set(id, updated);
    return updated;
  }

  async deleteKnowledge(id: string): Promise<boolean> {
    return this.knowledge.delete(id);
  }

  async listAnswerable(): Promise<AnswerableEntry[]> {
    return Array.from(this.knowledge.values())
      .filter((entry) => {
        const category = this.categories.get(entry.category_id);
        return (
          entry.status === "published" &&
          entry.enabled &&
          entry.indexed_at !== null &&
          !!category &&
          category.enabled
        );
      })
      .map((entry) => ({ entry, category: this.categories.get(entry.category_id)! }));
  }

  // ── Saved replies ────────────────────────────────────────────────

  async listSavedReplies(): Promise<SupportSavedReply[]> {
    return Array.from(this.savedReplies.values()).sort((a, b) => a.title.localeCompare(b.title));
  }

  async getSavedReply(id: string): Promise<SupportSavedReply | null> {
    return this.savedReplies.get(id) ?? null;
  }

  async createSavedReply(
    input: Required<SavedReplyInput>,
    actorId: string | null
  ): Promise<SupportSavedReply> {
    const now = new Date().toISOString();
    const reply: SupportSavedReply = {
      id: generateId(),
      ...input,
      created_by: actorId,
      updated_by: actorId,
      created_at: now,
      updated_at: now,
    };
    this.savedReplies.set(reply.id, reply);
    return reply;
  }

  async updateSavedReply(
    id: string,
    patch: Partial<SavedReplyInput>,
    actorId: string | null
  ): Promise<SupportSavedReply | null> {
    const existing = this.savedReplies.get(id);
    if (!existing) return null;
    const updated = {
      ...existing,
      ...patch,
      updated_by: actorId,
      updated_at: new Date().toISOString(),
    };
    this.savedReplies.set(id, updated);
    return updated;
  }

  async deleteSavedReply(id: string): Promise<boolean> {
    return this.savedReplies.delete(id);
  }

  // ── Agents ───────────────────────────────────────────────────────

  async listAgents(): Promise<SupportAgentView[]> {
    const now = new Date().toISOString();
    return DEMO_SUPPORT_PROFILES.map((profile) => {
      const row = this.agents.get(profile.id);
      const agent: SupportAgent =
        row ?? {
          profile_id: profile.id,
          enabled: false,
          availability: "offline",
          availability_updated_at: now,
          last_assigned_at: null,
          created_at: now,
          updated_at: now,
        };
      return {
        ...agent,
        email: profile.email,
        full_name: profile.full_name,
        role: profile.role,
        profile_status: profile.status,
        eligible: agent.enabled && profile.status === "active",
      };
    });
  }

  async getAgent(profileId: string): Promise<SupportAgent | null> {
    return this.agents.get(profileId) ?? null;
  }

  async upsertAgent(
    profileId: string,
    patch: {
      enabled?: boolean;
      availability?: SupportAgent["availability"];
      last_assigned_at?: string;
    }
  ): Promise<SupportAgent> {
    const now = new Date().toISOString();
    const existing = this.agents.get(profileId);
    const agent: SupportAgent = {
      profile_id: profileId,
      enabled: patch.enabled ?? existing?.enabled ?? false,
      availability: patch.availability ?? existing?.availability ?? "offline",
      availability_updated_at: patch.availability !== undefined ? now : (existing?.availability_updated_at ?? now),
      last_assigned_at: patch.last_assigned_at ?? existing?.last_assigned_at ?? null,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    this.agents.set(profileId, agent);
    return agent;
  }

  // ── Conversations ────────────────────────────────────────────────

  async createConversation(input: CreateConversationInput): Promise<SupportConversation> {
    const now = new Date().toISOString();
    const conversation: SupportConversation = {
      id: generateId(),
      workspace_id: input.workspace_id,
      user_id: input.user_id,
      guest_name: input.guest_name,
      guest_email: input.guest_email,
      guest_access_token_hash: input.guest_access_token_hash,
      guest_token_expires_at: input.guest_token_expires_at,
      status: "open",
      handling_mode: "bot",
      source: input.source,
      subject: null,
      first_message_preview: null,
      last_message_preview: null,
      last_message_at: now,
      last_visitor_message_at: null,
      last_agent_message_at: null,
      visitor_unread_count: 0,
      agent_unread_count: 0,
      assignee_id: null,
      assigned_at: null,
      escalated_at: null,
      resolved_at: null,
      resolved_by: null,
      pii_redacted_at: null,
      metadata: { ...input.metadata },
      created_at: now,
      updated_at: now,
    };
    this.conversations.set(conversation.id, conversation);
    await this.appendEvent({
      conversation_id: conversation.id,
      event_type: "created",
      actor_type: input.user_id ? "user" : "visitor",
      actor_profile_id: input.user_id,
      to_status: "open",
      to_mode: "bot",
    });
    return conversation;
  }

  async getConversation(id: string): Promise<SupportConversation | null> {
    return this.conversations.get(id) ?? null;
  }

  async findConversationByGuestHash(hash: string): Promise<SupportConversation | null> {
    return (
      Array.from(this.conversations.values()).find(
        (conversation) => conversation.guest_access_token_hash === hash
      ) ?? null
    );
  }

  async findLatestOpenConversationForUser(userId: string): Promise<SupportConversation | null> {
    const matches = Array.from(this.conversations.values())
      .filter((c) => c.user_id === userId && c.status !== "resolved")
      .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
    return matches[0] ?? null;
  }

  async listConversations(filters: ConversationListFilters): Promise<ConversationListResult> {
    const rows = Array.from(this.conversations.values()).sort((a, b) =>
      b.last_message_at.localeCompare(a.last_message_at)
    );
    return {
      conversations: filterConversations(rows, filters),
      counts: computeQueueCounts(rows),
    };
  }

  async updateConversation(
    id: string,
    patch: Partial<SupportConversation>
  ): Promise<SupportConversation | null> {
    const existing = this.conversations.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, updated_at: new Date().toISOString() };
    this.conversations.set(id, updated);
    return updated;
  }

  // ── Messages ─────────────────────────────────────────────────────

  async listMessages(
    conversationId: string,
    options: { afterSequence?: number; includeInternal: boolean; limit?: number }
  ): Promise<SupportMessage[]> {
    return this.messages
      .filter((m) => m.conversation_id === conversationId)
      .filter((m) => options.includeInternal || m.kind !== "internal_note")
      .filter((m) => options.afterSequence === undefined || m.sequence_no > options.afterSequence)
      .sort((a, b) => a.sequence_no - b.sequence_no)
      .slice(0, options.limit ?? 200);
  }

  async findMessageByClientId(
    conversationId: string,
    clientMessageId: string
  ): Promise<SupportMessage | null> {
    return (
      this.messages.find(
        (m) => m.conversation_id === conversationId && m.client_message_id === clientMessageId
      ) ?? null
    );
  }

  async postMessage(input: PostMessageInput): Promise<{
    message: SupportMessage;
    conversation: SupportConversation;
    duplicate: boolean;
  }> {
    const conversation = this.conversations.get(input.conversation_id);
    if (!conversation) throw new Error("support postMessage: conversation not found");
    if (input.client_message_id) {
      const existing = await this.findMessageByClientId(input.conversation_id, input.client_message_id);
      if (existing) return { message: existing, conversation, duplicate: true };
    }
    const message: SupportMessage = {
      id: generateId(),
      conversation_id: input.conversation_id,
      sequence_no: ++this.sequence,
      sender_type: input.sender_type,
      sender_profile_id: input.sender_profile_id ?? null,
      sender_display_name: input.sender_display_name ?? null,
      kind: input.kind,
      body: input.body,
      saved_reply_id: input.saved_reply_id ?? null,
      source_knowledge_id: input.source_knowledge_id ?? null,
      visitor_read_at: null,
      agent_read_at: null,
      client_message_id: input.client_message_id ?? null,
      metadata: input.metadata ?? {},
      created_at: new Date().toISOString(),
    };
    this.messages.push(message);
    const { patch, reopened } = computeMessageEffects(conversation, message, message.created_at);
    Object.assign(conversation, patch);
    if (reopened) {
      await this.appendEvent({
        conversation_id: conversation.id,
        event_type: "reopened",
        actor_type: message.sender_type,
        actor_profile_id: message.sender_profile_id,
        from_status: "resolved",
        to_status: "open",
        metadata: { reason: "visitor_message" },
      });
    }
    return { message, conversation, duplicate: false };
  }

  // ── Events & read state ──────────────────────────────────────────

  async appendEvent(input: AppendEventInput): Promise<SupportConversationEvent> {
    const event: SupportConversationEvent = {
      id: generateId(),
      conversation_id: input.conversation_id,
      event_type: input.event_type,
      actor_type: input.actor_type,
      actor_profile_id: input.actor_profile_id,
      from_status: input.from_status ?? null,
      to_status: input.to_status ?? null,
      from_assignee_id: input.from_assignee_id ?? null,
      to_assignee_id: input.to_assignee_id ?? null,
      from_mode: input.from_mode ?? null,
      to_mode: input.to_mode ?? null,
      metadata: input.metadata ?? {},
      created_at: new Date().toISOString(),
    };
    this.events.push(event);
    return event;
  }

  async listEvents(conversationId: string): Promise<SupportConversationEvent[]> {
    return this.events
      .filter((e) => e.conversation_id === conversationId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async markVisitorRead(conversationId: string): Promise<void> {
    const now = new Date().toISOString();
    for (const message of this.messages) {
      if (
        message.conversation_id === conversationId &&
        (message.sender_type === "ai" || message.sender_type === "admin" || message.sender_type === "agent") &&
        !message.visitor_read_at
      ) {
        message.visitor_read_at = now;
      }
    }
    const conversation = this.conversations.get(conversationId);
    if (conversation) conversation.visitor_unread_count = 0;
  }

  async markAgentRead(conversationId: string): Promise<void> {
    const now = new Date().toISOString();
    for (const message of this.messages) {
      if (
        message.conversation_id === conversationId &&
        (message.sender_type === "visitor" || message.sender_type === "user") &&
        !message.agent_read_at
      ) {
        message.agent_read_at = now;
      }
    }
    const conversation = this.conversations.get(conversationId);
    if (conversation) conversation.agent_unread_count = 0;
  }
}
