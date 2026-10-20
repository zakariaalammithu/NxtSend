/**
 * Account health presentation — pure derivations over the recorded
 * provider health fields (migration 013), shared by the Connected
 * Accounts page and the LinkedIn page.
 *
 * Two facts are ALWAYS kept separate in the UI, and this module only
 * ever speaks about the first:
 *   1. the ACCOUNT RECORD's health — the last recorded authorization
 *      state of one connected_accounts row (this module);
 *   2. the PROVIDER's state — whether any approved LinkedIn provider
 *      is configured at all (src/lib/linkedin/state.ts).
 * An account can be perfectly healthy (auth_status "ok") while the
 * provider state is still "Configuration Required" — e.g. the demo
 * seed — and no surface may merge the two into "LinkedIn works".
 */

import type { AccountAuthStatus, ConnectedAccount } from "@/types";

export type AccountHealthTone = "ok" | "warning" | "error" | "muted";

export interface AccountHealthView {
  authStatus: AccountAuthStatus;
  label: string;
  description: string;
  tone: AccountHealthTone;
  /**
   * "reconnect" — the authorization needs the operator (expired /
   * needs_reconnect); the UI routes it to the integration page,
   * where reconnecting happens through the provider — never a
   * password form.
   * "review" — something needs a look (provider error, or nothing
   * was ever connected); same destination, different label.
   * "none" — the record is fine; no action offered.
   */
  action: "reconnect" | "review" | "none";
  actionLabel: string | null;
}

type HealthFields = Pick<
  ConnectedAccount,
  "auth_status" | "last_sync_at" | "last_error"
>;

export function accountHealthView(account: HealthFields): AccountHealthView {
  switch (account.auth_status) {
    case "ok":
      return {
        authStatus: "ok",
        label: "Authorized",
        description: account.last_sync_at
          ? "The provider last reported this account authorized."
          : "Recorded as authorized. No provider sync has been recorded yet.",
        tone: "ok",
        action: "none",
        actionLabel: null,
      };
    case "needs_reconnect":
      return {
        authStatus: "needs_reconnect",
        label: "Needs reconnect",
        description:
          "The provider reports this account needs to be re-authorized before it can be used again.",
        tone: "warning",
        action: "reconnect",
        actionLabel: "Reconnect",
      };
    case "expired":
      return {
        authStatus: "expired",
        label: "Authorization expired",
        description:
          "The authorization for this account has expired. Reconnect it through the provider to use it again.",
        tone: "warning",
        action: "reconnect",
        actionLabel: "Reconnect",
      };
    case "error":
      return {
        authStatus: "error",
        label: "Provider error",
        description: account.last_error
          ? `The provider last reported: ${account.last_error}`
          : "The provider last reported an error for this account.",
        tone: "error",
        action: "review",
        actionLabel: "Review connection",
      };
    case "not_connected":
    default:
      return {
        authStatus: "not_connected",
        label: "Not connected",
        description:
          "Nothing has authorized this account record yet. Accounts are authorized through the provider integration — never with a password or cookies here.",
        tone: "muted",
        action: "review",
        actionLabel: "Open integration",
      };
  }
}

/** Where a health action routes, per channel (+ provider) — the
 *  integration page that owns connecting/reconnecting that account.
 *  Mailbox OAuth accounts (P5 Stage G) route to their own provider
 *  page, where the real Connect/Disconnect controls live. */
export function accountHealthActionHref(
  channel: ConnectedAccount["channel"],
  provider?: string | null
): string {
  if (channel === "linkedin") return "/dashboard/integrations/linkedin";
  if (provider === "gmail") return "/dashboard/integrations/gmail";
  if (provider === "microsoft") return "/dashboard/integrations/microsoft";
  return "/dashboard/integrations/resend";
}
