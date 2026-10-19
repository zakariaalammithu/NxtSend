/**
 * Meta Model API adapter — typed fetch against the OpenAI-compatible
 * chat-completions shape at https://api.meta.ai/v1, authenticated with
 * a server-side Bearer MODEL_API_KEY.
 *
 * IMPORTANT — provenance of these endpoint details: the Meta Model API
 * is a public preview (confirmed by Meta's own AI blog, 2026), but the
 * endpoint/auth/model details implemented here are documented via
 * SECONDARY sources quoting Meta's developer documentation — Meta's
 * developer portal could not be fetched directly during the
 * 2026-10-19 research (see the Muse.ai investigation report). The
 * adapter is honest about that: it only activates when MODEL_API_KEY
 * is configured, and the Integration Center's Test Connection is the
 * first primary confirmation for any given key.
 *
 * This is Meta's MODEL API (LLM inference for Muse Spark models).
 * It is NOT an API for Meta's Muse agent product — that product has
 * no agent API (see src/lib/muse-connector/).
 */

import { isConfiguredValue, type ProviderState } from "@/lib/env";
import type { AIProviderAdapter, DraftRequest, DraftResult } from "./types";
import { DRAFT_SYSTEM_PROMPT, buildDraftUserPrompt } from "./prompt";

export type FetchFn = typeof fetch;

export const META_MODEL_API_BASE = "https://api.meta.ai/v1";
export const META_MODEL_DEFAULT = "muse-spark-1.3";

export class MetaModelAdapter implements AIProviderAdapter {
  readonly provider = "meta" as const;
  private readonly fetchFn: FetchFn;

  constructor(fetchFn: FetchFn = fetch) {
    this.fetchFn = fetchFn;
  }

  getState(): ProviderState {
    return isConfiguredValue(process.env.MODEL_API_KEY) ? "connected" : "not_connected";
  }

  async draftOutreach(input: DraftRequest): Promise<DraftResult> {
    const apiKey = process.env.MODEL_API_KEY;
    if (!isConfiguredValue(apiKey)) {
      return {
        status: "not_configured",
        provider: null,
        draft: null,
        aiGenerated: false,
        message: "MODEL_API_KEY is not configured. No draft was generated.",
      };
    }
    const model = process.env.META_MODEL || META_MODEL_DEFAULT;
    try {
      const res = await this.fetchFn(`${META_MODEL_API_BASE}/chat/completions`, {
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
          provider: "meta",
          draft: null,
          aiGenerated: false,
          message: `Meta Model API request failed (HTTP ${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}. No draft was generated. (Endpoint details are secondary-sourced pending official docs access — see SETUP.md §14.)`,
        };
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const draft = json.choices?.[0]?.message?.content?.trim();
      if (!draft) {
        return {
          status: "error",
          provider: "meta",
          draft: null,
          aiGenerated: false,
          message: "Meta Model API returned an empty completion. No draft was generated.",
        };
      }
      return {
        status: "ok",
        provider: "meta",
        draft,
        aiGenerated: true,
        message:
          "AI-generated draft (Meta Model API / Muse Spark). Review and edit it before use — it has not been sent anywhere.",
      };
    } catch (err) {
      return {
        status: "error",
        provider: "meta",
        draft: null,
        aiGenerated: false,
        message: `Meta Model API request failed: ${err instanceof Error ? err.message : "network error"}. No draft was generated.`,
      };
    }
  }
}
