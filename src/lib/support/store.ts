/**
 * Support store — data access (P10 Stage E).
 *
 * One interface, two implementations:
 *  - SupabaseSupportStore: the migration-019 tables through the
 *    SERVICE ROLE client. The tables have RLS enabled with zero
 *    client policies, so every call here happens only after the route
 *    layer authorised the caller (guest token hash / session owner /
 *    admin gate + support permission matrix).
 *  - DemoSupportStore (demo-store.ts): the same interface over an
 *    in-process store with labelled demo fixtures.
 *
 * Unread counters and previews are maintained by the postMessage
 * write path (store-helpers.computeMessageEffects) — routes are the
 * only writers, so the bookkeeping is transactional by construction:
 * a message insert and its conversation update happen together in
 * this one function, never split across callers.
 */

import { createAdminClient } from "@/lib/supabase/server";
import { getDataMode, type DataMode } from "@/lib/data/mode";
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
import { slugify } from "./validate";
import type {
  CategoryInput,
  KnowledgeInput,
  SavedReplyInput,
  SettingsPatch,
} from "./validate";
import type {
  ConversationListFilters,
  ConversationListResult,
  CreateConversationInput,
  PostMessageInput,
  SupportAgent,
  SupportAgentView,
  SupportConversation,
  SupportConversationEvent,
  SupportEventType,
  SupportKnowledgeCategory,
  SupportKnowledgeEntry,
  SupportMessage,
  SupportSavedReply,
  SupportSettings,
} from "./types";

export class SupportStoreUnavailableError extends Error {
  constructor(message = "Support store is unavailable (service role not configured).") {
    super(message);
    this.name = "SupportStoreUnavailableError";
  }
}

export interface AppendEventInput {
  conversation_id: string;
  event_type: SupportEventType;
  actor_type: SupportConversationEvent["actor_type"];
  actor_profile_id: string | null;
  from_status?: string | null;
  to_status?: string | null;
  from_assignee_id?: string | null;
  to_assignee_id?: string | null;
  from_mode?: string | null;
  to_mode?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AnswerableEntry {
  entry: SupportKnowledgeEntry;
  category: SupportKnowledgeCategory;
}

export interface SupportStore {
  readonly mode: DataMode;
  ensureSeeded(): Promise<void>;

  getSettings(): Promise<SupportSettings>;
  updateSettings(patch: SettingsPatch, updatedBy: string | null): Promise<SupportSettings>;

  listCategories(): Promise<SupportKnowledgeCategory[]>;
  createCategory(input: Required<CategoryInput>, actorId: string | null): Promise<SupportKnowledgeCategory>;
  updateCategory(id: string, patch: Partial<CategoryInput>, actorId: string | null): Promise<SupportKnowledgeCategory | null>;
  /** False when entries still reference the category (ON DELETE RESTRICT). */
  deleteCategory(id: string): Promise<boolean>;

  listKnowledge(): Promise<SupportKnowledgeEntry[]>;
  getKnowledge(id: string): Promise<SupportKnowledgeEntry | null>;
  createKnowledge(input: KnowledgeInput & { slug: string }, actorId: string | null): Promise<SupportKnowledgeEntry>;
  updateKnowledge(id: string, patch: Partial<KnowledgeInput>, actorId: string | null): Promise<SupportKnowledgeEntry | null>;
  deleteKnowledge(id: string): Promise<boolean>;
  /** Published + enabled + indexed entries in enabled categories. */
  listAnswerable(): Promise<AnswerableEntry[]>;

  listSavedReplies(): Promise<SupportSavedReply[]>;
  getSavedReply(id: string): Promise<SupportSavedReply | null>;
  createSavedReply(input: Required<SavedReplyInput>, actorId: string | null): Promise<SupportSavedReply>;
  updateSavedReply(id: string, patch: Partial<SavedReplyInput>, actorId: string | null): Promise<SupportSavedReply | null>;
  deleteSavedReply(id: string): Promise<boolean>;

  listAgents(): Promise<SupportAgentView[]>;
  getAgent(profileId: string): Promise<SupportAgent | null>;
  upsertAgent(
    profileId: string,
    patch: {
      enabled?: boolean;
      availability?: SupportAgent["availability"];
      last_assigned_at?: string;
    }
  ): Promise<SupportAgent>;

