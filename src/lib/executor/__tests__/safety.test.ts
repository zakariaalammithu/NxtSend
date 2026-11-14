/**
 * Safe-sending gate tests — pure cap/window logic plus the executor
 * gate wired into core.ts, with a fake store + injected clock.
 *
 * The fake's safety counter mirrors the DEMO counting rule
 * (dispatch attempts): it reports base counts PLUS this store's
 * completed LinkedIn connection-request claims, so a second scan
 * sees the first scan's dispatches exactly like the real stores do.
 */

import { describe, it, expect } from "vitest";
import { executeDueSteps } from "../core";
import {
  describeWorkingWindow,
  effectiveConnectionCap,
  evaluateSafetyGate,
  isWithinWorkingWindow,
} from "../safety";
import type {
  ClaimStepExecutionInput,
  ExecutorCampaign,
  ExecutorEnrollment,
  ExecutorStore,
  StepExecutionRecord,
} from "../types";
import type { CampaignStep, Lead, PlanType, WarmupHistoryEntry } from "@/types";
import type { InboxMessage, InsertMessageInput } from "@/lib/data/inbox";
import type {
  EmailProviderAdapter,
  SendEmailInput,
  SendEmailResult,
} from "@/lib/email/types";
import type { ProviderState } from "@/lib/env";
import {
  defaultSafetySettings,
  type SafetySettings,
} from "@/lib/data/safety-settings";
import {
  emptyWarmupUsage,
  startTransition,
  type AccountWarmupState,
  type WarmupProgramPatch,
  type WarmupUsageCounts,
} from "@/lib/linkedin/warmup";
import { DEFAULT_WARMUP_LIMITS } from "@/lib/data/audience-source";

const WS = "ws_1";
// Monday 2026-10-19, 10:00 UTC — inside the default 09:00–18:00 Mon–Fri window.
const NOW = new Date("2026-10-19T10:00:00.000Z");
const MONDAY_07 = new Date("2026-10-19T07:00:00.000Z");
const SATURDAY_10 = new Date("2026-10-17T10:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const ACCOUNT = "acc_li";

const DEFAULTS = defaultSafetySettings(WS);

function settings(partial: Partial<SafetySettings> = {}): SafetySettings {
  return { ...DEFAULTS, ...partial };
}

function makeLead(id: string): Lead {
  return {
    id,
    workspace_id: WS,
    first_name: "Sarah",
    last_name: "Chen",
    email: `${id}@acme.test`,
    company: "Acme",
    job_title: "VP Sales",
    status: "new",
    tags: [],
    custom_fields: {},
    created_at: hoursAgo(100),
  };
}

function makeStep(partial: Partial<CampaignStep> = {}): CampaignStep {
  return {
    id: "step_1",
    campaign_id: "camp_1",
    step_order: 0,
    step_type: "connection_request",
    delay_hours: 0,
    subject: "",
    content: "",
    config: {},
    ...partial,
  };
}

function warmingState(): AccountWarmupState {
  const t = startTransition("conservative", NOW, null);
  return {
    accountId: ACCOUNT,
    displayName: "Alex Vance",
    enabled: true,
    status: "warming",
    preset: "conservative",
    schedule: t.patch.schedule ?? null,
    overrides: null,
    startedAt: NOW.toISOString(),
    pausedAt: null,
    pausedMs: 0,
    graduatedAt: null,
    dailyLimits: { ...DEFAULT_WARMUP_LIMITS },
    history: [t.entry],
  };
}

class FakeAdapter implements EmailProviderAdapter {
  readonly provider = "fake-provider";
  calls: SendEmailInput[] = [];
  getState(): ProviderState {
    return "connected";
  }
  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    this.calls.push(input);
    return {
      status: "sent",
      provider: "fake-provider",
      providerMessageId: "provider_msg_1",
      message: "Email accepted by provider (message ID provider_msg_1).",
    };
  }
}

