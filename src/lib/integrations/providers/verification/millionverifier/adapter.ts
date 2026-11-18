/**
 * MillionVerifier email verification adapter.
 *
 * GET /api/v3/ verified against developer.millionverifier.com (see
 * config.ts). The `result` classification is preserved VERBATIM
 * (ok / catch_all / unknown / error / disposable / invalid).
 * MillionVerifier returns HTTP 200 even for auth failures, so a
 * result of "error" is treated as a provider error, not a
 * verification outcome. 1 credit per verification.
 */

import { ProviderHttpClient } from "../../client";
import type { ProviderError } from "../../types";
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
import { MILLIONVERIFIER_CONFIG } from "./config";

function boolOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export interface MillionVerifierAdapterOptions {
  apiKey: string;
  recordUsage?: UsageRecorder;
  client?: ProviderHttpClient;
  timeoutSeconds?: number;
}

export function createMillionVerifierAdapter(
  opts: MillionVerifierAdapterOptions
): VerificationAdapter {
  const apiKey = requireApiKey(opts.apiKey, "MillionVerifier");
  const timeoutSeconds = opts.timeoutSeconds ?? MILLIONVERIFIER_CONFIG.defaultTimeoutSeconds;
  const client =
    opts.client ??
    new ProviderHttpClient({
      baseUrl: MILLIONVERIFIER_CONFIG.baseUrl,
      // MillionVerifier's documented auth is the `api` query
      // parameter; there is no header auth for the single API.
      getAuthHeaders: () => ({}),
    });
  const recordUsage = opts.recordUsage;

  const adapter: VerificationAdapter = {
    provider: "millionverifier",

    async verifyEmail(email: string): Promise<VerificationResult> {
      try {
        const res = await client.request<{
          email?: string;
          result?: string;
          resultcode?: string | number;
          subresult?: string;
          quality?: string | number;
          free?: boolean;
          role?: boolean;
          didyoumean?: string;
          credits?: number;
        }>({
          method: "GET",
          path: "/api/v3/",
          query: {
            api: apiKey,
            email,
            timeout: String(timeoutSeconds),
          },
        });
        const classification = typeof res.result === "string" ? res.result : "unknown";
        if (classification === "error") {
          const error = new Error(
            `MillionVerifier returned result "error" for ${email} (subresult: ${res.subresult ?? "not given"}). This usually means an invalid API key or no credits — check the key and balance.`
          ) as Error & ProviderError;
          error.code = "provider_verification_error";
          error.status = 0;
          error.retryable = false;
          throw error;
        }
        const result: VerificationResult = {
          provider: "millionverifier",
          email: res.email ?? email,
          classification,
          substatus: typeof res.subresult === "string" ? res.subresult : null,
          isDisposable: classification === "disposable" ? true : null,
          isCatchAll: classification === "catch_all",
          isRoleAccount: boolOrNull(res.role),
          isFreeProvider: boolOrNull(res.free),
          score: typeof res.quality === "number" ? res.quality : null,
          didYouMean: typeof res.didyoumean === "string" && res.didyoumean ? res.didyoumean : null,
          creditsUsed: 1,
          creditsRemaining: typeof res.credits === "number" ? res.credits : null,
          raw: res as unknown as Record<string, unknown>,
        };
        if (recordUsage) await recordUsage("millionverifier.verify", 1);
        return result;
      } catch (err) {
        if (err instanceof Error && (err as Error & ProviderError).code === "provider_verification_error") {
          throw err;
        }
        throw mapAuthError(err, "MillionVerifier");
      }
    },

    async verifyBulk(items: BulkVerificationItem[], options: BulkVerificationOptions) {
      return runBulkVerification({
        provider: "millionverifier",
        items,
        verifyOne: (email) => adapter.verifyEmail(email),
        options,
      });
    },

    async getCreditBalance(): Promise<number | null> {
      try {
        const res = await client.request<{ credits?: number }>({
          method: "GET",
          path: "/api/v3/credits",
          query: { api: apiKey },
        });
        return typeof res.credits === "number" ? res.credits : null;
      } catch (err) {
        throw mapAuthError(err, "MillionVerifier");
      }
    },
  };

  return adapter;
}

export { toLeadPatch };
