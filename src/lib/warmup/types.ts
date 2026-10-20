/**
 * Email warm-up provider module — types (P5 Stage E).
 *
 * Warm-up in NxtSend is an ADAPTER TO AN EXTERNAL PROVIDER ONLY
 * (Instantly — see ./instantly.ts). The provider operates its own
 * warm-up network and performs the gradual sending-volume ramp inside
 * ITS infrastructure. NxtSend:
 *
 *   - never sends, opens, replies to, or clicks warm-up mail itself;
 *   - never computes a warm-up score, progress, or health figure;
 *   - displays ONLY values the provider's API reports, mapped
 *     field-by-field (see ./instantly.ts for the documented sources);
 *   - reads "Unavailable — provider not connected" until a real
 *     provider credential exists AND the provider answers.
 *
 * The interface deliberately exposes read operations only. Instantly
 * documents warm-up enable/disable endpoints, but NxtSend does not
 * call them: enabling warm-up is an operator action taken in the
 * provider's own dashboard, so this app can never start engagement
 * activity by itself.
 */

import type { ProviderState } from "@/lib/env";

export type { ProviderState };

/** Provider-reported per-mailbox warm-up analytics (aggregate window
 *  as returned by the provider — Instantly's warmup-analytics call
 *  returns its own aggregate; NxtSend does not re-aggregate). */
export interface WarmupMailboxAnalytics {
  sent: number | null;
  received: number | null;
  landedInbox: number | null;
  landedSpam: number | null;
  /** Provider-computed health score + its label, verbatim. */
  healthScore: number | null;
  healthScoreLabel: string | null;
}

/** One mailbox's warm-up status, mapped from provider fields only. */
export interface WarmupMailbox {
  email: string;
  /** Provider account-status code + the provider's own label for it. */
  accountStatusCode: number | null;
  accountStatusLabel: string;
  /**
   * Mapped warm-up status from the provider's warmup_status enum:
   *   active | paused | banned | spam_folder_unknown |
   *   permanent_suspension | unknown (code not in the documented enum,
   *   or the field was absent — the raw code is preserved alongside).
   */
  warmupStatus:
    | "active"
    | "paused"
    | "banned"
    | "spam_folder_unknown"
    | "permanent_suspension"
    | "unknown";
  warmupStatusCode: number | null;
  warmupStatusLabel: string;
  /** Daily warm-up sending limit AS SET at the provider (warmup.limit). */
  warmupDailyLimit: number | null;
  /** Provider ramp setting (warmup.increment): "disabled" or "0"–"4". */
  warmupIncrement: string | null;
  /** Provider slow-ramp flag for regular sending (enable_slow_ramp). */
  slowRamp: boolean | null;
  /** Regular daily sending limit at the provider (daily_limit). */
  dailyLimit: number | null;
  /** Provider-computed warm-up score (stat_warmup_score), verbatim. */
  warmupScore: number | null;
  /** When the provider says warm-up started (timestamp_warmup_start). */
  warmupStartedAt: string | null;
  /** Mailbox provider label from provider_code (Google, Microsoft, …). */
  mailboxProvider: string | null;
  analytics: WarmupMailboxAnalytics | null;
}

export interface WarmupStatusReport {
  provider: string;
  providerLabel: string;
  /** ISO timestamp of THIS fetch — the data is exactly this fresh. */
  fetchedAt: string;
  mailboxes: WarmupMailbox[];
  /** Set when the accounts list succeeded but the analytics call
   *  failed: mailboxes are shown without analytics, with the reason. */
  analyticsError: string | null;
}

export type WarmupStatusResult =
  | { ok: true; report: WarmupStatusReport }
  | {
      ok: false;
      /** demo / not_connected / configuration_required / error. */
      state: ProviderState;
      message: string;
    };

export interface WarmupVerifyResult {
  ok: boolean;
  /** True only when the provider was actually called. */
  attempted: boolean;
  state: ProviderState;
  message: string;
}

export interface WarmupProviderAdapter {
  readonly provider: string;
  readonly providerLabel: string;
  getState(): ProviderState;
  /** One safe, read-only call proving the credential works. */
  verifyConnection(): Promise<WarmupVerifyResult>;
  /** Provider-reported warm-up status for every mailbox it returns. */
  getWarmupStatus(): Promise<WarmupStatusResult>;
}
