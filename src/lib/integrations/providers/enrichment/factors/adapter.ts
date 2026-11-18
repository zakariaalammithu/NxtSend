/**
 * Factors.ai enrichment adapter — CONFIG-READY STUB.
 *
 * No public API reference (base URL, auth, endpoint paths) could
 * be verified for Factors.ai in this pass, so every operation
 * throws `provider_endpoint_unverified` instead of guessing a URL.
 * Same shape as the other enrichment adapters so the coordinator
 * can wire it in the moment the reference is supplied.
 */

import type { SyncResult } from "../../types";
import type {
  BulkEnrichmentOptions,
  EnrichLeadInput,
  EnrichmentAdapter,
  EnrichmentResult,
} from "../types";
import { toLeadPatch, unverifiedEndpoint } from "../common";
import { FACTORS_CONFIG } from "./config";

function notImplemented(): never {
  throw unverifiedEndpoint("Factors.ai", "enrichment");
}

export function createFactorsAdapter(): EnrichmentAdapter {
  const adapter: EnrichmentAdapter = {
    provider: "factors",

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

export { FACTORS_CONFIG, toLeadPatch };