  createConversation(input: CreateConversationInput): Promise<SupportConversation>;
  getConversation(id: string): Promise<SupportConversation | null>;
  findConversationByGuestHash(hash: string): Promise<SupportConversation | null>;
  findLatestOpenConversationForUser(userId: string): Promise<SupportConversation | null>;
  listConversations(filters: ConversationListFilters): Promise<ConversationListResult>;
  updateConversation(
    id: string,
    patch: Partial<SupportConversation>
  ): Promise<SupportConversation | null>;

  listMessages(
    conversationId: string,
    options: { afterSequence?: number; includeInternal: boolean; limit?: number }
  ): Promise<SupportMessage[]>;
  findMessageByClientId(conversationId: string, clientMessageId: string): Promise<SupportMessage | null>;
  postMessage(input: PostMessageInput): Promise<{
    message: SupportMessage;
    conversation: SupportConversation;
    duplicate: boolean;
  }>;

  appendEvent(input: AppendEventInput): Promise<SupportConversationEvent>;
  listEvents(conversationId: string): Promise<SupportConversationEvent[]>;
  markVisitorRead(conversationId: string): Promise<void>;
  markAgentRead(conversationId: string): Promise<void>;
}

// ── Supabase implementation ────────────────────────────────────────────────

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

const CONVERSATION_LIST_CAP = 500;

export class SupabaseSupportStore implements SupportStore {
  readonly mode: DataMode = "supabase";
  private seedPromise: Promise<void> | null = null;

  private client(): AdminClient {
    const client = createAdminClient();
    if (!client) throw new SupportStoreUnavailableError();
    return client;
  }

  async ensureSeeded(): Promise<void> {
    if (!this.seedPromise) {
      this.seedPromise = this.runSeed().catch((err) => {
        // Allow a later call to retry a failed first-run seed.
        this.seedPromise = null;
        throw err;
      });
    }
    await this.seedPromise;
  }

  private async runSeed(): Promise<void> {
    const db = this.client();
    const now = new Date().toISOString();

    const { error: settingsError } = await db.from("support_settings").upsert(
      { ...DEFAULT_SUPPORT_SETTINGS, updated_at: now },
      { onConflict: "id", ignoreDuplicates: true }
    );
    if (settingsError) throw new Error(`support seed (settings): ${settingsError.message}`);

    const { error: catError } = await db.from("support_knowledge_categories").upsert(
      SEED_CATEGORIES.map((c) => ({ ...c, enabled: true })),
      { onConflict: "slug", ignoreDuplicates: true }
    );
    if (catError) throw new Error(`support seed (categories): ${catError.message}`);

    const categories = await this.listCategories();
    const bySlug = new Map(categories.map((c) => [c.slug, c]));

    const knowledgeRows = SEED_KNOWLEDGE.map((seed) => {
      const category = bySlug.get(seed.category_slug);
      if (!category) throw new Error(`support seed: unknown category ${seed.category_slug}`);
      const searchText = buildSearchText({
        title: seed.title,
        question: seed.question,
        keywords: seed.keywords,
        category_name: category.name,
        answer: seed.answer,
      });
      return {
        category_id: category.id,
        slug: seed.slug,
        title: seed.title,
        question: seed.question,
        answer: seed.answer,
        keywords: seed.keywords,
        related_url: seed.related_url,
        priority: seed.priority,
        enabled: true,
        status: "published" as const,
        search_text: searchText,
        content_hash: contentHash(searchText),
        indexed_at: now,
      };
    });
    const { error: kbError } = await db
      .from("support_knowledge")
      .upsert(knowledgeRows, { onConflict: "slug", ignoreDuplicates: true });
    if (kbError) throw new Error(`support seed (knowledge): ${kbError.message}`);

    const { count, error: countError } = await db
      .from("support_saved_replies")
      .select("id", { count: "exact", head: true });
    if (countError) throw new Error(`support seed (replies count): ${countError.message}`);
    if ((count ?? 0) === 0) {
      const { error: replyError } = await db.from("support_saved_replies").insert(
        SEED_SAVED_REPLIES.map((reply) => ({
          title: reply.title,
          category_id: reply.category_slug ? (bySlug.get(reply.category_slug)?.id ?? null) : null,
          shortcut: reply.shortcut,
          body: reply.body,
          enabled: true,
        }))
      );
      if (replyError) throw new Error(`support seed (replies): ${replyError.message}`);
    }
  }

