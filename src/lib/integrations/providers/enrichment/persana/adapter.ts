/**
 * Persana AI enrichment adapter — CONFIG-READY STUB.
 *
 * No public API reference (base URL, auth, endpoint paths) could
 * be verified for Persana in this pass, so every operation throws
 * `provider_endpoint_unverified` instead of guessing a URL. The
 * shape of the adapter matches the other enrichment adapters so
 * the coordinator can wire it in the moment the reference is
 * supplied — only the endpoint calls are missing.
 */

import type { SyncResult } from "../../types";
import type {
  BulkEnrichmentOptions,
  EnrichLeadInput,
  EnrichmentAdapter,
  EnrichmentResult,
} from "../types";
import { toLeadPatch, unverifiedEndpoint } from "../common";
import { PERSANA_CONFIG } from "./config";

function notImplemented(): never {
  throw unverifiedEndpoint("Persana AI", "enrichment");
}

export function createPersanaAdapter(): EnrichmentAdapter {
  const adapter: EnrichmentAdapter = {
    provider: "persana",

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

export { PERSANA_CONFIG, toLeadPatch };
