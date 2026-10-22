/**
 * Integration Hub — pure UI helpers (P7 Stage C).
 *
 * Everything in this module is a pure function of the Stage B API record
 * shapes, so the sensitive display rules (masking, placeholder guard,
 * demo-disabled state, status-change confirmation, audit filtering) are
 * unit-testable without a DOM. Components import from here; nothing in
 * this module fetches or touches secrets — Hub API responses never carry
 * credential values (metadata only), and these helpers preserve that.
 */

import {
  type HubChecklistRollup,
  type HubChecklistState,
  type HubCredentialEnvironment,
  type HubCredentialKind,
  type HubCredentialMetadata,
  type HubCredentialStatus,
  type HubDocumentKind,
  type HubIntegrationRecord,
  type HubIntegrationStatus,
  type HubTestAccountStatus,
} from "@/lib/integration-hub/hub-core";
import type { AuditEntry } from "@/lib/admin/audit-core";

/** JSON shape of one item in GET /api/admin/integration-hub (overview). */
export interface HubOverviewItemView {
  integration: HubIntegrationRecord;
  credential_count: number;
  credentials_by_environment: Record<string, number>;
  expired_credentials: number;
  nearest_expiry: string | null;
  checklist: HubChecklistRollup;
  document_count: number;
  test_account_count: number;
}

export type HubMetadata = Record<string, unknown>;

// ── Badge tones (house style: text-*-300 border-*-500/40 bg-*-950/30) ──────

export type BadgeTone =
  | "emerald"
  | "amber"
  | "rose"
  | "sky"
  | "violet"
  | "zinc";

export const TONE_CLASSES: Record<BadgeTone, string> = {
  emerald: "text-emerald-300 border-emerald-500/40 bg-emerald-950/30",
  amber: "text-amber-300 border-amber-500/40 bg-amber-950/30",
  rose: "text-rose-300 border-rose-500/40 bg-rose-950/30",
  sky: "text-sky-300 border-sky-500/40 bg-sky-950/30",
  violet: "text-violet-300 border-violet-500/40 bg-violet-950/30",
  zinc: "text-black-300 border-black-600 bg-black-800",
};

// ── Integration status vocabulary (stored enum → operator label) ──────────
//
// The stored vocabulary is Stage B's workflow enum; the labels present it
// in the master prompt's Part 5 terms (draft / pending external review /
// configured / live …) without ever upgrading a state the API did not
// report — a saved configuration is never displayed as "Live" unless the
// stored status really is `live`.

export interface StatusMeta {
  label: string;
  tone: BadgeTone;
  /** One-line operator explanation shown on the detail page. */
  hint: string;
}

export const HUB_STATUS_META: Record<HubIntegrationStatus, StatusMeta> = {
  draft: {
    label: "Draft",
    tone: "zinc",
    hint: "Not configured yet — a working draft only.",
  },
  configuring: {
    label: "Configuring",
    tone: "amber",
    hint: "Configuration in progress — credentials or verification are still outstanding.",
  },
  ready_for_submission: {
    label: "Ready for submission",
    tone: "sky",
    hint: "Local configuration complete; ready to submit for external review.",
  },
  submitted: {
    label: "Submitted",
    tone: "violet",
    hint: "Submitted — pending external review.",
  },
  in_review: {
    label: "In review",
    tone: "violet",
    hint: "Under external review. This is not an approval.",
  },
  changes_requested: {
    label: "Changes requested",
    tone: "amber",
    hint: "The external reviewer requested changes before approval.",
  },
  approved: {
    label: "Approved",
    tone: "emerald",
    hint: "Externally approved. Approved is not the same as live.",
  },
  live: {
    label: "Live",
    tone: "emerald",
    hint: "Marked live by an admin after verification.",
  },
  paused: {
    label: "Paused",
    tone: "zinc",
    hint: "Paused by an admin; configuration is kept.",
  },
  retired: {
    label: "Retired",
    tone: "zinc",
    hint: "Retired — kept for history only.",
  },
};

/** Statuses whose transition the Stage B API guards behind an explicit
 *  `confirm_status_change: true` (mirrors the API's restricted set). */
