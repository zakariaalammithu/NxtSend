/**
 * HubSpot adapter — ProviderHttpClient-based, mocked-only tests.
 *
 * Verified endpoints (base https://api.hubapi.com, see ./config.ts):
 * contacts list/search/create/batch-create/update, notes create with
 * inline association, account-info connect test. No endpoint URL in
 * this file is guessed.
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
import { HUBSPOT_BASE_URL, HUBSPOT_CONFIG, HUBSPOT_STATUS_MAP } from "./config";

interface HubSpotContact {
  id: string;
  properties: Record<string, string | undefined>;
}

interface HubSpotListResponse {
  results: HubSpotContact[];
  paging?: { next?: { after?: string } };
}

export function hubspotClient(credential: ProviderCredential) {
  if (!credential.accessToken) {
    throw new Error("[hubspot] No access token in the stored credential.");
  }
  return buildCrmClient(HUBSPOT_BASE_URL, () => ({
    Authorization: `Bearer ${credential.accessToken}`,
  }));
}

export function hubspotContactToLead(contact: HubSpotContact): CrmLead {
  const p = contact.properties ?? {};
  return {
    externalId: contact.id,
    email: p.email,
    firstName: p.firstname ?? "",
    lastName: p.lastname,
    company: p.company,
    jobTitle: p.jobtitle,
    linkedinUrl: p.hs_linkedin_url,
    tags: [],
  };
}

export function leadToHubSpotProperties(lead: CrmLead): Record<string, string> {
  const props: Record<string, string> = {};
  if (lead.email) props.email = lead.email;
  if (lead.firstName) props.firstname = lead.firstName;
  if (lead.lastName) props.lastname = lead.lastName;
  if (lead.company) props.company = lead.company;
  if (lead.jobTitle) props.jobtitle = lead.jobTitle;
  if (lead.linkedinUrl) props.hs_linkedin_url = lead.linkedinUrl;
  if (lead.status && HUBSPOT_STATUS_MAP[lead.status]) {
    props.lifecyclestage = HUBSPOT_STATUS_MAP[lead.status];
  }
  return props;
}

async function findContactByEmail(
  client: ReturnType<typeof hubspotClient>,
  email: string
): Promise<HubSpotContact | null> {
  const res = await client.request<{ results: HubSpotContact[] }>({
    method: "POST",
    path: "/crm/v3/objects/contacts/search",
    body: {
      filterGroups: [
        { filters: [{ propertyName: "email", operator: "EQ", value: email }] },
      ],
      properties: HUBSPOT_CONFIG.readProperties,
      limit: 1,
    },
  });
  return res.results[0] ?? null;
}

export function createHubSpotAdapter(): CrmAdapter {
  const provider = "hubspot";
  const adapter: CrmAdapter = {
    provider,

    async testConnection(credential): Promise<CrmTestResult> {
      try {
        const client = hubspotClient(credential);
        const info = await client.request<{ portalId?: number; company?: string }>({
          method: "GET",
          path: "/account-info/v3/details",
        });
        return {
          ok: true,
          detail: `HubSpot account reachable${info.portalId ? ` (portal ${info.portalId})` : ""}.`,
        };
      } catch (err) {
        return { ok: false, detail: toProviderError(err).message };
      }
    },

    async importContacts(credential, opts): Promise<CrmLead[]> {
      const client = hubspotClient(credential);
      const leads: CrmLead[] = [];
      const limit = Math.min(opts?.limit ?? 100, 100);
      let after: string | undefined;
      do {
        const page = await client.request<HubSpotListResponse>({
          method: "GET",
          path: "/crm/v3/objects/contacts",
          query: {
            limit: String(limit),
            properties: HUBSPOT_CONFIG.readProperties.join(","),
            ...(after ? { after } : {}),
          },
        });
        for (const contact of page.results ?? []) {
          leads.push(hubspotContactToLead(contact));
        }
        after = page.paging?.next?.after;
      } while (after && leads.length < (opts?.limit ?? 100));
      return leads.slice(0, opts?.limit ?? leads.length);
    },

    async exportLead(credential, lead) {
      const client = hubspotClient(credential);
      const properties = leadToHubSpotProperties(lead);
      if (lead.email) {
        const existing = await findContactByEmail(client, lead.email);
        if (existing) {
          await client.request({
            method: "PATCH",
            path: `/crm/v3/objects/contacts/${existing.id}`,
            body: { properties },
          });
          return { externalId: existing.id, created: false };
        }
      }
      const created = await client.request<HubSpotContact>({
        method: "POST",
        path: "/crm/v3/objects/contacts",
        body: { properties },
      });
      return { externalId: created.id, created: true };
    },

    async syncLeadStatus(credential, externalId, status) {
      const client = hubspotClient(credential);
      const lifecyclestage = HUBSPOT_STATUS_MAP[status];
      if (!lifecyclestage) {
        throw new Error(`[hubspot] No lifecyclestage mapping for status "${status}".`);
      }
      await client.request({
        method: "PATCH",
        path: `/crm/v3/objects/contacts/${externalId}`,
        body: { properties: { lifecyclestage } },
      });
    },

    async syncTags(credential, externalId, tags) {
      // HubSpot contacts have no native tag field; tags are stored on
      // the NxtSend side only. Kept explicit so callers do not assume
      // a tag write happened.
      void credential;
      void externalId;
      void tags;
      throw new Error(
        "[hubspot] Tag sync is not supported: HubSpot contacts have no native tag field."
      );
    },

    async syncNote(credential, externalId, note: CrmNote) {
      const client = hubspotClient(credential);
      await client.request({
        method: "POST",
        path: "/crm/v3/objects/notes",
        body: {
          properties: { hs_note_body: note.body, hs_timestamp: Date.now() },
          associations: [
            {
              to: { id: externalId },
              types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }],
            },
          ],
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

export { splitName };
