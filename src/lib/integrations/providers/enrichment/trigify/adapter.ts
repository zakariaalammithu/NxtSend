/**
 * Trigify enrichment adapter — PROVIDER BLOCKED (shut down).
 *
 * Trigify ceased operations on 22 October 2026; every operation
 * throws `provider_unavailable` with an explanation. This is
 * deliberate: there is no Trigify API left to call. See config.ts.
 */

import type { ProviderError } from "../../types";
import type { SyncResult } from "../../types";
import type {
  BulkEnrichmentOptions,
  EnrichLeadInput,
  EnrichmentAdapter,
  EnrichmentResult,
} from "../types";
import { toLeadPatch } from "../common";
import { TRIGIFY_CONFIG } from "./config";

function blocked(): never {
  const error = new Error(
    "Trigify shut down on 22 October 2026 (its team joined HubSpot and the standalone platform was wound down). API access, monitoring, and signal collection all stopped, so there is no Trigify endpoint for NxtSend to call. See docs/integrations/providers/enrichment-trigify.md."
  ) as Error & ProviderError;
  error.code = "provider_unavailable";
  error.status = 0;
  error.retryable = false;
  throw error;
}

export function createTrigifyAdapter(): EnrichmentAdapter {
  const adapter: EnrichmentAdapter = {
    provider: "trigify",

    async enrichLead(_input: EnrichLeadInput): Promise<EnrichmentResult> {
      void _input;
      blocked();
    },

    async enrichCompany(_input: { domain?: string; name?: string }): Promise<EnrichmentResult> {
      void _input;
      blocked();
    },

    async findEmail(_input: EnrichLeadInput): Promise<EnrichmentResult> {
      void _input;
      blocked();
    },

    async bulkEnrich(
      _inputs: EnrichLeadInput[],
      _options: BulkEnrichmentOptions
    ): Promise<SyncResult> {
      void _inputs;
      void _options;
      blocked();
    },

    async getCreditBalance(): Promise<number | null> {
      blocked();
    },
  };

  return adapter;
}

export { TRIGIFY_CONFIG, toLeadPatch };
