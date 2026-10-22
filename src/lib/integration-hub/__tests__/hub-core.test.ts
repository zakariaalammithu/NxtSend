import { describe, it, expect } from "vitest";
import {
  BRR_API_SCOPES,
  MUSE_CONNECTOR_SCOPES,
  computeChecklistRollup,
  toHubCredentialMetadata,
  validateCredentialCreate,
  validateCredentialUpdate,
  validateHubMetadata,
  validateIntegrationCreate,
  validateIntegrationUpdate,
  validateScopesForProfile,
  validateTestAccountInput,
} from "../hub-core";
import {
  buildCopyPackage,
  buildPackageModel,
} from "../package-generator";
import type {
  HubCredentialMetadata,
  HubIntegrationRecord,
} from "../hub-core";

describe("scope validation", () => {
  it("accepts exactly the three Muse scopes for the muse profile", () => {
    expect(
      validateScopesForProfile("muse", [
        "businesses:read",
        "reports:read",
        "recommendations:read",
      ])
    ).toEqual({ ok: true, errors: [] });
    expect([...MUSE_CONNECTOR_SCOPES]).toEqual([
      "businesses:read",
      "reports:read",
      "recommendations:read",
    ]);
  });

  it("rejects reviews:read and reviews:reply everywhere", () => {
    for (const profile of ["muse", "brr_api"] as const) {
      const r = validateScopesForProfile(profile, ["reviews:read"]);
      expect(r.ok).toBe(false);
      expect(r.errors.join(" ")).toMatch(/does not exist/);
      expect(validateScopesForProfile(profile, ["reviews:reply"]).ok).toBe(false);
    }
  });

  it("rejects analyses:read as a Muse scope but accepts it for brr_api", () => {
    expect(validateScopesForProfile("muse", ["analyses:read"]).ok).toBe(false);
    expect(validateScopesForProfile("brr_api", ["analyses:read"]).ok).toBe(true);
    expect([...BRR_API_SCOPES]).toHaveLength(7);
    expect(validateScopesForProfile("brr_api", [...BRR_API_SCOPES]).ok).toBe(true);
  });

  it("rejects unknown profiles, duplicates and non-arrays", () => {
    expect(validateScopesForProfile("chatgpt", ["businesses:read"]).ok).toBe(false);
    expect(
      validateScopesForProfile("muse", ["businesses:read", "businesses:read"]).ok
    ).toBe(false);
    expect(validateScopesForProfile("muse", "businesses:read").ok).toBe(false);
    expect(validateScopesForProfile("muse", ["webhooks:manage"]).ok).toBe(false);
  });
});

