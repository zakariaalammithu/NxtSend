/**
 * HotHawk adapter — cold-email outreach (campaigns + CRM leads).
 *
 * Verified endpoints (base https://api.hothawk.ai/v1, see ./config.ts):
 * GET /v1/workspaces, GET /v1/campaigns, GET /v1/campaigns/{id}/leads,
 * GET /v1/crm/leads, POST /v1/crm/leads, PATCH /v1/crm/leads/{id},
 * POST /v1/crm/leads/import, GET /v1/crm/lists.
 *
 * Campaign enrolment (POST /v1/campaigns/{id}/leads) is CONFIG-READY
 * only: the path is verified on the developers page, but its request
 * body was NOT confirmed against the official OpenAPI spec in this
 * pass, so no call is made — enrolLeadsIntoCampaign throws a
 * config-ready error. Importing leads into the CRM (the
 * sendLeadsToEmailCampaign path) uses the verified
 * POST /v1/crm/leads/import endpoint instead.
 *
 * No LinkedIn send/accept anywhere: HotHawk's /linkedin/* endpoints
 * are deliberately not wired. Sending is fail-closed on suppression:
 * without a SuppressionChecker, sending throws.
 */

import type { Lead } from "@/types";
import { ProviderHttpClient, toProviderError } from "../../client";
import type { ProviderCredential } from "../../connections";
import type { SyncJobStore } from "../../sync";
import type { SyncResult } from "../../types";
import {
  buildOutreachClient,
  configReadyError,
  mapLeadToContact,
  qualifyLeads,
  readListBody,
  runExportSyncJob,
  type ProviderCampaign,
  type SuppressionChecker,
} from "../../email-outreach/common";
import { cleanStr } from "../types";
import { HOTHAWK_CONFIG } from "./config";

type JsonRecord = Record<string, unknown>;

export interface HotHawkAdapterDeps {
  credential: ProviderCredential;
  /** Required for create/import calls (HotHawk requires workspaceId in the body). */
  workspaceId?: string;
  /** Required for any send. Without it, sending throws (fail closed). */
  isSuppressed?: SuppressionChecker;
  syncStore?: SyncJobStore;
  /** Test override: a pre-built client (used by the mock-tested suite). */
  client?: ProviderHttpClient;
}

export interface HotHawkLead {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  linkedinProfileUrl?: string;
  jobTitle?: string;
  phoneNumber?: string;
  company?: string;
  campaignStatus?: string;
}

export interface HotHawkAdapter {
  readonly providerId: string;
  testConnection(): Promise<{ ok: boolean; detail: string }>;
  listCampaigns(opts?: { page?: number; take?: number }): Promise<ProviderCampaign[]>;
  listCampaignLeads(
    campaignId: string,
    opts?: { page?: number; take?: number }
  ): Promise<HotHawkLead[]>;
  listLeads(opts?: { page?: number; take?: number }): Promise<HotHawkLead[]>;
  createLead(input: {
    email: string;
    firstName?: string;
    lastName?: string;
    jobTitle?: string;
    linkedinProfileUrl?: string;
    phoneNumber?: string;
  }): Promise<HotHawkLead>;
  updateLead(leadId: string, input: Partial<HotHawkLead>): Promise<HotHawkLead>;
  sendLeadsToEmailCampaign(input: {
    campaignId: string;
    leads: Lead[];
    listId?: string;
  }): Promise<SyncResult>;
  /** Config-ready only: POST /v1/campaigns/{id}/leads body unverified. */
  enrolLeadsIntoCampaign(campaignId: string, leadIds: string[]): Promise<never>;
  listLists(opts?: { page?: number; take?: number }): Promise<{ id: string; name: string }[]>;
}

function mapLeadRow(row: JsonRecord): HotHawkLead {
  const firstName = cleanStr(row.firstName);
  const lastName = cleanStr(row.lastName);
  const company =
    typeof row.company === "object" && row.company !== null
      ? cleanStr((row.company as JsonRecord).name)
      : cleanStr(row.company);
  return {
    id: cleanStr(row.id) ?? "",
    firstName,
    lastName,
    email: cleanStr(row.email),
    linkedinProfileUrl: cleanStr(row.linkedinProfileUrl),
    jobTitle: cleanStr(row.jobTitle),
    phoneNumber: cleanStr(row.phoneNumber),
    company,
    campaignStatus: cleanStr(row.campaignStatus),
  };
}

