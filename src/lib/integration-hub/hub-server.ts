/**
 * Integration Hub service layer (P7 Stage B).
 *
 * Every Hub read/write funnels through here, behind the admin gate the
 * routes resolve (`resolveAdminGate` — demo → labelled demo store,
 * live → the requireAdminApi ladder). Live data access uses the
 * service-role client only; the hub_* tables have RLS enabled with
 * zero client policies (migration 016).
 *
 * STRICT AUDIT. Disclosures (credential reveal/copy, copy-packages that
 * include secrets) and all mutations use `recordHubAuditStrict`: the
 * audit row is inserted FIRST and, in live mode, an insert error FAILS
 * THE REQUEST (500) before anything is disclosed or changed. This is
 * deliberately stricter than the platform's best-effort
 * `recordAdminAudit` (which swallows insert errors) — an unaudited
 * disclosure must be impossible. Audit rows contain metadata only
 * (labels, kinds, environments, value_last4 at most) — NEVER a value.
 *
 * Testability: the admin client and the vault env are injectable
 * (`HubServerDeps`), following the OAuth store factory pattern.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataMode } from "@/lib/data/mode";
import { createAdminClient } from "@/lib/supabase/server";
import { demoAppendAuditEntry } from "@/lib/admin/demo-server-store";
import {
  decryptHubSecret,
  encryptHubSecret,
  hubSecretLast4,
  isHubVaultConfigured,
  HubVaultError,
  type HubVaultEnv,
} from "./crypto";
import {
  computeChecklistRollup,
  slugifyHubName,
  toHubChecklistItemRecord,
  toHubChecklistStateRecord,
  toHubCredentialMetadata,
  toHubDocumentRecord,
  toHubIntegrationRecord,
  toHubTestAccountRecord,
  validateChecklistStateInput,
  validateCopyPackageInput,
  validateCredentialCreate,
  validateCredentialUpdate,
  validateDisclosureInput,
  validateDocumentInput,
  validateIntegrationCreate,
  validateIntegrationUpdate,
  validateTestAccountInput,
  type HubChecklistEntry,
  type HubChecklistRollup,
  type HubCredentialMetadata,
  type HubDocumentRecord,
  type HubIntegrationRecord,
  type HubTestAccountRecord,
} from "./hub-core";
import {
  buildCopyPackage,
  type HubPackageIncludedSecret,
} from "./package-generator";
import * as demo from "./demo-store";

// ── Errors ──────────────────────────────────────────────────────────────────

export class HubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HubError";
    this.status = status;
  }
}

export class HubValidationError extends HubError {
  fields: Record<string, string>;
  constructor(fields: Record<string, string>) {
    super(400, "Validation failed");
    this.name = "HubValidationError";
    this.fields = fields;
  }
}

export interface HubActor {
  id: string | null;
  email: string;
}

export interface HubServerDeps {
  /** Service-role client override (tests). Defaults to createAdminClient(). */
  admin?: SupabaseClient | null;
  /** Vault env override (tests). Defaults to process.env. */
  env?: HubVaultEnv;
}

function adminClient(deps?: HubServerDeps): SupabaseClient {
  const client = deps?.admin !== undefined ? deps.admin : createAdminClient();
  if (!client) {
    throw new HubError(
      503,
      "Supabase service-role client is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)."
    );
  }
  return client;
}

// ── Strict audit ────────────────────────────────────────────────────────────

export interface HubAuditInput {
  action: string;
  resource: string;
  /** Human-readable summary — metadata only, NEVER a credential value. */
  details: string;
  /** Structured machine-readable fields (also value-free). */
  hub?: Record<string, unknown>;
}

export async function recordHubAuditStrict(
  mode: DataMode,
  actor: HubActor,
  input: HubAuditInput,
  deps?: HubServerDeps
): Promise<void> {
  if (mode === "demo") {
    demoAppendAuditEntry({
      actor: actor.email,
      action: input.action,
      resource: input.resource,
      details: input.details,
    });
    return;
  }
  const admin = adminClient(deps);
  const { error } = await admin.from("audit_logs").insert({
    actor_id: actor.id,
    action: input.action,
    resource: input.resource,
    metadata: {
      actor_email: actor.email,
      details: input.details,
      timestamp: new Date().toISOString(),
      ...(input.hub ? { hub: input.hub } : {}),
    },
  });
  if (error) {
    // Fail closed: no audit ⇒ no action, no disclosure.
    throw new HubError(
      500,
      `Audit log write failed for ${input.action} — the action was refused. ` +
        `Nothing was changed and no value was disclosed.`
    );
  }
}

// ── Loaders ─────────────────────────────────────────────────────────────────

type HubDbRow = Record<string, unknown>;

async function loadIntegrationRow(
  slug: string,
  deps?: HubServerDeps
): Promise<HubDbRow> {
  const admin = adminClient(deps);
  const { data, error } = await admin
    .from("hub_integrations")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new HubError(500, "Failed to load the integration record.");
  if (!data) throw new HubError(404, `Integration "${slug}" was not found.`);
  return data;
}

async function requireIntegration(
  mode: DataMode,
  slug: string,
  deps?: HubServerDeps
): Promise<HubIntegrationRecord> {
  if (mode === "demo") {
    const record = demo.getDemoHubIntegration(slug);
    if (!record) throw new HubError(404, `Integration "${slug}" was not found.`);
    return record;
  }
  return toHubIntegrationRecord(await loadIntegrationRow(slug, deps));
}

async function loadCredentialRow(
  id: string,
  deps?: HubServerDeps
): Promise<HubDbRow> {
  const admin = adminClient(deps);
  const { data, error } = await admin
    .from("hub_credentials")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new HubError(500, "Failed to load the credential.");
  if (!data) throw new HubError(404, "Credential was not found.");
  return data;
}

