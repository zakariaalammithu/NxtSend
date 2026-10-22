/**
 * Integration Hub core — pure types, validation, scope profiles and
 * record mappers (P7 Stage B). No I/O, no env reads: everything here is
 * unit-testable in isolation, following the admin settings-core pattern
 * (unknown fields are dropped, partial updates validated against the
 * current record).
 *
 * Three safety invariants live here:
 *
 *  1. METADATA-ONLY MAPPERS. `toHubCredentialMetadata` copies fields one
 *     by one and NEVER copies `value_enc`. Every list/get/overview
 *     response is built through these mappers, so a ciphertext (let
 *     alone a plaintext) cannot leak by accident of a spread.
 *
 *  2. STATUS GUARD. An integration may only be SET to `approved` or
 *     `live` when the request carries the explicit confirmation field
 *     `confirm_status_change: true`. Status is never derived from
 *     credential presence anywhere in this module or the service
 *     layer — saving a credential or a config can never flip an
 *     integration to live.
 *
 *  3. CLOSED SCOPE PROFILES. Scopes are validated against a named,
 *     closed profile. The Muse connector profile is EXACTLY
 *     {businesses:read, reports:read, recommendations:read};
 *     `reviews:read` / `reviews:reply` do not exist in any BRR enum
 *     and are rejected under every profile, and `analyses:read` is
 *     rejected as a Muse scope (it belongs only to the broader API
 *     profile).
 */

// ── Vocabularies ────────────────────────────────────────────────────────────

export const HUB_INTEGRATION_STATUSES = [
  "draft",
  "configuring",
  "ready_for_submission",
  "submitted",
  "in_review",
  "changes_requested",
  "approved",
  "live",
  "paused",
  "retired",
] as const;
export type HubIntegrationStatus = (typeof HUB_INTEGRATION_STATUSES)[number];

/** Statuses that may be assigned at creation time (never live/approved). */
export const HUB_CREATABLE_STATUSES = ["draft", "configuring"] as const;

/** Statuses that require the explicit confirm field to be set. */
export const HUB_GUARDED_STATUSES: readonly HubIntegrationStatus[] = [
  "approved",
  "live",
];

export const HUB_CREDENTIAL_KINDS = [
  "api_key",
  "client_secret",
  "oauth_client_id",
  "webhook_secret",
  "bearer_token",
  "password",
  "test_account_password",
  "other",
] as const;
export type HubCredentialKind = (typeof HUB_CREDENTIAL_KINDS)[number];

export const HUB_CREDENTIAL_ENVIRONMENTS = [
  "production",
  "staging",
  "test",
  "development",
] as const;
export type HubCredentialEnvironment =
  (typeof HUB_CREDENTIAL_ENVIRONMENTS)[number];

export const HUB_CREDENTIAL_STATUSES = [
  "configured",
  "needs_verification",
  "expired",
  "revoked",
] as const;
export type HubCredentialStatus = (typeof HUB_CREDENTIAL_STATUSES)[number];

export const HUB_TEST_ACCOUNT_STATUSES = [
  "active",
  "needs_refresh",
  "retired",
] as const;
export type HubTestAccountStatus = (typeof HUB_TEST_ACCOUNT_STATUSES)[number];

export const HUB_CHECKLIST_STATES = [
  "todo",
  "in_progress",
  "done",
  "blocked",
  "not_applicable",
] as const;
export type HubChecklistState = (typeof HUB_CHECKLIST_STATES)[number];

export const HUB_DOCUMENT_KINDS = [
  "doc",
  "copy_package",
  "manifest",
  "policy",
  "note",
] as const;
export type HubDocumentKind = (typeof HUB_DOCUMENT_KINDS)[number];

// ── Scope profiles ──────────────────────────────────────────────────────────

/**
 * The Muse connector's exact scope set (BRR `MUSE_MCP_SCOPES`).
 * Closed: anything outside these three strings is not a Muse scope.
 */
export const MUSE_CONNECTOR_SCOPES = [
  "businesses:read",
  "reports:read",
  "recommendations:read",
] as const;

