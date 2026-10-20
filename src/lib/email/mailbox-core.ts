/**
 * Mailbox send core — the shared send flow behind the Gmail and
 * Microsoft Graph adapters (./gmail.ts, ./microsoft.ts).
 *
 * The guarantees mirror the Resend adapter exactly:
 *   1. Demo mode → `simulated`, nothing is called (mailbox adapters
 *      are only constructed against live OAuth connections, but the
 *      guard stands so no code path can pretend).
 *   2. The workspace suppression list is checked BEFORE the provider
 *      call and fails closed — a check that cannot run (no
 *      service-role client) refuses the send.
 *   3. `sent` is returned ONLY with a provider message ID (Gmail
 *      returns one from messages.send; Graph via the
 *      create-message step — see ./microsoft.ts for the contract
 *      decision).
 *   4. Unsubscribe headers + footer are prepared at send time with
 *      the SAME shared builder the Resend adapter uses
 *      (./unsubscribe.ts) — stored templates are never mutated and
 *      the recorded message keeps the caller's original body.
 *   5. A failed token refresh marks the connection
 *      `needs_reconnect` (oauth/tokens.ts) and yields an honest
 *      error — never a silent fallback to another provider.
 *
 * The outcome is recorded in `messages` with the mailbox provider
 * label ("gmail" / "microsoft"), unless the caller owns persistence
 * (skipMessageRecord — the executor + inbox reply flow).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import type { ProviderState } from "@/lib/env";
import { getDataMode } from "@/lib/data/mode";
import type { SendEmailInput, SendEmailResult } from "./types";
import { checkSuppression } from "./suppression";
import {
  appendUnsubscribeFooter,
  buildUnsubscribeHeaders,
  type UnsubscribeEnv,
} from "./unsubscribe";
import {
  getValidAccessToken,
  OAuthTokenError,
  mailboxLabel,
  type OAuthConnectionRow,
  type OAuthProvider,
  type OAuthTokenStore,
} from "@/lib/oauth";
import type { OAuthEnv } from "@/lib/oauth/config";

export interface PreparedMailboxMessage {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  headers: Record<string, string>;
}

/** Provider-specific delivery: returns the provider message ID. */
export type MailboxDeliver = (
  accessToken: string,
  message: PreparedMailboxMessage
) => Promise<{ providerMessageId: string }>;

export interface MailboxAdapterDeps {
  /** The oauth_connections row this adapter sends through. */
  connectionId: string;
  /** Token persistence + account-health writer (oauth store). */
  store: OAuthTokenStore;
  adminClient?: SupabaseClient | null;
  /** Test seam: defaults to a real suppression query. */
  suppressionCheck?: (workspaceId: string, email: string) => Promise<boolean>;
  /** Test seam: defaults to the connection-derived state. */
  stateOverride?: ProviderState;
  /** Caller owns message persistence (executor / inbox reply). */
  skipMessageRecord?: boolean;
  /** Test seam: env for the unsubscribe preparation. */
  unsubscribeEnv?: UnsubscribeEnv;
  /** OAuth env (client config for token refresh). */
  env?: OAuthEnv;
  fetchFn?: typeof fetch;
  now?: () => Date;
}

