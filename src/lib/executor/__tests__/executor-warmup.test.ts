import { describe, it, expect } from "vitest";
import { executeDueSteps } from "../core";
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
  emptyWarmupUsage,
  startTransition,
  stepTypeToWarmupAction,
  type AccountWarmupState,
  type WarmupProgramPatch,
  type WarmupUsageCounts,
} from "@/lib/linkedin/warmup";
import { DEFAULT_WARMUP_LIMITS } from "@/lib/data/audience-source";

/**
 * Warm-up gate tests — fake store + fake adapter, injected clock.
 *
 * The fake's usage counter mirrors the DEMO counting rule (dispatch
 * attempts): it reports base counts PLUS this store's completed
 * LinkedIn claims for the account, so a second scan sees the first
 * scan's dispatches exactly like the real stores do.
 */

const WS = "ws_1";
const NOW = new Date("2026-10-19T10:00:00.000Z");
const DAY = 86_400_000;
const daysBefore = (n: number) => new Date(NOW.getTime() - n * DAY);
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const ACCOUNT = "acc_li";

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

function warmingState(
  partial: Partial<AccountWarmupState> = {},
  preset: "conservative" | "balanced" = "conservative",
  startedAt: Date = NOW
): AccountWarmupState {
  const t = startTransition(preset, startedAt, null);
  return {
    accountId: ACCOUNT,
    displayName: "Alex Vance",
    enabled: true,
    status: "warming",
    preset,
    schedule: t.patch.schedule ?? null,
    overrides: null,
    startedAt: startedAt.toISOString(),
    pausedAt: null,
    pausedMs: 0,
    graduatedAt: null,
    dailyLimits: { ...DEFAULT_WARMUP_LIMITS },
    history: [t.entry],
    ...partial,
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
  warmupStates = new Map<string, AccountWarmupState>();
  baseUsage = new Map<string, WarmupUsageCounts>();
  countCalls = 0;
  persisted: Array<{ accountId: string; patch: WarmupProgramPatch; entry: WarmupHistoryEntry }> = [];
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

  // ── Warm-up store surface ──────────────────────────────────────
  async getAccountWarmupState(_ws: string, accountId: string) {
    return this.warmupStates.get(accountId) ?? null;
  }
  async countLinkedInActionsToday(
    _ws: string,
    accountId: string,
    dayStartIso: string
  ): Promise<WarmupUsageCounts> {
    this.countCalls++;
    const counts = { ...(this.baseUsage.get(accountId) ?? emptyWarmupUsage()) };
    for (const rec of Array.from(this.claims.values())) {
      if (rec.account_id !== accountId || rec.channel !== "linkedin") continue;
      if (rec.created_at < dayStartIso) continue;
      if (rec.status === "sending") continue;
      const action = stepTypeToWarmupAction(rec.step_type);
      if (action) counts[action] += 1;
    }
    return counts;
  }
  async persistWarmupTransition(
    _ws: string,
    accountId: string,
    patch: WarmupProgramPatch,
    entryState: AccountWarmupState,
    entry: WarmupHistoryEntry
  ) {
    this.persisted.push({ accountId, patch, entry });
    const state = this.warmupStates.get(accountId);
    if (state) {
      if (patch.status !== undefined) state.status = patch.status;
      if (patch.graduatedAt !== undefined) state.graduatedAt = patch.graduatedAt;
      state.history = [...entryState.history, entry];
    }
  }
}

function setup(opts: {
  state?: AccountWarmupState | null;
  baseConnections?: number;
  stepType?: CampaignStep["step_type"];
  enrollmentCount?: number;
} = {}) {
  const store = new FakeStore();
  const campaign: ExecutorCampaign = {
    id: "camp_1",
    workspace_id: WS,
    name: "Warm-up campaign",
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
      enrolled_at: hoursAgo(2),
      last_step_at: null,
    });
  }
  if (opts.state !== null) {
    store.warmupStates.set(ACCOUNT, opts.state ?? warmingState());
  }
  if (opts.baseConnections !== undefined) {
    store.baseUsage.set(ACCOUNT, {
      ...emptyWarmupUsage(),
      connection_requests: opts.baseConnections,
    });
  }
  return { store, adapter: new FakeAdapter() };
}

const run = (store: FakeStore, adapter: FakeAdapter) =>
  executeDueSteps({ store, adapter, now: NOW }, { workspaceId: WS });

