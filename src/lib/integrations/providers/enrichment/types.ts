/**
 * Shared enrichment types — the shape every enrichment adapter
 * returns, whatever provider it wraps.
 *
 * Honesty rules:
 *  - Every returned field carries its `source` (the provider id)
 *    and a `confidence` (0–1) that is null when the provider
 *    supplies no confidence score — never invented.
 *  - `matched: false` means the provider returned no record; the
 *    adapter must not fabricate fields in that case.
 *  - `creditsUsed` follows the provider's documented credit model;
 *    0 when the provider charged nothing for the call.
 */

import type { SyncJobStore } from "../sync";
import type { SyncResult } from "../types";
import type { UsageRecorder } from "../usage";

export interface EnrichLeadInput {
  email?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  domain?: string;
  linkedinUrl?: string;
}

/** One enriched value, with its provenance attached. */
export interface EnrichedField {
  value: unknown;
  /** 0–1 when the provider supplies one, otherwise null (never invented). */
  confidence: number | null;
  /** Provider id that supplied the value, e.g. "apollo". */
  source: string;
}

export interface EnrichmentResult {
  provider: string;
  matched: boolean;
  /** Overall match confidence 0–1, or null when the provider supplies none. */
  confidence: number | null;
  fields: Record<string, EnrichedField>;
  creditsUsed: number;
  /** Remaining balance when the provider reports it, otherwise null. */
  creditsRemaining: number | null;
}

export interface BulkEnrichmentOptions {
  workspaceId: string;
  syncJobStore: SyncJobStore;
  recordUsage?: UsageRecorder;
}

export interface EnrichmentAdapter {
  readonly provider: string;
  enrichLead(input: EnrichLeadInput): Promise<EnrichmentResult>;
  enrichCompany(input: { domain?: string; name?: string }): Promise<EnrichmentResult>;
  findEmail(input: EnrichLeadInput): Promise<EnrichmentResult>;
  bulkEnrich(
    inputs: EnrichLeadInput[],
    options: BulkEnrichmentOptions
  ): Promise<SyncResult>;
  getCreditBalance(): Promise<number | null>;
}
