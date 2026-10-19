import { describe, it, expect } from "vitest";
import { executeDueSteps } from "../core";
import type {
  ExecutorCampaign,
  ExecutorEnrollment,
  ExecutorStore,
  LeadSignals,
  StepExecutionRecord,
} from "../types";
import type { CampaignStep, Lead, PlanType } from "@/types";
import type { InboxMessage, InsertMessageInput } from "@/lib/data/inbox";
import type {
  EmailProviderAdapter,
  SendEmailInput,
  SendEmailResult,
} from "@/lib/email/types";
import type { ProviderState } from "@/lib/env";

/**
 * Executor tests — fake store + fake adapter, no I/O. The fake store
 * mirrors the claim semantics of the real stores: claimStepExecution
 * returns null when (enrollment, step_order) is already claimed.
 */

const WS = "ws_1";
const NOW = new Date("2026-10-19T10:00:00.000Z");
const HOUR = 3600_000;
const hoursAgo = (h: number) =>
  new Date(NOW.getTime() - h * HOUR).toISOString();

function makeLead(partial: Partial<Lead> = {}): Lead {
  return {
    id: "lead_1",
    workspace_id: WS,
    first_name: "Sarah",
    last_name: "Chen",
    email: "sarah@acme.test",
    company: "Acme",
    job_title: "VP Sales",
    status: "new",
    tags: [],
    custom_fields: {},
    created_at: hoursAgo(100),
    ...partial,
  };
}

function makeEnrollment(
  partial: Partial<ExecutorEnrollment> = {}
): ExecutorEnrollment {
  return {
    id: "enr_1",
    workspace_id: WS,
    campaign_id: "camp_1",
    lead_id: "lead_1",
    status: "active",
    current_step: 0,
    enrolled_at: hoursAgo(2),
    last_step_at: null,
    ...partial,
  };
}

function makeStep(partial: Partial<CampaignStep> = {}): CampaignStep {
  return {
    id: "step_1",
    campaign_id: "camp_1",
    step_order: 0,
    step_type: "email",
    delay_hours: 0,
    subject: "Intro for {{company}}",
    content: "Hi {{first_name}}, saw your work as {{job_title}} at {{company}}.",
    config: {},
    ...partial,
  };
}

const CAMPAIGN: ExecutorCampaign = {
  id: "camp_1",
  workspace_id: WS,
  name: "Test campaign",
  type: "email",
  status: "active",
};

type RecordedInput = InsertMessageInput & { campaign_id?: string | null };

class FakeStore implements ExecutorStore {
  readonly simulated: boolean;
  enrollments: ExecutorEnrollment[] = [];
  campaigns = new Map<string, ExecutorCampaign>();
  stepsByCampaign = new Map<string, CampaignStep[]>();
  leads = new Map<string, Lead>();
  signalsByLead = new Map<string, LeadSignals>();
  claims = new Map<string, StepExecutionRecord>();
  messages: RecordedInput[] = [];
  activities: Array<{
    campaign_id: string | null;
    action: string;
    details: string;
  }> = [];
  plan: PlanType = "growth";
  monthCount = 0;
  private seq = 0;

  constructor(simulated = false) {
    this.simulated = simulated;
    this.campaigns.set(CAMPAIGN.id, CAMPAIGN);
  }

