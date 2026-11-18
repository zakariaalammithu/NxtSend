/**
 * WhatsApp Business Platform configuration — auth type, env vars, capabilities, setup.
 * No secrets here: env var NAMES only. Values live in the encrypted
 * connection store (see ./adapter.ts) or the deployment environment.
 */

import type { ProviderAuthType } from "../../types";

export interface WhatsappEnvVar {
  name: string;
  purpose: string;
  required: boolean;
}

export interface WhatsappSettings {
  /** Registered business sender number id (also accepted from credential.extra.phoneNumberId). */
  phoneNumberId?: string;
  /** Recipient in E.164 without "+" (also accepted from credential.extra.recipient). */
  recipient?: string;
  /** Meta-approved template name for business-initiated alerts (default "hello_world"). */
  templateName?: string;
  /** Template language code (default "en_US"). */
  templateLanguage?: string;
  /** "template" (default) or "text" — text only delivers inside an open 24h window. */
  mode?: "template" | "text";
}

export const WHATSAPP_CONFIG = {
  id: "whatsapp",
  name: "WhatsApp Business Platform",
  category: "communication",
  authType: "bearer_token" as ProviderAuthType,
  docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api",
  apiBaseUrl: "https://graph.facebook.com/v21.0",
  envVars: [
    { name: "WHATSAPP_ACCESS_TOKEN", purpose: "Permanent system-user access token with whatsapp_business_messaging. Secret — store encrypted, never in code. (The temporary dashboard token lasts ~24h and is testing-only.)", required: true },
    { name: "WHATSAPP_PHONE_NUMBER_ID", purpose: "Phone number id of the registered business sender number (not the phone number itself).", required: true },
    { name: "WHATSAPP_RECIPIENT", purpose: "Recipient number in E.164 without '+', e.g. 14155551234.", required: true },
    { name: "WHATSAPP_TEMPLATE_NAME", purpose: "Meta-approved template for business-initiated alerts (default: hello_world).", required: false },
  ] as WhatsappEnvVar[],
  capabilities: [
    "Send NxtSend alerts via the official Meta WhatsApp Business Cloud API only (POST /v21.0/{phone-number-id}/messages) — no unofficial workarounds",
    "Business-initiated messages outside the 24-hour customer-service window must use a Meta-approved template; free-form text only works inside an open window",
    "CREDENTIALS REQUIRED: a Meta app with the WhatsApp product, a registered business number and a permanent system-user token — none of which exists in this environment; delivery is mock-tested only",
  ],
  setupSteps: [
    "Create a Business-type Meta app, add the WhatsApp product, and register a business phone number (verify it by SMS/voice). Note the Phone Number ID and WhatsApp Business Account ID.",
    "Create a system user in the business portfolio, assign it the app + WABA, and generate a permanent token with whatsapp_business_messaging.",
    "Create (and wait for Meta approval of) a message template for alerts, or use the built-in hello_world sample for testing.",
    "The recipient must have opted in; free-form text only delivers inside the 24-hour window opened by the recipient messaging you.",
    "Store the token, phone number id, recipient and template name in the NxtSend WhatsApp connection — encrypted with TOKEN_ENCRYPTION_KEY.",
  ],
} as const;
