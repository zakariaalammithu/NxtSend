/**
 * Mailbox routing — server-side composition (service role).
 *
 * Builds the MailboxRoutingAdapter for the two live send paths:
 *  - the sequence executor's worker (jobs/context.ts): the account
 *    is the CAMPAIGN's selected email account
 *    (campaigns.email_account_id, migration 011) — resolved per send
 *    from the SendEmailInput's campaignId;
 *  - the inbox reply route: the account is the CONVERSATION's —
 *    resolved from the campaign behind the conversation's outbound
 *    messages; when the conversation has no campaign link, the
 *    workspace's single active OAuth mailbox is its chosen sender;
 *    with zero or several, replies keep the Resend path.
 *
 * All lookups run through the service-role client and are scoped to
 * the send's workspace; the data they return decides routing only —
 * token material stays inside the OAuth store / adapters.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConnectedAccount } from "@/types";
import { rowToAccount } from "@/lib/data/accounts";
import {
  createSupabaseOAuthStore,
  type OAuthConnectionRow,
  type OAuthProvider,
} from "@/lib/oauth";
import type { EmailProviderAdapter, SendEmailInput } from "./types";
import { ResendEmailAdapter } from "./resend";
import { GmailEmailAdapter } from "./gmail";
import { MicrosoftGraphEmailAdapter } from "./microsoft";
import { MailboxRoutingAdapter } from "./mailbox-router";

type Row = Record<string, unknown>;

async function loadAccountById(
  admin: SupabaseClient,
  workspaceId: string,
  accountId: string
): Promise<ConnectedAccount | null> {
  const { data, error } = await admin
    .from("connected_accounts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", accountId)
    .maybeSingle();
  if (error || !data) return null;
  return rowToAccount(data as Row);
}

/** The campaign's selected email account (email_account_id). */
export async function resolveCampaignEmailAccount(
  admin: SupabaseClient,
  workspaceId: string,
  campaignId: string | null | undefined
): Promise<ConnectedAccount | null> {
  if (!campaignId) return null;
  const { data, error } = await admin
    .from("campaigns")
    .select("email_account_id")
    .eq("workspace_id", workspaceId)
    .eq("id", campaignId)
    .maybeSingle();
  if (error || !data) return null;
  const accountId = (data as Row).email_account_id;
  if (typeof accountId !== "string" || !accountId) return null;
  return loadAccountById(admin, workspaceId, accountId);
}

/**
 * The conversation's sending account: the campaign behind its latest
 * outbound message first; otherwise the workspace's ONLY active
 * OAuth mailbox (its chosen sender); otherwise null (Resend path).
 */
export async function resolveConversationEmailAccount(
  admin: SupabaseClient,
  workspaceId: string,
  conversationId: string
): Promise<ConnectedAccount | null> {
  const { data } = await admin
    .from("messages")
    .select("campaign_id")
    .eq("workspace_id", workspaceId)
    .eq("conversation_id", conversationId)
    .eq("direction", "outbound")
    .not("campaign_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const campaignId = (data as Row | null)?.campaign_id;
  if (typeof campaignId === "string" && campaignId) {
    const account = await resolveCampaignEmailAccount(
      admin,
      workspaceId,
      campaignId
    );
    if (account) return account;
  }

  const store = createSupabaseOAuthStore(admin);
  const views = await store.listConnectionViews(workspaceId);
  const active = views.filter((v) => v.status === "active");
  if (active.length === 1) {
    return loadAccountById(admin, workspaceId, active[0].accountId);
  }
  return null;
}

function buildMailboxAdapter(
  admin: SupabaseClient,
  provider: OAuthProvider,
  connection: OAuthConnectionRow
): EmailProviderAdapter {
  const deps = {
    connectionId: connection.id,
    store: createSupabaseOAuthStore(admin),
    adminClient: admin,
    // The executor and the inbox reply service both persist their
    // own message rows (idempotency) — adapters must not double-record.
    skipMessageRecord: true,
  };
  return provider === "google"
    ? new GmailEmailAdapter(deps)
    : new MicrosoftGraphEmailAdapter(deps);
}

function buildRoutingAdapter(
  admin: SupabaseClient,
  resolveAccount: (input: SendEmailInput) => Promise<ConnectedAccount | null>
): MailboxRoutingAdapter {
  const store = createSupabaseOAuthStore(admin);
  return new MailboxRoutingAdapter({
    fallback: new ResendEmailAdapter({
      skipMessageRecord: true,
      adminClient: admin,
    }),
    resolveAccount,
    loadConnection: (workspaceId, accountId) =>
      store.getConnectionByAccountId(workspaceId, accountId),
    buildMailboxAdapter: (provider, connection) =>
      buildMailboxAdapter(admin, provider, connection),
  });
}

/** Executor path: route by the campaign's selected email account. */
export function createCampaignRoutingAdapter(
  admin: SupabaseClient
): MailboxRoutingAdapter {
  return buildRoutingAdapter(admin, (input) =>
    resolveCampaignEmailAccount(admin, input.workspaceId, input.campaignId)
  );
}

/** Inbox reply path: route by the conversation's sending account. */
export function createConversationRoutingAdapter(
  admin: SupabaseClient,
  conversationId: string
): MailboxRoutingAdapter {
  return buildRoutingAdapter(admin, (input) =>
    resolveConversationEmailAccount(admin, input.workspaceId, conversationId)
  );
}
