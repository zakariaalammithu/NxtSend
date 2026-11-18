/**
 * Shared helpers for email-verification adapters.
 *
 *  - `toLeadPatch` — persists a result onto a lead WITHOUT
 *    normalising the classification: the verbatim provider status
 *    (and sub-status) is stored under
 *    `custom_fields["email_verification_<provider>"]` with the
 *    check time. The lead's email address itself is never changed
 *    by verification.
 *  - `runBulkVerification` — the shared bulk loop: dedupe by email,
 *    one sync job (migration 030), one verification per unique
 *    address, optional per-lead persistence via the caller's
 *    updateLead. A verification that returns a classification is
 *    "processed"; only thrown errors count as failed.
 */

import { isProviderError, toProviderError } from "../client";
import { createSyncJob, finishSyncJob } from "../sync";
import type { SyncResult } from "../types";
import {
  requireApiKey,
  resolveProviderApiKey,
  mapAuthError,
  unverifiedEndpoint,
  unsupportedOperation,
} from "../enrichment/common";
import type {
  BulkVerificationItem,
  BulkVerificationOptions,
  VerificationResult,
} from "./types";

export { requireApiKey, resolveProviderApiKey, mapAuthError, unverifiedEndpoint, unsupportedOperation };

/** Lead patch for a verification result — classification kept verbatim. */
export function toLeadPatch(
  provider: string,
  result: VerificationResult
): Record<string, unknown> {
  return {
    custom_fields: {
      [`email_verification_${provider}`]: {
        classification: result.classification,
        substatus: result.substatus,
        is_disposable: result.isDisposable,
        is_catch_all: result.isCatchAll,
        is_role_account: result.isRoleAccount,
        score: result.score,
        did_you_mean: result.didYouMean,
        checked_at: new Date().toISOString(),
      },
    },
  };
}

function normalizeEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Shared bulk-verification loop. Emails are deduped (first
 * occurrence wins); each unique address is verified once through
 * `verifyOne`. Runs as one sync job (migration 030).
 */
export async function runBulkVerification(input: {
  provider: string;
  items: BulkVerificationItem[];
  verifyOne: (email: string) => Promise<VerificationResult>;
  options: BulkVerificationOptions;
}): Promise<SyncResult> {
  const seen = new Set<string>();
  const unique: BulkVerificationItem[] = [];
  let duplicates = 0;
  for (const item of input.items) {
    const key = normalizeEmailKey(item.email);
    if (!key) {
      duplicates += 1;
      continue;
    }
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    unique.push(item);
  }
  const job = await createSyncJob(input.options.syncJobStore, {
    workspaceId: input.options.workspaceId,
    provider: input.provider,
    direction: "import",
  });
  let processed = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const item of unique) {
    try {
      const result = await input.verifyOne(item.email);
      processed += 1;
      if (item.leadId && input.options.updateLead) {
        try {
          await input.options.updateLead(item.leadId, toLeadPatch(input.provider, result));
        } catch (err) {
          failed += 1;
          errors.push(
            `${item.email}: failed to save verification to lead — ${toProviderError(err).message}`
          );
        }
      }
    } catch (err) {
      failed += 1;
      errors.push(
        isProviderError(err)
          ? `${item.email}: ${err.message}`
          : `${item.email}: ${toProviderError(err).message}`
      );
    }
  }
  await finishSyncJob(input.options.syncJobStore, job.id, {
    processed,
    created: 0,
    updated: processed,
    skipped: duplicates,
    failed,
    errors,
  });
  return {
    jobId: job.id,
    provider: input.provider,
    direction: "import",
    processed,
    created: 0,
    updated: processed,
    skipped: duplicates,
    failed,
    errors,
  };
}
