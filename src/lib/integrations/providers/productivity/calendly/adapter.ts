/**
 * Calendly adapter — list scheduled events + invitees, generate a
 * pre-filled scheduling link for a lead.
 *
 * Verified (Calendly API v2 docs, checked 2026-11-19):
 *   GET /scheduled_events?user={userUri}&min_start_time=..&count=100
 *   GET /scheduled_events/{uuid}/invitees
 *   GET /event_types?user={userUri}
 *   POST /scheduling_links  Body { max_event_count, owner, owner_type }
 * Auth: OAuth 2.0 (auth.calendly.com/oauth/authorize + /oauth/token)
 * or a personal access token for internal use. Access tokens expire
 * after 2 hours — refresh tokens must be used.
 * HONEST LIMIT: Calendly API v2 cannot create events directly.
 * Booking happens when the invitee opens a scheduling link. So
 * exportLeads is NOT SUPPORTED (it throws), and createTaskFromLead
 * returns the lead's pre-filled scheduling link instead of a task.
 * Import reads invitees back into leads.
 */

import { ProviderHttpClient } from "../../client";
import type { ProviderCredential } from "../../connections";
import {
  DEFAULT_LEAD_FIELD_MAPPING,
  dedupeLeadsByEmail,
  splitName,
  type ExportResult,
  type ImportResult,
  type ProductivityAdapter,
  type ProviderLeadRecord,
  type TaskResult,
} from "../types";
import { CALENDLY_CONFIG, type CalendlySettings } from "./config";

/** Builds a pre-filled scheduling link for a lead. Prefill + UTM parameters are a documented Calendly feature. */
export function schedulingLinkForLead(
  settings: CalendlySettings,
  lead: ProviderLeadRecord
): string {
  const username = settings.username ?? "book";
  const slug = settings.eventTypeSlug ?? "30min";
  const params = new URLSearchParams();
  const fullName = (lead.firstName + (lead.lastName ? " " + lead.lastName : "")).trim();
  if (fullName) params.set("name", fullName);
  if (lead.email) params.set("email", lead.email);
  if (lead.company) params.set("a1", lead.company);
  const query = params.toString();
  return "https://calendly.com/" + username + "/" + slug + (query ? "?" + query : "");
}

export const CALENDLY_FIELD_MAPPING = DEFAULT_LEAD_FIELD_MAPPING;

export function mapLeadToCalendly(
  lead: ProviderLeadRecord,
  settings: CalendlySettings = {}
): { name: string; email: string; schedulingLink: string } {
  return {
    name: (lead.firstName + (lead.lastName ? " " + lead.lastName : "")).trim(),
    email: lead.email ?? "",
    schedulingLink: schedulingLinkForLead(settings, lead),
  };
}

export function mapCalendlyToLead(
  invitee: { name?: string; email?: string },
  _settings: CalendlySettings = {}
): ProviderLeadRecord {
  void _settings;
  const name = splitName(invitee.name ?? "");
  return { ...name, email: invitee.email };
}


export interface CalendlyAdapterDeps {
  /** Decrypted credential from the connection store, or null. */
  credential: ProviderCredential | null;
  settings: CalendlySettings;
}

export function createCalendlyAdapter(deps: CalendlyAdapterDeps): ProductivityAdapter {
  const { credential, settings } = deps;
  const token = credential?.accessToken ?? credential?.apiKey;
  const userUri = settings.userUri ?? credential?.extra?.userUri;
  const client = new ProviderHttpClient({
    baseUrl: CALENDLY_CONFIG.apiBaseUrl,
    getAuthHeaders: () => ({ Authorization: "Bearer " + token }),
  });

  function checkConfiguration(): { configured: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!token) missing.push("accessToken");
    if (!userUri) missing.push("userUri");
    return { configured: missing.length === 0, missing };
  }

  async function exportLeads(leads: ProviderLeadRecord[]): Promise<ExportResult> {
    void leads;
    throw new Error(
      "calendly: exportLeads is not supported — Calendly API v2 cannot create events directly. " +
        "Booking happens when the invitee opens a scheduling link; use createTaskFromLead to get the lead's pre-filled link."
    );
  }

  async function importLeads(): Promise<ImportResult> {
    const config = checkConfiguration();
    if (!config.configured) {
      throw new Error("calendly: configuration_required: missing " + config.missing.join(", "));
    }
    const events = await client.request<{
      collection?: Array<{ uri?: string }>;
    }>({
      method: "GET",
      path: "/scheduled_events",
      query: { user: userUri as string, count: "100" },
    });
    const leads: ProviderLeadRecord[] = [];
    const errors: string[] = [];
    for (const event of events.collection ?? []) {
      const eventId = (event.uri ?? "").split("/").pop();
      if (!eventId) continue;
      try {
        const invitees = await client.request<{
          collection?: Array<{ name?: string; email?: string }>;
        }>({
          method: "GET",
          path: "/scheduled_events/" + eventId + "/invitees",
        });
        for (const invitee of invitees.collection ?? []) {
          const lead = mapCalendlyToLead(invitee, settings);
          if (!lead.firstName && !lead.email) continue;
          leads.push(lead);
        }
      } catch (err) {
        errors.push("Invitees for event " + eventId + " failed: " + (err instanceof Error ? err.message : "unknown"));
      }
    }
    const { unique, duplicates } = dedupeLeadsByEmail(leads);
    if (duplicates.length > 0) errors.push(duplicates.length + " duplicate email(s) skipped on import.");
    return { leads: unique, errors };
  }

  async function createTaskFromLead(
    lead: ProviderLeadRecord,
    opts?: { dueDate?: string; notes?: string }
  ): Promise<TaskResult | null> {
    void opts;
    const link = schedulingLinkForLead(settings, lead);
    return { id: link, url: link };
  }

  return { provider: "calendly", exportLeads, importLeads, createTaskFromLead, checkConfiguration };
}
