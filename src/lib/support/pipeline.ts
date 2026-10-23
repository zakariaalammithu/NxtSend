/**
 * Support bot pipeline (P10 Stage E).
 *
 * Runs when a visitor/user message lands in a bot-mode conversation:
 *
 *   1. handling_mode = 'human'        -> no bot reply (a person owns it)
 *   2. settings.ai_kb_enabled = false -> configured fallback copy
 *   3. account-specific question      -> account guard (the assistant
 *      has NO account-data tools; it points at the dashboard / a
 *      person instead of answering from the KB or the AI layer)
 *   4. deterministic matcher          -> direct / clear-leader band:
 *      the entry's answer, posted with its source_knowledge_id
 *   5. otherwise, IF the AI enhancement is enabled in settings AND a
 *      provider is configured AND candidates exist: a grounded
 *      completion over ONLY those candidates (guarded — see ai.ts).
 *      Demo Mode never calls a provider.
 *   6. otherwise                      -> fallback message (from
 *      settings copy) + the conversation is flagged
 *      escalation_offered so the widget can surface the handoff.
 *
 * Every assistant message records its engine + sources in metadata,
 * so any answer can be traced to the KB entry that produced it.
 */

import { createRateLimiter } from "@/lib/admin/submissions-core";
import {
  detectAccountIntent,
  matchKnowledge,
  type AnswerBand,
  type MatchableEntry,
} from "./answer-core";
import {
  generateGroundedAnswer,
  getSupportAIEnhancementState,
  type FetchFn,
  type SupportAIProvider,
} from "./ai";
import type { SupportStore } from "./store";
import type {
  SupportConversation,
  SupportMessage,
  SupportSettings,
} from "./types";

export function toMatchable(answerable: {
  entry: import("./types").SupportKnowledgeEntry;
  category: import("./types").SupportKnowledgeCategory;
}): MatchableEntry {
  return {
    id: answerable.entry.id,
    slug: answerable.entry.slug,
    title: answerable.entry.title,
    question: answerable.entry.question,
    answer: answerable.entry.answer,
    keywords: answerable.entry.keywords,
    category_name: answerable.category.name,
    priority: answerable.entry.priority,
    related_url: answerable.entry.related_url,
  };
}

// ── Copy composed from settings (never invented facts) ─────────────────────

export function buildFallbackMessage(settings: SupportSettings): string {
  const base =
    "I couldn't find a reliable answer to that in our help content, so I don't want to guess.";
  if (settings.live_support_enabled && settings.allow_user_escalation) {
    return `${base} You can ask for a person and I'll hand this conversation to the support team.`;
  }
  return `${base} You can reach the team at ${settings.support_email}.`;
}

export function buildAccountGuardMessage(settings: SupportSettings, label: string): string {
  const pointer =
    label === "billing"
      ? "You can check your plan, invoices and receipts under Dashboard → Billing once you're signed in."
      : label === "campaigns"
        ? "You can see your campaigns and leads in the Dashboard once you're signed in."
        : "You can manage your account under Dashboard → Settings once you're signed in.";
  const tail =
    settings.live_support_enabled && settings.allow_user_escalation
      ? " Or ask for a person here and the support team can help with your account."
      : "";
  return `I can't see your own account details here — I don't have access to account data. ${pointer}${tail}`;
}

// ── AI call cap (abuse bound; per-process like the other limiters) ─────────

const aiCallLimiter = createRateLimiter({ maxAttempts: 10, windowMs: 60 * 60 * 1000 });

function aiCallAllowed(conversationId: string): boolean {
  return aiCallLimiter.check(`ai:${conversationId}`, Date.now());
}

// ── Pipeline ───────────────────────────────────────────────────────────────

export interface BotPipelineDeps {
  fetchFn?: FetchFn;
  providerOverride?: SupportAIProvider | null;
}

async function flagEscalationOffered(
  store: SupportStore,
  conversation: SupportConversation
): Promise<void> {
  await store.updateConversation(conversation.id, {
    metadata: {
      ...conversation.metadata,
      escalation_offered_at: new Date().toISOString(),
    },
  });
}