async function loadCredentialContext(
  mode: DataMode,
  id: string,
  deps?: HubServerDeps
): Promise<{ row: HubDbRow | null; metadata: HubCredentialMetadata; integration: HubIntegrationRecord }> {
  if (mode === "demo") {
    const meta = demo.getDemoHubCredential(id);
    if (!meta) throw new HubError(404, "Credential was not found.");
    const integration = demo.getDemoHubIntegrationById(meta.integration_id);
    if (!integration) throw new HubError(404, "Credential was not found.");
    return { row: null, metadata: meta, integration };
  }
  const row = await loadCredentialRow(id, deps);
  const admin = adminClient(deps);
  const { data: integrationRow } = await admin
    .from("hub_integrations")
    .select("*")
    .eq("id", row.integration_id)
    .maybeSingle();
  if (!integrationRow) throw new HubError(404, "Credential was not found.");
  return {
    row,
    metadata: toHubCredentialMetadata(row),
    integration: toHubIntegrationRecord(integrationRow),
  };
}

function dbWriteError(error: unknown, what: string): HubError {
  if ((error as { code?: string } | null)?.code === "23505") {
    return new HubError(409, `${what} conflicts with an existing record.`);
  }
  return new HubError(500, `Failed to ${what.toLowerCase()}.`);
}

// ── Overview & detail ───────────────────────────────────────────────────────

export interface HubOverviewItem {
  integration: HubIntegrationRecord;
  credential_count: number;
  credentials_by_environment: Record<string, number>;
  expired_credentials: number;
  nearest_expiry: string | null;
  checklist: HubChecklistRollup;
  document_count: number;
  test_account_count: number;
}

export interface HubOverview {
  mode: DataMode;
  /** Live mode: whether the vault key is configured. Always false in demo. */
  vault_configured: boolean;
  integrations: HubOverviewItem[];
}

function isExpired(c: HubCredentialMetadata, nowMs: number): boolean {
  return (
    c.expires_at !== null &&
    Date.parse(c.expires_at) < nowMs &&
    c.status !== "revoked"
  );
}

function overviewItem(
  integration: HubIntegrationRecord,
  credentials: HubCredentialMetadata[],
  entries: HubChecklistEntry[],
  documentCount: number,
  testAccountCount: number,
  nowMs: number
): HubOverviewItem {
  const byEnv: Record<string, number> = {};
  let nearest: string | null = null;
  let expired = 0;
  for (const c of credentials) {
    byEnv[c.environment] = (byEnv[c.environment] ?? 0) + 1;
    if (isExpired(c, nowMs)) expired += 1;
    if (c.expires_at && Date.parse(c.expires_at) >= nowMs) {
      if (!nearest || c.expires_at < nearest) nearest = c.expires_at;
    }
  }
  return {
    integration,
    credential_count: credentials.length,
    credentials_by_environment: byEnv,
    expired_credentials: expired,
    nearest_expiry: nearest,
    checklist: computeChecklistRollup(entries),
    document_count: documentCount,
    test_account_count: testAccountCount,
  };
}

export async function getHubOverview(
  mode: DataMode,
  deps?: HubServerDeps
): Promise<HubOverview> {
  const nowMs = Date.now();
  if (mode === "demo") {
    const items = demo.listDemoHubIntegrations().map((integration) =>
      overviewItem(
        integration,
        demo.listDemoHubCredentials(integration.id),
        demo.listDemoHubChecklistEntries(integration.id),
        demo.listDemoHubDocuments(integration.id).length,
        demo.listDemoHubTestAccounts(integration.id).length,
        nowMs
      )
    );
    return { mode, vault_configured: false, integrations: items };
  }
  const admin = adminClient(deps);
  const { data: integrationRows, error } = await admin
    .from("hub_integrations")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new HubError(500, "Failed to load integrations.");
  const items: HubOverviewItem[] = [];
  for (const row of integrationRows ?? []) {
    const integration = toHubIntegrationRecord(row);
    const [creds, entries, docs, accounts] = await Promise.all([
      listCredentialsLive(integration.id, deps),
      getChecklistEntriesLive(integration.id, deps),
      listDocumentsLive(integration.id, deps),
      listTestAccountsLive(integration.id, deps),
    ]);
    items.push(
      overviewItem(integration, creds, entries, docs.length, accounts.length, nowMs)
    );
  }
  return {
    mode,
    vault_configured: isHubVaultConfigured(deps?.env),
    integrations: items,
  };
}

export interface HubIntegrationDetail {
  integration: HubIntegrationRecord;
  credentials: HubCredentialMetadata[];
  test_accounts: HubTestAccountRecord[];
  documents: HubDocumentRecord[];
  checklists: HubChecklistEntry[];
  checklist_rollup: HubChecklistRollup;
}

export async function getHubIntegrationDetail(
  mode: DataMode,
  slug: string,
  deps?: HubServerDeps
): Promise<HubIntegrationDetail> {
  const integration = await requireIntegration(mode, slug, deps);
  let credentials: HubCredentialMetadata[];
  let testAccounts: HubTestAccountRecord[];
  let documents: HubDocumentRecord[];
  let entries: HubChecklistEntry[];
  if (mode === "demo") {
    credentials = demo.listDemoHubCredentials(integration.id);
    testAccounts = demo.listDemoHubTestAccounts(integration.id);
    documents = demo.listDemoHubDocuments(integration.id);
    entries = demo.listDemoHubChecklistEntries(integration.id);
  } else {
    [credentials, testAccounts, documents, entries] = await Promise.all([
      listCredentialsLive(integration.id, deps),
      listTestAccountsLive(integration.id, deps),
      listDocumentsLive(integration.id, deps),
      getChecklistEntriesLive(integration.id, deps),
    ]);
  }
  return {
    integration,
    credentials,
    test_accounts: testAccounts,
    documents,
    checklists: entries,
    checklist_rollup: computeChecklistRollup(entries),
  };
}

// ── Integrations CRUD ───────────────────────────────────────────────────────

export async function listHubIntegrations(
  mode: DataMode,
  deps?: HubServerDeps
): Promise<HubIntegrationRecord[]> {
  if (mode === "demo") return demo.listDemoHubIntegrations();
  const admin = adminClient(deps);
  const { data, error } = await admin
    .from("hub_integrations")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new HubError(500, "Failed to load integrations.");
  return (data ?? []).map(toHubIntegrationRecord);
}

