/**
 * OpenAI adapter — typed fetch against the documented Chat Completions
 * API (https://api.openai.com/v1/chat/completions). Chosen over the SDK
 * to keep the server bundle small; the wire format is the documented
 * one and the fetch implementation is injectable for tests.
 *
 * The API key is read from the server-only OPENAI_API_KEY env var.
 */

import { isConfiguredValue, type ProviderState } from "@/lib/env";
import type { AIProviderAdapter, DraftRequest, DraftResult } from "./types";
import { DRAFT_SYSTEM_PROMPT, buildDraftUserPrompt } from "./prompt";

export type FetchFn = typeof fetch;

export class OpenAIAdapter implements AIProviderAdapter {
  readonly provider = "openai" as const;
  private readonly fetchFn: FetchFn;

  constructor(fetchFn: FetchFn = fetch) {
    this.fetchFn = fetchFn;
  }

  getState(): ProviderState {
    return isConfiguredValue(process.env.OPENAI_API_KEY) ? "connected" : "not_connected";
  }

  async draftOutreach(input: DraftRequest): Promise<DraftResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!isConfiguredValue(apiKey)) {
      return {
        status: "not_configured",
        provider: null,
        draft: null,
        aiGenerated: false,
        message: "OPENAI_API_KEY is not configured. No draft was generated.",
      };
    }
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    try {
      const res = await this.fetchFn("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.7,
          max_tokens: 400,
          messages: [
            { role: "system", content: DRAFT_SYSTEM_PROMPT },
            { role: "user", content: buildDraftUserPrompt(input) },
          ],
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return {
          status: "error",
          provider: "openai",
          draft: null,
          aiGenerated: false,
          message: `OpenAI request failed (HTTP ${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}. No draft was generated.`,
        };
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const draft = json.choices?.[0]?.message?.content?.trim();
      if (!draft) {
        return {
          status: "error",
          provider: "openai",
          draft: null,
          aiGenerated: false,
          message: "OpenAI returned an empty completion. No draft was generated.",
        };
      }
      return {
        status: "ok",
        provider: "openai",
        draft,
        aiGenerated: true,
        message:
          "AI-generated draft (OpenAI). Review and edit it before use — it has not been sent anywhere.",
      };
    } catch (err) {
      return {
        status: "error",
        provider: "openai",
        draft: null,
        aiGenerated: false,
        message: `OpenAI request failed: ${err instanceof Error ? err.message : "network error"}. No draft was generated.`,
      };
    }
  }
}
