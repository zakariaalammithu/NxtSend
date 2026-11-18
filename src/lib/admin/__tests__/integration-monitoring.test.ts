/**
 * Provider integration monitoring tests (Wave 2, Phase 2).
 *
 * Pure aggregation + disable-flag helpers only — no network, no
 * database. The live reads are thin Supabase selects over the same
 * shapes exercised here; the route gate (super_admin) is covered by
 * the server-auth suite.
 */

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AUDIT_PREFIX_BY_PROVIDER,
  PROVIDER_GROUPS,
  assertProviderEnabled,
  auditNoteForProvider,
  demoMonitoringOverview,
  findDisabledFlag,
  summarizeAuditRows,
  summarizeConnectionRows,
  summarizeDeliveryRows,
  summarizeSyncJobRows,
  summarizeUsageRows,
  validateDisableToggle,
} from "../integration-monitoring";
import { PROVIDER_DEFINITIONS } from "@/lib/integrations/providers/registry";

const NOW = Date.parse("2026-11-19T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function fakeAdmin(rows: Record<string, unknown>[] | null, error: { message: string } | null = null) {
  return {
    from: () => ({
      select: async () => ({ data: rows, error }),
    }),
  } as unknown as SupabaseClient;
}

describe("PROVIDER_GROUPS", () => {
  it("covers every registry provider exactly once", () => {
    const grouped = PROVIDER_GROUPS.flatMap((g) => g.providers.map((p) => p.id));
    expect(grouped.sort()).toEqual(PROVIDER_DEFINITIONS.map((p) => p.id).sort());
    expect(new Set(grouped).size).toBe(PROVIDER_DEFINITIONS.length);
  });

  it("has 69 providers and a page slug per group", () => {
    expect(PROVIDER_DEFINITIONS.length).toBe(69);
    expect(PROVIDER_GROUPS.map((g) => g.slug).sort()).toEqual([
      "ai",
      "automation",
      "communication",
      "crm",
      "email-outreach",
      "enrichment",
      "productivity",
      "verification",
    ]);
  });
});

describe("audit prefixes", () => {
  it("tracks Muse + the six REST platforms only", () => {
    expect(Object.keys(AUDIT_PREFIX_BY_PROVIDER).sort()).toEqual([
      "activepieces",
      "albato",
      "make",
      "muse",
      "n8n",
      "pabbly",
      "zapier",
    ]);
  });

  it("says honestly why ChatGPT/Claude have no per-provider audit split", () => {
    expect(auditNoteForProvider("chatgpt")).toMatch(/muse\.tool\.\*/);
    expect(auditNoteForProvider("claude")).toMatch(/muse\.tool\.\*/);
    expect(auditNoteForProvider("zapier")).toBeNull();
    expect(auditNoteForProvider("hubspot")).toMatch(/do not write audit/);
  });
});

describe("summarizeAuditRows", () => {
  const rows = [
    {
      action: "zapier.lead_created",
      resource: "zapier:lead:1",
      metadata: { details: "Lead created." },
      created_at: new Date(NOW - 2 * HOUR).toISOString(),
    },
    {
      action: "zapier.reply_sent",
      resource: "zapier:reply:1",
      metadata: { details: "Reply failed (provider error)." },
      created_at: new Date(NOW - 2 * HOUR).toISOString(),
    },
    {
      action: "zapier.lead_updated",
      resource: "zapier:lead:2",
      metadata: { details: "Lead updated." },
      created_at: new Date(NOW - 3 * 24 * HOUR).toISOString(),
    },
    {
      action: "n8n.lead_created",
      resource: "n8n:lead:1",
      metadata: { details: "Lead created." },
      created_at: new Date(NOW - HOUR).toISOString(),
    },
    {
      action: "zapier.lead_created",
      resource: "zapier:lead:3",
      metadata: { details: "Lead created." },
      created_at: new Date(NOW - 10 * 24 * HOUR).toISOString(),
    },
  ];

  it("splits 24h / 7d and counts text-matched errors, ignoring other prefixes and stale rows", () => {
    const out = summarizeAuditRows(rows, "zapier.", NOW);
    expect(out.calls7d).toBe(3);
    expect(out.calls24h).toBe(2);
    expect(out.errors7d).toBe(1);
    expect(out.errors24h).toBe(1);
    expect(out.recent).toHaveLength(3);
    expect(out.recent[0].action).toBe("zapier.lead_created");
  });
});

