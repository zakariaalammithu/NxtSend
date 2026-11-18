/**
 * NeverBounce email verification adapter.
 *
 * POST /v4/single/check verified against
 * developers.neverbounce.com (see config.ts). The `result`
 * classification is preserved VERBATIM (valid / invalid /
 * disposable / catchall / unknown). Bulk runs as sequential single
 * checks: NeverBounce's jobs API is form-encoded, which the
 * Stage-1 ProviderHttpClient does not send.
 */

import { ProviderHttpClient } from "../../client";
import type { UsageRecorder } from "../../usage";
import type {
  BulkVerificationItem,
  BulkVerificationOptions,
  VerificationAdapter,
  VerificationResult,
} from "../types";
import {
  mapAuthError,
  requireApiKey,
  runBulkVerification,
  toLeadPatch,
} from "../common";
import { NEVERBOUNCE_CONFIG } from "./config";

export interface NeverBounceAdapterOptions {
  apiKey: string;
  recordUsage?: UsageRecorder;
  client?: ProviderHttpClient;
}

export function createNeverBounceAdapter(opts: NeverBounceAdapterOptions): VerificationAdapter {
  const apiKey = requireApiKey(opts.apiKey, "NeverBounce");
  const client =
    opts.client ??
    new ProviderHttpClient({
      baseUrl: NEVERBOUNCE_CONFIG.baseUrl,
      // NeverBounce v4 auth is the `key` query parameter.
      getAuthHeaders: () => ({}),
    });
  const recordUsage = opts.recordUsage;

  const adapter: VerificationAdapter = {
    provider: "neverbounce",

    async verifyEmail(email: string): Promise<VerificationResult> {
      try {
        const res = await client.request<{
          status?: string;
          result?: string;
          result_code?: number;
          flags?: string[];
          suggested_correction?: string;
          retry_token?: string;
          execution_time?: number;
          credits_info?: { paid_credits_used?: number; free_credits_used?: number };
          address_info?: { original_email?: string; normalized_email?: string };
        }>({
          method: "POST",
          path: "/single/check",
          query: { key: apiKey, email, credits_info: "1", address_info: "1" },
        });
        const classification = typeof res.result === "string" ? res.result : "unknown";
        const flags = Array.isArray(res.flags) ? res.flags : [];
        const result: VerificationResult = {
          provider: "neverbounce",
          email: res.address_info?.normalized_email ?? email,
          classification,
          substatus: typeof res.result_code === "number" ? String(res.result_code) : null,
          isDisposable: classification === "disposable" ? true : flags.includes("disposable") ? true : null,
          isCatchAll: classification === "catchall" ? true : flags.includes("catchall") ? true : null,
          isRoleAccount: flags.includes("role_account") ? true : null,
          isFreeProvider: flags.includes("free_email_host") ? true : null,
          score: null,
          didYouMean:
            typeof res.suggested_correction === "string" && res.suggested_correction
              ? res.suggested_correction
              : null,
          creditsUsed: 1,
          creditsRemaining: null,
          raw: res as unknown as Record<string, unknown>,
        };
        if (recordUsage) await recordUsage("neverbounce.single.check", 1);
        return result;
      } catch (err) {
        throw mapAuthError(err, "NeverBounce");
      }
    },

    async verifyBulk(items: BulkVerificationItem[], options: BulkVerificationOptions) {
      return runBulkVerification({
        provider: "neverbounce",
        items,
        verifyOne: (email) => adapter.verifyEmail(email),
        options,
      });
    },

    async getCreditBalance(): Promise<number | null> {
      try {
        const res = await client.request<{
          credits_info?: {
            paid_credits_remaining?: number;
            free_credits_remaining?: number;
            paid_credits_used?: number;
            free_credits_used?: number;
          } | null;
        }>({
          method: "GET",
          path: "/account/info",
          query: { key: apiKey },
        });
        const info = res.credits_info;
        if (!info) return null;
        const paid = typeof info.paid_credits_remaining === "number" ? info.paid_credits_remaining : null;
        const free = typeof info.free_credits_remaining === "number" ? info.free_credits_remaining : null;
        if (paid === null && free === null) return null;
        return (paid ?? 0) + (free ?? 0);
      } catch (err) {
        throw mapAuthError(err, "NeverBounce");
      }
    },
  };

  return adapter;
}

export { toLeadPatch };
