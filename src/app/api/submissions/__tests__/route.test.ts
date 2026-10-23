import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * POST /api/submissions (P10 Stage C additions).
 *
 * The storage/notification service is fixture-mocked; validation,
 * honeypot and rate limiting run for real. Contract under test:
 *   - honeypot tripped → 201 generic success shape, NOTHING stored,
 *     NOTHING sent (indistinguishable from a real success)
 *   - valid contact → stored, then notification attempted
 *   - valid demo booking → stored, notification NEVER attempted
 *   - over-limit field → 400, nothing stored
 */

const service = vi.hoisted(() => ({
  createSubmissionRecord: vi.fn(),
  notifyContactSubmission: vi.fn(),
}));

vi.mock("@/lib/admin/platform-server", () => ({
  createSubmissionRecord: service.createSubmissionRecord,
  notifyContactSubmission: service.notifyContactSubmission,
}));

import { POST } from "../route";

let ipCounter = 0;

function post(body: unknown): NextRequest {
  ipCounter += 1;
  return new NextRequest("http://localhost:3000/api/submissions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Unique IP per call: the route's rate limiter is module state.
      "x-forwarded-for": `203.0.113.${ipCounter}`,
    },
    body: JSON.stringify(body),
  });
}

const VALID_CONTACT = {
  source: "contact",
  name: "Priya Sharma",
  email: "priya@example.com",
  subject: "Pricing question",
  message: "Hello, I would like to know more about agency pricing.",
};

beforeEach(() => {
  vi.clearAllMocks();
  service.createSubmissionRecord.mockResolvedValue({
    id: "sub-fixture-1",
    mode: "demo",
  });
  service.notifyContactSubmission.mockResolvedValue("simulated");
});

describe("POST /api/submissions", () => {
  it("stores a valid contact submission and attempts the notification", async () => {
    const res = await POST(post(VALID_CONTACT));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; id: string };
    expect(body.ok).toBe(true);
    expect(body.id).toBe("sub-fixture-1");
    expect(service.createSubmissionRecord).toHaveBeenCalledTimes(1);
    expect(service.notifyContactSubmission).toHaveBeenCalledTimes(1);
    expect(service.notifyContactSubmission).toHaveBeenCalledWith(
      "demo",
      expect.objectContaining({ id: "sub-fixture-1", source: "contact" })
    );
  });

  it("never notifies for demo bookings", async () => {
    const res = await POST(
      post({
        source: "demo",
        name: "Tom Lee",
        email: "tom@corp.io",
        message: "Please book me a product demo next week.",
      })
    );
    expect(res.status).toBe(201);
    expect(service.createSubmissionRecord).toHaveBeenCalledTimes(1);
    expect(service.notifyContactSubmission).not.toHaveBeenCalled();
  });

  it("honeypot: generic success shape, nothing stored, nothing sent", async () => {
    const res = await POST(post({ ...VALID_CONTACT, website: "http://spam.example" }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; id: unknown };
    expect(body.ok).toBe(true);
    expect(typeof body.id).toBe("string");
    expect(service.createSubmissionRecord).not.toHaveBeenCalled();
    expect(service.notifyContactSubmission).not.toHaveBeenCalled();
  });

  it("an empty honeypot value does not trip the trap", async () => {
    const res = await POST(post({ ...VALID_CONTACT, website: "" }));
    expect(res.status).toBe(201);
    expect(service.createSubmissionRecord).toHaveBeenCalledTimes(1);
  });

  it("rejects an over-limit message with 400 and stores nothing", async () => {
    const res = await POST(
      post({ ...VALID_CONTACT, message: "x".repeat(5001) })
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fields?: Record<string, string> };
    expect(body.fields?.message).toMatch(/at most 5000/);
    expect(service.createSubmissionRecord).not.toHaveBeenCalled();
    expect(service.notifyContactSubmission).not.toHaveBeenCalled();
  });
});