export const HUB_RESTRICTED_STATUSES: HubIntegrationStatus[] = [
  "approved",
  "live",
];

export function statusChangeNeedsConfirm(
  next: HubIntegrationStatus
): boolean {
  return HUB_RESTRICTED_STATUSES.includes(next);
}

/** Build the PUT body for a status change, adding the confirmation flag
 *  only when the admin explicitly confirmed a restricted transition. */
export function buildStatusUpdateBody(
  next: HubIntegrationStatus,
  confirmed: boolean
): Record<string, unknown> {
  const body: Record<string, unknown> = { status: next };
  if (statusChangeNeedsConfirm(next) && confirmed) {
    body.confirm_status_change = true;
  }
  return body;
}

// ── Credentials ─────────────────────────────────────────────────────────────

export const CREDENTIAL_STATUS_META: Record<
  HubCredentialStatus,
  { label: string; tone: BadgeTone }
> = {
  configured: { label: "Configured", tone: "emerald" },
  needs_verification: { label: "Needs verification", tone: "amber" },
  expired: { label: "Expired", tone: "rose" },
  revoked: { label: "Revoked", tone: "rose" },
};

export const CREDENTIAL_ENV_META: Record<
  HubCredentialEnvironment,
  { label: string; tone: BadgeTone }
> = {
  production: { label: "Production", tone: "sky" },
  staging: { label: "Staging", tone: "violet" },
  test: { label: "Test", tone: "amber" },
  development: { label: "Development", tone: "zinc" },
};

export const CREDENTIAL_KIND_LABELS: Record<HubCredentialKind, string> = {
  api_key: "API key",
  client_secret: "Client secret",
  oauth_client_id: "OAuth client ID",
  webhook_secret: "Webhook secret",
  bearer_token: "Bearer token",
  password: "Password",
  test_account_password: "Test account password",
  other: "Other",
};

/**
 * Which kinds hold true secrets (vs identifiers). Stage B stores EVERY
 * credential value encrypted and discloses every value — of any kind —
 * only through the audited reveal/copy endpoints, so this classification
 * drives labelling only ("secret" tag, export warnings), never a
 * different data path. `oauth_client_id` values are identifiers.
 */
export const UI_SECRET_CREDENTIAL_KINDS: readonly HubCredentialKind[] = [
  "api_key",
  "client_secret",
  "webhook_secret",
  "bearer_token",
  "password",
  "test_account_password",
];

export function isSecretCredentialKind(kind: HubCredentialKind): boolean {
  return UI_SECRET_CREDENTIAL_KINDS.includes(kind);
}

/**
 * The ONLY rendering of a credential's value anywhere in the Hub UI:
 * bullets plus the server-provided last-4 — or an explicit "no value"
 * state. The API never sends the value itself outside the audited
 * reveal/copy responses, so there is nothing else to render.
 */
export function maskCredentialValue(cred: HubCredentialMetadata): string {
  if (!cred.has_value) return "No value stored";
  return cred.value_last4 ? `••••••••${cred.value_last4}` : "••••••••";
}

/** The placeholder SHOWN in the write-only value field (text only — the
 *  guard below refuses to ever submit it). */
export function placeholderForKind(kind: HubCredentialKind): string {
  switch (kind) {
    case "client_secret":
      return "ENTER_REAL_CLIENT_SECRET";
    case "api_key":
      return "ENTER_REAL_API_KEY";
    case "webhook_secret":
      return "ENTER_REAL_WEBHOOK_SECRET";
    case "bearer_token":
      return "ENTER_REAL_BEARER_TOKEN";
    case "oauth_client_id":
      return "ENTER_REAL_CLIENT_ID";
    case "password":
    case "test_account_password":
      return "ENTER_REAL_PASSWORD";
    default:
      return "ENTER_REAL_VALUE";
  }
}

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /^ENTER_REAL_[A-Z0-9_]*$/i,
  /^enter[-_ ]?real\b/i,
  /\bplaceholder\b/i,
  /^your[-_ ][a-z]/i,
  /^change[-_ ]?me$/i,
  /^replace[-_ ]?me/i,
  /^xxx+$/i,
  /^\.\.\.+$/,
];

