/**
 * Monday.com adapter — export leads to a board as items, import
 * board items. PRODUCTIVITY/TASK use only — NOT the CRM operations
 * (those belong to the CRM worker's Monday adapter).
 *
 * Verified (monday.com developer docs, checked 2026-11-19):
 *   POST https://api.monday.com/v2  (single GraphQL endpoint)
 *   Header: Authorization: <api token> (raw token, no Bearer) +
 *   API-Version: 2024-10.
 *   mutation { create_item(board_id, group_id?, item_name,
 *     column_values: "<JSON string>") { id } }
 *   query { boards(ids: [..]) { items_page(limit: 100) { items {
 *     id name column_values { id text column { title } } } } } }
 *   query { boards(ids: [..]) { columns { id title } } }
 * column_values is a JSON STRING whose keys are column ids and whose
 * values depend on the column type (text columns take a plain
 * string). The adapter resolves column ids by title on first use,
 * so no manual column config is needed — but the board must have
 * text columns titled First Name, Last Name, Email, Company,
 * Job Title, LinkedIn URL, Tags, Status (missing columns are
 * skipped, not invented).
 */

import { ProviderHttpClient } from "../../client";
import type { ProviderCredential } from "../../connections";
import {
  DEFAULT_LEAD_FIELD_MAPPING,
  dedupeLeadsByEmail,
  emptyExportResult,
  leadToRow,
  rowToLead,
  splitName,
  type ExportResult,
  type ImportResult,
  type ProductivityAdapter,
  type ProviderLeadRecord,
  type TaskResult,
} from "../types";
import { MONDAY_CONFIG, type MondaySettings } from "./config";

/** Resolves column ids by column title, cached per adapter instance. */
export async function resolveMondayColumns(
  client: ProviderHttpClient,
  boardId: string,
  extraHeaders: Record<string, string>
): Promise<Map<string, string>> {
  const res = await client.request<{
    data?: { boards?: Array<{ columns?: Array<{ id?: string; title?: string }> }> };
  }>({
    method: "POST",
    path: "",
    headers: extraHeaders,
    body: {
      query:
        "query($boardId: [ID!]) { boards(ids: $boardId) { columns { id title } } }",
      variables: { boardId: [boardId] },
    },
  });
  const map = new Map<string, string>();
  for (const col of res.data?.boards?.[0]?.columns ?? []) {
    if (col.id && col.title) map.set(col.title, col.id);
  }
  return map;
}

export const MONDAY_FIELD_MAPPING = DEFAULT_LEAD_FIELD_MAPPING;

export function mapLeadToMonday(
  lead: ProviderLeadRecord,
  settings: MondaySettings = {}
): { name: string; columnValues: Record<string, string> } {
  const row = leadToRow(DEFAULT_LEAD_FIELD_MAPPING, lead);
  const columnValues: Record<string, string> = {};
  for (const m of DEFAULT_LEAD_FIELD_MAPPING) {
    const columnId = settings.columnIds?.[m.source] ?? m.target;
    columnValues[columnId] = row[m.target] ?? "";
  }
  return {
    name: (lead.firstName + (lead.lastName ? " " + lead.lastName : "")).trim() || lead.email || "Unnamed lead",
    columnValues,
  };
}

export function mapMondayToLead(
  item: {
    name?: string;
    column_values?: Array<{ id?: string; text?: string; column?: { title?: string } }>;
    columnValues?: Record<string, string>;
  },
  settings: MondaySettings = {}
): ProviderLeadRecord {
  const row: Record<string, string> = {};
  // Accepts the API shape (column_values with column titles) or the
  // mapLeadToMonday shape (columnValues keyed by title).
  if (item.columnValues) {
    for (const [title, text] of Object.entries(item.columnValues)) row[title] = text;
  }
  for (const cv of item.column_values ?? []) {
    const title = cv.column?.title ?? cv.id ?? "";
    const target = title;
    const source = settings.columnIds
      ? Object.entries(settings.columnIds).find(([, id]) => id === cv.id)?.[0]
      : undefined;
    void source;
    row[target] = cv.text ?? "";
  }
  const name = splitName(item.name ?? "");
  row["First Name"] = name.firstName;
  row["Last Name"] = name.lastName ?? "";
  return rowToLead(DEFAULT_LEAD_FIELD_MAPPING, row);
}


export interface MondayAdapterDeps {
  /** Decrypted credential from the connection store, or null. */
  credential: ProviderCredential | null;
  settings: MondaySettings;
}

