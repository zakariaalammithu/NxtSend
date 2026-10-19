/**
 * Integration Center — shared types.
 *
 * STATUS VOCABULARY (exact strings, product-wide):
 *   "Connected and Verified"      a verification call succeeded (this
 *                                 session, or a stored last-verification
 *                                 success) AND config is still present
 *   "Connected but Not Verified"  configuration is present, but no
 *                                 successful verification is on record
 *   "Configuration Required"      partially configured, or configuration
 *                                 exists but cannot work as-is
 *   "Not Connected"               nothing configured / not implemented
 *   "Demo Mode"                   the app runs without live config; the
 *                                 integration is simulated/labelled
 *   "Error"                       a verification attempt failed, or the
 *                                 provider reported an error
 *   "Unsupported / No Documented API"  no documented public API exists
 *
 * HARD RULE: key presence alone NEVER yields "Connected and Verified".
 * The env-derived state modules (src/lib/env.ts, email/billing/AI state)
 * say "credentials are configured" — the Center maps that to
 * "Connected but Not Verified" until a real verification call succeeds.
 */

export type CenterStatus =
  | "Connected and Verified"
  | "Connected but Not Verified"
  | "Configuration Required"
  | "Not Connected"
  | "Demo Mode"
  | "Error"
  | "Unsupported / No Documented API";

export const CENTER_STATUSES: readonly CenterStatus[] = [
  "Connected and Verified",
  "Connected but Not Verified",
  "Configuration Required",
  "Not Connected",
  "Demo Mode",
  "Error",
  "Unsupported / No Documented API",
] as const;

export interface IntegrationEnvVar {
  /** Exact environment variable name (never a value). */
  name: string;
  required: boolean;
  /** "public" = safe in the browser (NEXT_PUBLIC_*); otherwise server-only. */
  visibility: "public" | "server-only";
  purpose: string;
}

export type IntegrationKind =
  | "adapter" // a real server adapter exists behind this entry
  | "infrastructure" // platform plumbing (database, jobs)
  | "info" // documented, not implemented yet
  | "unsupported"; // no documented public API exists

export interface IntegrationDescriptor {
  id: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  /** Official documentation URL, or null when the surface is internal. */
  docsUrl: string | null;
  kind: IntegrationKind;
  envVars: IntegrationEnvVar[];
  capabilities: string[];
  setupSteps: string[];
  troubleshooting: string[];
  /** Inbound webhook surface, when the provider calls NxtSend. */
  webhook?: { urlPath: string; notes: string };
  /** True when a safe read-only Test Connection call exists. */
  verifySupported: boolean;
  /** For kind "info"/"unsupported": exactly what is missing and why. */
  notImplementedNote?: string;
}

/** One integration's live status, as returned by GET /api/integrations/status. */
export interface IntegrationStatusEntry {
  descriptor: IntegrationDescriptor;
  status: CenterStatus;
  /** Short human explanation of WHY the status is what it is. */
  statusMessage: string;
  /** Presence booleans only — secret values are never exposed. */
  envPresence: { name: string; present: boolean }[];
  lastVerification: VerificationRecord | null;
}

export interface VerificationRecord {
  ok: boolean;
  /** ISO timestamp of the verification attempt. */
  checkedAt: string;
  message: string;
}

/** Result of POST /api/integrations/[id]/verify. */
export interface VerifyOutcome extends VerificationRecord {
  integrationId: string;
  status: CenterStatus;
  /** True when an actual outbound verification call was performed. */
  attempted: boolean;
  /** Extra context (e.g. documentation caveats). Never contains secrets. */
  notes?: string;
}
