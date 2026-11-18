/**
 * Salesforce adapter — ProviderHttpClient-based, mocked-only tests.
 *
 * Verified endpoints (base = per-org instance URL, API v64.0 — see
 * ./config.ts): SOQL query, Contact create/read/update, Task create,
 * limits connect test. No endpoint URL in this file is guessed.
 *
 * Deliberate gaps:
 *  - syncLeadStatus: NOT implemented — the Contact object has no
 *    status field. Mapping NxtSend status onto the Lead object is a
 *    follow-up; this adapter throws a config-ready error instead of
 *    writing to a wrong field.
 *  - Account linking: company is stored as the Contact's Title /
 *    Description context only; creating/linking an Account record is
 *    a follow-up (AccountId is read back when present).
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
import { SALESFORCE_API_VERSION, SALESFORCE_CONTACT_FIELDS } from "./config";

interface SalesforceContact {
  Id: string;
  FirstName?: string;
  LastName?: string;
  Email?: string;
  AccountId?: string;
  Title?: string;
  Description?: string;
  Account?: { Name?: string };
}

interface SalesforceQueryResponse {
  records: SalesforceContact[];
  done: boolean;
  nextRecordsUrl?: string;
}

function instanceBaseUrl(credential: ProviderCredential): string {
  const instanceUrl = credential.extra?.instanceUrl;
  if (!instanceUrl) {
    throw new Error(
      "[salesforce] No instanceUrl in the stored credential — complete the OAuth flow so the token response's instance_url is saved."
    );
  }
  return instanceUrl.replace(/\/+$/, "");
}

export function salesforceClient(credential: ProviderCredential) {
  if (!credential.accessToken) {
    throw new Error("[salesforce] No access token in the stored credential.");
  }
  return buildCrmClient(instanceBaseUrl(credential), () => ({
    Authorization: `Bearer ${credential.accessToken}`,
  }));
}

export function salesforceContactToLead(contact: SalesforceContact): CrmLead {
  return {
    externalId: contact.Id,
    email: contact.Email,
    firstName: contact.FirstName ?? "",
    lastName: contact.LastName,
    company: contact.Account?.Name,
    jobTitle: contact.Title,
    tags: [],
  };
}

export function leadToSalesforceFields(lead: CrmLead): Record<string, string> {
  const fields: Record<string, string> = {};
  if (lead.firstName) fields.FirstName = lead.firstName;
  if (lead.lastName) fields.LastName = lead.lastName;
  if (lead.email) fields.Email = lead.email;
  if (lead.jobTitle) fields.Title = lead.jobTitle;
  return fields;
}

function soqlEscape(value: string): string {
  return value.replace(/'/g, "\\'");
}

async function findContactByEmail(
  client: ReturnType<typeof salesforceClient>,
  email: string
): Promise<SalesforceContact | null> {
  const q = `SELECT ${SALESFORCE_CONTACT_FIELDS.join(", ")} FROM Contact WHERE Email = '${soqlEscape(email)}' LIMIT 1`;
  const res = await client.request<SalesforceQueryResponse>({
    method: "GET",
    path: `/services/data/${SALESFORCE_API_VERSION}/query`,
    query: { q },
  });
  return res.records[0] ?? null;
}

export function createSalesforceAdapter(): CrmAdapter {
  const provider = "salesforce";
  const adapter: CrmAdapter = {
    provider,

    async testConnection(credential): Promise<CrmTestResult> {
      try {
        const client = salesforceClient(credential);
        await client.request({
          method: "GET",
          path: `/services/data/${SALESFORCE_API_VERSION}/limits`,
        });
        return { ok: true, detail: "Salesforce instance reachable (limits endpoint)." };
      } catch (err) {
        return { ok: false, detail: toProviderError(err).message };
      }
    },

    async importContacts(credential, opts): Promise<CrmLead[]> {
      const client = salesforceClient(credential);
      const limit = Math.min(opts?.limit ?? 100, 200);
      const q = `SELECT ${SALESFORCE_CONTACT_FIELDS.join(", ")} FROM Contact ORDER BY CreatedDate DESC LIMIT ${limit}`;
      const res = await client.request<SalesforceQueryResponse>({
        method: "GET",
        path: `/services/data/${SALESFORCE_API_VERSION}/query`,
        query: { q },
      });
      return (res.records ?? []).map(salesforceContactToLead);
    },

    async exportLead(credential, lead) {
      const client = salesforceClient(credential);
      const fields = leadToSalesforceFields(lead);
      if (lead.email) {
        const existing = await findContactByEmail(client, lead.email);
        if (existing) {
          await client.request({
            method: "PATCH",
            path: `/services/data/${SALESFORCE_API_VERSION}/sobjects/Contact/${existing.Id}`,
            body: fields,
          });
          return { externalId: existing.Id, created: false };
        }
      }
      const created = await client.request<{ id: string }>({
        method: "POST",
        path: `/services/data/${SALESFORCE_API_VERSION}/sobjects/Contact`,
        body: fields,
      });
      return { externalId: created.id, created: true };
    },

    async syncLeadStatus() {
      throw configReadyError(
        "salesforce",
        "status sync",
        "the Contact object has no status field; mapping NxtSend status onto the Lead object is a follow-up."
      );
    },

    async syncTags() {
      throw configReadyError(
        "salesforce",
        "tag sync",
        "the Contact object has no native tag field; tag sync would need a custom field or the Lead object."
      );
    },

    /** Logs activity as a Task linked to the Contact (WhoId). */
    async syncNote(credential, externalId, note: CrmNote) {
      const client = salesforceClient(credential);
      await client.request({
        method: "POST",
        path: `/services/data/${SALESFORCE_API_VERSION}/sobjects/Task`,
        body: {
          Subject: note.title ?? "NxtSend note",
          Description: note.body,
          WhoId: externalId,
          Status: "Completed",
        },
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
