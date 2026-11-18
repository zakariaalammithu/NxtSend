/**
 * Smartlead adapter — email outreach provider.
 *
 * Base URL https://server.smartlead.ai/api/v1 and api_key query-parameter auth verified against https://api.smartlead.ai/ (getting-started guide) and the Smartlead help center: 'The key must be sent in the URL. A key sent in a request header is not accepted.' There is no OAuth or Bearer option.
 * POST /campaigns/{id}/leads body { lead_list: [{ email, first_name, last_name, company_name, custom_fields }] } and added_count / skipped_count response verified against the official getting-started guide (max 400 leads per request).
 * Lead statuses STARTED / INPROGRESS / COMPLETED / STOPPED / PAUSED / BLOCKED and email flags is_bounced / is_replied / is_unsubscribed verified against the Search Campaign Leads reference.
 * SECURITY NOTE: the API key travels in the request URL, so it can land in provider-side logs. Prefer the body form for POSTs where Smartlead accepts it; never log request URLs that contain the key.
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
import { SMARTLEAD_CONFIG } from "./config";

export { buildIdentityMap, findEmailByLinkedInUrl, mapLeadToContact };
export const mapLeadToProviderContact = mapLeadToContact;

export interface SendLeadsInput {
  campaignId: string;
  leads: Lead[];
}

export interface SmartleadAdapterDeps {
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

export interface SmartleadAdapter {
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

export function createSmartleadAdapter(deps: SmartleadAdapterDeps): SmartleadAdapter {
  const baseUrl = deps.baseUrl ?? SMARTLEAD_CONFIG.baseUrl;
  const authKind = SMARTLEAD_CONFIG.authKind as OutreachAuthKind;
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
      await request<unknown>({ method: "GET", path: "/campaigns/" });
      return {
        ok: true,
        detail: "Smartlead credentials verified (GET /campaigns/ returned 2xx).",
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
      path: "/campaigns/",
    });
    return parseCampaigns(body);
  }

  async function sendLeadsToEmailCampaign(input: SendLeadsInput): Promise<SyncResult> {
    if (!deps.isSuppressed) {
      throw new Error(
        "[smartlead] Refusing to send: no suppression checker was provided (fail closed). Pass isSuppressed wrapping checkSuppression to send leads."
      );
    }
    const { result: qualified, checkErrors } = await qualifyLeads(input.leads, deps.isSuppressed);
    const skipped =
      qualified.suppressed.length + qualified.noEmail.length + qualified.duplicates.length;
    return runExportSyncJob(
      { store: deps.syncStore, workspaceId: deps.workspaceId, provider: "smartlead" },
      async () => {
    const errors: string[] = [];
    let created = 0;
    const CHUNK = 400;
    for (let i = 0; i < qualified.qualified.length; i += CHUNK) {
      const batch = qualified.qualified.slice(i, i + CHUNK);
      const body = {
        lead_list: batch.map((lead) => {
          const c = mapLeadToContact(lead);
          return {
            email: c.email,
            first_name: c.firstName,
            last_name: c.lastName,
            company_name: c.company,
            custom_fields: { linkedin_url: c.linkedinUrl, job_title: c.jobTitle },
          };
        }),
      };
      try {
        const res = await request<{ added_count?: number; skipped_count?: number }>({
          method: "POST",
          path: `/campaigns/${encodeURIComponent(input.campaignId)}/leads`,
          body,
        });
        created += typeof res?.added_count === "number" ? res.added_count : batch.length;
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
      throw new Error(`[smartlead] Campaign ${campaignId} was not found in the campaign list.`);
    }
    return found;
  }

  async function syncReplies(_input?: { campaignId?: string }): Promise<OutreachReply[]> {
    void _input;
    throw configReadyError("smartlead", "sync replies", "the Smartlead master-inbox message endpoint path was not verified against api.smartlead.ai (checked 2026-11-19).");
  }

  async function syncBouncesAndUnsubscribes(input?: {
    campaignId?: string;
  }): Promise<BounceSyncResult> {
    if (!input?.campaignId) {
      throw new Error("[smartlead] syncBouncesAndUnsubscribes needs a campaignId.");
    }
    const body = await request<unknown>({
      method: "GET",
      path: `/campaigns/${encodeURIComponent(input.campaignId)}/leads`,
      query: { limit: "100" },
    });
    const rows = readListBody(body);
    const bounced: string[] = [];
    const unsubscribed: string[] = [];
    for (const row of rows) {
      const nested = row.email_lead as Record<string, unknown> | undefined;
      const lead = nested ?? row;
      const email = asString(lead.email ?? row.email).trim().toLowerCase();
      if (!email) continue;
      // BLOCKED covers both a bounce and a global block-list entry in
      // Smartlead, so it is suppressed without distinguishing the cause.
      const isBounced =
        lead.is_bounced === true ||
        row.is_bounced === true ||
        asString(row.status).toUpperCase() === "BLOCKED";
      const isUnsub = lead.is_unsubscribed === true || row.is_unsubscribed === true;
      if (isBounced) bounced.push(email);
      else if (isUnsub) unsubscribed.push(email);
    }
    let suppressedAdded = 0;
    if (deps.onSuppressed) {
      for (const email of [...bounced, ...unsubscribed]) {
        try {
          await deps.onSuppressed(email, "bounced_or_blocked_in_smartlead");
          suppressedAdded += 1;
        } catch {
          // One failed suppression write must not fail the whole sync.
        }
      }
    }
    return { checked: rows.length, bounced, unsubscribed, suppressedAdded };
  }

  return {
    providerId: "smartlead",
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
 * Smartlead email campaign. NOT wired into live campaign execution —
 * the campaign system calls this only when the operator has configured
 * this provider and chosen a campaign. No automatic sends.
 */
export async function sendLeadsToEmailCampaign(
  deps: SmartleadAdapterDeps,
  input: SendLeadsInput
): Promise<SyncResult> {
  return createSmartleadAdapter(deps).sendLeadsToEmailCampaign(input);
}
