/**
 * Integration Hub UI (P7 Stage C) — unit pins for the sensitive display
 * rules: masked rendering, the placeholder-submission guard, demo-mode
 * disabled credential forms, the guarded status-change flow, the audit
 * filter, and the shared clipboard helper.
 */

import * as React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  HubCredentialMetadata,
  HubIntegrationRecord,
} from "@/lib/integration-hub/hub-core";
import type { AuditEntry } from "@/lib/admin/audit-core";
import { ADMIN_NAV_GROUPS } from "@/lib/admin/nav";
import { copyTextToClipboard } from "../../CopyButton";
import { CredentialsTab } from "../CredentialsTab";
import {
  DEMO_CREDENTIAL_NOTICE,
  HUB_AUDIT_ACTION_LABELS,
  HUB_STATUS_META,
  buildStatusUpdateBody,
  credentialExpiryState,
  credentialFormError,
  credentialWritesDisabled,
  integrationCompleteness,
  isHubAuditForIntegration,
  isPlaceholderSecretValue,
  isSecretCredentialKind,
  maskCredentialValue,
  metaEndpoints,
  metaScopes,
  metaTools,
  placeholderForKind,
  statusChangeNeedsConfirm,
  type HubOverviewItemView,
} from "../hub-ui";

function fixtureCredential(
  patch: Partial<HubCredentialMetadata> = {}
): HubCredentialMetadata {
  return {
    id: "cred-1",
    integration_id: "int-1",
    label: "Muse connector client secret",
    kind: "client_secret",
    environment: "production",
    status: "configured",
    username_hint: null,
    has_value: true,
    value_last4: "Xy9z",
    expires_at: null,
    notes: "",
    last_revealed_at: null,
    last_revealed_by: null,
    last_copied_at: null,
    last_copied_by: null,
    created_by: "admin@example.com",
    updated_by: "admin@example.com",
    created_at: "2026-10-22T00:00:00.000Z",
    updated_at: "2026-10-22T00:00:00.000Z",
    ...patch,
  };
}

function fixtureIntegration(
  patch: Partial<HubIntegrationRecord> = {}
): HubIntegrationRecord {
  return {
    id: "int-1",
    slug: "bizreviewradar",
    name: "BizReviewRadar (BRR)",
    vendor: "BizReviewRadar",
    category: "connector",
    status: "configuring",
    external_status_note: null,
    website_url: null,
    docs_url: null,
    review_portal_url: null,
    support_email: null,
    summary: "",
    metadata: {},
    sort_order: 0,
    created_by: null,
    updated_by: null,
    created_at: "2026-10-22T00:00:00.000Z",
    updated_at: "2026-10-22T00:00:00.000Z",
    ...patch,
  };
}

// ── Navigation ──────────────────────────────────────────────────────────────

