/**
 * Integration Hub DEMO store (P7 Stage B).
 *
 * In-process, clearly-labelled fixtures used when the app runs in Demo
 * Mode (no Supabase configured), mirroring the other admin demo
 * stores: data lives for the process lifetime only and is never
 * persisted anywhere.
 *
 * Demo rules for the Hub (stricter than the rest of the admin area,
 * because this surface is a credential vault):
 *   - Integrations, checklists, documents and test-account RECORDS are
 *     readable (and editable as throwaway fixtures).
 *   - Credential rows are METADATA-ONLY SHELLS: they describe that a
 *     credential would exist (label/kind/environment) and store NO
 *     value — `has_value` is false and `value_last4` is null.
 *   - Credential CREATE / UPDATE / DELETE are disabled: the mutation
 *     functions below throw, and the service layer refuses before even
 *     reaching them. There is NO write path for a demo secret, so a
 *     value typed in Demo Mode can never be returned later as if it
 *     had been persisted.
 *   - Reveal/copy in demo return nothing (service-layer refusal: "demo
 *     mode — nothing stored").
 */
import { generateId } from "@/lib/utils";
import type {
  HubChecklistEntry,
  HubChecklistStateRecord,
  HubCredentialMetadata,
  HubDocumentRecord,
  HubIntegrationInput,
  HubIntegrationRecord,
  HubTestAccountInput,
  HubTestAccountRecord,
  HubChecklistItemRecord,
} from "./hub-core";
import {
  HUB_SEED_GLOBAL_DOCUMENTS,
  HUB_SEED_RECORDS,
  expectedVaultEntries,
} from "./seed-content";

export class HubDemoWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HubDemoWriteError";
  }
}

export const DEMO_CREDENTIAL_WRITE_MESSAGE =
  "Demo Mode — credential changes are disabled. Demo Mode stores no " +
  "credential values; configure Supabase and INTEGRATION_HUB_ENCRYPTION_KEY " +
  "to use the vault.";

export const DEMO_REVEAL_MESSAGE =
  "Demo Mode — no credential values are stored in demo, so there is " +
  "nothing to reveal or copy.";

const now = () => new Date().toISOString();
const DEMO_ACTOR = "demo-admin";

interface DemoState {
  integrations: HubIntegrationRecord[];
  credentials: HubCredentialMetadata[];
  testAccounts: HubTestAccountRecord[];
  checklistItems: HubChecklistItemRecord[];
  checklistState: HubChecklistStateRecord[];
  documents: HubDocumentRecord[];
}

/**
 * Demo fixtures are built FROM the Stage D seed module
 * (`seed-content.ts`) — the same content migration 016 seeds for live
 * installs — with deterministic demo ids. Credential fixtures are the
 * seed's display-level expected vault entries materialised as
 * metadata-only shells: `has_value` false, `value_last4` null, always.
 * Test accounts are seeded EMPTY (structure only), exactly as in the
 * live seed.
 */
