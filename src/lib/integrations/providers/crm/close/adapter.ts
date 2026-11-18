/**
 * Close adapter — ProviderHttpClient-based, mocked-only tests.
 *
 * Verified endpoints (base https://api.close.com/api/v1 — see
 * ./config.ts): /me/, lead list/create/update, lead_status list,
 * activity/note create. No endpoint URL in this file is guessed.
 *
 * Auth is HTTP Basic with the API key as username and an empty
 * password (`Basic base64(key + ":")`).
 */

import type { ProviderCredential } from "../../connections";
import { toProviderError } from "../../client";
import {
  buildCrmClient,
  runCrmExport,
  runCrmImport,
  splitName,
  type CrmAdapter,
  type CrmAdapterDeps,
  type CrmLead,
  type CrmNote,
  type CrmTestResult,
} from "../shared";
import { CLOSE_BASE_URL } from "./config";

interface CloseContact {
  id: string;
  lead_id: string;
  name?: string;
  title?: string;
  emails?: Array<{ email: string }>;
}

interface CloseLead {
  id: string;
  name?: string;
  status_id?: string;
  contacts?: CloseContact[];
}

interface CloseLeadList {
  data: CloseLead[];
  total_results: number;
}

export function closeClient(credential: ProviderCredential) {
  if (!credential.apiKey) {
    throw new Error("[close] No API key in the stored credential.");
  }
  const basic = Buffer.from(`${credential.apiKey}:`).toString("base64");
  return buildCrmClient(CLOSE_BASE_URL, () => ({
    Authorization: `Basic ${basic}`,
  }));
}

export function closeLeadToLeads(lead: CloseLead): CrmLead[] {
  const contacts = lead.contacts ?? [];
  if (contacts.length === 0) {
    return [
      {
        externalId: lead.id,
        firstName: lead.name ?? "",
        tags: [],
      },
    ];
  }
  return contacts.map((contact) => {
    const { firstName, lastName } = splitName(contact.name ?? "");
    return {
      externalId: lead.id,
      email: contact.emails?.[0]?.email,
      firstName,
      lastName,
      company: lead.name,
      jobTitle: contact.title,
      tags: [],
    };
  });
}

export function leadToCloseLead(lead: CrmLead): Record<string, unknown> {
  const contactName = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Unknown";
  const contact: Record<string, unknown> = { name: contactName };
  if (lead.email) contact.emails = [{ email: lead.email }];
  if (lead.jobTitle) contact.title = lead.jobTitle;
  return {
    name: lead.company ?? contactName,
    contacts: [contact],
  };
}

async function findLeadByContactEmail(
  client: ReturnType<typeof closeClient>,
  email: string
): Promise<CloseLead | null> {
  // Close has no direct "find contact by email" endpoint; list leads
  // (paged) and match the nested contact email client-side.
  let skip = 0;
  const limit = 100;
  for (;;) {
    const page = await client.request<CloseLeadList>({
      method: "GET",
      path: "/lead/",
      query: { _limit: String(limit), _skip: String(skip) },
    });
    for (const lead of page.data ?? []) {
      if (
        lead.contacts?.some((c) =>
          c.emails?.some((e) => e.email.toLowerCase() === email.toLowerCase())
        )
      ) {
        return lead;
      }
    }
    skip += (page.data ?? []).length;
    if (skip >= page.total_results || (page.data ?? []).length === 0) return null;
  }
}

export function createCloseAdapter(): CrmAdapter {
  const provider = "close";
  const adapter: CrmAdapter = {
    provider,

    async testConnection(credential): Promise<CrmTestResult> {
      try {
        const client = closeClient(credential);
        const me = await client.request<{ first_name?: string; last_name?: string }>({
          method: "GET",
          path: "/me/",
        });
        const name = [me.first_name, me.last_name].filter(Boolean).join(" ");
        return { ok: true, detail: `Close reachable${name ? ` as ${name}` : ""}.` };
      } catch (err) {
        return { ok: false, detail: toProviderError(err).message };
      }
    },

    async importContacts(credential, opts): Promise<CrmLead[]> {
      const client = closeClient(credential);
      const limit = Math.min(opts?.limit ?? 100, 100);
      const leads: CrmLead[] = [];
      let skip = 0;
      for (;;) {
        const page = await client.request<CloseLeadList>({
          method: "GET",
          path: "/lead/",
          query: { _limit: String(limit), _skip: String(skip) },
        });
        for (const lead of page.data ?? []) leads.push(...closeLeadToLeads(lead));
        skip += (page.data ?? []).length;
        if (skip >= page.total_results || (page.data ?? []).length === 0) break;
        if (leads.length >= (opts?.limit ?? 100)) break;
      }
      return leads.slice(0, opts?.limit ?? leads.length);
    },

    async exportLead(credential, lead) {
      const client = closeClient(credential);
      if (lead.email) {
        const existing = await findLeadByContactEmail(client, lead.email);
        if (existing) {
          await client.request({
            method: "PUT",
            path: `/lead/${existing.id}/`,
            body: leadToCloseLead(lead),
          });
          return { externalId: existing.id, created: false };
        }
      }
      const created = await client.request<CloseLead>({
        method: "POST",
        path: "/lead/",
        body: leadToCloseLead(lead),
      });
      return { externalId: created.id, created: true };
    },

    /** Status is a status_id; look it up by label first. */
    async syncLeadStatus(credential, externalId, status) {
      const client = closeClient(credential);
      const statuses = await client.request<{ data: Array<{ id: string; label: string }> }>({
        method: "GET",
        path: "/lead_status/",
      });
      const match = (statuses.data ?? []).find(
        (s) => s.label.toLowerCase() === status.toLowerCase()
      );
      if (!match) {
        throw new Error(
          `[close] No lead status labelled "${status}" in this Close workspace — create it in Close first.`
        );
      }
      await client.request({
        method: "PUT",
        path: `/lead/${externalId}/`,
        body: { status_id: match.id },
      });
    },

    async syncTags() {
      throw new Error("[close] Tag sync is not supported: Close leads have no native tag field.");
    },

    async syncNote(credential, externalId, note: CrmNote) {
      const client = closeClient(credential);
      await client.request({
        method: "POST",
        path: "/activity/note/",
        body: { lead_id: externalId, note: note.body },
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
