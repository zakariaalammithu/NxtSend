import { describe, it, expect } from "vitest";
import {
  aggregateEmailEvents,
  deriveReplySyncStatus,
  deriveSimulatedEmailData,
  shapeWebhookLog,
  type EmailEventRecord,
  type MessageLink,
} from "../events-core";

/**
 * Email-event aggregation core (P5 Stage D). The properties that
 * matter most are the honesty ones: an event counts for a workspace
 * ONLY when its provider message ID resolves to a message in that
 * workspace (email_events has no workspace column — the message link
 * IS the tenant boundary), unknown/other-tenant events never leak
 * into a workspace aggregate, rates are null (not invented) on empty
 * data, and simulated (demo-derived) events stay a separate set from
 * provider events.
 */

function link(partial: Partial<MessageLink>): MessageLink {
  return {
    provider_message_id: "pm_1",
    workspace_id: "ws_1",
    campaign_id: "cmp_1",
    direction: "outbound",
    status: "delivered",
    is_demo: false,
    ...partial,
  };
}

function evt(partial: Partial<EmailEventRecord>): EmailEventRecord {
  return {
    provider_event_id: "ev_1",
    event_type: "email.sent",
    provider_message_id: "pm_1",
    received_at: "2026-10-19T10:00:00.000Z",
    ...partial,
  };
}

const LINKS: MessageLink[] = [
  link({ provider_message_id: "pm_1" }),
  link({ provider_message_id: "pm_2" }),
  link({ provider_message_id: "pm_3", campaign_id: "cmp_2" }),
  link({ provider_message_id: "pm_other", workspace_id: "ws_2" }),
];

describe("aggregateEmailEvents — math", () => {
  const events: EmailEventRecord[] = [
    evt({ provider_event_id: "e1", event_type: "email.sent", provider_message_id: "pm_1" }),
    evt({ provider_event_id: "e2", event_type: "email.delivered", provider_message_id: "pm_1" }),
    evt({ provider_event_id: "e3", event_type: "email.opened", provider_message_id: "pm_1" }),
    // duplicate delivery of the same open event — deduped by event id
    evt({ provider_event_id: "e3", event_type: "email.opened", provider_message_id: "pm_1" }),
    evt({ provider_event_id: "e4", event_type: "email.opened", provider_message_id: "pm_1" }),
    evt({ provider_event_id: "e5", event_type: "email.clicked", provider_message_id: "pm_1" }),
    evt({ provider_event_id: "e6", event_type: "email.sent", provider_message_id: "pm_2" }),
    evt({ provider_event_id: "e7", event_type: "email.bounced", provider_message_id: "pm_2" }),
    evt({ provider_event_id: "e8", event_type: "email.sent", provider_message_id: "pm_3" }),
    evt({ provider_event_id: "e9", event_type: "email.delivered", provider_message_id: "pm_3" }),
    evt({ provider_event_id: "e10", event_type: "email.complained", provider_message_id: "pm_3" }),
  ];

  it("counts distinct messages for terminal states and deduped events for opens/clicks", () => {
    const agg = aggregateEmailEvents(events, LINKS, { workspaceId: "ws_1" });
    expect(agg.counts).toEqual({
      sent: 3,
      delivered: 2,
      bounced: 1,
      complained: 1,
      opened: 2,
      clicked: 1,
      received: 0,
    });
    expect(agg.eventCount).toBe(10); // 11 rows − 1 duplicate event id
  });

  it("computes rates from the real counts only", () => {
    const agg = aggregateEmailEvents(events, LINKS, { workspaceId: "ws_1" });
    expect(agg.rates.deliveryRate).toBeCloseTo(2 / 3);
    expect(agg.rates.bounceRate).toBeCloseTo(1 / 3);
    expect(agg.rates.complaintRate).toBeCloseTo(1 / 3);
    expect(agg.rates.openRate).toBeCloseTo(2 / 2);
    expect(agg.rates.clickRate).toBeCloseTo(1 / 2);
  });

  it("scopes per campaign", () => {
    const agg = aggregateEmailEvents(events, LINKS, {
      workspaceId: "ws_1",
      campaignId: "cmp_2",
    });
    expect(agg.counts.sent).toBe(1);
    expect(agg.counts.complained).toBe(1);
    expect(agg.counts.bounced).toBe(0);
  });

  it("an open without a delivered event still proves delivery (and the send)", () => {
    const agg = aggregateEmailEvents(
      [evt({ provider_event_id: "x1", event_type: "email.opened", provider_message_id: "pm_1" })],
      LINKS,
      { workspaceId: "ws_1" }
    );
    expect(agg.counts.delivered).toBe(1);
    expect(agg.counts.sent).toBe(1);
    expect(agg.counts.opened).toBe(1);
  });

  it("honours the since window", () => {
    const agg = aggregateEmailEvents(events, LINKS, {
      workspaceId: "ws_1",
      since: "2026-10-20T00:00:00.000Z",
    });
    expect(agg.counts.sent).toBe(0);
    expect(agg.eventCount).toBe(0);
  });
});

