/**
 * Calendly configuration — auth type, env vars, capabilities, setup.
 * No secrets here: env var NAMES only. Values live in the encrypted
 * connection store (see ./adapter.ts) or the deployment environment.
 */

import type { ProviderAuthType } from "../../types";

export interface CalendlyEnvVar {
  name: string;
  purpose: string;
  required: boolean;
}

export interface CalendlySettings {
  /** User URI (also accepted from credential.extra.userUri). */
  userUri?: string;
  /** Event-type slug for the scheduling link, e.g. "30min". */
  eventTypeSlug?: string;
  /** Calendly username for the public booking link, e.g. "acme-sales". */
  username?: string;
}

export const CALENDLY_CONFIG = {
  id: "calendly",
  name: "Calendly",
  category: "productivity",
  authType: "oauth2" as ProviderAuthType,
  docsUrl: "https://developer.calendly.com/api-docs",
  apiBaseUrl: "https://api.calendly.com",
  envVars: [
    { name: "CALENDLY_ACCESS_TOKEN", purpose: "OAuth access token or personal access token.", required: true },
    { name: "CALENDLY_USER_URI", purpose: "User URI, e.g. https://api.calendly.com/users/AAAAAAAAAAAAAAAA.", required: true },
    { name: "CALENDLY_EVENT_TYPE_SLUG", purpose: "Event-type slug for the scheduling link, e.g. 30min (the part after calendly.com/<user>/).", required: false },
    { name: "CALENDLY_ORGANIZATION_URI", purpose: "Organization URI, for webhook subscriptions (not used by this adapter).", required: false },
  ] as CalendlyEnvVar[],
  capabilities: [
    "List scheduled events and invitees, and generate a pre-filled scheduling link for a lead — Calendly API v2 cannot create events directly (booking happens on the scheduling link), so lead export is NOT supported",
    "Authenticates with OAuth 2.0 (or a personal access token for internal use)",
    "Config-ready: no live Calendly account has been connected from this environment; sync is mock-tested only",
  ],
  setupSteps: [
    "Create an OAuth app in the Calendly Developer Portal (or a personal access token for internal use).",
    "Copy the user URI (GET /users/me) and the event-type slug from the booking page URL.",
    "Store the token + user URI + event-type slug in the NxtSend Calendly connection — encrypted with TOKEN_ENCRYPTION_KEY.",
  ],
} as const;
