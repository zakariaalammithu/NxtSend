/**
 * Zoho CRM adapter — ProviderHttpClient-based, mocked-only tests.
 *
 * Verified endpoints (base https://www.zohoapis.com, API v2 — see
 * ./config.ts): Leads list/search/create/update, Notes create. No
 * endpoint URL in this file is guessed.
 *
 * Zoho wraps writes in `{ data: [...] }` and returns per-record
 * results with `status: "success"` / `"error"`; the adapter checks
 * that status instead of trusting the HTTP code alone.
 */

import type { ProviderCredential } from "../../connections";
import { toProviderError } from "../../client";
import {
  buildCrmClient,
  runCrmExport,
  runCrmImport,
  type CrmAdapter,
  type CrmAdapterDeps,
  type CrmLead,
  type CrmNote,
  type CrmTestResult,
} from "../shared";
import { ZOHO_DEFAULT_BASE_URL, ZOHO_STATUS_MAP } from "./config";

interface ZohoLead {
  id: string;
  Email?: string;
  First_Name?: string;
  Last_Name?: string;
  Company?: string;
  Designation?: string;
  Lead_Status?: string;
}

interface ZohoListResponse {
  data: ZohoLead[];
  info?: { more_records?: boolean };
}

interface ZohoWriteResponse {
  data: Array<{
    code: string;
    status: string;
    message?: string;
    details?: { id?: string };
  }>;
}

function zohoBaseUrl(credential: ProviderCredential): string {
  return (credential.extra?.baseUrl ?? ZOHO_DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function zohoClient(credential: ProviderCredential) {
  if (!credential.accessToken) {
    throw new Error("[zoho] No access token in the stored credential.");
  }
  return buildCrmClient(zohoBaseUrl(credential), () => ({
    Authorization: `Zoho-oauthtoken ${credential.accessToken}`,
  }));
}

export function zohoLeadToLead(record: ZohoLead): CrmLead {
  return {
    externalId: record.id,
    email: record.Email,
    firstName: record.First_Name ?? "",
    lastName: record.Last_Name,
    company: record.Company,
    jobTitle: record.Designation,
    status: record.Lead_Status,
    tags: [],
  };
}

export function leadToZohoFields(lead: CrmLead): Record<string, string> {
  const fields: Record<string, string> = {};
  if (lead.email) fields.Email = lead.email;
  if (lead.firstName) fields.First_Name = lead.firstName;
  if (lead.lastName) fields.Last_Name = lead.lastName;
  // Company is required on the Zoho Leads module.
  const nameFallback = `${lead.firstName} ${lead.lastName ?? ""}`.trim();
  fields.Company = lead.company ?? (nameFallback || "Unknown");
  if (lead.jobTitle) fields.Designation = lead.jobTitle;
  if (lead.status && ZOHO_STATUS_MAP[lead.status]) {
    fields.Lead_Status = ZOHO_STATUS_MAP[lead.status];
  }
  return fields;
}

function checkWrite(res: ZohoWriteResponse, what: string): string {
  const first = res.data?.[0];
  if (!first || first.status !== "success") {
    throw new Error(
      `[zoho] ${what} failed: ${first?.message ?? first?.code ?? "unknown error"}.`
    );
  }
  return first.details?.id ?? "";
}

async function findLeadByEmail(
  client: ReturnType<typeof zohoClient>,
  email: string
): Promise<ZohoLead | null> {
  const res = await client.request<ZohoListResponse>({
    method: "GET",
    path: "/crm/v2/Leads/search",
    query: { criteria: `(Email:equals:${email})` },
  });
  return res.data?.[0] ?? null;
}

export function createZohoAdapter(): CrmAdapter {
  const provider = "zoho";
  const adapter: CrmAdapter = {
    provider,

    async testConnection(credential): Promise<CrmTestResult> {
      try {
        const client = zohoClient(credential);
        await client.request({
          method: "GET",
          path: "/crm/v2/Leads",
          query: { per_page: "1" },
        });
        return { ok: true, detail: "Zoho CRM reachable (Leads module)." };
      } catch (err) {
        return { ok: false, detail: toProviderError(err).message };
      }
    },

    async importContacts(credential, opts): Promise<CrmLead[]> {
      const client = zohoClient(credential);
      const limit = Math.min(opts?.limit ?? 100, 100);
      const res = await client.request<ZohoListResponse>({
        method: "GET",
        path: "/crm/v2/Leads",
        query: { per_page: String(limit) },
      });
      return (res.data ?? []).map(zohoLeadToLead);
    },

    async exportLead(credential, lead) {
      const client = zohoClient(credential);
      const fields = leadToZohoFields(lead);
      if (lead.email) {
        const existing = await findLeadByEmail(client, lead.email);
        if (existing) {
          await client.request<ZohoWriteResponse>({
            method: "PUT",
            path: `/crm/v2/Leads/${existing.id}`,
            body: { data: [fields] },
          });
          return { externalId: existing.id, created: false };
        }
      }
      const res = await client.request<ZohoWriteResponse>({
        method: "POST",
        path: "/crm/v2/Leads",
        body: { data: [fields] },
      });
      return { externalId: checkWrite(res, "lead create"), created: true };
    },

    async syncLeadStatus(credential, externalId, status) {
      const client = zohoClient(credential);
      const leadStatus = ZOHO_STATUS_MAP[status];
      if (!leadStatus) {
        throw new Error(`[zoho] No Lead_Status mapping for status "${status}".`);
      }
      await client.request<ZohoWriteResponse>({
        method: "PUT",
        path: `/crm/v2/Leads/${externalId}`,
        body: { data: [{ Lead_Status: leadStatus }] },
      });
    },

    async syncTags() {
      throw new Error("[zoho] Tag sync is not supported: Zoho Leads have no native tag field.");
    },

    async syncNote(credential, externalId, note: CrmNote) {
      const client = zohoClient(credential);
      const res = await client.request<ZohoWriteResponse>({
        method: "POST",
        path: "/crm/v2/Notes",
        body: {
          data: [
            {
              Note_Title: note.title ?? "NxtSend note",
              Note_Content: note.body,
              Parent_Id: externalId,
              se_module: "Leads",
            },
          ],
        },
      });
      checkWrite(res, "note create");
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
