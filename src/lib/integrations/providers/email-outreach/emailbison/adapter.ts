/**
 * EmailBison adapter — email outreach provider.
 *
 * Base URL https://dedi.emailbison.com and Bearer-token auth verified against the public OpenAPI reference (dedi.emailbison.com/api/reference): GET /api/users with 'Authorization: Bearer <token>'.
 * EmailBison is privately hosted: each account signs in at its own instance URL, so the base URL is overridable (EMAILBISON_BASE_URL) — confirm the workspace host before wiring a client.
 * Token creation (Settings > Developer API > New API Token, scoped to its workspace) verified against the developer page; the token authenticates only to the workspace where it was created.
 * Lead add / attach: the low-code docs describe adding a lead, then attaching leads to a campaign with {campaign_id} and a lead_ids array — but the literal endpoint paths were not present in the fetched reference text, so both operations are config-ready stubs. Do not guess the paths.
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
  authQueryParam,
  buildIdentityMap,
  buildOutreachClient,
  configReadyError,
  findEmailByLinkedInUrl,
  mapLeadToContact,
  qualifyLeads,
  runExportSyncJob,
  type BounceSyncResult,
  type OutreachAuthKind,
  type OutreachReply,
  type ProviderCampaign,
  type ProviderCampaignStatus,
  type SuppressionChecker,
} from "../common";
import { EMAILBISON_CONFIG } from "./config";

export { buildIdentityMap, findEmailByLinkedInUrl, mapLeadToContact };
export const mapLeadToProviderContact = mapLeadToContact;

export interface SendLeadsInput {
  campaignId: string;
  leads: Lead[];
}

export interface EmailBisonAdapterDeps {
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

export interface EmailBisonAdapter {
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

export function createEmailBisonAdapter(deps: EmailBisonAdapterDeps): EmailBisonAdapter {
  const baseUrl = deps.baseUrl ?? EMAILBISON_CONFIG.baseUrl;
  const authKind = EMAILBISON_CONFIG.authKind as OutreachAuthKind;
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
      await request<unknown>({ method: "GET", path: "/api/users" });
      return {
        ok: true,
        detail: "EmailBison credentials verified (GET /api/users returned 2xx).",
      };
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? err.message : "Connection test failed.",
      };
    }
  }

  async function listCampaigns(): Promise<ProviderCampaign[]> {
    throw configReadyError(
      "emailbison",
      "list campaigns",
      "no campaign-list endpoint path was verified against the provider docs."
    );
  }

  async function sendLeadsToEmailCampaign(input: SendLeadsInput): Promise<SyncResult> {
    if (!deps.isSuppressed) {
      throw new Error(
        "[emailbison] Refusing to send: no suppression checker was provided (fail closed). Pass isSuppressed wrapping checkSuppression to send leads."
      );
    }
    await qualifyLeads(input.leads, deps.isSuppressed);
    return runExportSyncJob(
      { store: deps.syncStore, workspaceId: deps.workspaceId, provider: "emailbison" },
      async () => {
    throw configReadyError("emailbison", "send leads to campaign", "the lead add / attach endpoint paths were not verified against docs.emailbison.com (the docs describe a leads endpoint plus an attach-to-campaign endpoint taking {campaign_id} and lead_ids, but the literal paths were not in the fetched reference text).");
      }
    );
  }

  async function syncCampaignStatus(_campaignId: string): Promise<ProviderCampaignStatus> {
    void _campaignId;
    throw configReadyError(
      "emailbison",
      "sync campaign status",
      "no sequence / campaign-status endpoint path was verified against the provider docs."
    );
  }

  async function syncReplies(_input?: { campaignId?: string }): Promise<OutreachReply[]> {
    void _input;
    throw configReadyError("emailbison", "sync replies", "no EmailBison reply endpoint was verified against docs.emailbison.com (checked 2026-11-19).");
  }

  async function syncBouncesAndUnsubscribes(input?: {
    campaignId?: string;
  }): Promise<BounceSyncResult> {
    void input;
    throw configReadyError("emailbison", "sync bounced / unsubscribed", "no EmailBison bounce or unsubscribe endpoint was verified against docs.emailbison.com (checked 2026-11-19).");
  }

  return {
    providerId: "emailbison",
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
 * EmailBison email campaign. NOT wired into live campaign execution —
 * the campaign system calls this only when the operator has configured
 * this provider and chosen a campaign. No automatic sends.
 */
export async function sendLeadsToEmailCampaign(
  deps: EmailBisonAdapterDeps,
  input: SendLeadsInput
): Promise<SyncResult> {
  return createEmailBisonAdapter(deps).sendLeadsToEmailCampaign(input);
}