  async listEnrollments(workspaceId: string | null) {
    return this.enrollments.filter(
      (e) => !workspaceId || e.workspace_id === workspaceId
    );
  }
  async getCampaign(workspaceId: string, campaignId: string) {
    const c = this.campaigns.get(campaignId);
    return c && c.workspace_id === workspaceId ? c : null;
  }
  async getSteps(campaignId: string) {
    return this.stepsByCampaign.get(campaignId) ?? [];
  }
  async getLead(_ws: string, leadId: string) {
    return this.leads.get(leadId) ?? null;
  }
  async getLeadSignals(_ws: string, lead: Lead) {
    return (
      this.signalsByLead.get(lead.id) ?? {
        repliedAt: null,
        suppressionReason: null,
      }
    );
  }
  async getWorkspacePlan() {
    return this.plan;
  }
  async countEmailsThisMonth() {
    return this.monthCount;
  }
  async claimStepExecution(
    input: Parameters<ExecutorStore["claimStepExecution"]>[0]
  ): Promise<StepExecutionRecord | null> {
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
    patch: Partial<
      Pick<
        StepExecutionRecord,
        "status" | "detail" | "message_id" | "provider" | "provider_message_id"
      >
    >
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
  async insertMessage(input: RecordedInput): Promise<InboxMessage> {
    this.messages.push(input);
    return {
      id: `msg_row_${this.messages.length}`,
      conversation_id: input.conversation_id,
    } as unknown as InboxMessage;
  }
  async updateEnrollment(
    enrollmentId: string,
    patch: { status?: string; current_step?: number; last_step_at?: string | null }
  ) {
    const e = this.enrollments.find((x) => x.id === enrollmentId);
    if (!e) throw new Error(`enrollment ${enrollmentId} not found`);
    if (patch.status !== undefined) e.status = patch.status;
    if (patch.current_step !== undefined) e.current_step = patch.current_step;
    if (patch.last_step_at !== undefined) e.last_step_at = patch.last_step_at;
  }
  async appendActivity(
    _ws: string,
    entry: { campaign_id: string | null; action: string; details: string }
  ) {
    this.activities.push(entry);
  }

  onlyClaim(): StepExecutionRecord {
    const all = Array.from(this.claims.values());
    expect(all).toHaveLength(1);
    return all[0];
  }
}

class FakeAdapter implements EmailProviderAdapter {
  readonly provider = "fake-provider";
  calls: SendEmailInput[] = [];
  behaviour: (input: SendEmailInput) => SendEmailResult = () => ({
    status: "sent",
    provider: "fake-provider",
    providerMessageId: "provider_msg_1",
    message: "Email accepted by provider (message ID provider_msg_1).",
  });
  getState(): ProviderState {
    return "connected";
  }
  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    this.calls.push(input);
    return this.behaviour(input);
  }
}

function setup(simulated = false) {
  const store = new FakeStore(simulated);
  store.leads.set("lead_1", makeLead());
  const adapter = new FakeAdapter();
  return { store, adapter };
}

const run = (
  store: FakeStore,
  adapter: FakeAdapter,
  now: Date = NOW
) => executeDueSteps({ store, adapter, now }, { workspaceId: WS });

describe("executeDueSteps — sending", () => {
  it("sends a due email step with personalization rendered and advances the enrollment", async () => {
    const { store, adapter } = setup();
    const enrollment = makeEnrollment();
    store.enrollments = [enrollment];
    store.stepsByCampaign.set("camp_1", [makeStep()]);

    const summary = await run(store, adapter);

    expect(summary.sent).toBe(1);
    expect(summary.due).toBe(1);
    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0].to).toBe("sarah@acme.test");
    expect(adapter.calls[0].subject).toBe("Intro for Acme");
    expect(adapter.calls[0].text).toContain("Hi Sarah");
    expect(adapter.calls[0].text).toContain("VP Sales");
    // Recorded through the message store with the provider's outcome.
    expect(store.messages).toHaveLength(1);
    expect(store.messages[0].status).toBe("sent");
    expect(store.messages[0].provider_message_id).toBe("provider_msg_1");
    expect(store.messages[0].campaign_id).toBe("camp_1");
    expect(store.messages[0].idempotency_key).toBe("step:enr_1:0");
    // Enrollment completed (single-step campaign), execution row final.
    expect(enrollment.status).toBe("completed");
    expect(enrollment.current_step).toBe(1);
    expect(store.onlyClaim().status).toBe("sent");
    expect(
      store.activities.some((a) => a.action === "step_sent")
    ).toBe(true);
  });

  it("does not touch a step whose delay has not elapsed", async () => {
    const { store, adapter } = setup();
    const enrollment = makeEnrollment({ enrolled_at: hoursAgo(1) });
    store.enrollments = [enrollment];
    store.stepsByCampaign.set("camp_1", [makeStep({ delay_hours: 48 })]);

    const summary = await run(store, adapter);

    expect(summary.due).toBe(0);
    expect(adapter.calls).toHaveLength(0);
    expect(store.claims.size).toBe(0);
    expect(enrollment.current_step).toBe(0);
    expect(enrollment.status).toBe("active");
  });

  it("measures step 2's delay from last_step_at, not from enrollment", async () => {
    const { store, adapter } = setup();
    const enrollment = makeEnrollment({
      current_step: 1,
      last_step_at: hoursAgo(2),
    });
    store.enrollments = [enrollment];
    store.stepsByCampaign.set("camp_1", [
      makeStep(),
      makeStep({
        id: "step_2",
        step_order: 1,
        subject: "Second touch",
        delay_hours: 1,
      }),
    ]);

    const summary = await run(store, adapter);

    expect(summary.sent).toBe(1);
    expect(adapter.calls[0].subject).toBe("Second touch");
    expect(enrollment.status).toBe("completed");
  });

  it("skips an email step when the lead has no address, and advances", async () => {
    const { store, adapter } = setup();
    store.leads.set("lead_2", makeLead({ id: "lead_2", email: undefined }));
    const enrollment = makeEnrollment({ id: "enr_2", lead_id: "lead_2" });
    store.enrollments = [enrollment];
    store.stepsByCampaign.set("camp_1", [makeStep()]);

    const summary = await run(store, adapter);

    expect(summary.skippedNoEmail).toBe(1);
    expect(adapter.calls).toHaveLength(0);
    expect(store.messages).toHaveLength(0);
    expect(enrollment.current_step).toBe(1);
    expect(store.onlyClaim().status).toBe("skipped");
  });
});

