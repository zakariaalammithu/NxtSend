/**
 * Shared test helpers for the CRM adapters — mocked fetch only, no
 * real network, no database. Sets a throwaway TOKEN_ENCRYPTION_KEY
 * for the process env so the in-memory connection store can
 * encrypt/decrypt credentials like production does.
 */

import { randomBytes } from "crypto";
import { vi } from "vitest";
import {
  createMemoryProviderConnectionStore,
  upsertProviderConnection,
  type ProviderConnectionStore,
  type ProviderCredential,
} from "../../connections";
import { createMemorySyncJobStore, type SyncJobStore } from "../../sync";
import type { LeadsRepository, CreateLeadInput } from "@/lib/data/leads";
import type { ProviderAuthType } from "../../types";
import type { Lead } from "@/types";
import type { CrmAdapterDeps } from "../shared";

const PREVIOUS_KEY = process.env.TOKEN_ENCRYPTION_KEY;

export function setTestEncryptionKey(): void {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
}

export function restoreEncryptionKey(): void {
  if (PREVIOUS_KEY === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
  else process.env.TOKEN_ENCRYPTION_KEY = PREVIOUS_KEY;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function errorResponse(status: number, body: unknown = { error: "boom" }): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Stubs global fetch with a handler; returns the spy. */
export function mockFetch(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>
): ReturnType<typeof vi.fn> {
  const spy = vi.fn(async (url: string, init: RequestInit) => handler(url, init));
  vi.stubGlobal("fetch", spy);
  return spy;
}

export function fetchCalls(spy: ReturnType<typeof vi.fn>): Array<[string, RequestInit]> {
  return spy.mock.calls as unknown as Array<[string, RequestInit]>;
}

/** Minimal in-memory LeadsRepository for adapter runImport/runExport tests. */
export function createFakeLeadsRepo(): LeadsRepository & { leads: Lead[] } {
  const leads: Lead[] = [];
  let counter = 0;
  const repo: LeadsRepository & { leads: Lead[] } = {
    leads,
    mode: "demo",
    async listLeads() {
      return [...leads];
    },
    async createLead(workspaceId, input: CreateLeadInput) {
      counter += 1;
      const lead: Lead = {
        id: `lead_${counter}`,
        workspace_id: workspaceId,
        first_name: input.first_name,
        last_name: input.last_name,
        email: input.email,
        company: input.company,
        job_title: input.job_title,
        linkedin_url: input.linkedin_url,
        status: input.status ?? "new",
        tags: input.tags ?? [],
        custom_fields: {},
        created_at: new Date().toISOString(),
      };
      leads.push(lead);
      return lead;
    },
    async updateLead(id, patch) {
      const lead = leads.find((l) => l.id === id);
      if (!lead) throw new Error(`lead ${id} not found`);
      Object.assign(lead, patch);
      return lead;
    },
    async deleteLead(id) {
      const idx = leads.findIndex((l) => l.id === id);
      if (idx >= 0) leads.splice(idx, 1);
    },
    async deleteLeads(ids) {
      for (const id of ids) await repo.deleteLead(id);
    },
    async importLeads(workspaceId, inputs) {
      const created: Lead[] = [];
      for (const input of inputs) created.push(await repo.createLead(workspaceId, input));
      return created;
    },
    async listTags() {
      return Array.from(new Set(leads.flatMap((l) => l.tags)));
    },
    async renameTag(_workspaceId, from, to) {
      let changed = 0;
      for (const lead of leads) {
        if (lead.tags.includes(from)) {
          lead.tags = lead.tags.map((t) => (t === from ? to : t));
          changed += 1;
        }
      }
      return changed;
    },
    async deleteTag(_workspaceId, tag) {
      let changed = 0;
      for (const lead of leads) {
        if (lead.tags.includes(tag)) {
          lead.tags = lead.tags.filter((t) => t !== tag);
          changed += 1;
        }
      }
      return changed;
    },
    async applyTag(_workspaceId, leadIds, tag) {
      let changed = 0;
      for (const lead of leads) {
        if (leadIds.includes(lead.id) && !lead.tags.includes(tag)) {
          lead.tags.push(tag);
          changed += 1;
        }
      }
      return changed;
    },
    async removeTag(_workspaceId, leadIds, tag) {
      let changed = 0;
      for (const lead of leads) {
        if (leadIds.includes(lead.id) && lead.tags.includes(tag)) {
          lead.tags = lead.tags.filter((t) => t !== tag);
          changed += 1;
        }
      }
      return changed;
    },
  };
  return repo;
}

export interface TestDeps {
  deps: CrmAdapterDeps;
  connectionStore: ProviderConnectionStore;
  syncJobStore: SyncJobStore;
  leadsRepo: LeadsRepository & { leads: Lead[] };
}

export async function seedTestDeps(
  provider: string,
  authType: ProviderAuthType,
  credential: ProviderCredential
): Promise<TestDeps> {
  const connectionStore = createMemoryProviderConnectionStore();
  const syncJobStore = createMemorySyncJobStore();
  const leadsRepo = createFakeLeadsRepo();
  await upsertProviderConnection(connectionStore, {
    workspaceId: "ws_test",
    provider,
    authType,
    credentials: credential,
  });
  return {
    deps: {
      workspaceId: "ws_test",
      connectionStore,
      syncJobStore,
      leadsRepo,
    },
    connectionStore,
    syncJobStore,
    leadsRepo,
  };
}