export async function createHubIntegration(
  mode: DataMode,
  actor: HubActor,
  body: unknown,
  deps?: HubServerDeps
): Promise<HubIntegrationRecord> {
  const parsed = validateIntegrationCreate(body);
  if (!parsed.ok) throw new HubValidationError(parsed.errors);
  const input = parsed.value;
  await recordHubAuditStrict(
    mode,
    actor,
    {
      action: "HUB_INTEGRATION_CREATE",
      resource: `hub:${input.slug}`,
      details: `Created integration ${input.slug} (${input.name}) with status ${input.status ?? "draft"}.`,
      hub: { integration_slug: input.slug },
    },
    deps
  );
  if (mode === "demo") {
    if (demo.getDemoHubIntegration(input.slug)) {
      throw new HubError(409, `Integration "${input.slug}" already exists.`);
    }
    return demo.createDemoHubIntegration(input, actor.id);
  }
  const admin = adminClient(deps);
  const { data, error } = await admin
    .from("hub_integrations")
    .insert({
      slug: input.slug,
      name: input.name,
      vendor: input.vendor ?? null,
      category: input.category ?? "connector",
      status: input.status ?? "draft",
      external_status_note: input.external_status_note ?? null,
      website_url: input.website_url ?? null,
      docs_url: input.docs_url ?? null,
      review_portal_url: input.review_portal_url ?? null,
      support_email: input.support_email ?? null,
      summary: input.summary ?? "",
      metadata: input.metadata ?? {},
      sort_order: input.sort_order ?? 0,
      created_by: actor.id,
      updated_by: actor.id,
    })
    .select("*")
    .single();
  if (error) throw dbWriteError(error, "Integration create");
  return toHubIntegrationRecord(data);
}

export async function updateHubIntegration(
  mode: DataMode,
  actor: HubActor,
  slug: string,
  body: unknown,
  deps?: HubServerDeps
): Promise<HubIntegrationRecord> {
  const current = await requireIntegration(mode, slug, deps);
  const parsed = validateIntegrationUpdate(body);
  if (!parsed.ok) throw new HubValidationError(parsed.errors);
  const input = parsed.value;
  const statusChanged =
    input.status !== undefined && input.status !== current.status;
  await recordHubAuditStrict(
    mode,
    actor,
    {
      action: statusChanged ? "HUB_STATUS_CHANGE" : "HUB_INTEGRATION_UPDATE",
      resource: `hub:${slug}`,
      details: statusChanged
        ? `Status changed ${current.status} → ${input.status} for ${slug}.`
        : `Updated integration ${slug}.`,
      hub: {
        integration_slug: slug,
        ...(statusChanged
          ? { from_status: current.status, to_status: input.status }
          : {}),
      },
    },
    deps
  );
  if (mode === "demo") {
    const updated = demo.updateDemoHubIntegration(slug, input, actor.id);
    if (!updated) throw new HubError(404, `Integration "${slug}" was not found.`);
    return updated;
  }
  const admin = adminClient(deps);
  const patch: Record<string, unknown> = { updated_by: actor.id, updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) patch[k] = v;
  }
  const { data, error } = await admin
    .from("hub_integrations")
    .update(patch)
    .eq("id", current.id)
    .select("*")
    .single();
  if (error) throw dbWriteError(error, "Integration update");
  return toHubIntegrationRecord(data);
}

export async function deleteHubIntegration(
  mode: DataMode,
  actor: HubActor,
  slug: string,
  deps?: HubServerDeps
): Promise<{ deleted: true }> {
  const current = await requireIntegration(mode, slug, deps);
  await recordHubAuditStrict(
    mode,
    actor,
    {
      action: "HUB_INTEGRATION_DELETE",
      resource: `hub:${slug}`,
      details: `Deleted integration ${slug} (${current.name}); its credentials, test accounts, checklist state and documents were removed with it.`,
      hub: { integration_slug: slug },
    },
    deps
  );
  if (mode === "demo") {
    demo.deleteDemoHubIntegration(slug);
    return { deleted: true };
  }
  const admin = adminClient(deps);
  const { error } = await admin
    .from("hub_integrations")
    .delete()
    .eq("id", current.id);
  if (error) throw new HubError(500, "Failed to delete the integration.");
  return { deleted: true };
}

// ── Credentials ─────────────────────────────────────────────────────────────

async function listCredentialsLive(
  integrationId: string,
  deps?: HubServerDeps
): Promise<HubCredentialMetadata[]> {
  const admin = adminClient(deps);
  const { data, error } = await admin
    .from("hub_credentials")
    .select("*")
    .eq("integration_id", integrationId)
    .order("created_at", { ascending: true });
  if (error) throw new HubError(500, "Failed to load credentials.");
  return (data ?? []).map(toHubCredentialMetadata);
}

export async function listHubCredentials(
  mode: DataMode,
  slug: string,
  deps?: HubServerDeps
): Promise<HubCredentialMetadata[]> {
  const integration = await requireIntegration(mode, slug, deps);
  if (mode === "demo") return demo.listDemoHubCredentials(integration.id);
  return listCredentialsLive(integration.id, deps);
}

function requireVaultKey(deps?: HubServerDeps): HubVaultEnv | undefined {
  if (!isHubVaultConfigured(deps?.env)) {
    throw new HubError(
      503,
      "The Integration Hub vault is not configured: INTEGRATION_HUB_ENCRYPTION_KEY is missing or invalid. Credential values cannot be stored or read until it is set (see SETUP.md)."
    );
  }
  return deps?.env;
}