/** The full BRR API-key scope set (BRR `API_KEY_SCOPES`, incl. Muse's 3). */
export const BRR_API_SCOPES = [
  "businesses:read",
  "analyses:read",
  "analyses:write",
  "reports:read",
  "recommendations:read",
  "review_replies:write",
  "webhooks:manage",
] as const;

export const HUB_SCOPE_PROFILES = {
  muse: MUSE_CONNECTOR_SCOPES,
  brr_api: BRR_API_SCOPES,
} as const;
export type HubScopeProfile = keyof typeof HUB_SCOPE_PROFILES;

export function isHubScopeProfile(value: unknown): value is HubScopeProfile {
  return value === "muse" || value === "brr_api";
}

export interface ScopeValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * Validate a scope list against a named closed profile. Rules:
 *  - every scope must be a member of the profile's set;
 *  - `reviews:*` scopes fail under EVERY profile (they are not real
 *    BRR scopes — a past dashboard bug offered them);
 *  - duplicates and empty strings fail.
 */
export function validateScopesForProfile(
  profile: string,
  scopes: unknown
): ScopeValidationResult {
  const errors: string[] = [];
  if (!isHubScopeProfile(profile)) {
    return {
      ok: false,
      errors: [`Unknown scope profile "${String(profile)}".`],
    };
  }
  if (!Array.isArray(scopes)) {
    return { ok: false, errors: ["scopes must be an array of scope strings."] };
  }
  const allowed = new Set<string>(HUB_SCOPE_PROFILES[profile]);
  const seen = new Set<string>();
  for (const raw of scopes) {
    if (typeof raw !== "string" || raw.trim() === "") {
      errors.push("Scopes must be non-empty strings.");
      continue;
    }
    const scope = raw.trim();
    if (seen.has(scope)) {
      errors.push(`Duplicate scope "${scope}".`);
      continue;
    }
    seen.add(scope);
    if (scope.startsWith("reviews:")) {
      errors.push(
        `Scope "${scope}" does not exist in BRR's scope enums and is not ` +
          `accepted anywhere.`
      );
      continue;
    }
    if (!allowed.has(scope)) {
      errors.push(
        `Scope "${scope}" is not part of the "${profile}" profile ` +
          `(allowed: ${Array.from(allowed).join(", ")}).`
      );
    }
  }
  return { ok: errors.length === 0, errors };
}

// ── API record shapes ───────────────────────────────────────────────────────

