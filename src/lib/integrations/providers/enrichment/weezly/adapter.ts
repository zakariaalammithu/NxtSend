/**
 * Weezly enrichment adapter — NOT IMPLEMENTED STUB.
 *
 * No public Weezly developer API could be found, so every
 * operation throws `provider_endpoint_unverified` instead of
 * guessing a URL. Same shape as the other enrichment adapters so
 * the coordinator can wire it in the moment a reference exists.
 */

import type { SyncResult } from "../../types";
import type {
  BulkEnrichmentOptions,
  EnrichLeadInput,
  EnrichmentAdapter,
  EnrichmentResult,
} from "../types";
import { toLeadPatch, unverifiedEndpoint } from "../common";
import { WEEZLY_CONFIG } from "./config";

function notImplemented(): never {
  throw unverifiedEndpoint("Weezly", "enrichment");
}

export function createWeezlyAdapter(): EnrichmentAdapter {
  const adapter: EnrichmentAdapter = {
    provider: "weezly",

    async enrichLead(_input: EnrichLeadInput): Promise<EnrichmentResult> {
      void _input;
      notImplemented();
    },

    async enrichCompany(_input: { domain?: string; name?: string }): Promise<EnrichmentResult> {
      void _input;
      notImplemented();
    },

    async findEmail(_input: EnrichLeadInput): Promise<EnrichmentResult> {
      void _input;
      notImplemented();
    },

    async bulkEnrich(
      _inputs: EnrichLeadInput[],
      _options: BulkEnrichmentOptions
    ): Promise<SyncResult> {
      void _inputs;
      void _options;
      notImplemented();
    },

    async getCreditBalance(): Promise<number | null> {
      notImplemented();
    },
  };

  return adapter;
}

export { WEEZLY_CONFIG, toLeadPatch };
