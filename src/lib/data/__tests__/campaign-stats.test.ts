/**
 * Campaign stats derivations — every number must trace back to a real
 * record. These tests pin the honesty rules:
 *  - LinkedIn "sent" comes only from execution records that say `sent`;
 *    skipped steps are counted as skipped, never as sends.
 *  - LinkedIn "Accepted" has no data source → always null.
 *  - Email sent splits provider-confirmed vs simulated; failed and
 *    suppressed attempts never count as sent.
 *  - Opened/Clicked are null (unavailable) unless email_events data is
 *    actually supplied, and then only count events for our own sends.
 */

import { describe, expect, it } from "vitest";
import {
  aggregateCampaignStats,
  computeCampaignStats,
  countEmailEvents,
  type CampaignStatsSource,
} from "../campaign-stats";
import { campaignsToCsv } from "../csv";
import type { EnrollmentRecord } from "../campaigns";
import type { HistoryMessage } from "../message-history";
import type { StepExecutionRecord } from "@/lib/executor/types";
import type { Campaign } from "@/types";

function enrollment(partial: Partial<EnrollmentRecord>): EnrollmentRecord {
  return {
    id: "enr_1",
    campaign_id: "cmp_1",
    lead_id: "lead_1",
    status: "pending",
    current_step: 0,
    enrolled_at: "2026-01-01T00:00:00.000Z",
    last_step_at: null,
    ...partial,
  };
}

function message(partial: Partial<HistoryMessage>): HistoryMessage {
  return {
    id: "msg_1",
    workspace_id: "ws_1",
    lead_id: "lead_1",
    campaign_id: "cmp_1",
    channel: "email",
    direction: "outbound",
    content: "hello",
    status: "sent",
    is_demo: false,
    provider_message_id: null,
    sent_at: "2026-01-02T00:00:00.000Z",
    conversation_subject: null,
    contact_name: "Pat",
    contact_email: "pat@example.com",
    company: null,
    verification: "recorded",
    ...partial,
  } as HistoryMessage;
}

function execution(partial: Partial<StepExecutionRecord>): StepExecutionRecord {
  return {
    id: "exec_1",
    workspace_id: "ws_1",
    campaign_id: "cmp_1",
    enrollment_id: "enr_1",
    lead_id: "lead_1",
    step_order: 1,
    step_type: "connection_request",
    channel: "linkedin",
    status: "skipped",
    detail: "",
    account_id: null,
    message_id: null,
    provider: null,
    provider_message_id: null,
    idempotency_key: "k",
    simulated: false,
    created_at: "2026-01-02T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    ...partial,
  };
}

function source(partial: Partial<CampaignStatsSource>): CampaignStatsSource {
  return {
    enrollments: [],
    messages: [],
    executions: [],
    emailEvents: null,
    ...partial,
  };
}

describe("computeCampaignStats — enrollments", () => {
  it("counts prospects and enrollment states, scoped to the campaign", () => {
    const stats = computeCampaignStats(
      "cmp_1",
      source({
        enrollments: [
          enrollment({ id: "e1", status: "pending" }),
          enrollment({ id: "e2", status: "active" }),
          enrollment({ id: "e3", status: "completed" }),
          enrollment({ id: "e4", status: "stopped" }),
          enrollment({ id: "e5", status: "error" }),
          enrollment({ id: "e6", campaign_id: "cmp_2", status: "completed" }),
        ],
      })
    );
    expect(stats.prospects).toBe(5);
    expect(stats.enrollments).toEqual({
      total: 5,
      inProgress: 2,
      completed: 1,
      stopped: 2,
    });
  });

  it("campaignId null aggregates every campaign's records", () => {
    const stats = computeCampaignStats(
      null,
      source({
        enrollments: [
          enrollment({ id: "e1" }),
          enrollment({ id: "e2", campaign_id: "cmp_2" }),
        ],
      })
    );
    expect(stats.prospects).toBe(2);
    expect(stats.campaignId).toBeNull();
  });
});