class FakeStore implements ExecutorStore {
  readonly simulated = false;
  enrollments: ExecutorEnrollment[] = [];
  campaigns = new Map<string, ExecutorCampaign>();
  stepsByCampaign = new Map<string, CampaignStep[]>();
  leads = new Map<string, Lead>();
  claims = new Map<string, StepExecutionRecord>();
  claimInputs: ClaimStepExecutionInput[] = [];
  activities: Array<{ campaign_id: string | null; action: string; details: string }> = [];
  safetySettings: SafetySettings | null = settings();
  safetyBaseConnections = 0;
  safetySettingsCalls = 0;
  safetyCountCalls = 0;
  warmupState: AccountWarmupState | null = null;
  warmupBaseUsage: WarmupUsageCounts = emptyWarmupUsage();
  private seq = 0;

  async listEnrollments() {
    return this.enrollments;
  }
  async getCampaign(_ws: string, campaignId: string) {
    return this.campaigns.get(campaignId) ?? null;
  }
  async getSteps(campaignId: string) {
    return this.stepsByCampaign.get(campaignId) ?? [];
  }
  async getLead(_ws: string, leadId: string) {
    return this.leads.get(leadId) ?? null;
  }
  async getLeadSignals() {
    return { repliedAt: null, suppressionReason: null };
  }
  async getWorkspacePlan(): Promise<PlanType> {
    return "growth";
  }
  async countEmailsThisMonth() {
    return 0;
  }
  async claimStepExecution(
    input: ClaimStepExecutionInput
  ): Promise<StepExecutionRecord | null> {
    this.claimInputs.push(input);
    if (this.claims.has(input.idempotency_key)) return null;
    const record: StepExecutionRecord = {
      id: `exec_${++this.seq}`,
      workspace_id: input.workspace_id,
      campaign_id: input.campaign_id,
      enrollment_id: input.enrollment_id,
      lead_id: input.lead_id,
      step_order: input.step_order,
      step_type: input.step_type,
      channel: input.channel,
      status: "sending",
      detail: "",
      account_id: input.account_id,
      message_id: null,
      provider: null,
      provider_message_id: null,
      idempotency_key: input.idempotency_key,
      simulated: input.simulated,
      created_at: NOW.toISOString(),
      updated_at: NOW.toISOString(),
    };
    this.claims.set(input.idempotency_key, record);
    return record;
  }
  async completeStepExecution(
    id: string,
    patch: Partial<Pick<StepExecutionRecord, "status" | "detail" | "message_id" | "provider" | "provider_message_id">>
  ) {
    for (const rec of Array.from(this.claims.values())) {
      if (rec.id === id) Object.assign(rec, patch);
    }
  }
  async releaseStepExecution(id: string) {
    for (const [key, rec] of Array.from(this.claims.entries())) {
      if (rec.id === id) this.claims.delete(key);
    }
  }
  async ensureConversation() {
    return "conv_1";
  }
  async insertMessage(
    input: InsertMessageInput & { campaign_id?: string | null }
  ): Promise<InboxMessage> {
    return { id: "msg_1", ...input } as unknown as InboxMessage;
  }
  async updateEnrollment(
    enrollmentId: string,
    patch: { status?: string; current_step?: number; last_step_at?: string | null }
  ) {
    const e = this.enrollments.find((x) => x.id === enrollmentId);
    if (e) Object.assign(e, patch);
  }
  async appendActivity(
    _ws: string,
    entry: { campaign_id: string | null; action: string; details: string }
  ) {
    this.activities.push(entry);
  }

  // ── Safety store surface ───────────────────────────────────────
  async getSafetySettings(_ws: string): Promise<SafetySettings | null> {
    void _ws;
    this.safetySettingsCalls++;
    return this.safetySettings;
  }
  async countLinkedInConnectionsToday(
    _ws: string,
    dayStartIso: string
  ): Promise<number> {
    this.safetyCountCalls++;
    let count = this.safetyBaseConnections;
    for (const rec of Array.from(this.claims.values())) {
      if (rec.channel !== "linkedin") continue;
      if (rec.step_type !== "connection_request") continue;
      if (rec.created_at < dayStartIso) continue;
      if (rec.status === "sending") continue;
      count++;
    }
    return count;
  }

