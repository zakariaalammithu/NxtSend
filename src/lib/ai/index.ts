/**
 * AI module entry point.
 *
 * draftOutreachMessage() is the single orchestration used by
 * POST /api/ai/draft: demo -> labelled local sample; no key -> honest
 * not_configured; key -> the selected provider adapter. Human review is
 * mandatory by design: the result is text for an editor, never a send.
 */

import { getAIState } from "./state";
import { OpenAIAdapter } from "./openai";
import { AnthropicAdapter } from "./anthropic";
import { MetaModelAdapter } from "./meta";
import { demoDraft } from "./demo";
import type { AIProviderAdapter, DraftRequest, DraftResult } from "./types";

export * from "./types";
export { getAIState } from "./state";
export type { AIState } from "./state";
export { OpenAIAdapter } from "./openai";
export { AnthropicAdapter } from "./anthropic";
export { MetaModelAdapter } from "./meta";
export { demoDraft } from "./demo";
export { buildDraftUserPrompt, renderTemplate, DRAFT_SYSTEM_PROMPT } from "./prompt";

export async function draftOutreachMessage(
  input: DraftRequest
): Promise<DraftResult> {
  const { state, provider } = getAIState();
  if (state === "demo") return demoDraft(input);
  if (state !== "connected" || !provider) {
    return {
      status: "not_configured",
      provider: null,
      draft: null,
      aiGenerated: false,
      message:
        "AI drafting is not configured: set OPENAI_API_KEY, ANTHROPIC_API_KEY or MODEL_API_KEY on the server (see SETUP.md). No draft was generated.",
    };
  }
  const adapter: AIProviderAdapter =
    provider === "openai"
      ? new OpenAIAdapter()
      : provider === "anthropic"
        ? new AnthropicAdapter()
        : new MetaModelAdapter();
  return adapter.draftOutreach(input);
}
