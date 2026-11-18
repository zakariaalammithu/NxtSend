/**
 * Mocked tests only — no real network, no credentials.
 * global fetch is stubbed per test; ProviderHttpClient drives it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CALENDAR_CONFIG } from "../config";
import { createCalendarAdapter, mapLeadToCalendar, mapCalendarToLead } from "../adapter";
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Google Calendar adapter", () => {
  it("maps a lead to the provider shape and back without losing fields", () => {
    const lead = {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      company: "Analytical Engines Ltd",
      jobTitle: "Mathematician",
      linkedinUrl: "https://www.linkedin.com/in/adalovelace",
      tags: ["interested", "uk"],
      status: "new",
    };
    const record = mapLeadToCalendar(lead, {});
    const back = mapCalendarToLead(record, {});
    expect(back.firstName).toBe("Ada");
    expect(back.lastName).toBe("Lovelace");
    expect(back.email).toBe("ada@example.com");
    expect(back.company).toBe("Analytical Engines Ltd");
    expect(record.summary).toBe("Follow up: Ada Lovelace (Analytical Engines Ltd)");
    expect(record.durationMinutes).toBe(30);
    expect(back.email).toBe("ada@example.com");
  });

  it("exportLeads and importLeads throw clear not-supported errors", async () => {
    const adapter = createCalendarAdapter({ credential: { accessToken: "ya29.test" }, settings: {} });
    await expect(adapter.exportLeads([{ firstName: "Ada" }])).rejects.toThrow("not supported");
    await expect(adapter.importLeads()).rejects.toThrow("not supported");
  });

  it("creates a follow-up event with the lead as attendee", async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse({ id: "evt123", htmlLink: "https://calendar.google.com/event?eid=evt123" })
    );
    vi.stubGlobal("fetch", fetchSpy);
    const adapter = createCalendarAdapter({
      credential: { accessToken: "ya29.test" },
      settings: { calendarId: "primary", durationMinutes: 30, timeZone: "UTC" },
    });
    const task = await adapter.createTaskFromLead(
      { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", company: "Analytical Engines Ltd" },
      { dueDate: "2026-11-25T10:00:00.000Z" }
    );
    expect(task?.id).toBe("evt123");
    expect(task?.url).toContain("calendar.google.com");
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    const body = JSON.parse(String(init.body));
    expect(body.summary).toContain("Ada Lovelace");
    expect(body.attendees).toEqual([{ email: "ada@example.com" }]);
    expect(body.start.dateTime).toBe("2026-11-25T10:00:00.000Z");
    expect(body.end.dateTime).toBe("2026-11-25T10:30:00.000Z");
  });

  it("throws configuration_required when the token is missing", async () => {
    const adapter = createCalendarAdapter({ credential: null, settings: {} });
    expect(adapter.checkConfiguration().configured).toBe(false);
    await expect(
      adapter.createTaskFromLead({ firstName: "Ada" })
    ).rejects.toThrow("configuration_required");
  });

  it("config declares honest metadata", () => {
    expect(CALENDAR_CONFIG.id).toBe("google-calendar");
    expect(CALENDAR_CONFIG.authType).toBe("oauth2");
    expect(CALENDAR_CONFIG.capabilities.length).toBeGreaterThan(0);
    expect(CALENDAR_CONFIG.setupSteps.length).toBeGreaterThan(0);
  });
});