  // ── Warm-up store surface (null state unless a test sets one) ──
  async getAccountWarmupState(_ws: string, accountId: string) {
    return accountId === ACCOUNT ? this.warmupState : null;
  }
  async countLinkedInActionsToday(
    _ws: string,
    accountId: string,
    _dayStartIso: string
  ): Promise<WarmupUsageCounts> {
    void accountId;
    void _dayStartIso;
    return { ...this.warmupBaseUsage };
  }
  async persistWarmupTransition(
    _ws: string,
    _accountId: string,
    _patch: WarmupProgramPatch,
    _entryState: AccountWarmupState,
    _entry: WarmupHistoryEntry
  ) {
    void _ws;
    void _accountId;
    void _patch;
    void _entryState;
    void _entry;
  }
}

function setup(opts: {
  safety?: SafetySettings | null;
  safetyBaseConnections?: number;
  stepType?: CampaignStep["step_type"];
  enrollmentCount?: number;
  warmupState?: AccountWarmupState | null;
  warmupBaseConnections?: number;
} = {}) {
  const store = new FakeStore();
  const campaign: ExecutorCampaign = {
    id: "camp_1",
    workspace_id: WS,
    name: "Safety campaign",
    type: "linkedin",
    status: "active",
    sender_account_id: ACCOUNT,
    email_account_id: "acc_em",
  };
  store.campaigns.set(campaign.id, campaign);
  store.stepsByCampaign.set("camp_1", [
    makeStep({ step_type: opts.stepType ?? "connection_request" }),
  ]);
  const n = opts.enrollmentCount ?? 1;
  for (let i = 1; i <= n; i++) {
    store.leads.set(`lead_${i}`, makeLead(`lead_${i}`));
    store.enrollments.push({
      id: `enr_${i}`,
      workspace_id: WS,
      campaign_id: "camp_1",
      lead_id: `lead_${i}`,
      status: "active",
      current_step: 0,
      // Enrolled Friday, so the (delay 0) step is due at every run
      // time these tests use (Sat 10:00, Mon 07:00, Mon 10:00).
      enrolled_at: "2026-10-16T00:00:00.000Z",
      last_step_at: null,
    });
  }
  if (opts.safety !== undefined) store.safetySettings = opts.safety;
  if (opts.safetyBaseConnections !== undefined) {
    store.safetyBaseConnections = opts.safetyBaseConnections;
  }
  if (opts.warmupState !== undefined) store.warmupState = opts.warmupState;
  if (opts.warmupBaseConnections !== undefined) {
    store.warmupBaseUsage = {
      ...emptyWarmupUsage(),
      connection_requests: opts.warmupBaseConnections,
    };
  }
  return { store, adapter: new FakeAdapter() };
}

const run = (store: FakeStore, adapter: FakeAdapter, now: Date = NOW) =>
  executeDueSteps({ store, adapter, now }, { workspaceId: WS });

describe("effectiveConnectionCap", () => {
  it("is the min of the two caps; a missing account cap leaves the workspace cap", () => {
    expect(effectiveConnectionCap(15, 10)).toBe(10);
    expect(effectiveConnectionCap(10, 20)).toBe(10);
    expect(effectiveConnectionCap(15, null)).toBe(15);
    expect(effectiveConnectionCap(15, undefined)).toBe(15);
    expect(effectiveConnectionCap(15, 0)).toBe(0);
  });
});

