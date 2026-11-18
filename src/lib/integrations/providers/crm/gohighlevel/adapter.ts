/**
 * GoHighLevel adapter — ProviderHttpClient-based, mocked-only tests.
 *
 * Verified endpoints (base https://services.leadconnectorhq.com,
 * API v2 — see ./config.ts): contacts list/get/search/create/
 * update. Every request carries `Version: 2021-07-28`.
 *
 * Deliberate gaps (config-ready, no guessed URL):
 *  - syncNote: the v2 contact-notes endpoint path was not verified
 *    against the official reference in this pass.
 *  - syncTags (direct tag endpoints): same — unverified path.
 *    Tags ARE written at contact create/update time (the `tags`
 *    field on the contact body, verified), and status sync uses
 *    that same verified path.
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
  type CrmTestResult,
} from "../shared";
import { GOHIGHLEVEL_API_VERSION_HEADER, GOHIGHLEVEL_BASE_URL } from "./config";

interface GhlContact {
  id: string;
  locationId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  companyName?: string;
  tags?: string[];
}

interface GhlListResponse {
  contacts: GhlContact[];
  total?: number;
}

function locationIdOf(credential: ProviderCredential): string {
  const locationId = credential.extra?.locationId;
  if (!locationId) {
    throw new Error(
      "[gohighlevel] No locationId in the stored credential — save the sub-account locationId with the connection."
    );
  }
  return locationId;
}

export function gohighlevelClient(credential: ProviderCredential) {
  if (!credential.accessToken) {
    throw new Error("[gohighlevel] No token in the stored credential.");
  }
  return buildCrmClient(GOHIGHLEVEL_BASE_URL, () => ({
    Authorization: `Bearer ${credential.accessToken}`,
    Version: GOHIGHLEVEL_API_VERSION_HEADER,
  }));
}

export function ghlContactToLead(contact: GhlContact): CrmLead {
  return {
    externalId: contact.id,
    email: contact.email,
    firstName: contact.firstName ?? "",
    lastName: contact.lastName,
    company: contact.companyName,
    tags: contact.tags ?? [],
  };
}

export function leadToGhlContact(
  lead: CrmLead,
  locationId: string
): Record<string, unknown> {
  const body: Record<string, unknown> = { locationId };
  if (lead.firstName) body.firstName = lead.firstName;
  if (lead.lastName) body.lastName = lead.lastName;
  if (lead.email) body.email = lead.email;
  if (lead.company) body.companyName = lead.company;
  if (lead.tags && lead.tags.length > 0) body.tags = lead.tags;
  return body;
}

/** Status is stored as a `nxtsend:<status>` tag on the contact. */
export function ghlStatusTag(status: string): string {
  return `nxtsend:${status}`;
}

async function findContactByEmail(
  client: ReturnType<typeof gohighlevelClient>,
  locationId: string,
  email: string
): Promise<GhlContact | null> {
  const res = await client.request<GhlListResponse>({
    method: "POST",
    path: "/contacts/search",
    body: { locationId, query: email },
  });
  const contacts = res.contacts ?? [];
  return (
    contacts.find((c) => c.email?.toLowerCase() === email.toLowerCase()) ??
    contacts[0] ??
    null
  );
}

export function createGoHighLevelAdapter(): CrmAdapter {
  const provider = "gohighlevel";
  const adapter: CrmAdapter = {
    provider,

    async testConnection(credential): Promise<CrmTestResult> {
      try {
        const client = gohighlevelClient(credential);
        const locationId = locationIdOf(credential);
        await client.request({
          method: "GET",
          path: "/contacts/",
          query: { locationId, limit: "1" },
        });
        return { ok: true, detail: `GoHighLevel location ${locationId} reachable.` };
      } catch (err) {
        return { ok: false, detail: toProviderError(err).message };
      }
    },

    async importContacts(credential, opts): Promise<CrmLead[]> {
      const client = gohighlevelClient(credential);
      const locationId = locationIdOf(credential);
      const limit = Math.min(opts?.limit ?? 100, 100);
      const res = await client.request<GhlListResponse>({
        method: "GET",
        path: "/contacts/",
        query: { locationId, limit: String(limit) },
      });
      return (res.contacts ?? []).map(ghlContactToLead);
    },

    async exportLead(credential, lead) {
      const client = gohighlevelClient(credential);
      const locationId = locationIdOf(credential);
      if (lead.email) {
        const existing = await findContactByEmail(client, locationId, lead.email);
        if (existing) {
          await client.request({
            method: "PUT",
            path: `/contacts/${existing.id}`,
            body: leadToGhlContact(lead, locationId),
          });
          return { externalId: existing.id, created: false };
        }
      }
      const created = await client.request<{ contact: GhlContact }>({
        method: "POST",
        path: "/contacts/",
        body: leadToGhlContact(lead, locationId),
      });
      return { externalId: created.contact.id, created: true };
    },

    async syncLeadStatus(credential, externalId, status) {
      const client = gohighlevelClient(credential);
      const locationId = locationIdOf(credential);
      const contact = await client.request<GhlContact>({
        method: "GET",
        path: `/contacts/${externalId}`,
      });
      const tags = (contact.tags ?? []).filter((t) => !t.startsWith("nxtsend:"));
      tags.push(ghlStatusTag(status));
      await client.request({
        method: "PUT",
        path: `/contacts/${externalId}`,
        body: { locationId, tags },
      });
    },

    async syncTags(credential, externalId, tags) {
      // The dedicated tag add/remove endpoints are config-ready only
      // (path unverified); tags are written via the verified contact
      // update path instead.
      const client = gohighlevelClient(credential);
      const locationId = locationIdOf(credential);
      const contact = await client.request<GhlContact>({
        method: "GET",
        path: `/contacts/${externalId}`,
      });
      const merged = Array.from(new Set([...(contact.tags ?? []), ...tags]));
      await client.request({
        method: "PUT",
        path: `/contacts/${externalId}`,
        body: { locationId, tags: merged },
      });
    },

    async syncNote() {
      throw configReadyError(
        "gohighlevel",
        "note sync",
        "the exact v2 contact-notes endpoint path was not verified against the official HighLevel reference in this pass."
      );
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
