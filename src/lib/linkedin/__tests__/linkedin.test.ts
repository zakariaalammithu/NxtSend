/**
 * P5 Stage F — LinkedIn provider seam, page derivations, account
 * health, migration 013, and the /dashboard/linkedin mock-freedom
 * guarantees.
 *
 * The properties that matter most here are negative ones:
 *   - the provider state NEVER becomes "connected" in this build —
 *     not even with plausible credentials present;
 *   - the NotConfigured adapter never reports a send as successful
 *     and never claims a live health check;
 *   - the LinkedIn page module contains no mock import and none of
 *     the old hard-coded KPI strings.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createLinkedInAdapter,
  NotConfiguredLinkedInAdapter,
  describeLinkedInProvider,
  getLinkedInProviderState,
  isLinkedInCredentialsPresent,
} from "../index";
import {
  accountHealthActionHref,
  accountHealthView,
} from "../health";
import {
  buildLinkedInActivity,
  filterLinkedInCampaigns,
  isLinkedInStepType,
  linkedInStepsOf,
  summarizeLinkedInExecutions,
} from "../activity";
import { createMemoryStorage, setDemoStorage } from "@/lib/data/demo-store";
import {
  createAccountsRepository,
  seedDemoAccounts,
  DEMO_LINKEDIN_ACCOUNT_ID,
} from "@/lib/data/accounts";
import { DEMO_WORKSPACE_ID } from "@/lib/data/workspace";
import type { Campaign, CampaignStep, Lead } from "@/types";
import type { StepExecutionRecord } from "@/lib/executor/types";

const REAL_ENV = {
  LINKEDIN_PROVIDER: "partnerapi",
  LINKEDIN_PROVIDER_API_KEY: "pk_live_abc123xyz",
};

// ── Provider state ────────────────────────────────────────────────────────

describe("LinkedIn provider state derivation", () => {
  it("is demo in Demo Mode regardless of env", () => {
    expect(getLinkedInProviderState(REAL_ENV, "demo")).toBe("demo");
    expect(getLinkedInProviderState({}, "demo")).toBe("demo");
  });

  it("is Configuration Required live with nothing set", () => {
    expect(getLinkedInProviderState({}, "supabase")).toBe(
      "configuration_required"
    );
    const d = describeLinkedInProvider({}, "supabase");
    expect(d.credentialsPresent).toBe(false);
    expect(d.message).toContain("approved provider required");
    expect(d.message).toContain("LINKEDIN_PROVIDER_API_KEY");
  });

  it("never becomes connected — even with plausible credentials present", () => {
    expect(getLinkedInProviderState(REAL_ENV, "supabase")).toBe(
      "configuration_required"
    );
    expect(isLinkedInCredentialsPresent(REAL_ENV)).toBe(true);
    const d = describeLinkedInProvider(REAL_ENV, "supabase");
    expect(d.credentialsPresent).toBe(true);
    expect(d.providerName).toBe("partnerapi");
    // The operator who already procured a provider is told the
    // adapter is the missing piece — not sent back to buy again.
    expect(d.message).toContain("no adapter for an approved LinkedIn provider is implemented yet");
    expect(d.message).toContain("connect nothing");
  });

  it("treats placeholder credentials as absent", () => {
    expect(
      isLinkedInCredentialsPresent({
        LINKEDIN_PROVIDER: "your_linkedin_provider_name",
        LINKEDIN_PROVIDER_API_KEY: "your_linkedin_provider_api_key",
      })
    ).toBe(false);
    expect(
      isLinkedInCredentialsPresent({ LINKEDIN_PROVIDER: "partnerapi" })
    ).toBe(false);
  });
});

// ── NotConfigured adapter ─────────────────────────────────────────────────

describe("NotConfiguredLinkedInAdapter", () => {
  it("is what the factory returns, and its state matches the derivation", () => {
    const adapter = createLinkedInAdapter();
    expect(adapter).toBeInstanceOf(NotConfiguredLinkedInAdapter);
    expect(adapter.getState()).toBe("demo"); // test env has no Supabase
    const live = new NotConfiguredLinkedInAdapter({
      env: REAL_ENV,
      mode: "supabase",
    });
    expect(live.getState()).toBe("configuration_required");
  });

  it("refuses sends honestly — never ok, never a provider id", async () => {
    const adapter = new NotConfiguredLinkedInAdapter({
      env: REAL_ENV,
      mode: "supabase",
    });
    const msg = await adapter.sendMessage({
      accountId: "acc_1",
      leadId: "lead_1",
      body: "hello",
    });
    expect(msg.ok).toBe(false);
    if (!msg.ok) {
      expect(msg.code).toBe("provider_not_configured");
      expect(msg.state).toBe("configuration_required");
      expect(msg.message).toContain("no adapter for an approved LinkedIn provider");
    }
    const req = await adapter.sendConnectionRequest({
      accountId: "acc_1",
      leadId: "lead_1",
    });
    expect(req.ok).toBe(false);
    if (!req.ok) expect(req.code).toBe("provider_not_configured");
  });

  it("health is the stored record, explicitly not a live check", async () => {
    const adapter = new NotConfiguredLinkedInAdapter({ mode: "supabase", env: {} });
    const health = await adapter.getAccountHealth({
      id: "acc_1",
      provider_account_id: "prov_123",
      auth_status: "needs_reconnect",
      last_sync_at: "2026-01-01T00:00:00.000Z",
      last_error: null,
    });
    expect(health.authStatus).toBe("needs_reconnect");
    expect(health.lastSyncAt).toBe("2026-01-01T00:00:00.000Z");
    expect(health.verifiedLive).toBe(false);
    expect(health.detail).toContain("last recorded");
  });
});

// ── Page derivations ──────────────────────────────────────────────────────

function campaign(partial: Partial<Campaign>): Campaign {
  return {
    id: "cmp_x",
    workspace_id: DEMO_WORKSPACE_ID,
    name: "Campaign",
    type: "linkedin",
    status: "active",
    created_by: "usr",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function step(partial: Partial<CampaignStep>): CampaignStep {
  return {
    id: "step_x",
    campaign_id: "cmp_x",
    step_order: 1,
    step_type: "connection_request",
    delay_hours: 0,
    subject: "",
    content: "",
    config: {},
    ...partial,
  };
}

function execution(
  partial: Partial<StepExecutionRecord>
): StepExecutionRecord {
  return {
    id: "exec_x",
    workspace_id: DEMO_WORKSPACE_ID,
    campaign_id: "cmp_x",
    enrollment_id: "enr_x",
    lead_id: "lead_x",
    step_order: 1,
    step_type: "connection_request",
    channel: "linkedin",
    status: "skipped",
    detail: "Skipped: no authorized LinkedIn provider is integrated.",
    message_id: null,
    provider: null,
    provider_message_id: null,
    idempotency_key: "enr_x:1",
    simulated: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("LinkedIn page derivations", () => {
  it("classifies step types by channel", () => {
    for (const t of [
      "connection_request",
      "linkedin_message",
      "like_post",
      "view_profile",
      "endorse_skills",
    ]) {
      expect(isLinkedInStepType(t)).toBe(true);
    }
    for (const t of ["email", "wait", "condition"]) {
      expect(isLinkedInStepType(t)).toBe(false);
    }
  });

  it("qualifies campaigns by their sequence, not their label alone", () => {
    const withLi = campaign({ id: "cmp_li", type: "linkedin" });
    const mixedLi = campaign({ id: "cmp_mixed", type: "mixed" });
    const liNoSteps = campaign({ id: "cmp_bare", type: "linkedin" });
    const emailWithLiSteps = campaign({ id: "cmp_email", type: "email" });
    const steps = new Map<string, CampaignStep[]>([
      ["cmp_li", [step({ step_type: "connection_request" })]],
      ["cmp_mixed", [step({ step_type: "email" }), step({ step_type: "like_post" })]],
      ["cmp_bare", [step({ step_type: "wait" })]],
      ["cmp_email", [step({ step_type: "linkedin_message" })]],
    ]);
    const out = filterLinkedInCampaigns(
      [withLi, mixedLi, liNoSteps, emailWithLiSteps],
      steps
    );
    expect(out.map((c) => c.id)).toEqual(["cmp_li", "cmp_mixed"]);
    expect(linkedInStepsOf(steps.get("cmp_mixed")!)).toHaveLength(1);
  });

  it("summarizes only LinkedIn-channel executions, by recorded outcome", () => {
    const summary = summarizeLinkedInExecutions([
      execution({ id: "e1", status: "skipped" }),
      execution({ id: "e2", status: "skipped" }),
      execution({ id: "e3", status: "failed" }),
      execution({ id: "e4", status: "sent" }),
      execution({ id: "e5", channel: "email", status: "sent" }),
    ]);
    expect(summary).toEqual({
      total: 4,
      sent: 1,
      skipped: 2,
      failed: 1,
      stopped: 0,
      executed: 0,
      simulated: 0,
    });
    // The seeded reality today: everything skipped, sent a real 0.
    const today = summarizeLinkedInExecutions([execution({})]);
    expect(today.sent).toBe(0);
    expect(today.skipped).toBe(1);
  });

  it("builds activity rows newest-first with names, labels and fallbacks", () => {
    const campaigns = new Map<string, Campaign>([
      ["cmp_li", campaign({ id: "cmp_li", name: "Founders Outreach" })],
    ]);
    const leads = new Map<string, Lead>([
      [
        "lead_a",
        {
          id: "lead_a",
          workspace_id: DEMO_WORKSPACE_ID,
          first_name: "Sarah",
          last_name: "Jenkins",
          email: "sarah@example.com",
          linkedin_url: "",
          company: "Stripe",
          job_title: "Head of Growth",
          status: "new",
          tags: [],
          custom_fields: {},
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    ]);
    const rows = buildLinkedInActivity(
      [
        execution({
          id: "old",
          created_at: "2026-01-01T00:00:00.000Z",
          campaign_id: "cmp_li",
          lead_id: "lead_a",
        }),
        execution({
          id: "new",
          created_at: "2026-01-03T00:00:00.000Z",
          campaign_id: "cmp_gone",
          lead_id: "lead_gone",
          step_type: "linkedin_message",
        }),
        execution({ id: "email-row", channel: "email", status: "sent" }),
      ],
      campaigns,
      leads,
      25
    );
    expect(rows.map((r) => r.id)).toEqual(["new", "old"]);
    expect(rows[0].campaignName).toBe("Deleted campaign");
    expect(rows[0].leadName).toBe("Unknown lead");
    expect(rows[0].stepTypeLabel).toBe("LinkedIn message");
    expect(rows[1].campaignName).toBe("Founders Outreach");
    expect(rows[1].leadName).toBe("Sarah Jenkins");
    expect(rows[1].status).toBe("skipped");
    expect(rows[1].detail).toContain("no authorized LinkedIn provider");
  });
});

// ── Account health presentation ───────────────────────────────────────────

describe("accountHealthView", () => {
  const base = { last_sync_at: null, last_error: null };

  it("ok → Authorized, no action", () => {
    const v = accountHealthView({ ...base, auth_status: "ok" });
    expect(v.label).toBe("Authorized");
    expect(v.tone).toBe("ok");
    expect(v.action).toBe("none");
  });

  it("needs_reconnect / expired → Reconnect action", () => {
    for (const s of ["needs_reconnect", "expired"] as const) {
      const v = accountHealthView({ ...base, auth_status: s });
      expect(v.action).toBe("reconnect");
      expect(v.actionLabel).toBe("Reconnect");
      expect(v.tone).toBe("warning");
    }
  });

  it("error → Review action, provider error text surfaced verbatim", () => {
    const v = accountHealthView({
      auth_status: "error",
      last_sync_at: null,
      last_error: "Provider said: token revoked",
    });
    expect(v.action).toBe("review");
    expect(v.tone).toBe("error");
    expect(v.description).toContain("token revoked");
  });

  it("not_connected → muted, routes to the integration", () => {
    const v = accountHealthView({ ...base, auth_status: "not_connected" });
    expect(v.tone).toBe("muted");
    expect(v.action).toBe("review");
    expect(accountHealthActionHref("linkedin")).toBe(
      "/dashboard/integrations/linkedin"
    );
    expect(accountHealthActionHref("email")).toBe(
      "/dashboard/integrations/resend"
    );
  });
});

// ── Migration 013 fields on the accounts repository ───────────────────────

describe("connected_accounts provider-health fields (migration 013)", () => {
  beforeEach(() => {
    setDemoStorage(createMemoryStorage());
  });

  it("the demo LinkedIn seed: record ok, no provider id, never synced", () => {
    const [linkedin] = seedDemoAccounts();
    expect(linkedin.id).toBe(DEMO_LINKEDIN_ACCOUNT_ID);
    expect(linkedin.auth_status).toBe("ok");
    expect(linkedin.provider_account_id).toBeNull();
    expect(linkedin.last_sync_at).toBeNull();
    expect(linkedin.last_error).toBeNull();
  });

  it("new records default to not_connected; health fields round-trip on update", async () => {
    const repo = createAccountsRepository("demo");
    const created = await repo.createAccount(DEMO_WORKSPACE_ID, {
      channel: "linkedin",
      provider: "partnerapi",
      display_name: "Future Sender",
      handle_or_email: "linkedin.com/in/future",
    });
    expect(created.auth_status).toBe("not_connected");
    expect(created.provider_account_id).toBeNull();

    const updated = await repo.updateAccount(created.id, {
      provider_account_id: "prov_42",
      auth_status: "needs_reconnect",
      last_sync_at: "2026-02-01T10:00:00.000Z",
      last_error: "Session expired at provider",
    });
    expect(updated.provider_account_id).toBe("prov_42");
    expect(updated.auth_status).toBe("needs_reconnect");
    expect(updated.last_sync_at).toBe("2026-02-01T10:00:00.000Z");
    expect(updated.last_error).toBe("Session expired at provider");
  });

  it("migration 013 adds exactly the four columns with the auth CHECK + backfill", () => {
    const sql = readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/013_connected_account_provider_health.sql"
      ),
      "utf8"
    );
    for (const col of [
      "provider_account_id",
      "auth_status",
      "last_sync_at",
      "last_error",
    ]) {
      expect(sql).toContain(col);
    }
    expect(sql).toContain("ALTER TABLE connected_accounts");
    for (const value of [
      "'ok'",
      "'needs_reconnect'",
      "'expired'",
      "'error'",
      "'not_connected'",
    ]) {
      expect(sql).toContain(value);
    }
    // Backfill: only rows already marked connected start at ok.
    expect(sql).toContain("status = 'connected'");
    expect(sql).toContain("SET auth_status = 'ok'");
  });
});

// ── The page module is mock-free ──────────────────────────────────────────

describe("/dashboard/linkedin page module", () => {
  const pageSource = readFileSync(
    path.resolve(
      process.cwd(),
      "src/app/(dashboard)/dashboard/linkedin/page.tsx"
    ),
    "utf8"
  );

  it("imports no mock data and none of the old hard-coded strings survive", () => {
    expect(pageSource).not.toContain("MOCK_");
    expect(pageSource).not.toContain("@/lib/db/mock");
    for (const stale of [
      "18 / 50",
      "41.2%",
      "84 leads enrolled",
      "Active Session",
      "Residential US-West",
      "Simulated Account",
      "industry benchmark",
      "Profile Health",
    ]) {
      expect(pageSource).not.toContain(stale);
    }
  });

  it("reads from the data layer + the LinkedIn seam instead", () => {
    expect(pageSource).toContain("getCampaignsRepository");
    expect(pageSource).toContain("getAccountsRepository");
    expect(pageSource).toContain("loadCampaignExecutions");
    expect(pageSource).toContain("@/lib/linkedin");
  });

  it("the legacy LinkedIn stub is gone — one seam only", () => {
    const legacyIndex = readFileSync(
      path.resolve(process.cwd(), "src/lib/integrations/index.ts"),
      "utf8"
    );
    expect(legacyIndex).not.toContain("LiveLinkedInStub");
    expect(legacyIndex).not.toContain("getLinkedInAdapter");
    const legacyTypes = readFileSync(
      path.resolve(process.cwd(), "src/lib/integrations/types.ts"),
      "utf8"
    );
    expect(legacyTypes).not.toContain("interface LinkedInAdapter");
  });
});
