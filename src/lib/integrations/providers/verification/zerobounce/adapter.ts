/**
 * ZeroBounce email verification adapter.
 *
 * GET /v2/validate and POST /v2/validatebatch verified against
 * zerobounce.net/docs (see config.ts). The `status` classification
 * is preserved VERBATIM (valid / invalid / catch-all / unknown /
 * spamtrap / abuse / do_not_mail), as is `sub_status`. Unknown
 * results cost 0 credits per ZeroBounce's documented model.
 */

import { ProviderHttpClient } from "../../client";
import { createSyncJob, finishSyncJob } from "../../sync";
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
  toLeadPatch,
} from "../common";
import { ZEROBOUNCE_CONFIG } from "./config";

function boolOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

type ZeroBounceValidateResponse = {
  address?: string;
  status?: string;
  sub_status?: string;
  free_email?: boolean;
  did_you_mean?: string | null;
  account?: string;
  domain?: string;
  domain_age_days?: string;
  smtp_provider?: string;
  mx_found?: string;
  mx_record?: string;
  firstname?: string;
  lastname?: string;
  gender?: string;
  country?: string;
  region?: string;
  city?: string;
  zipcode?: string;
  processed_at?: string;
};

export interface ZeroBounceAdapterOptions {
  apiKey: string;
  recordUsage?: UsageRecorder;
  client?: ProviderHttpClient;
}

export function createZeroBounceAdapter(opts: ZeroBounceAdapterOptions): VerificationAdapter {
  const apiKey = requireApiKey(opts.apiKey, "ZeroBounce");
  const client =
    opts.client ??
    new ProviderHttpClient({
      baseUrl: ZEROBOUNCE_CONFIG.baseUrl,
      // ZeroBounce's documented auth is the `api_key` query parameter.
      getAuthHeaders: () => ({}),
    });
  const recordUsage = opts.recordUsage;

  function toResult(email: string, res: ZeroBounceValidateResponse): VerificationResult {
    const classification = typeof res.status === "string" ? res.status : "unknown";
    return {
      provider: "zerobounce",
      email: res.address ?? email,
      classification,
      substatus: typeof res.sub_status === "string" && res.sub_status ? res.sub_status : null,
      isDisposable: null,
      isCatchAll: classification === "catch-all",
      isRoleAccount: null,
      isFreeProvider: boolOrNull(res.free_email),
      score: null,
      didYouMean: typeof res.did_you_mean === "string" && res.did_you_mean ? res.did_you_mean : null,
      creditsUsed: classification === "unknown" ? 0 : 1,
      creditsRemaining: null,
      raw: res as unknown as Record<string, unknown>,
    };
  }

  const adapter: VerificationAdapter = {
    provider: "zerobounce",

    async verifyEmail(email: string): Promise<VerificationResult> {
      try {
        const res = await client.request<ZeroBounceValidateResponse>({
          method: "GET",
          path: "/validate",
          query: { api_key: apiKey, email, ip_address: "" },
        });
        const result = toResult(email, res);
        if (recordUsage && result.creditsUsed > 0) {
          await recordUsage("zerobounce.validate", result.creditsUsed);
        }
        return result;
      } catch (err) {
        throw mapAuthError(err, "ZeroBounce");
      }
    },

    async verifyBulk(items: BulkVerificationItem[], options: BulkVerificationOptions) {
      // Use the native batch endpoint in chunks of 100, falling back
      // to the shared sequential loop only if the batch call fails
      // for the whole chunk (per-item failures are still counted).
      const seen = new Set<string>();
      const unique: BulkVerificationItem[] = [];
      let duplicates = 0;
      for (const item of items) {
        const key = item.email.trim().toLowerCase();
        if (!key || seen.has(key)) {
          duplicates += 1;
          continue;
        }
        seen.add(key);
        unique.push(item);
      }
      const job = await createSyncJob(options.syncJobStore, {
        workspaceId: options.workspaceId,
        provider: "zerobounce",
        direction: "import",
      });
      let processed = 0;
      let failed = 0;
      const errors: string[] = [];
      for (let i = 0; i < unique.length; i += ZEROBOUNCE_CONFIG.batchSize) {
        const chunk = unique.slice(i, i + ZEROBOUNCE_CONFIG.batchSize);
        try {
          const res = await client.request<{
            email_batch?: Array<ZeroBounceValidateResponse & { address?: string }> | null;
          }>({
            method: "POST",
            path: "/validatebatch",
            body: {
              api_key: apiKey,
              email_batch: chunk.map((c) => ({ email_address: c.email, ip_address: "" })),
            },
          });
          const batch = res.email_batch ?? [];
          const creditsUsed = batch.reduce(
            (sum, r) => sum + (r.status === "unknown" ? 0 : 1),
            0
          );
          if (recordUsage && creditsUsed > 0) {
            await recordUsage("zerobounce.validatebatch", creditsUsed);
          }
          for (let j = 0; j < chunk.length; j++) {
            const item = chunk[j];
            const row = batch[j];
            if (!row) {
              failed += 1;
              errors.push(`${item.email}: no result returned in batch response`);
              continue;
            }
            processed += 1;
            const result = toResult(item.email, row);
            if (item.leadId && options.updateLead) {
              try {
                await options.updateLead(item.leadId, toLeadPatch("zerobounce", result));
              } catch {
                failed += 1;
                errors.push(`${item.email}: failed to save verification to lead`);
              }
            }
          }
        } catch {
          // Whole-chunk failure: fall back to single checks so one
          // bad address does not sink the chunk.
          for (const item of chunk) {
            try {
              const result = await adapter.verifyEmail(item.email);
              processed += 1;
              if (item.leadId && options.updateLead) {
                await options.updateLead(item.leadId, toLeadPatch("zerobounce", result));
              }
            } catch (singleErr) {
              failed += 1;
              errors.push(`${item.email}: ${singleErr instanceof Error ? singleErr.message : "verification failed"}`);
            }
          }
        }
      }
      await finishSyncJob(options.syncJobStore, job.id, {
        processed,
        created: 0,
        updated: processed,
        skipped: duplicates,
        failed,
        errors,
      });
      return {
        jobId: job.id,
        provider: "zerobounce",
        direction: "import",
        processed,
        created: 0,
        updated: processed,
        skipped: duplicates,
        failed,
        errors,
      };
    },

    async getCreditBalance(): Promise<number | null> {
      try {
        const res = await client.request<{ credits?: number | string }>({
          method: "GET",
          path: "/getcredits",
          query: { api_key: apiKey },
        });
        const credits = typeof res.credits === "string" ? Number(res.credits) : res.credits;
        return typeof credits === "number" && Number.isFinite(credits) ? credits : null;
      } catch (err) {
        throw mapAuthError(err, "ZeroBounce");
      }
    },
  };

  return adapter;
}

export { toLeadPatch };