function seedState(): DemoState {
  const ts = now();
  const integrations: HubIntegrationRecord[] = [];
  const credentials: HubCredentialMetadata[] = [];
  const checklistItems: HubChecklistItemRecord[] = [];
  const checklistState: HubChecklistStateRecord[] = [];
  const documents: HubDocumentRecord[] = [];

  for (const record of HUB_SEED_RECORDS) {
    const integrationId = `demo-hub-${record.slug}`;
    integrations.push({
      id: integrationId,
      slug: record.slug,
      name: record.name,
      vendor: record.vendor,
      category: record.category,
      status: record.status,
      external_status_note: record.external_status_note,
      website_url: record.website_url,
      docs_url: record.docs_url,
      review_portal_url: record.review_portal_url,
      support_email: record.support_email,
      summary: record.summary,
      metadata: record.metadata,
      sort_order: record.sort_order,
      created_by: DEMO_ACTOR,
      updated_by: DEMO_ACTOR,
      created_at: ts,
      updated_at: ts,
    });
    expectedVaultEntries(record).forEach((entry, i) => {
      credentials.push({
        id: `demo-cred-${record.slug}-${i + 1}`,
        integration_id: integrationId,
        label: entry.label,
        kind: entry.kind,
        environment: entry.environment,
        status: "needs_verification",
        username_hint: null,
        has_value: false,
        value_last4: null,
        expires_at: null,
        notes: `${entry.note} Demo shell — no value is stored in Demo Mode.`,
        last_revealed_at: null,
        last_revealed_by: null,
        last_copied_at: null,
        last_copied_by: null,
        created_by: DEMO_ACTOR,
        updated_by: DEMO_ACTOR,
        created_at: ts,
        updated_at: ts,
      });
    });
    const itemIds = new Map<string, string>();
    for (const item of record.checklist_items) {
      const itemId = `demo-item-${item.item_key}`;
      itemIds.set(`${item.list_key}:${item.item_key}`, itemId);
      checklistItems.push({
        id: itemId,
        integration_id: integrationId,
        list_key: item.list_key,
        item_key: item.item_key,
        title: item.title,
        detail: item.detail,
        source_ref: item.source_ref,
        sort_order: item.sort_order,
      });
    }
    for (const st of record.checklist_states) {
      const itemId = itemIds.get(`${st.list_key}:${st.item_key}`);
      if (!itemId) continue;
      checklistState.push({
        id: `demo-state-${st.item_key}`,
        integration_id: integrationId,
        item_id: itemId,
        state: st.state,
        note: st.note,
        evidence_url: null,
        completed_at: st.state === "done" ? ts : null,
        updated_by: DEMO_ACTOR,
        updated_at: ts,
      });
    }
    for (const doc of record.documents) {
      documents.push({
        id: `demo-doc-${doc.slug}`,
        integration_id: integrationId,
        slug: doc.slug,
        title: doc.title,
        kind: doc.kind,
        body: doc.body,
        template_vars: {},
        is_seeded: true,
        version: 1,
        created_by: DEMO_ACTOR,
        updated_by: DEMO_ACTOR,
        created_at: ts,
        updated_at: ts,
      });
    }
  }
  for (const doc of HUB_SEED_GLOBAL_DOCUMENTS) {
    documents.push({
      id: `demo-doc-${doc.slug}`,
      integration_id: null,
      slug: doc.slug,
      title: doc.title,
      kind: doc.kind,
      body: doc.body,
      template_vars: {},
      is_seeded: true,
      version: 1,
      created_by: DEMO_ACTOR,
      updated_by: DEMO_ACTOR,
      created_at: ts,
      updated_at: ts,
    });
  }

  return {
    integrations,
    credentials,
    testAccounts: [],
    checklistItems,
    checklistState,
    documents,
  };
}

let state: DemoState = seedState();

/** Test hook: restore pristine fixtures. */
export function __resetHubDemoStore(): void {
  state = seedState();
}

// ── Integrations ────────────────────────────────────────────────────────────

export function listDemoHubIntegrations(): HubIntegrationRecord[] {
  return [...state.integrations].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
  );
}

export function getDemoHubIntegration(
  slug: string
): HubIntegrationRecord | null {
  return state.integrations.find((i) => i.slug === slug) ?? null;
}

export function getDemoHubIntegrationById(
  id: string
): HubIntegrationRecord | null {
  return state.integrations.find((i) => i.id === id) ?? null;
}

export function createDemoHubIntegration(
  input: HubIntegrationInput & { name: string; slug: string },
  actorId: string | null
): HubIntegrationRecord {
  const ts = now();
  const record: HubIntegrationRecord = {
    id: generateId(),
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
    created_by: actorId,
    updated_by: actorId,
    created_at: ts,
    updated_at: ts,
  };
  state.integrations.push(record);
  return record;
}

