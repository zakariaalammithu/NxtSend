/**
 * Instantly adapter — email outreach provider.
 *
 * Base URL https://api.instantly.ai/api/v2 and Bearer v2-key auth verified against https://developer.instantly.ai/ (Introduction; API v1 deprecated 2026-01-19, v2 keys only).
 * GET /workspaces/current, GET /campaigns, POST /campaigns, POST /leads, POST /leads/add (up to 1,000 leads, campaign_id or list_id, idempotency_key) and GET /leads/list verified against the official API reference.
 * Lead objects in POST /leads/add must contain an email; first_name / last_name / company / custom_variables are the lead-model fields used by the adapter.
 *
 * All provider HTTP goes through ProviderHttpClient (10s timeout,
 * retries only 429/502/503/504, secrets redacted). No live calls happen
 * without a stored credential; tests use a mocked global fetch only.
 * Suppression is fail-closed: sending without a suppression checker
 * throws, and a suppressed lead is never sent. No LinkedIn send/accept
 * anywhere — the LinkedIn URL is only an identity key carried in the
 * lead mapping (see buildIdentityMap in ../common).
 */

import type { Lead } from "@/types";
import type { ProviderCredential } from "../../connections";
import type { SyncJobStore } from "../../sync";
import type { SyncResult } from "../../types";
import {
  asString,
  authQueryParam,
  buildIdentityMap,
  buildOutreachClient,
  configReadyError,
  findCampaignById,
  findEmailByLinkedInUrl,
  mapLeadToContact,
  qualifyLeads,
  readListBody,
  runExportSyncJob,
  type BounceSyncResult,
  type OutreachAuthKind,
  type OutreachReply,
  type ProviderCampaign,
  type ProviderCampaignStatus,
  type SuppressionChecker,
} from "../common";
import { INSTANTLY_CONFIG } from "./config";

export { buildIdentityMap, findEmailByLinkedInUrl, mapLeadToContact };
export const mapLeadToProviderContact = mapLeadToContact;

export interface SendLeadsInput {
  campaignId: string;
  leads: Lead[];
}

export interface InstantlyAdapterDeps {
  credential: ProviderCredential;
  /** Override for the provider base URL (per-instance hosts: EmailBison, Master Inbox). */
  baseUrl?: string;
  /** Required for any send. Without it, sending throws (fail closed). */
  isSuppressed?: SuppressionChecker;
  /** Called for each address the provider reports as bounced / unsubscribed. */
  onSuppressed?: (email: string, reason: string) => Promise<void>;
  syncStore?: SyncJobStore;
  workspaceId?: string;
}

export interface InstantlyAdapter {
  readonly providerId: string;
  testConnection(): Promise<{ ok: boolean; detail: string }>;
  listCampaigns(): Promise<ProviderCampaign[]>;
  sendLeadsToEmailCampaign(input: SendLeadsInput): Promise<SyncResult>;
  syncCampaignStatus(campaignId: string): Promise<ProviderCampaignStatus>;
  syncReplies(input?: { campaignId?: string }): Promise<OutreachReply[]>;
  syncBouncesAndUnsubscribes(input?: { campaignId?: string }): Promise<BounceSyncResult>;
}

type RequestOpts = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, string>;
  body?: unknown;
};

function parseCampaigns(body: unknown): ProviderCampaign[] {
  return readListBody(body)
    .map((r) => ({
      id: asString(r.id ?? r._id ?? r.campaign_id ?? r.campaignId ?? r.campaignID),
      name: asString(r.name ?? r.title ?? ""),
      status: asString(r.status ?? "unknown"),
    }))
    .filter((c) => c.id !== "");
}

