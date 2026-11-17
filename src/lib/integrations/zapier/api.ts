/**
 * Zapier REST API v1 — route logic over injected repositories.
 *
 * Thin wrapper over the shared implementation
 * (src/lib/integrations/rest/api.ts): every `zapier*` function
 * adapts the legacy `ZapierApiDeps` (a `zapierStore`, full
 * `zapier.*` audit actions) to `RestApiDeps` and delegates.
 * Behaviour is identical — same validation, same error codes,
 * same response shapes — because it IS the same code.
 *
 * The new sequence / follow-up / execution-status functions and
 * lead DELETE live in rest/api.ts only; the Zapier routes do not
 * expose them.
 */

import type { MuseAccessContext } from "@/lib/muse-connector/oauth/tokens";
import type { LeadsRepository } from "@/lib/data/leads";
import type { CampaignsRepository } from "@/lib/data/campaigns";
import type { InboxRepository } from "@/lib/data/inbox";
import type { AccountsRepository } from "@/lib/data/accounts";
import type { UsageRepository } from "@/lib/data/usage";
import type { DataMode } from "@/lib/data/mode";
import type { SendReplyArgs, ReplyOutcome } from "@/lib/inbox/reply";
import type { WebhookEventType } from "@/lib/integrations/rest/events";
import { ZAPIER_PLATFORM } from "@/lib/integrations/rest/config";
import {
  parseListParams,
  restAuthTest,
  restListLeads,
  restGetLead,
  restCreateLead,
  restUpdateLead,
  restImportLeads,
  restListCampaigns,
  restGetCampaign,
  restCreateCampaign,
  restUpdateCampaign,
  restCampaignAction,
  restCampaignPerformance,
  restAddLeadsToCampaign,
  restRemoveLeadFromCampaign,
  restListConversations,
  restGetConversation,
  restSendReply,
  restListAccounts,
  restGetUsage,
  restSearchLeads,
  restSearchCampaigns,
  restSearchConversations,
  restSearchAccounts,
  restDropdownCampaigns,
  restDropdownAccounts,
  restDropdownLeadStatuses,
  restDropdownSequences,
  restSubscribeWebhook,
  restUnsubscribeWebhook,
  restListWebhookSubscriptions,
  type RestApiDeps,
  type RestApiResult,
} from "@/lib/integrations/rest/api";
import type { ZapierAuditAction } from "./audit";
import type { ZapierOutboxStore, ZapierSubscriptionStore } from "./outbox";

export { parseListParams };

export interface ZapierApiDeps {
  leads: LeadsRepository;
  campaigns: CampaignsRepository;
  inbox: InboxRepository;
  accounts: AccountsRepository;
  usage: UsageRepository;
  mode: DataMode;
  zapierStore: ZapierSubscriptionStore & ZapierOutboxStore;
  /** Server-side emit (enqueue + best-effort immediate attempt). */
  emit: (type: WebhookEventType, workspaceId: string, data: Record<string, unknown>) => Promise<void>;
  /** Inbox reply send path (defaults to the real sendInboxReply in the route helper). */
  sendReply: (args: SendReplyArgs) => Promise<ReplyOutcome>;
  getUserLabel: (userId: string) => Promise<{ id: string; email: string | null } | null>;
  getWorkspaceLabel: (workspaceId: string) => Promise<{ id: string; name: string | null } | null>;
  audit: (input: {
    workspaceId: string | null;
    actorId: string | null;
    action: ZapierAuditAction;
    resource: string;
    details: string;
  }) => Promise<void>;
}

export type ZapierApiResult = RestApiResult;

/**
 * Adapts legacy Zapier deps to the shared deps: the platform is
 * Zapier, the store is used as-is (a legacy store ignores the
 * extra platform argument at runtime — it only ever held Zapier
 * rows), and bare audit actions gain their `zapier.` prefix.
 */
function adaptDeps(deps: ZapierApiDeps): RestApiDeps {
  return {
    platform: ZAPIER_PLATFORM,
    leads: deps.leads,
    campaigns: deps.campaigns,
    inbox: deps.inbox,
    accounts: deps.accounts,
    usage: deps.usage,
    mode: deps.mode,
    store: deps.zapierStore as unknown as RestApiDeps["store"],
    emit: deps.emit,
    sendReply: deps.sendReply,
    getUserLabel: deps.getUserLabel,
    getWorkspaceLabel: deps.getWorkspaceLabel,
    audit: (input) =>
      deps.audit({ ...input, action: `zapier.${input.action}` as ZapierAuditAction }),
  };
}


export async function zapierAuthTest(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps
): Promise<ZapierApiResult> {
  return restAuthTest(ctx, adaptDeps(deps));
}

export async function zapierListLeads(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps,
  query: URLSearchParams
): Promise<ZapierApiResult> {
  return restListLeads(ctx, adaptDeps(deps), query);
}

export async function zapierGetLead(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps,
  id: string
): Promise<ZapierApiResult> {
  return restGetLead(ctx, adaptDeps(deps), id);
}

