/**
 * Mailshake adapter — email outreach provider.
 *
 * Base URL https://api.mailshake.com/2017-04-01 (versioned) and API-key auth verified against the official API reference: key as query-string apiKey, in the JSON body, or via HTTP Basic auth (curl -u 'my-api-key:'). The adapter uses Basic auth.
 * GET /me, POST /campaigns/list, POST /recipients/list, POST /recipients/add ({ campaignID, addAsNewList, listOfEmails }) and POST /recipients/unsubscribe verified against the same reference.
 * Recipient add sends email addresses only (listOfEmails). Names / company are NOT sent by the verified call — Mailshake matches recipients by email.
 * The recipient status vocabulary was NOT verified: the bounce read only counts exact 'bounced' / 'unsubscribed' status strings and ignores everything else.
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
import { MAILSHAKE_CONFIG } from "./config";

export { buildIdentityMap, findEmailByLinkedInUrl, mapLeadToContact };
export const mapLeadToProviderContact = mapLeadToContact;

export interface SendLeadsInput {
  campaignId: string;
  leads: Lead[];
}

export interface MailshakeAdapterDeps {
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

export interface MailshakeAdapter {
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

export function createMailshakeAdapter(deps: MailshakeAdapterDeps): MailshakeAdapter {
  const baseUrl = deps.baseUrl ?? MAILSHAKE_CONFIG.baseUrl;
  const authKind = MAILSHAKE_CONFIG.authKind as OutreachAuthKind;
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
      await request<unknown>({ method: "GET", path: "/me" });
      return {
        ok: true,
        detail: "Mailshake credentials verified (GET /me returned 2xx).",
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
      method: "POST",
      path: "/campaigns/list", body: {},
    });
    return parseCampaigns(body);
  }

  async function sendLeadsToEmailCampaign(input: SendLeadsInput): Promise<SyncResult> {
    if (!deps.isSuppressed) {
      throw new Error(
        "[mailshake] Refusing to send: no suppression checker was provided (fail closed). Pass isSuppressed wrapping checkSuppression to send leads."
      );
    }
    const { result: qualified, checkErrors } = await qualifyLeads(input.leads, deps.isSuppressed);
    const skipped =
      qualified.suppressed.length + qualified.noEmail.length + qualified.duplicates.length;
    return runExportSyncJob(
      { store: deps.syncStore, workspaceId: deps.workspaceId, provider: "mailshake" },
      async () => {
    const errors: string[] = [];
    let created = 0;
    if (qualified.qualified.length > 0) {
      // Mailshake matches recipients by email; the verified call carries
      // email addresses only (listOfEmails) — no names / company.
      const rawId = Number(input.campaignId);
      try {
        await request<unknown>({
          method: "POST",
          path: "/recipients/add",
          body: {
            campaignID: Number.isNaN(rawId) ? input.campaignId : rawId,
            addAsNewList: true,
            listOfEmails: qualified.qualified
              .map((l) => (l.email ?? "").trim())
              .join(","),
          },
        });
        created = qualified.qualified.length;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "Add-recipients request failed.");
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
      throw new Error(`[mailshake] Campaign ${campaignId} was not found in the campaign list.`);
    }
    return found;
  }

  async function syncReplies(_input?: { campaignId?: string }): Promise<OutreachReply[]> {
    void _input;
    throw configReadyError("mailshake", "sync replies", "no Mailshake reply endpoint was verified against api-docs.mailshake.com (checked 2026-11-19).");
  }

  async function syncBouncesAndUnsubscribes(input?: {
    campaignId?: string;
  }): Promise<BounceSyncResult> {
    if (!input?.campaignId) {
      throw new Error("[mailshake] syncBouncesAndUnsubscribes needs a campaignId.");
    }
    const rawId = Number(input.campaignId);
    const body = await request<unknown>({
      method: "POST",
      path: "/recipients/list",
      body: { campaignID: Number.isNaN(rawId) ? input.campaignId : rawId },
    });
    const rows = readListBody(body);
    const bounced: string[] = [];
    const unsubscribed: string[] = [];
    for (const row of rows) {
      const email = asString(row.emailAddress ?? row.email).trim().toLowerCase();
      if (!email) continue;
      // The recipient status vocabulary was NOT verified: only exact
      // 'bounced' / 'unsubscribed' strings count; anything else is ignored.
      const status = asString(row.status).trim().toLowerCase();
      if (status === "bounced") bounced.push(email);
      else if (status === "unsubscribed") unsubscribed.push(email);
    }
    let suppressedAdded = 0;
    if (deps.onSuppressed) {
      for (const email of [...bounced, ...unsubscribed]) {
        try {
          await deps.onSuppressed(email, "bounced_or_unsubscribed_in_mailshake");
          suppressedAdded += 1;
        } catch {
          // One failed suppression write must not fail the whole sync.
        }
      }
    }
    return { checked: rows.length, bounced, unsubscribed, suppressedAdded };
  }

  return {
    providerId: "mailshake",
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
 * Mailshake email campaign. NOT wired into live campaign execution —
 * the campaign system calls this only when the operator has configured
 * this provider and chosen a campaign. No automatic sends.
 */
export async function sendLeadsToEmailCampaign(
  deps: MailshakeAdapterDeps,
  input: SendLeadsInput
): Promise<SyncResult> {
  return createMailshakeAdapter(deps).sendLeadsToEmailCampaign(input);
}