describe("admin nav", () => {
  it("contains the Integration Hub item in the Integrations group", () => {
    const group = ADMIN_NAV_GROUPS.find((g) => g.label === "Integrations");
    expect(group).toBeDefined();
    const item = group!.items.find((i) => i.label === "Integration Hub");
    expect(item).toBeDefined();
    expect(item!.href).toBe("/admin/integration-hub");
    expect(item!.icon).toBe("PlugZap");
  });

  it("keeps every nav href unique", () => {
    const hrefs = ADMIN_NAV_GROUPS.flatMap((g) =>
      g.items.map((i) => i.href)
    );
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

// ── Masked rendering ────────────────────────────────────────────────────────

describe("maskCredentialValue", () => {
  it("renders bullets + last4 only", () => {
    expect(maskCredentialValue(fixtureCredential())).toBe("••••••••Xy9z");
  });

  it("renders an explicit no-value state for shells", () => {
    expect(
      maskCredentialValue(
        fixtureCredential({ has_value: false, value_last4: null })
      )
    ).toBe("No value stored");
  });
});

describe("CredentialsTab rendering (server render of the real component)", () => {
  const html = renderToString(
    React.createElement(CredentialsTab, {
      slug: "bizreviewradar",
      credentials: [
        fixtureCredential(),
        fixtureCredential({
          id: "cred-2",
          label: "Test API key",
          kind: "api_key",
          environment: "test",
          status: "needs_verification",
          has_value: false,
          value_last4: null,
        }),
      ],
      mode: "demo" as const,
      onChanged: () => {},
    })
  );

  it("shows the masked value and never any value material", () => {
    expect(html).toContain("••••••••Xy9z");
    expect(html).toContain("No value stored");
    expect(html).not.toContain("value_enc");
  });

  it("shows the demo notice and disables credential writes in demo mode", () => {
    expect(html).toContain("Credential entry is disabled in demo mode");
    expect(credentialWritesDisabled("demo")).toBe(true);
    expect(credentialWritesDisabled("supabase")).toBe(false);
    // The Add credential button is rendered disabled in demo mode.
    expect(html).toMatch(/disabled[^>]*>[\s\S]*?Add credential/);
  });

  it("labels environments and verification states", () => {
    expect(html).toContain("Production");
    expect(html).toContain("Needs verification");
    expect(html).toContain("Configured");
  });
});

// ── Placeholder guard ───────────────────────────────────────────────────────

describe("placeholder guard", () => {
  it("blocks the exact placeholder strings the form displays", () => {
    for (const kind of [
      "client_secret",
      "api_key",
      "webhook_secret",
      "bearer_token",
      "oauth_client_id",
      "password",
      "other",
    ] as const) {
      expect(isPlaceholderSecretValue(placeholderForKind(kind))).toBe(true);
    }
  });

  it("blocks placeholder-shaped values generally", () => {
    expect(isPlaceholderSecretValue("enter_real_client_secret")).toBe(true);
    expect(isPlaceholderSecretValue("your-api-key-here")).toBe(true);
    expect(isPlaceholderSecretValue("change-me")).toBe(true);
    expect(isPlaceholderSecretValue("PLACEHOLDER")).toBe(true);
  });

  it("allows real-looking values", () => {
    expect(isPlaceholderSecretValue("sk-live-9f2Kd83hQp")).toBe(false);
    expect(isPlaceholderSecretValue("brr_live_4eC39HqLyjWDarjtT1zdp7dc")).toBe(
      false
    );
    expect(isPlaceholderSecretValue("")).toBe(false);
  });

  it("credentialFormError wires the guard into create/edit flows", () => {
    expect(
      credentialFormError({ isEdit: false, value: "", notes: "" })
    ).toMatch(/Enter the real credential value/);
    expect(
      credentialFormError({
        isEdit: false,
        value: "ENTER_REAL_CLIENT_SECRET",
        notes: "",
      })
    ).toMatch(/placeholder text/);
    // Edit with a blank value = keep existing → allowed.
    expect(
      credentialFormError({ isEdit: true, value: "", notes: "" })
    ).toBeNull();
    // Notes repeating the value are refused.
    expect(
      credentialFormError({
        isEdit: false,
        value: "real-value-123",
        notes: "real-value-123",
      })
    ).toMatch(/repeats the credential value/);
    expect(
      credentialFormError({
        isEdit: false,
        value: "real-value-123",
        notes: "issued by provider",
      })
    ).toBeNull();
  });

  it("secret-kind labelling covers the secret kinds only", () => {
    expect(isSecretCredentialKind("client_secret")).toBe(true);
    expect(isSecretCredentialKind("api_key")).toBe(true);
    expect(isSecretCredentialKind("oauth_client_id")).toBe(false);
    expect(DEMO_CREDENTIAL_NOTICE).toContain("demo mode");
  });
});

// ── Status vocabulary + guarded transitions ─────────────────────────────────

describe("status display + confirm flow", () => {
  it("has a display label for every stored status", () => {
    for (const status of [
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
    ] as const) {
      expect(HUB_STATUS_META[status].label.length).toBeGreaterThan(0);
      expect(HUB_STATUS_META[status].hint.length).toBeGreaterThan(0);
    }
    // The stored `in_review` state is never presented as approved/live.
    expect(HUB_STATUS_META.in_review.label).toBe("In review");
  });

  it("requires explicit confirmation exactly for approved/live", () => {
    expect(statusChangeNeedsConfirm("approved")).toBe(true);
    expect(statusChangeNeedsConfirm("live")).toBe(true);
    expect(statusChangeNeedsConfirm("configuring")).toBe(false);
    expect(statusChangeNeedsConfirm("submitted")).toBe(false);
    expect(statusChangeNeedsConfirm("paused")).toBe(false);
  });

  it("builds the PUT body the Stage B guard expects", () => {
    expect(buildStatusUpdateBody("live", true)).toEqual({
      status: "live",
      confirm_status_change: true,
    });
    expect(buildStatusUpdateBody("live", false)).toEqual({ status: "live" });
    expect(buildStatusUpdateBody("configuring", true)).toEqual({
      status: "configuring",
    });
  });
});

// ── Completeness + expiry ───────────────────────────────────────────────────

describe("overview completeness", () => {
  const item: HubOverviewItemView = {
    integration: fixtureIntegration(),
    credential_count: 3,
    credentials_by_environment: { production: 2, test: 1 },
    expired_credentials: 1,
    nearest_expiry: "2026-12-01T00:00:00.000Z",
    checklist: {
      total: 4,
      done: 1,
      blocked: 1,
      in_progress: 1,
      not_applicable: 0,
      todo: 1,
      percent_done: 25,
    },
    document_count: 2,
    test_account_count: 1,
  };

  it("computes labels and warnings from API fields only", () => {
    const c = integrationCompleteness(item);
    expect(c.credentialsLabel).toBe("3 credentials stored");
    expect(c.checklistPercent).toBe(25);
    expect(c.warnings).toContain("1 expired credential");
    expect(c.warnings).toContain("1 blocked checklist item");
    expect(c.warnings).toContain(
      "Not verified yet — configuration incomplete"
    );
  });

  it("expiry states: expired / expiring soon / fine", () => {
    const now = Date.parse("2026-10-22T00:00:00.000Z");
    expect(
      credentialExpiryState(
        fixtureCredential({ expires_at: "2026-10-01T00:00:00.000Z" }),
        now
      )
    ).toBe("expired");
    expect(
      credentialExpiryState(
        fixtureCredential({ expires_at: "2026-11-01T00:00:00.000Z" }),
        now
      )
    ).toBe("expiring_soon");
    expect(
      credentialExpiryState(
        fixtureCredential({ expires_at: "2027-06-01T00:00:00.000Z" }),
        now
      )
    ).toBeNull();
    expect(
      credentialExpiryState(
        fixtureCredential({ status: "expired", expires_at: null }),
        now
      )
    ).toBe("expired");
  });
});

// ── Metadata readers ────────────────────────────────────────────────────────

describe("metadata readers", () => {
  it("parses endpoints/tools/scopes and drops malformed entries", () => {
    const metadata = {
      endpoints: [
        { label: "MCP", url: "https://example.com/mcp", method: "POST" },
        { label: "missing url" },
        "junk",
      ],
      tool_inventory: [{ name: "brr.find_business", scope: "businesses:read" }],
      scopes: ["businesses:read", 42, "reports:read"],
    };
    expect(metaEndpoints(metadata)).toHaveLength(1);
    expect(metaTools(metadata)[0]!.name).toBe("brr.find_business");
    expect(metaScopes(metadata)).toEqual(["businesses:read", "reports:read"]);
  });
});

// ── Audit filter ────────────────────────────────────────────────────────────

describe("audit history filter", () => {
  const entry = (patch: Partial<AuditEntry>): AuditEntry => ({
    id: "a1",
    actor: "admin@example.com",
    action: "HUB_CREDENTIAL_REVEAL",
    resource: "hub:bizreviewradar",
    details: "Revealed credential ‘X’ on bizreviewradar.",
    created_at: "2026-10-22T00:00:00.000Z",
    ...patch,
  });

  it("keeps this integration's rows and its credentials' rows only", () => {
    expect(
      isHubAuditForIntegration(entry({}), "bizreviewradar", ["cred-1"])
    ).toBe(true);
    expect(
      isHubAuditForIntegration(
        entry({
          resource: "hub:credential:cred-1",
          details: "Copied credential value for bizreviewradar.",
        }),
        "bizreviewradar",
        ["cred-1"]
      )
    ).toBe(true);
    expect(
      isHubAuditForIntegration(
        entry({ resource: "hub:other-integration", details: "Other." }),
        "bizreviewradar",
        ["cred-1"]
      )
    ).toBe(false);
    expect(
      isHubAuditForIntegration(
        entry({ action: "USER_ROLE_CHANGED" }),
        "bizreviewradar",
        ["cred-1"]
      )
    ).toBe(false);
    expect(
      isHubAuditForIntegration(
        entry({ resource: null, details: "Unrelated note." }),
        "bizreviewradar",
        []
      )
    ).toBe(false);
  });

  it("has a friendly label for every HUB_* action Stage B writes", () => {
    for (const action of [
      "HUB_INTEGRATION_CREATE",
      "HUB_STATUS_CHANGE",
      "HUB_CREDENTIAL_REVEAL",
      "HUB_CREDENTIAL_COPY",
      "HUB_CREDENTIAL_ROTATE",
      "HUB_COPY_PACKAGE_GENERATE",
      "HUB_CHECKLIST_UPDATE",
      "HUB_DOCUMENT_CREATE",
    ]) {
      expect(HUB_AUDIT_ACTION_LABELS[action]).toBeDefined();
    }
  });
});

// ── Clipboard helper ────────────────────────────────────────────────────────

describe("copyTextToClipboard", () => {
  it("reports success only when a write actually succeeds", async () => {
    await expect(
      copyTextToClipboard("hello", { writeText: vi.fn(async () => {}) })
    ).resolves.toBe(true);
    await expect(
      copyTextToClipboard("hello", {
        writeText: vi.fn(async () => {
          throw new Error("denied");
        }),
        legacyCopy: () => true,
      })
    ).resolves.toBe(true);
    await expect(
      copyTextToClipboard("hello", {
        writeText: vi.fn(async () => {
          throw new Error("denied");
        }),
        legacyCopy: () => false,
      })
    ).resolves.toBe(false);
    await expect(
      copyTextToClipboard("", { writeText: vi.fn(async () => {}) })
    ).resolves.toBe(false);
  });
});