export function createInstantlyAdapter(deps: InstantlyAdapterDeps): InstantlyAdapter {
  const baseUrl = deps.baseUrl ?? INSTANTLY_CONFIG.baseUrl;
  const authKind = INSTANTLY_CONFIG.authKind as OutreachAuthKind;
  const client = buildOutreachClient(baseUrl, authKind, deps.credential);
  const authQuery = authQueryParam(authKind, deps.credential);

  async function request<T>(opts: RequestOpts): Promise<T> {
    return client.request<T>({
      ...opts,
      query: { ...authQuery, ...(opts.query ?? {}) },
    });
  }

  async function testConnection(): Promise<{ ok: boolean; detail: string }> {
    try {
      await request<unknown>({ method: "GET", path: "/workspaces/current" });
      return {
        ok: true,
        detail: "Instantly credentials verified (GET /workspaces/current returned 2xx).",
      };
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? err.message : "Connection test failed.",
      };
    }
  }

  async function listCampaigns(): Promise<ProviderCampaign[]> {
    const body = await request<unknown>({
      method: "GET",
      path: "/campaigns",
    });
    return parseCampaigns(body);
  }

  async function sendLeadsToEmailCampaign(input: SendLeadsInput): Promise<SyncResult> {
    if (!deps.isSuppressed) {
      throw new Error(
        "[instantly] Refusing to send: no suppression checker was provided (fail closed). Pass isSuppressed wrapping checkSuppression to send leads."
      );
    }
    const { result: qualified, checkErrors } = await qualifyLeads(input.leads, deps.isSuppressed);
    const skipped =
      qualified.suppressed.length + qualified.noEmail.length + qualified.duplicates.length;
    return runExportSyncJob(
      { store: deps.syncStore, workspaceId: deps.workspaceId, provider: "instantly" },
      async () => {
    const errors: string[] = [];
    let created = 0;
    const CHUNK = 1000;
    for (let i = 0; i < qualified.qualified.length; i += CHUNK) {
      const batch = qualified.qualified.slice(i, i + CHUNK);
      const body = {
        campaign_id: input.campaignId,
        leads: batch.map((lead) => {
          const c = mapLeadToContact(lead);
          return {
            email: c.email,
            first_name: c.firstName,
            last_name: c.lastName,
            company: c.company,
            custom_variables: { linkedin_url: c.linkedinUrl, job_title: c.jobTitle },
          };
        }),
        // A retry with the same key and the same leads does not insert
        // them again; a new batch gets a new key.
        idempotency_key: `nxtsend-${input.campaignId}-${Date.now()}-${i}`,
      };
      try {
        const res = await request<{ created_leads?: unknown[]; leads_uploaded?: number }>({
          method: "POST",
          path: "/leads/add",
          body,
        });
        if (Array.isArray(res?.created_leads)) created += res.created_leads.length;
        else if (typeof res?.leads_uploaded === "number") created += res.leads_uploaded;
        else created += batch.length;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "Add-leads request failed.");
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
  }

  async function syncCampaignStatus(campaignId: string): Promise<ProviderCampaignStatus> {
    const campaigns = await listCampaigns();
    const found = findCampaignById(campaigns, campaignId);
    if (!found) {
      throw new Error(`[instantly] Campaign ${campaignId} was not found in the campaign list.`);
    }
    return found;
  }

  async function syncReplies(_input?: { campaignId?: string }): Promise<OutreachReply[]> {
    void _input;
    throw configReadyError("instantly", "sync replies", "no Instantly reply-read endpoint was verified against developer.instantly.ai (checked 2026-11-19).");
  }

  async function syncBouncesAndUnsubscribes(input?: {
    campaignId?: string;
  }): Promise<BounceSyncResult> {
    void input;
    throw configReadyError("instantly", "sync bounced / unsubscribed", "no Instantly bounce or unsubscribe endpoint was verified against developer.instantly.ai (checked 2026-11-19).");
  }

  return {
    providerId: "instantly",
    testConnection,
    listCampaigns,
    sendLeadsToEmailCampaign,
    syncCampaignStatus,
    syncReplies,
    syncBouncesAndUnsubscribes,
  };
}

/**
 * Multichannel workflow hook: send qualified NxtSend leads to an
 * Instantly email campaign. NOT wired into live campaign execution —
 * the campaign system calls this only when the operator has configured
 * this provider and chosen a campaign. No automatic sends.
 */
export async function sendLeadsToEmailCampaign(
  deps: InstantlyAdapterDeps,
  input: SendLeadsInput
): Promise<SyncResult> {
  return createInstantlyAdapter(deps).sendLeadsToEmailCampaign(input);
}
