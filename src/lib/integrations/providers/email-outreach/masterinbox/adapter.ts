/**
 * Master Inbox adapter — email outreach provider.
 *
 * Base URL https://api.masterinbox.com verified from the published workflow example (POST https://api.masterinbox.com/api/api-webhook/v1/api/workflows/create-workflow) on masterinbox.com/api.
 * API key creation (Settings > APIs > Create new key; keys are per account, named, revocable) verified against masterinbox.com/api. The Authorization header scheme was NOT verified — the adapter stores the key but makes no live call with it until a read endpoint is confirmed against the public OpenAPI spec.
 * Master Inbox is a unified reply inbox, not a sequencer: it syncs replies from other providers' campaigns. There is no 'send leads to a campaign' operation for this provider by design.
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
  buildIdentityMap,
  configReadyError,
  findEmailByLinkedInUrl,
  mapLeadToContact,
  qualifyLeads,
  runExportSyncJob,
  type BounceSyncResult,
  type OutreachReply,
  type ProviderCampaign,
  type ProviderCampaignStatus,
  type SuppressionChecker,
} from "../common";

export { buildIdentityMap, findEmailByLinkedInUrl, mapLeadToContact };
export const mapLeadToProviderContact = mapLeadToContact;

export interface SendLeadsInput {
  campaignId: string;
  leads: Lead[];
}

export interface MasterInboxAdapterDeps {
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

export interface MasterInboxAdapter {
  readonly providerId: string;
  testConnection(): Promise<{ ok: boolean; detail: string }>;
  listCampaigns(): Promise<ProviderCampaign[]>;
  sendLeadsToEmailCampaign(input: SendLeadsInput): Promise<SyncResult>;
  syncCampaignStatus(campaignId: string): Promise<ProviderCampaignStatus>;
  syncReplies(input?: { campaignId?: string }): Promise<OutreachReply[]>;
  syncBouncesAndUnsubscribes(input?: { campaignId?: string }): Promise<BounceSyncResult>;
}

export function createMasterInboxAdapter(deps: MasterInboxAdapterDeps): MasterInboxAdapter {

  async function testConnection(): Promise<{ ok: boolean; detail: string }> {
    // No read endpoint path has been verified against the public OpenAPI
    // reference, so there is nothing honest to probe yet. Returning
    // ok:false (not throwing) so panels can display the state.
    return {
      ok: false,
      detail:
        "[masterinbox] Connection test is config-ready, not live: no endpoint path has been verified against the public OpenAPI reference (app.masterinbox.com/api-docs.html). Verify a read endpoint first.",
    };
  }

  async function listCampaigns(): Promise<ProviderCampaign[]> {
    throw configReadyError(
      "masterinbox",
      "list campaigns",
      "no campaign-list endpoint path was verified against the provider docs."
    );
  }

  async function sendLeadsToEmailCampaign(input: SendLeadsInput): Promise<SyncResult> {
    if (!deps.isSuppressed) {
      throw new Error(
        "[masterinbox] Refusing to send: no suppression checker was provided (fail closed). Pass isSuppressed wrapping checkSuppression to send leads."
      );
    }
    await qualifyLeads(input.leads, deps.isSuppressed);
    return runExportSyncJob(
      { store: deps.syncStore, workspaceId: deps.workspaceId, provider: "masterinbox" },
      async () => {
    throw configReadyError("masterinbox", "send leads to campaign", "Master Inbox is a unified reply inbox, not a sequencer — there is no send-leads operation for this provider by design.");
      }
    );
  }

  async function syncCampaignStatus(_campaignId: string): Promise<ProviderCampaignStatus> {
    void _campaignId;
    throw configReadyError(
      "masterinbox",
      "sync campaign status",
      "no sequence / campaign-status endpoint path was verified against the provider docs."
    );
  }

  async function syncReplies(_input?: { campaignId?: string }): Promise<OutreachReply[]> {
    void _input;
    throw configReadyError("masterinbox", "sync replies", "no Master Inbox reply endpoint path was verified against the public OpenAPI reference at app.masterinbox.com/api-docs.html (checked 2026-11-19).");
  }

  async function syncBouncesAndUnsubscribes(input?: {
    campaignId?: string;
  }): Promise<BounceSyncResult> {
    void input;
    throw configReadyError("masterinbox", "sync bounced / unsubscribed", "no Master Inbox bounce or unsubscribe endpoint was verified (checked 2026-11-19).");
  }

  return {
    providerId: "masterinbox",
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
 * Master Inbox email campaign. NOT wired into live campaign execution —
 * the campaign system calls this only when the operator has configured
 * this provider and chosen a campaign. No automatic sends.
 */
export async function sendLeadsToEmailCampaign(
  deps: MasterInboxAdapterDeps,
  input: SendLeadsInput
): Promise<SyncResult> {
  return createMasterInboxAdapter(deps).sendLeadsToEmailCampaign(input);
}