export async function zapierCreateLead(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps,
  body: Record<string, unknown>
): Promise<ZapierApiResult> {
  return restCreateLead(ctx, adaptDeps(deps), body);
}

export async function zapierUpdateLead(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps,
  id: string,
  body: Record<string, unknown>
): Promise<ZapierApiResult> {
  return restUpdateLead(ctx, adaptDeps(deps), id, body);
}

export async function zapierImportLeads(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps,
  body: Record<string, unknown>
): Promise<ZapierApiResult> {
  return restImportLeads(ctx, adaptDeps(deps), body);
}

export async function zapierListCampaigns(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps,
  query: URLSearchParams
): Promise<ZapierApiResult> {
  return restListCampaigns(ctx, adaptDeps(deps), query);
}

export async function zapierGetCampaign(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps,
  id: string
): Promise<ZapierApiResult> {
  return restGetCampaign(ctx, adaptDeps(deps), id);
}

export async function zapierCreateCampaign(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps,
  body: Record<string, unknown>
): Promise<ZapierApiResult> {
  return restCreateCampaign(ctx, adaptDeps(deps), body);
}

export async function zapierUpdateCampaign(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps,
  id: string,
  body: Record<string, unknown>
): Promise<ZapierApiResult> {
  return restUpdateCampaign(ctx, adaptDeps(deps), id, body);
}

export async function zapierCampaignAction(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps,
  id: string,
  action: "pause" | "resume" | "stop" | "archive"
): Promise<ZapierApiResult> {
  return restCampaignAction(ctx, adaptDeps(deps), id, action);
}

export async function zapierCampaignPerformance(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps,
  id: string
): Promise<ZapierApiResult> {
  return restCampaignPerformance(ctx, adaptDeps(deps), id);
}

export async function zapierAddLeadsToCampaign(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps,
  campaignId: string,
  body: Record<string, unknown>
): Promise<ZapierApiResult> {
  return restAddLeadsToCampaign(ctx, adaptDeps(deps), campaignId, body);
}

export async function zapierRemoveLeadFromCampaign(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps,
  campaignId: string,
  leadId: string
): Promise<ZapierApiResult> {
  return restRemoveLeadFromCampaign(ctx, adaptDeps(deps), campaignId, leadId);
}

export async function zapierListConversations(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps,
  query: URLSearchParams
): Promise<ZapierApiResult> {
  return restListConversations(ctx, adaptDeps(deps), query);
}

export async function zapierGetConversation(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps,
  id: string
): Promise<ZapierApiResult> {
  return restGetConversation(ctx, adaptDeps(deps), id);
}

export async function zapierSendReply(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps,
  conversationId: string,
  body: Record<string, unknown>
): Promise<ZapierApiResult> {
  return restSendReply(ctx, adaptDeps(deps), conversationId, body);
}

export async function zapierListAccounts(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps
): Promise<ZapierApiResult> {
  return restListAccounts(ctx, adaptDeps(deps));
}

export async function zapierGetUsage(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps
): Promise<ZapierApiResult> {
  return restGetUsage(ctx, adaptDeps(deps));
}

export async function zapierSearchLeads(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps,
  query: URLSearchParams
): Promise<ZapierApiResult> {
  return restSearchLeads(ctx, adaptDeps(deps), query);
}

export async function zapierSearchCampaigns(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps,
  query: URLSearchParams
): Promise<ZapierApiResult> {
  return restSearchCampaigns(ctx, adaptDeps(deps), query);
}

export async function zapierSearchConversations(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps,
  query: URLSearchParams
): Promise<ZapierApiResult> {
  return restSearchConversations(ctx, adaptDeps(deps), query);
}

export async function zapierSearchAccounts(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps,
  query: URLSearchParams
): Promise<ZapierApiResult> {
  return restSearchAccounts(ctx, adaptDeps(deps), query);
}

export async function zapierDropdownCampaigns(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps
): Promise<ZapierApiResult> {
  return restDropdownCampaigns(ctx, adaptDeps(deps));
}

export async function zapierDropdownAccounts(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps
): Promise<ZapierApiResult> {
  return restDropdownAccounts(ctx, adaptDeps(deps));
}

export async function zapierSubscribeWebhook(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps,
  body: Record<string, unknown>
): Promise<ZapierApiResult> {
  return restSubscribeWebhook(ctx, adaptDeps(deps), body);
}

export async function zapierUnsubscribeWebhook(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps,
  body: Record<string, unknown>
): Promise<ZapierApiResult> {
  return restUnsubscribeWebhook(ctx, adaptDeps(deps), body);
}

export async function zapierListWebhookSubscriptions(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps
): Promise<ZapierApiResult> {
  return restListWebhookSubscriptions(ctx, adaptDeps(deps));
}

export function zapierDropdownLeadStatuses(): ZapierApiResult {
  return restDropdownLeadStatuses();
}

export async function zapierDropdownSequences(
  ctx: MuseAccessContext,
  deps: ZapierApiDeps,
  query: URLSearchParams
): Promise<ZapierApiResult> {
  return restDropdownSequences(ctx, adaptDeps(deps), query);
}
