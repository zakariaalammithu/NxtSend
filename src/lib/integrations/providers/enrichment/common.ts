/**
 * Shared helpers for enrichment adapters.
 *
 *  - `enrichedField` — attaches source + confidence to a value.
 *  - `requireApiKey` / `unsupportedOperation` — the two standard
 *    adapter failures, as ProviderErrors.
 *  - `resolveProviderApiKey` — stored (encrypted) credential first,
 *    env var fallback. Server-only: it decrypts.
 *  - `toLeadPatch` — maps an EnrichmentResult onto a Partial<Lead>:
 *    known lead columns are filled directly, everything else lands
 *    under `custom_fields["enrichment_<provider>"]` with its
 *    confidence, so nothing the provider returned is silently
 *    dropped and nothing is written to a column it does not belong
 *    to.
 *  - `runBulkEnrichment` — the shared bulk loop: dedupe by email,
 *    one sync job (migration 030), matched → updated, unmatched →
 *    skipped, error → failed.
 */

import type { Lead } from "@/types";
import { isProviderError, toProviderError } from "../client";
import type { ProviderError } from "../types";
import {
  getDecryptedProviderCredential,
  type ProviderConnectionStore,
} from "../connections";
import { createSyncJob, dedupeLeadsByEmail, finishSyncJob } from "../sync";
import type { SyncResult } from "../types";
import type {
  BulkEnrichmentOptions,
  EnrichedField,
  EnrichLeadInput,
  EnrichmentResult,
} from "./types";

export function enrichedField(
  value: unknown,
  source: string,
  confidence: number | null = null
): EnrichedField {
  return { value, confidence, source };
}

/** Builds the standard "no credential" ProviderError. */
export function requireApiKey(apiKey: string | null | undefined, provider: string): string {
  if (!apiKey) {
    const error = new Error(
      `No ${provider} credential is stored and the environment variable is not set — connect ${provider} before enriching.`
    ) as Error & ProviderError;
    error.code = "provider_credentials_missing";
    error.status = 0;
    error.retryable = false;
    throw error;
  }
  return apiKey;
}

/** Standard error for an operation the provider does not offer via its API. */
export function unsupportedOperation(provider: string, operation: string): ProviderError {
  const error = new Error(
    `${provider} does not offer ${operation} through its public API.`
  ) as Error & ProviderError;
  error.code = "provider_operation_unsupported";
  error.status = 0;
  error.retryable = false;
  return error;
}

/**
 * Standard error for an endpoint that could not be verified against
 * the provider's official docs. The adapter refuses to guess a URL.
 */
export function unverifiedEndpoint(provider: string, operation: string): ProviderError {
  const error = new Error(
    `${provider} ${operation} is config-ready only: the endpoint could not be verified against the provider's official API documentation, so no request was made. See docs/integrations/providers/enrichment-${provider}.md.`
  ) as Error & ProviderError;
  error.code = "provider_endpoint_unverified";
  error.status = 0;
  error.retryable = false;
  return error;
}

/**
 * Server-only. Resolves an API key from the stored encrypted
 * connection credential first, then the named env var. Returns null
 * when neither exists. Never logs the key.
 */
export async function resolveProviderApiKey(input: {
  store: ProviderConnectionStore;
  workspaceId: string;
  provider: string;
  envVar: string;
}): Promise<string | null> {
  const stored = await getDecryptedProviderCredential(
    input.store,
    input.workspaceId,
    input.provider
  );
  if (stored?.apiKey) return stored.apiKey;
  if (stored?.accessToken) return stored.accessToken;
  const fromEnv = process.env[input.envVar];
  return fromEnv && fromEnv.length > 0 ? fromEnv : null;
}

/** Re-throws auth failures (401/403) with a credential-focused message. */
export function mapAuthError(err: unknown, provider: string): ProviderError {
  const providerError = toProviderError(err);
  if (providerError.status === 401 || providerError.status === 403) {
    const error = new Error(
      `${provider} rejected the credential (HTTP ${providerError.status}). Check the stored API key — it may be missing, revoked, or lack access to this endpoint.`
    ) as Error & ProviderError;
    error.code = "provider_auth_failed";
    error.status = providerError.status;
    error.retryable = false;
    return error;
  }
  return providerError;
}

const DIRECT_LEAD_COLUMNS = new Set([
  "email",
  "first_name",
  "last_name",
  "job_title",
  "company",
  "linkedin_url",
]);

/**
 * Maps an enrichment result onto a lead patch. Known lead columns
 * are written directly; every other field is preserved under
 * `custom_fields["enrichment_<provider>"]` so the raw enriched
 * values (with confidence) survive on the lead.
 */
export function toLeadPatch(
  provider: string,
  result: EnrichmentResult
): Partial<Lead> {
  const patch: Partial<Lead> & { custom_fields: Record<string, unknown> } = {
    custom_fields: {},
  };
  const extra: Record<string, { value: unknown; confidence: number | null }> = {};
  for (const [key, field] of Object.entries(result.fields)) {
    if (field.value === undefined || field.value === null || field.value === "") continue;
    if (DIRECT_LEAD_COLUMNS.has(key)) {
      (patch as Record<string, unknown>)[key] = field.value;
    } else {
      extra[key] = { value: field.value, confidence: field.confidence };
    }
  }
  patch.custom_fields[`enrichment_${provider}`] = {
    confidence: result.confidence,
    checked_at: new Date().toISOString(),
    fields: extra,
  };
  return patch;
}

/**
 * Shared bulk-enrichment loop. Inputs are deduped by email first
 * (same rule as the CRM duplicate check); each unique input is
 * enriched once through `enrichOne`. Matched → updated, unmatched →
 * skipped, thrown → failed. Runs as one sync job (migration 030).
 */
export async function runBulkEnrichment(input: {
  provider: string;
  inputs: EnrichLeadInput[];
  enrichOne: (item: EnrichLeadInput) => Promise<EnrichmentResult>;
  options: BulkEnrichmentOptions;
}): Promise<SyncResult> {
  const { unique, duplicates } = dedupeLeadsByEmail(input.inputs);
  const job = await createSyncJob(input.options.syncJobStore, {
    workspaceId: input.options.workspaceId,
    provider: input.provider,
    direction: "import",
  });
  let updated = 0;
  let skipped = duplicates.length;
  let failed = 0;
  const errors: string[] = [];
  for (const item of unique) {
    try {
      const result = await input.enrichOne(item);
      if (result.matched) updated += 1;
      else skipped += 1;
    } catch (err) {
      failed += 1;
      errors.push(
        isProviderError(err)
          ? `${item.email ?? item.linkedinUrl ?? "lead"}: ${err.message}`
          : `${item.email ?? item.linkedinUrl ?? "lead"}: ${toProviderError(err).message}`
      );
    }
  }
  await finishSyncJob(input.options.syncJobStore, job.id, {
    processed: unique.length,
    created: 0,
    updated,
    skipped,
    failed,
    errors,
  });
  return {
    jobId: job.id,
    provider: input.provider,
    direction: "import",
    processed: unique.length,
    created: 0,
    updated,
    skipped,
    failed,
    errors,
  };
}
