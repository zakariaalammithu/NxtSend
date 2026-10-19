/**
 * Anthropic (Claude) adapter — typed fetch against the documented
 * Messages API (https://api.anthropic.com/v1/messages) with the
 * `x-api-key` + `anthropic-version` headers from Anthropic's docs.
 * Chosen over the SDK for the same reason as the OpenAI adapter: small
 * server surface, documented wire format, injectable fetch for tests.
 *
 * The API key is read from the server-only ANTHROPIC_API_KEY env var.
 */

import { isConfiguredValue, type ProviderState } from "@/lib/env";
import type { AIProviderAdapter, DraftRequest, DraftResult } from "./types";
import { DRAFT_SYSTEM_PROMPT, buildDraftUserPrompt } from "./prompt";
import type { FetchFn } from "./openai";

export class AnthropicAdapter implements AIProviderAdapter {
  readonly provider = "anthropic" as const;
  private readonly fetchFn: FetchFn;

  constructor(fetchFn: FetchFn = fetch) {
    this.fetchFn = fetchFn;
  }

  getState(): ProviderState {
    return isConfiguredValue(process.env.ANTHROPIC_API_KEY) ? "connected" : "not_connected";
  }

  async draftOutreach(input: DraftRequest): Promise<DraftResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!isConfiguredValue(apiKey)) {
      return {
        status: "not_configured",
        provider: null,
        draft: null,
        aiGenerated: false,
        message: "ANTHROPIC_API_KEY is not configured. No draft was generated.",
      };
    }
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
    try {
      const res = await this.fetchFn("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 400,
          system: DRAFT_SYSTEM_PROMPT,
          messages: [
            { role: "user", content: buildDraftUserPrompt(input) },
          ],
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return {
          status: "error",
          provider: "anthropic",
          draft: null,
          aiGenerated: false,
          message: `Anthropic request failed (HTTP ${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}. No draft was generated.`,
        };
      }
      const json = (await res.json()) as {
        content?: Array<{ type?: string; text?: string }>;
      };
      const draft = json.content
        ?.filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("")
        .trim();
      if (!draft) {
        return {
          status: "error",
          provider: "anthropic",
          draft: null,
          aiGenerated: false,
          message: "Anthropic returned an empty completion. No draft was generated.",
        };
      }
      return {
        status: "ok",
        provider: "anthropic",
        draft,
        aiGenerated: true,
        message:
          "AI-generated draft (Claude). Review and edit it before use — it has not been sent anywhere.",
      };
    } catch (err) {
      return {
        status: "error",
        provider: "anthropic",
        draft: null,
        aiGenerated: false,
        message: `Anthropic request failed: ${err instanceof Error ? err.message : "network error"}. No draft was generated.`,
      };
    }
  }
}