export interface HubIntegrationRecord {
  id: string;
  slug: string;
  name: string;
  vendor: string | null;
  category: string;
  status: HubIntegrationStatus;
  external_status_note: string | null;
  website_url: string | null;
  docs_url: string | null;
  review_portal_url: string | null;
  support_email: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * The ONLY credential shape any non-disclosure response may carry.
 * There is intentionally no `value` and no `value_enc` field here.
 */
export interface HubCredentialMetadata {
  id: string;
  integration_id: string;
  label: string;
  kind: HubCredentialKind;
  environment: HubCredentialEnvironment;
  status: HubCredentialStatus;
  username_hint: string | null;
  /** True when a value is stored (always true for live rows). */
  has_value: boolean;
  value_last4: string | null;
  expires_at: string | null;
  notes: string;
  last_revealed_at: string | null;
  last_revealed_by: string | null;
  last_copied_at: string | null;
  last_copied_by: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Internal row shape including ciphertext — server-only, never serialised. */
export interface HubCredentialRow extends HubCredentialMetadata {
  value_enc: string;
}

export interface HubTestAccountRecord {
  id: string;
  integration_id: string;
  label: string;
  login_url: string | null;
  username: string;
  password_credential_id: string | null;
  instructions: string;
  representative_data_note: string;
  status: HubTestAccountStatus;
  last_verified_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HubChecklistItemRecord {
  id: string;
  integration_id: string | null;
  list_key: string;
  item_key: string;
  title: string;
  detail: string;
  source_ref: string;
  sort_order: number;
}

export interface HubChecklistStateRecord {
  id: string;
  integration_id: string;
  item_id: string;
  state: HubChecklistState;
  note: string;
  evidence_url: string | null;
  completed_at: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface HubChecklistEntry {
  item: HubChecklistItemRecord;
  state: HubChecklistStateRecord | null;
}

export interface HubDocumentRecord {
  id: string;
  integration_id: string | null;
  slug: string;
  title: string;
  kind: HubDocumentKind;
  body: string;
  template_vars: Record<string, unknown>;
  is_seeded: boolean;
  version: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Mappers (field-by-field; the credential mapper never copies value_enc) ──

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

function jsonObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function enumOr<T extends string>(
  allowed: readonly T[],
  v: unknown,
  fallback: T
): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : fallback;
}

export function toHubIntegrationRecord(row: Record<string, unknown>): HubIntegrationRecord {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    vendor: strOrNull(row.vendor),
    category: typeof row.category === "string" ? row.category : "connector",
    status: enumOr(HUB_INTEGRATION_STATUSES, row.status, "draft"),
    external_status_note: strOrNull(row.external_status_note),
    website_url: strOrNull(row.website_url),
    docs_url: strOrNull(row.docs_url),
    review_portal_url: strOrNull(row.review_portal_url),
    support_email: strOrNull(row.support_email),
    summary: typeof row.summary === "string" ? row.summary : "",
    metadata: jsonObject(row.metadata),
    sort_order: typeof row.sort_order === "number" ? row.sort_order : 0,
    created_by: strOrNull(row.created_by),
    updated_by: strOrNull(row.updated_by),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export function toHubCredentialMetadata(row: Record<string, unknown>): HubCredentialMetadata {
  return {
    id: String(row.id),
    integration_id: String(row.integration_id),
    label: String(row.label),
    kind: enumOr(HUB_CREDENTIAL_KINDS, row.kind, "other"),
    environment: enumOr(
      HUB_CREDENTIAL_ENVIRONMENTS,
      row.environment,
      "production"
    ),
    status: enumOr(HUB_CREDENTIAL_STATUSES, row.status, "needs_verification"),
    username_hint: strOrNull(row.username_hint),
    has_value: typeof row.value_enc === "string" && row.value_enc.length > 0,
    value_last4: strOrNull(row.value_last4),
    expires_at: strOrNull(row.expires_at),
    notes: typeof row.notes === "string" ? row.notes : "",
    last_revealed_at: strOrNull(row.last_revealed_at),
    last_revealed_by: strOrNull(row.last_revealed_by),
    last_copied_at: strOrNull(row.last_copied_at),
    last_copied_by: strOrNull(row.last_copied_by),
    created_by: strOrNull(row.created_by),
    updated_by: strOrNull(row.updated_by),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export function toHubTestAccountRecord(row: Record<string, unknown>): HubTestAccountRecord {
  return {
    id: String(row.id),
    integration_id: String(row.integration_id),
    label: String(row.label),
    login_url: strOrNull(row.login_url),
    username: String(row.username),
    password_credential_id: strOrNull(row.password_credential_id),
    instructions: typeof row.instructions === "string" ? row.instructions : "",
    representative_data_note:
      typeof row.representative_data_note === "string"
        ? row.representative_data_note
        : "",
    status: enumOr(HUB_TEST_ACCOUNT_STATUSES, row.status, "active"),
    last_verified_at: strOrNull(row.last_verified_at),
    created_by: strOrNull(row.created_by),
    updated_by: strOrNull(row.updated_by),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export function toHubChecklistItemRecord(row: Record<string, unknown>): HubChecklistItemRecord {
  return {
    id: String(row.id),
    integration_id: strOrNull(row.integration_id),
    list_key: String(row.list_key),
    item_key: String(row.item_key),
    title: String(row.title),
    detail: typeof row.detail === "string" ? row.detail : "",
    source_ref: typeof row.source_ref === "string" ? row.source_ref : "",
    sort_order: typeof row.sort_order === "number" ? row.sort_order : 0,
  };
}

export function toHubChecklistStateRecord(row: Record<string, unknown>): HubChecklistStateRecord {
  return {
    id: String(row.id),
    integration_id: String(row.integration_id),
    item_id: String(row.item_id),
    state: enumOr(HUB_CHECKLIST_STATES, row.state, "todo"),
    note: typeof row.note === "string" ? row.note : "",
    evidence_url: strOrNull(row.evidence_url),
    completed_at: strOrNull(row.completed_at),
    updated_by: strOrNull(row.updated_by),
    updated_at: String(row.updated_at ?? ""),
  };
}

export function toHubDocumentRecord(row: Record<string, unknown>): HubDocumentRecord {
  return {
    id: String(row.id),
    integration_id: strOrNull(row.integration_id),
    slug: String(row.slug),
    title: String(row.title),
    kind: enumOr(HUB_DOCUMENT_KINDS, row.kind, "doc"),
    body: typeof row.body === "string" ? row.body : "",
    template_vars: jsonObject(row.template_vars),
    is_seeded: row.is_seeded === true,
    version: typeof row.version === "number" ? row.version : 1,
    created_by: strOrNull(row.created_by),
    updated_by: strOrNull(row.updated_by),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

// ── Validation ──────────────────────────────────────────────────────────────

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: Record<string, string> };

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Keys that must never appear in integration metadata (non-secret only). */
const SECRET_KEY_RE = /(secret|password|passwd|token|api[-_]?key|credential)/i;

function bodyObject(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function optString(
  body: Record<string, unknown>,
  key: string,
  max: number,
  errors: Record<string, string>,
  opts: { required?: boolean } = {}
): string | null | undefined {
  const v = body[key];
  if (v === undefined) {
    if (opts.required) errors[key] = "is required";
    return undefined;
  }
  if (v === null) return null;
  if (typeof v !== "string") {
    errors[key] = "must be a string";
    return undefined;
  }
  const trimmed = v.trim();
  if (trimmed.length > max) {
    errors[key] = `must be at most ${max} characters`;
    return undefined;
  }
  if (opts.required && trimmed === "") {
    errors[key] = "is required";
    return undefined;
  }
  return trimmed === "" ? null : trimmed;
}

function optUrl(
  body: Record<string, unknown>,
  key: string,
  errors: Record<string, string>
): string | null | undefined {
  const v = optString(body, key, 2000, errors);
  if (v === undefined || v === null) return v;
  if (!/^https?:\/\//i.test(v)) {
    errors[key] = "must be an http(s) URL";
    return undefined;
  }
  return v;
}

function optEnum<T extends string>(
  body: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  errors: Record<string, string>
): T | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) {
    errors[key] = `must be one of: ${allowed.join(", ")}`;
    return undefined;
  }
  return v as T;
}

function optIsoDate(
  body: Record<string, unknown>,
  key: string,
  errors: Record<string, string>
): string | null | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string" || Number.isNaN(Date.parse(v))) {
    errors[key] = "must be an ISO date/time string or null";
    return undefined;
  }
  return v;
}

/** Slugify a display name into the slug grammar (create-time default). */
export function slugifyHubName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * Validate + sanitise integration metadata: must be a plain object, and
 * must not smuggle secrets (metadata is NON-SECRET by contract — it is
 * included in copy packages). When `scope_profile`/`scopes` are present
 * they are validated against the closed profile.
 */
export function validateHubMetadata(
  raw: unknown,
  errors: Record<string, string>,
  key = "metadata"
): Record<string, unknown> | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    errors[key] = "must be an object";
    return undefined;
  }
  const meta = raw as Record<string, unknown>;
  for (const k of Object.keys(meta)) {
    if (SECRET_KEY_RE.test(k) && k !== "scope_profile") {
      errors[key] =
        `metadata key "${k}" looks like a secret. Integration metadata is ` +
        `non-secret only — store values as Hub credentials instead.`;
      return undefined;
    }
  }
  if (meta.scopes !== undefined || meta.scope_profile !== undefined) {
    const profile =
      typeof meta.scope_profile === "string" ? meta.scope_profile : "muse";
    const check = validateScopesForProfile(profile, meta.scopes ?? []);
    if (!check.ok) {
      errors[key] = check.errors.join(" ");
      return undefined;
    }
  }
  return meta;
}

export interface HubIntegrationInput {
  name?: string;
  slug?: string;
  vendor?: string | null;
  category?: string;
  status?: HubIntegrationStatus;
  external_status_note?: string | null;
  website_url?: string | null;
  docs_url?: string | null;
  review_portal_url?: string | null;
  support_email?: string | null;
  summary?: string;
  metadata?: Record<string, unknown>;
  sort_order?: number;
}

function validateIntegrationFields(
  body: Record<string, unknown>,
  errors: Record<string, string>,
  partial: boolean
): HubIntegrationInput {
  const out: HubIntegrationInput = {};
  const name = optString(body, "name", 160, errors, {
    required: !partial,
  });
  if (name !== undefined && name !== null) out.name = name;
  if (body.slug !== undefined) {
    if (typeof body.slug !== "string" || !SLUG_RE.test(body.slug.trim())) {
      errors.slug = "must match ^[a-z0-9][a-z0-9-]*$";
    } else out.slug = body.slug.trim();
  }
  const vendor = optString(body, "vendor", 160, errors);
  if (vendor !== undefined) out.vendor = vendor;
  const category = optString(body, "category", 80, errors);
  if (category !== undefined && category !== null) out.category = category;
  const extNote = optString(body, "external_status_note", 2000, errors);
  if (extNote !== undefined) out.external_status_note = extNote;
  const website = optUrl(body, "website_url", errors);
  if (website !== undefined) out.website_url = website;
  const docs = optUrl(body, "docs_url", errors);
  if (docs !== undefined) out.docs_url = docs;
  const portal = optUrl(body, "review_portal_url", errors);
  if (portal !== undefined) out.review_portal_url = portal;
  const email = optString(body, "support_email", 320, errors);
  if (email !== undefined) {
    if (email !== null && !EMAIL_RE.test(email)) {
      errors.support_email = "must be an email address";
    } else out.support_email = email;
  }
  const summary = optString(body, "summary", 20000, errors);
  if (summary !== undefined && summary !== null) out.summary = summary;
  const metadata = validateHubMetadata(body.metadata, errors);
  if (metadata !== undefined) out.metadata = metadata;
  if (body.sort_order !== undefined) {
    if (
      typeof body.sort_order !== "number" ||
      !Number.isInteger(body.sort_order)
    ) {
      errors.sort_order = "must be an integer";
    } else out.sort_order = body.sort_order;
  }
  return out;
}

/**
 * The status guard, applied to create and update alike:
 *  - `live`/`approved` REQUIRE `confirm_status_change === true` in the
 *    request body (the explicit field Stage D/tests control);
 *  - at CREATE time only draft/configuring may be used at all.
 * The confirmation field is consumed here and is never persisted.
 */
export function checkStatusAssignment(
  body: Record<string, unknown>,
  errors: Record<string, string>,
  isCreate: boolean
): HubIntegrationStatus | undefined {
  if (body.status === undefined) return undefined;
  const status = body.status as HubIntegrationStatus;
  if (!(HUB_INTEGRATION_STATUSES as readonly string[]).includes(String(status))) {
    errors.status = `must be one of: ${HUB_INTEGRATION_STATUSES.join(", ")}`;
    return undefined;
  }
  if (isCreate && !(HUB_CREATABLE_STATUSES as readonly string[]).includes(status)) {
    errors.status =
      `New integrations start as draft or configuring. "${status}" can ` +
      `only be reached later via an explicit status change.`;
    return undefined;
  }
  if (HUB_GUARDED_STATUSES.includes(status)) {
    if (body.confirm_status_change !== true) {
      errors.status =
        `Setting status to "${status}" requires the explicit field ` +
        `confirm_status_change: true. Status is never set as a side ` +
        `effect of saving configuration or credentials.`;
      return undefined;
    }
  }
  return status;
}

export function validateIntegrationCreate(
  raw: unknown
): ValidationResult<HubIntegrationInput & { name: string; slug: string }> {
  const body = bodyObject(raw);
  if (!body) return { ok: false, errors: { body: "must be a JSON object" } };
  const errors: Record<string, string> = {};
  const fields = validateIntegrationFields(body, errors, false);
  const status = checkStatusAssignment(body, errors, true);
  if (status !== undefined) fields.status = status;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const name = fields.name as string;
  const slug = fields.slug ?? slugifyHubName(name);
  if (!SLUG_RE.test(slug)) {
    return {
      ok: false,
      errors: { slug: "could not be derived from the name; provide a slug" },
    };
  }
  return { ok: true, value: { ...fields, name, slug } };
}

export function validateIntegrationUpdate(
  raw: unknown
): ValidationResult<HubIntegrationInput> {
  const body = bodyObject(raw);
  if (!body) return { ok: false, errors: { body: "must be a JSON object" } };
  const errors: Record<string, string> = {};
  const fields = validateIntegrationFields(body, errors, true);
  const status = checkStatusAssignment(body, errors, false);
  if (status !== undefined) fields.status = status;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: fields };
}

// ── Credential input ────────────────────────────────────────────────────────

export interface HubCredentialCreateInput {
  label: string;
  kind: HubCredentialKind;
  environment: HubCredentialEnvironment;
  status?: HubCredentialStatus;
  username_hint?: string | null;
  value: string;
  expires_at?: string | null;
  notes?: string;
}

export interface HubCredentialUpdateInput {
  label?: string;
  kind?: HubCredentialKind;
  environment?: HubCredentialEnvironment;
  status?: HubCredentialStatus;
  username_hint?: string | null;
  /** Present ⇒ rotate the stored value. */
  value?: string;
  expires_at?: string | null;
  notes?: string;
}

function validateCredentialValue(
  body: Record<string, unknown>,
  errors: Record<string, string>,
  required: boolean
): string | undefined {
  const v = body.value;
  if (v === undefined) {
    if (required) errors.value = "is required";
    return undefined;
  }
  if (typeof v !== "string" || v.length === 0) {
    errors.value = "must be a non-empty string";
    return undefined;
  }
  if (v.length > 8192) {
    errors.value = "must be at most 8192 characters";
    return undefined;
  }
  return v;
}

export function validateCredentialCreate(
  raw: unknown
): ValidationResult<HubCredentialCreateInput> {
  const body = bodyObject(raw);
  if (!body) return { ok: false, errors: { body: "must be a JSON object" } };
  const errors: Record<string, string> = {};
  const label = optString(body, "label", 160, errors, { required: true });
  const kind = optEnum(body, "kind", HUB_CREDENTIAL_KINDS, errors) ?? "api_key";
  const environment =
    optEnum(body, "environment", HUB_CREDENTIAL_ENVIRONMENTS, errors) ??
    "production";
  const status = optEnum(body, "status", HUB_CREDENTIAL_STATUSES, errors);
  if (status === "expired" || status === "revoked") {
    errors.status = "a new credential cannot start as expired or revoked";
  }
  const usernameHint = optString(body, "username_hint", 320, errors);
  const value = validateCredentialValue(body, errors, true);
  const expiresAt = optIsoDate(body, "expires_at", errors);
  const notes = optString(body, "notes", 5000, errors);
  if (value !== undefined && typeof body.notes === "string" && body.notes === value) {
    errors.notes = "notes must not repeat the credential value";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      label: label as string,
      kind,
      environment,
      status,
      username_hint: usernameHint,
      value: value as string,
      expires_at: expiresAt,
      notes: notes ?? undefined,
    },
  };
}

export function validateCredentialUpdate(
  raw: unknown
): ValidationResult<HubCredentialUpdateInput> {
  const body = bodyObject(raw);
  if (!body) return { ok: false, errors: { body: "must be a JSON object" } };
  const errors: Record<string, string> = {};
  const out: HubCredentialUpdateInput = {};
  const label = optString(body, "label", 160, errors);
  if (label !== undefined && label !== null) out.label = label;
  const kind = optEnum(body, "kind", HUB_CREDENTIAL_KINDS, errors);
  if (kind !== undefined) out.kind = kind;
  const environment = optEnum(
    body,
    "environment",
    HUB_CREDENTIAL_ENVIRONMENTS,
    errors
  );
  if (environment !== undefined) out.environment = environment;
  const status = optEnum(body, "status", HUB_CREDENTIAL_STATUSES, errors);
  if (status !== undefined) out.status = status;
  const usernameHint = optString(body, "username_hint", 320, errors);
  if (usernameHint !== undefined) out.username_hint = usernameHint;
  const value = validateCredentialValue(body, errors, false);
  if (value !== undefined) out.value = value;
  if (body.notes !== undefined && typeof body.notes === "string" && body.notes === value) {
    errors.notes = "notes must not repeat the credential value";
  }
  const expiresAt = optIsoDate(body, "expires_at", errors);
  if (expiresAt !== undefined) out.expires_at = expiresAt;
  const notes = optString(body, "notes", 5000, errors);
  if (notes !== undefined && notes !== null) out.notes = notes;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: out };
}

// ── Test-account input ──────────────────────────────────────────────────────

export interface HubTestAccountInput {
  label?: string;
  login_url?: string | null;
  username?: string;
  password_credential_id?: string | null;
  instructions?: string;
  representative_data_note?: string;
  status?: HubTestAccountStatus;
  /** True ⇒ stamp last_verified_at = now (service-side). */
  mark_verified?: boolean;
}

export function validateTestAccountInput(
  raw: unknown,
  partial: boolean
): ValidationResult<HubTestAccountInput> {
  const body = bodyObject(raw);
  if (!body) return { ok: false, errors: { body: "must be a JSON object" } };
  const errors: Record<string, string> = {};
  // A password FIELD is never accepted on this resource — the password
  // lives only in the vault, referenced by password_credential_id.
  if ("password" in body || "password_value" in body) {
    errors.password =
      "test accounts never accept a password field; store the password " +
      "as a Hub credential (kind test_account_password) and reference it " +
      "via password_credential_id";
  }
  const out: HubTestAccountInput = {};
  const label = optString(body, "label", 160, errors, { required: !partial });
  if (label !== undefined && label !== null) out.label = label;
  const loginUrl = optUrl(body, "login_url", errors);
  if (loginUrl !== undefined) out.login_url = loginUrl;
  const username = optString(body, "username", 320, errors, {
    required: !partial,
  });
  if (username !== undefined && username !== null) out.username = username;
  if (body.password_credential_id !== undefined) {
    const v = body.password_credential_id;
    if (v === null) out.password_credential_id = null;
    else if (typeof v === "string" && v.trim() !== "")
      out.password_credential_id = v.trim();
    else errors.password_credential_id = "must be a credential id or null";
  }
  const instructions = optString(body, "instructions", 10000, errors);
  if (instructions !== undefined && instructions !== null)
    out.instructions = instructions;
  const repNote = optString(body, "representative_data_note", 10000, errors);
  if (repNote !== undefined && repNote !== null)
    out.representative_data_note = repNote;
  const status = optEnum(body, "status", HUB_TEST_ACCOUNT_STATUSES, errors);
  if (status !== undefined) out.status = status;
  if (body.mark_verified !== undefined) {
    if (typeof body.mark_verified !== "boolean")
      errors.mark_verified = "must be a boolean";
    else out.mark_verified = body.mark_verified;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: out };
}

// ── Checklist-state input ───────────────────────────────────────────────────

export interface HubChecklistStateInput {
  state: HubChecklistState;
  note?: string;
  evidence_url?: string | null;
}

export function validateChecklistStateInput(
  raw: unknown
): ValidationResult<HubChecklistStateInput> {
  const body = bodyObject(raw);
  if (!body) return { ok: false, errors: { body: "must be a JSON object" } };
  const errors: Record<string, string> = {};
  const state = optEnum(body, "state", HUB_CHECKLIST_STATES, errors);
  if (state === undefined && body.state === undefined) {
    errors.state = "is required";
  }
  const note = optString(body, "note", 5000, errors);
  const evidence = optUrl(body, "evidence_url", errors);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      state: state as HubChecklistState,
      note: note ?? undefined,
      evidence_url: evidence,
    },
  };
}

