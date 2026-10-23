/**
 * Support admin service (P10 Stage E) — the logic behind
 * /api/admin/support/*. Routes resolve the admin gate, hand over to
 * these functions, and mirror the returned `audit` entry into
 * audit_logs via recordAdminAudit (the events table is appended here,
 * since the timeline is product data).
 *
 * Permission model: permissions.ts. In short — super_admin does
 * everything; an `admin` needs an ENABLED support_agents row for
 * inbox/reply/claim/KB/saved-reply writes; settings are super_admin
 * only; assignment to others is super_admin only (agents claim
 * unassigned conversations for themselves).
 */

import type { AdminGate } from "@/lib/admin/platform-server";
import { foldText, matchKnowledge } from "./answer-core";
import { getSupportAIEnhancementState } from "./ai";
import { DEMO_SUPPORT_PROFILES } from "./demo-store";
import {
  canActOnConversation,
  supportPermissions,
  type SupportActor,
  type SupportPermissions,
} from "./permissions";
import { previewAnswer } from "./pipeline";
import type { SupportStore } from "./store";
import type { ConversationListFilters } from "./types";
import {
  slugify,
  validateCategoryInput,
  validateKnowledgeInput,
  validateMessageBody,
  validateSavedReplyInput,
  validateSettingsPatch,
} from "./validate";

export interface AdminServiceResult {
  status: number;
  body: Record<string, unknown>;
  /** When present, the route mirrors this into audit_logs. */
  audit?: { action: string; resource: string; details: string };
  /** All audit entries when one call made several mutations (assign + status). */
  audits?: Array<{ action: string; resource: string; details: string }>;
}

// ── Actor resolution ───────────────────────────────────────────────────────

export async function resolveSupportActor(
  gate: Exclude<AdminGate, { response: unknown }>,
  store: SupportStore
): Promise<{ actor: SupportActor; permissions: SupportPermissions }> {
  if (gate.mode === "demo") {
    const persona = DEMO_SUPPORT_PROFILES[0];
    const actor: SupportActor = {
      profileId: persona.id,
      email: persona.email,
      displayName: persona.full_name,
      role: "super_admin",
      agentEnabled: true,
      senderType: "admin",
    };
    return { actor, permissions: supportPermissions(actor.role, actor.agentEnabled) };
  }

  const caller = gate.caller;
  const agent = await store.getAgent(caller.id);
  const agentEnabled = !!agent && agent.enabled && caller.status === "active";
  const agents = agentEnabled ? await store.listAgents() : [];
  const self = agents.find((a) => a.profile_id === caller.id);
  const actor: SupportActor = {
    profileId: caller.id,
    email: caller.email,
    displayName: self?.full_name ?? caller.email,
    role: caller.role,
    agentEnabled,
    senderType: caller.role === "super_admin" ? "admin" : "agent",
  };
  return { actor, permissions: supportPermissions(actor.role, actor.agentEnabled) };
}

function forbidden(message = "Forbidden: support permission required"): AdminServiceResult {
  return { status: 403, body: { error: message } };
}

function notFound(): AdminServiceResult {
  return { status: 404, body: { error: "Conversation not found" } };
}

// ── Inbox ──────────────────────────────────────────────────────────────────

export async function listSupportConversations(
  store: SupportStore,
  actor: SupportActor,
  permissions: SupportPermissions,
  filters: ConversationListFilters
): Promise<AdminServiceResult> {
  if (!permissions.canViewInbox) return forbidden();
  const result = await store.listConversations(filters);
  return {
    status: 200,
    body: { mode: store.mode, conversations: result.conversations, counts: result.counts },
  };
}

export async function getSupportThread(
  store: SupportStore,
  actor: SupportActor,
  permissions: SupportPermissions,
  conversationId: string
): Promise<AdminServiceResult> {
  if (!permissions.canViewInbox) return forbidden();
  const conversation = await store.getConversation(conversationId);
  if (!conversation) return notFound();
  const [messages, events] = await Promise.all([
    store.listMessages(conversationId, { includeInternal: true, limit: 500 }),
    store.listEvents(conversationId),
  ]);
  return {
    status: 200,
    body: { mode: store.mode, conversation, messages, events },
  };
}

