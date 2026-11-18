/**
 * Google Calendar configuration — auth type, env vars, capabilities, setup.
 * No secrets here: env var NAMES only. Values live in the encrypted
 * connection store (see ./adapter.ts) or the deployment environment.
 */

import type { ProviderAuthType } from "../../types";

export interface CalendarEnvVar {
  name: string;
  purpose: string;
  required: boolean;
}

export interface CalendarSettings {
  /** Calendar id, e.g. "primary" (default "primary"). */
  calendarId?: string;
  /** Follow-up length in minutes (default 30). */
  durationMinutes?: number;
  /** IANA timezone for the event (default "UTC"). */
  timeZone?: string;
}

export const CALENDAR_CONFIG = {
  id: "google-calendar",
  name: "Google Calendar",
  category: "productivity",
  authType: "oauth2" as ProviderAuthType,
  docsUrl: "https://developers.google.com/workspace/calendar/api",
  apiBaseUrl: "https://www.googleapis.com/calendar/v3",
  envVars: [
    { name: "GOOGLE_CLIENT_ID", purpose: "Existing Google OAuth client id (already used for Gmail).", required: true },
    { name: "GOOGLE_CLIENT_SECRET", purpose: "Existing Google OAuth client secret.", required: true },
  ] as CalendarEnvVar[],
  capabilities: [
    "Schedule follow-up events for interested leads (events.insert) and list upcoming events, with the lead's details in the event description",
    "Reuses the existing Google OAuth connection — the calendar.events scope is requested by the Google OAuth flow (src/lib/oauth/config.ts GOOGLE_SCOPES); a stored Gmail-only grant must re-connect Google before a live connection works",
    "Config-ready: no live calendar has been connected from this environment; sync is mock-tested only",
  ],
  setupSteps: [
    "Re-connect Google so the new calendar.events scope is granted.",
    "Pick the calendar id (usually 'primary') and a default duration + timezone for follow-ups.",
    "Store the calendar id in the NxtSend Google Calendar connection.",
  ],
} as const;
