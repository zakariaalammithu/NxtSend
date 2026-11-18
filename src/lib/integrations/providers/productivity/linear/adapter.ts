/**
 * Linear adapter — create follow-up issues from leads, import issues.
 *
 * Verified (Linear developer docs, checked 2026-11-19):
 *   POST https://api.linear.app/graphql  (single GraphQL endpoint)
 *   mutation { issueCreate(input: { teamId, title, description,
 *     priority?, labelIds?, assigneeId? }) { success issue { id
 *     identifier title url } } }
 *   query { issues(first: 100) { nodes { id identifier title
 *     description url team { id } } } } — filtered client-side by
 *     team id (no server-side filter syntax is assumed here).
 * Auth: Bearer personal API key (Settings → API) or OAuth token.
 * Rate limit: 1,500 requests/hour for personal API keys.
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
import { LINEAR_CONFIG, type LinearSettings } from "./config";

export const LINEAR_FIELD_MAPPING = DEFAULT_LEAD_FIELD_MAPPING;

export function mapLeadToLinear(
  lead: ProviderLeadRecord,
  _settings: LinearSettings = {}
): { title: string; description: string } {
  void _settings;
  return { title: taskTitleForLead(lead), description: taskDescriptionForLead(lead) };
}

export function mapLinearToLead(
  issue: { title?: string; description?: string },
  _settings: LinearSettings = {}
): ProviderLeadRecord {
  void _settings;
  const name = splitName((issue.title ?? "").replace(/^Follow up:\s*/, "").replace(/\s*\(.*\)$/, ""));
  return { ...name, ...parseTaskDescription(issue.description ?? "") };
}


export interface LinearAdapterDeps {
  /** Decrypted credential from the connection store, or null. */
  credential: ProviderCredential | null;
  settings: LinearSettings;
}

export function createLinearAdapter(deps: LinearAdapterDeps): ProductivityAdapter {
  const { credential, settings } = deps;
  const token = credential?.apiKey ?? credential?.accessToken;
  const teamId = settings.teamId ?? credential?.extra?.teamId;
  const client = new ProviderHttpClient({
    baseUrl: LINEAR_CONFIG.apiBaseUrl,
    getAuthHeaders: () => ({ Authorization: "Bearer " + token }),
  });

  function checkConfiguration(): { configured: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!token) missing.push("apiKey");
    if (!teamId) missing.push("teamId");
    return { configured: missing.length === 0, missing };
  }

  async function exportLeads(leads: ProviderLeadRecord[]): Promise<ExportResult> {
    const config = checkConfiguration();
    if (!config.configured) {
      throw new Error("linear: configuration_required: missing " + config.missing.join(", "));
    }
    const { unique, duplicates } = dedupeLeadsByEmail(leads);
    const result = emptyExportResult();
    result.processed = leads.length;
    result.skipped = duplicates.length;
    result.createdIds = [];
    for (const lead of unique) {
      try {
        const mapped = mapLeadToLinear(lead, settings);
        const res = await client.request<{
          data?: { issueCreate?: { success?: boolean; issue?: { id?: string; identifier?: string } } };
          errors?: Array<{ message?: string }>;
        }>({
          method: "POST",
          path: "",
          body: {
            query:
              "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier } } }",
            variables: {
              input: {
                teamId,
                title: mapped.title,
                description: mapped.description,
                ...(settings.priority !== undefined ? { priority: settings.priority } : {}),
              },
            },
          },
        });
        if (res.errors?.length) throw new Error(res.errors.map((e) => e.message ?? "linear error").join("; "));
        const issue = res.data?.issueCreate?.issue;
        if (!res.data?.issueCreate?.success || !issue?.id) throw new Error("linear: issueCreate failed");
        result.created += 1;
        result.createdIds?.push(issue.identifier ?? issue.id);
      } catch (err) {
        result.failed += 1;
        result.errors.push(err instanceof Error ? err.message : "linear create failed");
      }
    }
    return result;
  }

  async function importLeads(): Promise<ImportResult> {
    const config = checkConfiguration();
    if (!config.configured) {
      throw new Error("linear: configuration_required: missing " + config.missing.join(", "));
    }
    const res = await client.request<{
      data?: {
        issues?: {
          nodes?: Array<{
            id?: string;
            identifier?: string;
            title?: string;
            description?: string;
            team?: { id?: string };
          }>;
        };
      };
    }>({
      method: "POST",
      path: "",
      body: {
        query:
          "query { issues(first: 100) { nodes { id identifier title description team { id } } } }",
      },
    });
    const leads: ProviderLeadRecord[] = [];
    const errors: string[] = [];
    for (const issue of res.data?.issues?.nodes ?? []) {
      if (issue.team?.id && issue.team.id !== teamId) continue;
      const lead = mapLinearToLead(issue, settings);
      lead.sourceId = issue.identifier ?? issue.id;
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
      throw new Error("linear: configuration_required: missing " + config.missing.join(", "));
    }
    const mapped = mapLeadToLinear(lead, settings);
    const res = await client.request<{
      data?: { issueCreate?: { success?: boolean; issue?: { id?: string; identifier?: string; url?: string } } };
      errors?: Array<{ message?: string }>;
    }>({
      method: "POST",
      path: "",
      body: {
        query:
          "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }",
        variables: {
          input: {
            teamId,
            title: mapped.title,
            description: opts?.notes ? mapped.description + "\n" + opts.notes : mapped.description,
            ...(settings.priority !== undefined ? { priority: settings.priority } : {}),
          },
        },
      },
    });
    if (res.errors?.length) throw new Error(res.errors.map((e) => e.message ?? "linear error").join("; "));
    const issue = res.data?.issueCreate?.issue;
    if (!res.data?.issueCreate?.success || !issue?.id) throw new Error("linear: issueCreate failed");
    return { id: issue.identifier ?? issue.id, url: issue.url ?? null };
  }

  return { provider: "linear", exportLeads, importLeads, createTaskFromLead, checkConfiguration };
}
