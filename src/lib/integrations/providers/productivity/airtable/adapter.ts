/**
 * Airtable adapter — export leads to a table, import records.
 *
 * Verified endpoints (Airtable Web API docs, checked 2026-11-19):
 *   GET  /v0/{baseId}/{tableIdOrName}?pageSize=100&offset=...
 *   POST /v0/{baseId}/{tableIdOrName}  Body { records: [{ fields }] }
 *        — up to 10 records per request; response { records: [{ id,
 *        createdTime, fields }] }.
 *   PATCH /v0/{baseId}/{tableIdOrName}/{recordId}  Body { fields }
 * Auth: Bearer personal access token (legacy account API keys were
 * shut off 1 Feb 2024). Scopes data.records:read / data.records:write.
 * Rate limit: 5 requests/second per base — the client retries 429s.
 */

import { ProviderHttpClient } from "../../client";
import type { ProviderCredential } from "../../connections";
import {
  DEFAULT_LEAD_FIELD_MAPPING,
  dedupeLeadsByEmail,
  emptyExportResult,
  leadToRow,
  rowToLead,
  type ExportResult,
  type ImportResult,
  type ProductivityAdapter,
  type ProviderLeadRecord,
  type TaskResult,
} from "../types";
import { AIRTABLE_CONFIG, type AirtableSettings } from "./config";

/** Airtable caps creates at 10 records per request. */
export const AIRTABLE_BATCH_SIZE = 10;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export const AIRTABLE_FIELD_MAPPING = DEFAULT_LEAD_FIELD_MAPPING;

export function mapLeadToAirtable(
  lead: ProviderLeadRecord,
  _settings: AirtableSettings = {}
): { fields: Record<string, string> } {
  void _settings;
  return { fields: leadToRow(DEFAULT_LEAD_FIELD_MAPPING, lead) };
}

export function mapAirtableToLead(
  record: { fields?: Record<string, string | undefined> },
  _settings: AirtableSettings = {}
): ProviderLeadRecord {
  void _settings;
  return rowToLead(DEFAULT_LEAD_FIELD_MAPPING, record.fields ?? {});
}


export interface AirtableAdapterDeps {
  /** Decrypted credential from the connection store, or null. */
  credential: ProviderCredential | null;
  settings: AirtableSettings;
}

export function createAirtableAdapter(deps: AirtableAdapterDeps): ProductivityAdapter {
  const { credential, settings } = deps;
  const apiKey = credential?.apiKey ?? credential?.accessToken;
  const baseId = settings.baseId ?? credential?.extra?.baseId;
  const tableId = settings.tableId ?? credential?.extra?.tableId;
  const client = new ProviderHttpClient({
    baseUrl: AIRTABLE_CONFIG.apiBaseUrl,
    getAuthHeaders: () => ({ Authorization: "Bearer " + apiKey }),
  });
  const tablePath = "/" + baseId + "/" + encodeURIComponent(tableId ?? "");

  function checkConfiguration(): { configured: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!apiKey) missing.push("apiKey (personal access token)");
    if (!baseId) missing.push("baseId");
    if (!tableId) missing.push("tableId");
    return { configured: missing.length === 0, missing };
  }

  async function exportLeads(leads: ProviderLeadRecord[]): Promise<ExportResult> {
    const config = checkConfiguration();
    if (!config.configured) {
      throw new Error("airtable: configuration_required: missing " + config.missing.join(", "));
    }
    const { unique, duplicates } = dedupeLeadsByEmail(leads);
    const result = emptyExportResult();
    result.processed = leads.length;
    result.skipped = duplicates.length;
    result.createdIds = [];
    for (const batch of chunk(unique, AIRTABLE_BATCH_SIZE)) {
      try {
        const res = await client.request<{ records?: Array<{ id?: string }> }>({
          method: "POST",
          path: tablePath,
          body: { records: batch.map((lead) => mapLeadToAirtable(lead, settings)) },
        });
        const created = res.records ?? [];
        result.created += created.length;
        for (const r of created) if (r.id) result.createdIds?.push(r.id);
      } catch (err) {
        result.failed += batch.length;
        result.errors.push(err instanceof Error ? err.message : "airtable create failed");
      }
    }
    return result;
  }

  async function importLeads(): Promise<ImportResult> {
    const config = checkConfiguration();
    if (!config.configured) {
      throw new Error("airtable: configuration_required: missing " + config.missing.join(", "));
    }
    const leads: ProviderLeadRecord[] = [];
    const errors: string[] = [];
    let offset: string | undefined;
    do {
      const res = await client.request<{
        records?: Array<{ fields?: Record<string, string> }>;
        offset?: string;
      }>({
        method: "GET",
        path: tablePath,
        query: { pageSize: "100", ...(offset ? { offset } : {}) },
      });
      for (const record of res.records ?? []) {
        const lead = mapAirtableToLead(record, settings);
        if (!lead.firstName && !lead.email) continue;
        leads.push(lead);
      }
      offset = res.offset;
    } while (offset);
    const { unique, duplicates } = dedupeLeadsByEmail(leads);
    if (duplicates.length > 0) errors.push(duplicates.length + " duplicate email(s) skipped on import.");
    return { leads: unique, errors };
  }

  async function createTaskFromLead(
    lead: ProviderLeadRecord,
    opts?: { dueDate?: string; notes?: string }
  ): Promise<TaskResult | null> {
    void opts;
    const config = checkConfiguration();
    if (!config.configured) {
      throw new Error("airtable: configuration_required: missing " + config.missing.join(", "));
    }
    const res = await client.request<{ records?: Array<{ id?: string }> }>({
      method: "POST",
      path: tablePath,
      body: { records: [mapLeadToAirtable(lead, settings)] },
    });
    const id = res.records?.[0]?.id;
    if (!id) throw new Error("airtable: create returned no record id");
    return { id, url: null };
  }

  return { provider: "airtable", exportLeads, importLeads, createTaskFromLead, checkConfiguration };
}