describe("isWithinWorkingWindow", () => {
  it("is inside on a working day within [start, end)", () => {
    expect(isWithinWorkingWindow(NOW, DEFAULTS)).toBe(true);
    expect(isWithinWorkingWindow(new Date("2026-10-19T09:00:00.000Z"), DEFAULTS)).toBe(true);
    expect(isWithinWorkingWindow(new Date("2026-10-19T08:59:00.000Z"), DEFAULTS)).toBe(false);
    expect(isWithinWorkingWindow(new Date("2026-10-19T18:00:00.000Z"), DEFAULTS)).toBe(false);
  });

  it("is outside on non-working days", () => {
    expect(isWithinWorkingWindow(SATURDAY_10, DEFAULTS)).toBe(false);
    expect(isWithinWorkingWindow(new Date("2026-10-18T10:00:00.000Z"), DEFAULTS)).toBe(false);
    expect(
      isWithinWorkingWindow(
        SATURDAY_10,
        settings({ working_days: [6, 7] })
      )
    ).toBe(true);
  });

  it("treats end <= start as an empty window, never an overnight window", () => {
    const overnight = settings({
      working_hours_start: "18:00",
      working_hours_end: "09:00",
    });
    expect(isWithinWorkingWindow(NOW, overnight)).toBe(false);
    expect(
      isWithinWorkingWindow(new Date("2026-10-19T22:00:00.000Z"), overnight)
    ).toBe(false);
    expect(
      isWithinWorkingWindow(new Date("2026-10-19T02:00:00.000Z"), overnight)
    ).toBe(false);
    const zero = settings({ working_hours_start: "09:00", working_hours_end: "09:00" });
    expect(isWithinWorkingWindow(NOW, zero)).toBe(false);
  });

  it("fails closed on unusable times", () => {
    expect(
      isWithinWorkingWindow(NOW, settings({ working_hours_start: "junk" }))
    ).toBe(false);
    expect(
      isWithinWorkingWindow(NOW, settings({ working_hours_end: "25:00" }))
    ).toBe(false);
  });

  it("describes the window for activity entries", () => {
    expect(describeWorkingWindow(DEFAULTS)).toBe(
      "09:00–18:00, Mon, Tue, Wed, Thu, Fri"
    );
  });
});

describe("evaluateSafetyGate", () => {
  it("allows in-window steps under the cap; the cap binds only connection requests", () => {
    expect(
      evaluateSafetyGate(NOW, DEFAULTS, {
        isConnectionRequest: true,
        connectionsUsedToday: 14,
        effectiveCap: 15,
      })
    ).toEqual({ allowed: true, reason: "ok" });
    expect(
      evaluateSafetyGate(NOW, DEFAULTS, {
        isConnectionRequest: true,
        connectionsUsedToday: 15,
        effectiveCap: 15,
      })
    ).toEqual({ allowed: false, reason: "over_daily_cap" });
    // A LinkedIn message at the connection cap is still allowed.
    expect(
      evaluateSafetyGate(NOW, DEFAULTS, {
        isConnectionRequest: false,
        connectionsUsedToday: 99,
        effectiveCap: 15,
      })
    ).toEqual({ allowed: true, reason: "ok" });
    // …but not outside working hours.
    expect(
      evaluateSafetyGate(MONDAY_07, DEFAULTS, {
        isConnectionRequest: false,
        connectionsUsedToday: 0,
        effectiveCap: 15,
      })
    ).toEqual({ allowed: false, reason: "outside_working_hours" });
  });
});

