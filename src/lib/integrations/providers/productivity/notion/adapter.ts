/**
 * Notion adapter — export leads to a database, import rows.
 *
 * Verified endpoints (Notion API docs, checked 2026-11-19):
 *   POST /v1/pages  Body { parent: { database_id }, properties }
 *   POST /v1/databases/{database_id}/query  Body { filter?, sorts?,
 *        start_cursor?, page_size? }
 *   PATCH /v1/pages/{page_id}  Body { properties }
 * Every request carries Authorization: Bearer <secret> + the
 * required Notion-Version header (pinned to 2022-06-28, the
 * long-stable version cited across Notion's docs).
 * Auth: internal integration secret. The database must be shared
 * with the integration or every call 404s. Property names must
 * match the database schema: Name (title), Email (email), Company
 * (rich_text), Job Title (rich_text), LinkedIn URL (url), Tags
 * (multi_select), Status (select).
 */

import { ProviderHttpClient } from "../../client";
import type { ProviderCredential } from "../../connections";
import {
  DEFAULT_LEAD_FIELD_MAPPING,
  dedupeLeadsByEmail,
  emptyExportResult,
  rowToLead,
  splitName,
  type ExportResult,
  type ImportResult,
  type ProductivityAdapter,
  type ProviderLeadRecord,
  type TaskResult,
} from "../types";
import { NOTION_CONFIG, type NotionSettings } from "./config";

export const NOTION_VERSION = "2022-06-28";

type NotionProperty =
  | { title: Array<{ text: { content: string } }> }
  | { rich_text: Array<{ text: { content: string } }> }
  | { email: string }
  | { url: string }
  | { multi_select: Array<{ name: string }> }
  | { select: { name: string } | null };

function richText(value: string): Array<{ text: { content: string } }> {
  return value ? [{ text: { content: value } }] : [];
}

/** Builds the Notion properties object for one lead. */
export function notionProperties(lead: ProviderLeadRecord): Record<string, NotionProperty> {
  return {
    Name: { title: richText(lead.firstName + (lead.lastName ? " " + lead.lastName : "")) },
    Email: { email: lead.email ?? "" },
    Company: { rich_text: richText(lead.company ?? "") },
    "Job Title": { rich_text: richText(lead.jobTitle ?? "") },
    "LinkedIn URL": { url: lead.linkedinUrl ?? "" },
    Tags: { multi_select: (lead.tags ?? []).map((name) => ({ name })) },
    Status: lead.status ? { select: { name: lead.status } } : { select: null },
  };
}

function propText(prop: unknown): string {
  if (!prop || typeof prop !== "object") return "";
  const p = prop as Record<string, unknown>;
  const pick = (key: string): string => {
    const arr = p[key] as Array<{ plain_text?: string; text?: { content?: string } }> | undefined;
    return (arr ?? []).map((t) => t.plain_text ?? t.text?.content ?? "").join("");
  };
  const type = typeof p.type === "string" ? p.type : undefined;
  if (type === "title" || type === "rich_text") return pick(type);
  if (type === "email" || type === "url") return String(p[type] ?? "");
  if (type === "select") {
    const sel = p.select as { name?: string } | null;
    return sel?.name ?? "";
  }
  if (type === "multi_select") {
    const arr = p.multi_select as Array<{ name?: string }> | undefined;
    return (arr ?? []).map((t) => t.name ?? "").join(", ");
  }
  // Written shape (no "type" key): title / rich_text arrays of {text:{content}}.
  if (Array.isArray(p.title)) return pick("title");
  if (Array.isArray(p.rich_text)) return pick("rich_text");
  if (typeof p.email === "string") return p.email;
  if (typeof p.url === "string") return p.url;
  if (Array.isArray(p.multi_select)) {
    return (p.multi_select as Array<{ name?: string }>).map((t) => t.name ?? "").join(", ");
  }
  if (p.select && typeof p.select === "object") {
    return (p.select as { name?: string }).name ?? "";
  }
  return "";
}

export const NOTION_FIELD_MAPPING = DEFAULT_LEAD_FIELD_MAPPING;

export function mapLeadToNotion(
  lead: ProviderLeadRecord,
  _settings: NotionSettings = {}
): Record<string, NotionProperty> {
  void _settings;
  return notionProperties(lead);
}