  // ── Settings ─────────────────────────────────────────────────────

  async getSettings(): Promise<SupportSettings> {
    await this.ensureSeeded();
    const { data, error } = await this.client()
      .from("support_settings")
      .select("*")
      .eq("id", "global")
      .single();
    if (error || !data) {
      // Seeding guarantees the row; if it is somehow absent, fall back
      // to the documented defaults rather than failing the widget.
      return { ...DEFAULT_SUPPORT_SETTINGS, updated_by: null, updated_at: new Date().toISOString() };
    }
    return data as SupportSettings;
  }

  async updateSettings(patch: SettingsPatch, updatedBy: string | null): Promise<SupportSettings> {
    await this.ensureSeeded();
    const { data, error } = await this.client()
      .from("support_settings")
      .update({ ...patch, updated_by: updatedBy, updated_at: new Date().toISOString() })
      .eq("id", "global")
      .select("*")
      .single();
    if (error || !data) throw new Error(`support settings update: ${error?.message ?? "no row"}`);
    return data as SupportSettings;
  }

  // ── Categories ───────────────────────────────────────────────────

  async listCategories(): Promise<SupportKnowledgeCategory[]> {
    const { data, error } = await this.client()
      .from("support_knowledge_categories")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(`support categories list: ${error.message}`);
    return (data ?? []) as SupportKnowledgeCategory[];
  }

  async createCategory(
    input: Required<CategoryInput>,
    actorId: string | null
  ): Promise<SupportKnowledgeCategory> {
    const { data, error } = await this.client()
      .from("support_knowledge_categories")
      .insert({ ...input, slug: slugify(input.name), created_by: actorId, updated_by: actorId })
      .select("*")
      .single();
    if (error || !data) throw new Error(`support category create: ${error?.message ?? "no row"}`);
    return data as SupportKnowledgeCategory;
  }

  async updateCategory(
    id: string,
    patch: Partial<CategoryInput>,
    actorId: string | null
  ): Promise<SupportKnowledgeCategory | null> {
    const { data, error } = await this.client()
      .from("support_knowledge_categories")
      .update({ ...patch, updated_by: actorId, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`support category update: ${error.message}`);
    return (data as SupportKnowledgeCategory) ?? null;
  }

  async deleteCategory(id: string): Promise<boolean> {
    const { count } = await this.client()
      .from("support_knowledge")
      .select("id", { count: "exact", head: true })
      .eq("category_id", id);
    if ((count ?? 0) > 0) return false;
    const { error } = await this.client()
      .from("support_knowledge_categories")
      .delete()
      .eq("id", id);
    if (error) throw new Error(`support category delete: ${error.message}`);
    return true;
  }

  // ── Knowledge ────────────────────────────────────────────────────

  async listKnowledge(): Promise<SupportKnowledgeEntry[]> {
    await this.ensureSeeded();
    const { data, error } = await this.client()
      .from("support_knowledge")
      .select("*")
      .order("priority", { ascending: false })
      .order("title", { ascending: true });
    if (error) throw new Error(`support knowledge list: ${error.message}`);
    return (data ?? []) as SupportKnowledgeEntry[];
  }

  async getKnowledge(id: string): Promise<SupportKnowledgeEntry | null> {
    const { data, error } = await this.client()
      .from("support_knowledge")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`support knowledge get: ${error.message}`);
    return (data as SupportKnowledgeEntry) ?? null;
  }

  private async indexFields(
    entry: KnowledgeInput | (Partial<KnowledgeInput> & { title: string; question: string; answer: string; keywords: string[] })
  ): Promise<{ search_text: string; content_hash: string; indexed_at: string }> {
    const categories = await this.listCategories();
    const category = categories.find((c) => c.id === (entry as KnowledgeInput).category_id);
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
    await this.ensureSeeded();
    const index = await this.indexFields(input);
    const { data, error } = await this.client()
      .from("support_knowledge")
      .insert({ ...input, ...index, created_by: actorId, updated_by: actorId })
      .select("*")
      .single();
    if (error || !data) throw new Error(`support knowledge create: ${error?.message ?? "no row"}`);
    return data as SupportKnowledgeEntry;
  }

