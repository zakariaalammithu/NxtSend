/**
 * Hunter Email Verifier adapter.
 *
 * GET /email-verifier verified against hunter.io/api-documentation
 * (see config.ts). The `data.status` classification is preserved
 * VERBATIM (deliverable / undeliverable / risky / unknown). No
 * email is ever sent by verification — Hunter checks syntax, MX,
 * and SMTP handshake only.
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
import { HUNTER_VERIFIER_CONFIG } from "./config";

function boolOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export interface HunterVerifierAdapterOptions {
  apiKey: string;
  recordUsage?: UsageRecorder;
  client?: ProviderHttpClient;
}

export function createHunterVerifierAdapter(
  opts: HunterVerifierAdapterOptions
): VerificationAdapter {
  const apiKey = requireApiKey(opts.apiKey, "Hunter.io");
  const client =
    opts.client ??
    new ProviderHttpClient({
      baseUrl: HUNTER_VERIFIER_CONFIG.baseUrl,
      // X-API-KEY header keeps the key out of URLs and logs.
      getAuthHeaders: () => ({ "X-API-KEY": apiKey }),
    });
  const recordUsage = opts.recordUsage;

  const adapter: VerificationAdapter = {
    provider: "hunter-verifier",

    async verifyEmail(email: string): Promise<VerificationResult> {
      try {
        const res = await client.request<{
          data?: {
            status?: string;
            result?: string;
            score?: number;
            email?: string;
            regexp?: boolean;
            gibberish?: boolean;
            disposable?: boolean;
            webmail?: boolean;
            mx_records?: boolean;
            smtp_server?: boolean;
            smtp_check?: boolean;
            accept_all?: boolean;
            block?: boolean;
            sources?: Array<{ domain?: string; uri?: string }> | null;
          } | null;
        }>({
          method: "GET",
          path: "/email-verifier",
          query: { email },
        });
        const data = res.data ?? null;
        const classification = typeof data?.status === "string" ? data.status : "unknown";
        const result: VerificationResult = {
          provider: "hunter-verifier",
          email: data?.email ?? email,
          classification,
          substatus: typeof data?.result === "string" ? data.result : null,
          isDisposable: boolOrNull(data?.disposable),
          isCatchAll: boolOrNull(data?.accept_all),
          isRoleAccount: null,
          isFreeProvider: boolOrNull(data?.webmail),
          score: typeof data?.score === "number" ? data.score : null,
          didYouMean: null,
          creditsUsed: 1,
          creditsRemaining: null,
          raw: res as unknown as Record<string, unknown>,
        };
        if (recordUsage) await recordUsage("hunter.email-verifier", 1);
        return result;
      } catch (err) {
        throw mapAuthError(err, "Hunter.io");
      }
    },

    async verifyBulk(items: BulkVerificationItem[], options: BulkVerificationOptions) {
      return runBulkVerification({
        provider: "hunter-verifier",
        items,
        verifyOne: (email) => adapter.verifyEmail(email),
        options,
      });
    },

    async getCreditBalance(): Promise<number | null> {
      try {
        const res = await client.request<{
          data?: {
            requests?: { verifications?: { available?: number } | null } | null;
          } | null;
        }>({ method: "GET", path: "/account" });
        const available = res.data?.requests?.verifications?.available;
        return typeof available === "number" ? available : null;
      } catch (err) {
        throw mapAuthError(err, "Hunter.io");
      }
    },
  };

  return adapter;
}

export { toLeadPatch };