export function mapNotionToLead(
  page: { properties?: Record<string, unknown> },
  _settings: NotionSettings = {}
): ProviderLeadRecord {
  void _settings;
  // Accepts a page ({ properties }) or a raw properties object.
  const props = (page.properties ?? page) as Record<string, unknown>;
  const row: Record<string, string> = {
    "First Name": "",
    "Last Name": "",
    Email: propText(props["Email"]),
    Company: propText(props["Company"]),
    "Job Title": propText(props["Job Title"]),
    "LinkedIn URL": propText(props["LinkedIn URL"]),
    Tags: propText(props["Tags"]),
    Status: propText(props["Status"]),
  };
  const name = splitName(propText(props["Name"]));
  row["First Name"] = name.firstName;
  row["Last Name"] = name.lastName ?? "";
  return rowToLead(DEFAULT_LEAD_FIELD_MAPPING, row);
}


export interface NotionAdapterDeps {
  /** Decrypted credential from the connection store, or null. */
  credential: ProviderCredential | null;
  settings: NotionSettings;
}

export function createNotionAdapter(deps: NotionAdapterDeps): ProductivityAdapter {
  const { credential, settings } = deps;
  const token = credential?.apiKey ?? credential?.accessToken;
  const databaseId = settings.databaseId ?? credential?.extra?.databaseId;
  const client = new ProviderHttpClient({
    baseUrl: NOTION_CONFIG.apiBaseUrl,
    getAuthHeaders: () => ({ Authorization: "Bearer " + token }),
  });
  const versionHeaders = { "Notion-Version": NOTION_VERSION };

  function checkConfiguration(): { configured: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!token) missing.push("token (internal integration secret)");
    if (!databaseId) missing.push("databaseId");
    return { configured: missing.length === 0, missing };
  }

  async function exportLeads(leads: ProviderLeadRecord[]): Promise<ExportResult> {
    const config = checkConfiguration();
    if (!config.configured) {
      throw new Error("notion: configuration_required: missing " + config.missing.join(", "));
    }
    const { unique, duplicates } = dedupeLeadsByEmail(leads);
    const result = emptyExportResult();
    result.processed = leads.length;
    result.skipped = duplicates.length;
    result.createdIds = [];
    for (const lead of unique) {
      try {
        let pageId: string | null = null;
        if (lead.email) {
          const found = await client.request<{ results?: Array<{ id?: string }> }>({
            method: "POST",
            path: "/databases/" + databaseId + "/query",
            headers: versionHeaders,
            body: {
              filter: { property: "Email", email: { equals: lead.email } },
              page_size: 1,
            },
          });
          pageId = found.results?.[0]?.id ?? null;
        }
        if (pageId) {
          await client.request<unknown>({
            method: "PATCH",
            path: "/pages/" + pageId,
            headers: versionHeaders,
            body: { properties: notionProperties(lead) },
          });
          result.updated += 1;
        } else {
          const created = await client.request<{ id?: string }>({
            method: "POST",
            path: "/pages",
            headers: versionHeaders,
            body: { parent: { database_id: databaseId }, properties: notionProperties(lead) },
          });
          result.created += 1;
          if (created.id) result.createdIds?.push(created.id);
        }
      } catch (err) {
        result.failed += 1;
        result.errors.push(err instanceof Error ? err.message : "notion upsert failed");
      }
    }
    return result;
  }

  async function importLeads(): Promise<ImportResult> {
    const config = checkConfiguration();
    if (!config.configured) {
      throw new Error("notion: configuration_required: missing " + config.missing.join(", "));
    }
    const leads: ProviderLeadRecord[] = [];
    const errors: string[] = [];
    let cursor: string | undefined;
    do {
      const res = await client.request<{
        results?: Array<{ properties?: Record<string, unknown> }>;
        has_more?: boolean;
        next_cursor?: string | null;
      }>({
        method: "POST",
        path: "/databases/" + databaseId + "/query",
        headers: versionHeaders,
        body: { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) },
      });
      for (const page of res.results ?? []) {
        const lead = mapNotionToLead(page, settings);
        if (!lead.firstName && !lead.email) continue;
        leads.push(lead);
      }
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    } while (cursor);
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
      throw new Error("notion: configuration_required: missing " + config.missing.join(", "));
    }
    const created = await client.request<{ id?: string; url?: string }>({
      method: "POST",
      path: "/pages",
      headers: versionHeaders,
      body: { parent: { database_id: databaseId }, properties: notionProperties(lead) },
    });
    if (!created.id) throw new Error("notion: create returned no page id");
    return { id: created.id, url: created.url ?? null };
  }

  return { provider: "notion", exportLeads, importLeads, createTaskFromLead, checkConfiguration };
}