  async updateKnowledge(
    id: string,
    patch: Partial<KnowledgeInput>,
    actorId: string | null
  ): Promise<SupportKnowledgeEntry | null> {
    const existing = await this.getKnowledge(id);
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
    // Every save re-indexes in the same operation: an entry is only
    // ever answerable with search fields that match its content.
    const index = await this.indexFields(merged);
    const { data, error } = await this.client()
      .from("support_knowledge")
      .update({ ...patch, ...index, updated_by: actorId, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`support knowledge update: ${error.message}`);
    return (data as SupportKnowledgeEntry) ?? null;
  }

  async deleteKnowledge(id: string): Promise<boolean> {
    const { error } = await this.client().from("support_knowledge").delete().eq("id", id);
    if (error) throw new Error(`support knowledge delete: ${error.message}`);
    return true;
  }

  async listAnswerable(): Promise<AnswerableEntry[]> {
    await this.ensureSeeded();
    const [entries, categories] = await Promise.all([this.listKnowledge(), this.listCategories()]);
    const byId = new Map(categories.map((c) => [c.id, c]));
    return entries
      .filter((entry) => {
        const category = byId.get(entry.category_id);
        return (
          entry.status === "published" &&
          entry.enabled &&
          entry.indexed_at !== null &&
          !!category &&
          category.enabled
        );
      })
      .map((entry) => ({ entry, category: byId.get(entry.category_id)! }));
  }

  // ── Saved replies ────────────────────────────────────────────────

  async listSavedReplies(): Promise<SupportSavedReply[]> {
    await this.ensureSeeded();
    const { data, error } = await this.client()
      .from("support_saved_replies")
      .select("*")
      .order("title", { ascending: true });
    if (error) throw new Error(`support replies list: ${error.message}`);
    return (data ?? []) as SupportSavedReply[];
  }

  async getSavedReply(id: string): Promise<SupportSavedReply | null> {
    const { data, error } = await this.client()
      .from("support_saved_replies")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`support reply get: ${error.message}`);
    return (data as SupportSavedReply) ?? null;
  }

  async createSavedReply(
    input: Required<SavedReplyInput>,
    actorId: string | null
  ): Promise<SupportSavedReply> {
    const { data, error } = await this.client()
      .from("support_saved_replies")
      .insert({ ...input, created_by: actorId, updated_by: actorId })
      .select("*")
      .single();
    if (error || !data) throw new Error(`support reply create: ${error?.message ?? "no row"}`);
    return data as SupportSavedReply;
  }

  async updateSavedReply(
    id: string,
    patch: Partial<SavedReplyInput>,
    actorId: string | null
  ): Promise<SupportSavedReply | null> {
    const { data, error } = await this.client()
      .from("support_saved_replies")
      .update({ ...patch, updated_by: actorId, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`support reply update: ${error.message}`);
    return (data as SupportSavedReply) ?? null;
  }

  async deleteSavedReply(id: string): Promise<boolean> {
    const { error } = await this.client().from("support_saved_replies").delete().eq("id", id);
    if (error) throw new Error(`support reply delete: ${error.message}`);
    return true;
  }

  // ── Agents ───────────────────────────────────────────────────────

  async listAgents(): Promise<SupportAgentView[]> {
    const db = this.client();
    const [{ data: profiles, error: profileError }, { data: agents, error: agentError }] =
      await Promise.all([
        db.from("profiles").select("id, email, full_name, role, status").in("role", ["admin", "super_admin"]),
        db.from("support_agents").select("*"),
      ]);
    if (profileError) throw new Error(`support agents profiles: ${profileError.message}`);
    if (agentError) throw new Error(`support agents list: ${agentError.message}`);
    const byProfile = new Map(((agents ?? []) as SupportAgent[]).map((a) => [a.profile_id, a]));
    const now = new Date().toISOString();
    return ((profiles ?? []) as Array<{
      id: string;
      email: string;
      full_name: string | null;
      role: "admin" | "super_admin";
      status: "active" | "suspended";
    }>).map((profile) => {
      const row = byProfile.get(profile.id);
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
        eligible:
          agent.enabled &&
          profile.status === "active" &&
          (profile.role === "admin" || profile.role === "super_admin"),
      };
    });
  }