export async function sendMailboxEmail(
  provider: OAuthProvider,
  deps: MailboxAdapterDeps,
  input: SendEmailInput,
  deliver: MailboxDeliver
): Promise<SendEmailResult> {
  const label = mailboxLabel(provider);
  const providerLabel = provider === "google" ? "Gmail" : "Microsoft Graph";

  const recordMessage = async (
    status: string,
    providerMessageId: string | null
  ): Promise<void> => {
    if (deps.skipMessageRecord) return;
    const admin =
      deps.adminClient !== undefined ? deps.adminClient : createAdminClient();
    if (!admin) return; // best-effort bookkeeping only
    try {
      await admin.from("messages").insert({
        workspace_id: input.workspaceId,
        lead_id: input.leadId ?? null,
        campaign_id: input.campaignId ?? null,
        channel: "email",
        direction: "outbound",
        subject: input.subject,
        content: input.text ?? input.html ?? "",
        status,
        is_demo: false,
        provider: label,
        provider_message_id: providerMessageId,
      });
    } catch {
      // A bookkeeping failure must not rewrite the send outcome.
    }
  };

  const state: ProviderState =
    deps.stateOverride ?? (getDataMode() === "demo" ? "demo" : "connected");
  if (state === "demo") {
    return {
      status: "simulated",
      provider: label,
      providerMessageId: null,
      message: `Demo Mode: no email was sent. Mailbox sending (${providerLabel}) runs in live mode with an OAuth-connected mailbox.`,
    };
  }
  if (state === "not_connected" || state === "configuration_required") {
    return {
      status: "not_configured",
      provider: label,
      providerMessageId: null,
      message: `The ${providerLabel} mailbox is not connected. Connect it with OAuth in the Integration Center first. No email was sent.`,
    };
  }

  // Load the grant — it decides, not the caller's optimism.
  let connection: OAuthConnectionRow | null;
  try {
    connection = await deps.store.getConnectionById(
      input.workspaceId,
      deps.connectionId
    );
  } catch (err) {
    return {
      status: "error",
      provider: label,
      providerMessageId: null,
      message: `Send refused: the mailbox connection could not be loaded (${err instanceof Error ? err.message : "unknown error"}). No email was sent.`,
    };
  }
  if (!connection || connection.provider !== provider) {
    return {
      status: "not_configured",
      provider: label,
      providerMessageId: null,
      message: `No ${providerLabel} OAuth connection is stored for this mailbox. Connect it in the Integration Center first. No email was sent.`,
    };
  }
  if (connection.status !== "active") {
    return {
      status: "error",
      provider: label,
      providerMessageId: null,
      message: `The ${providerLabel} mailbox ${connection.provider_account_email} is not in an active state (recorded: "${connection.status}") — reconnect it in the Integration Center. No email was sent.`,
    };
  }

  // Suppression — before any provider call, fail closed (as Resend).
  const admin =
    deps.adminClient !== undefined ? deps.adminClient : createAdminClient();
  if (!admin && !deps.suppressionCheck) {
    return {
      status: "error",
      provider: label,
      providerMessageId: null,
      message:
        "Send refused: the suppression list could not be checked (SUPABASE_SERVICE_ROLE_KEY is not configured). No email was sent.",
    };
  }
  let suppressed: boolean;
  try {
    suppressed = deps.suppressionCheck
      ? await deps.suppressionCheck(input.workspaceId, input.to)
      : await checkSuppression(admin as SupabaseClient, input.workspaceId, input.to);
  } catch (err) {
    return {
      status: "error",
      provider: label,
      providerMessageId: null,
      message: `Send refused: suppression check failed (${err instanceof Error ? err.message : "unknown error"}). No email was sent.`,
    };
  }
  if (suppressed) {
    await recordMessage("suppressed", null);
    return {
      status: "suppressed",
      provider: label,
      providerMessageId: null,
      message: `Recipient ${input.to} is on the workspace suppression list. No email was sent.`,
    };
  }

  // Unsubscribe preparation — same shared builder as Resend.
  const prep = buildUnsubscribeHeaders(
    { workspaceId: input.workspaceId, email: input.to },
    deps.unsubscribeEnv
  );
  const bodies = appendUnsubscribeFooter(
    { text: input.text, html: input.html },
    prep.url
  );
  const headers: Record<string, string> = {
    ...(input.headers ?? {}),
    ...prep.headers,
  };

  // Access token (transparent refresh; failure = honest error).
  let accessToken: string;
  try {
    const valid = await getValidAccessToken(
      { store: deps.store, env: deps.env, fetchFn: deps.fetchFn, now: deps.now },
      connection
    );
    accessToken = valid.accessToken;
  } catch (err) {
    await recordMessage("error", null);
    return {
      status: "error",
      provider: label,
      providerMessageId: null,
      message:
        err instanceof OAuthTokenError
          ? `${err.message} No email was sent.`
          : `Send failed: the mailbox access token could not be prepared (${err instanceof Error ? err.message : "unknown error"}). No email was sent.`,
    };
  }

  const from = input.from ?? connection.provider_account_email;
  let providerMessageId: string;
  try {
    const delivered = await deliver(accessToken, {
      from,
      to: input.to,
      subject: input.subject,
      text: bodies.text,
      html: bodies.html,
      replyTo: input.replyTo,
      headers,
    });
    providerMessageId = delivered.providerMessageId;
  } catch (err) {
    await recordMessage("error", null);
    return {
      status: "error",
      provider: label,
      providerMessageId: null,
      message: `${providerLabel} rejected the send: ${err instanceof Error ? err.message : "unknown error"}. The email was NOT sent.`,
    };
  }

  await recordMessage("sent", providerMessageId);
  return {
    status: "sent",
    provider: label,
    providerMessageId,
    message:
      `Email accepted by ${providerLabel} from ${from} (message ID ${providerMessageId}).` +
      (prep.warning ? ` ${prep.warning}` : ""),
  };
}