// ── Document input ──────────────────────────────────────────────────────────

export interface HubDocumentInput {
  title?: string;
  slug?: string;
  kind?: HubDocumentKind;
  body?: string;
  template_vars?: Record<string, unknown>;
}

export function validateDocumentInput(
  raw: unknown,
  partial: boolean
): ValidationResult<HubDocumentInput> {
  const body = bodyObject(raw);
  if (!body) return { ok: false, errors: { body: "must be a JSON object" } };
  const errors: Record<string, string> = {};
  const out: HubDocumentInput = {};
  const title = optString(body, "title", 240, errors, { required: !partial });
  if (title !== undefined && title !== null) out.title = title;
  if (body.slug !== undefined) {
    if (typeof body.slug !== "string" || !SLUG_RE.test(body.slug.trim()))
      errors.slug = "must match ^[a-z0-9][a-z0-9-]*$";
    else out.slug = body.slug.trim();
  }
  const kind = optEnum(body, "kind", HUB_DOCUMENT_KINDS, errors);
  if (kind !== undefined) out.kind = kind;
  if (body.body !== undefined) {
    if (typeof body.body !== "string") errors.body = "must be a string";
    else if (body.body.length > 200_000)
      errors.body = "must be at most 200000 characters";
    else out.body = body.body;
  }
  if (body.template_vars !== undefined) {
    if (
      !body.template_vars ||
      typeof body.template_vars !== "object" ||
      Array.isArray(body.template_vars)
    ) {
      errors.template_vars = "must be an object";
    } else out.template_vars = body.template_vars as Record<string, unknown>;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: out };
}

