/**
 * Breakcold adapter — ProviderHttpClient-based, mocked-only tests.
 *
 * Verified endpoints (base https://rest.breakcold.com/api/v1,
 * OpenAPI contract — see ./config.ts): workspaces, records
 * list/create/get/update/archive, record notes list/create. No
 * endpoint URL in this file is guessed.
 *
 * Record field values are free-form (`fields` object); `name` and
 * `email` follow the OpenAPI create-record example. Company and
 * job-title slugs are workspace-configurable — the adapter sends
 * `company` / `job_title` and documents that the workspace must
 * confirm them.
 */

import type { ProviderCredential } from "../../connections";
import { toProviderError } from "../../client";
import {
  buildCrmClient,
  configReadyError,
  runCrmExport,
  runCrmImport,
  type CrmAdapter,
  type CrmAdapterDeps,
  type CrmLead,
  type CrmNote,
  type CrmTestResult,
} from "../shared";
import { BREAKCOLD_BASE_URL, BREAKCOLD_PERSON_OBJECT_SLUG } from "./config";

interface BreakcoldRecord {
  id: string;
  workspaceId?: string;
  fields?: Record<string, unknown>;
}

interface BreakcoldRecordList {
  data: BreakcoldRecord[];
  pagination?: { cursor: string | null; hasMore: boolean };
}

function workspaceIdOf(credential: ProviderCredential): string {
  const workspaceId = credential.extra?.workspaceId;
  if (!workspaceId) {
    throw new Error(
      "[breakcold] No workspaceId in the stored credential — save the Breakcold workspaceId with the connection (GET /workspaces lists them)."
    );
  }
  return workspaceId;
}

export function breakcoldClient(credential: ProviderCredential) {
  if (!credential.apiKey) {
    throw new Error("[breakcold] No API key in the stored credential.");
  }
  return buildCrmClient(BREAKCOLD_BASE_URL, () => ({
    Authorization: `Bearer ${credential.apiKey}`,
  }));
}

function stringField(record: BreakcoldRecord, key: string): string | undefined {
  const value = record.fields?.[key];
  return typeof value === "string" ? value : undefined;
}

export function breakcoldRecordToLead(record: BreakcoldRecord): CrmLead {
  const name = stringField(record, "name") ?? "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    externalId: record.id,
    email: stringField(record, "email"),
    firstName: parts[0] ?? "",
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : undefined,
    company: stringField(record, "company"),
    jobTitle: stringField(record, "job_title"),
    tags: [],
  };
}

export function leadToBreakcoldFields(lead: CrmLead): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ");
  if (name) fields.name = name;
  if (lead.email) fields.email = lead.email;
  if (lead.company) fields.company = lead.company;
  if (lead.jobTitle) fields.job_title = lead.jobTitle;
  return fields;
}

async function findRecordByEmail(
  client: ReturnType<typeof breakcoldClient>,
  workspaceId: string,
  email: string
): Promise<BreakcoldRecord | null> {
  const res = await client.request<BreakcoldRecordList>({
    method: "GET",
    path: "/records",
    query: {
      workspaceId,
      objectTypeSlug: BREAKCOLD_PERSON_OBJECT_SLUG,
      search: email,
      searchScope: "all",
      limit: "10",
    },
  });
  return (
    (res.data ?? []).find(
      (r) => stringField(r, "email")?.toLowerCase() === email.toLowerCase()
    ) ?? null
  );
}

export function createBreakcoldAdapter(): CrmAdapter {
  const provider = "breakcold";
  const adapter: CrmAdapter = {
    provider,

    async testConnection(credential): Promise<CrmTestResult> {
      try {
        const client = breakcoldClient(credential);
        const res = await client.request<{ data: Array<{ id: string; name: string }> }>({
          method: "GET",
          path: "/workspaces",
        });
        const count = (res.data ?? []).length;
        return { ok: true, detail: `Breakcold reachable (${count} workspace(s) visible).` };
      } catch (err) {
        return { ok: false, detail: toProviderError(err).message };
      }
    },

    async importContacts(credential, opts): Promise<CrmLead[]> {
      const client = breakcoldClient(credential);
      const workspaceId = workspaceIdOf(credential);
      const res = await client.request<BreakcoldRecordList>({
        method: "GET",
        path: "/records",
        query: {
          workspaceId,
          objectTypeSlug: BREAKCOLD_PERSON_OBJECT_SLUG,
          limit: String(Math.min(opts?.limit ?? 100, 100)),
        },
      });
      return (res.data ?? []).map(breakcoldRecordToLead);
    },

    async exportLead(credential, lead) {
      const client = breakcoldClient(credential);
      const workspaceId = workspaceIdOf(credential);
      const fields = leadToBreakcoldFields(lead);
      if (lead.email) {
        const existing = await findRecordByEmail(client, workspaceId, lead.email);
        if (existing) {
          await client.request({
            method: "PATCH",
            path: `/records/${existing.id}`,
            body: { fields },
          });
          return { externalId: existing.id, created: false };
        }
      }
      const created = await client.request<{ record: BreakcoldRecord }>({
        method: "POST",
        path: "/records",
        body: {
          workspaceId,
          objectTypeSlug: BREAKCOLD_PERSON_OBJECT_SLUG,
          fields,
        },
      });
      return { externalId: created.record.id, created: true };
    },

    async syncLeadStatus() {
      throw configReadyError(
        "breakcold",
        "status sync",
        "Breakcold records have no standard status field; the workspace's stage field slug must be configured first."
      );
    },

    async syncTags() {
      throw configReadyError(
        "breakcold",
        "tag sync",
        "Breakcold records have no standard tag field; the workspace's tag field slug must be configured first."
      );
    },

    async syncNote(credential, externalId, note: CrmNote) {
      const client = breakcoldClient(credential);
      await client.request({
        method: "POST",
        path: `/records/${externalId}/notes`,
        body: { title: note.title ?? "NxtSend note", content: note.body },
      });
    },

    async runImport(deps: CrmAdapterDeps, opts) {
      return runCrmImport(adapter, deps, opts);
    },

    async runExport(deps: CrmAdapterDeps, leads: CrmLead[]) {
      return runCrmExport(adapter, deps, leads);
    },
  };
  return adapter;
}
