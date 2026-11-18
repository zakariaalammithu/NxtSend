/**
 * Shared helpers for the email-outreach provider adapters
 * (`src/lib/integrations/providers/email-outreach/<provider>/`).
 *
 * Rules every adapter in this folder follows:
 *  - All provider HTTP calls go through `ProviderHttpClient`
 *    (Stage 1 engine). No direct `fetch` to a provider except the
 *    Snov.io OAuth token exchange, which also uses a
 *    `ProviderHttpClient` with empty auth headers.
 *  - Suppression is fail-closed: `sendLeadsToEmailCampaign` refuses
 *    to run without a suppression checker, and a checker that throws
 *    skips that lead (never sends it). The production checker wraps
 *    `checkSuppression` from `src/lib/email/suppression.ts`.
 *  - No LinkedIn send/accept anywhere in this folder. The only
 *    LinkedIn touchpoint is the identity map (LinkedIn URL ↔ email)
 *    used to match a provider contact back to an NxtSend lead.
 *  - Nothing here claims a live connection: `testConnection` is the
 *    only place a "connected" claim may originate, and only after a
 *    real authenticated probe succeeds.
 *  - Operations whose endpoint could not be verified against the
 *    provider's official docs throw a `provider_config_ready` error
 *    (see `configReadyError`) instead of calling a guessed URL.
 *    The unverified part is marked in code, in the provider doc,
 *    and in the Stage 4 report.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lead } from "@/types";
import { checkSuppression } from "@/lib/email/suppression";
import { ProviderHttpClient } from "../client";
import type { ProviderCredential } from "../connections";
import {
  createSyncJob,
  dedupeLeadsByEmail,
  finishSyncJob,
  recordSyncError,
  type SyncJobStore,
} from "../sync";
import type { SyncResult } from "../types";

/** One provider campaign, normalised across providers. */
export interface ProviderCampaign {
  id: string;
  name: string;
  /** Raw provider status string (vocabulary differs per provider). */
  status: string;
}

export interface ProviderCampaignStatus extends ProviderCampaign {
  detail?: string;
}

/** One reply read back from a provider's inbox surface. */
export interface OutreachReply {
  email: string;
  campaignId?: string;
  subject?: string;
  snippet?: string;
  receivedAt?: string;
  externalId?: string;
}

export interface BounceSyncResult {
  checked: number;
  bounced: string[];
  unsubscribed: string[];
  /** Addresses newly added to the NxtSend suppression list. */
  suppressedAdded: number;
}

/** `(email) => true` when the address is suppressed. Fails closed. */
export type SuppressionChecker = (email: string) => Promise<boolean>;

/**
 * Production suppression checker: wraps `checkSuppression`
 * (Supabase `suppression_list`, service-role). A query failure
 * throws, and callers treat that as "do not send".
 */
export function createSupabaseSuppressionChecker(
  admin: SupabaseClient,
  workspaceId: string
): SuppressionChecker {
  return (email: string) => checkSuppression(admin, workspaceId, email);
}

/** NxtSend lead fields as a provider contact, before per-provider shaping. */
export interface ProviderContact {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  jobTitle: string;
  linkedinUrl: string;
}

export function splitName(lead: Lead): { firstName: string; lastName: string } {
  const firstName = (lead.first_name ?? "").trim();
  const lastName = (lead.last_name ?? "").trim();
  return { firstName, lastName };
}

/** Pure lead → contact mapping shared by every adapter. */
export function mapLeadToContact(lead: Lead): ProviderContact {
  const { firstName, lastName } = splitName(lead);
  return {
    email: (lead.email ?? "").trim(),
    firstName,
    lastName,
    company: (lead.company ?? "").trim(),
    jobTitle: (lead.job_title ?? "").trim(),
    linkedinUrl: (lead.linkedin_url ?? "").trim(),
  };
}

/**
 * Identity map: LinkedIn profile URL → NxtSend lead email.
 * Lets a provider contact (which only carries an email) be matched
 * back to the NxtSend lead that supplied the LinkedIn URL, and vice
 * versa. Leads without both sides are skipped — an empty LinkedIn
 * URL is not an identity.
 */
export function buildIdentityMap(leads: Lead[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const lead of leads) {
    const url = (lead.linkedin_url ?? "").trim();
    const email = (lead.email ?? "").trim().toLowerCase();
    if (url && email && !map.has(url)) map.set(url, email);
  }
  return map;
}

export function findEmailByLinkedInUrl(
  map: Map<string, string>,
  linkedinUrl: string
): string | null {
  return map.get(linkedinUrl.trim()) ?? null;
}

// ── Config-ready (unverified endpoint) ──────────────────────────────────────

export const CONFIG_READY_CODE = "provider_config_ready";

/**
 * Thrown when an operation's endpoint could not be verified against
 * the provider's official docs. Callers (and the provider doc) must
 * name the missing verification; the operation must never fall back
 * to a guessed URL.
 */
export function configReadyError(
  provider: string,
  operation: string,
  detail: string
): Error {
  const error = new Error(
    `[${provider}] ${operation} is config-ready, not live: ${detail}`
  ) as Error & { code: string };
  error.code = CONFIG_READY_CODE;
  return error;
}

export function isConfigReadyError(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    (err as { code?: unknown }).code === CONFIG_READY_CODE
  );
}

// ── Lead qualification (dedupe + suppression, fail-closed) ──────────────────