describe("aggregateEmailEvents — tenant scoping (the isolation proof)", () => {
  const events: EmailEventRecord[] = [
    evt({ provider_event_id: "a1", event_type: "email.sent", provider_message_id: "pm_1" }),
    evt({ provider_event_id: "a2", event_type: "email.delivered", provider_message_id: "pm_other" }),
    evt({ provider_event_id: "a3", event_type: "email.opened", provider_message_id: "pm_unknown" }),
    evt({ provider_event_id: "a4", event_type: "email.opened", provider_message_id: null }),
  ];

  it("another workspace's events are never counted", () => {
    const agg = aggregateEmailEvents(events, LINKS, { workspaceId: "ws_1" });
    expect(agg.counts.sent).toBe(1);
    expect(agg.counts.delivered).toBe(0);
    expect(agg.counts.opened).toBe(0); // pm_unknown resolves nowhere
    expect(agg.eventCount).toBe(1);
  });

  it("the other workspace sees exactly its own event", () => {
    const agg = aggregateEmailEvents(events, LINKS, { workspaceId: "ws_2" });
    expect(agg.counts.delivered).toBe(1);
    expect(agg.counts.sent).toBe(1); // delivered proves the send for its owner
    expect(agg.eventCount).toBe(1);
  });

  it("platform scope (admin only) counts every attributable event", () => {
    const agg = aggregateEmailEvents(events, LINKS, {});
    // a4 carries no provider message id at all: it can appear in the
    // webhook LOG but can never be aggregated (nothing to attribute
    // or dedupe it against), at any scope.
    expect(agg.eventCount).toBe(3);
    expect(agg.counts.opened).toBe(1); // a3, unattributed but countable here
    expect(agg.counts.sent).toBe(2);
    expect(agg.counts.delivered).toBe(2);
  });

  it("empty input is an honest zero set with null rates — never invented numbers", () => {
    const agg = aggregateEmailEvents([], [], { workspaceId: "ws_1" });
    expect(agg.counts).toEqual({
      sent: 0, delivered: 0, bounced: 0, complained: 0, opened: 0, clicked: 0, received: 0,
    });
    expect(agg.rates).toEqual({
      deliveryRate: null, bounceRate: null, complaintRate: null, openRate: null, clickRate: null,
    });
  });
});

describe("shapeWebhookLog — unrouted mail becomes visible", () => {
  const links: MessageLink[] = [
    link({ provider_message_id: "pm_out" }),
    link({ provider_message_id: "pm_in", direction: "inbound", status: "received" }),
  ];
  const events: EmailEventRecord[] = [
    evt({ provider_event_id: "w1", event_type: "email.received", provider_message_id: "pm_in", received_at: "2026-10-19T12:00:00.000Z", payload: { data: { from: "elena@scalewave.io", subject: "Re: Hi" } } }),
    evt({ provider_event_id: "w2", event_type: "email.received", provider_message_id: "pm_stranger", received_at: "2026-10-19T11:00:00.000Z", payload: { data: { from: "stranger@example.com" } } }),
    evt({ provider_event_id: "w3", event_type: "email.delivered", provider_message_id: "pm_out", received_at: "2026-10-19T10:00:00.000Z" }),
    evt({ provider_event_id: "w4", event_type: "email.opened", provider_message_id: "pm_ghost", received_at: "2026-10-19T09:00:00.000Z" }),
  ];

  it("classifies routed / unrouted / linked / unmatched, newest first", () => {
    const log = shapeWebhookLog(events, links, 50);
    expect(log.map((e) => [e.id, e.routing])).toEqual([
      ["w1", "routed"],
      ["w2", "unrouted"],
      ["w3", "linked"],
      ["w4", "unmatched"],
    ]);
    expect(log[0].workspace_id).toBe("ws_1");
    expect(log[1].workspace_id).toBeNull();
    expect(log[0].detail).toContain("elena@scalewave.io");
  });

  it("respects the limit", () => {
    expect(shapeWebhookLog(events, links, 2)).toHaveLength(2);
  });
});

