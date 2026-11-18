/**
 * Google Calendar adapter — schedule follow-up events for leads.
 *
 * Verified endpoints (Google Calendar API v3 docs, checked 2026-11-19):
 *   POST /calendar/v3/calendars/{calendarId}/events
 *        Body { summary, description, start: { dateTime, timeZone },
 *        end: {...}, attendees: [{ email }] }. Response { id,
 *        htmlLink, ... }.
 *   GET  /calendar/v3/calendars/{calendarId}/events?timeMin=..&maxResults=..
 * Auth: OAuth 2.0 Bearer token. Reuses the existing Google OAuth
 * connection — the calendar.events scope is requested by the
 * Google OAuth flow (GOOGLE_SCOPES); a stored Gmail-only grant
 * must re-connect Google before a live connection works.
 * A calendar holds events, not leads: exportLeads / importLeads are
 * NOT SUPPORTED (they throw). Scheduling a follow-up is the
 * supported operation, via createTaskFromLead.
 */

import { ProviderHttpClient } from "../../client";
import type { ProviderCredential } from "../../connections";
import {
  DEFAULT_LEAD_FIELD_MAPPING,
  parseTaskDescription,
  splitName,
  taskDescriptionForLead,
  taskTitleForLead,
  type ExportResult,
  type ImportResult,
  type ProductivityAdapter,
  type ProviderLeadRecord,
  type TaskResult,
} from "../types";
import { CALENDAR_CONFIG, type CalendarSettings } from "./config";

export const CALENDAR_FIELD_MAPPING = DEFAULT_LEAD_FIELD_MAPPING;

export function mapLeadToCalendar(
  lead: ProviderLeadRecord,
  settings: CalendarSettings = {}
): { summary: string; description: string; durationMinutes: number; timeZone: string } {
  return {
    summary: taskTitleForLead(lead),
    description: taskDescriptionForLead(lead),
    durationMinutes: settings.durationMinutes ?? 30,
    timeZone: settings.timeZone ?? "UTC",
  };
}

export function mapCalendarToLead(
  event: { summary?: string; description?: string; attendees?: Array<{ email?: string }> },
  _settings: CalendarSettings = {}
): ProviderLeadRecord {
  void _settings;
  const name = splitName((event.summary ?? "").replace(/^Follow up:\s*/, "").replace(/ \(.*\)$/, ""));
  const lead = { ...name, ...parseTaskDescription(event.description ?? "") };
  if (!lead.email && event.attendees?.[0]?.email) lead.email = event.attendees[0].email;
  return lead;
}


export interface CalendarAdapterDeps {
  /** Decrypted credential from the connection store, or null. */
  credential: ProviderCredential | null;
  settings: CalendarSettings;
}

export function createCalendarAdapter(deps: CalendarAdapterDeps): ProductivityAdapter {
  const { credential, settings } = deps;
  const token = credential?.accessToken;
  const calendarId = settings.calendarId ?? "primary";
  const durationMinutes = settings.durationMinutes ?? 30;
  const timeZone = settings.timeZone ?? "UTC";
  const client = new ProviderHttpClient({
    baseUrl: CALENDAR_CONFIG.apiBaseUrl,
    getAuthHeaders: () => ({ Authorization: "Bearer " + token }),
  });

  function checkConfiguration(): { configured: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!token) missing.push("accessToken (Google OAuth — reconnect Google)");
    return { configured: missing.length === 0, missing };
  }

  async function exportLeads(leads: ProviderLeadRecord[]): Promise<ExportResult> {
    void leads;
    throw new Error(
      "google-calendar: exportLeads is not supported — a calendar holds events, not leads. " +
        "Use createTaskFromLead to schedule a follow-up event for a lead."
    );
  }

  async function importLeads(): Promise<ImportResult> {
    throw new Error(
      "google-calendar: importLeads is not supported — a calendar holds events, not leads. " +
        "Events created by this adapter can be read back with listUpcomingEvents (not part of the lead sync)."
    );
  }

  async function createTaskFromLead(
    lead: ProviderLeadRecord,
    opts?: { dueDate?: string; notes?: string }
  ): Promise<TaskResult | null> {
    const config = checkConfiguration();
    if (!config.configured) {
      throw new Error("google-calendar: configuration_required: missing " + config.missing.join(", "));
    }
    const mapped = mapLeadToCalendar(lead, settings);
    const start = opts?.dueDate ? new Date(opts.dueDate) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    const res = await client.request<{ id?: string; htmlLink?: string }>({
      method: "POST",
      path: "/calendars/" + encodeURIComponent(calendarId) + "/events",
      body: {
        summary: mapped.summary,
        description: opts?.notes ? mapped.description + "\n" + opts.notes : mapped.description,
        start: { dateTime: start.toISOString(), timeZone },
        end: { dateTime: end.toISOString(), timeZone },
        ...(lead.email ? { attendees: [{ email: lead.email }] } : {}),
      },
    });
    if (!res.id) throw new Error("google-calendar: create returned no event id");
    return { id: res.id, url: res.htmlLink ?? null };
  }

  return { provider: "google-calendar", exportLeads, importLeads, createTaskFromLead, checkConfiguration };
}