describe("safety gate in the executor", () => {
  it("cap trips mid-scan: dispatches up to the cap, defers the rest WITHOUT claiming", async () => {
    // Workspace cap 15, account daily limit 5 → effective cap 5.
    // (The account cap is the lower bound here: the warming
    // account's stored connection limit is 5.) 3 already used today
    // → 2 more dispatch, then deferral.
    const { store, adapter } = setup({
      safetyBaseConnections: 3,
      enrollmentCount: 4,
      warmupState: warmingState(),
    });
    const summary = await run(store, adapter);

    expect(summary.skippedLinkedIn).toBe(2);
    expect(summary.safetyDeferred).toBe(2);
    expect(store.claimInputs).toHaveLength(2);
    // Deferred enrollments never advanced — their steps stay due.
    expect(store.enrollments[2].current_step).toBe(0);
    expect(store.enrollments[3].current_step).toBe(0);
    // One aggregated, honest activity entry.
    const deferrals = store.activities.filter(
      (a) => a.action === "step_deferred_safety"
    );
    expect(deferrals).toHaveLength(1);
    expect(deferrals[0].details).toContain("2 due LinkedIn connection request(s) deferred");
    expect(deferrals[0].details).toContain("daily connection cap");
    expect(deferrals[0].details).toContain("Nothing was sent; the steps remain due.");
    // The settings + usage counters were each consulted ONCE for the scan.
    expect(store.safetySettingsCalls).toBe(1);
    expect(store.safetyCountCalls).toBe(1);
  });

  it("a workspace cap below the account cap binds instead", async () => {
    // Workspace cap 2 < account limit 5 → effective cap 2.
    const { store, adapter } = setup({
      safety: settings({ daily_connection_cap: 2 }),
      safetyBaseConnections: 1,
      enrollmentCount: 2,
      warmupState: warmingState(),
    });
    const summary = await run(store, adapter);
    expect(summary.skippedLinkedIn).toBe(1);
    expect(summary.safetyDeferred).toBe(1);
    const deferral = store.activities.find(
      (a) => a.action === "step_deferred_safety"
    );
    expect(deferral?.details).toContain("2 / 2 today");
  });

  it("deferred steps stay due on the next scan too", async () => {
    const { store, adapter } = setup({
      safetyBaseConnections: 3,
      enrollmentCount: 4,
      warmupState: warmingState(),
    });
    await run(store, adapter);
    const second = await run(store, adapter);
    expect(second.safetyDeferred).toBe(2);
    expect(second.skippedLinkedIn).toBe(0);
    expect(store.claimInputs).toHaveLength(2);
  });

  it("outside working hours every LinkedIn step defers, messages included", async () => {
    const { store, adapter } = setup({ enrollmentCount: 2 });
    const summary = await run(store, adapter, MONDAY_07);
    expect(summary.safetyDeferred).toBe(2);
    expect(summary.skippedLinkedIn).toBe(0);
    expect(store.claimInputs).toHaveLength(0);
    const deferral = store.activities.find(
      (a) => a.action === "step_deferred_safety"
    );
    expect(deferral?.details).toContain("outside the workspace working hours");
    expect(deferral?.details).toContain("09:00–18:00, Mon, Tue, Wed, Thu, Fri");

    const messageSetup = setup({ stepType: "linkedin_message" });
    const messageSummary = await run(messageSetup.store, messageSetup.adapter, SATURDAY_10);
    expect(messageSummary.safetyDeferred).toBe(1);
    expect(messageSummary.skippedLinkedIn).toBe(0);
  });

  it("in-window steps under the cap are still recorded skipped, never sent", async () => {
    const { store, adapter } = setup({});
    const summary = await run(store, adapter);
    expect(summary.safetyDeferred).toBe(0);
    expect(summary.skippedLinkedIn).toBe(1);
    const record = Array.from(store.claims.values())[0];
    expect(record.status).toBe("skipped");
    expect(record.detail).toContain("NOT sent");
  });

  it("no safety settings row reads as the defaults", async () => {
    const { store, adapter } = setup({ safety: null });
    const outside = await run(store, adapter, MONDAY_07);
    expect(outside.safetyDeferred).toBe(1);
    expect(outside.skippedLinkedIn).toBe(0);

    const inside = await run(store, adapter, NOW);
    expect(inside.safetyDeferred).toBe(0);
    expect(inside.skippedLinkedIn).toBe(1);
  });

  it("a store without the safety surface leaves LinkedIn behaviour untouched", async () => {
    const { store, adapter } = setup({ safetyBaseConnections: 99 });
    (store as unknown as Record<string, unknown>).getSafetySettings = undefined;
    (store as unknown as Record<string, unknown>).countLinkedInConnectionsToday = undefined;
    const summary = await run(store, adapter, MONDAY_07);
    expect(summary.safetyDeferred).toBe(0);
    expect(summary.skippedLinkedIn).toBe(1);
  });

  it("ramp-up off skips warm-up gating (the safety cap + window still apply)", async () => {
    // Warming Day 1, connections at the warm-up cap of 5.
    const warming = warmingState();
    const gated = setup({
      warmupState: warming,
      warmupBaseConnections: 5,
    });
    const gatedSummary = await run(gated.store, gated.adapter);
    expect(gatedSummary.warmupDeferred).toBe(1);
    expect(gatedSummary.safetyDeferred).toBe(0);
    expect(gatedSummary.skippedLinkedIn).toBe(0);

    const rampOff = setup({
      safety: settings({ ramp_up_enabled: false }),
      warmupState: warming,
      warmupBaseConnections: 5,
    });
    const offSummary = await run(rampOff.store, rampOff.adapter);
    expect(offSummary.warmupDeferred).toBe(0);
    expect(offSummary.safetyDeferred).toBe(0);
    // Still recorded skipped — ramp-up off never sends anything.
    expect(offSummary.skippedLinkedIn).toBe(1);
  });
});
