/**
 * Asana adapter — create follow-up tasks from leads, import tasks.
 *
 * Verified endpoints (Asana API docs, checked 2026-11-19):
 *   POST /tasks  Body { data: { name, notes, projects: [gid],
 *        workspace: gid, due_on?, assignee? } } — response
 *        { data: { gid, permalink_url, ... } }. Scope tasks:write.
 *   GET  /tasks?project={gid}&opt_fields=name,notes,completed,...
 *   PUT  /tasks/{gid}  Body { data: {...} }
 * Auth: Bearer personal access token or OAuth token. Asana has no
 * bulk-create endpoint — one request per task. Export = one task
 * per lead in the configured project. Import is best-effort: it
 * reads back the name + the "Email: / Company: / Job title: /
 * LinkedIn:" lines this adapter writes into task notes.
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
import { ASANA_CONFIG, type AsanaSettings } from "./config";

export const ASANA_FIELD_MAPPING = DEFAULT_LEAD_FIELD_MAPPING;

export function mapLeadToAsana(
  lead: ProviderLeadRecord,
  _settings: AsanaSettings = {}
): { name: string; notes: string } {
  void _settings;
  return { name: taskTitleForLead(lead), notes: taskDescriptionForLead(lead) };
}

export function mapAsanaToLead(
  task: { name?: string; notes?: string },
  _settings: AsanaSettings = {}
): ProviderLeadRecord {
  void _settings;
  const name = splitName((task.name ?? "").replace(/^Follow up:\s*/, "").replace(/\s*\(.*\)$/, ""));
  return { ...name, ...parseTaskDescription(task.notes ?? "") };
}


export interface AsanaAdapterDeps {
  /** Decrypted credential from the connection store, or null. */
  credential: ProviderCredential | null;
  settings: AsanaSettings;
}

export function createAsanaAdapter(deps: AsanaAdapterDeps): ProductivityAdapter {
  const { credential, settings } = deps;
  const token = credential?.accessToken ?? credential?.apiKey;
  const projectGid = settings.projectGid ?? credential?.extra?.projectGid;
  const workspaceGid = settings.workspaceGid ?? credential?.extra?.workspaceGid;
  const client = new ProviderHttpClient({
    baseUrl: ASANA_CONFIG.apiBaseUrl,
    getAuthHeaders: () => ({ Authorization: "Bearer " + token }),
  });

  function checkConfiguration(): { configured: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!token) missing.push("accessToken");
    if (!projectGid && !workspaceGid) missing.push("projectGid or workspaceGid");
    return { configured: missing.length === 0, missing };
  }

  async function exportLeads(leads: ProviderLeadRecord[]): Promise<ExportResult> {
    const config = checkConfiguration();
    if (!config.configured) {
      throw new Error("asana: configuration_required: missing " + config.missing.join(", "));
    }
    const { unique, duplicates } = dedupeLeadsByEmail(leads);
    const result = emptyExportResult();
    result.processed = leads.length;
    result.skipped = duplicates.length;
    result.createdIds = [];
    for (const lead of unique) {
      try {
        const mapped = mapLeadToAsana(lead, settings);
        const res = await client.request<{ data?: { gid?: string } }>({
          method: "POST",
          path: "/tasks",
          body: {
            data: {
              name: mapped.name,
              notes: mapped.notes,
              ...(projectGid ? { projects: [projectGid] } : {}),
              ...(workspaceGid ? { workspace: workspaceGid } : {}),
            },
          },
        });
        const gid = res.data?.gid;
        if (!gid) throw new Error("asana: create returned no gid");
        result.created += 1;
        result.createdIds?.push(gid);
      } catch (err) {
        result.failed += 1;
        result.errors.push(err instanceof Error ? err.message : "asana create failed");
      }
    }
    return result;
  }

  async function importLeads(): Promise<ImportResult> {
    const config = checkConfiguration();
    if (!config.configured) {
      throw new Error("asana: configuration_required: missing " + config.missing.join(", "));
    }
    if (!projectGid) {
      throw new Error("asana: import needs a projectGid (task listing is per-project)");
    }
    const res = await client.request<{
      data?: Array<{ gid?: string; name?: string; notes?: string; completed?: boolean }>;
    }>({
      method: "GET",
      path: "/tasks",
      query: {
        project: projectGid,
        opt_fields: "name,notes,completed",
      },
    });
    const leads: ProviderLeadRecord[] = [];
    const errors: string[] = [];
    for (const task of res.data ?? []) {
      const lead = mapAsanaToLead(task, settings);
      lead.sourceId = task.gid;
      lead.status = task.completed ? "done" : "open";
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
      throw new Error("asana: configuration_required: missing " + config.missing.join(", "));
    }
    const mapped = mapLeadToAsana(lead, settings);
    const res = await client.request<{ data?: { gid?: string; permalink_url?: string } }>({
      method: "POST",
      path: "/tasks",
      body: {
        data: {
          name: mapped.name,
          notes: opts?.notes ? mapped.notes + "\n" + opts.notes : mapped.notes,
          ...(projectGid ? { projects: [projectGid] } : {}),
          ...(workspaceGid ? { workspace: workspaceGid } : {}),
          ...(opts?.dueDate ? { due_on: opts.dueDate } : {}),
        },
      },
    });
    const gid = res.data?.gid;
    if (!gid) throw new Error("asana: create returned no gid");
    return { id: gid, url: res.data?.permalink_url ?? null };
  }

  return { provider: "asana", exportLeads, importLeads, createTaskFromLead, checkConfiguration };
}
