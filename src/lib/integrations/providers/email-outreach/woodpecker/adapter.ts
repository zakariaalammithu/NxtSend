/**
 * Woodpecker adapter — email outreach provider.
 *
 * Base URL https://api.woodpecker.co/rest and x-api-key header auth verified against the official authentication guide (GET https://api.woodpecker.co/rest/v1/me).
 * POST /v1/add_prospects_campaign ({ campaign: { campaign_id }, prospects: [...] }, up to 20,000 per request) and the prospect status vocabulary ACTIVE / BLACKLIST / BOUNCED / INVALID / REPLIED verified against the official 'Add prospects to a campaign' docs page.
 * The v1 endpoints are labelled legacy in the docs ('consider handling errors accordingly') but remain functional; v2 covers campaign creation only.
 * The LinkedIn URL is kept in NxtSend's identity map and is NOT pushed as a Woodpecker snippet — the snippet field name was not verified.
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
import { WOODPECKER_CONFIG } from "./config";

export { buildIdentityMap, findEmailByLinkedInUrl, mapLeadToContact };
export const mapLeadToProviderContact = mapLeadToContact;

export interface SendLeadsInput {
  campaignId: string;
  leads: Lead[];
}

export interface WoodpeckerAdapterDeps {
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

export interface WoodpeckerAdapter {
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

export function createWoodpeckerAdapter(deps: WoodpeckerAdapterDeps): WoodpeckerAdapter {
  const baseUrl = deps.baseUrl ?? WOODPECKER_CONFIG.baseUrl;
  const authKind = WOODPECKER_CONFIG.authKind as OutreachAuthKind;
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
      await request<unknown>({ method: "GET", path: "/v1/me" });
      return {
        ok: true,
        detail: "Woodpecker credentials verified (GET /v1/me returned 2xx).",
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
      path: "/v1/campaigns",
    });
    return parseCampaigns(body);
  }

  async function sendLeadsToEmailCampaign(input: SendLeadsInput): Promise<SyncResult> {
    if (!deps.isSuppressed) {
      throw new Error(
        "[woodpecker] Refusing to send: no suppression checker was provided (fail closed). Pass isSuppressed wrapping checkSuppression to send leads."
      );
    }
    const { result: qualified, checkErrors } = await qualifyLeads(input.leads, deps.isSuppressed);
    const skipped =
      qualified.suppressed.length + qualified.noEmail.length + qualified.duplicates.length;
    return runExportSyncJob(
      { store: deps.syncStore, workspaceId: deps.workspaceId, provider: "woodpecker" },
      async () => {
    const errors: string[] = [];
    let created = 0;
    const CHUNK = 1000;
    for (let i = 0; i < qualified.qualified.length; i += CHUNK) {
      const batch = qualified.qualified.slice(i, i + CHUNK);
      const rawId = Number(input.campaignId);
      const body = {
        campaign: { campaign_id: Number.isNaN(rawId) ? input.campaignId : rawId },
        prospects: batch.map((lead) => {
          const c = mapLeadToContact(lead);
          return {
            email: c.email,
            first_name: c.firstName,
            last_name: c.lastName,
            company: c.company,
          };
        }),
      };
      try {
        const res = await request<unknown>({
          method: "POST",
          path: "/v1/add_prospects_campaign",
          body,
        });
        // The docs allow up to 20,000 prospects per request; the response
        // is a per-prospect result list when present.
        created += Array.isArray(res) ? res.length : batch.length;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "Add-prospects request failed.");
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
      throw new Error(`[woodpecker] Campaign ${campaignId} was not found in the campaign list.`);
    }
    return found;
  }

  async function syncReplies(_input?: { campaignId?: string }): Promise<OutreachReply[]> {
    void _input;
    throw configReadyError("woodpecker", "sync replies", "no Woodpecker reply endpoint was verified against developers.woodpecker.co (checked 2026-11-19).");
  }

  async function syncBouncesAndUnsubscribes(input?: {
    campaignId?: string;
  }): Promise<BounceSyncResult> {
    void input;
    const body = await request<unknown>({
      method: "GET",
      path: "/v1/prospects",
      query: { campaigns_details: "true" },
    });
    const rows = readListBody(body);
    const bounced: string[] = [];
    const unsubscribed: string[] = [];
    for (const row of rows) {
      const email = asString(row.email).trim().toLowerCase();
      if (!email) continue;
      // Verified Woodpecker vocabulary: ACTIVE / BLACKLIST / BOUNCED /
      // INVALID / REPLIED. BLACKLIST is Woodpecker's suppression state.
      const status = asString(row.status).trim().toUpperCase();
      if (status === "BOUNCED") bounced.push(email);
      else if (status === "BLACKLIST") unsubscribed.push(email);
    }
    let suppressedAdded = 0;
    if (deps.onSuppressed) {
      for (const email of bounced) {
        try {
          await deps.onSuppressed(email, "bounced_in_woodpecker");
          suppressedAdded += 1;
        } catch {
          // One failed suppression write must not fail the whole sync.
        }
      }
      for (const email of unsubscribed) {
        try {
          await deps.onSuppressed(email, "blacklisted_in_woodpecker");
          suppressedAdded += 1;
        } catch {
          // One failed suppression write must not fail the whole sync.
        }
      }
    }
    return { checked: rows.length, bounced, unsubscribed, suppressedAdded };
  }

  return {
    providerId: "woodpecker",
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
 * Woodpecker email campaign. NOT wired into live campaign execution —
 * the campaign system calls this only when the operator has configured
 * this provider and chosen a campaign. No automatic sends.
 */
export async function sendLeadsToEmailCampaign(
  deps: WoodpeckerAdapterDeps,
  input: SendLeadsInput
): Promise<SyncResult> {
  return createWoodpeckerAdapter(deps).sendLeadsToEmailCampaign(input);
}
