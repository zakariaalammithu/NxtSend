/**
 * Warm-up provider state derivation — from actual env presence only
 * (same rules as src/lib/email/state.ts):
 *
 *   demo mode (no Supabase)              -> "demo"
 *   INSTANTLY_API_KEY set + plausible    -> "connected"
 *     (credentials configured — the Integration Center renders this
 *      "Connected but Not Verified" until a real provider call
 *      succeeds; it is NOT proof of a running warm-up)
 *   INSTANTLY_API_KEY present but still  -> "configuration_required"
 *     the .env.example placeholder
 *   INSTANTLY_API_KEY absent/empty       -> "not_connected"
 */

import { isConfiguredValue, type ProviderState } from "@/lib/env";
import { getDataMode, type DataMode } from "@/lib/data/mode";

export interface WarmupEnv {
  INSTANTLY_API_KEY?: string;
}

function envFromProcess(): WarmupEnv {
  return { INSTANTLY_API_KEY: process.env.INSTANTLY_API_KEY };
}

/** True when a plausibly real Instantly API key is configured. */
export function isWarmupConfigured(env: WarmupEnv = envFromProcess()): boolean {
  return isConfiguredValue(env.INSTANTLY_API_KEY);
}

export function getWarmupState(
  env: WarmupEnv = envFromProcess(),
  mode: DataMode = getDataMode()
): ProviderState {
  if (mode === "demo") return "demo";
  if (isWarmupConfigured(env)) return "connected";
  const raw = env.INSTANTLY_API_KEY;
  if (raw !== undefined && raw.trim() !== "") return "configuration_required";
  return "not_connected";
}