  async getAgent(profileId: string): Promise<SupportAgent | null> {
    const { data, error } = await this.client()
      .from("support_agents")
      .select("*")
      .eq("profile_id", profileId)
      .maybeSingle();
    if (error) throw new Error(`support agent get: ${error.message}`);
    return (data as SupportAgent) ?? null;
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
    const row: Record<string, unknown> = {
      profile_id: profileId,
      updated_at: now,
    };
    if (patch.enabled !== undefined) row.enabled = patch.enabled;
    if (patch.availability !== undefined) {
      row.availability = patch.availability;
      row.availability_updated_at = now;
    }
    if (patch.last_assigned_at !== undefined) row.last_assigned_at = patch.last_assigned_at;
    const { data, error } = await this.client()
      .from("support_agents")
      .upsert(row, { onConflict: "profile_id" })
      .select("*")
      .single();
    if (error || !data) throw new Error(`support agent upsert: ${error?.message ?? "no row"}`);
    return data as SupportAgent;
  }

  // ── Conversations ────────────────────────────────────────────────

  async createConversation(input: CreateConversationInput): Promise<SupportConversation> {
    const { data, error } = await this.client()
      .from("support_conversations")
      .insert({ ...input, status: "open", handling_mode: "bot" })
      .select("*")
      .single();
    if (error || !data) throw new Error(`support conversation create: ${error?.message ?? "no row"}`);
    return data as SupportConversation;
  }

  async getConversation(id: string): Promise<SupportConversation | null> {
    const { data, error } = await this.client()
      .from("support_conversations")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`support conversation get: ${error.message}`);
    return (data as SupportConversation) ?? null;
  }

  async findConversationByGuestHash(hash: string): Promise<SupportConversation | null> {
    const { data, error } = await this.client()
      .from("support_conversations")
      .select("*")
      .eq("guest_access_token_hash", hash)
      .maybeSingle();
    if (error) throw new Error(`support conversation guest lookup: ${error.message}`);
    return (data as SupportConversation) ?? null;
  }