describe("executeDueSteps — stop rules", () => {
  it("stops the enrollment when the lead replied after enrollment", async () => {
    const { store, adapter } = setup();
    const enrollment = makeEnrollment();
    store.signalsByLead.set("lead_1", {
      repliedAt: hoursAgo(1),
      suppressionReason: null,
    });
    store.enrollments = [enrollment];
    store.stepsByCampaign.set("camp_1", [makeStep()]);

    const summary = await run(store, adapter);

    expect(summary.stoppedReply).toBe(1);
    expect(adapter.calls).toHaveLength(0);
    expect(store.messages).toHaveLength(0);
    expect(enrollment.status).toBe("stopped");
    expect(store.onlyClaim().status).toBe("stopped");
    expect(store.onlyClaim().detail).toContain("Lead replied at");
    expect(
      store.activities.some((a) => a.action === "enrollment_stopped")
    ).toBe(true);
  });

  it("stops on a bounce suppression and records the reason", async () => {
    const { store, adapter } = setup();
    const enrollment = makeEnrollment();
    store.signalsByLead.set("lead_1", {
      repliedAt: null,
      suppressionReason: "bounced",
    });
    store.enrollments = [enrollment];
    store.stepsByCampaign.set("camp_1", [makeStep()]);

    const summary = await run(store, adapter);

    expect(summary.stoppedSuppression).toBe(1);
    expect(adapter.calls).toHaveLength(0);
    expect(enrollment.status).toBe("stopped");
    expect(store.onlyClaim().detail).toContain("bounced");
  });

  it("stops on an unsubscribe suppression", async () => {
    const { store, adapter } = setup();
    const enrollment = makeEnrollment();
    store.signalsByLead.set("lead_1", {
      repliedAt: null,
      suppressionReason: "unsubscribed",
    });
    store.enrollments = [enrollment];
    store.stepsByCampaign.set("camp_1", [makeStep()]);

    const summary = await run(store, adapter);

    expect(summary.stoppedSuppression).toBe(1);
    expect(enrollment.status).toBe("stopped");
    expect(store.onlyClaim().detail).toContain("unsubscribed");
  });

  it("records the message and stops when the adapter itself reports suppression", async () => {
    const { store, adapter } = setup();
    adapter.behaviour = () => ({
      status: "suppressed",
      provider: "fake-provider",
      providerMessageId: null,
      message: "Recipient is on the suppression list (reason: bounced).",
    });
    const enrollment = makeEnrollment();
    store.enrollments = [enrollment];
    store.stepsByCampaign.set("camp_1", [makeStep()]);

    const summary = await run(store, adapter);

    expect(summary.stoppedSuppression).toBe(1);
    expect(store.messages).toHaveLength(1);
    expect(store.messages[0].status).toBe("suppressed");
    expect(enrollment.status).toBe("stopped");
  });
});