/**
 * Guard rail: a placeholder string (including the exact placeholder shown
 * in the form) must never be submitted as a credential value.
 */
export function isPlaceholderSecretValue(value: string): boolean {
  const v = value.trim();
  if (v === "") return false;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(v));
}

/** Validate the credential form before any request is made. */
export function credentialFormError(input: {
  isEdit: boolean;
  value: string;
  notes: string;
}): string | null {
  const value = input.value;
  if (!input.isEdit && value.trim() === "") {
    return "Enter the real credential value — it is encrypted before it is stored.";
  }
  if (value.trim() !== "" && isPlaceholderSecretValue(value)) {
    return "That is the placeholder text, not a real credential. Paste the real value issued by the provider — placeholders are never saved.";
  }
  if (value.trim() !== "" && input.notes.trim() === value.trim()) {
    return "The note repeats the credential value. Notes are stored unencrypted metadata — describe the credential instead of repeating it.";
  }
  return null;
}

/** Credential writes are disabled in Demo Mode (Stage B returns 503; the
 *  UI disables the forms up front and shows why). */
export function credentialWritesDisabled(mode: "demo" | "supabase"): boolean {
  return mode === "demo";
}

export const DEMO_CREDENTIAL_NOTICE =
  "Credential entry is disabled in demo mode — nothing is stored. Connect Supabase and sign in as an admin to store real credentials.";

export type ExpiryState = "expired" | "expiring_soon" | null;

export function credentialExpiryState(
  cred: HubCredentialMetadata,
  nowMs: number
): ExpiryState {
  if (cred.status === "expired") return "expired";
  if (!cred.expires_at) return null;
  const exp = new Date(cred.expires_at).getTime();
  if (Number.isNaN(exp)) return null;
  if (exp <= nowMs) return "expired";
  if (exp - nowMs <= 30 * 24 * 60 * 60 * 1000) return "expiring_soon";
  return null;
}

// ── Overview completeness ───────────────────────────────────────────────────

export interface IntegrationCompleteness {
  credentialsTotal: number;
  credentialsLabel: string;
  checklistPercent: number;
  warnings: string[];
}

/**
 * Completeness from what the overview API actually reports — credential
 * count, expired count, checklist rollup and the stored status. Nothing is
 * inferred about per-credential verification here (the overview does not
 * report it; the detail page shows per-credential states).
 */
export function integrationCompleteness(
  item: HubOverviewItemView
): IntegrationCompleteness {
  const warnings: string[] = [];
  if (item.expired_credentials > 0) {
    warnings.push(
      `${item.expired_credentials} expired credential${item.expired_credentials === 1 ? "" : "s"}`
    );
  }
  if (item.checklist.blocked > 0) {
    warnings.push(
      `${item.checklist.blocked} blocked checklist item${item.checklist.blocked === 1 ? "" : "s"}`
    );
  }
  const status = item.integration.status;
  if (status === "draft" || status === "configuring") {
    warnings.push("Not verified yet — configuration incomplete");
  }
  return {
    credentialsTotal: item.credential_count,
    credentialsLabel: `${item.credential_count} credential${item.credential_count === 1 ? "" : "s"} stored`,
    checklistPercent: item.checklist.percent_done,
    warnings,
  };
}

// ── Integration metadata readers (documentation-shaped fields) ─────────────

export interface HubEndpointMeta {
  label: string;
  url: string;
  method?: string;
  notes?: string;
}

export interface HubToolMeta {
  name: string;
  scope?: string;
  permission?: string;
  description?: string;
}

export interface HubLinkMeta {
  label: string;
  url: string;
}

