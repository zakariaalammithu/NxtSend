/**
 * Integration Hub — client-side API helpers (P7 Stage C).
 *
 * Thin wrappers over the Stage B admin routes. Every error surfaces the
 * server's own message (`{ error, fields? }`) — demo-mode 503s, the
 * revoked-credential 409 and validation 400s reach the UI verbatim
 * instead of being replaced by invented copy.
 */

import type {
  HubChecklistEntry,
  HubChecklistRollup,
  HubCredentialMetadata,
  HubDocumentRecord,
  HubIntegrationRecord,
  HubTestAccountRecord,
} from "@/lib/integration-hub/hub-core";
import type { HubOverviewItemView } from "./hub-ui";

export interface HubOverviewResponse {
  mode: "demo" | "supabase";
  vault_configured: boolean;
  integrations: HubOverviewItemView[];
}

export interface HubDetailResponse {
  integration: HubIntegrationRecord;
  credentials: HubCredentialMetadata[];
  test_accounts: HubTestAccountRecord[];
  documents: HubDocumentRecord[];
  checklists: HubChecklistEntry[];
  checklist_rollup: HubChecklistRollup;
}

export interface HubDisclosureResponse {
  value: string;
  credential: HubCredentialMetadata;
}

export class HubApiError extends Error {
  status: number;
  fields?: Record<string, string>;
  constructor(
    status: number,
    message: string,
    fields?: Record<string, string>
  ) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

const BASE = "/api/admin/integration-hub";

async function hubFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => null)) as
    | (Record<string, unknown> & { error?: string; fields?: Record<string, string> })
    | null;
  if (!res.ok) {
    throw new HubApiError(
      res.status,
      body?.error ?? `Request failed (${res.status})`,
      body?.fields
    );
  }
  return body as T;
}

export function getHubOverview(): Promise<{ overview: HubOverviewResponse }> {
  return hubFetch(BASE);
}

export function getHubDetail(slug: string): Promise<HubDetailResponse> {
  return hubFetch(`${BASE}/integrations/${encodeURIComponent(slug)}`);
}

export function createHubIntegration(
  input: Record<string, unknown>
): Promise<{ integration: HubIntegrationRecord }> {
  return hubFetch(`${BASE}/integrations`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateHubIntegration(
  slug: string,
  input: Record<string, unknown>
): Promise<{ integration: HubIntegrationRecord }> {
  return hubFetch(`${BASE}/integrations/${encodeURIComponent(slug)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteHubIntegration(
  slug: string
): Promise<{ deleted: boolean }> {
  return hubFetch(`${BASE}/integrations/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
}

export function createHubCredential(
  slug: string,
  input: Record<string, unknown>
): Promise<{ credential: HubCredentialMetadata }> {
  return hubFetch(
    `${BASE}/integrations/${encodeURIComponent(slug)}/credentials`,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function updateHubCredential(
  id: string,
  input: Record<string, unknown>
): Promise<{ credential: HubCredentialMetadata }> {
  return hubFetch(`${BASE}/credentials/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteHubCredential(
  id: string
): Promise<{ deleted: boolean }> {
  return hubFetch(`${BASE}/credentials/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/** Audited reveal — the server writes the audit row BEFORE decrypting. */
export function revealHubCredential(
  id: string
): Promise<HubDisclosureResponse> {
  return hubFetch(`${BASE}/credentials/${encodeURIComponent(id)}/reveal`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/** Audited copy — returns the value so the caller can write it to the
 *  clipboard; the disclosure itself is what gets audited. */
export function copyHubCredentialValue(
  id: string
): Promise<HubDisclosureResponse> {
  return hubFetch(`${BASE}/credentials/${encodeURIComponent(id)}/copy`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function createHubTestAccount(
  slug: string,
  input: Record<string, unknown>
): Promise<{ test_account: HubTestAccountRecord }> {
  return hubFetch(
    `${BASE}/integrations/${encodeURIComponent(slug)}/test-accounts`,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function updateHubTestAccount(
  id: string,
  input: Record<string, unknown>
): Promise<{ test_account: HubTestAccountRecord }> {
  return hubFetch(`${BASE}/test-accounts/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteHubTestAccount(
  id: string
): Promise<{ deleted: boolean }> {
  return hubFetch(`${BASE}/test-accounts/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function putHubChecklistState(
  slug: string,
  itemId: string,
  input: Record<string, unknown>
): Promise<{ state: unknown }> {
  return hubFetch(
    `${BASE}/integrations/${encodeURIComponent(slug)}/checklist-state/${encodeURIComponent(itemId)}`,
    { method: "PUT", body: JSON.stringify(input) }
  );
}

export function createHubDocument(
  slug: string,
  input: Record<string, unknown>
): Promise<{ document: HubDocumentRecord }> {
  return hubFetch(
    `${BASE}/integrations/${encodeURIComponent(slug)}/documents`,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function updateHubDocument(
  id: string,
  input: Record<string, unknown>
): Promise<{ document: HubDocumentRecord }> {
  return hubFetch(`${BASE}/documents/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteHubDocument(id: string): Promise<{ deleted: boolean }> {
  return hubFetch(`${BASE}/documents/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export interface HubCopyPackageResult {
  format: "md" | "json";
  content: string;
  includes_secrets: boolean;
}

export function copyHubPackage(
  slug: string,
  format: "md" | "json",
  includeCredentialIds?: string[]
): Promise<HubCopyPackageResult> {
  return hubFetch(
    `${BASE}/integrations/${encodeURIComponent(slug)}/copy-package`,
    {
      method: "POST",
      body: JSON.stringify({
        format,
        ...(includeCredentialIds && includeCredentialIds.length > 0
          ? { includeCredentialIds }
          : {}),
      }),
    }
  );
}

export interface HubStatusRefreshResult {
  slug: string;
  status: string;
  vault_configured: boolean;
  credential_count: number;
  expired_credential_ids: string[];
  checklist: HubChecklistRollup;
  note: string;
}

export function refreshHubStatus(
  slug: string
): Promise<HubStatusRefreshResult> {
  return hubFetch(
    `${BASE}/integrations/${encodeURIComponent(slug)}/status/refresh`,
    { method: "POST", body: JSON.stringify({}) }
  );
}