export function createMondayAdapter(deps: MondayAdapterDeps): ProductivityAdapter {
  const { credential, settings } = deps;
  const apiToken = credential?.apiKey ?? credential?.accessToken;
  const boardId = settings.boardId ?? credential?.extra?.boardId;
  const client = new ProviderHttpClient({
    baseUrl: MONDAY_CONFIG.apiBaseUrl,
    getAuthHeaders: () => ({ Authorization: apiToken ?? "" }),
  });
  const mondayHeaders = { "API-Version": "2024-10" };
  let columnCache: Map<string, string> | null = null;
  async function getColumnIds(): Promise<Map<string, string>> {
    if (columnCache) return columnCache;
    const resolved = await resolveMondayColumns(client, boardId as string, mondayHeaders);
    // Apply explicit overrides on top of the title-resolved ids.
    for (const [source, id] of Object.entries(settings.columnIds ?? {})) {
      const target = DEFAULT_LEAD_FIELD_MAPPING.find((m) => m.source === source)?.target;
      if (target) resolved.set(target, id);
    }
    columnCache = resolved;
    return resolved;
  }

  function checkConfiguration(): { configured: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!apiToken) missing.push("apiToken");
    if (!boardId) missing.push("boardId");
    return { configured: missing.length === 0, missing };
  }

  async function exportLeads(leads: ProviderLeadRecord[]): Promise<ExportResult> {
    const config = checkConfiguration();
    if (!config.configured) {
      throw new Error("monday: configuration_required: missing " + config.missing.join(", "));
    }
    const { unique, duplicates } = dedupeLeadsByEmail(leads);
    const result = emptyExportResult();
    result.processed = leads.length;
    result.skipped = duplicates.length;
    result.createdIds = [];
    if (unique.length === 0) return result;
    const columns = await getColumnIds();
    for (const lead of unique) {
      try {
        const mapped = mapLeadToMonday(lead, settings);
        const values: Record<string, string> = {};
        for (const [key, value] of Object.entries(mapped.columnValues)) {
          const columnId = columns.get(key) ?? key;
          values[columnId] = value;
        }
        const res = await client.request<{ data?: { create_item?: { id?: string } }; errors?: Array<{ message?: string }> }>({
          method: "POST",
          path: "",
          headers: mondayHeaders,
          body: {
            query:
              "mutation($boardId: ID!, $groupId: String, $name: String!, $values: JSON!) { create_item(board_id: $boardId, group_id: $groupId, item_name: $name, column_values: $values) { id } }",
            variables: {
              boardId,
              groupId: settings.groupId ?? null,
              name: mapped.name,
              values: JSON.stringify(values),
            },
          },
        });
        if (res.errors?.length) throw new Error(res.errors.map((e) => e.message ?? "monday error").join("; "));
        const id = res.data?.create_item?.id;
        if (!id) throw new Error("monday: create_item returned no id");
        result.created += 1;
        result.createdIds?.push(id);
      } catch (err) {
        result.failed += 1;
        result.errors.push(err instanceof Error ? err.message : "monday create failed");
      }
    }
    return result;
  }

  async function importLeads(): Promise<ImportResult> {
    const config = checkConfiguration();
    if (!config.configured) {
      throw new Error("monday: configuration_required: missing " + config.missing.join(", "));
    }
    const res = await client.request<{
      data?: {
        boards?: Array<{
          items_page?: {
            items?: Array<{
              id?: string;
              name?: string;
              column_values?: Array<{ id?: string; text?: string; column?: { title?: string } }>;
            }>;
          };
        }>;
      };
    }>({
      method: "POST",
      path: "",
      headers: mondayHeaders,
      body: {
        query:
          "query($boardId: [ID!]) { boards(ids: $boardId) { items_page(limit: 100) { items { id name column_values { id text column { title } } } } } }",
        variables: { boardId: [boardId] },
      },
    });
    const leads: ProviderLeadRecord[] = [];
    const errors: string[] = [];
    for (const item of res.data?.boards?.[0]?.items_page?.items ?? []) {
      const lead = mapMondayToLead(item, settings);
      lead.sourceId = item.id;
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
    void opts;
    const created = await exportLeads([lead]);
    if (created.failed > 0) {
      throw new Error("monday: create item failed: " + created.errors.join("; "));
    }
    const id = created.createdIds?.[0];
    if (!id) throw new Error("monday: create item returned no id");
    return { id, url: null };
  }

  return { provider: "monday", exportLeads, importLeads, createTaskFromLead, checkConfiguration };
}
