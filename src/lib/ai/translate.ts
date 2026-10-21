/**
 * Message translation (P6 Stage C) — translates composer / transcript
 * text between voice-catalogue languages through the SAME AI provider
 * stack as the draft generator (OpenAI → Anthropic → Meta, first
 * configured key wins; see ./state.ts).
 *
 * State honesty is identical to /api/ai/draft:
 *  - demo         → status "simulated": the text is returned
 *                   UNCHANGED and labelled as not translated. Demo
 *                   Mode never invents a translation.
 *  - not_connected→ status "not_configured": no key, no translation.
 *  - provider call → status "ok" with aiGenerated: true, or "error"
 *                   with the provider's failure — never a fake result.
 *
 * The provider HTTP shapes mirror the draft adapters (chat
 * completions for OpenAI/Meta, Messages API for Anthropic) with a
 * translation system prompt instead of the outreach one.
 */

import { isConfiguredValue } from "@/lib/env";
import type { DataMode } from "@/lib/data/mode";
import { getAIState, type AIState } from "./state";
import { META_MODEL_API_BASE, META_MODEL_DEFAULT } from "./meta";
import { voiceLanguageName } from "@/lib/voice/languages";

export type FetchFn = typeof fetch;

export interface TranslateRequest {
  text: string;
  /** BCP-47 code of the target language (voice catalogue). */
  targetLanguage: string;
  /** Optional BCP-47 code of the source language (auto-detect when omitted). */
  sourceLanguage?: string;
}

export interface TranslateResult {
  status: "ok" | "simulated" | "not_configured" | "error";
  provider: "openai" | "anthropic" | "meta" | null;
  translatedText: string | null;
  aiGenerated: boolean;
  message: string;
}

export const MAX_TRANSLATE_CHARS = 5000;

export const TRANSLATE_SYSTEM_PROMPT = [
  "You are a precise translation engine for short business outreach messages.",
  "Translate the user's text into the requested target language.",
  "Preserve placeholders like {first_name}, {company} and {my_name} EXACTLY as written.",
  "Preserve line breaks and tone. Output ONLY the translated text — no quotes, no commentary.",
].join(" ");

export function buildTranslateUserPrompt(input: TranslateRequest): string {
  const target = voiceLanguageName(input.targetLanguage);
  const source = input.sourceLanguage
    ? ` from ${voiceLanguageName(input.sourceLanguage)}`
    : "";
  return `Translate the following text${source} into ${target}:\n\n${input.text}`;
}

type Provider = "openai" | "anthropic" | "meta";