export function updateDemoHubIntegration(
  slug: string,
  input: HubIntegrationInput,
  actorId: string | null
): HubIntegrationRecord | null {
  const record = getDemoHubIntegration(slug);
  if (!record) return null;
  Object.assign(record, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.slug !== undefined ? { slug: input.slug } : {}),
    ...(input.vendor !== undefined ? { vendor: input.vendor } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.external_status_note !== undefined
      ? { external_status_note: input.external_status_note }
      : {}),
    ...(input.website_url !== undefined ? { website_url: input.website_url } : {}),
    ...(input.docs_url !== undefined ? { docs_url: input.docs_url } : {}),
    ...(input.review_portal_url !== undefined
      ? { review_portal_url: input.review_portal_url }
      : {}),
    ...(input.support_email !== undefined ? { support_email: input.support_email } : {}),
    ...(input.summary !== undefined ? { summary: input.summary } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    ...(input.sort_order !== undefined ? { sort_order: input.sort_order } : {}),
    updated_by: actorId,
    updated_at: now(),
  });
  return record;
}

export function deleteDemoHubIntegration(slug: string): boolean {
  const before = state.integrations.length;
  const record = getDemoHubIntegration(slug);
  if (!record) return false;
  state.integrations = state.integrations.filter((i) => i.slug !== slug);
  state.credentials = state.credentials.filter(
    (c) => c.integration_id !== record.id
  );
  state.testAccounts = state.testAccounts.filter(
    (t) => t.integration_id !== record.id
  );
  state.checklistState = state.checklistState.filter(
    (s) => s.integration_id !== record.id
  );
  state.documents = state.documents.filter(
    (d) => d.integration_id !== record.id
  );
  return state.integrations.length !== before;
}

// ── Credentials (metadata shells only; writes disabled) ─────────────────────

export function listDemoHubCredentials(
  integrationId: string
): HubCredentialMetadata[] {
  return state.credentials.filter((c) => c.integration_id === integrationId);
}

export function getDemoHubCredential(
  id: string
): HubCredentialMetadata | null {
  return state.credentials.find((c) => c.id === id) ?? null;
}

export function createDemoHubCredential(): never {
  throw new HubDemoWriteError(DEMO_CREDENTIAL_WRITE_MESSAGE);
}

export function updateDemoHubCredential(): never {
  throw new HubDemoWriteError(DEMO_CREDENTIAL_WRITE_MESSAGE);
}

export function deleteDemoHubCredential(): never {
  throw new HubDemoWriteError(DEMO_CREDENTIAL_WRITE_MESSAGE);
}

// ── Test accounts ───────────────────────────────────────────────────────────

export function listDemoHubTestAccounts(
  integrationId: string
): HubTestAccountRecord[] {
  return state.testAccounts.filter((t) => t.integration_id === integrationId);
}

export function getDemoHubTestAccount(id: string): HubTestAccountRecord | null {
  return state.testAccounts.find((t) => t.id === id) ?? null;
}

export function createDemoHubTestAccount(
  integrationId: string,
  input: HubTestAccountInput,
  actorId: string | null
): HubTestAccountRecord {
  const ts = now();
  const record: HubTestAccountRecord = {
    id: generateId(),
    integration_id: integrationId,
    label: input.label ?? "",
    login_url: input.login_url ?? null,
    username: input.username ?? "",
    password_credential_id: input.password_credential_id ?? null,
    instructions: input.instructions ?? "",
    representative_data_note: input.representative_data_note ?? "",
    status: input.status ?? "active",
    last_verified_at: input.mark_verified ? ts : null,
    created_by: actorId,
    updated_by: actorId,
    created_at: ts,
    updated_at: ts,
  };
  state.testAccounts.push(record);
  return record;
}

export function updateDemoHubTestAccount(
  id: string,
  input: HubTestAccountInput,
  actorId: string | null
): HubTestAccountRecord | null {
  const record = getDemoHubTestAccount(id);
  if (!record) return null;
  Object.assign(record, {
    ...(input.label !== undefined ? { label: input.label } : {}),
    ...(input.login_url !== undefined ? { login_url: input.login_url } : {}),
    ...(input.username !== undefined ? { username: input.username } : {}),
    ...(input.password_credential_id !== undefined
      ? { password_credential_id: input.password_credential_id }
      : {}),
    ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
    ...(input.representative_data_note !== undefined
      ? { representative_data_note: input.representative_data_note }
      : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.mark_verified ? { last_verified_at: now() } : {}),
    updated_by: actorId,
    updated_at: now(),
  });
  return record;
}

