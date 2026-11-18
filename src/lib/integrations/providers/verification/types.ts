/**
 * Shared email-verification types.
 *
 * The one hard rule: `classification` is the provider's own status
 * string, preserved VERBATIM — never normalised into a shared
 * vocabulary. Different providers use different words for the same
 * idea (Hunter "deliverable", ZeroBounce "valid", MillionVerifier
 * "ok"), and collapsing them would destroy information the operator
 * needs when deciding whether to mail an address. Any derived
 * reading (e.g. "safe to send") is the caller's decision, made from
 * the verbatim value, not the adapter's.
 */

import type { SyncJobStore } from "../sync";
import type { SyncResult } from "../types";
import type { UsageRecorder } from "../usage";

export interface BulkVerificationItem {
  leadId?: string;
  email: string;
}

export interface BulkVerificationOptions {
  workspaceId: string;
  syncJobStore: SyncJobStore;
  recordUsage?: UsageRecorder;
  /**
   * Optional lead writer. When supplied (with leadId on each item),
   * the adapter persists each result onto its lead via updateLead.
   * Adapters never import the leads repository directly.
   */
  updateLead?: (id: string, patch: Record<string, unknown>) => Promise<unknown>;
}

export interface VerificationResult {
  provider: string;
  email: string;
  /** The provider's own status string, verbatim. */
  classification: string;
  /** The provider's own sub-status, verbatim, or null when not supplied. */
  substatus: string | null;
  isDisposable: boolean | null;
  isCatchAll: boolean | null;
  isRoleAccount: boolean | null;
  isFreeProvider: boolean | null;
  /** Provider score where one is supplied (scale is provider-defined), else null. */
  score: number | null;
  /** Provider's typo suggestion, verbatim, or null. */
  didYouMean: string | null;
  creditsUsed: number;
  /** Remaining balance when the provider reports it, otherwise null. */
  creditsRemaining: number | null;
  /** Full provider payload (secrets never present in provider payloads). */
  raw: Record<string, unknown>;
}

export interface VerificationAdapter {
  readonly provider: string;
  verifyEmail(email: string): Promise<VerificationResult>;
  verifyBulk(
    items: BulkVerificationItem[],
    options: BulkVerificationOptions
  ): Promise<SyncResult>;
  getCreditBalance(): Promise<number | null>;
}
