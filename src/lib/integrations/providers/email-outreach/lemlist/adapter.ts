/**
 * Lemlist adapter — email outreach provider.
 *
 * Base URL https://api.lemlist.com/api and HTTP Basic auth (empty username, API key as password — base64 of ':<key>') verified against the Lemlist API reference summary and client libraries.
 * GET /campaigns, GET /campaigns/{campaignId}/leads and POST /campaigns/{campaignId}/leads verified against the same sources; the add-lead example body uses { email, firstName, ... }.
 * The LinkedIn URL is kept in NxtSend's identity map and is NOT pushed as a Lemlist custom field — the field name was not verified.
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
import { LEMLIST_CONFIG } from "./config";

export { buildIdentityMap, findEmailByLinkedInUrl, mapLeadToContact };
export const mapLeadToProviderContact = mapLeadToContact;

export interface SendLeadsInput {
  campaignId: string;
  leads: Lead[];
}

export interface LemlistAdapterDeps {
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

export interface LemlistAdapter {
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

export function createLemlistAdapter(deps: LemlistAdapterDeps): LemlistAdapter {
  const baseUrl = deps.baseUrl ?? LEMLIST_CONFIG.baseUrl;
  const authKind = LEMLIST_CONFIG.authKind as OutreachAuthKind;
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
        detail: "Lemlist credentials verified (GET /campaigns returned 2xx).",
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
        "[lemlist] Refusing to send: no suppression checker was provided (fail closed). Pass isSuppressed wrapping checkSuppression to send leads."
      );
    }
    const { result: qualified, checkErrors } = await qualifyLeads(input.leads, deps.isSuppressed);
    const skipped =
      qualified.suppressed.length + qualified.noEmail.length + qualified.duplicates.length;
    return runExportSyncJob(
      { store: deps.syncStore, workspaceId: deps.workspaceId, provider: "lemlist" },
      async () => {
    const errors: string[] = [];
    let created = 0;
    for (const lead of qualified.qualified) {
      const c = mapLeadToContact(lead);
      try {
        await request<unknown>({
          method: "POST",
          path: `/campaigns/${encodeURIComponent(input.campaignId)}/leads`,
          body: {
            email: c.email,
            firstName: c.firstName,
            lastName: c.lastName,
            companyName: c.company,
          },
        });
        created += 1;
      } catch (err) {
        errors.push(
          `${c.email}: ${err instanceof Error ? err.message : "Add-lead request failed."}`
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
  }

  async function syncCampaignStatus(campaignId: string): Promise<ProviderCampaignStatus> {
    const campaigns = await listCampaigns();
    const found = findCampaignById(campaigns, campaignId);
    if (!found) {
      throw new Error(`[lemlist] Campaign ${campaignId} was not found in the campaign list.`);
    }
    return found;
  }

  async function syncReplies(_input?: { campaignId?: string }): Promise<OutreachReply[]> {
    void _input;
    throw configReadyError("lemlist", "sync replies", "no Lemlist activities endpoint path was verified against developer.lemlist.com (checked 2026-11-19).");
  }

  async function syncBouncesAndUnsubscribes(input?: {
    campaignId?: string;
  }): Promise<BounceSyncResult> {
    void input;
    throw configReadyError("lemlist", "sync bounced / unsubscribed", "no Lemlist unsubscribe-list endpoint path was verified against developer.lemlist.com (checked 2026-11-19).");
  }

  return {
    providerId: "lemlist",
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
 * Lemlist email campaign. NOT wired into live campaign execution —
 * the campaign system calls this only when the operator has configured
 * this provider and chosen a campaign. No automatic sends.
 */
export async function sendLeadsToEmailCampaign(
  deps: LemlistAdapterDeps,
  input: SendLeadsInput
): Promise<SyncResult> {
  return createLemlistAdapter(deps).sendLeadsToEmailCampaign(input);
}
