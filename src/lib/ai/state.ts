/**
 * AI provider state derivation — env presence only.
 *
 * Selection order when several keys exist: OpenAI first, then
 * Anthropic, then Meta Model API (documented, deterministic — no
 * silent surprises). A provider joins the selection ONLY when its key
 * is actually configured.
 *
 *   demo mode            -> { state: "demo", provider: null }
 *   OPENAI_API_KEY set   -> { state: "connected", provider: "openai" }
 *   ANTHROPIC_API_KEY set-> { state: "connected", provider: "anthropic" }
 *   MODEL_API_KEY set    -> { state: "connected", provider: "meta" }
 *   none                 -> { state: "not_connected", provider: null }
 */

import { isConfiguredValue, type ProviderState } from "@/lib/env";
import { getDataMode, type DataMode } from "@/lib/data/mode";
import type { AIProviderId } from "./types";

export interface AIEnv {
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  MODEL_API_KEY?: string;
}

function envFromProcess(): AIEnv {
  return {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    MODEL_API_KEY: process.env.MODEL_API_KEY,
  };
}

export interface AIState {
  state: ProviderState;
  provider: AIProviderId | null;
}

export function getAIState(
  env: AIEnv = envFromProcess(),
  mode: DataMode = getDataMode()
): AIState {
  if (mode === "demo") return { state: "demo", provider: null };
  if (isConfiguredValue(env.OPENAI_API_KEY)) {
    return { state: "connected", provider: "openai" };
  }
  if (isConfiguredValue(env.ANTHROPIC_API_KEY)) {
    return { state: "connected", provider: "anthropic" };
  }
  if (isConfiguredValue(env.MODEL_API_KEY)) {
    return { state: "connected", provider: "meta" };
  }
  return { state: "not_connected", provider: null };
}