export async function createHubCredential(
  mode: DataMode,
  actor: HubActor,
  slug: string,
  body: unknown,
  deps?: HubServerDeps
): Promise<HubCredentialMetadata> {
  if (mode === "demo") throw new HubError(503, demo.DEMO_CREDENTIAL_WRITE_MESSAGE);
  const integration = await requireIntegration(mode, slug, deps);
  const parsed = validateCredentialCreate(body);
  if (!parsed.ok) throw new HubValidationError(parsed.errors);
  const input = parsed.value;
  const env = requireVaultKey(deps);
  const valueEnc = encryptHubSecret(input.value, env);
  const last4 = hubSecretLast4(input.value);
  await recordHubAuditStrict(
    mode,
    actor,
    {
      action: "HUB_CREDENTIAL_CREATE",
      resource: `hub:${slug}`,
      details: `Stored credential "${input.label}" (${input.kind}, ${input.environment}) for ${slug}. Value is encrypted at rest; only its last 4 characters (…${last4}) are recorded here.`,
      hub: {
        integration_slug: slug,
        credential_label: input.label,
        kind: input.kind,
        environment: input.environment,
        value_last4: last4,
      },
    },
    deps
  );
  const admin = adminClient(deps);
  const { data, error } = await admin
    .from("hub_credentials")
    .insert({
      integration_id: integration.id,
      label: input.label,
      kind: input.kind,
      environment: input.environment,
      status: input.status ?? "needs_verification",
      username_hint: input.username_hint ?? null,
      value_enc: valueEnc,
      value_last4: last4,
      expires_at: input.expires_at ?? null,
      notes: input.notes ?? "",
      created_by: actor.id,
      updated_by: actor.id,
    })
    .select("*")
    .single();
  if (error) throw dbWriteError(error, "Credential create");
  return toHubCredentialMetadata(data);
}

export async function updateHubCredential(
  mode: DataMode,
  actor: HubActor,
  id: string,
  body: unknown,
  deps?: HubServerDeps
): Promise<HubCredentialMetadata> {
  if (mode === "demo") throw new HubError(503, demo.DEMO_CREDENTIAL_WRITE_MESSAGE);
  const { metadata: current, integration } = await loadCredentialContext(mode, id, deps);
  const parsed = validateCredentialUpdate(body);
  if (!parsed.ok) throw new HubValidationError(parsed.errors);
  const input = parsed.value;
  const rotating = input.value !== undefined;
  const env = requireVaultKey(deps);
  const patch: Record<string, unknown> = {
    updated_by: actor.id,
    updated_at: new Date().toISOString(),
  };
  let newLast4: string | null = null;
  if (rotating) {
    patch.value_enc = encryptHubSecret(input.value as string, env);
    newLast4 = hubSecretLast4(input.value as string);
    patch.value_last4 = newLast4;
  }
  if (input.label !== undefined) patch.label = input.label;
  if (input.kind !== undefined) patch.kind = input.kind;
  if (input.environment !== undefined) patch.environment = input.environment;
  if (input.status !== undefined) patch.status = input.status;
  if (input.username_hint !== undefined) patch.username_hint = input.username_hint;
  if (input.expires_at !== undefined) patch.expires_at = input.expires_at;
  if (input.notes !== undefined) patch.notes = input.notes;
  await recordHubAuditStrict(
    mode,
    actor,
    {
      action: rotating ? "HUB_CREDENTIAL_ROTATE" : "HUB_CREDENTIAL_UPDATE",
      resource: `hub:credential:${id}`,
      details: rotating
        ? `Rotated credential "${current.label}" (${current.kind}, ${current.environment}) on ${integration.slug}. New value ends …${newLast4}; the value itself is never logged.`
        : `Updated credential "${current.label}" (${current.kind}, ${current.environment}) on ${integration.slug} (metadata only).`,
      hub: {
        integration_slug: integration.slug,
        credential_id: id,
        credential_label: current.label,
        ...(rotating ? { value_last4: newLast4 } : {}),
      },
    },
    deps
  );
  const admin = adminClient(deps);
  const { data, error } = await admin
    .from("hub_credentials")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw dbWriteError(error, "Credential update");
  return toHubCredentialMetadata(data);
}

export async function deleteHubCredential(
  mode: DataMode,
  actor: HubActor,
  id: string,
  deps?: HubServerDeps
): Promise<{ deleted: true }> {
  if (mode === "demo") throw new HubError(503, demo.DEMO_CREDENTIAL_WRITE_MESSAGE);
  const { metadata: current, integration } = await loadCredentialContext(mode, id, deps);
  await recordHubAuditStrict(
    mode,
    actor,
    {
      action: "HUB_CREDENTIAL_DELETE",
      resource: `hub:credential:${id}`,
      details: `Deleted credential "${current.label}" (${current.kind}, ${current.environment}) from ${integration.slug}.`,
      hub: {
        integration_slug: integration.slug,
        credential_id: id,
        credential_label: current.label,
      },
    },
    deps
  );
  const admin = adminClient(deps);
  const { error } = await admin.from("hub_credentials").delete().eq("id", id);
  if (error) throw new HubError(500, "Failed to delete the credential.");
  return { deleted: true };
}

/**
 * The disclosure path — reveal and copy share it. Order is the whole
 * point: load → guards → STRICT AUDIT → decrypt → stamp → return. If
 * the audit insert fails, `recordHubAuditStrict` throws and the value
 * is never decrypted, let alone returned.
 */
