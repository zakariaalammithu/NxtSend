/**
 * Email provider state derivation — from actual env presence only.
 *
 *   demo mode (no Supabase)                -> "demo"
 *   RESEND_API_KEY + EMAIL_FROM both set   -> "connected"
 *   exactly one of them set                -> "configuration_required"
 *   neither set                            -> "not_connected"
 *
 * "connected" here means "credentials are configured" — the honest,
 * verifiable fact available without a network call. A send still only
 * reports success when Resend accepts the message.
 */

import { isConfiguredValue, type ProviderState } from "@/lib/env";
import { getDataMode, type DataMode } from "@/lib/data/mode";

export interface EmailEnv {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  RESEND_WEBHOOK_SECRET?: string;
}

function envFromProcess(): EmailEnv {
  return {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
  };
}

export function isEmailFromConfigured(from: string | undefined): boolean {
  if (!from) return false;
  const v = from.trim();
  // EMAIL_FROM may be "Name <addr@host>" or a bare address.
  return v.includes("@") && !v.toLowerCase().includes("placeholder");
}

export function getEmailState(
  env: EmailEnv = envFromProcess(),
  mode: DataMode = getDataMode()
): ProviderState {
  if (mode === "demo") return "demo";
  const hasKey = isConfiguredValue(env.RESEND_API_KEY);
  const hasFrom = isEmailFromConfigured(env.EMAIL_FROM);
  if (hasKey && hasFrom) return "connected";
  if (hasKey || hasFrom) return "configuration_required";
  return "not_connected";
}

/** Whether Resend delivery webhooks can be verified + processed. */
export function isResendWebhookConfigured(
  env: EmailEnv = envFromProcess()
): boolean {
  return isConfiguredValue(env.RESEND_WEBHOOK_SECRET);
}