export interface HubWebhookMeta {
  name: string;
  url?: string;
  events: string[];
  notes?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function metaString(
  metadata: HubMetadata,
  key: string
): string | undefined {
  const v = metadata[key];
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

export function metaEndpoints(metadata: HubMetadata): HubEndpointMeta[] {
  const raw = metadata["endpoints"];
  if (!Array.isArray(raw)) return [];
  const out: HubEndpointMeta[] = [];
  for (const e of raw) {
    if (isRecord(e) && typeof e.label === "string" && typeof e.url === "string") {
      out.push({
        label: e.label,
        url: e.url,
        method: typeof e.method === "string" ? e.method : undefined,
        notes: typeof e.notes === "string" ? e.notes : undefined,
      });
    }
  }
  return out;
}

export function metaRedirectUris(metadata: HubMetadata): string[] {
  const raw = metadata["redirect_uris"];
  if (!Array.isArray(raw)) return [];
  return raw.filter((u): u is string => typeof u === "string");
}

export function metaScopes(metadata: HubMetadata): string[] {
  const raw = metadata["scopes"];
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === "string");
}

export function metaScopeProfile(metadata: HubMetadata): string | undefined {
  return metaString(metadata, "scope_profile");
}

export function metaTools(metadata: HubMetadata): HubToolMeta[] {
  const raw = metadata["tool_inventory"];
  if (!Array.isArray(raw)) return [];
  const out: HubToolMeta[] = [];
  for (const t of raw) {
    if (isRecord(t) && typeof t.name === "string") {
      out.push({
        name: t.name,
        scope: typeof t.scope === "string" ? t.scope : undefined,
        permission: typeof t.permission === "string" ? t.permission : undefined,
        description:
          typeof t.description === "string" ? t.description : undefined,
      });
    }
  }
  return out;
}

export function metaComplianceLinks(metadata: HubMetadata): HubLinkMeta[] {
  const raw = metadata["compliance_links"];
  if (!Array.isArray(raw)) return [];
  const out: HubLinkMeta[] = [];
  for (const l of raw) {
    if (isRecord(l) && typeof l.label === "string" && typeof l.url === "string") {
      out.push({ label: l.label, url: l.url });
    }
  }
  return out;
}

export function metaLimitations(metadata: HubMetadata): string[] {
  const raw = metadata["known_limitations"];
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === "string");
}

export function metaWebhooks(metadata: HubMetadata): HubWebhookMeta[] {
  const raw = metadata["webhooks"];
  if (!Array.isArray(raw)) return [];
  const out: HubWebhookMeta[] = [];
  for (const w of raw) {
    if (isRecord(w) && typeof w.name === "string") {
      out.push({
        name: w.name,
        url: typeof w.url === "string" ? w.url : undefined,
        events: Array.isArray(w.events)
          ? w.events.filter((e): e is string => typeof e === "string")
          : [],
        notes: typeof w.notes === "string" ? w.notes : undefined,
      });
    }
  }
  return out;
}

export interface HubLegalMeta {
  privacy_url?: string;
  terms_url?: string;
  data_categories?: string;
  retention?: string;
  incident_contact?: string;
}

export function metaLegal(metadata: HubMetadata): HubLegalMeta {
  const raw = metadata["legal"];
  if (!isRecord(raw)) return {};
  const str = (k: string) =>
    typeof raw[k] === "string" && (raw[k] as string).trim() !== ""
      ? (raw[k] as string)
      : undefined;
  return {
    privacy_url: str("privacy_url"),
    terms_url: str("terms_url"),
    data_categories: str("data_categories"),
    retention: str("retention"),
    incident_contact: str("incident_contact"),
  };
}

// ── Part 5.3 operator-notes fields (metadata keys; values are TEXT only —
//    the keys deliberately avoid the API's secret-key filter words) ────────

export const HUB_NOTES_FIELDS: { key: string; label: string; rows: number }[] = [
  { key: "notes_blockers", label: "Known blockers", rows: 3 },
  { key: "notes_requirements", label: "External account requirements", rows: 3 },
  { key: "notes_redirect_status", label: "Redirect URI verification status", rows: 2 },
  { key: "notes_test_account_status", label: "Test account status", rows: 2 },
  {
    key: "notes_required_items",
    label: "Required secrets / items to obtain (names only — never paste values here)",
    rows: 3,
  },
  { key: "notes_manual_instructions", label: "Manual setup instructions", rows: 4 },
  { key: "notes_last_test", label: "Last successful test (date + what was tested)", rows: 2 },
  { key: "notes_review_stage", label: "Current external review stage", rows: 2 },
  { key: "notes_remaining_actions", label: "Remaining actions", rows: 3 },
];

// ── Checklists / documents / test accounts ──────────────────────────────────

