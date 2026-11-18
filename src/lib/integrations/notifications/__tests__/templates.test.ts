/**
 * Tests for the shared notification message templates.
 *
 * Pure functions only — no network, no credentials, no mocks.
 */

import { describe, expect, it } from "vitest";
import {
  buildNotificationMessage,
  notificationEventLabel,
  type NotificationEventInput,
} from "../templates";

describe("buildNotificationMessage", () => {
  it("renders a new-lead alert with name, email and company", () => {
    const msg = buildNotificationMessage({
      type: "lead.created",
      leadName: "Ada Lovelace",
      leadEmail: "ada@example.com",
      leadCompany: "Analytical Engines Ltd",
    });
    expect(msg).not.toBeNull();
    expect(msg!.title).toContain("New lead");
    expect(msg!.text).toContain("Ada Lovelace");
    expect(msg!.text).toContain("ada@example.com");
    expect(msg!.text).toContain("Analytical Engines Ltd");
  });

  it("renders a new-lead alert without an email or company", () => {
    const msg = buildNotificationMessage({ type: "lead.created", leadName: "Grace Hopper" });
    expect(msg).not.toBeNull();
    expect(msg!.text).toContain("Grace Hopper");
    expect(msg!.text).not.toContain("(");
  });

  it("renders a new-reply alert with the snippet", () => {
    const msg = buildNotificationMessage({
      type: "conversation.reply_created",
      leadName: "Ada Lovelace",
      replySnippet: "Yes, let's talk next Tuesday.",
    });
    expect(msg).not.toBeNull();
    expect(msg!.title).toContain("New reply");
    expect(msg!.text).toContain("Ada Lovelace");
    expect(msg!.text).toContain("Yes, let's talk next Tuesday.");
  });

  it("renders an interested-lead alert", () => {
    const msg = buildNotificationMessage({
      type: "lead.interested",
      leadName: "Ada Lovelace",
      leadEmail: "ada@example.com",
    });
    expect(msg).not.toBeNull();
    expect(msg!.title).toContain("Interested lead");
    expect(msg!.text).toContain("Ada Lovelace");
    expect(msg!.text).toContain("interested");
  });

  it("renders a campaign-status alert", () => {
    const msg = buildNotificationMessage({
      type: "campaign.status_changed",
      campaignName: "Q4 Outreach",
      campaignStatus: "paused",
    });
    expect(msg).not.toBeNull();
    expect(msg!.title).toContain("Campaign");
    expect(msg!.text).toContain("Q4 Outreach");
    expect(msg!.text).toContain("paused");
  });

  it("renders a daily report with counts", () => {
    const msg = buildNotificationMessage({
      type: "daily.report",
      stats: { newLeads: 12, replies: 4, interestedLeads: 2, activeCampaigns: 3 },
    });
    expect(msg).not.toBeNull();
    expect(msg!.title).toContain("daily report");
    expect(msg!.text).toContain("New leads: 12");
    expect(msg!.text).toContain("Replies: 4");
    expect(msg!.text).toContain("Interested leads: 2");
    expect(msg!.text).toContain("Active campaigns: 3");
  });

  it("renders a sync error alert with source and message", () => {
    const msg = buildNotificationMessage({
      type: "sync.error",
      errorSource: "airtable",
      errorMessage: "401 Unauthorized",
    });
    expect(msg).not.toBeNull();
    expect(msg!.title).toContain("Sync error");
    expect(msg!.text).toContain("airtable");
    expect(msg!.text).toContain("401 Unauthorized");
  });

  it("includes the workspace name and app URL when given", () => {
    const msg = buildNotificationMessage({
      type: "lead.created",
      leadName: "Ada Lovelace",
      workspaceName: "Acme",
      appUrl: "https://nxtsend.com/leads",
    });
    expect(msg).not.toBeNull();
    expect(msg!.text).toContain("Workspace: Acme");
    expect(msg!.text).toContain("https://nxtsend.com/leads");
  });

  it("never throws on a minimal payload", () => {
    const msg = buildNotificationMessage({ type: "lead.created" });
    expect(msg).not.toBeNull();
    expect(msg!.title).toBeTruthy();
    expect(msg!.text).toBeTruthy();
  });

  it("returns null for an unknown event type", () => {
    const msg = buildNotificationMessage({ type: "bogus.event" } as unknown as NotificationEventInput);
    expect(msg).toBeNull();
  });
});

describe("notificationEventLabel", () => {
  it("labels every event type", () => {
    expect(notificationEventLabel("lead.created")).toBe("New lead");
    expect(notificationEventLabel("conversation.reply_created")).toBe("New reply");
    expect(notificationEventLabel("lead.interested")).toBe("Interested lead");
    expect(notificationEventLabel("campaign.status_changed")).toBe("Campaign status change");
    expect(notificationEventLabel("daily.report")).toBe("Daily report");
    expect(notificationEventLabel("sync.error")).toBe("Sync / delivery error");
  });
});
