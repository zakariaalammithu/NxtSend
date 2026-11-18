/**
 * Trello adapter — create follow-up cards from leads, import cards.
 *
 * Verified endpoints (Trello REST API docs, checked 2026-11-19):
 *   POST /1/cards?key={key}&token={token}&idList={listId}&name=..
 *        &desc=..&due=..  — auth + fields as QUERY parameters.
 *   GET  /1/lists/{listId}/cards?key=..&token=..
 *   PUT  /1/cards/{cardId}?key=..&token=..&idList=..
 * Auth: API key + token (trello.com/app-key). Trello is rolling out
 * OAuth 2.0 as opt-in; key+token remains the documented path.
 * Import is best-effort: it reads back the name + the "Email: /
 * Company: / ..." lines this adapter writes into card descriptions.
 */

import { ProviderHttpClient } from "../../client";
import type { ProviderCredential } from "../../connections";
import {
  DEFAULT_LEAD_FIELD_MAPPING,
  dedupeLeadsByEmail,
  emptyExportResult,
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
import { TRELLO_CONFIG, type TrelloSettings } from "./config";

export const TRELLO_FIELD_MAPPING = DEFAULT_LEAD_FIELD_MAPPING;

export function mapLeadToTrello(
  lead: ProviderLeadRecord,
  _settings: TrelloSettings = {}
): { name: string; desc: string } {
  void _settings;
  return { name: taskTitleForLead(lead), desc: taskDescriptionForLead(lead) };
}

export function mapTrelloToLead(
  card: { name?: string; desc?: string },
  _settings: TrelloSettings = {}
): ProviderLeadRecord {
  void _settings;
  const name = splitName((card.name ?? "").replace(/^Follow up:\s*/, "").replace(/\s*\(.*\)$/, ""));
  return { ...name, ...parseTaskDescription(card.desc ?? "") };
}


export interface TrelloAdapterDeps {
  /** Decrypted credential from the connection store, or null. */
  credential: ProviderCredential | null;
  settings: TrelloSettings;
}

export function createTrelloAdapter(deps: TrelloAdapterDeps): ProductivityAdapter {
  const { credential, settings } = deps;
  const apiKey = credential?.extra?.apiKey ?? settings.apiKey;
  const token = credential?.apiKey ?? credential?.accessToken;
  const listId = settings.listId ?? credential?.extra?.listId;
  const client = new ProviderHttpClient({
    baseUrl: TRELLO_CONFIG.apiBaseUrl,
    getAuthHeaders: () => ({}),
  });
  const authQuery = { key: apiKey ?? "", token: token ?? "" };

  function checkConfiguration(): { configured: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!apiKey) missing.push("apiKey");
    if (!token) missing.push("token");
    if (!listId) missing.push("listId");
    return { configured: missing.length === 0, missing };
  }

  async function exportLeads(leads: ProviderLeadRecord[]): Promise<ExportResult> {
    const config = checkConfiguration();
    if (!config.configured) {
      throw new Error("trello: configuration_required: missing " + config.missing.join(", "));
    }
    const { unique, duplicates } = dedupeLeadsByEmail(leads);
    const result = emptyExportResult();
    result.processed = leads.length;
    result.skipped = duplicates.length;
    result.createdIds = [];
    for (const lead of unique) {
      try {
        const mapped = mapLeadToTrello(lead, settings);
        const res = await client.request<{ id?: string; shortUrl?: string }>({
          method: "POST",
          path: "/cards",
          query: { ...authQuery, idList: listId as string, name: mapped.name, desc: mapped.desc },
        });
        if (!res.id) throw new Error("trello: create returned no card id");
        result.created += 1;
        result.createdIds?.push(res.id);
      } catch (err) {
        result.failed += 1;
        result.errors.push(err instanceof Error ? err.message : "trello create failed");
      }
    }
    return result;
  }

  async function importLeads(): Promise<ImportResult> {
    const config = checkConfiguration();
    if (!config.configured) {
      throw new Error("trello: configuration_required: missing " + config.missing.join(", "));
    }
    const cards = await client.request<Array<{ id?: string; name?: string; desc?: string }>>({
      method: "GET",
      path: "/lists/" + listId + "/cards",
      query: authQuery,
    });
    const leads: ProviderLeadRecord[] = [];
    const errors: string[] = [];
    for (const card of cards) {
      const lead = mapTrelloToLead(card, settings);
      lead.sourceId = card.id;
      if (!lead.firstName && !lead.email) continue;
      leads.push(lead);
    }
    const { unique, duplicates } = dedupeLeadsByEmail(leads);
    if (duplicates.length > 0) errors.push(duplicates.length + " duplicate email(s) skipped on import.");
    return { leads: unique, errors };
  }

  async function createTaskFromLead(
    lead: ProviderLeadRecord,
    opts?: { dueDate?: string; notes?: string }
  ): Promise<TaskResult | null> {
    const config = checkConfiguration();
    if (!config.configured) {
      throw new Error("trello: configuration_required: missing " + config.missing.join(", "));
    }
    const mapped = mapLeadToTrello(lead, settings);
    const res = await client.request<{ id?: string; shortUrl?: string }>({
      method: "POST",
      path: "/cards",
      query: {
        ...authQuery,
        idList: listId as string,
        name: mapped.name,
        desc: opts?.notes ? mapped.desc + "\n" + opts.notes : mapped.desc,
        ...(opts?.dueDate ? { due: opts.dueDate } : {}),
      },
    });
    if (!res.id) throw new Error("trello: create returned no card id");
    return { id: res.id, url: res.shortUrl ?? null };
  }

  return { provider: "trello", exportLeads, importLeads, createTaskFromLead, checkConfiguration };
}
