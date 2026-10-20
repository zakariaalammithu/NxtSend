/**
 * LinkedIn provider module — types (P5 Stage F).
 *
 * This module is THE seam where an approved LinkedIn provider plugs
 * in. LinkedIn has no general public outreach API, and NxtSend's
 * rules are absolute:
 *
 *   - LinkedIn automation happens ONLY through an approved
 *     provider's official API (a LinkedIn partner / authorized
 *     outreach provider with its own compliance model).
 *   - NO CAPTCHA bypass, NO stealth or browser automation, NO
 *     restriction evasion, NO password/cookie collection — ever.
 *   - NO fake "Connected" state: until a real provider adapter is
 *     implemented behind this interface AND verifies against the
 *     provider, every capability refuses honestly.
 *
 * Today NO vendor is wired: the only implementation is
 * NotConfiguredLinkedInAdapter (./not-configured.ts). The call sites
 * that will dispatch through this interface once a provider exists
 * are already marked:
 *   - the executor's LinkedIn branch (src/lib/executor/core.ts) —
 *     currently records every LinkedIn step `skipped`;
 *   - the inbox reply service (src/lib/inbox/reply.ts) — currently
 *     refuses LinkedIn replies with `linkedin_unavailable` (HTTP 422).
 */

import type { ProviderState } from "@/lib/env";
import type { AccountAuthStatus } from "@/types";

export type { ProviderState };
export type { AccountAuthStatus };

export interface LinkedInSendMessageInput {
  /** connected_accounts.id of the sending LinkedIn account. */
  accountId: string;
  /** The account's id at the provider (migration 013), when known. */
  providerAccountId?: string | null;
  leadId: string;
  leadLinkedInUrl?: string | null;
  body: string;
}

export interface LinkedInConnectionRequestInput {
  /** connected_accounts.id of the sending LinkedIn account. */
  accountId: string;
  /** The account's id at the provider (migration 013), when known. */
  providerAccountId?: string | null;
  leadId: string;
  leadLinkedInUrl?: string | null;
  /** Optional connection note (providers cap this, e.g. 300 chars). */
  note?: string;
}

/** The subset of a connected_accounts record health checks read. */
export interface LinkedInAccountRef {
  id: string;
  provider_account_id: string | null;
  auth_status: AccountAuthStatus;
  last_sync_at: string | null;
  last_error: string | null;
}

export interface LinkedInAccountHealth {
  accountId: string;
  /**
   * The account's authorization state. While no provider is wired
   * this is the LAST RECORDED state from the account record
   * (migration 013) — not a fresh provider answer; `verifiedLive`
   * says which one it is.
   */
  authStatus: AccountAuthStatus;
  lastSyncAt: string | null;
  lastError: string | null;
  /** True only when a live provider call produced this answer. */
  verifiedLive: boolean;
  /** Plain-language explanation of the state above. */
  detail: string;
}

export type LinkedInActionResult =
  | {
      ok: true;
      /** Provider-assigned message/action id — the duplicate key. */
      providerMessageId: string;
      message: string;
    }
  | {
      ok: false;
      state: ProviderState;
      code: "provider_not_configured" | "provider_error";
      message: string;
    };

/**
 * The adapter contract a chosen approved provider implements.
 * Implementations live beside this file (one per vendor), are chosen
 * by createLinkedInAdapter() in ./index.ts, and must follow the same
 * honest-state discipline as the email/warm-up adapters: "sent" only
 * with a provider-assigned id, errors surfaced with the provider's
 * own message, and account health reported from provider data only.
 */
export interface LinkedInProviderAdapter {
  /** Vendor key, e.g. the value of LINKEDIN_PROVIDER. */
  readonly provider: string;
  readonly providerLabel: string;
  getState(): ProviderState;
  sendMessage(input: LinkedInSendMessageInput): Promise<LinkedInActionResult>;
  sendConnectionRequest(
    input: LinkedInConnectionRequestInput
  ): Promise<LinkedInActionResult>;
  getAccountHealth(account: LinkedInAccountRef): Promise<LinkedInAccountHealth>;
}