async function discloseHubCredential(
  mode: DataMode,
  actor: HubActor,
  id: string,
  body: unknown,
  kind: "reveal" | "copy",
  deps?: HubServerDeps
): Promise<{ value: string; credential: HubCredentialMetadata }> {
  if (mode === "demo") throw new HubError(503, demo.DEMO_REVEAL_MESSAGE);
  const parsed = validateDisclosureInput(body);
  if (!parsed.ok) throw new HubValidationError(parsed.errors);
  const { row, metadata: current, integration } = await loadCredentialContext(
    mode,
    id,
    deps
  );
  if (current.status === "revoked") {
    throw new HubError(
      409,
      "This credential has been revoked and can no longer be revealed or copied."
    );
  }
  const env = requireVaultKey(deps);
  const action = kind === "reveal" ? "HUB_CREDENTIAL_REVEAL" : "HUB_CREDENTIAL_COPY";
  await recordHubAuditStrict(
    mode,
    actor,
    {
      action,
      resource: `hub:credential:${id}`,
      details:
        `${kind === "reveal" ? "Revealed" : "Copied"} credential "${current.label}" ` +
        `(${current.kind}, ${current.environment}) on ${integration.slug}.` +
        (parsed.value.reason ? ` Reason: ${parsed.value.reason}` : "") +
        ` The value itself is never written to the audit log.`,
      hub: {
        integration_slug: integration.slug,
        credential_id: id,
        credential_label: current.label,
        kind: current.kind,
        environment: current.environment,
        value_last4: current.value_last4,
        ...(parsed.value.reason ? { reason: parsed.value.reason } : {}),
      },
    },
    deps
  );
  let value: string;
  try {
    const valueEnc =
      row && typeof row.value_enc === "string" ? row.value_enc : "";
    value = decryptHubSecret(valueEnc, env);
  } catch (err) {
    if (err instanceof HubVaultError) throw new HubError(500, err.message);
    throw err;
  }
  // Stamp the disclosure (best effort — the audit row already exists).
  const stampIso = new Date().toISOString();
  const stampPatch =
    kind === "reveal"
      ? { last_revealed_at: stampIso, last_revealed_by: actor.id }
      : { last_copied_at: stampIso, last_copied_by: actor.id };
  try {
    const admin = adminClient(deps);
    await admin.from("hub_credentials").update(stampPatch).eq("id", id);
  } catch {
    // Non-fatal: disclosure was audited before the value was returned.
  }
  const stamped: HubCredentialMetadata = { ...current };
  if (kind === "reveal") {
    stamped.last_revealed_at = stampIso;
    stamped.last_revealed_by = actor.id;
  } else {
    stamped.last_copied_at = stampIso;
    stamped.last_copied_by = actor.id;
  }
  return { value, credential: stamped };
}

export function revealHubCredential(
  mode: DataMode,
  actor: HubActor,
  id: string,
  body: unknown,
  deps?: HubServerDeps
) {
  return discloseHubCredential(mode, actor, id, body, "reveal", deps);
}

export function copyHubCredential(
  mode: DataMode,
  actor: HubActor,
  id: string,
  body: unknown,
  deps?: HubServerDeps
) {
  return discloseHubCredential(mode, actor, id, body, "copy", deps);
}

// ── Test accounts ───────────────────────────────────────────────────────────

async function listTestAccountsLive(
  integrationId: string,
  deps?: HubServerDeps
): Promise<HubTestAccountRecord[]> {
  const admin = adminClient(deps);
  const { data, error } = await admin
    .from("hub_test_accounts")
    .select("*")
    .eq("integration_id", integrationId)
    .order("created_at", { ascending: true });
  if (error) throw new HubError(500, "Failed to load test accounts.");
  return (data ?? []).map(toHubTestAccountRecord);
}

export async function listHubTestAccounts(
  mode: DataMode,
  slug: string,
  deps?: HubServerDeps
): Promise<HubTestAccountRecord[]> {
  const integration = await requireIntegration(mode, slug, deps);
  if (mode === "demo") return demo.listDemoHubTestAccounts(integration.id);
  return listTestAccountsLive(integration.id, deps);
}

async function assertPasswordCredential(
  mode: DataMode,
  integration: HubIntegrationRecord,
  credentialId: string,
  deps?: HubServerDeps
): Promise<void> {
  let meta: HubCredentialMetadata | null = null;
  if (mode === "demo") {
    meta = demo.getDemoHubCredential(credentialId);
  } else {
    const { data } = await adminClient(deps)
      .from("hub_credentials")
      .select("*")
      .eq("id", credentialId)
      .maybeSingle();
    meta = data ? toHubCredentialMetadata(data) : null;
  }
  if (!meta || meta.integration_id !== integration.id) {
    throw new HubValidationError({
      password_credential_id:
        "must reference a credential belonging to this integration",
    });
  }
  if (meta.kind !== "test_account_password" && meta.kind !== "password") {
    throw new HubValidationError({
      password_credential_id:
        "must reference a credential of kind test_account_password (or password)",
    });
  }
}

export async function createHubTestAccount(
  mode: DataMode,
  actor: HubActor,
  slug: string,
  body: unknown,
  deps?: HubServerDeps
): Promise<HubTestAccountRecord> {
  const integration = await requireIntegration(mode, slug, deps);
  const parsed = validateTestAccountInput(body, false);
  if (!parsed.ok) throw new HubValidationError(parsed.errors);
  const input = parsed.value;
  if (input.password_credential_id) {
    await assertPasswordCredential(mode, integration, input.password_credential_id, deps);
  }
  await recordHubAuditStrict(
    mode,
    actor,
    {
      action: "HUB_TEST_ACCOUNT_CREATE",
      resource: `hub:${slug}`,
      details: `Added test account "${input.label}" (username ${input.username}) to ${slug}. Passwords are stored only as vault credentials, never on the account record.`,
      hub: { integration_slug: slug, test_account_label: input.label },
    },
    deps
  );
  if (mode === "demo") {
    return demo.createDemoHubTestAccount(integration.id, input, actor.id);
  }
  const admin = adminClient(deps);
  const { data, error } = await admin
    .from("hub_test_accounts")
    .insert({
      integration_id: integration.id,
      label: input.label,
      login_url: input.login_url ?? null,
      username: input.username,
      password_credential_id: input.password_credential_id ?? null,
      instructions: input.instructions ?? "",
      representative_data_note: input.representative_data_note ?? "",
      status: input.status ?? "active",
      last_verified_at: input.mark_verified ? new Date().toISOString() : null,
      created_by: actor.id,
      updated_by: actor.id,
    })
    .select("*")
    .single();
  if (error) throw dbWriteError(error, "Test account create");
  return toHubTestAccountRecord(data);
}

