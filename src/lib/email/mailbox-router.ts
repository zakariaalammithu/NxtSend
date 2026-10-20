/**
 * Mailbox routing adapter — closes the P5 audit §1 gap: "the
 * executor never passes `from`, so a campaign's selected email
 * account never affects sending".
 *
 * This adapter wraps the Resend adapter and, per send, asks an
 * injected resolver for the SELECTED email account (the campaign's
 * campaigns.email_account_id, or the inbox conversation's account):
 *
 *   account is a Gmail/Microsoft mailbox
 *     + an active OAuth grant exists       → send through the mailbox
 *       adapter, From = the mailbox address;
 *     + grant missing / not active /
 *       account auth not ok                → REFUSE with an honest
 *       error. The Resend fallback is NOT used: silently sending
 *       from EMAIL_FROM after the operator picked a mailbox would
 *       change the From identity (and reply routing) without
 *       telling anyone — exactly the failure this stage removes.
 *   no account selected, or the account is
 *   a Resend sending identity              → Resend, unchanged.
 *
 * Demo mode never constructs this adapter (the demo runner and the
 * demo inbox use their existing simulated paths).
 */

import type { ConnectedAccount } from "@/types";
import type { ProviderState } from "@/lib/env";
import {
  mailboxLabel,
  oauthProviderForAccountLabel,
  type OAuthConnectionRow,
  type OAuthProvider,
} from "@/lib/oauth";
import type {
  EmailProviderAdapter,
  SendEmailInput,
  SendEmailResult,
} from "./types";

export type SendRouteDecision =
  | { kind: "fallback" }
  | {
      kind: "mailbox";
      provider: OAuthProvider;
      account: ConnectedAccount;
      connection: OAuthConnectionRow;
    }
  | { kind: "refuse"; provider: OAuthProvider; message: string };

/**
 * The routing decision, pure. `connection` is the OAuth grant stored
 * for the account (null when none was ever stored).
 */
export function decideSendRoute(
  account: ConnectedAccount | null,
  connection: OAuthConnectionRow | null
): SendRouteDecision {
  if (!account) return { kind: "fallback" };
  const provider = oauthProviderForAccountLabel(account.provider);
  if (!provider) return { kind: "fallback" };
  const label = provider === "google" ? "Gmail" : "Outlook (Microsoft 365)";
  const mailbox = account.handle_or_email || connection?.provider_account_email || "the selected mailbox";

  if (!connection) {
    return {
      kind: "refuse",
      provider,
      message: `The selected email account (${mailbox}) is a ${label} mailbox, but no OAuth connection is stored for it — reconnect it in Connected Accounts / the Integration Center. No email was sent, and the Resend fallback was NOT used (it would send from a different From identity than the one this campaign selected).`,
    };
  }
  if (connection.status !== "active") {
    return {
      kind: "refuse",
      provider,
      message: `The selected ${label} mailbox (${connection.provider_account_email}) has a recorded connection state of "${connection.status}" — reconnect it in the Integration Center before sending. No email was sent, and the Resend fallback was NOT used (it would send from a different From identity than the one this campaign selected).`,
    };
  }
  if (account.auth_status !== "ok") {
    return {
      kind: "refuse",
      provider,
      message: `The selected ${label} mailbox (${mailbox}) has a recorded authorization state of "${account.auth_status}"${account.last_error ? ` (last provider error: ${account.last_error})` : ""} — reconnect it in the Integration Center before sending. No email was sent, and the Resend fallback was NOT used.`,
    };
  }
  return { kind: "mailbox", provider, account, connection };
}

export interface MailboxRoutingDeps {
  /** The Resend adapter (default sending path). */
  fallback: EmailProviderAdapter;
  /**
   * Resolves the SELECTED email account for this send (campaign or
   * conversation scoped), or null when none is selected.
   */
  resolveAccount: (
    input: SendEmailInput
  ) => Promise<ConnectedAccount | null>;
  /** Loads the OAuth grant stored for an account (workspace-scoped). */
  loadConnection: (
    workspaceId: string,
    accountId: string
  ) => Promise<OAuthConnectionRow | null>;
  /** Builds the mailbox adapter for a decided route. */
  buildMailboxAdapter: (
    provider: OAuthProvider,
    connection: OAuthConnectionRow
  ) => EmailProviderAdapter;
}

export class MailboxRoutingAdapter implements EmailProviderAdapter {
  readonly provider = "mailbox-router";
  private readonly deps: MailboxRoutingDeps;

  constructor(deps: MailboxRoutingDeps) {
    this.deps = deps;
  }

  getState(): ProviderState {
    return this.deps.fallback.getState();
  }

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    let account: ConnectedAccount | null = null;
    try {
      account = await this.deps.resolveAccount(input);
    } catch {
      // Account resolution is a DB read; if it fails, Resend's own
      // fail-closed suppression check still protects the send, and
      // the campaign simply behaves as it did before this stage
      // (no account selected → EMAIL_FROM). A resolution failure
      // never fabricates a mailbox route.
      account = null;
    }
    if (!account || !oauthProviderForAccountLabel(account.provider)) {
      return this.deps.fallback.sendEmail(input);
    }

    let connection: OAuthConnectionRow | null = null;
    try {
      connection = await this.deps.loadConnection(
        input.workspaceId,
        account.id
      );
    } catch {
      connection = null;
    }

    const decision = decideSendRoute(account, connection);
    switch (decision.kind) {
      case "fallback":
        return this.deps.fallback.sendEmail(input);
      case "refuse":
        return {
          status: "error",
          provider: mailboxLabel(decision.provider),
          providerMessageId: null,
          message: decision.message,
        };
      case "mailbox": {
        const adapter = this.deps.buildMailboxAdapter(
          decision.provider,
          decision.connection
        );
        return adapter.sendEmail({
          ...input,
          from: input.from ?? decision.account.handle_or_email,
        });
      }
    }
  }
}
