/**
 * Snov.io adapter — email outreach provider.
 *
 * Base URL https://api.snov.io, token endpoint POST /v1/oauth/access_token and 1-hour Bearer token verified against the official Snov.io API docs and knowledge base (API User ID + API Secret at app.snov.io/account/api).
 * GET /v1/get-user-campaigns verified via the Ibexa Connect reference (example: list campaigns).
 * The token endpoint takes form-encoded parameters (grant_type, client_id, client_secret), which ProviderHttpClient (JSON only) does not send — so that one call uses a bare fetch with the same 10s timeout, documented in the adapter. The client secret never appears in an error message.
 * The add-prospect-to-campaign endpoint path was not verified — the export is a config-ready stub. Linked Helper and similar tools send first/last name, email, company and position to a Snov.io campaign, but the literal REST path was not in the verified sources.
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
import { ProviderHttpClient } from "../../client";
import type { ProviderCredential } from "../../connections";
import type { SyncJobStore } from "../../sync";
import type { SyncResult } from "../../types";
import {
  asString,
  buildIdentityMap,
  configReadyError,
  findCampaignById,
  findEmailByLinkedInUrl,
  mapLeadToContact,
  qualifyLeads,
  readListBody,
  runExportSyncJob,
  type BounceSyncResult,
  type OutreachReply,
  type ProviderCampaign,
  type ProviderCampaignStatus,
  type SuppressionChecker,
} from "../common";
import { SNOV_CONFIG } from "./config";

export { buildIdentityMap, findEmailByLinkedInUrl, mapLeadToContact };
export const mapLeadToProviderContact = mapLeadToContact;

export interface SendLeadsInput {
  campaignId: string;
  leads: Lead[];
}

export interface SnovioAdapterDeps {
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

export interface SnovioAdapter {
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

export function createSnovioAdapter(deps: SnovioAdapterDeps): SnovioAdapter {
  const baseUrl = deps.baseUrl ?? SNOV_CONFIG.baseUrl;
  // Snov.io authenticates with a short-lived (1h) Bearer token from a
  // client-credentials exchange. The token endpoint takes
  // application/x-www-form-urlencoded, which ProviderHttpClient (JSON
  // only) does not send — so this one call uses a bare fetch with the
  // same 10s timeout. The client secret never appears in an error.
  let cachedToken: { token: string; expiresAt: number } | null = null;
  async function getAccessToken(): Promise<string> {
    const now = Date.now();
    if (cachedToken && cachedToken.expiresAt > now) return cachedToken.token;
    const clientId = deps.credential.apiKey ?? "";
    const clientSecret = deps.credential.extra?.client_secret ?? "";
    if (!clientId || !clientSecret) {
      throw new Error(
        "[snov] Snov.io needs an API User ID (stored as apiKey) and an API Secret (stored as extra.client_secret)."
      );
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(`${baseUrl}/v1/oauth/access_token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`[snov] Token exchange failed (HTTP ${res.status}).`);
      }
      const data = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
      const token = asString(data.access_token);
      if (!token) throw new Error("[snov] Token exchange returned no access_token.");
      const ttl = typeof data.expires_in === "number" ? data.expires_in : 3600;
      cachedToken = { token, expiresAt: now + Math.max(ttl - 60, 0) * 1000 };
      return token;
    } finally {
      clearTimeout(timer);
    }
  }

  async function request<T>(opts: RequestOpts): Promise<T> {
    const token = await getAccessToken();
    const tokenClient = new ProviderHttpClient({
      baseUrl,
      getAuthHeaders: () => ({ Authorization: `Bearer ${token}` }),
    });
    return tokenClient.request<T>(opts);
  }

  async function testConnection(): Promise<{ ok: boolean; detail: string }> {
    try {
      await request<unknown>({ method: "GET", path: "/v1/get-user-campaigns" });
      return {
        ok: true,
        detail: "Snov.io credentials verified (GET /v1/get-user-campaigns returned 2xx).",
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
      path: "/v1/get-user-campaigns",
    });
    return parseCampaigns(body);
  }

  async function sendLeadsToEmailCampaign(input: SendLeadsInput): Promise<SyncResult> {
    if (!deps.isSuppressed) {
      throw new Error(
        "[snov] Refusing to send: no suppression checker was provided (fail closed). Pass isSuppressed wrapping checkSuppression to send leads."
      );
    }
    await qualifyLeads(input.leads, deps.isSuppressed);
    return runExportSyncJob(
      { store: deps.syncStore, workspaceId: deps.workspaceId, provider: "snov" },
      async () => {
    throw configReadyError("snov", "send leads to campaign", "the add-prospect-to-campaign endpoint path was not verified against snov.io/api or the Snov.io knowledge base.");
      }
    );
  }

  async function syncCampaignStatus(campaignId: string): Promise<ProviderCampaignStatus> {
    const campaigns = await listCampaigns();
    const found = findCampaignById(campaigns, campaignId);
    if (!found) {
      throw new Error(`[snov] Campaign ${campaignId} was not found in the campaign list.`);
    }
    return found;
  }

  async function syncReplies(_input?: { campaignId?: string }): Promise<OutreachReply[]> {
    void _input;
    throw configReadyError("snov", "sync replies", "no Snov.io reply endpoint was verified against snov.io/api (checked 2026-11-19).");
  }

  async function syncBouncesAndUnsubscribes(input?: {
    campaignId?: string;
  }): Promise<BounceSyncResult> {
    void input;
    throw configReadyError("snov", "sync bounced / unsubscribed", "no Snov.io bounce / campaign-stats endpoint path was verified (checked 2026-11-19).");
  }

  return {
    providerId: "snov",
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
 * Snov.io email campaign. NOT wired into live campaign execution —
 * the campaign system calls this only when the operator has configured
 * this provider and chosen a campaign. No automatic sends.
 */
export async function sendLeadsToEmailCampaign(
  deps: SnovioAdapterDeps,
  input: SendLeadsInput
): Promise<SyncResult> {
  return createSnovioAdapter(deps).sendLeadsToEmailCampaign(input);
}