export function createHotHawkAdapter(deps: HotHawkAdapterDeps): HotHawkAdapter {
  const apiKey = deps.credential.apiKey ?? deps.credential.accessToken;
  if (!apiKey) {
    throw new Error(
      "[hothawk] HotHawk API key is required (store it encrypted in integration_connections)."
    );
  }
  const client =
    deps.client ?? buildOutreachClient(HOTHAWK_CONFIG.baseUrl, "bearer", deps.credential);

  async function request<T>(opts: {
    method: "GET" | "POST" | "PATCH";
    path: string;
    query?: Record<string, string>;
    body?: unknown;
  }): Promise<T> {
    return client.request<T>(opts);
  }

  function pageQuery(opts?: { page?: number; take?: number }): Record<string, string> {
    return {
      page: String(opts?.page ?? 1),
      take: String(Math.min(opts?.take ?? 25, HOTHAWK_CONFIG.maxTake)),
    };
  }

  function requireWorkspaceId(): string {
    if (!deps.workspaceId) {
      throw configReadyError(
        "hothawk",
        "create/import lead",
        "a HotHawk workspaceId is required (set it on the connection); the API key alone does not select a workspace."
      );
    }
    return deps.workspaceId;
  }

  const adapter: HotHawkAdapter = {
    providerId: "hothawk",

    async testConnection() {
      try {
        await request<unknown>({ method: "GET", path: "/workspaces" });
        return {
          ok: true,
          detail: "HotHawk credentials verified (GET /v1/workspaces returned 2xx).",
        };
      } catch (err) {
        return { ok: false, detail: toProviderError(err).message };
      }
    },

    async listCampaigns(opts) {
      const body = await request<unknown>({
        method: "GET",
        path: "/campaigns",
        query: pageQuery(opts),
      });
      return readListBody(body)
        .map((r) => ({
          id: cleanStr(r.id) ?? "",
          name: cleanStr(r.name) ?? "",
          status: cleanStr(r.status) ?? "unknown",
        }))
        .filter((c) => c.id !== "");
    },

    async listCampaignLeads(campaignId, opts) {
      const body = await request<unknown>({
        method: "GET",
        path: `/campaigns/${campaignId}/leads`,
        query: pageQuery(opts),
      });
      return readListBody(body).map(mapLeadRow).filter((l) => l.id !== "");
    },

    async listLeads(opts) {
      const body = await request<unknown>({
        method: "GET",
        path: "/crm/leads",
        query: { workspaceId: deps.workspaceId ?? "", ...pageQuery(opts) },
      });
      return readListBody(body).map(mapLeadRow).filter((l) => l.id !== "");
    },

    async createLead(input) {
      const workspaceId = requireWorkspaceId();
      const name = [input.firstName, input.lastName].filter(Boolean).join(" ");
      const res = await request<JsonRecord>({
        method: "POST",
        path: "/crm/leads",
        body: {
          workspaceId,
          email: input.email,
          name,
          ...(input.firstName ? { firstName: input.firstName } : {}),
          ...(input.lastName ? { lastName: input.lastName } : {}),
          ...(input.jobTitle ? { jobTitle: input.jobTitle } : {}),
          ...(input.linkedinProfileUrl
            ? { linkedinProfileUrl: input.linkedinProfileUrl }
            : {}),
          ...(input.phoneNumber ? { phoneNumber: input.phoneNumber } : {}),
        },
      });
      return mapLeadRow(res);
    },

    async updateLead(leadId, input) {
      const res = await request<JsonRecord>({
        method: "PATCH",
        path: `/crm/leads/${leadId}`,
        body: {
          ...(input.firstName ? { firstName: input.firstName } : {}),
          ...(input.lastName ? { lastName: input.lastName } : {}),
          ...(input.email ? { email: input.email } : {}),
          ...(input.linkedinProfileUrl
            ? { linkedinProfileUrl: input.linkedinProfileUrl }
            : {}),
          ...(input.phoneNumber ? { phoneNumber: input.phoneNumber } : {}),
        },
      });
      return mapLeadRow(res);
    },

    async sendLeadsToEmailCampaign(input) {
      if (!deps.isSuppressed) {
        throw new Error(
          "[hothawk] Refusing to send: no suppression checker was provided (fail closed). Pass isSuppressed wrapping checkSuppression to send leads."
        );
      }
      const workspaceId = requireWorkspaceId();
      const { result: qualified, checkErrors } = await qualifyLeads(
        input.leads,
        deps.isSuppressed
      );
      const skipped =
        qualified.suppressed.length +
        qualified.noEmail.length +
        qualified.duplicates.length;
      return runExportSyncJob(
        { store: deps.syncStore, workspaceId: deps.workspaceId, provider: "hothawk" },
        async () => {
          const errors: string[] = [];
          let created = 0;
          const records = qualified.qualified.map((lead) => {
            const c = mapLeadToContact(lead);
            const record: Record<string, string> = {};
            if (c.email) record.email = c.email;
            if (c.firstName) record.firstName = c.firstName;
            if (c.lastName) record.lastName = c.lastName;
            const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
            if (name) record.name = name;
            if (c.jobTitle) record.jobTitle = c.jobTitle;
            if (c.linkedinUrl) record.linkedinProfileUrl = c.linkedinUrl;
            if (c.company) record.companyName = c.company;
            return record;
          });
          const CHUNK = HOTHAWK_CONFIG.maxImportRows;
          for (let i = 0; i < records.length; i += CHUNK) {
            const chunk = records.slice(i, i + CHUNK);
            try {
              await request<unknown>({
                method: "POST",
                path: "/crm/leads/import",
                body: {
                  workspaceId,
                  records: chunk,
                  ...(input.listId ? { listId: input.listId } : {}),
                },
              });
              created += chunk.length;
            } catch (err) {
              errors.push(
                err instanceof Error ? err.message : "Lead import request failed."
              );
            }
          }
          return {
            processed: input.leads.length,
            created,
            updated: 0,
            skipped,
            failed: errors.length + checkErrors.length,
            errors: [...checkErrors, ...errors],
          };
        }
      );
    },

    async enrolLeadsIntoCampaign() {
      throw configReadyError(
        "hothawk",
        "enrol leads into campaign (POST /v1/campaigns/{id}/leads)",
        "the endpoint path is listed on https://hothawk.ai/developers, but its request body was not verified against the official OpenAPI spec — no guessed call is made."
      );
    },

    async listLists(opts) {
      const body = await request<unknown>({
        method: "GET",
        path: "/crm/lists",
        query: pageQuery(opts),
      });
      return readListBody(body)
        .map((r) => ({ id: cleanStr(r.id) ?? "", name: cleanStr(r.name) ?? "" }))
        .filter((l) => l.id !== "");
    },
  };

  return adapter;
}

export {
  buildIdentityMap,
  findEmailByLinkedInUrl,
  mapLeadToContact,
} from "../../email-outreach/common";