export function deleteDemoHubTestAccount(id: string): boolean {
  const before = state.testAccounts.length;
  state.testAccounts = state.testAccounts.filter((t) => t.id !== id);
  return state.testAccounts.length !== before;
}

// ── Checklists ──────────────────────────────────────────────────────────────

export function listDemoHubChecklistEntries(
  integrationId: string
): HubChecklistEntry[] {
  const items = state.checklistItems
    .filter((i) => i.integration_id === null || i.integration_id === integrationId)
    .sort((a, b) => a.sort_order - b.sort_order);
  return items.map((item) => ({
    item,
    state:
      state.checklistState.find(
        (s) => s.integration_id === integrationId && s.item_id === item.id
      ) ?? null,
  }));
}

export function upsertDemoHubChecklistState(
  integrationId: string,
  itemId: string,
  patch: {
    state: HubChecklistStateRecord["state"];
    note?: string;
    evidence_url?: string | null;
  },
  actorId: string | null
): HubChecklistStateRecord | null {
  const item = state.checklistItems.find((i) => i.id === itemId);
  if (!item) return null;
  const ts = now();
  const completedAt = patch.state === "done" ? ts : null;
  const existing = state.checklistState.find(
    (s) => s.integration_id === integrationId && s.item_id === itemId
  );
  if (existing) {
    existing.state = patch.state;
    if (patch.note !== undefined) existing.note = patch.note;
    if (patch.evidence_url !== undefined) existing.evidence_url = patch.evidence_url;
    existing.completed_at = completedAt;
    existing.updated_by = actorId;
    existing.updated_at = ts;
    return existing;
  }
  const record: HubChecklistStateRecord = {
    id: generateId(),
    integration_id: integrationId,
    item_id: itemId,
    state: patch.state,
    note: patch.note ?? "",
    evidence_url: patch.evidence_url ?? null,
    completed_at: completedAt,
    updated_by: actorId,
    updated_at: ts,
  };
  state.checklistState.push(record);
  return record;
}

// ── Documents ───────────────────────────────────────────────────────────────

export function listDemoHubDocuments(
  integrationId: string | null
): HubDocumentRecord[] {
  return state.documents.filter(
    (d) => d.integration_id === integrationId || d.integration_id === null
  );
}

export function getDemoHubDocument(id: string): HubDocumentRecord | null {
  return state.documents.find((d) => d.id === id) ?? null;
}

export function createDemoHubDocument(
  integrationId: string | null,
  input: { title: string; slug: string; kind?: HubDocumentRecord["kind"]; body?: string; template_vars?: Record<string, unknown> },
  actorId: string | null
): HubDocumentRecord {
  const ts = now();
  const record: HubDocumentRecord = {
    id: generateId(),
    integration_id: integrationId,
    slug: input.slug,
    title: input.title,
    kind: input.kind ?? "doc",
    body: input.body ?? "",
    template_vars: input.template_vars ?? {},
    is_seeded: false,
    version: 1,
    created_by: actorId,
    updated_by: actorId,
    created_at: ts,
    updated_at: ts,
  };
  state.documents.push(record);
  return record;
}

export function updateDemoHubDocument(
  id: string,
  input: {
    title?: string;
    slug?: string;
    kind?: HubDocumentRecord["kind"];
    body?: string;
    template_vars?: Record<string, unknown>;
  },
  actorId: string | null
): HubDocumentRecord | null {
  const record = getDemoHubDocument(id);
  if (!record) return null;
  Object.assign(record, {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.slug !== undefined ? { slug: input.slug } : {}),
    ...(input.kind !== undefined ? { kind: input.kind } : {}),
    ...(input.body !== undefined ? { body: input.body } : {}),
    ...(input.template_vars !== undefined
      ? { template_vars: input.template_vars }
      : {}),
    version: record.version + 1,
    updated_by: actorId,
    updated_at: now(),
  });
  return record;
}

export function deleteDemoHubDocument(id: string): boolean {
  const before = state.documents.length;
  state.documents = state.documents.filter((d) => d.id !== id);
  return state.documents.length !== before;
}
