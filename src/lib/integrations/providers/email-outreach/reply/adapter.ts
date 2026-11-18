/**
 * Reply.io adapter — email outreach provider.
 *
 * Auth verified against the Reply help center: 'Send the key in the X-API-KEY header, or as Authorization: Bearer <key>.' Keys are scoped (All / Contacts / Sequences / Inbox / ...); API v3 checks the scope of each request.
 * POST /v1/people (upsert by email, linkedInUrl field) and POST /v1/people/{email} (update) verified via the Reply.io destination documentation. The v1 API allows 15,000 requests per user per month; v3 is rate-limited per minute / hour instead.
 * The campaignId field passed in the upsert body was NOT verified — Reply pushes a contact to a campaign 'when a campaign ID is configured', but the exact body field was not shown in the verified source. Confirm at docs.reply.io before relying on enrollment.
 * The connection test uses GET /v1/people, a collection GET inferred from the verified POST /v1/people resource — flagged UNVERIFIED in code; confirm before relying on it.
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
import { REPLY_CONFIG } from "./config";

export { buildIdentityMap, findEmailByLinkedInUrl, mapLeadToContact };
export const mapLeadToProviderContact = mapLeadToContact;

export interface SendLeadsInput {
  campaignId: string;
  leads: Lead[];
}

export interface ReplyioAdapterDeps {
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

export interface ReplyioAdapter {
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

export function createReplyioAdapter(deps: ReplyioAdapterDeps): ReplyioAdapter {
  const baseUrl = deps.baseUrl ?? REPLY_CONFIG.baseUrl;
  const authKind = REPLY_CONFIG.authKind as OutreachAuthKind;
  const client = buildOutreachClient(baseUrl, authKind, deps.credential);
  const authQuery = authQueryParam(authKind, deps.credential);

  async function request<T>(opts: RequestOpts): Promise<T> {
    return client.request<T>({
      ...opts,
      query: { ...authQuery, ...(opts.query ?? {}) },
    });
  }

  async function testConnection(): Promise<{ ok: boolean; detail: string }> {
    // UNVERIFIED: GET /v1/people is a collection GET inferred from the
    // verified POST /v1/people resource — confirm against docs.reply.io
    // before relying on this probe.
    try {
      await request<unknown>({ method: "GET", path: "/v1/people" });
      return {
        ok: true,
        detail: "Reply.io credentials verified (GET /v1/people returned 2xx).",
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
      "reply",
      "list campaigns",
      "no campaign-list endpoint path was verified against the provider docs."
    );
  }

  async function sendLeadsToEmailCampaign(input: SendLeadsInput): Promise<SyncResult> {
    if (!deps.isSuppressed) {
      throw new Error(
        "[reply] Refusing to send: no suppression checker was provided (fail closed). Pass isSuppressed wrapping checkSuppression to send leads."
      );
    }
    const { result: qualified, checkErrors } = await qualifyLeads(input.leads, deps.isSuppressed);
    const skipped =
      qualified.suppressed.length + qualified.noEmail.length + qualified.duplicates.length;
    return runExportSyncJob(
      { store: deps.syncStore, workspaceId: deps.workspaceId, provider: "reply" },
      async () => {
    const errors: string[] = [];
    let created = 0;
    for (const lead of qualified.qualified) {
      const c = mapLeadToContact(lead);
      try {
        // campaignId in the upsert body was NOT verified as the enrolment
        // field — confirm at docs.reply.io before relying on enrollment.
        // email + linkedInUrl are the verified fields (POST /v1/people
        // upserts by email).
        await request<unknown>({
          method: "POST",
          path: "/v1/people",
          body: {
            email: c.email,
            firstName: c.firstName,
            lastName: c.lastName,
            company: c.company,
            title: c.jobTitle,
            linkedInUrl: c.linkedinUrl,
            campaignId: input.campaignId,
          },
        });
        created += 1;
      } catch (err) {
        errors.push(
          `${c.email}: ${err instanceof Error ? err.message : "Upsert request failed."}`
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

  async function syncCampaignStatus(_campaignId: string): Promise<ProviderCampaignStatus> {
    void _campaignId;
    throw configReadyError(
      "reply",
      "sync campaign status",
      "no sequence / campaign-status endpoint path was verified against the provider docs."
    );
  }

  async function syncReplies(_input?: { campaignId?: string }): Promise<OutreachReply[]> {
    void _input;
    throw configReadyError("reply", "sync replies", "no Reply.io v3 inbox endpoint path was verified against docs.reply.io (checked 2026-11-19).");
  }

  async function syncBouncesAndUnsubscribes(input?: {
    campaignId?: string;
  }): Promise<BounceSyncResult> {
    void input;
    throw configReadyError("reply", "sync bounced / unsubscribed", "no Reply.io v3 bounce / unsubscribe endpoint path was verified against docs.reply.io (checked 2026-11-19).");
  }

  return {
    providerId: "reply",
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
 * Reply.io email campaign. NOT wired into live campaign execution —
 * the campaign system calls this only when the operator has configured
 * this provider and chosen a campaign. No automatic sends.
 */
export async function sendLeadsToEmailCampaign(
  deps: ReplyioAdapterDeps,
  input: SendLeadsInput
): Promise<SyncResult> {
  return createReplyioAdapter(deps).sendLeadsToEmailCampaign(input);
}
