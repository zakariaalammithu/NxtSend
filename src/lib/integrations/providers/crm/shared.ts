/**
 * Shared CRM adapter contract — the common shape every CRM adapter in
 * `src/lib/integrations/providers/crm/<provider>/` implements.
 *
 * Design notes:
 *  - Adapters NEVER touch env vars directly. Credentials come from the
 *    encrypted provider-connection store (migration 030,
 *    `./connections`) via `getDecryptedProviderCredential`, and every
 *    HTTP call goes through `ProviderHttpClient` (`../client`).
 *  - Import writes leads through the leads repository
 *    (`src/lib/data/leads`), which already emits the platform webhook
 *    events (lead.created / lead.updated) — adapters must NOT emit
 *    them again.
 *  - Duplicate detection is email-based via `dedupeLeadsByEmail`
 *    (`../sync`).
 *  - No live calls without credentials: `requireCredential` throws a
 *    `provider_credentials_missing` error when no connection is
 *    stored. Operations whose endpoint could NOT be verified against
 *    the provider's official docs throw via `configReadyError`
 *    instead of calling a guessed URL — see each adapter's config
 *    for what is verified vs config-ready.
 *  - No LinkedIn-send/accept anywhere: these adapters sync CRM
 *    records only.
 */

import { ProviderHttpClient, toProviderError } from "../client";
import {
  getDecryptedProviderCredential,
  type ProviderConnectionStore,
  type ProviderCredential,
} from "../connections";
import {
  createSyncJob,
  dedupeLeadsByEmail,
  finishSyncJob,
  recordSyncError,
  type SyncJobStore,
} from "../sync";
import type { SyncResult } from "../types";
import type { CreateLeadInput, LeadsRepository } from "@/lib/data/leads";
import type { Lead } from "@/types";

/** One lead, normalised from / to any CRM. `status` is a NxtSend LeadStatus. */
export interface CrmLead {
  externalId?: string;
  email?: string;
  firstName: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  linkedinUrl?: string;
  status?: string;
  tags?: string[];
}

export interface CrmAdapterDeps {
  workspaceId: string;
  connectionStore: ProviderConnectionStore;
  syncJobStore: SyncJobStore;
  leadsRepo: LeadsRepository;
}

export interface CrmTestResult {
  ok: boolean;
  detail: string;
}

export interface CrmNote {
  title?: string;
  body: string;
}

export interface CrmAdapter {
  provider: string;
  /** Cheap authenticated probe. Never claims "connected" without a real check. */
  testConnection(credential: ProviderCredential): Promise<CrmTestResult>;
  /** Reads contacts from the CRM, mapped to CrmLead. */
  importContacts(
    credential: ProviderCredential,
    opts?: { limit?: number }
  ): Promise<CrmLead[]>;
  /** Creates (or updates, when the CRM can find by email) one lead in the CRM. */
  exportLead(
    credential: ProviderCredential,
    lead: CrmLead
  ): Promise<{ externalId: string; created: boolean }>;
  /** Pushes a NxtSend status to the CRM — only where the CRM has a status field. */
  syncLeadStatus?(
    credential: ProviderCredential,
    externalId: string,
    status: string
  ): Promise<void>;
  /** Pushes NxtSend tags to the CRM — only where the CRM supports tags. */
  syncTags?(
    credential: ProviderCredential,
    externalId: string,
    tags: string[]
  ): Promise<void>;
  /** Logs a note/activity on the CRM record — only where the API supports it. */
  syncNote?(
    credential: ProviderCredential,
    externalId: string,
    note: CrmNote
  ): Promise<void>;
  /** Full import run: sync-job lifecycle + dedupe + lead creation. */
  runImport(deps: CrmAdapterDeps, opts?: { limit?: number }): Promise<SyncResult>;
  /** Full export run: sync-job lifecycle + per-lead export. */
  runExport(deps: CrmAdapterDeps, leads: CrmLead[]): Promise<SyncResult>;
}

/**
 * Thrown (as a ProviderError-shaped error) when an operation is
 * config-ready only: the provider supports the capability, but the
 * exact endpoint was NOT verified against official docs in this
 * pass, so no URL is guessed. The message names what is missing.
 */
export function configReadyError(
  provider: string,
  operation: string,
  reason: string
): Error {
  const error = new Error(
    `[${provider}] ${operation} is config-ready only: ${reason} No request was sent.`
  ) as Error & { code: string; status: number; retryable: boolean };
  error.code = "provider_not_configured";
  error.status = 0;
  error.retryable = false;
  return error;
}

/** Loads the stored credential or throws `provider_credentials_missing`. */
export async function requireCredential(
  store: ProviderConnectionStore,
  workspaceId: string,
  provider: string
): Promise<ProviderCredential> {
  const credential = await getDecryptedProviderCredential(store, workspaceId, provider);
  if (!credential || (!credential.accessToken && !credential.apiKey)) {
    const error = new Error(
      `[${provider}] No credential is stored for this workspace — connect the provider first.`
    ) as Error & { code: string; status: number; retryable: boolean };
    error.code = "provider_credentials_missing";
    error.status = 0;
    error.retryable = false;
    throw error;
  }
  return credential;
}