describe("warm-up gate", () => {
  it("cap trips mid-scan: dispatches up to the cap, defers the rest WITHOUT claiming", async () => {
    // Conservative Day 1: connection cap = min(5 daily, 5 phase) = 5.
    // 3 already used today → 2 more dispatch, then deferral.
    const { store, adapter } = setup({
      baseConnections: 3,
      enrollmentCount: 4,
    });
    const summary = await run(store, adapter);

    expect(summary.skippedLinkedIn).toBe(2);
    expect(summary.warmupDeferred).toBe(2);
    expect(store.claimInputs).toHaveLength(2);
    // Deferred enrollments never advanced — their steps stay due.
    expect(store.enrollments[2].current_step).toBe(0);
    expect(store.enrollments[3].current_step).toBe(0);
    // One aggregated, honest activity entry.
    const deferrals = store.activities.filter(
      (a) => a.action === "step_deferred_warmup"
    );
    expect(deferrals).toHaveLength(1);
    expect(deferrals[0].details).toContain("2 due LinkedIn step(s) deferred");
    expect(deferrals[0].details).toContain("day 1");
    expect(deferrals[0].details).toContain(
      "Warm-up limit reached for today — nothing was sent; the steps remain due."
    );
    // The usage counter was consulted ONCE for the whole scan.
    expect(store.countCalls).toBe(1);
  });

  it("deferred steps stay due on the next scan too (the counter sees prior dispatches)", async () => {
    const { store, adapter } = setup({ baseConnections: 3, enrollmentCount: 4 });
    await run(store, adapter);
    const second = await run(store, adapter);
    expect(second.warmupDeferred).toBe(2);
    expect(second.skippedLinkedIn).toBe(0);
    expect(store.claimInputs).toHaveLength(2);
  });

  it("caps are per-action: connections at cap does not block messages", async () => {
    const { store, adapter } = setup({
      baseConnections: 5, // connections exhausted
      stepType: "linkedin_message",
      enrollmentCount: 1,
    });
    const summary = await run(store, adapter);
    expect(summary.warmupDeferred).toBe(0);
    expect(summary.skippedLinkedIn).toBe(1);
  });

  it("paused programs are never gated", async () => {
    const paused = warmingState({
      status: "paused",
      pausedAt: hoursAgo(5),
    });
    const { store, adapter } = setup({ state: paused, baseConnections: 99 });
    const summary = await run(store, adapter);
    expect(summary.warmupDeferred).toBe(0);
    expect(summary.skippedLinkedIn).toBe(1);
    expect(store.countCalls).toBe(0);
  });

  it("not_started, graduated and warm-up-disabled accounts are never gated", async () => {
    for (const state of [
      warmingState({ status: "not_started", startedAt: null, schedule: null }),
      warmingState({ status: "graduated", graduatedAt: hoursAgo(1) }),
      warmingState({ enabled: false }),
    ]) {
      const { store, adapter } = setup({ state, baseConnections: 99 });
      const summary = await run(store, adapter);
      expect(summary.warmupDeferred).toBe(0);
      expect(summary.skippedLinkedIn).toBe(1);
    }
  });

  it("the owner's daily limit binds when it is BELOW the phase cap", async () => {
    // Balanced Day 6 = phase 2 (connections cap 14), but the stored
    // daily limit is 5 → effective cap 5. 4 used → 1 dispatch, 1 defer.
    const state = warmingState(
      { dailyLimits: { ...DEFAULT_WARMUP_LIMITS, connection_requests: 5 } },
      "balanced",
      daysBefore(5)
    );
    const { store, adapter } = setup({
      state,
      baseConnections: 4,
      enrollmentCount: 2,
    });
    const summary = await run(store, adapter);
    expect(summary.skippedLinkedIn).toBe(1);
    expect(summary.warmupDeferred).toBe(1);
    const deferral = store.activities.find(
      (a) => a.action === "step_deferred_warmup"
    );
    expect(deferral?.details).toContain("limit of 5 connection requests");
    expect(deferral?.details).toContain("day 6");
  });

  it("an owner override below the phase cap binds instead", async () => {
    const state = warmingState({ overrides: { connection_requests: 2 } });
    const { store, adapter } = setup({
      state,
      baseConnections: 1,
      enrollmentCount: 2,
    });
    const summary = await run(store, adapter);
    expect(summary.skippedLinkedIn).toBe(1);
    expect(summary.warmupDeferred).toBe(1);
  });

  it("graduation boundary: an elapsed schedule is lazily graduated and never gated", async () => {
    // Conservative started 21 days ago → Day 22 > 21 days total.
    const state = warmingState({}, "conservative", daysBefore(21));
    const { store, adapter } = setup({ state, baseConnections: 99 });
    const summary = await run(store, adapter);
    expect(summary.warmupDeferred).toBe(0);
    expect(summary.skippedLinkedIn).toBe(1);
    // The graduation was persisted exactly once, as a system action.
    expect(store.persisted).toHaveLength(1);
    expect(store.persisted[0].patch.status).toBe("graduated");
    expect(store.persisted[0].entry.action).toBe("graduated");
    // …and a later scan does not persist it again.
    const again = await run(store, adapter);
    expect(again.warmupDeferred).toBe(0);
    expect(store.persisted).toHaveLength(1);
  });

  it("a store without the warm-up surface leaves LinkedIn behaviour untouched", async () => {
    const { store, adapter } = setup({ baseConnections: 99 });
    (store as unknown as Record<string, unknown>).getAccountWarmupState =
      undefined;
    (store as unknown as Record<string, unknown>).countLinkedInActionsToday =
      undefined;
    const summary = await run(store, adapter);
    expect(summary.warmupDeferred).toBe(0);
    expect(summary.skippedLinkedIn).toBe(1);
  });

  it("a campaign with no sender account is never gated", async () => {
    const { store, adapter } = setup({ baseConnections: 99 });
    const campaign = store.campaigns.get("camp_1")!;
    store.campaigns.set("camp_1", { ...campaign, sender_account_id: null });
    const summary = await run(store, adapter);
    expect(summary.warmupDeferred).toBe(0);
    expect(summary.skippedLinkedIn).toBe(1);
  });
});

describe("claim attribution (migration 020)", () => {
  it("LinkedIn claims carry the sender account; email claims carry the email account", async () => {
    const { store, adapter } = setup({});
    await run(store, adapter);
    expect(store.claimInputs).toHaveLength(1);
    expect(store.claimInputs[0].account_id).toBe(ACCOUNT);
    const record = Array.from(store.claims.values())[0];
    expect(record.account_id).toBe(ACCOUNT);

    const emailSetup = setup({ stepType: "email" });
    emailSetup.store.stepsByCampaign.set("camp_1", [
      makeStep({
        step_type: "email",
        subject: "Hi",
        content: "Hello {{first_name}}",
      }),
    ]);
    const summary = await run(emailSetup.store, emailSetup.adapter);
    expect(summary.sent).toBe(1);
    expect(emailSetup.store.claimInputs[0].account_id).toBe("acc_em");
  });
});