export async function updateHubTestAccount(
  mode: DataMode,
  actor: HubActor,
  id: string,
  body: unknown,
  deps?: HubServerDeps
): Promise<HubTestAccountRecord> {
  const parsed = validateTestAccountInput(body, true);
  if (!parsed.ok) throw new HubValidationError(parsed.errors);
  const input = parsed.value;
  let integration: HubIntegrationRecord;
  let current: HubTestAccountRecord;
  if (mode === "demo") {
    const found = demo.getDemoHubTestAccount(id);
    if (!found) throw new HubError(404, "Test account was not found.");
    current = found;
    const owner = demo.getDemoHubIntegrationById(found.integration_id);
    if (!owner) throw new HubError(404, "Test account was not found.");
    integration = owner;
  } else {
    const admin = adminClient(deps);
    const { data } = await admin
      .from("hub_test_accounts")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!data) throw new HubError(404, "Test account was not found.");
    current = toHubTestAccountRecord(data);
    const { data: ownerRow } = await admin
      .from("hub_integrations")
      .select("*")
      .eq("id", current.integration_id)
      .maybeSingle();
    if (!ownerRow) throw new HubError(404, "Test account was not found.");
    integration = toHubIntegrationRecord(ownerRow);
  }
  if (input.password_credential_id) {
    await assertPasswordCredential(mode, integration, input.password_credential_id, deps);
  }
  await recordHubAuditStrict(
    mode,
    actor,
    {
      action: "HUB_TEST_ACCOUNT_UPDATE",
      resource: `hub:${integration.slug}`,
      details: `Updated test account "${current.label}" on ${integration.slug}${input.mark_verified ? " (marked verified)" : ""}.`,
      hub: { integration_slug: integration.slug, test_account_id: id },
    },
    deps
  );
  if (mode === "demo") {
    const updated = demo.updateDemoHubTestAccount(id, input, actor.id);
    if (!updated) throw new HubError(404, "Test account was not found.");
    return updated;
  }
  const admin = adminClient(deps);
  const patch: Record<string, unknown> = {
    updated_by: actor.id,
    updated_at: new Date().toISOString(),
  };
  if (input.label !== undefined) patch.label = input.label;
  if (input.login_url !== undefined) patch.login_url = input.login_url;
  if (input.username !== undefined) patch.username = input.username;
  if (input.password_credential_id !== undefined)
    patch.password_credential_id = input.password_credential_id;
  if (input.instructions !== undefined) patch.instructions = input.instructions;
  if (input.representative_data_note !== undefined)
    patch.representative_data_note = input.representative_data_note;
  if (input.status !== undefined) patch.status = input.status;
  if (input.mark_verified) patch.last_verified_at = new Date().toISOString();
  const { data, error } = await admin
    .from("hub_test_accounts")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw dbWriteError(error, "Test account update");
  return toHubTestAccountRecord(data);
}

export async function deleteHubTestAccount(
  mode: DataMode,
  actor: HubActor,
  id: string,
  deps?: HubServerDeps
): Promise<{ deleted: true }> {
  let integrationSlug: string;
  let label: string;
  if (mode === "demo") {
    const found = demo.getDemoHubTestAccount(id);
    if (!found) throw new HubError(404, "Test account was not found.");
    const owner = demo.getDemoHubIntegrationById(found.integration_id);
    integrationSlug = owner?.slug ?? "unknown";
    label = found.label;
  } else {
    const admin = adminClient(deps);
    const { data } = await admin
      .from("hub_test_accounts")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!data) throw new HubError(404, "Test account was not found.");
    const record = toHubTestAccountRecord(data);
    const { data: ownerRow } = await admin
      .from("hub_integrations")
      .select("slug")
      .eq("id", record.integration_id)
      .maybeSingle();
    integrationSlug = ownerRow?.slug ?? "unknown";
    label = record.label;
  }
  await recordHubAuditStrict(
    mode,
    actor,
    {
      action: "HUB_TEST_ACCOUNT_DELETE",
      resource: `hub:${integrationSlug}`,
      details: `Deleted test account "${label}" from ${integrationSlug}.`,
      hub: { integration_slug: integrationSlug, test_account_id: id },
    },
    deps
  );
  if (mode === "demo") {
    demo.deleteDemoHubTestAccount(id);
    return { deleted: true };
  }
  const admin = adminClient(deps);
  const { error } = await admin.from("hub_test_accounts").delete().eq("id", id);
  if (error) throw new HubError(500, "Failed to delete the test account.");
  return { deleted: true };
}

// ── Checklists ──────────────────────────────────────────────────────────────

async function getChecklistEntriesLive(
  integrationId: string,
  deps?: HubServerDeps
): Promise<HubChecklistEntry[]> {
  const admin = adminClient(deps);
  const { data: items, error } = await admin
    .from("hub_checklist_items")
    .select("*")
    .or(`integration_id.is.null,integration_id.eq.${integrationId}`)
    .order("sort_order", { ascending: true });
  if (error) throw new HubError(500, "Failed to load checklist items.");
  const { data: states } = await admin
    .from("hub_checklist_state")
    .select("*")
    .eq("integration_id", integrationId);
  const stateByItem = new Map<string, ReturnType<typeof toHubChecklistStateRecord>>(
    (states ?? []).map((s: HubDbRow) => [
      String(s.item_id),
      toHubChecklistStateRecord(s),
    ])
  );
  return (items ?? []).map((row: HubDbRow) => {
    const item = toHubChecklistItemRecord(row);
    return { item, state: stateByItem.get(item.id) ?? null };
  });
}

export async function getHubChecklists(
  mode: DataMode,
  slug: string,
  deps?: HubServerDeps
): Promise<{ entries: HubChecklistEntry[]; rollup: HubChecklistRollup }> {
  const integration = await requireIntegration(mode, slug, deps);
  const entries =
    mode === "demo"
      ? demo.listDemoHubChecklistEntries(integration.id)
      : await getChecklistEntriesLive(integration.id, deps);
  return { entries, rollup: computeChecklistRollup(entries) };
}