export interface QualifiedLeads {
  /** Unique, emailable, not-suppressed leads, in first-seen order. */
  qualified: Lead[];
  /** Leads skipped because the address is on the suppression list. */
  suppressed: Lead[];
  /** Leads skipped because they have no email address. */
  noEmail: Lead[];
  /** Later rows whose normalised email was already seen. */
  duplicates: Lead[];
}

/**
 * Deduplicates by email (first occurrence wins, via the engine's
 * `dedupeLeadsByEmail`), drops leads with no email, and drops
 * suppressed leads. A suppression-check failure for one lead skips
 * that lead (fail closed) and records the reason; it never sends.
 */
export async function qualifyLeads(
  leads: Lead[],
  isSuppressed: SuppressionChecker
): Promise<{ result: QualifiedLeads; checkErrors: string[] }> {
  const { unique, duplicates } = dedupeLeadsByEmail(leads);
  const qualified: Lead[] = [];
  const suppressed: Lead[] = [];
  const noEmail: Lead[] = [];
  const checkErrors: string[] = [];
  for (const lead of unique) {
    const email = (lead.email ?? "").trim();
    if (!email) {
      noEmail.push(lead);
      continue;
    }
    let suppressedFlag: boolean;
    try {
      suppressedFlag = await isSuppressed(email);
    } catch (err) {
      checkErrors.push(
        `Suppression check failed for ${email} — lead skipped (fail closed): ${
          err instanceof Error ? err.message : "unknown error"
        }`
      );
      continue;
    }
    if (suppressedFlag) suppressed.push(lead);
    else qualified.push(lead);
  }
  return { result: { qualified, suppressed, noEmail, duplicates }, checkErrors };
}

// ── Auth header builders ────────────────────────────────────────────────────

export type OutreachAuthKind =
  | "bearer"
  | "basic"
  | "x-api-key"
  | "api-key-query"
  | "none";

function basicAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`:${apiKey}`).toString("base64")}`;
}

/**
 * Builds the auth headers for one credential. `api-key-query`
 * providers (Smartlead) authenticate via a query parameter instead:
 * they get no auth header, and the adapter must pass
 * `authQueryParam(credential)` on every request.
 */
export function authHeadersFor(
  kind: OutreachAuthKind,
  credential: ProviderCredential
): Record<string, string> {
  const key = credential.apiKey ?? credential.accessToken ?? "";
  switch (kind) {
    case "bearer":
      return { Authorization: `Bearer ${key}` };
    case "basic":
      return { Authorization: basicAuthHeader(key) };
    case "x-api-key":
      return { "X-API-Key": key };
    case "api-key-query":
    case "none":
      return {};
  }
}

/** Query parameter carrying the credential for `api-key-query` auth. */
export function authQueryParam(
  kind: OutreachAuthKind,
  credential: ProviderCredential
): Record<string, string> {
  if (kind !== "api-key-query") return {};
  return { api_key: credential.apiKey ?? credential.accessToken ?? "" };
}

/** Builds a `ProviderHttpClient` for one provider + credential. */
export function buildOutreachClient(
  baseUrl: string,
  authKind: OutreachAuthKind,
  credential: ProviderCredential
): ProviderHttpClient {
  return new ProviderHttpClient({
    baseUrl,
    getAuthHeaders: () => authHeadersFor(authKind, credential),
  });
}

// ── Sync-job wrapper ───────────────────────────────────────────────────────

export interface ExportSyncWork {
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
}

/**
 * Runs one export inside a sync job (migration 030
 * `integration_sync_jobs`) when a store is supplied; without a store
 * the work still runs and the counts are returned directly. The job
 * is "failed" when anything failed or any error was recorded
 * (engine rule in `finishSyncJob`). A thrown work error is recorded
 * on the job via `recordSyncError` and rethrown.
 */
export async function runExportSyncJob(
  opts: {
    store?: SyncJobStore;
    workspaceId?: string;
    provider: string;
  },
  work: (jobId: string | null) => Promise<ExportSyncWork>
): Promise<SyncResult> {
  const { store, workspaceId, provider } = opts;
  if (!store || !workspaceId) {
    const out = await work(null);
    return { jobId: "", provider, direction: "export", ...out };
  }
  const job = await createSyncJob(store, {
    workspaceId,
    provider,
    direction: "export",
  });
  try {
    const out = await work(job.id);
    const finished = await finishSyncJob(store, job.id, out);
    return {
      jobId: finished?.id ?? job.id,
      provider,
      direction: "export",
      ...out,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed.";
    await recordSyncError(store, job.id, message);
    throw err;
  }
}

/** Finds one campaign in a list response, by id (string-compared). */
export function findCampaignById(
  campaigns: ProviderCampaign[],
  campaignId: string
): ProviderCampaign | null {
  return campaigns.find((c) => String(c.id) === String(campaignId)) ?? null;
}

/** Reads a list-shaped body: array, `{ data: [...] }`, or `{ items: [...] }`. */
export function readListBody(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (body && typeof body === "object") {
    const rec = body as Record<string, unknown>;
    if (Array.isArray(rec.data)) return rec.data as Record<string, unknown>[];
    if (Array.isArray(rec.items)) return rec.items as Record<string, unknown>[];
    if (Array.isArray(rec.campaigns))
      return rec.campaigns as Record<string, unknown>[];
    if (Array.isArray(rec.recipients))
      return rec.recipients as Record<string, unknown>[];
  }
  return [];
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}
