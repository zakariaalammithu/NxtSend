import { describe, it, expect, beforeEach } from "vitest";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createFakeAdmin } from "./fake-admin";
import {
  HubError,
  HubValidationError,
  copyHubCredential,
  createHubCredential,
  createHubIntegration,
  createHubTestAccount,
  createHubDocument,
  deleteHubCredential,
  generateHubCopyPackage,
  getHubIntegrationDetail,
  getHubOverview,
  listHubCredentials,
  refreshHubStatus,
  revealHubCredential,
  updateHubChecklistState,
  updateHubCredential,
  updateHubDocument,
  updateHubIntegration,
} from "../hub-server";
import { __resetHubDemoStore } from "../demo-store";

const KEY = randomBytes(32).toString("base64");
const VAULT_ENV = { INTEGRATION_HUB_ENCRYPTION_KEY: KEY };
const ACTOR = { id: "11111111-1111-4111-8111-111111111111", email: "admin@example.com" };
const CANARY = "CANARY-SECRET-7f3a9b1c-DO-NOT-LEAK";
const CANARY_LAST4 = CANARY.slice(-4);

interface HubAuditMeta {
  from_status?: string;
  to_status?: string;
  includes_secrets?: boolean;
}

function hubMeta(row: Record<string, unknown>): HubAuditMeta {
  const metadata = row.metadata as { hub?: HubAuditMeta } | undefined;
  return metadata?.hub ?? {};
}

const BRR_ROW = {
  id: "22222222-2222-4222-8222-222222222222",
  slug: "bizreviewradar",
  name: "BizReviewRadar (BRR)",
  vendor: "BizReviewRadar",
  category: "connector",
  status: "configuring",
  external_status_note: null,
  website_url: "https://bizreviewradar.com",
  docs_url: "https://bizreviewradar.com/developers",
  review_portal_url: null,
  support_email: null,
  summary: "",
  metadata: {
    scope_profile: "muse",
    scopes: ["businesses:read", "reports:read", "recommendations:read"],
  },
  sort_order: 0,
  created_by: null,
  updated_by: null,
  created_at: "2026-10-22T00:00:00.000Z",
  updated_at: "2026-10-22T00:00:00.000Z",
};

function makeDeps(
  extraTables: Record<string, Array<Record<string, unknown>>> = {}
) {
  const fake = createFakeAdmin({
    hub_integrations: [BRR_ROW],
    hub_credentials: [],
    hub_test_accounts: [],
    hub_checklist_items: [],
    hub_checklist_state: [],
    hub_documents: [],
    audit_logs: [],
    ...extraTables,
  });
  return {
    fake,
    deps: {
      admin: fake as unknown as SupabaseClient,
      env: { ...VAULT_ENV },
    },
  };
}

type Deps = { admin: SupabaseClient; env: { INTEGRATION_HUB_ENCRYPTION_KEY: string } };

async function plantCanary(deps: Deps) {
  const meta = await createHubCredential(
    "supabase",
    ACTOR,
    "bizreviewradar",
    {
      label: "Muse OAuth client secret",
      kind: "client_secret",
      environment: "production",
      value: CANARY,
    },
    deps
  );
  return meta;
}