export async function updateHubChecklistState(
  mode: DataMode,
  actor: HubActor,
  slug: string,
  itemId: string,
  body: unknown,
  deps?: HubServerDeps
) {
  const integration = await requireIntegration(mode, slug, deps);
  const parsed = validateChecklistStateInput(body);
  if (!parsed.ok) throw new HubValidationError(parsed.errors);
  const input = parsed.value;
  // Existence check BEFORE the audit write (a 404 must not leave a
  // phantom audit row).
  if (mode === "demo") {
    const exists = demo
      .listDemoHubChecklistEntries(integration.id)
      .some((e) => e.item.id === itemId);
    if (!exists) throw new HubError(404, "Checklist item was not found.");
  } else {
    const { data: item } = await adminClient(deps)
      .from("hub_checklist_items")
      .select("id, integration_id")
      .eq("id", itemId)
      .maybeSingle();
    if (!item || (item.integration_id !== null && item.integration_id !== integration.id)) {
      throw new HubError(404, "Checklist item was not found.");
    }
  }
  await recordHubAuditStrict(
    mode,
    actor,
    {
      action: "HUB_CHECKLIST_UPDATE",
      resource: `hub:${slug}`,
      details: `Checklist item ${itemId} on ${slug} set to ${input.state}.`,
      hub: { integration_slug: slug, item_id: itemId, state: input.state },
    },
    deps
  );
  if (mode === "demo") {
    const record = demo.upsertDemoHubChecklistState(
      integration.id,
      itemId,
      { state: input.state, note: input.note, evidence_url: input.evidence_url },
      actor.id
    );
    if (!record) throw new HubError(404, "Checklist item was not found.");
    return record;
  }
  const admin = adminClient(deps);
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("hub_checklist_state")
    .upsert(
      {
        integration_id: integration.id,
        item_id: itemId,
        state: input.state,
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.evidence_url !== undefined
          ? { evidence_url: input.evidence_url }
          : {}),
        completed_at: input.state === "done" ? nowIso : null,
        updated_by: actor.id,
        updated_at: nowIso,
      },
      { onConflict: "integration_id,item_id" }
    )
    .select("*")
    .single();
  if (error) throw new HubError(500, "Failed to update the checklist state.");
  return toHubChecklistStateRecord(data);
}

// ── Documents ───────────────────────────────────────────────────────────────

async function listDocumentsLive(
  integrationId: string | null,
  deps?: HubServerDeps
): Promise<HubDocumentRecord[]> {
  const admin = adminClient(deps);
  let query = admin.from("hub_documents").select("*");
  query = integrationId
    ? query.or(`integration_id.is.null,integration_id.eq.${integrationId}`)
    : query.is("integration_id", null);
  const { data, error } = await query.order("title", { ascending: true });
  if (error) throw new HubError(500, "Failed to load documents.");
  return (data ?? []).map(toHubDocumentRecord);
}

export async function listHubDocuments(
  mode: DataMode,
  slug: string,
  deps?: HubServerDeps
): Promise<HubDocumentRecord[]> {
  const integration = await requireIntegration(mode, slug, deps);
  if (mode === "demo") return demo.listDemoHubDocuments(integration.id);
  return listDocumentsLive(integration.id, deps);
}

export async function createHubDocument(
  mode: DataMode,
  actor: HubActor,
  slug: string,
  body: unknown,
  deps?: HubServerDeps
): Promise<HubDocumentRecord> {
  const integration = await requireIntegration(mode, slug, deps);
  const parsed = validateDocumentInput(body, false);
  if (!parsed.ok) throw new HubValidationError(parsed.errors);
  const input = parsed.value;
  const docSlug = input.slug ?? slugifyHubName(input.title ?? "");
  if (!docSlug) {
    throw new HubValidationError({
      slug: "could not be derived from the title; provide a slug",
    });
  }
  await recordHubAuditStrict(
    mode,
    actor,
    {
      action: "HUB_DOCUMENT_CREATE",
      resource: `hub:${slug}`,
      details: `Created document "${input.title}" (${docSlug}) on ${slug}.`,
      hub: { integration_slug: slug, document_slug: docSlug },
    },
    deps
  );
  if (mode === "demo") {
    return demo.createDemoHubDocument(
      integration.id,
      {
        title: input.title as string,
        slug: docSlug,
        kind: input.kind,
        body: input.body,
        template_vars: input.template_vars,
      },
      actor.id
    );
  }
  const admin = adminClient(deps);
  const { data, error } = await admin
    .from("hub_documents")
    .insert({
      integration_id: integration.id,
      slug: docSlug,
      title: input.title,
      kind: input.kind ?? "doc",
      body: input.body ?? "",
      template_vars: input.template_vars ?? {},
      is_seeded: false,
      version: 1,
      created_by: actor.id,
      updated_by: actor.id,
    })
    .select("*")
    .single();
  if (error) throw dbWriteError(error, "Document create");
  return toHubDocumentRecord(data);
}

export async function getHubDocument(
  mode: DataMode,
  id: string,
  deps?: HubServerDeps
): Promise<HubDocumentRecord> {
  if (mode === "demo") {
    const doc = demo.getDemoHubDocument(id);
    if (!doc) throw new HubError(404, "Document was not found.");
    return doc;
  }
  const admin = adminClient(deps);
  const { data, error } = await admin
    .from("hub_documents")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new HubError(500, "Failed to load the document.");
  if (!data) throw new HubError(404, "Document was not found.");
  return toHubDocumentRecord(data);
}

export async function updateHubDocument(
  mode: DataMode,
  actor: HubActor,
  id: string,
  body: unknown,
  deps?: HubServerDeps
): Promise<HubDocumentRecord> {
  const current = await getHubDocument(mode, id, deps);
  const parsed = validateDocumentInput(body, true);
  if (!parsed.ok) throw new HubValidationError(parsed.errors);
  const input = parsed.value;
  const resourceSlug = current.integration_id
    ? await slugForIntegrationId(mode, current.integration_id, deps)
    : "hub";
  await recordHubAuditStrict(
    mode,
    actor,
    {
      action: "HUB_DOCUMENT_UPDATE",
      resource: `hub:${resourceSlug}`,
      details: `Updated document "${current.title}" (${current.slug}) → version ${current.version + 1}.`,
      hub: { document_id: id, document_slug: current.slug },
    },
    deps
  );
  if (mode === "demo") {
    const updated = demo.updateDemoHubDocument(id, input, actor.id);
    if (!updated) throw new HubError(404, "Document was not found.");
    return updated;
  }
  const admin = adminClient(deps);
  const patch: Record<string, unknown> = {
    updated_by: actor.id,
    updated_at: new Date().toISOString(),
    version: current.version + 1,
  };
  if (input.title !== undefined) patch.title = input.title;
  if (input.slug !== undefined) patch.slug = input.slug;
  if (input.kind !== undefined) patch.kind = input.kind;
  if (input.body !== undefined) patch.body = input.body;
  if (input.template_vars !== undefined) patch.template_vars = input.template_vars;
  const { data, error } = await admin
    .from("hub_documents")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw dbWriteError(error, "Document update");
  return toHubDocumentRecord(data);
}