describe("summarizeConnectionRows", () => {
  it("counts connected workspaces distinctly and surfaces error state", () => {
    const out = summarizeConnectionRows([
      { workspace_id: "ws-1", provider: "hubspot", status: "connected", last_sync_at: "2026-11-19T10:00:00.000Z", last_error: null, created_at: "2026-11-01T00:00:00.000Z", updated_at: "2026-11-19T10:00:00.000Z" },
      { workspace_id: "ws-1", provider: "hubspot", status: "connected", last_sync_at: null, last_error: null, created_at: "2026-11-01T00:00:00.000Z", updated_at: "2026-11-19T10:00:00.000Z" },
      { workspace_id: "ws-2", provider: "hubspot", status: "error", last_sync_at: null, last_error: "Token expired", created_at: "2026-11-01T00:00:00.000Z", updated_at: "2026-11-19T10:00:00.000Z" },
    ]);
    // Two rows share ws-1, so distinct connected workspaces = 1.
    expect(out.connectedWorkspaces).toBe(1);
    expect(out.connectionCount).toBe(3);
    expect(out.connectionsByStatus).toEqual({ connected: 2, error: 1 });
    expect(out.errorConnections).toBe(1);
    expect(out.lastError).toBe("Token expired");
    expect(out.lastSyncAt).toBe("2026-11-19T10:00:00.000Z");
  });

  it("never carries credential material in the public shape", () => {
    const out = summarizeConnectionRows([
      { workspace_id: "ws-1", provider: "hubspot", status: "connected", encrypted_credentials: "v1.secret-blob", last_sync_at: null, last_error: null, created_at: "", updated_at: "" },
    ]);
    expect(JSON.stringify(out)).not.toContain("secret-blob");
    expect(JSON.stringify(out)).not.toContain("encrypted_credentials");
  });
});

describe("summarizeSyncJobRows", () => {
  it("counts 7d outcomes and keeps the newest job", () => {
    const out = summarizeSyncJobRows(
      [
        { id: "j1", workspace_id: "ws-1", provider: "hubspot", direction: "import", status: "completed", processed: 10, created_count: 8, updated_count: 2, skipped_count: 0, failed_count: 0, errors: [], created_at: new Date(NOW - HOUR).toISOString(), finished_at: new Date(NOW).toISOString() },
        { id: "j2", workspace_id: "ws-1", provider: "hubspot", direction: "export", status: "failed", processed: 5, created_count: 0, updated_count: 0, skipped_count: 0, failed_count: 5, errors: ["timeout"], created_at: new Date(NOW - 2 * HOUR).toISOString(), finished_at: new Date(NOW).toISOString() },
        { id: "j3", workspace_id: "ws-1", provider: "hubspot", direction: "import", status: "completed", processed: 1, created_count: 1, updated_count: 0, skipped_count: 0, failed_count: 0, errors: [], created_at: new Date(NOW - 9 * 24 * HOUR).toISOString(), finished_at: null },
      ],
      NOW
    );
    expect(out.total).toBe(2);
    expect(out.completed).toBe(1);
    expect(out.failed).toBe(1);
    expect(out.lastJob?.id).toBe("j1");
  });
});

describe("summarizeDeliveryRows", () => {
  it("counts statuses and keeps failed/dead failures", () => {
    const out = summarizeDeliveryRows([
      { id: "d1", event: "lead.created", subscription_id: "s1", status: "delivered", attempts: 1, max_attempts: 3, last_error: null, next_retry_at: null, created_at: "" },
      { id: "d2", event: "lead.created", subscription_id: "s1", status: "dead", attempts: 3, max_attempts: 3, last_error: "410 Gone", next_retry_at: null, created_at: "" },
      { id: "d3", event: "lead.created", subscription_id: "s1", status: "pending", attempts: 0, max_attempts: 3, last_error: null, next_retry_at: null, created_at: "" },
    ]);
    expect(out.counts).toEqual({ pending: 1, delivered: 1, failed: 0, dead: 1 });
    expect(out.recentFailures.map((d) => d.id)).toEqual(["d2"]);
  });
});

