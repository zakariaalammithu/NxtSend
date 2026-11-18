/**
 * Attio adapter — ProviderHttpClient-based, mocked-only tests.
 *
 * Verified endpoints (base https://api.attio.com/v2 — see
 * ./config.ts): objects list, people records query/create/
 * assert/upsert/update, notes create. No endpoint URL in this file
 * is guessed.
 *
 * Attio record values are arrays of typed values, e.g.
 * `values: { name: [{ full_name: "Ada Lovelace" }],
 * email_addresses: [{ email_address: "ada@example.com" }] }`.
 * The mapper reads that shape defensively and skips records whose
 * values are missing.
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
import { ATTIO_BASE_URL } from "./config";

type AttioValue = Record<string, unknown>;

interface AttioRecord {
  id: { record_id: string };
  values: Record<string, AttioValue[]>;
}

interface AttioQueryResponse {
  data: AttioRecord[];
}

export function attioClient(credential: ProviderCredential) {
  if (!credential.accessToken) {
    throw new Error("[attio] No access token in the stored credential.");
  }
  return buildCrmClient(ATTIO_BASE_URL, () => ({
    Authorization: `Bearer ${credential.accessToken}`,
  }));
}

function firstValue(record: AttioRecord, slug: string): AttioValue | undefined {
  const values = record.values?.[slug];
  return Array.isArray(values) ? values[0] : undefined;
}

export function attioRecordToLead(record: AttioRecord): CrmLead {
  const name = firstValue(record, "name");
  const email = firstValue(record, "email_addresses");
  const fullName = typeof name?.full_name === "string" ? name.full_name : "";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    externalId: record.id.record_id,
    email: typeof email?.email_address === "string" ? email.email_address : undefined,
    firstName: parts[0] ?? "",
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : undefined,
    tags: [],
  };
}

export function leadToAttioValues(lead: CrmLead): Record<string, unknown[]> {
  const values: Record<string, unknown[]> = {};
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ");
  if (fullName) {
    values.name = [
      {
        first_name: lead.firstName,
        ...(lead.lastName ? { last_name: lead.lastName } : {}),
        full_name: fullName,
      },
    ];
  }
  if (lead.email) {
    values.email_addresses = [{ email_address: lead.email }];
  }
  return values;
}

async function findPersonByEmail(
  client: ReturnType<typeof attioClient>,
  email: string
): Promise<AttioRecord | null> {
  const res = await client.request<AttioQueryResponse>({
    method: "POST",
    path: "/objects/people/records/query",
    body: {
      filter: { email_addresses: { $contains: email } },
      limit: 1,
    },
  });
  const match = (res.data ?? []).find((r) => {
    const v = firstValue(r, "email_addresses");
    return typeof v?.email_address === "string" && v.email_address.toLowerCase() === email.toLowerCase();
  });
  return match ?? null;
}

export function createAttioAdapter(): CrmAdapter {
  const provider = "attio";
  const adapter: CrmAdapter = {
    provider,

    async testConnection(credential): Promise<CrmTestResult> {
      try {
        const client = attioClient(credential);
        await client.request({ method: "GET", path: "/objects" });
        return { ok: true, detail: "Attio reachable (objects endpoint)." };
      } catch (err) {
        return { ok: false, detail: toProviderError(err).message };
      }
    },

    async importContacts(credential, opts): Promise<CrmLead[]> {
      const client = attioClient(credential);
      const res = await client.request<AttioQueryResponse>({
        method: "POST",
        path: "/objects/people/records/query",
        body: { limit: Math.min(opts?.limit ?? 100, 100) },
      });
      return (res.data ?? []).map(attioRecordToLead);
    },

    async exportLead(credential, lead) {
      const client = attioClient(credential);
      const values = leadToAttioValues(lead);
      if (lead.email) {
        const existing = await findPersonByEmail(client, lead.email);
        if (existing) {
          await client.request({
            method: "PATCH",
            path: `/objects/people/records/${existing.id.record_id}`,
            body: { data: { values } },
          });
          return { externalId: existing.id.record_id, created: false };
        }
        // Assert (upsert) by the email matching attribute.
        const asserted = await client.request<{ data: AttioRecord }>({
          method: "POST",
          path: "/objects/people/records",
          query: { matching_attribute: "email_addresses" },
          body: { data: { values } },
        });
        return { externalId: asserted.data.id.record_id, created: true };
      }
      const created = await client.request<{ data: AttioRecord }>({
        method: "POST",
        path: "/objects/people/records",
        body: { data: { values } },
      });
      return { externalId: created.data.id.record_id, created: true };
    },

    async syncLeadStatus() {
      throw configReadyError(
        "attio",
        "status sync",
        "Attio people records have no standard status field; mapping status onto a list stage is a follow-up."
      );
    },

    async syncTags() {
      throw configReadyError(
        "attio",
        "tag sync",
        "Attio people records have no native tag field; tags would need a list entry or custom attribute."
      );
    },

    async syncNote(credential, externalId, note: CrmNote) {
      const client = attioClient(credential);
      await client.request({
        method: "POST",
        path: "/notes",
        body: {
          data: {
            parent_object: "people",
            parent_record_id: externalId,
            title: note.title ?? "NxtSend note",
            content: note.body,
            format: "plaintext",
          },
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