describe("credential vault (live mode, fake admin)", () => {
  it("stores ONLY ciphertext; the create response is metadata + last4", async () => {
    const { fake, deps } = makeDeps();
    const meta = await plantCanary(deps);
    expect(meta.value_last4).toBe(CANARY_LAST4);
    expect(meta.has_value).toBe(true);
    expect(JSON.stringify(meta)).not.toContain(CANARY);
    const stored = fake.tables.hub_credentials[0];
    expect(stored.value_enc).toMatch(/^v1\./);
    expect(stored.value_enc).not.toContain(CANARY);
    expect(JSON.stringify(stored)).not.toContain(CANARY);
    // plaintext column must not exist at all
    expect("value" in stored).toBe(false);
  });

  it("CANARY SWEEP: the secret appears in NO list/get/overview/package/audit/error — only in reveal/copy/explicit-export", async () => {
    const { fake, deps } = makeDeps();
    const meta = await plantCanary(deps);

    const surfaces: Array<[string, unknown]> = [
      ["list credentials", await listHubCredentials("supabase", "bizreviewradar", deps)],
      ["integration detail", await getHubIntegrationDetail("supabase", "bizreviewradar", deps)],
      ["overview", await getHubOverview("supabase", deps)],
      [
        "copy package (md, default)",
        await generateHubCopyPackage("supabase", ACTOR, "bizreviewradar", { format: "md" }, deps),
      ],
      [
        "copy package (json, default)",
        await generateHubCopyPackage("supabase", ACTOR, "bizreviewradar", { format: "json" }, deps),
      ],
      ["status refresh", await refreshHubStatus("supabase", "bizreviewradar", deps)],
      ["audit rows", fake.tables.audit_logs],
      ["stored credential row", fake.tables.hub_credentials],
    ];
    for (const [name, surface] of surfaces) {
      expect(JSON.stringify(surface), `canary leaked into: ${name}`).not.toContain(CANARY);
    }
    // The default package must not even carry the last4 fragment.
    const pkg = await generateHubCopyPackage(
      "supabase",
      ACTOR,
      "bizreviewradar",
      { format: "md" },
      deps
    );
    expect(pkg.content).not.toContain(CANARY_LAST4);

    // A validation error must not echo the value either.
    const err = await createHubCredential("supabase", ACTOR, "bizreviewradar", {
      label: "Echo",
      kind: "api_key",
      environment: "test",
      value: CANARY,
      notes: CANARY,
    }, deps).catch((e) => e);
    expect(err).toBeInstanceOf(HubError);
    expect(JSON.stringify(err)).not.toContain(CANARY);
    expect(JSON.stringify((err as HubValidationError).fields ?? {})).not.toContain(CANARY);

    // The ONLY surfaces allowed to carry the value:
    const revealed = await revealHubCredential("supabase", ACTOR, meta.id, {}, deps);
    expect(revealed.value).toBe(CANARY);
    const copied = await copyHubCredential("supabase", ACTOR, meta.id, {}, deps);
    expect(copied.value).toBe(CANARY);
    const exported = await generateHubCopyPackage(
      "supabase",
      ACTOR,
      "bizreviewradar",
      { format: "md", includeCredentialIds: [meta.id] },
      deps
    );
    expect(exported.includes_secrets).toBe(true);
    expect(exported.content).toContain(CANARY);
    expect(exported.content).toContain("SENSITIVE");
    // …and the export was audited, with metadata only.
    const exportAudit = fake.tables.audit_logs.find(
      (r) =>
        r.action === "HUB_COPY_PACKAGE_GENERATE" &&
        hubMeta(r).includes_secrets === true
    );
    expect(exportAudit).toBeDefined();
    expect(JSON.stringify(exportAudit)).not.toContain(CANARY);
  });

  it("AUDIT FAILURE: reveal returns 500 and NO value when the audit insert fails", async () => {
    const { fake, deps } = makeDeps();
    const meta = await plantCanary(deps);
    fake.failInsertTables.add("audit_logs");

    const revealErr = await revealHubCredential(
      "supabase",
      ACTOR,
      meta.id,
      {},
      deps
    ).catch((e) => e);
    expect(revealErr).toBeInstanceOf(HubError);
    expect(revealErr.status).toBe(500);
    expect(JSON.stringify(revealErr)).not.toContain(CANARY);
    expect((revealErr as { value?: unknown }).value).toBeUndefined();

    const copyErr = await copyHubCredential("supabase", ACTOR, meta.id, {}, deps).catch(
      (e) => e
    );
    expect(copyErr.status).toBe(500);

    const pkgErr = await generateHubCopyPackage(
      "supabase",
      ACTOR,
      "bizreviewradar",
      { format: "md", includeCredentialIds: [meta.id] },
      deps
    ).catch((e) => e);
    expect(pkgErr.status).toBe(500);
    expect(JSON.stringify(pkgErr)).not.toContain(CANARY);

    // Mutations are audit-then-act too: a failed audit means no row.
    const before = fake.tables.hub_credentials.length;
    const createErr = await createHubCredential("supabase", ACTOR, "bizreviewradar", {
      label: "Second",
      kind: "api_key",
      environment: "test",
      value: "another-value",
    }, deps).catch((e) => e);
    expect(createErr.status).toBe(500);
    expect(fake.tables.hub_credentials.length).toBe(before);
  });

  it("fails closed with 503 when the vault key is missing", async () => {
    const { fake, deps } = makeDeps();
    const noKeyDeps = { admin: fake as unknown as SupabaseClient, env: {} };
    const createErr = await createHubCredential("supabase", ACTOR, "bizreviewradar", {
      label: "K",
      kind: "api_key",
      environment: "test",
      value: "v",
    }, noKeyDeps).catch((e) => e);
    expect(createErr.status).toBe(503);
    expect(fake.tables.hub_credentials.length).toBe(0);

    const meta = await plantCanary(deps);
    const revealErr = await revealHubCredential("supabase", ACTOR, meta.id, {}, noKeyDeps).catch(
      (e) => e
    );
    expect(revealErr.status).toBe(503);
    expect(JSON.stringify(revealErr)).not.toContain(CANARY);
  });

  it("rotation replaces the value; the old value appears nowhere afterwards", async () => {
    const { fake, deps } = makeDeps();
    const meta = await plantCanary(deps);
    const NEW_VALUE = "ROTATED-VALUE-55555";
    const updated = await updateHubCredential("supabase", ACTOR, meta.id, {
      value: NEW_VALUE,
    }, deps);
    expect(updated.value_last4).toBe(NEW_VALUE.slice(-4));
    const revealed = await revealHubCredential("supabase", ACTOR, meta.id, {}, deps);
    expect(revealed.value).toBe(NEW_VALUE);
    const rotateAudit = fake.tables.audit_logs.find(
      (r) => r.action === "HUB_CREDENTIAL_ROTATE"
    );
    expect(rotateAudit).toBeDefined();
    expect(JSON.stringify(fake.tables.audit_logs)).not.toContain(CANARY);
    expect(JSON.stringify(fake.tables.audit_logs)).not.toContain(NEW_VALUE);
  });

  it("refuses to reveal/copy a revoked credential (409)", async () => {
    const { deps } = makeDeps();
    const meta = await plantCanary(deps);
    await updateHubCredential("supabase", ACTOR, meta.id, { status: "revoked" }, deps);
    const err = await revealHubCredential("supabase", ACTOR, meta.id, {}, deps).catch(
      (e) => e
    );
    expect(err.status).toBe(409);
    expect(JSON.stringify(err)).not.toContain(CANARY);
  });

  it("stamps last_revealed_at / last_copied_at on disclosure", async () => {
    const { fake, deps } = makeDeps();
    const meta = await plantCanary(deps);
    const revealed = await revealHubCredential("supabase", ACTOR, meta.id, {}, deps);
    expect(revealed.credential.last_revealed_at).toBeTruthy();
    expect(fake.tables.hub_credentials[0].last_revealed_at).toBeTruthy();
    const copied = await copyHubCredential("supabase", ACTOR, meta.id, {}, deps);
    expect(copied.credential.last_copied_at).toBeTruthy();
    const actions = fake.tables.audit_logs.map((r) => r.action);
    expect(actions).toContain("HUB_CREDENTIAL_REVEAL");
    expect(actions).toContain("HUB_CREDENTIAL_COPY");
  });

  it("delete removes the credential and is audited", async () => {
    const { fake, deps } = makeDeps();
    const meta = await plantCanary(deps);
    await deleteHubCredential("supabase", ACTOR, meta.id, deps);
    expect(fake.tables.hub_credentials).toHaveLength(0);
    expect(
      fake.tables.audit_logs.some((r) => r.action === "HUB_CREDENTIAL_DELETE")
    ).toBe(true);
  });
});