export function buildCrmClient(
  baseUrl: string,
  getAuthHeaders: () => Record<string, string> | Promise<Record<string, string>>
): ProviderHttpClient {
  return new ProviderHttpClient({ baseUrl, getAuthHeaders });
}

/** Maps a normalised lead onto the leads repository's create input. */
export function crmLeadToNewLeadInput(lead: CrmLead): CreateLeadInput {
  return {
    first_name: lead.firstName || "Unknown",
    last_name: lead.lastName,
    email: lead.email,
    company: lead.company,
    job_title: lead.jobTitle,
    linkedin_url: lead.linkedinUrl,
    tags: lead.tags ?? [],
    ...(lead.status ? { status: lead.status as Lead["status"] } : {}),
  };
}

/** Maps a stored NxtSend lead onto the normalised CRM shape. */
export function leadToCrmLead(lead: Lead): CrmLead {
  return {
    email: lead.email,
    firstName: lead.first_name ?? "",
    lastName: lead.last_name,
    company: lead.company,
    jobTitle: lead.job_title,
    linkedinUrl: lead.linkedin_url,
    status: lead.status,
    tags: lead.tags,
  };
}

function emptyResult(
  jobId: string,
  provider: string,
  direction: "import" | "export"
): Omit<SyncResult, "jobId" | "provider" | "direction"> {
  void jobId;
  void provider;
  void direction;
  return {
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
}

/** Shared import runner: job lifecycle, dedupe, per-lead creation. */
export async function runCrmImport(
  adapter: CrmAdapter,
  deps: CrmAdapterDeps,
  opts?: { limit?: number }
): Promise<SyncResult> {
  const job = await createSyncJob(deps.syncJobStore, {
    workspaceId: deps.workspaceId,
    provider: adapter.provider,
    direction: "import",
  });
  const result = emptyResult(job.id, adapter.provider, "import");
  try {
    const credential = await requireCredential(
      deps.connectionStore,
      deps.workspaceId,
      adapter.provider
    );
    const imported = await adapter.importContacts(credential, opts);
    const { unique, duplicates } = dedupeLeadsByEmail(imported);
    result.skipped = duplicates.length;
    for (const lead of unique) {
      result.processed += 1;
      try {
        await deps.leadsRepo.createLead(deps.workspaceId, crmLeadToNewLeadInput(lead));
        result.created += 1;
      } catch (err) {
        result.failed += 1;
        const message = toProviderError(err).message;
        result.errors.push(`Import failed for ${lead.email ?? lead.firstName}: ${message}`);
        await recordSyncError(deps.syncJobStore, job.id, message);
      }
    }
  } catch (err) {
    const message = toProviderError(err).message;
    result.failed += 1;
    result.errors.push(message);
    await recordSyncError(deps.syncJobStore, job.id, message);
  }
  const finished = await finishSyncJob(deps.syncJobStore, job.id, result);
  return {
    jobId: job.id,
    provider: adapter.provider,
    direction: "import",
    processed: finished?.processed ?? result.processed,
    created: finished?.created ?? result.created,
    updated: finished?.updated ?? result.updated,
    skipped: finished?.skipped ?? result.skipped,
    failed: finished?.failed ?? result.failed,
    errors: finished?.errors ?? result.errors,
  };
}

/** Shared export runner: job lifecycle, per-lead export. */
export async function runCrmExport(
  adapter: CrmAdapter,
  deps: CrmAdapterDeps,
  leads: CrmLead[]
): Promise<SyncResult> {
  const job = await createSyncJob(deps.syncJobStore, {
    workspaceId: deps.workspaceId,
    provider: adapter.provider,
    direction: "export",
  });
  const result = emptyResult(job.id, adapter.provider, "export");
  try {
    const credential = await requireCredential(
      deps.connectionStore,
      deps.workspaceId,
      adapter.provider
    );
    for (const lead of leads) {
      result.processed += 1;
      try {
        const exported = await adapter.exportLead(credential, lead);
        if (exported.created) result.created += 1;
        else result.updated += 1;
      } catch (err) {
        result.failed += 1;
        const message = toProviderError(err).message;
        result.errors.push(`Export failed for ${lead.email ?? lead.firstName}: ${message}`);
        await recordSyncError(deps.syncJobStore, job.id, message);
      }
    }
  } catch (err) {
    const message = toProviderError(err).message;
    result.failed += 1;
    result.errors.push(message);
    await recordSyncError(deps.syncJobStore, job.id, message);
  }
  const finished = await finishSyncJob(deps.syncJobStore, job.id, result);
  return {
    jobId: job.id,
    provider: adapter.provider,
    direction: "export",
    processed: finished?.processed ?? result.processed,
    created: finished?.created ?? result.created,
    updated: finished?.updated ?? result.updated,
    skipped: finished?.skipped ?? result.skipped,
    failed: finished?.failed ?? result.failed,
    errors: finished?.errors ?? result.errors,
  };
}

/** Splits "Ada Lovelace" into first/last; single word → first name only. */
export function splitName(fullName: string): { firstName: string; lastName?: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "" };
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}
