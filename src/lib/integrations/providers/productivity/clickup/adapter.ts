/**
 * ClickUp adapter — create follow-up tasks from leads, import tasks.
 *
 * Verified endpoints (ClickUp API v2 docs, checked 2026-11-19):
 *   POST /api/v2/list/{list_id}/task  Body { name, description,
 *        assignees?, due_date? (unix ms) } — response { id, url }.
 *   GET  /api/v2/list/{list_id}/task?archived=false
 *   PUT  /api/v2/task/{task_id}
 * Auth: Bearer personal API token (Settings → Apps → API Token) or
 * OAuth. ClickUp has no bulk-create endpoint — one request per task.
 * Import is best-effort: it reads back the name + the "Email: /
 * Company: / ..." lines this adapter writes into task descriptions.
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
import { CLICKUP_CONFIG, type ClickupSettings } from "./config";

export const CLICKUP_FIELD_MAPPING = DEFAULT_LEAD_FIELD_MAPPING;

export function mapLeadToClickup(
  lead: ProviderLeadRecord,
  _settings: ClickupSettings = {}
): { name: string; description: string } {
  void _settings;
  return { name: taskTitleForLead(lead), description: taskDescriptionForLead(lead) };
}

export function mapClickupToLead(
  task: { name?: string; description?: string },
  _settings: ClickupSettings = {}
): ProviderLeadRecord {
  void _settings;
  const name = splitName((task.name ?? "").replace(/^Follow up:\s*/, "").replace(/\s*\(.*\)$/, ""));
  return { ...name, ...parseTaskDescription(task.description ?? "") };
}


export interface ClickupAdapterDeps {
  /** Decrypted credential from the connection store, or null. */
  credential: ProviderCredential | null;
  settings: ClickupSettings;
}

export function createClickupAdapter(deps: ClickupAdapterDeps): ProductivityAdapter {
  const { credential, settings } = deps;
  const token = credential?.apiKey ?? credential?.accessToken;
  const listId = settings.listId ?? credential?.extra?.listId;
  const client = new ProviderHttpClient({
    baseUrl: CLICKUP_CONFIG.apiBaseUrl,
    getAuthHeaders: () => ({ Authorization: "Bearer " + token }),
  });

  function checkConfiguration(): { configured: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!token) missing.push("apiToken");
    if (!listId) missing.push("listId");
    return { configured: missing.length === 0, missing };
  }

  async function exportLeads(leads: ProviderLeadRecord[]): Promise<ExportResult> {
    const config = checkConfiguration();
    if (!config.configured) {
      throw new Error("clickup: configuration_required: missing " + config.missing.join(", "));
    }
    const { unique, duplicates } = dedupeLeadsByEmail(leads);
    const result = emptyExportResult();
    result.processed = leads.length;
    result.skipped = duplicates.length;
    result.createdIds = [];
    for (const lead of unique) {
      try {
        const mapped = mapLeadToClickup(lead, settings);
        const res = await client.request<{ id?: string; url?: string }>({
          method: "POST",
          path: "/list/" + listId + "/task",
          body: { name: mapped.name, description: mapped.description },
        });
        if (!res.id) throw new Error("clickup: create returned no task id");
        result.created += 1;
        result.createdIds?.push(res.id);
      } catch (err) {
        result.failed += 1;
        result.errors.push(err instanceof Error ? err.message : "clickup create failed");
      }
    }
    return result;
  }

  async function importLeads(): Promise<ImportResult> {
    const config = checkConfiguration();
    if (!config.configured) {
      throw new Error("clickup: configuration_required: missing " + config.missing.join(", "));
    }
    const res = await client.request<{
      tasks?: Array<{ id?: string; name?: string; description?: string; status?: { status?: string } }>;
    }>({
      method: "GET",
      path: "/list/" + listId + "/task",
      query: { archived: "false" },
    });
    const leads: ProviderLeadRecord[] = [];
    const errors: string[] = [];
    for (const task of res.tasks ?? []) {
      const lead = mapClickupToLead(task, settings);
      lead.sourceId = task.id;
      lead.status = task.status?.status;
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
      throw new Error("clickup: configuration_required: missing " + config.missing.join(", "));
    }
    const mapped = mapLeadToClickup(lead, settings);
    const res = await client.request<{ id?: string; url?: string }>({
      method: "POST",
      path: "/list/" + listId + "/task",
      body: {
        name: mapped.name,
        description: opts?.notes ? mapped.description + "\n" + opts.notes : mapped.description,
        ...(opts?.dueDate ? { due_date: new Date(opts.dueDate).getTime() } : {}),
      },
    });
    if (!res.id) throw new Error("clickup: create returned no task id");
    return { id: res.id, url: res.url ?? null };
  }

  return { provider: "clickup", exportLeads, importLeads, createTaskFromLead, checkConfiguration };
}