// ── Copy-package input ──────────────────────────────────────────────────────

export interface HubCopyPackageInput {
  format: "md" | "json";
  includeCredentialIds: string[];
}

export function validateCopyPackageInput(
  raw: unknown
): ValidationResult<HubCopyPackageInput> {
  const body = bodyObject(raw ?? {});
  if (!body) return { ok: false, errors: { body: "must be a JSON object" } };
  const errors: Record<string, string> = {};
  let format: "md" | "json" = "md";
  if (body.format !== undefined) {
    if (body.format !== "md" && body.format !== "json") {
      errors.format = 'must be "md" or "json"';
    } else format = body.format;
  }
  const ids: string[] = [];
  if (body.includeCredentialIds !== undefined) {
    if (!Array.isArray(body.includeCredentialIds)) {
      errors.includeCredentialIds = "must be an array of credential ids";
    } else {
      for (const v of body.includeCredentialIds) {
        if (typeof v !== "string" || v.trim() === "") {
          errors.includeCredentialIds = "must contain only credential ids";
          break;
        }
        ids.push(v.trim());
      }
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { format, includeCredentialIds: ids } };
}

// ── Disclosure input (reveal / copy) ────────────────────────────────────────

export interface HubDisclosureInput {
  reason?: string;
}

export function validateDisclosureInput(
  raw: unknown
): ValidationResult<HubDisclosureInput> {
  if (raw === undefined || raw === null) return { ok: true, value: {} };
  const body = bodyObject(raw);
  if (!body) return { ok: false, errors: { body: "must be a JSON object" } };
  const errors: Record<string, string> = {};
  const reason = optString(body, "reason", 500, errors);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { reason: reason ?? undefined } };
}

// ── Rollups (shared by overview + refresh) ──────────────────────────────────

export interface HubChecklistRollup {
  total: number;
  done: number;
  blocked: number;
  in_progress: number;
  not_applicable: number;
  todo: number;
  percent_done: number;
}

export function computeChecklistRollup(
  entries: HubChecklistEntry[]
): HubChecklistRollup {
  const r: HubChecklistRollup = {
    total: entries.length,
    done: 0,
    blocked: 0,
    in_progress: 0,
    not_applicable: 0,
    todo: 0,
    percent_done: 0,
  };
  for (const e of entries) {
    const s = e.state?.state ?? "todo";
    if (s === "done") r.done += 1;
    else if (s === "blocked") r.blocked += 1;
    else if (s === "in_progress") r.in_progress += 1;
    else if (s === "not_applicable") r.not_applicable += 1;
    else r.todo += 1;
  }
  const applicable = r.total - r.not_applicable;
  r.percent_done =
    applicable > 0 ? Math.round((r.done / applicable) * 100) : 100;
  return r;
}