export async function postSupportAgentMessage(
  store: SupportStore,
  actor: SupportActor,
  permissions: SupportPermissions,
  conversationId: string,
  input: { body?: unknown; kind?: unknown; savedReplyId?: unknown }
): Promise<AdminServiceResult> {
  const conversation = await store.getConversation(conversationId);
  if (!conversation) return notFound();

  const kind = input.kind === "internal_note" ? "internal_note" : "message";
  if (kind === "internal_note" && !permissions.canNote) return forbidden();
  if (kind === "message" && !permissions.canReply) return forbidden();

  // Body: an explicit body wins; a saved_reply_id supplies the body
  // (snapshotted into the message — later template edits never
  // rewrite history).
  let bodyText = typeof input.body === "string" ? input.body : "";
  let savedReplyId: string | null = null;
  if (typeof input.savedReplyId === "string" && input.savedReplyId) {
    const reply = await store.getSavedReply(input.savedReplyId);
    if (!reply || !reply.enabled) {
      return { status: 400, body: { error: "Saved reply not found or disabled" } };
    }
    savedReplyId = reply.id;
    if (!bodyText) bodyText = reply.body;
  }
  const validation = validateMessageBody(bodyText);
  if (!validation.ok) return { status: 400, body: { error: validation.error } };

  if (kind === "message" && !canActOnConversation(actor, permissions, conversation)) {
    return forbidden("This conversation is assigned to another agent.");
  }

  // Replying to an unassigned conversation claims it (event-logged).
  let working = conversation;
  if (kind === "message" && conversation.assignee_id === null && actor.profileId) {
    const claimed = await store.updateConversation(conversationId, {
      assignee_id: actor.profileId,
      assigned_at: new Date().toISOString(),
    });
    if (claimed) {
      working = claimed;
      await store.appendEvent({
        conversation_id: conversationId,
        event_type: "assigned",
        actor_type: actor.senderType,
        actor_profile_id: actor.profileId,
        from_assignee_id: null,
        to_assignee_id: actor.profileId,
        metadata: { via: "reply_auto_claim" },
      });
    }
  }

  const { message } = await store.postMessage({
    conversation_id: conversationId,
    sender_type: actor.senderType,
    sender_profile_id: actor.profileId,
    sender_display_name: actor.displayName,
    kind,
    body: validation.value,
    saved_reply_id: savedReplyId,
  });

  if (kind === "internal_note") {
    await store.appendEvent({
      conversation_id: conversationId,
      event_type: "note_added",
      actor_type: actor.senderType,
      actor_profile_id: actor.profileId,
      metadata: {},
    });
  } else {
    // Posting a reply means the agent has read the thread.
    await store.markAgentRead(conversationId);
  }

  const fresh = (await store.getConversation(conversationId)) ?? working;
  return {
    status: 201,
    body: { mode: store.mode, message, conversation: fresh },
    audit:
      kind === "internal_note"
        ? {
            action: "SUPPORT_NOTE_ADDED",
            resource: `support_conversation:${conversationId}`,
            details: `Added an internal note to support conversation ${conversationId}`,
          }
        : {
            action: "SUPPORT_REPLY_SENT",
            resource: `support_conversation:${conversationId}`,
            details: `Replied to support conversation ${conversationId}`,
          },
  };
}

export async function markSupportAgentRead(
  store: SupportStore,
  actor: SupportActor,
  permissions: SupportPermissions,
  conversationId: string
): Promise<AdminServiceResult> {
  if (!permissions.canViewInbox) return forbidden();
  const conversation = await store.getConversation(conversationId);
  if (!conversation) return notFound();
  await store.markAgentRead(conversationId);
  const fresh = (await store.getConversation(conversationId)) ?? conversation;
  return { status: 200, body: { mode: store.mode, conversation: fresh } };
}

// ── Status & assignment ────────────────────────────────────────────────────