describe("integration validation + status guard", () => {

  it("creates as draft/configuring and derives the slug", () => {
    const r = validateIntegrationCreate({ name: "My Integration!" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.slug).toBe("my-integration");
  });

  it("refuses to CREATE directly as live or approved", () => {
    for (const status of ["live", "approved", "submitted", "in_review"]) {
      const r = validateIntegrationCreate({
        name: "X",
        status,
        confirm_status_change: true,
      });
      expect(r.ok).toBe(false);
    }
  });

  it("refuses to SET live/approved without the explicit confirm field", () => {
    const noConfirm = validateIntegrationUpdate({ status: "live" });
    expect(noConfirm.ok).toBe(false);
    if (!noConfirm.ok)
      expect(noConfirm.errors.status).toMatch(/confirm_status_change/);
    const noConfirmApproved = validateIntegrationUpdate({ status: "approved" });
    expect(noConfirmApproved.ok).toBe(false);
  });

  it("allows live/approved WITH confirm_status_change: true", () => {
    const r = validateIntegrationUpdate({ status: "live", confirm_status_change: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe("live");
  });

  it("allows ordinary status moves without the confirm field", () => {
    expect(validateIntegrationUpdate({ status: "submitted" }).ok).toBe(true);
    expect(validateIntegrationUpdate({ status: "paused" }).ok).toBe(true);
  });

  it("drops unknown fields (workspace_id cannot be injected)", () => {
    const r = validateIntegrationCreate({
      name: "Scoped",
      workspace_id: "ws-should-be-dropped",
      anything_else: 42,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect((r.value as unknown as Record<string, unknown>).workspace_id).toBeUndefined();
      expect((r.value as unknown as Record<string, unknown>).anything_else).toBeUndefined();
    }
  });

  it("rejects secret-looking metadata keys", () => {
    const errors: Record<string, string> = {};
    expect(
      validateHubMetadata({ client_secret: "nope" }, errors)
    ).toBeUndefined();
    expect(errors.metadata).toMatch(/non-secret only/);
    const okErrors: Record<string, string> = {};
    expect(
      validateHubMetadata(
        { scope_profile: "muse", scopes: ["businesses:read"] },
        okErrors
      )
    ).toBeDefined();
  });

  it("validates metadata scopes against the Muse profile", () => {
    const errors: Record<string, string> = {};
    expect(
      validateHubMetadata(
        { scope_profile: "muse", scopes: ["reviews:read"] },
        errors
      )
    ).toBeUndefined();
    expect(errors.metadata).toMatch(/reviews:read/);
  });

  it("rejects a bad slug and a bad support email", () => {
    expect(
      validateIntegrationCreate({ name: "X", slug: "Bad Slug!" }).ok
    ).toBe(false);
    expect(
      validateIntegrationCreate({ name: "X", support_email: "not-an-email" }).ok
    ).toBe(false);
  });
});

describe("credential validation", () => {
  it("requires label + value; defaults kind/environment", () => {
    const r = validateCredentialCreate({ label: "Key", value: "v" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.kind).toBe("api_key");
      expect(r.value.environment).toBe("production");
    }
    expect(validateCredentialCreate({ label: "Key" }).ok).toBe(false);
    expect(validateCredentialCreate({ value: "v" }).ok).toBe(false);
  });

  it("rejects unknown kinds/environments and expired/revoked at create", () => {
    expect(
      validateCredentialCreate({ label: "K", value: "v", kind: "ssh_key" }).ok
    ).toBe(false);
    expect(
      validateCredentialCreate({ label: "K", value: "v", environment: "prod" }).ok
    ).toBe(false);
    expect(
      validateCredentialCreate({ label: "K", value: "v", status: "revoked" }).ok
    ).toBe(false);
  });

  it("rejects notes that repeat the value", () => {
    expect(
      validateCredentialCreate({ label: "K", value: "sekrit", notes: "sekrit" }).ok
    ).toBe(false);
    expect(
      validateCredentialUpdate({ value: "sekrit", notes: "sekrit" }).ok
    ).toBe(false);
  });

  it("accepts the full environment vocabulary incl. development", () => {
    for (const environment of ["production", "staging", "test", "development"]) {
      expect(
        validateCredentialCreate({ label: "K", value: "v", environment }).ok
      ).toBe(true);
    }
  });
});

describe("test-account validation", () => {
  it("never accepts a password field", () => {
    const r = validateTestAccountInput(
      { label: "Reviewer", username: "rev@example.com", password: "hunter2" },
      false
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.password).toMatch(/never accept a password/);
  });

  it("accepts a password_credential_id reference", () => {
    const r = validateTestAccountInput(
      {
        label: "Reviewer",
        username: "rev@example.com",
        password_credential_id: "cred-1",
      },
      false
    );
    expect(r.ok).toBe(true);
  });
});

describe("credential metadata mapper", () => {
  it("never carries value_enc (or any value) into the metadata shape", () => {
    const meta = toHubCredentialMetadata({
      id: "c1",
      integration_id: "i1",
      label: "Secret",
      kind: "client_secret",
      environment: "production",
      status: "configured",
      username_hint: null,
      value_enc: "v1.AAAA.BBBB.CCCCanaryCiphertext",
      value_last4: "1234",
      expires_at: null,
      notes: "",
      last_revealed_at: null,
      last_revealed_by: null,
      last_copied_at: null,
      last_copied_by: null,
      created_by: null,
      updated_by: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });
    expect(meta.has_value).toBe(true);
    expect(meta.value_last4).toBe("1234");
    expect(JSON.stringify(meta)).not.toContain("CanaryCiphertext");
    expect((meta as unknown as Record<string, unknown>).value_enc).toBeUndefined();
    expect((meta as unknown as Record<string, unknown>).value).toBeUndefined();
  });
});

describe("copy package generator", () => {
  const integration: HubIntegrationRecord = {
    id: "i1",
    slug: "bizreviewradar",
    name: "BizReviewRadar (BRR)",
    vendor: "BizReviewRadar",
    category: "connector",
    status: "configuring",
    external_status_note: "Owner-reported: in review",
    website_url: "https://bizreviewradar.com",
    docs_url: "https://bizreviewradar.com/developers",
    review_portal_url: null,
    support_email: null,
    summary: "Review intelligence.",
    metadata: {
      scope_profile: "muse",
      scopes: ["businesses:read", "reports:read", "recommendations:read"],
      endpoints: [
        { label: "MCP", url: "https://bizreviewradar.com/api/public/muse/mcp", method: "POST" },
      ],
      tool_inventory: [
        { name: "brr.find_business", scope: "businesses:read", permission: "read" },
      ],
      compliance_links: [{ label: "Privacy", url: "https://bizreviewradar.com/privacy" }],
      known_limitations: ["MCP surface is flag-gated."],
    },
    sort_order: 0,
    created_by: null,
    updated_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
  const credential: HubCredentialMetadata = {
    id: "c1",
    integration_id: "i1",
    label: "Muse client secret",
    kind: "client_secret",
    environment: "production",
    status: "configured",
    username_hint: null,
    has_value: true,
    value_last4: "wxyz",
    expires_at: null,
    notes: "",
    last_revealed_at: null,
    last_revealed_by: null,
    last_copied_at: null,
    last_copied_by: null,
    created_by: null,
    updated_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
  const baseInput = {
    integration,
    credentials: [credential],
    documents: [],
    checklist: computeChecklistRollup([]),
    generatedAt: "2026-10-22T00:00:00.000Z",
    mode: "supabase" as const,
  };

  it("includes endpoints, scopes, tools and status — and NEVER a value or last4", () => {
    const md = buildCopyPackage(baseInput, "md");
    expect(md).toContain("brr.find_business");
    expect(md).toContain("businesses:read");
    expect(md).toContain("https://bizreviewradar.com/api/public/muse/mcp");
    expect(md).toContain("configuring");
    expect(md).not.toContain("wxyz");
    const json = buildCopyPackage(baseInput, "json");
    const parsed = JSON.parse(json);
    expect(parsed.credentials[0].value).toBeNull();
    expect(json).not.toContain("wxyz");
    expect(parsed.sensitive).toBe(false);
  });

  it("marks demo packages with the DEMO banner", () => {
    const md = buildCopyPackage({ ...baseInput, mode: "demo" }, "md");
    expect(md).toContain("DEMO — NOT REAL CREDENTIALS");
    const model = buildPackageModel({ ...baseInput, mode: "demo" });
    expect(model.demo).toBe(true);
  });

  it("renders explicitly-included secrets ONLY via the separate include path, with a SENSITIVE banner", () => {
    const md = buildCopyPackage(
      {
        ...baseInput,
        includedSecrets: [
          {
            label: "Muse client secret",
            kind: "client_secret",
            environment: "production",
            value: "INCLUDED-CANARY-VALUE",
          },
        ],
      },
      "md"
    );
    expect(md).toContain("SENSITIVE — CONTAINS CREDENTIAL VALUES");
    expect(md).toContain("INCLUDED-CANARY-VALUE");
    const model = buildPackageModel({
      ...baseInput,
      includedSecrets: [
        {
          label: "Muse client secret",
          kind: "client_secret",
          environment: "production",
          value: "INCLUDED-CANARY-VALUE",
        },
      ],
    });
    expect(model.sensitive).toBe(true);
    expect(model.credentials[0].value).toBe("INCLUDED-CANARY-VALUE");
  });
});
