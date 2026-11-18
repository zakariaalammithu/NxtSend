/**
 * Bouncer email verification adapter.
 *
 * GET /v1.1/email/verify verified against Bouncer's API v1.1 docs
 * (see config.ts). The `status` classification is preserved
 * VERBATIM (deliverable / risky / undeliverable / unknown), as is
 * `reason`. Bulk runs as sequential single checks: the native batch
 * endpoint exists but its result-retrieval path is unverified.
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
import { BOUNCER_CONFIG } from "./config";

function boolOrNull(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

export interface BouncerAdapterOptions {
  apiKey: string;
  recordUsage?: UsageRecorder;
  client?: ProviderHttpClient;
}

export function createBouncerAdapter(opts: BouncerAdapterOptions): VerificationAdapter {
  const apiKey = requireApiKey(opts.apiKey, "Bouncer");
  const client =
    opts.client ??
    new ProviderHttpClient({
      baseUrl: BOUNCER_CONFIG.baseUrl,
      getAuthHeaders: () => ({ "x-api-key": apiKey }),
    });
  const recordUsage = opts.recordUsage;

  const adapter: VerificationAdapter = {
    provider: "bouncer",

    async verifyEmail(email: string): Promise<VerificationResult> {
      try {
        const res = await client.request<{
          status?: string;
          reason?: string;
          domain?: { name?: string; disposable?: string | boolean; free?: string | boolean } | null;
          account?: { role?: string | boolean; disposable?: string | boolean; fullMailbox?: string | boolean } | null;
          dns?: Record<string, unknown> | null;
          score?: number;
          credits?: number;
        }>({
          method: "GET",
          path: "/v1.1/email/verify",
          query: { email, download: "false" },
        });
        const classification = typeof res.status === "string" ? res.status : "unknown";
        const result: VerificationResult = {
          provider: "bouncer",
          email,
          classification,
          substatus: typeof res.reason === "string" && res.reason ? res.reason : null,
          isDisposable:
            boolOrNull(res.account?.disposable) ?? boolOrNull(res.domain?.disposable),
          isCatchAll: null,
          isRoleAccount: boolOrNull(res.account?.role),
          isFreeProvider: boolOrNull(res.domain?.free),
          score: typeof res.score === "number" ? res.score : null,
          didYouMean: null,
          creditsUsed: 1,
          creditsRemaining: typeof res.credits === "number" ? res.credits : null,
          raw: res as unknown as Record<string, unknown>,
        };
        if (recordUsage) await recordUsage("bouncer.email.verify", 1);
        return result;
      } catch (err) {
        throw mapAuthError(err, "Bouncer");
      }
    },

    async verifyBulk(items: BulkVerificationItem[], options: BulkVerificationOptions) {
      return runBulkVerification({
        provider: "bouncer",
        items,
        verifyOne: (email) => adapter.verifyEmail(email),
        options,
      });
    },

    async getCreditBalance(): Promise<number | null> {
      try {
        const res = await client.request<{ credits?: number }>({
          method: "GET",
          path: "/v1.1/credits",
        });
        return typeof res.credits === "number" ? res.credits : null;
      } catch (err) {
        throw mapAuthError(err, "Bouncer");
      }
    },
  };

  return adapter;
}

export { toLeadPatch };