export async function updateSupportConversation(
  store: SupportStore,
  actor: SupportActor,
  permissions: SupportPermissions,
  conversationId: string,
  input: { status?: unknown; assignee_id?: unknown }
): Promise<AdminServiceResult> {
  const conversation = await store.getConversation(conversationId);
  if (!conversation) return notFound();
  const settings = await store.getSettings();
  const now = new Date().toISOString();
  let working = conversation;
  const audits: Array<NonNullable<AdminServiceResult["audit"]>> = [];

  if (input.assignee_id !== undefined) {
    const target = typeof input.assignee_id === "string" ? input.assignee_id : null;
    if (target === conversation.assignee_id) {
      // No-op.
    } else if (target === null) {
      const mayUnassign =
        permissions.canAssignOthers || conversation.assignee_id === actor.profileId;
      if (!mayUnassign) return forbidden("Only a super admin or the current assignee can unassign.");
      working = (await store.updateConversation(conversationId, {
        assignee_id: null,
        assigned_at: null,
      })) ?? working;
      await store.appendEvent({
        conversation_id: conversationId,
        event_type: "unassigned",
        actor_type: actor.senderType,
        actor_profile_id: actor.profileId,
        from_assignee_id: conversation.assignee_id,
        to_assignee_id: null,
        metadata: {},
      });
      audits.push({
        action: "SUPPORT_UNASSIGNED",
        resource: `support_conversation:${conversationId}`,
        details: `Unassigned support conversation ${conversationId}`,
      });
    } else {
      const isClaim = target === actor.profileId && conversation.assignee_id === null;
      if (isClaim && !permissions.canClaim) return forbidden();
      if (!isClaim && !permissions.canAssignOthers) {
        return forbidden("Assigning to another agent requires a super admin.");
      }
      const agents = await store.listAgents();
      const targetAgent = agents.find((a) => a.profile_id === target);
      if (!targetAgent || !targetAgent.eligible) {
        return { status: 400, body: { error: "Assignee is not an enabled support agent" } };
      }
      working = (await store.updateConversation(conversationId, {
        assignee_id: target,
        assigned_at: now,
      })) ?? working;
      await store.upsertAgent(target, { last_assigned_at: now }).catch(() => undefined);
      await store.appendEvent({
        conversation_id: conversationId,
        event_type: conversation.assignee_id ? "transferred" : "assigned",
        actor_type: actor.senderType,
        actor_profile_id: actor.profileId,
        from_assignee_id: conversation.assignee_id,
        to_assignee_id: target,
        metadata: isClaim ? { via: "claim" } : {},
      });
      audits.push({
        action: "SUPPORT_ASSIGNED",
        resource: `support_conversation:${conversationId}`,
        details: `Assigned support conversation ${conversationId} to agent ${target}`,
      });
    }
  }

  if (input.status !== undefined) {
    const status = input.status;
    if (status !== "open" && status !== "pending" && status !== "resolved") {
      return { status: 400, body: { error: 'status must be "open", "pending" or "resolved"' } };
    }
    if (!permissions.canChangeStatus) return forbidden();
    if (!canActOnConversation(actor, permissions, working)) {
      return forbidden("This conversation is assigned to another agent.");
    }
    if (status !== working.status) {
      const from = working.status;
      if (status === "resolved") {
        working = (await store.updateConversation(conversationId, {
          status: "resolved",
          resolved_at: now,
          resolved_by: actor.profileId,
        })) ?? working;
        await store.appendEvent({
          conversation_id: conversationId,
          event_type: "resolved",
          actor_type: actor.senderType,
          actor_profile_id: actor.profileId,
          from_status: from,
          to_status: "resolved",
          metadata: {},
        });
        audits.push({
          action: "SUPPORT_RESOLVED",
          resource: `support_conversation:${conversationId}`,
          details: `Resolved support conversation ${conversationId}`,
        });
        if (settings.closing_message) {
          await store.postMessage({
            conversation_id: conversationId,
            sender_type: "ai",
            sender_profile_id: null,
            sender_display_name: settings.display_name,
            kind: "message",
            body: settings.closing_message,
            metadata: { system_copy: "closing" },
          });
        }
      } else if (from === "resolved") {
        working = (await store.updateConversation(conversationId, {
          status,
          resolved_at: null,
          resolved_by: null,
        })) ?? working;
        await store.appendEvent({
          conversation_id: conversationId,
          event_type: "reopened",
          actor_type: actor.senderType,
          actor_profile_id: actor.profileId,
          from_status: from,
          to_status: status,
          metadata: {},
        });
        audits.push({
          action: "SUPPORT_REOPENED",
          resource: `support_conversation:${conversationId}`,
          details: `Reopened support conversation ${conversationId}`,
        });
      } else {
        working = (await store.updateConversation(conversationId, { status })) ?? working;
        await store.appendEvent({
          conversation_id: conversationId,
          event_type: "status_changed",
          actor_type: actor.senderType,
          actor_profile_id: actor.profileId,
          from_status: from,
          to_status: status,
          metadata: {},
        });
        audits.push({
          action: "SUPPORT_STATUS_CHANGED",
          resource: `support_conversation:${conversationId}`,
          details: `Changed support conversation ${conversationId} status ${from} → ${status}`,
        });
      }
    }
  }

  const fresh = (await store.getConversation(conversationId)) ?? working;
  return {
    status: 200,
    body: { mode: store.mode, conversation: fresh },
    audit: audits[0],
    audits,
  };
}