describe("computeCampaignStats — email", () => {
  it("splits sent into provider-confirmed vs simulated; failures never count as sent", () => {
    const stats = computeCampaignStats(
      "cmp_1",
      source({
        messages: [
          message({ id: "m1", status: "delivered", verification: "provider", provider_message_id: "pm_1" }),
          message({ id: "m2", status: "simulated", verification: "simulated", is_demo: true }),
          message({ id: "m3", status: "failed", verification: "failed" }),
          message({ id: "m4", status: "suppressed", verification: "failed" }),
          message({ id: "m5", status: "queued", verification: "recorded" }),
          message({ id: "m6", status: "opened", verification: "simulated", is_demo: true }),
          message({ id: "m7", campaign_id: "cmp_2", status: "delivered", verification: "provider" }),
        ],
      })
    );
    expect(stats.email.sent).toBe(3);
    expect(stats.email.sentProviderConfirmed).toBe(1);
    expect(stats.email.sentSimulated).toBe(2);
    expect(stats.email.failed).toBe(2);
  });

  it("counts inbound replies per channel and in total", () => {
    const stats = computeCampaignStats(
      "cmp_1",
      source({
        messages: [
          message({ id: "m1", direction: "inbound", status: "replied" }),
          message({ id: "m2", channel: "linkedin", direction: "inbound", status: "replied" }),
          message({ id: "m3", channel: "linkedin", direction: "inbound", status: "replied" }),
          message({ id: "m4", channel: "linkedin", direction: "outbound", status: "delivered" }),
        ],
      })
    );
    expect(stats.email.replied).toBe(1);
    expect(stats.linkedin.replied).toBe(2);
    expect(stats.repliesTotal).toBe(3);
  });

  it("opened/clicked are null without email_events data, and pass through when supplied", () => {
    const without = computeCampaignStats("cmp_1", source({}));
    expect(without.email.opened).toBeNull();
    expect(without.email.clicked).toBeNull();

    const withEvents = computeCampaignStats(
      "cmp_1",
      source({ emailEvents: { opened: 7, clicked: 2 } })
    );
    expect(withEvents.email.opened).toBe(7);
    expect(withEvents.email.clicked).toBe(2);
  });
});

describe("computeCampaignStats — LinkedIn honesty", () => {
  it("skipped LinkedIn steps are skipped — never sends; provider flag stays false", () => {
    const stats = computeCampaignStats(
      "cmp_1",
      source({
        executions: [
          execution({ id: "x1", step_type: "connection_request", status: "skipped" }),
          execution({ id: "x2", step_type: "linkedin_message", status: "skipped" }),
        ],
      })
    );
    expect(stats.linkedin.connectionRequestsSent).toBe(0);
    expect(stats.linkedin.messagesSent).toBe(0);
    expect(stats.linkedin.stepsSkipped).toBe(2);
    expect(stats.linkedin.providerConnected).toBe(false);
  });

  it("a genuinely sent LinkedIn execution counts and flips the provider flag", () => {
    const stats = computeCampaignStats(
      "cmp_1",
      source({
        executions: [
          execution({ id: "x1", step_type: "connection_request", status: "sent" }),
          execution({ id: "x2", step_type: "linkedin_message", status: "sent" }),
          execution({ id: "x3", step_type: "email", channel: "email", status: "sent" }),
        ],
      })
    );
    expect(stats.linkedin.connectionRequestsSent).toBe(1);
    expect(stats.linkedin.messagesSent).toBe(1);
    expect(stats.linkedin.providerConnected).toBe(true);
    expect(stats.executions.sent).toBe(3);
  });

  it("Accepted is always null — there is no data source for it", () => {
    const stats = computeCampaignStats(
      "cmp_1",
      source({
        executions: [
          execution({ id: "x1", status: "sent" }),
          execution({ id: "x2", status: "skipped" }),
        ],
        messages: [message({ id: "m1", channel: "linkedin", direction: "inbound" })],
      })
    );
    expect(stats.linkedin.accepted).toBeNull();
  });

  it("seeded demo inbox messages do NOT inflate LinkedIn sends (executions only)", () => {
    // The demo inbox seed contains an outbound LinkedIn message labelled
    // "delivered" — inbox content is not a send record. Only executions
    // may feed the LinkedIn funnel.
    const stats = computeCampaignStats(
      "cmp_1",
      source({
        messages: [
          message({ id: "m1", channel: "linkedin", direction: "outbound", status: "delivered", is_demo: true, verification: "simulated" }),
        ],
        executions: [],
      })
    );
    expect(stats.linkedin.messagesSent).toBe(0);
    expect(stats.linkedin.connectionRequestsSent).toBe(0);
  });
});