describe("deriveReplySyncStatus — never claims Healthy", () => {
  it("no events at all → no_events with the honest message", () => {
    const s = deriveReplySyncStatus([], [], false, new Date("2026-10-20T00:00:00Z"));
    expect(s.status).toBe("no_events");
    expect(s.lastInboundAt).toBeNull();
    expect(s.message).toContain("No inbound events recorded yet");
    expect(JSON.stringify(s).toLowerCase()).not.toContain("healthy");
  });

  it("outbound events only → still no_events for inbound", () => {
    const s = deriveReplySyncStatus(
      [evt({ event_type: "email.delivered" })],
      LINKS,
      true,
      new Date("2026-10-20T00:00:00Z")
    );
    expect(s.status).toBe("no_events");
    expect(s.lastEventAt).not.toBeNull();
    expect(s.webhookSecretConfigured).toBe(true);
  });

  it("a recent routed reply → receiving, with routing reported", () => {
    const links = [link({ provider_message_id: "pm_in", direction: "inbound" })];
    const s = deriveReplySyncStatus(
      [evt({ provider_event_id: "r1", event_type: "email.received", provider_message_id: "pm_in", received_at: "2026-10-19T10:00:00.000Z" })],
      links,
      true,
      new Date("2026-10-20T00:00:00Z")
    );
    expect(s.status).toBe("receiving");
    expect(s.lastInboundRouting).toBe("routed");
  });

  it("an old unrouted reply → quiet, routing unrouted", () => {
    const s = deriveReplySyncStatus(
      [evt({ provider_event_id: "r2", event_type: "email.received", provider_message_id: "pm_none", received_at: "2026-08-01T10:00:00.000Z" })],
      [],
      false,
      new Date("2026-10-20T00:00:00Z")
    );
    expect(s.status).toBe("quiet");
    expect(s.lastInboundRouting).toBe("unrouted");
  });
});

describe("deriveSimulatedEmailData — demo derivation stays labelled simulated", () => {
  const messages = [
    { id: "m1", workspace_id: "ws_demo", campaign_id: "cmp_1", channel: "email", direction: "outbound", status: "opened", sent_at: "2026-10-19T09:00:00.000Z", is_demo: true, provider_message_id: null },
    { id: "m2", workspace_id: "ws_demo", campaign_id: "cmp_1", channel: "email", direction: "outbound", status: "bounced", sent_at: "2026-10-19T09:05:00.000Z", is_demo: true, provider_message_id: null },
    { id: "m3", workspace_id: "ws_demo", campaign_id: "cmp_1", channel: "email", direction: "inbound", status: "received", sent_at: "2026-10-19T10:00:00.000Z", is_demo: true, provider_message_id: "demo-rcv-1" },
    { id: "m4", workspace_id: "ws_demo", campaign_id: "cmp_1", channel: "linkedin", direction: "outbound", status: "delivered", sent_at: "2026-10-19T09:00:00.000Z", is_demo: true, provider_message_id: null },
    { id: "m5", workspace_id: "ws_demo", campaign_id: "cmp_1", channel: "email", direction: "outbound", status: "failed", sent_at: "2026-10-19T09:10:00.000Z", is_demo: true, provider_message_id: null },
  ];

  it("derives the event chain each status implies, email channel only", () => {
    const { events, links } = deriveSimulatedEmailData(messages);
    // m1: sent+delivered+opened · m2: sent+bounced · m3: received · m4 skipped (linkedin) · m5: none (failed = never accepted)
    expect(events.map((e) => e.event_type).sort()).toEqual([
      "email.bounced", "email.delivered", "email.opened", "email.received", "email.sent", "email.sent",
    ]);
    expect(links).toHaveLength(4);
    expect(links.every((l) => l.is_demo)).toBe(true);
  });

  it("aggregates through the same scoping code with simulated counts", () => {
    const { events, links } = deriveSimulatedEmailData(messages);
    const agg = aggregateEmailEvents(events, links, { workspaceId: "ws_demo" });
    expect(agg.counts).toEqual({
      sent: 2, delivered: 1, bounced: 1, complained: 0, opened: 1, clicked: 0, received: 1,
    });
  });

  it("keeps a real provider_message_id when the demo message carries one", () => {
    const { links } = deriveSimulatedEmailData(messages);
    expect(links.map((l) => l.provider_message_id)).toContain("demo-rcv-1");
  });
});