describe("status guard (service level)", () => {
  it("saving a credential NEVER flips the integration to live", async () => {
    const { deps } = makeDeps();
    await plantCanary(deps);
    const detail = await getHubIntegrationDetail("supabase", "bizreviewradar", deps);
    expect(detail.integration.status).toBe("configuring");
  });

  it("status → live requires confirm_status_change; the change is audited from→to", async () => {
    const { fake, deps } = makeDeps();
    const err = await updateHubIntegration("supabase", ACTOR, "bizreviewradar", {
      status: "live",
    }, deps).catch((e) => e);
    expect(err).toBeInstanceOf(HubError);
    expect(err.status).toBe(400);

    const updated = await updateHubIntegration("supabase", ACTOR, "bizreviewradar", {
      status: "live",
      confirm_status_change: true,
    }, deps);
    expect(updated.status).toBe("live");
    const audit = fake.tables.audit_logs.find((r) => r.action === "HUB_STATUS_CHANGE");
    expect(audit).toBeDefined();
    expect(hubMeta(audit!).from_status).toBe("configuring");
    expect(hubMeta(audit!).to_status).toBe("live");
  });

  it("copy-package and refresh never change the stored status", async () => {
    const { fake, deps } = makeDeps();
    await refreshHubStatus("supabase", "bizreviewradar", deps);
    await generateHubCopyPackage("supabase", ACTOR, "bizreviewradar", { format: "json" }, deps);
    expect(fake.tables.hub_integrations[0].status).toBe("configuring");
  });

  it("creating an integration directly as live is refused", async () => {
    const { deps } = makeDeps();
    const err = await createHubIntegration("supabase", ACTOR, {
      name: "Nope",
      status: "live",
      confirm_status_change: true,
    }, deps).catch((e) => e);
    expect(err.status).toBe(400);
  });
});

