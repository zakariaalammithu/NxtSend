/**
 * Pipedrive adapter — ProviderHttpClient-based, mocked-only tests.
 *
 * Verified endpoints (base https://api.pipedrive.com/v1 — see
 * ./config.ts): persons list/search/create/update, notes create,
 * activities create, users/me connect test. No endpoint URL in this
 * file is guessed.
 *
 * Pipedrive wraps every response in `{ success, data }`; the
 * adapter unwraps `data` and treats `success: false` as an error.
 */

import type { ProviderCredential } from "../../connections";
import { toProviderError } from "../../client";
import {
  buildCrmClient,
  configReadyError,
  runCrmExport,
  runCrmImport,
  splitName,
  type CrmAdapter,
  type CrmAdapterDeps,
  type CrmLead,
  type CrmNote,
  type CrmTestResult,
} from "../shared";
import { PIPEDRIVE_BASE_URL } from "./config";

interface PipedrivePerson {
  id: number;
  name?: string;
  email?: Array<{ value: string; primary?: boolean }>;
  org_id?: { name?: string } | number | null;
}

interface PipedriveEnvelope<T> {
  success: boolean;
  data: T | null;
  error?: string;
}

export function pipedriveClient(credential: ProviderCredential) {
  if (!credential.accessToken) {
    throw new Error("[pipedrive] No access token in the stored credential.");
  }
  return buildCrmClient(PIPEDRIVE_BASE_URL, () => ({
    Authorization: `Bearer ${credential.accessToken}`,
  }));
}

function unwrap<T>(envelope: PipedriveEnvelope<T>, what: string): T {
  if (!envelope.success || envelope.data === null || envelope.data === undefined) {
    throw new Error(`[pipedrive] ${what} failed: ${envelope.error ?? "unknown error"}.`);
  }
  return envelope.data;
}

export function pipedrivePersonToLead(person: PipedrivePerson): CrmLead {
  const { firstName, lastName } = splitName(person.name ?? "");
  const primaryEmail =
    person.email?.find((e) => e.primary)?.value ?? person.email?.[0]?.value;
  const orgName =
    typeof person.org_id === "object" && person.org_id ? person.org_id.name : undefined;
  return {
    externalId: String(person.id),
    email: primaryEmail,
    firstName,
    lastName,
    company: orgName,
    tags: [],
  };
}

export function leadToPipedrivePerson(lead: CrmLead): Record<string, unknown> {
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Unknown";
  const body: Record<string, unknown> = { name };
  if (lead.email) {
    body.email = [{ value: lead.email, primary: true }];
  }
  return body;
}

async function findPersonByEmail(
  client: ReturnType<typeof pipedriveClient>,
  email: string
): Promise<PipedrivePerson | null> {
  const res = await client.request<
    PipedriveEnvelope<{ items: Array<{ item: PipedrivePerson }> }>
  >({
    method: "GET",
    path: "/persons/search",
    query: { term: email, fields: "email", exact_match: "true" },
  });
  const items = unwrap(res, "person search").items ?? [];
  return items[0]?.item ?? null;
}

export function createPipedriveAdapter(): CrmAdapter {
  const provider = "pipedrive";
  const adapter: CrmAdapter = {
    provider,

    async testConnection(credential): Promise<CrmTestResult> {
      try {
        const client = pipedriveClient(credential);
        const res = await client.request<PipedriveEnvelope<{ name?: string }>>({
          method: "GET",
          path: "/users/me",
        });
        const me = unwrap(res, "connect test");
        return {
          ok: true,
          detail: `Pipedrive reachable${me.name ? ` as ${me.name}` : ""}.`,
        };
      } catch (err) {
        return { ok: false, detail: toProviderError(err).message };
      }
    },

    async importContacts(credential, opts): Promise<CrmLead[]> {
      const client = pipedriveClient(credential);
      const limit = Math.min(opts?.limit ?? 100, 100);
      const leads: CrmLead[] = [];
      let start = 0;
      let more = true;
      while (more && leads.length < (opts?.limit ?? 100)) {
        const res = await client.request<
          PipedriveEnvelope<PipedrivePerson[]> & {
            additional_data?: { pagination?: { more_items_in_collection?: boolean; next_start?: number } };
          }
        >({
          method: "GET",
          path: "/persons",
          query: { limit: String(limit), start: String(start) },
        });
        const persons = unwrap(res, "person list");
        for (const person of persons) leads.push(pipedrivePersonToLead(person));
        const pagination = res.additional_data?.pagination;
        more = pagination?.more_items_in_collection ?? false;
        start = pagination?.next_start ?? start + limit;
      }
      return leads.slice(0, opts?.limit ?? leads.length);
    },

    async exportLead(credential, lead) {
      const client = pipedriveClient(credential);
      if (lead.email) {
        const existing = await findPersonByEmail(client, lead.email);
        if (existing) {
          await client.request({
            method: "PUT",
            path: `/persons/${existing.id}`,
            body: leadToPipedrivePerson(lead),
          });
          return { externalId: String(existing.id), created: false };
        }
      }
      const res = await client.request<PipedriveEnvelope<PipedrivePerson>>({
        method: "POST",
        path: "/persons",
        body: leadToPipedrivePerson(lead),
      });
      const created = unwrap(res, "person create");
      return { externalId: String(created.id), created: true };
    },

    async syncLeadStatus() {
      throw configReadyError(
        "pipedrive",
        "status sync",
        "Pipedrive persons have no status field; deal-stage sync is a follow-up."
      );
    },

    async syncTags() {
      throw configReadyError(
        "pipedrive",
        "tag sync",
        "Pipedrive persons have no native tag field."
      );
    },

    async syncNote(credential, externalId, note: CrmNote) {
      const client = pipedriveClient(credential);
      await client.request({
        method: "POST",
        path: "/notes",
        body: { content: note.body, person_id: Number(externalId) },
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

/**
 * Note-type activity with the person as primary participant.
 * Standalone (not on CrmAdapter) because activity logging is
 * provider-specific, not part of the shared contract.
 */
export async function createPipedriveActivityNote(
  credential: ProviderCredential,
  externalId: string,
  subject: string,
  note: string
): Promise<void> {
  const client = pipedriveClient(credential);
  await client.request({
    method: "POST",
    path: "/activities",
    body: {
      subject,
      type: "note",
      note,
      participants: [{ person_id: Number(externalId), primary: true }],
    },
  });
}