describe("executeDueSteps — limits, channels, idempotency", () => {
  it("defers at the plan limit without claiming or sending", async () => {
    const { store, adapter } = setup();
    store.plan = "free"; // 1,000 emails/month
    store.monthCount = 1000;
    const enrollment = makeEnrollment();
    store.enrollments = [enrollment];
    store.stepsByCampaign.set("camp_1", [makeStep()]);

    const summary = await run(store, adapter);

    expect(summary.overLimit).toBe(1);
    expect(adapter.calls).toHaveLength(0);
    expect(store.claims.size).toBe(0);
    expect(enrollment.current_step).toBe(0);
    expect(enrollment.status).toBe("active");
    expect(
      store.activities.some((a) => a.action === "step_deferred_limit")
    ).toBe(true);
    expect(
      store.activities.some((a) => a.details.includes("plan email limit"))
    ).toBe(true);
  });

  it("records LinkedIn steps as skipped (never sent, never simulated) and advances", async () => {
    const { store, adapter } = setup();
    const enrollment = makeEnrollment();
    store.enrollments = [enrollment];
    store.stepsByCampaign.set("camp_1", [
      makeStep({
        step_type: "connection_request",
        subject: undefined,
        content: "Hi {{first_name}}",
      }),
    ]);

    const summary = await run(store, adapter);

    expect(summary.skippedLinkedIn).toBe(1);
    expect(summary.sent).toBe(0);
    expect(summary.simulated).toBe(0);
    expect(adapter.calls).toHaveLength(0);
    expect(store.messages).toHaveLength(0);
    const claim = store.onlyClaim();
    expect(claim.status).toBe("skipped");
    expect(claim.channel).toBe("linkedin");
    expect(claim.detail).toContain("no authorized LinkedIn provider");
    expect(enrollment.current_step).toBe(1);
    expect(enrollment.status).toBe("completed");
  });

  it("executes wait steps without sending anything", async () => {
    const { store, adapter } = setup();
    const enrollment = makeEnrollment();
    store.enrollments = [enrollment];
    store.stepsByCampaign.set("camp_1", [
      makeStep({ step_type: "wait", subject: undefined, content: "" }),
    ]);

    const summary = await run(store, adapter);

    expect(summary.waitsExecuted).toBe(1);
    expect(adapter.calls).toHaveLength(0);
    expect(enrollment.status).toBe("completed");
    expect(store.onlyClaim().status).toBe("executed");
  });

  it("is idempotent: a second scan sends nothing again", async () => {
    const { store, adapter } = setup();
    const enrollment = makeEnrollment();
    store.enrollments = [enrollment];
    store.stepsByCampaign.set("camp_1", [makeStep()]);

    const first = await run(store, adapter);
    const second = await run(store, adapter, new Date(NOW.getTime() + HOUR));

    expect(first.sent).toBe(1);
    expect(second.due).toBe(0);
    expect(adapter.calls).toHaveLength(1);
    expect(store.messages).toHaveLength(1);
  });

  it("an existing claim blocks a duplicate send", async () => {
    const { store, adapter } = setup();
    const enrollment = makeEnrollment();
    store.enrollments = [enrollment];
    store.stepsByCampaign.set("camp_1", [makeStep()]);
    // Simulate a prior attempt that claimed the step: the row exists.
    await store.claimStepExecution({
      workspace_id: WS,
      campaign_id: "camp_1",
      enrollment_id: enrollment.id,
      lead_id: enrollment.lead_id,
      step_order: 0,
      step_type: "email",
      channel: "email",
      idempotency_key: "step:enr_1:0",
      simulated: false,
    });

    const summary = await run(store, adapter);

    expect(summary.due).toBe(1);
    expect(summary.alreadyClaimed).toBe(1);
    expect(adapter.calls).toHaveLength(0);
    expect(enrollment.current_step).toBe(0);
  });

  it("releases the claim on a transient provider error so the step retries next scan", async () => {
    const { store, adapter } = setup();
    adapter.behaviour = () => ({
      status: "error",
      provider: "fake-provider",
      providerMessageId: null,
      message: "provider_error: connection reset",
    });
    const enrollment = makeEnrollment();
    store.enrollments = [enrollment];
    store.stepsByCampaign.set("camp_1", [makeStep()]);

    const first = await run(store, adapter);
    expect(first.errors).toBe(1);
    expect(store.claims.size).toBe(0);
    expect(enrollment.current_step).toBe(0);
    expect(enrollment.status).toBe("active");
    // Recorded in the activity log, not as a message.
    expect(store.messages).toHaveLength(0);
    expect(
      store.activities.some((a) => a.action === "step_send_failed")
    ).toBe(true);

    adapter.behaviour = () => ({
      status: "sent",
      provider: "fake-provider",
      providerMessageId: "provider_msg_2",
      message: "Email accepted by provider (message ID provider_msg_2).",
    });
    const second = await run(store, adapter, new Date(NOW.getTime() + HOUR));
    expect(second.sent).toBe(1);
    expect(enrollment.status).toBe("completed");
  });
});

describe("executeDueSteps — demo labelling", () => {
  it("labels every demo record simulated", async () => {
    const { store, adapter } = setup(true);
    adapter.behaviour = () => ({
      status: "simulated",
      provider: "fake-provider",
      providerMessageId: null,
      message: "Simulated send — no email provider is configured (Demo Mode).",
    });
    const enrollment = makeEnrollment();
    store.enrollments = [enrollment];
    store.stepsByCampaign.set("camp_1", [makeStep()]);

    const summary = await run(store, adapter);

    expect(summary.simulated).toBe(1);
    expect(summary.sent).toBe(0);
    expect(store.messages).toHaveLength(1);
    expect(store.messages[0].status).toBe("simulated");
    expect(store.messages[0].is_demo).toBe(true);
    const claim = store.onlyClaim();
    expect(claim.status).toBe("simulated");
    expect(claim.simulated).toBe(true);
    expect(enrollment.status).toBe("completed");
  });
});