  async findLatestOpenConversationForUser(userId: string): Promise<SupportConversation | null> {
    const { data, error } = await this.client()
      .from("support_conversations")
      .select("*")
      .eq("user_id", userId)
      .neq("status", "resolved")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`support conversation user lookup: ${error.message}`);
    return (data as SupportConversation) ?? null;
  }

  async listConversations(filters: ConversationListFilters): Promise<ConversationListResult> {
    const { data, error } = await this.client()
      .from("support_conversations")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(CONVERSATION_LIST_CAP);
    if (error) throw new Error(`support conversations list: ${error.message}`);
    const rows = (data ?? []) as SupportConversation[];
    return {
      conversations: filterConversations(rows, filters),
      counts: computeQueueCounts(rows),
    };
  }

  async updateConversation(
    id: string,
    patch: Partial<SupportConversation>
  ): Promise<SupportConversation | null> {
    const { data, error } = await this.client()
      .from("support_conversations")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`support conversation update: ${error.message}`);
    return (data as SupportConversation) ?? null;
  }

  // ── Messages ─────────────────────────────────────────────────────

  async listMessages(
    conversationId: string,
    options: { afterSequence?: number; includeInternal: boolean; limit?: number }
  ): Promise<SupportMessage[]> {
    let query = this.client()
      .from("support_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("sequence_no", { ascending: true })
      .limit(options.limit ?? 200);
    if (!options.includeInternal) query = query.neq("kind", "internal_note");
    if (options.afterSequence !== undefined) {
      query = query.gt("sequence_no", options.afterSequence);
    }
    const { data, error } = await query;
    if (error) throw new Error(`support messages list: ${error.message}`);
    return (data ?? []) as SupportMessage[];
  }

  async findMessageByClientId(
    conversationId: string,
    clientMessageId: string
  ): Promise<SupportMessage | null> {
    const { data, error } = await this.client()
      .from("support_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .eq("client_message_id", clientMessageId)
      .maybeSingle();
    if (error) throw new Error(`support message idempotency lookup: ${error.message}`);
    return (data as SupportMessage) ?? null;
  }

  async postMessage(input: PostMessageInput): Promise<{
    message: SupportMessage;
    conversation: SupportConversation;
    duplicate: boolean;
  }> {
    const db = this.client();
    if (input.client_message_id) {
      const existing = await this.findMessageByClientId(input.conversation_id, input.client_message_id);
      if (existing) {
        const conversation = await this.getConversation(input.conversation_id);
        if (!conversation) throw new Error("support postMessage: conversation missing");
        return { message: existing, conversation, duplicate: true };
      }
    }
    const conversation = await this.getConversation(input.conversation_id);
    if (!conversation) throw new Error("support postMessage: conversation not found");

    const { data, error } = await db
      .from("support_messages")
      .insert({
        conversation_id: input.conversation_id,
        sender_type: input.sender_type,
        sender_profile_id: input.sender_profile_id,
        sender_display_name: input.sender_display_name,
        kind: input.kind,
        body: input.body,
        saved_reply_id: input.saved_reply_id ?? null,
        source_knowledge_id: input.source_knowledge_id ?? null,
        client_message_id: input.client_message_id ?? null,
        metadata: input.metadata ?? {},
      })
      .select("*")
      .single();
    if (error || !data) {
      // Lost a race with a retry of the same client_message_id: the
      // partial-unique index rejected the second insert — return the
      // original instead of erroring.
      if (error?.code === "23505" && input.client_message_id) {
        const existing = await this.findMessageByClientId(input.conversation_id, input.client_message_id);
        if (existing) return { message: existing, conversation, duplicate: true };
      }
      throw new Error(`support message insert: ${error?.message ?? "no row"}`);
    }
    const message = data as SupportMessage;
    const nowIso = new Date().toISOString();
    const { patch, reopened } = computeMessageEffects(conversation, message, nowIso);
    const updated =
      (await this.updateConversation(input.conversation_id, patch)) ?? conversation;
    if (reopened) {
      await this.appendEvent({
        conversation_id: input.conversation_id,
        event_type: "reopened",
        actor_type: message.sender_type,
        actor_profile_id: message.sender_profile_id,
        from_status: "resolved",
        to_status: "open",
        metadata: { reason: "visitor_message" },
      });
    }
    return { message, conversation: updated, duplicate: false };
  }

  // ── Events & read state ──────────────────────────────────────────

  async appendEvent(input: AppendEventInput): Promise<SupportConversationEvent> {
    const { data, error } = await this.client()
      .from("support_conversation_events")
      .insert({
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
      })
      .select("*")
      .single();
    if (error || !data) throw new Error(`support event append: ${error?.message ?? "no row"}`);
    return data as SupportConversationEvent;
  }

  async listEvents(conversationId: string): Promise<SupportConversationEvent[]> {
    const { data, error } = await this.client()
      .from("support_conversation_events")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`support events list: ${error.message}`);
    return (data ?? []) as SupportConversationEvent[];
  }

  async markVisitorRead(conversationId: string): Promise<void> {
    const db = this.client();
    const now = new Date().toISOString();
    await db
      .from("support_messages")
      .update({ visitor_read_at: now })
      .eq("conversation_id", conversationId)
      .in("sender_type", ["ai", "admin", "agent"])
      .is("visitor_read_at", null);
    await db
      .from("support_conversations")
      .update({ visitor_unread_count: 0, updated_at: now })
      .eq("id", conversationId);
  }

  async markAgentRead(conversationId: string): Promise<void> {
    const db = this.client();
    const now = new Date().toISOString();
    await db
      .from("support_messages")
      .update({ agent_read_at: now })
      .eq("conversation_id", conversationId)
      .in("sender_type", ["visitor", "user"])
      .is("agent_read_at", null);
    await db
      .from("support_conversations")
      .update({ agent_unread_count: 0, updated_at: now })
      .eq("id", conversationId);
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

let demoSingleton: SupportStore | null = null;
let supabaseSingleton: SupportStore | null = null;

/** The store for the app's current data mode (process singletons). */
export async function getSupportStore(): Promise<SupportStore> {
  if (getDataMode() === "demo") {
    if (!demoSingleton) {
      const { DemoSupportStore } = await import("./demo-store");
      demoSingleton = new DemoSupportStore();
    }
    return demoSingleton;
  }
  if (!supabaseSingleton) supabaseSingleton = new SupabaseSupportStore();
  return supabaseSingleton;
}

/** Test seam: build a store explicitly (used by the demo-store tests). */
export function createDemoSupportStore(): Promise<SupportStore> {
  return import("./demo-store").then(({ DemoSupportStore }) => new DemoSupportStore());
}