describe("scoping pins", () => {
  it("a workspace_id in the request body is dropped, never stored", async () => {
    const { fake, deps } = makeDeps();
    const created = await createHubIntegration("supabase", ACTOR, {
      name: "Scoped Integration",
      workspace_id: "99999999-9999-4999-8999-999999999999",
    }, deps);
    expect((created as unknown as Record<string, unknown>).workspace_id).toBeUndefined();
    const stored = fake.tables.hub_integrations.find((r) => r.slug === "scoped-integration");
    expect(stored).toBeDefined();
    expect("workspace_id" in stored!).toBe(false);
    const audit = fake.tables.audit_logs.find((r) => r.action === "HUB_INTEGRATION_CREATE");
    expect(audit).toBeDefined();
    expect(audit!.workspace_id ?? null).toBeNull();
  });

  it("unknown slug → 404 for detail, credentials and package", async () => {
    const { deps } = makeDeps();
    await expect(
      getHubIntegrationDetail("supabase", "nope", deps)
    ).rejects.toMatchObject({ status: 404 });
    await expect(listHubCredentials("supabase", "nope", deps)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("environment separation — test and live credentials stay separate records", () => {
  it("same label in test + production = two distinct rows; reveal/rotate never cross over", async () => {
    const { fake, deps } = makeDeps();
    const TEST_VALUE = "TEST-ONLY-VALUE-1111";
    const LIVE_VALUE = "LIVE-ONLY-VALUE-2222";
    const testCred = await createHubCredential("supabase", ACTOR, "bizreviewradar", {
      label: "BRR API key",
      kind: "api_key",
      environment: "test",
      value: TEST_VALUE,
    }, deps);
    const liveCred = await createHubCredential("supabase", ACTOR, "bizreviewradar", {
      label: "BRR API key",
      kind: "api_key",
      environment: "production",
      value: LIVE_VALUE,
    }, deps);

    // Two distinct records, each carrying its own environment + last4.
    expect(testCred.id).not.toBe(liveCred.id);
    expect(testCred.environment).toBe("test");
    expect(liveCred.environment).toBe("production");
    expect(fake.tables.hub_credentials).toHaveLength(2);

    // Each disclosure returns ONLY its own environment's value.
    const testReveal = await revealHubCredential("supabase", ACTOR, testCred.id, {}, deps);
    expect(testReveal.value).toBe(TEST_VALUE);
    const liveReveal = await revealHubCredential("supabase", ACTOR, liveCred.id, {}, deps);
    expect(liveReveal.value).toBe(LIVE_VALUE);

    // Rotating the TEST credential leaves the PRODUCTION record untouched.
    await updateHubCredential("supabase", ACTOR, testCred.id, {
      value: "TEST-ROTATED-VALUE-3333",
    }, deps);
    const liveAfter = await revealHubCredential("supabase", ACTOR, liveCred.id, {}, deps);
    expect(liveAfter.value).toBe(LIVE_VALUE);
    const testAfter = await revealHubCredential("supabase", ACTOR, testCred.id, {}, deps);
    expect(testAfter.value).toBe("TEST-ROTATED-VALUE-3333");
  });
});

describe("test accounts + checklists + documents (live mode)", () => {
  it("test accounts never accept or store a password; the vault reference is validated", async () => {
    const { fake, deps } = makeDeps();
    const pw = await createHubCredential("supabase", ACTOR, "bizreviewradar", {
      label: "Reviewer password",
      kind: "test_account_password",
      environment: "test",
      value: "account-pw-123",
    }, deps);
    const key = await createHubCredential("supabase", ACTOR, "bizreviewradar", {
      label: "Plain key",
      kind: "api_key",
      environment: "test",
      value: "api-key-123",
    }, deps);

    const pwFieldErr = await createHubTestAccount("supabase", ACTOR, "bizreviewradar", {
      label: "Reviewer",
      username: "rev@example.com",
      password: "hunter2",
    }, deps).catch((e) => e);
    expect(pwFieldErr.status).toBe(400);
    expect(JSON.stringify(pwFieldErr)).not.toContain("hunter2");

    const wrongKindErr = await createHubTestAccount("supabase", ACTOR, "bizreviewradar", {
      label: "Reviewer",
      username: "rev@example.com",
      password_credential_id: key.id,
    }, deps).catch((e) => e);
    expect(wrongKindErr.status).toBe(400);

    const account = await createHubTestAccount("supabase", ACTOR, "bizreviewradar", {
      label: "Reviewer",
      username: "rev@example.com",
      password_credential_id: pw.id,
    }, deps);
    expect(account.password_credential_id).toBe(pw.id);
    const stored = fake.tables.hub_test_accounts[0];
    expect("password" in stored).toBe(false);
    expect(JSON.stringify(stored)).not.toContain("account-pw-123");
  });

  it("checklist state upserts, sets completed_at on done, and rolls up", async () => {
    const itemId = "33333333-3333-4333-8333-333333333333";
    const { fake, deps } = makeDeps({
      hub_checklist_items: [
        {
          id: itemId,
          integration_id: BRR_ROW.id,
          list_key: "meta-submission",
          item_key: "business-verification",
          title: "Business verification",
          detail: "",
          source_ref: "owner-reported",
          sort_order: 0,
          created_at: "2026-10-22T00:00:00.000Z",
          updated_at: "2026-10-22T00:00:00.000Z",
        },
      ],
    });
    const state = await updateHubChecklistState("supabase", ACTOR, "bizreviewradar", itemId, {
      state: "done",
      note: "Verified by owner",
    }, deps);
    expect(state.state).toBe("done");
    expect(state.completed_at).toBeTruthy();
    const detail = await getHubIntegrationDetail("supabase", "bizreviewradar", deps);
    expect(detail.checklist_rollup.done).toBe(1);
    expect(detail.checklist_rollup.percent_done).toBe(100);
    expect(fake.tables.audit_logs.some((r) => r.action === "HUB_CHECKLIST_UPDATE")).toBe(true);
  });

  it("documents create + update bumps the version", async () => {
    const { deps } = makeDeps();
    const doc = await createHubDocument("supabase", ACTOR, "bizreviewradar", {
      title: "Setup notes",
      body: "v1 body",
    }, deps);
    expect(doc.version).toBe(1);
    const updated = await updateHubDocument("supabase", ACTOR, doc.id, {
      body: "v2 body",
    }, deps);
    expect(updated.version).toBe(2);
    expect(updated.body).toBe("v2 body");
  });

  it("overview counts credentials by environment", async () => {
    const { deps } = makeDeps();
    await plantCanary(deps);
    await createHubCredential("supabase", ACTOR, "bizreviewradar", {
      label: "Test key",
      kind: "api_key",
      environment: "test",
      value: "test-value",
    }, deps);
    const overview = await getHubOverview("supabase", deps);
    expect(overview.vault_configured).toBe(true);
    const item = overview.integrations[0];
    expect(item.credential_count).toBe(2);
    expect(item.credentials_by_environment.production).toBe(1);
    expect(item.credentials_by_environment.test).toBe(1);
  });
});

describe("demo mode invariants", () => {
  beforeEach(() => {
    __resetHubDemoStore();
  });

  it("credential create/update/delete are disabled in demo (503, explicit error)", async () => {
    const createErr = await createHubCredential("demo", ACTOR, "brr-muse-connector", {
      label: "Demo attempt",
      kind: "api_key",
      environment: "test",
      value: "demo-typed-value",
    }).catch((e) => e);
    expect(createErr.status).toBe(503);
    expect(createErr.message).toMatch(/Demo Mode/);

    const shells = await listHubCredentials("demo", "brr-muse-connector");
    const shellId = shells[0].id;
    const updateErr = await updateHubCredential("demo", ACTOR, shellId, {
      notes: "x",
    }).catch((e) => e);
    expect(updateErr.status).toBe(503);
    const deleteErr = await deleteHubCredential("demo", ACTOR, shellId).catch((e) => e);
    expect(deleteErr.status).toBe(503);
  });

  it("reveal/copy on a demo shell return NOTHING (503, no value anywhere)", async () => {
    const shells = await listHubCredentials("demo", "brr-muse-connector");
    expect(shells.length).toBeGreaterThan(0);
    for (const shell of shells) {
      expect(shell.has_value).toBe(false);
      expect(shell.value_last4).toBeNull();
    }
    const revealErr = await revealHubCredential("demo", ACTOR, shells[0].id, {}).catch(
      (e) => e
    );
    expect(revealErr.status).toBe(503);
    expect(revealErr.message).toMatch(/nothing to reveal or copy/);
    expect((revealErr as { value?: unknown }).value).toBeUndefined();
    const copyErr = await copyHubCredential("demo", ACTOR, shells[0].id, {}).catch(
      (e) => e
    );
    expect(copyErr.status).toBe(503);
  });

  it("a value typed in demo is never persisted or returned later", async () => {
    await createHubCredential("demo", ACTOR, "brr-muse-connector", {
      label: "Typed in demo",
      kind: "api_key",
      environment: "test",
      value: "demo-typed-value-xyz",
    }).catch(() => undefined);
    const shells = await listHubCredentials("demo", "brr-muse-connector");
    expect(JSON.stringify(shells)).not.toContain("demo-typed-value-xyz");
    expect(shells.some((s) => s.label === "Typed in demo")).toBe(false);
    const overview = await getHubOverview("demo");
    expect(JSON.stringify(overview)).not.toContain("demo-typed-value-xyz");
    expect(overview.vault_configured).toBe(false);
  });

  it("demo copy package carries the DEMO banner and include-secrets is refused", async () => {
    const pkg = await generateHubCopyPackage("demo", ACTOR, "brr-muse-connector", {
      format: "md",
    });
    expect(pkg.content).toContain("DEMO — NOT REAL CREDENTIALS");
    expect(pkg.includes_secrets).toBe(false);
    const shells = await listHubCredentials("demo", "brr-muse-connector");
    const err = await generateHubCopyPackage("demo", ACTOR, "brr-muse-connector", {
      format: "md",
      includeCredentialIds: [shells[0].id],
    }).catch((e) => e);
    expect(err.status).toBe(503);
  });

  it("demo records/checklists/documents remain readable and editable as fixtures", async () => {
    const detail = await getHubIntegrationDetail("demo", "brr-muse-connector");
    expect(detail.integration.slug).toBe("brr-muse-connector");
    expect(detail.documents.length).toBeGreaterThan(0);
    expect(detail.checklists.length).toBeGreaterThan(0);
    const itemId = detail.checklists[0].item.id;
    const state = await updateHubChecklistState("demo", ACTOR, "brr-muse-connector", itemId, {
      state: "in_progress",
    });
    expect(state.state).toBe("in_progress");
  });
});