export async function deleteHubDocument(
  mode: DataMode,
  actor: HubActor,
  id: string,
  deps?: HubServerDeps
): Promise<{ deleted: true }> {
  const current = await getHubDocument(mode, id, deps);
  const resourceSlug = current.integration_id
    ? await slugForIntegrationId(mode, current.integration_id, deps)
    : "hub";
  await recordHubAuditStrict(
    mode,
    actor,
    {
      action: "HUB_DOCUMENT_DELETE",
      resource: `hub:${resourceSlug}`,
      details: `Deleted document "${current.title}" (${current.slug}).`,
      hub: { document_id: id, document_slug: current.slug },
    },
    deps
  );
  if (mode === "demo") {
    demo.deleteDemoHubDocument(id);
    return { deleted: true };
  }
  const admin = adminClient(deps);
  const { error } = await admin.from("hub_documents").delete().eq("id", id);
  if (error) throw new HubError(500, "Failed to delete the document.");
  return { deleted: true };
}

async function slugForIntegrationId(
  mode: DataMode,
  integrationId: string,
  deps?: HubServerDeps
): Promise<string> {
  if (mode === "demo") {
    return demo.getDemoHubIntegrationById(integrationId)?.slug ?? "unknown";
  }
  const { data } = await adminClient(deps)
    .from("hub_integrations")
    .select("slug")
    .eq("id", integrationId)
    .maybeSingle();
  return data?.slug ?? "unknown";
}

// ── Copy package ────────────────────────────────────────────────────────────

export interface HubCopyPackageResult {
  format: "md" | "json";
  content: string;
  includes_secrets: boolean;
}

export async function generateHubCopyPackage(
  mode: DataMode,
  actor: HubActor,
  slug: string,
  body: unknown,
  deps?: HubServerDeps
): Promise<HubCopyPackageResult> {
  const parsed = validateCopyPackageInput(body);
  if (!parsed.ok) throw new HubValidationError(parsed.errors);
  const { format, includeCredentialIds } = parsed.value;
  const detail = await getHubIntegrationDetail(mode, slug, deps);
  const includeIds = Array.from(new Set(includeCredentialIds));
  if (mode === "demo" && includeIds.length > 0) {
    throw new HubError(
      503,
      "Demo Mode — credential values are never included in a Demo Mode package (demo stores no values)."
    );
  }
  const includedMeta: HubCredentialMetadata[] = [];
  for (const id of includeIds) {
    const meta = detail.credentials.find((c) => c.id === id);
    if (!meta) {
      throw new HubError(
        400,
        "includeCredentialIds contains a credential that does not belong to this integration."
      );
    }
    if (meta.status === "revoked") {
      throw new HubError(
        409,
        `Credential "${meta.label}" is revoked and cannot be exported.`
      );
    }
    includedMeta.push(meta);
  }
  const includesSecrets = includedMeta.length > 0;
  if (includesSecrets) requireVaultKey(deps);
  // Strict audit BEFORE any decryption or rendering.
  await recordHubAuditStrict(
    mode,
    actor,
    {
      action: "HUB_COPY_PACKAGE_GENERATE",
      resource: `hub:${slug}`,
      details:
        `Generated a ${format.toUpperCase()} copy package for ${slug}. ` +
        (includesSecrets
          ? `INCLUDES credential values for: ${includedMeta.map((c) => `"${c.label}" (${c.environment})`).join(", ")}.`
          : "No credential values included."),
      hub: {
        integration_slug: slug,
        format,
        includes_secrets: includesSecrets,
        included_credential_ids: includedMeta.map((c) => c.id),
      },
    },
    deps
  );
  const includedSecrets: HubPackageIncludedSecret[] = [];
  if (includesSecrets) {
    const admin = adminClient(deps);
    for (const meta of includedMeta) {
      const { data } = await admin
        .from("hub_credentials")
        .select("value_enc")
        .eq("id", meta.id)
        .maybeSingle();
      if (!data) throw new HubError(404, "Credential was not found.");
      try {
        includedSecrets.push({
          label: meta.label,
          kind: meta.kind,
          environment: meta.environment,
          value: decryptHubSecret(data.value_enc, deps?.env),
        });
      } catch (err) {
        if (err instanceof HubVaultError) throw new HubError(500, err.message);
        throw err;
      }
    }
  }
  const content = buildCopyPackage(
    {
      integration: detail.integration,
      credentials: detail.credentials,
      documents: detail.documents,
      checklist: detail.checklist_rollup,
      generatedAt: new Date().toISOString(),
      mode,
      includedSecrets,
    },
    format
  );
  return { format, content, includes_secrets: includesSecrets };
}

// ── Status refresh (local recomputation only) ───────────────────────────────

export interface HubStatusRefresh {
  slug: string;
  /** The integration's stored status — refresh NEVER changes it. */
  status: string;
  vault_configured: boolean;
  credential_count: number;
  expired_credential_ids: string[];
  checklist: HubChecklistRollup;
  note: string;
}

/**
 * "Refresh" recomputes LOCAL derived facts only (expiry, rollups, vault
 * configuration). There is no external BRR/Meta status API — this
 * function makes no external calls and writes nothing.
 */
export async function refreshHubStatus(
  mode: DataMode,
  slug: string,
  deps?: HubServerDeps
): Promise<HubStatusRefresh> {
  const detail = await getHubIntegrationDetail(mode, slug, deps);
  const nowMs = Date.now();
  return {
    slug,
    status: detail.integration.status,
    vault_configured: mode === "supabase" ? isHubVaultConfigured(deps?.env) : false,
    credential_count: detail.credentials.length,
    expired_credential_ids: detail.credentials
      .filter((c) => isExpired(c, nowMs))
      .map((c) => c.id),
    checklist: detail.checklist_rollup,
    note:
      "Local recomputation only — no external status source exists for this " +
      "integration, and refresh never changes the stored status.",
  };
}
