/**
 * Shared provider types — the contract every provider adapter in
 * `src/lib/integrations/providers/<provider>/` builds against.
 *
 * This module is pure types: no env access, no secrets, no I/O.
 * Provider workers append their own `ProviderDefinition` to
 * `./registry` — they do not edit these types.
 */

export type ProviderCategory =
  | "crm"
  | "email_outreach"
  | "automation"
  | "enrichment"
  | "email_verification"
  | "ai"
  | "communication"
  | "productivity"
  | "developer";

export type ProviderAuthType =
  | "oauth2"
  | "api_key"
  | "bearer_token"
  | "webhook"
  | "none";

export interface ProviderDefinition {
  id: string;
  name: string;
  category: ProviderCategory;
  authType: ProviderAuthType;
  docsUrl: string | null;
  capabilities: string[];
  twoWaySync: boolean;
  scopes?: string[];
}

export type ProviderConnectionStatus =
  | "connected"
  | "disconnected"
  | "configuration_required"
  | "credentials_missing"
  | "error"
  | "coming_soon";

export interface FieldMapping {
  source: string;
  target: string;
  required: boolean;
}

export type SyncJobStatus = "pending" | "running" | "completed" | "failed";

export interface SyncResult {
  jobId: string;
  provider: string;
  direction: "import" | "export";
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export interface ProviderError {
  code: string;
  status: number;
  retryable: boolean;
  message: string;
}