// ── Knowledge base ─────────────────────────────────────────────────────────

export async function listSupportKnowledge(
  store: SupportStore,
  actor: SupportActor,
  permissions: SupportPermissions
): Promise<AdminServiceResult> {
  if (!permissions.canAccessSupport) return forbidden();
  const [entries, categories] = await Promise.all([
    store.listKnowledge(),
    store.listCategories(),
  ]);
  return { status: 200, body: { mode: store.mode, entries, categories } };
}

async function uniqueSlug(store: SupportStore, base: string): Promise<string> {
  const entries = await store.listKnowledge();
  const taken = new Set(entries.map((e) => e.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

async function duplicateCheck(
  store: SupportStore,
  question: string,
  excludeId: string | null
): Promise<{ exact: { id: string; title: string } | null; soft: { id: string; title: string; score: number } | null }> {
  const entries = await store.listKnowledge();
  const folded = foldText(question);
  let soft: { id: string; title: string; score: number } | null = null;
  for (const entry of entries) {
    if (entry.id === excludeId || entry.status === "archived") continue;
    if (foldText(entry.question) === folded) {
      return { exact: { id: entry.id, title: entry.title }, soft: null };
    }
  }
  const answerable = await store.listAnswerable();
  const matchable = answerable
    .filter(({ entry }) => entry.id !== excludeId)
    .map(({ entry, category }) => ({
      id: entry.id,
      slug: entry.slug,
      title: entry.title,
      question: entry.question,
      answer: entry.answer,
      keywords: entry.keywords,
      category_name: category.name,
      priority: entry.priority,
      related_url: entry.related_url,
    }));
  const result = matchKnowledge(question, matchable);
  if (result.entry && result.score >= 85) {
    soft = { id: result.entry.id, title: result.entry.title, score: result.score };
  }
  return { exact: null, soft };
}

export async function createSupportKnowledge(
  store: SupportStore,
  actor: SupportActor,
  permissions: SupportPermissions,
  input: Record<string, unknown>
): Promise<AdminServiceResult> {
  if (!permissions.canManageKnowledge) return forbidden();
  const validation = validateKnowledgeInput(input, false);
  if (!validation.ok) return { status: 400, body: { error: validation.error } };
  const value = validation.value as import("./validate").KnowledgeInput;

  const categories = await store.listCategories();
  if (!categories.some((c) => c.id === value.category_id)) {
    return { status: 400, body: { error: "category_id does not reference an existing category" } };
  }
  const duplicates = await duplicateCheck(store, value.question, null);
  if (duplicates.exact) {
    return {
      status: 409,
      body: {
        error: "An entry with the same question already exists",
        code: "duplicate_question",
        duplicate_of: duplicates.exact,
      },
    };
  }
  const slug = await uniqueSlug(store, slugify(value.title));
  const entry = await store.createKnowledge({ ...value, slug }, actor.profileId);
  return {
    status: 201,
    body: {
      mode: store.mode,
      entry,
      warnings: duplicates.soft
        ? [`Very similar to existing entry "${duplicates.soft.title}" (match score ${duplicates.soft.score}).`]
        : [],
    },
    audit: {
      action: "SUPPORT_KB_CREATED",
      resource: `support_knowledge:${entry.id}`,
      details: `Created knowledge entry "${entry.title}" (${entry.status})`,
    },
  };
}

export async function updateSupportKnowledge(
  store: SupportStore,
  actor: SupportActor,
  permissions: SupportPermissions,
  id: string,
  input: Record<string, unknown>
): Promise<AdminServiceResult> {
  if (!permissions.canManageKnowledge) return forbidden();
  const existing = await store.getKnowledge(id);
  if (!existing) return { status: 404, body: { error: "Knowledge entry not found" } };
  const validation = validateKnowledgeInput(input, true);
  if (!validation.ok) return { status: 400, body: { error: validation.error } };
  const patch = validation.value;

  if (patch.question) {
    const duplicates = await duplicateCheck(store, patch.question, id);
    if (duplicates.exact) {
      return {
        status: 409,
        body: {
          error: "Another entry already uses this question",
          code: "duplicate_question",
          duplicate_of: duplicates.exact,
        },
      };
    }
  }
  if (patch.category_id) {
    const categories = await store.listCategories();
    if (!categories.some((c) => c.id === patch.category_id)) {
      return { status: 400, body: { error: "category_id does not reference an existing category" } };
    }
  }
  const entry = await store.updateKnowledge(id, patch, actor.profileId);
  if (!entry) return { status: 404, body: { error: "Knowledge entry not found" } };
  return {
    status: 200,
    body: { mode: store.mode, entry },
    audit: {
      action: "SUPPORT_KB_UPDATED",
      resource: `support_knowledge:${id}`,
      details: `Updated knowledge entry "${entry.title}" (${entry.status})`,
    },
  };
}

export async function deleteSupportKnowledge(
  store: SupportStore,
  actor: SupportActor,
  permissions: SupportPermissions,
  id: string
): Promise<AdminServiceResult> {
  if (!permissions.canManageKnowledge) return forbidden();
  const existing = await store.getKnowledge(id);
  if (!existing) return { status: 404, body: { error: "Knowledge entry not found" } };
  await store.deleteKnowledge(id);
  return {
    status: 200,
    body: { mode: store.mode, ok: true },
    audit: {
      action: "SUPPORT_KB_DELETED",
      resource: `support_knowledge:${id}`,
      details: `Deleted knowledge entry "${existing.title}"`,
    },
  };
}

// ── Categories ─────────────────────────────────────────────────────────────

export async function createSupportCategory(
  store: SupportStore,
  actor: SupportActor,
  permissions: SupportPermissions,
  input: Record<string, unknown>
): Promise<AdminServiceResult> {
  if (!permissions.canManageKnowledge) return forbidden();
  const validation = validateCategoryInput(input, false);
  if (!validation.ok) return { status: 400, body: { error: validation.error } };
  const value = validation.value as Required<import("./validate").CategoryInput>;
  try {
    const category = await store.createCategory(value, actor.profileId);
    return {
      status: 201,
      body: { mode: store.mode, category },
      audit: {
        action: "SUPPORT_CATEGORY_CREATED",
        resource: `support_category:${category.id}`,
        details: `Created knowledge category "${category.name}"`,
      },
    };
  } catch (err) {
    return {
      status: 409,
      body: { error: err instanceof Error ? err.message : "Category already exists" },
    };
  }
}

export async function updateSupportCategory(
  store: SupportStore,
  actor: SupportActor,
  permissions: SupportPermissions,
  id: string,
  input: Record<string, unknown>
): Promise<AdminServiceResult> {
  if (!permissions.canManageKnowledge) return forbidden();
  const validation = validateCategoryInput(input, true);
  if (!validation.ok) return { status: 400, body: { error: validation.error } };
  const category = await store.updateCategory(id, validation.value, actor.profileId);
  if (!category) return { status: 404, body: { error: "Category not found" } };
  return {
    status: 200,
    body: { mode: store.mode, category },
    audit: {
      action: "SUPPORT_CATEGORY_UPDATED",
      resource: `support_category:${id}`,
      details: `Updated knowledge category "${category.name}"`,
    },
  };
}

export async function deleteSupportCategory(
  store: SupportStore,
  actor: SupportActor,
  permissions: SupportPermissions,
  id: string
): Promise<AdminServiceResult> {
  if (!permissions.canManageKnowledge) return forbidden();
  const deleted = await store.deleteCategory(id);
  if (!deleted) {
    return {
      status: 409,
      body: { error: "Category still has knowledge entries — move or delete them first" },
    };
  }
  return {
    status: 200,
    body: { mode: store.mode, ok: true },
    audit: {
      action: "SUPPORT_CATEGORY_DELETED",
      resource: `support_category:${id}`,
      details: `Deleted knowledge category ${id}`,
    },
  };
}

// ── Saved replies ──────────────────────────────────────────────────────────

export async function listSupportSavedReplies(
  store: SupportStore,
  actor: SupportActor,
  permissions: SupportPermissions
): Promise<AdminServiceResult> {
  if (!permissions.canAccessSupport) return forbidden();
  const replies = await store.listSavedReplies();
  return { status: 200, body: { mode: store.mode, replies } };
}

export async function createSupportSavedReply(
  store: SupportStore,
  actor: SupportActor,
  permissions: SupportPermissions,
  input: Record<string, unknown>
): Promise<AdminServiceResult> {
  if (!permissions.canManageSavedReplies) return forbidden();
  const validation = validateSavedReplyInput(input, false);
  if (!validation.ok) return { status: 400, body: { error: validation.error } };
  const reply = await store.createSavedReply(
    validation.value as Required<import("./validate").SavedReplyInput>,
    actor.profileId
  );
  return {
    status: 201,
    body: { mode: store.mode, reply },
    audit: {
      action: "SUPPORT_REPLY_CREATED",
      resource: `support_saved_reply:${reply.id}`,
      details: `Created saved reply "${reply.title}"`,
    },
  };
}

export async function updateSupportSavedReply(
  store: SupportStore,
  actor: SupportActor,
  permissions: SupportPermissions,
  id: string,
  input: Record<string, unknown>
): Promise<AdminServiceResult> {
  if (!permissions.canManageSavedReplies) return forbidden();
  const validation = validateSavedReplyInput(input, true);
  if (!validation.ok) return { status: 400, body: { error: validation.error } };
  const reply = await store.updateSavedReply(id, validation.value, actor.profileId);
  if (!reply) return { status: 404, body: { error: "Saved reply not found" } };
  return {
    status: 200,
    body: { mode: store.mode, reply },
    audit: {
      action: "SUPPORT_REPLY_UPDATED",
      resource: `support_saved_reply:${id}`,
      details: `Updated saved reply "${reply.title}"`,
    },
  };
}

export async function deleteSupportSavedReply(
  store: SupportStore,
  actor: SupportActor,
  permissions: SupportPermissions,
  id: string
): Promise<AdminServiceResult> {
  if (!permissions.canManageSavedReplies) return forbidden();
  const existing = await store.getSavedReply(id);
  if (!existing) return { status: 404, body: { error: "Saved reply not found" } };
  await store.deleteSavedReply(id);
  return {
    status: 200,
    body: { mode: store.mode, ok: true },
    audit: {
      action: "SUPPORT_REPLY_DELETED",
      resource: `support_saved_reply:${id}`,
      details: `Deleted saved reply "${existing.title}"`,
    },
  };
}

// ── Settings (super_admin only) ────────────────────────────────────────────

export async function getSupportSettings(
  store: SupportStore,
  actor: SupportActor,
  permissions: SupportPermissions
): Promise<AdminServiceResult> {
  if (!permissions.canManageSettings) return forbidden("Settings are super admin only.");
  const settings = await store.getSettings();
  const aiState = getSupportAIEnhancementState();
  return {
    status: 200,
    body: {
      mode: store.mode,
      settings,
      ai_enhancement_provider: aiState.configured ? aiState.provider : null,
      ai_enhancement_configured: aiState.configured,
    },
  };
}

export async function updateSupportSettings(
  store: SupportStore,
  actor: SupportActor,
  permissions: SupportPermissions,
  input: Record<string, unknown>
): Promise<AdminServiceResult> {
  if (!permissions.canManageSettings) return forbidden("Settings are super admin only.");
  const validation = validateSettingsPatch(input);
  if (!validation.ok) return { status: 400, body: { error: validation.error } };
  const settings = await store.updateSettings(validation.value, actor.profileId);
  return {
    status: 200,
    body: { mode: store.mode, settings },
    audit: {
      action: "SUPPORT_SETTINGS_UPDATED",
      resource: "support_settings:global",
      details: `Updated support settings: ${Object.keys(validation.value).join(", ") || "(no changes)"}`,
    },
  };
}

// ── Agents ─────────────────────────────────────────────────────────────────

export async function listSupportAgents(
  store: SupportStore,
  actor: SupportActor,
  permissions: SupportPermissions
): Promise<AdminServiceResult> {
  if (!permissions.canViewAgents) return forbidden();
  const agents = await store.listAgents();
  return { status: 200, body: { mode: store.mode, agents } };
}

export async function updateSupportAgent(
  store: SupportStore,
  actor: SupportActor,
  permissions: SupportPermissions,
  input: { profile_id?: unknown; enabled?: unknown; availability?: unknown }
): Promise<AdminServiceResult> {
  const profileId = typeof input.profile_id === "string" ? input.profile_id : "";
  if (!profileId) return { status: 400, body: { error: "profile_id is required" } };

  const patch: { enabled?: boolean; availability?: "offline" | "available" | "busy" } = {};
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean") {
      return { status: 400, body: { error: "enabled must be a boolean" } };
    }
    patch.enabled = input.enabled;
  }
  if (input.availability !== undefined) {
    if (
      input.availability !== "offline" &&
      input.availability !== "available" &&
      input.availability !== "busy"
    ) {
      return { status: 400, body: { error: 'availability must be "offline", "available" or "busy"' } };
    }
    patch.availability = input.availability;
  }
  if (patch.enabled === undefined && patch.availability === undefined) {
    return { status: 400, body: { error: "Nothing to update" } };
  }

  const isSelf = profileId === actor.profileId;
  if (patch.enabled !== undefined && !permissions.canManageAgents) {
    return forbidden("Enabling or disabling agents is super admin only.");
  }
  if (patch.availability !== undefined && !isSelf && !permissions.canManageAgents) {
    return forbidden("Only the agent themselves or a super admin can set availability.");
  }
  if (patch.availability !== undefined && isSelf && !permissions.canSetOwnAvailability) {
    return forbidden();
  }

  const agent = await store.upsertAgent(profileId, patch);
  return {
    status: 200,
    body: { mode: store.mode, agent },
    audit: {
      action: "SUPPORT_AGENT_UPDATED",
      resource: `support_agent:${profileId}`,
      details: `Updated support agent ${profileId}: ${JSON.stringify(patch)}`,
    },
  };
}

// ── Preview (same pipeline, writes nothing) ────────────────────────────────

export async function previewSupportAnswer(
  store: SupportStore,
  actor: SupportActor,
  permissions: SupportPermissions,
  input: { question?: unknown }
): Promise<AdminServiceResult> {
  if (!permissions.canPreview) return forbidden();
  const question = typeof input.question === "string" ? input.question.trim() : "";
  if (!question) return { status: 400, body: { error: "question is required" } };
  if (question.length > 4000) {
    return { status: 400, body: { error: "question must be at most 4000 characters" } };
  }
  const settings = await store.getSettings();
  const result = await previewAnswer(store, settings, question);
  return { status: 200, body: { mode: store.mode, preview: result } };
}