describe("summarizeUsageRows", () => {
  it("sums credits in the 7d window only", () => {
    const out = summarizeUsageRows(
      [
        { provider: "hubspot", event: "sync", credits_used: 3, recorded_at: new Date(NOW - HOUR).toISOString() },
        { provider: "hubspot", event: "sync", credits_used: 2, recorded_at: new Date(NOW - 9 * 24 * HOUR).toISOString() },
      ],
      NOW
    );
    expect(out.events).toBe(1);
    expect(out.credits).toBe(3);
  });
});

describe("validateDisableToggle", () => {
  it("accepts a boolean + optional reason, rejects the rest", () => {
    expect(validateDisableToggle({ disabled: true, reason: "abuse" })).toEqual({
      ok: true,
      disabled: true,
      reason: "abuse",
    });
    expect(validateDisableToggle({ disabled: false })).toEqual({
      ok: true,
      disabled: false,
      reason: null,
    });
    expect(validateDisableToggle({ disabled: "yes" }).ok).toBe(false);
    expect(validateDisableToggle({}).ok).toBe(false);
    expect(validateDisableToggle(null).ok).toBe(false);
    expect(validateDisableToggle({ disabled: true, reason: "x".repeat(501) }).ok).toBe(false);
  });
});

describe("disable flags", () => {
  it("finds only enabled flags for the provider", () => {
    const flags = [
      { provider: "hubspot", disabled: true, disabledBy: "admin-1", disabledAt: "2026-11-19T00:00:00.000Z", reason: "abuse" },
      { provider: "salesforce", disabled: false, disabledBy: null, disabledAt: null, reason: null },
    ];
    expect(findDisabledFlag(flags, "hubspot")?.reason).toBe("abuse");
    expect(findDisabledFlag(flags, "salesforce")).toBeNull();
    expect(findDisabledFlag(flags, "pipedrive")).toBeNull();
  });

  it("assertProviderEnabled throws for a disabled provider", async () => {
    const admin = fakeAdmin([
      { provider: "hubspot", disabled: true, disabled_by: "admin-1", disabled_at: "2026-11-19T00:00:00.000Z", reason: "abuse" },
    ]);
    await expect(assertProviderEnabled(admin, "hubspot")).rejects.toThrow(/disabled by a platform administrator/);
    await expect(assertProviderEnabled(admin, "salesforce")).resolves.toBe(true);
  });

  it("assertProviderEnabled fails open when the flag table cannot be read", async () => {
    const admin = fakeAdmin(null, { message: "relation does not exist" });
    await expect(assertProviderEnabled(admin, "hubspot")).resolves.toBe(true);
  });
});

describe("demoMonitoringOverview", () => {
  it("lists all 69 providers with honest empty values and no credential keys", () => {
    const overview = demoMonitoringOverview();
    expect(overview.providers).toHaveLength(69);
    expect(overview.totals.providers).toBe(69);
    expect(overview.unknownTables).toEqual([]);
    for (const row of overview.providers) {
      // No credential material: no credential-bearing keys, and the
      // encrypted blob / token hash never appear in any value.
      // (authType "api_key" and capability text mentioning tokens
      // are labels, not values — those are fine.)
      expect(Object.keys(row)).not.toContain("encrypted_credentials");
      expect(JSON.stringify(row)).not.toContain("encrypted_credentials");
      expect(JSON.stringify(row)).not.toContain("token_hash");
      expect(row.apiCalls7d).toBe(row.auditTracked ? 0 : null);
      if (row.webhookTracked) {
        expect(row.deliveryCounts).toEqual({ pending: 0, delivered: 0, failed: 0, dead: 0 });
      } else {
        expect(row.deliveryCounts).toBeNull();
      }
    }
  });
});
