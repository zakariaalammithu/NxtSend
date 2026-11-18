/**
 * SmartReach adapter — email outreach provider.
 *
 * Base URL https://api.smartreach.io/api/v1 and X-API-KEY header auth verified against the SmartReach API docs (via dltHub's API reference summary) and the Make help page (Team Settings > Integrations > SmartReach API Key).
 * GET /campaigns, GET /campaigns/{id}, GET /prospects, POST /prospects and GET /prospects/{id} verified against the same reference.
 * Assign-prospect-to-campaign-by-email and add-email/domain-to-DNC are documented only as integration actions (Make / Ibexa); their REST paths were not verified, so they are config-ready.
 * The prospect-create request body field names were not verified against the official reference — confirm them at the SmartReach API docs before the first live send.
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
import { SMARTREACH_CONFIG } from "./config";

export { buildIdentityMap, findEmailByLinkedInUrl, mapLeadToContact };
export const mapLeadToProviderContact = mapLeadToContact;

export interface SendLeadsInput {
  campaignId: string;
  leads: Lead[];
}

export interface SmartReachAdapterDeps {
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

export interface SmartReachAdapter {
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
  const rec = (body ?? {}) as Record<string, unknown>;
  const data = rec.data as Record<string, unknown> | undefined;
  const nested =
    data && Array.isArray(data.campaigns)
      ? (data.campaigns as Record<string, unknown>[])
      : null;
  const rows = nested ?? readListBody(body);
  return rows
    .map((r) => ({
      id: asString(r.id ?? r._id ?? r.campaign_id ?? r.campaignId ?? r.campaignID),
      name: asString(r.name ?? r.title ?? ""),
      status: asString(r.status ?? "unknown"),
    }))
    .filter((c) => c.id !== "");
}

export function createSmartReachAdapter(deps: SmartReachAdapterDeps): SmartReachAdapter {
  const baseUrl = deps.baseUrl ?? SMARTREACH_CONFIG.baseUrl;
  const authKind = SMARTREACH_CONFIG.authKind as OutreachAuthKind;
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
      await request<unknown>({ method: "GET", path: "/campaigns" });
      return {
        ok: true,
        detail: "SmartReach credentials verified (GET /campaigns returned 2xx).",
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
        "[smartreach] Refusing to send: no suppression checker was provided (fail closed). Pass isSuppressed wrapping checkSuppression to send leads."
      );
    }
    const { result: qualified, checkErrors } = await qualifyLeads(input.leads, deps.isSuppressed);
    const skipped =
      qualified.suppressed.length + qualified.noEmail.length + qualified.duplicates.length;
    return runExportSyncJob(
      { store: deps.syncStore, workspaceId: deps.workspaceId, provider: "smartreach" },
      async () => {
    const errors: string[] = [];
    let created = 0;
    for (const lead of qualified.qualified) {
      const c = mapLeadToContact(lead);
      try {
        // Prospect-create field names were not verified against the
        // official SmartReach reference — confirm before first live send.
        await request<unknown>({
          method: "POST",
          path: "/prospects",
          body: {
            email: c.email,
            first_name: c.firstName,
            last_name: c.lastName,
            company: c.company,
            title: c.jobTitle,
            linkedin_url: c.linkedinUrl,
          },
        });
        created += 1;
      } catch (err) {
        errors.push(
          `${c.email}: ${err instanceof Error ? err.message : "Create-prospect request failed."}`
        );
      }
    }
    if (qualified.qualified.length > 0) {
      // Prospects exist in SmartReach now, but they are NOT in the
      // campaign: the assign-prospect-to-campaign endpoint path was not
      // verified, so the export reports this step as config-ready rather
      // than silently enrolling nobody. The job is marked failed by the
      // error below / the errors list, and the operator assigns the
      // prospects in SmartReach until the endpoint is verified.
      errors.push(
        configReadyError(
          "smartreach",
          "assign prospects to campaign",
          "prospects were created but the assign-to-campaign endpoint path was not verified, so no prospect was enrolled."
        ).message
      );
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
      throw new Error(`[smartreach] Campaign ${campaignId} was not found in the campaign list.`);
    }
    return found;
  }

  async function syncReplies(_input?: { campaignId?: string }): Promise<OutreachReply[]> {
    void _input;
    throw configReadyError("smartreach", "sync replies", "no SmartReach reply endpoint was verified (checked 2026-11-19).");
  }

  async function syncBouncesAndUnsubscribes(input?: {
    campaignId?: string;
  }): Promise<BounceSyncResult> {
    void input;
    throw configReadyError("smartreach", "sync bounced / unsubscribed", "no SmartReach bounce / unsubscribe status endpoint was verified (checked 2026-11-19).");
  }

  return {
    providerId: "smartreach",
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
 * SmartReach email campaign. NOT wired into live campaign execution —
 * the campaign system calls this only when the operator has configured
 * this provider and chosen a campaign. No automatic sends.
 */
export async function sendLeadsToEmailCampaign(
  deps: SmartReachAdapterDeps,
  input: SendLeadsInput
): Promise<SyncResult> {
  return createSmartReachAdapter(deps).sendLeadsToEmailCampaign(input);
}
