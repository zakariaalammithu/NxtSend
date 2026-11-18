/**
 * Jira adapter — create follow-up issues from leads (Jira Cloud),
 * import issues via JQL search.
 *
 * Verified endpoints (Atlassian Jira Cloud REST API v3 docs, checked
 * 2026-11-19):
 *   POST /rest/api/3/issue  Body { fields: { project: { key },
 *        issuetype: { name: "Task" }, summary, description: <ADF> } }
 *        — 201 Created { id, key, self }. Rich text MUST be
 *        Atlassian Document Format (plain strings are rejected).
 *   GET  /rest/api/3/search/jql?jql=...&fields=...&maxResults=100
 *        — the legacy /rest/api/3/search endpoint was removed from
 *        Cloud; pagination uses nextPageToken.
 *   GET  /rest/api/3/myself — auth check.
 * Auth: Basic base64(email:api_token). Jira Cloud only — Data Center
 * uses the v2 API and is not covered. Base URL is per-site:
 * https://{site}.atlassian.net/rest/api/3.
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
import { type JiraSettings } from "./config";

/** Builds an Atlassian Document Format paragraph document from plain text. */
export function adfDocument(text: string): Record<string, unknown> {
  return {
    type: "doc",
    version: 1,
    content: text.split("\n").map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : [],
    })),
  };
}

/** Extracts plain text back out of an ADF document (best-effort). */
export function adfToText(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const content = (doc as { content?: Array<{ content?: Array<{ text?: string }> }> }).content ?? [];
  return content
    .map((block) => (block.content ?? []).map((n) => n.text ?? "").join(""))
    .join("\n");
}

export const JIRA_FIELD_MAPPING = DEFAULT_LEAD_FIELD_MAPPING;

export function mapLeadToJira(
  lead: ProviderLeadRecord,
  settings: JiraSettings = {}
): { summary: string; description: Record<string, unknown>; issueType: string } {
  return {
    summary: taskTitleForLead(lead),
    description: adfDocument(taskDescriptionForLead(lead)),
    issueType: settings.issueType ?? "Task",
  };
}

export function mapJiraToLead(
  issue: {
    fields?: { summary?: string; description?: unknown };
    summary?: string;
    description?: unknown;
  },
  _settings: JiraSettings = {}
): ProviderLeadRecord {
  void _settings;
  // Accepts the API shape ({ fields }) or the mapLeadToJira output shape
  // ({ summary, description: ADF }) used by the round-trip test.
  const summary = issue.fields?.summary ?? issue.summary ?? "";
  const description = issue.fields?.description ?? issue.description;
  const name = splitName(summary.replace(/^Follow up:\s*/, "").replace(/\s*\(.*\)$/, ""));
  return { ...name, ...parseTaskDescription(adfToText(description)) };
}


export interface JiraAdapterDeps {
  /** Decrypted credential from the connection store, or null. */
  credential: ProviderCredential | null;
  settings: JiraSettings;
}

export function createJiraAdapter(deps: JiraAdapterDeps): ProductivityAdapter {
  const { credential, settings } = deps;
  const email = settings.email ?? credential?.extra?.email;
  const apiToken = credential?.apiKey ?? credential?.accessToken;
  const siteDomain = settings.siteDomain ?? credential?.extra?.siteDomain;
  const projectKey = settings.projectKey ?? credential?.extra?.projectKey;
  const client = new ProviderHttpClient({
    baseUrl: siteDomain ? "https://" + siteDomain + ".atlassian.net/rest/api/3" : "https://invalid.invalid/rest/api/3",
    getAuthHeaders: () => ({
      Authorization: "Basic " + Buffer.from((email ?? "") + ":" + (apiToken ?? "")).toString("base64"),
    }),
  });

  function checkConfiguration(): { configured: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!email) missing.push("email");
    if (!apiToken) missing.push("apiToken");
    if (!siteDomain) missing.push("siteDomain");
    if (!projectKey) missing.push("projectKey");
    return { configured: missing.length === 0, missing };
  }

  async function exportLeads(leads: ProviderLeadRecord[]): Promise<ExportResult> {
    const config = checkConfiguration();
    if (!config.configured) {
      throw new Error("jira: configuration_required: missing " + config.missing.join(", "));
    }
    const { unique, duplicates } = dedupeLeadsByEmail(leads);
    const result = emptyExportResult();
    result.processed = leads.length;
    result.skipped = duplicates.length;
    result.createdIds = [];
    for (const lead of unique) {
      try {
        const mapped = mapLeadToJira(lead, settings);
        const res = await client.request<{ id?: string; key?: string }>({
          method: "POST",
          path: "/issue",
          body: {
            fields: {
              project: { key: projectKey },
              issuetype: { name: mapped.issueType },
              summary: mapped.summary,
              description: mapped.description,
            },
          },
        });
        if (!res.key) throw new Error("jira: create returned no issue key");
        result.created += 1;
        result.createdIds?.push(res.key);
      } catch (err) {
        result.failed += 1;
        result.errors.push(err instanceof Error ? err.message : "jira create failed");
      }
    }
    return result;
  }

  async function importLeads(): Promise<ImportResult> {
    const config = checkConfiguration();
    if (!config.configured) {
      throw new Error("jira: configuration_required: missing " + config.missing.join(", "));
    }
    const res = await client.request<{
      issues?: Array<{ key?: string; fields?: { summary?: string; description?: unknown } }>;
    }>({
      method: "GET",
      path: "/search/jql",
      query: {
        jql: "project = " + projectKey + " ORDER BY created DESC",
        fields: "summary,description",
        maxResults: "100",
      },
    });
    const leads: ProviderLeadRecord[] = [];
    const errors: string[] = [];
    for (const issue of res.issues ?? []) {
      const lead = mapJiraToLead(issue, settings);
      lead.sourceId = issue.key;
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
      throw new Error("jira: configuration_required: missing " + config.missing.join(", "));
    }
    const mapped = mapLeadToJira(lead, settings);
    const res = await client.request<{ id?: string; key?: string; self?: string }>({
      method: "POST",
      path: "/issue",
      body: {
        fields: {
          project: { key: projectKey },
          issuetype: { name: mapped.issueType },
          summary: mapped.summary,
          description: adfDocument(
            opts?.notes ? taskDescriptionForLead(lead) + "\n" + opts.notes : taskDescriptionForLead(lead)
          ),
        },
      },
    });
    if (!res.key) throw new Error("jira: create returned no issue key");
    return { id: res.key, url: res.self ?? null };
  }

  return { provider: "jira", exportLeads, importLeads, createTaskFromLead, checkConfiguration };
}