export const CHECKLIST_STATE_META: Record<
  HubChecklistState,
  { label: string; tone: BadgeTone }
> = {
  todo: { label: "To do", tone: "zinc" },
  in_progress: { label: "In progress", tone: "sky" },
  done: { label: "Done", tone: "emerald" },
  blocked: { label: "Blocked", tone: "rose" },
  not_applicable: { label: "Not applicable", tone: "zinc" },
};

export const DOCUMENT_KIND_LABELS: Record<HubDocumentKind, string> = {
  doc: "Document",
  copy_package: "Copy package",
  manifest: "Manifest",
  policy: "Policy",
  note: "Note",
};

export const TEST_ACCOUNT_STATUS_META: Record<
  HubTestAccountStatus,
  { label: string; tone: BadgeTone }
> = {
  active: { label: "Active", tone: "sky" },
  needs_refresh: { label: "Needs refresh", tone: "amber" },
  retired: { label: "Retired", tone: "zinc" },
};

// ── Audit history ───────────────────────────────────────────────────────────

/** Friendly labels for the audit actions Stage B actually writes
 *  (hub-server.ts — verified against the source, incl. HUB_STATUS_CHANGE
 *  for guarded status transitions and HUB_CREDENTIAL_ROTATE for value
 *  rotation via update). */
export const HUB_AUDIT_ACTION_LABELS: Record<string, string> = {
  HUB_INTEGRATION_CREATE: "Integration created",
  HUB_INTEGRATION_UPDATE: "Integration updated",
  HUB_INTEGRATION_DELETE: "Integration deleted",
  HUB_STATUS_CHANGE: "Status changed",
  HUB_CREDENTIAL_CREATE: "Credential stored",
  HUB_CREDENTIAL_UPDATE: "Credential updated",
  HUB_CREDENTIAL_ROTATE: "Credential value rotated",
  HUB_CREDENTIAL_DELETE: "Credential deleted",
  HUB_CREDENTIAL_REVEAL: "Credential value revealed",
  HUB_CREDENTIAL_COPY: "Credential value copied",
  HUB_COPY_PACKAGE_GENERATE: "Integration package generated",
  HUB_CHECKLIST_UPDATE: "Checklist item updated",
  HUB_TEST_ACCOUNT_CREATE: "Test account added",
  HUB_TEST_ACCOUNT_UPDATE: "Test account updated",
  HUB_TEST_ACCOUNT_DELETE: "Test account removed",
  HUB_DOCUMENT_CREATE: "Document created",
  HUB_DOCUMENT_UPDATE: "Document updated",
  HUB_DOCUMENT_DELETE: "Document deleted",
};

/**
 * Keep only the Hub audit entries that belong to one integration or one of
 * its credentials. Audit rows never contain credential values (Stage B
 * writes metadata only), and this filter works purely on action /
 * resource / details metadata — there is no value field to leak.
 */
export function isHubAuditForIntegration(
  entry: AuditEntry,
  slug: string,
  credentialIds: string[]
): boolean {
  if (!entry.action.startsWith("HUB_")) return false;
  if (entry.resource === `hub:${slug}`) return true;
  if (entry.resource && entry.resource.startsWith("hub:credential:")) {
    const id = entry.resource.slice("hub:credential:".length);
    if (credentialIds.includes(id)) return true;
  }
  // Stage B audit details strings name the integration slug
  // (e.g. "Stored credential ‘…’ for bizreviewradar.").
  return entry.details.includes(slug);
}

// ── Detail tabs (Part 5.2) ──────────────────────────────────────────────────

export const HUB_TABS = [
  { id: "overview", label: "Overview" },
  { id: "configuration", label: "Configuration" },
  { id: "credentials", label: "Credentials" },
  { id: "endpoints", label: "API Endpoints" },
  { id: "oauth", label: "OAuth & Permissions" },
  { id: "tools", label: "Tools or Actions" },
  { id: "webhooks", label: "Webhooks" },
  { id: "documentation", label: "Documentation" },
  { id: "terms", label: "Terms & Privacy" },
  { id: "testing", label: "Testing" },
  { id: "audit", label: "Audit History" },
] as const;

export type HubTabId = (typeof HUB_TABS)[number]["id"];
