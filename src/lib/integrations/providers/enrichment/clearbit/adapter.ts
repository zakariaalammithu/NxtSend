/**
 * Clearbit enrichment adapter — PROVIDER BLOCKED.
 *
 * The standalone Clearbit API was deprecated after HubSpot's
 * acquisition (Dec 2023) and is not available to new customers, so
 * every operation throws `provider_unavailable` with an
 * explanation. This is deliberate: calling the legacy Clearbit
 * endpoints would fail for any new account and would mislead the
 * operator into thinking enrichment works. See config.ts.
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
import { CLEARBIT_CONFIG } from "./config";

function blocked(): never {
  const error = new Error(
    "Clearbit's standalone enrichment API is deprecated: HubSpot acquired Clearbit in December 2023 and enrichment now runs only inside a paid HubSpot subscription (Breeze Intelligence / data enrichment). There is no standalone Clearbit endpoint for NxtSend to call. See docs/integrations/providers/enrichment-clearbit.md."
  ) as Error & ProviderError;
  error.code = "provider_unavailable";
  error.status = 0;
  error.retryable = false;
  throw error;
}

export function createClearbitAdapter(): EnrichmentAdapter {
  const adapter: EnrichmentAdapter = {
    provider: "clearbit",

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

export { CLEARBIT_CONFIG, toLeadPatch };
