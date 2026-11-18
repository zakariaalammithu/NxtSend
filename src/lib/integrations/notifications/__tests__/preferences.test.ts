/**
 * Tests for notification preferences (shape, defaults, parsing).
 *
 * Pure functions only — no network, no credentials, no mocks.
 */

import { describe, expect, it } from "vitest";
import {
  defaultNotificationChannels,
  defaultNotificationPreferences,
  parseNotificationPreferences,
  resolveNotificationChannels,
  type NotificationPreferences,
} from "../preferences";

describe("defaultNotificationPreferences", () => {
  it("is enabled, has every event with no channels, daily report at 09:00", () => {
    const prefs = defaultNotificationPreferences("ws-1");
    expect(prefs.workspaceId).toBe("ws-1");
    expect(prefs.enabled).toBe(true);
    expect(prefs.dailyReportHour).toBe(9);
    expect(prefs.updatedAt).toBeTruthy();
    for (const event of Object.keys(prefs.channels)) {
      expect(prefs.channels[event as keyof typeof prefs.channels]).toEqual([]);
    }
  });

  it("returns a fresh object per call", () => {
    const a = defaultNotificationPreferences("ws-1");
    const b = defaultNotificationPreferences("ws-1");
    a.channels["lead.created"].push("slack");
    expect(b.channels["lead.created"]).toEqual([]);
  });
});

describe("defaultNotificationChannels", () => {
  it("covers all six event types with empty lists", () => {
    const channels = defaultNotificationChannels();
    expect(Object.keys(channels).sort()).toEqual([
      "campaign.status_changed",
      "conversation.reply_created",
      "daily.report",
      "lead.created",
      "lead.interested",
      "sync.error",
    ]);
  });
});

describe("parseNotificationPreferences", () => {
  it("keeps a stored enabled flag and channels", () => {
    const parsed = parseNotificationPreferences("ws-1", {
      enabled: false,
      channels: { "lead.created": ["slack", "telegram"] },
      dailyReportHour: 18,
    });
    expect(parsed.workspaceId).toBe("ws-1");
    expect(parsed.enabled).toBe(false);
    expect(parsed.channels["lead.created"]).toEqual(["slack", "telegram"]);
    expect(parsed.channels["sync.error"]).toEqual([]);
    expect(parsed.dailyReportHour).toBe(18);
  });

  it("drops unknown events and unknown channels", () => {
    const parsed = parseNotificationPreferences("ws-1", {
      enabled: true,
      channels: {
        "lead.created": ["slack", "carrier-pigeon"],
        "bogus.event": ["slack"],
      },
    });
    expect(parsed.channels["lead.created"]).toEqual(["slack"]);
    expect("bogus.event" in parsed.channels).toBe(false);
  });

  it("clamps the daily report hour to 0-23", () => {
    expect(parseNotificationPreferences("ws-1", { dailyReportHour: 27 }).dailyReportHour).toBe(23);
    expect(parseNotificationPreferences("ws-1", { dailyReportHour: -3 }).dailyReportHour).toBe(0);
    expect(parseNotificationPreferences("ws-1", { dailyReportHour: 18 }).dailyReportHour).toBe(18);
  });

  it("never throws on null, undefined or garbage input", () => {
    for (const raw of [null, undefined, "nope", 42, []]) {
      const parsed = parseNotificationPreferences("ws-1", raw);
      expect(parsed.workspaceId).toBe("ws-1");
      expect(parsed.enabled).toBe(true);
      expect(parsed.dailyReportHour).toBe(9);
    }
  });
});

describe("resolveNotificationChannels", () => {
  it("returns the enabled channels for an event", () => {
    const prefs: NotificationPreferences = {
      ...defaultNotificationPreferences("ws-1"),
      channels: {
        ...defaultNotificationChannels(),
        "lead.created": ["slack", "telegram"],
      },
    };
    expect(resolveNotificationChannels(prefs, "lead.created")).toEqual(["slack", "telegram"]);
  });

  it("returns an empty list when the master switch is off", () => {
    const prefs: NotificationPreferences = {
      ...defaultNotificationPreferences("ws-1"),
      enabled: false,
      channels: {
        ...defaultNotificationChannels(),
        "lead.created": ["slack"],
      },
    };
    expect(resolveNotificationChannels(prefs, "lead.created")).toEqual([]);
  });
});