describe("countEmailEvents", () => {
  it("counts only our own sends' events, de-duplicated by provider event id", () => {
    const counts = countEmailEvents(
      [
        { provider_event_id: "ev1", event_type: "email.opened", provider_message_id: "pm_1" },
        { provider_event_id: "ev1", event_type: "email.opened", provider_message_id: "pm_1" },
        { provider_event_id: "ev2", event_type: "email.clicked", provider_message_id: "pm_1" },
        { provider_event_id: "ev3", event_type: "email.opened", provider_message_id: "pm_other" },
        { provider_event_id: "ev4", event_type: "email.delivered", provider_message_id: "pm_1" },
        { provider_event_id: "ev5", event_type: "email.opened", provider_message_id: null },
      ],
      new Set(["pm_1"])
    );
    expect(counts).toEqual({ opened: 1, clicked: 1 });
  });
});

describe("aggregateCampaignStats", () => {
  it("sums campaigns; accepted stays null; opened sums only available values", () => {
    const a = computeCampaignStats(
      "cmp_1",
      source({
        enrollments: [enrollment({ id: "e1" })],
        emailEvents: { opened: 3, clicked: 1 },
      })
    );
    const b = computeCampaignStats(
      "cmp_2",
      source({
        enrollments: [enrollment({ id: "e2", campaign_id: "cmp_2" })],
        emailEvents: null,
      })
    );
    const agg = aggregateCampaignStats([a, b]);
    expect(agg.prospects).toBe(2);
    expect(agg.linkedin.accepted).toBeNull();
    expect(agg.email.opened).toBe(3);
    expect(agg.email.clicked).toBe(1);
  });

  it("opened stays null when no campaign has event data", () => {
    const a = computeCampaignStats("cmp_1", source({}));
    const agg = aggregateCampaignStats([a]);
    expect(agg.email.opened).toBeNull();
    expect(agg.email.clicked).toBeNull();
  });

  it("bounced/complained flow from the event source and aggregate like opened/clicked (Stage D)", () => {
    const a = computeCampaignStats(
      "cmp_1",
      source({
        emailEvents: { opened: 5, clicked: 2, bounced: 3, complained: 1 },
      })
    );
    expect(a.email.bounced).toBe(3);
    expect(a.email.complained).toBe(1);

    const b = computeCampaignStats(
      "cmp_2",
      source({ emailEvents: { opened: 1, clicked: 0 } })
    );
    // A source without bounce data (legacy counts shape) reads as
    // unavailable, not as zero.
    expect(b.email.bounced).toBeNull();
    expect(b.email.complained).toBeNull();

    const c = computeCampaignStats("cmp_3", source({ emailEvents: null }));
    expect(c.email.bounced).toBeNull();

    const agg = aggregateCampaignStats([a, b, c]);
    expect(agg.email.bounced).toBe(3);
    expect(agg.email.complained).toBe(1);
  });
});

describe("campaignsToCsv", () => {
  it("exports real stats and n/a for sourceless metrics, with escaping", () => {
    const campaign = {
      id: "cmp_1",
      workspace_id: "ws_1",
      name: 'Founders, "Q4"',
      type: "mixed",
      status: "active",
      created_by: "usr_1",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    } as Campaign;
    const stats = computeCampaignStats(
      "cmp_1",
      source({ enrollments: [enrollment({ id: "e1" })] })
    );
    const csv = campaignsToCsv([{ campaign, stats }]);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toContain("LinkedIn Accepted");
    expect(lines[1]).toContain('"Founders, ""Q4"""');
    expect(lines[1]).toContain("n/a"); // Accepted + Opened + Clicked
    expect(lines[1]).toContain(",1,"); // prospects = 1
  });
});