export async function runBotPipeline(
  store: SupportStore,
  settings: SupportSettings,
  conversation: SupportConversation,
  question: string,
  deps: BotPipelineDeps = {}
): Promise<SupportMessage[]> {
  if (conversation.handling_mode !== "bot") return [];

  const post = async (
    body: string,
    metadata: Record<string, unknown>,
    sourceKnowledgeId: string | null
  ): Promise<SupportMessage> => {
    const { message } = await store.postMessage({
      conversation_id: conversation.id,
      sender_type: "ai",
      sender_profile_id: null,
      sender_display_name: settings.display_name,
      kind: "message",
      body,
      source_knowledge_id: sourceKnowledgeId,
      metadata,
    });
    return message;
  };

  if (!settings.ai_kb_enabled) {
    const message = await post(
      buildFallbackMessage(settings),
      { engine: "fallback", reason: "kb_disabled" },
      null
    );
    if (settings.live_support_enabled && settings.allow_user_escalation) {
      await flagEscalationOffered(store, conversation);
    }
    return [message];
  }

  const accountIntent = detectAccountIntent(question);
  if (accountIntent) {
    const message = await post(
      buildAccountGuardMessage(settings, accountIntent.label),
      { engine: "account_guard", intent: accountIntent.label },
      null
    );
    if (settings.live_support_enabled && settings.allow_user_escalation) {
      await flagEscalationOffered(store, conversation);
    }
    return [message];
  }

  const answerable = await store.listAnswerable();
  const result = matchKnowledge(question, answerable.map(toMatchable));

  if ((result.band === "direct" || result.band === "leader") && result.entry) {
    const message = await post(
      result.entry.answer,
      {
        engine: "kb_match",
        score: result.score,
        band: result.band,
        source_knowledge_ids: [result.entry.id],
      },
      result.entry.id
    );
    return [message];
  }

  // Optional grounded AI layer — only with candidates to ground on,
  // only when enabled AND configured, and never in Demo Mode.
  if (
    settings.ai_enhancement_enabled &&
    store.mode !== "demo" &&
    result.candidates.length > 0 &&
    aiCallAllowed(conversation.id)
  ) {
    const aiState = getSupportAIEnhancementState();
    if (aiState.configured || deps.providerOverride) {
      const grounded = await generateGroundedAnswer({
        question,
        candidates: result.candidates.map((candidate) => candidate.entry),
        fetchFn: deps.fetchFn,
        providerOverride: deps.providerOverride,
      });
      if (grounded.status === "ok") {
        const message = await post(
          grounded.answer,
          {
            engine: "ai_grounded",
            provider: grounded.provider,
            score: result.score,
            source_knowledge_ids: grounded.sourceIds,
          },
          grounded.sourceIds[0] ?? null
        );
        return [message];
      }
    }
  }

  const message = await post(
    buildFallbackMessage(settings),
    {
      engine: "fallback",
      reason: "no_confident_match",
      score: result.score,
      top_candidate_id: result.entry?.id ?? null,
    },
    null
  );
  if (settings.live_support_enabled && settings.allow_user_escalation) {
    await flagEscalationOffered(store, conversation);
  }
  return [message];
}

// ── Admin preview (same pipeline, writes NOTHING) ──────────────────────────

export interface SupportPreviewResult {
  band: AnswerBand | "account_guard";
  score: number;
  margin: number;
  engine: "kb_match" | "ai_grounded" | "account_guard" | "fallback";
  answer: string | null;
  source_knowledge_ids: string[];
  candidates: Array<{ id: string; slug: string; title: string; score: number }>;
}

export async function previewAnswer(
  store: SupportStore,
  settings: SupportSettings,
  question: string,
  deps: BotPipelineDeps = {}
): Promise<SupportPreviewResult> {
  const accountIntent = detectAccountIntent(question);
  if (accountIntent && settings.ai_kb_enabled) {
    return {
      band: "account_guard",
      score: 0,
      margin: 0,
      engine: "account_guard",
      answer: buildAccountGuardMessage(settings, accountIntent.label),
      source_knowledge_ids: [],
      candidates: [],
    };
  }
  if (!settings.ai_kb_enabled) {
    return {
      band: "fallback",
      score: 0,
      margin: 0,
      engine: "fallback",
      answer: buildFallbackMessage(settings),
      source_knowledge_ids: [],
      candidates: [],
    };
  }

  const answerable = await store.listAnswerable();
  const result = matchKnowledge(question, answerable.map(toMatchable));
  const candidates = result.candidates.map((candidate) => ({
    id: candidate.entry.id,
    slug: candidate.entry.slug,
    title: candidate.entry.title,
    score: candidate.score,
  }));

  if ((result.band === "direct" || result.band === "leader") && result.entry) {
    return {
      band: result.band,
      score: result.score,
      margin: result.margin,
      engine: "kb_match",
      answer: result.entry.answer,
      source_knowledge_ids: [result.entry.id],
      candidates,
    };
  }

  if (
    settings.ai_enhancement_enabled &&
    store.mode !== "demo" &&
    result.candidates.length > 0
  ) {
    const aiState = getSupportAIEnhancementState();
    if (aiState.configured || deps.providerOverride) {
      const grounded = await generateGroundedAnswer({
        question,
        candidates: result.candidates.map((candidate) => candidate.entry),
        fetchFn: deps.fetchFn,
        providerOverride: deps.providerOverride,
      });
      if (grounded.status === "ok") {
        return {
          band: result.band,
          score: result.score,
          margin: result.margin,
          engine: "ai_grounded",
          answer: grounded.answer,
          source_knowledge_ids: grounded.sourceIds,
          candidates,
        };
      }
    }
  }

  return {
    band: "fallback",
    score: result.score,
    margin: result.margin,
    engine: "fallback",
    answer: buildFallbackMessage(settings),
    source_knowledge_ids: [],
    candidates,
  };
}