async function callProvider(
  provider: Provider,
  env: Record<string, string | undefined>,
  fetchFn: FetchFn,
  input: TranslateRequest
): Promise<TranslateResult> {
  const userPrompt = buildTranslateUserPrompt(input);
  try {
    if (provider === "anthropic") {
      const res = await fetchFn("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY as string,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
          max_tokens: 1200,
          system: TRANSLATE_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      if (!res.ok) return providerError(provider, res.status, await safeText(res));
      const json = (await res.json()) as {
        content?: Array<{ type?: string; text?: string }>;
      };
      const text = json.content
        ?.filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("")
        .trim();
      return finish(provider, text);
    }
    const isOpenAI = provider === "openai";
    const url = isOpenAI
      ? "https://api.openai.com/v1/chat/completions"
      : `${META_MODEL_API_BASE}/chat/completions`;
    const apiKey = isOpenAI ? env.OPENAI_API_KEY : env.MODEL_API_KEY;
    const model = isOpenAI
      ? env.OPENAI_MODEL || "gpt-4o-mini"
      : env.META_MODEL || META_MODEL_DEFAULT;
    const res = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 1200,
        messages: [
          { role: "system", content: TRANSLATE_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) return providerError(provider, res.status, await safeText(res));
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return finish(provider, json.choices?.[0]?.message?.content?.trim());
  } catch (err) {
    return {
      status: "error",
      provider,
      translatedText: null,
      aiGenerated: false,
      message: `Translation failed: ${err instanceof Error ? err.message : "network error"}. The text was not translated.`,
    };
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function providerError(provider: Provider, status: number, detail: string): TranslateResult {
  return {
    status: "error",
    provider,
    translatedText: null,
    aiGenerated: false,
    message: `Translation request failed (HTTP ${status})${detail ? `: ${detail.slice(0, 200)}` : ""}. The text was not translated.`,
  };
}

function finish(provider: Provider, text: string | undefined): TranslateResult {
  if (!text) {
    return {
      status: "error",
      provider,
      translatedText: null,
      aiGenerated: false,
      message: "The provider returned an empty translation. The text was not translated.",
    };
  }
  return {
    status: "ok",
    provider,
    translatedText: text,
    aiGenerated: true,
    message: `Translated by AI (${provider}). Machine translation — review it before sending.`,
  };
}

/**
 * Translates text with full state honesty. Demo → simulated (text
 * returned unchanged, labelled); no key → not_configured.
 */
export async function translateText(
  input: TranslateRequest,
  opts: {
    env?: Record<string, string | undefined>;
    mode?: DataMode;
    fetchFn?: FetchFn;
  } = {}
): Promise<TranslateResult> {
  const env = opts.env ?? process.env;
  const state: AIState = getAIState(env, opts.mode);

  if (state.state === "demo") {
    return {
      status: "simulated",
      provider: null,
      translatedText: null,
      aiGenerated: false,
      message:
        "Demo Mode: translation is simulated — no AI provider is called and the text is returned unchanged. Connect an AI provider key to translate for real.",
    };
  }
  if (state.state !== "connected" || !state.provider) {
    return {
      status: "not_configured",
      provider: null,
      translatedText: null,
      aiGenerated: false,
      message:
        "Translation is unavailable: no AI provider key is configured (OPENAI_API_KEY, ANTHROPIC_API_KEY or MODEL_API_KEY). The text was not translated.",
    };
  }
  const keyPresent =
    state.provider === "openai"
      ? isConfiguredValue(env.OPENAI_API_KEY)
      : state.provider === "anthropic"
        ? isConfiguredValue(env.ANTHROPIC_API_KEY)
        : isConfiguredValue(env.MODEL_API_KEY);
  if (!keyPresent) {
    return {
      status: "not_configured",
      provider: null,
      translatedText: null,
      aiGenerated: false,
      message: "Translation is unavailable: the selected AI provider has no key configured.",
    };
  }
  return callProvider(state.provider, env, opts.fetchFn ?? fetch, input);
}

/** Route-shaped handler with the same guard order as handleDraftRequest. */
export async function handleTranslateRequest(args: {
  mode: DataMode;
  user: { id: string; status?: string | null } | null;
  body: unknown;
  env?: Record<string, string | undefined>;
  fetchFn?: FetchFn;
}): Promise<{ httpStatus: number; body: Record<string, unknown> }> {
  const { mode, user } = args;
  if (mode !== "demo" && !user) {
    return {
      httpStatus: 401,
      body: { status: "unauthenticated", translatedText: null, message: "Authentication required." },
    };
  }
  if (user?.status === "suspended") {
    return {
      httpStatus: 403,
      body: { status: "forbidden", translatedText: null, message: "This account is suspended." },
    };
  }
  const body = (args.body ?? {}) as Record<string, unknown>;
  const text = typeof body.text === "string" ? body.text : "";
  const targetLanguage =
    typeof body.targetLanguage === "string" ? body.targetLanguage : "";
  const sourceLanguage =
    typeof body.sourceLanguage === "string" ? body.sourceLanguage : undefined;
  if (!text.trim()) {
    return {
      httpStatus: 400,
      body: { status: "invalid_request", translatedText: null, message: "There is no text to translate." },
    };
  }
  if (text.length > MAX_TRANSLATE_CHARS) {
    return {
      httpStatus: 400,
      body: {
        status: "invalid_request",
        translatedText: null,
        message: `Text is too long to translate in one request (limit ${MAX_TRANSLATE_CHARS} characters).`,
      },
    };
  }
  if (!targetLanguage) {
    return {
      httpStatus: 400,
      body: { status: "invalid_request", translatedText: null, message: "A target language is required." },
    };
  }
  const result = await translateText(
    { text, targetLanguage, sourceLanguage },
    { env: args.env, mode, fetchFn: args.fetchFn }
  );
  return {
    httpStatus: 200,
    body: {
      status: result.status,
      provider: result.provider,
      translatedText: result.translatedText,
      aiGenerated: result.aiGenerated,
      message: result.message,
    },
  };
}
