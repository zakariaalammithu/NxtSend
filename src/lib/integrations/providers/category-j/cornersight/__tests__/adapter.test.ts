/**
 * Cornersight adapter tests — MOCK TESTED ONLY.
 * All payloads below are MOCK responses shaped like Cornersight's
 * documented responses (https://app.cornersight.io/docs and
 * https://app.cornersight.io/openapi.json). No real network, no
 * real credentials: the API key is a placeholder.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCornersightAdapter,
  cornersightRowToLead,
} from "../adapter";
import {
  fetchCalls,
  firstRequestUrl,
  instantSleep,
  jsonResponse,
  mockFetchQueue,
} from "../../../test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// MOCK — shaped like a Cornersight GET /api/v1/leads row.
const MOCK_LEAD_ROW = {
  id: "lead_123",
  profileId: "profile_456",
  name: "Dana Reyes",
  linkedinUsername: "dana-reyes",
  linkedinUrl: "https://www.linkedin.com/in/dana-reyes",
  avatarUrl: "https://example.com/avatar.jpg",
  jobTitle: "Head of Sales",
  company: "Example Ltd",
  companyDomain: "example.com",
  country: "United Kingdom",
  engagementType: "Comment",
  commentText: "Great post!",
  commentPostedAt: "2026-11-18T10:00:00.000Z",
  isIcp: true,
  webhookStatus: "delivered",
  postUrl: "https://www.linkedin.com/posts/example",
  postPostedAt: "2026-11-18T09:00:00.000Z",
  detectedAt: "2026-11-18T10:05:00.000Z",
  createdAt: "2026-11-18T10:05:00.000Z",
};

describe("cornersightRowToLead (MOCK TESTED)", () => {
  it("maps a documented lead row; email stays undefined (Cornersight supplies none)", () => {
    const lead = cornersightRowToLead(MOCK_LEAD_ROW);
    expect(lead.firstName).toBe("Dana");
    expect(lead.lastName).toBe("Reyes");
    expect(lead.linkedinUrl).toBe("https://www.linkedin.com/in/dana-reyes");
    expect(lead.jobTitle).toBe("Head of Sales");
    expect(lead.company).toBe("Example Ltd");
    expect(lead.companyDomain).toBe("example.com");
    expect(lead.country).toBe("United Kingdom");
    expect(lead.email).toBeUndefined();
    expect(lead.tags).toContain("cornersight-icp");
    expect(lead.tags).toContain("engagement:comment");
  });
});

describe("createCornersightAdapter (MOCK TESTED)", () => {
  it("listLeads sends X-API-Key (never in the URL) and pages", async () => {
    const spy = mockFetchQueue([
      jsonResponse({
        data: [MOCK_LEAD_ROW],
        total: 1,
        limit: 50,
        offset: 0,
        hasMore: false,
      }),
    ]);
    const adapter = createCornersightAdapter({ apiKey: "cs_test" });
    const page = await adapter.listLeads({ isIcp: true, limit: 50 });

    expect(firstRequestUrl(spy)).toContain("/api/v1/leads");
    expect(firstRequestUrl(spy)).toContain("isIcp=true");
    expect(firstRequestUrl(spy)).not.toContain("cs_test");
    const init = fetchCalls(spy)[0][1];
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("cs_test");
    expect(page.leads).toHaveLength(1);
    expect(page.leads[0].firstName).toBe("Dana");
    expect(page.total).toBe(1);
    expect(page.hasMore).toBe(false);
  });

  it("listEngagers reads /api/v1/engagers", async () => {
    const spy = mockFetchQueue([
      jsonResponse({
        data: [{ ...MOCK_LEAD_ROW, engagementCount: 5 }],
        total: 1,
        limit: 50,
        offset: 0,
        hasMore: false,
      }),
    ]);
    const adapter = createCornersightAdapter({ apiKey: "cs_test" });
    const page = await adapter.listEngagers({ minEngagements: 2 });
    expect(firstRequestUrl(spy)).toContain("/api/v1/engagers");
    expect(firstRequestUrl(spy)).toContain("minEngagements=2");
    expect(page.leads).toHaveLength(1);
  });

  it("enrichProfile starts a job and waitForJob polls to completed", async () => {
    mockFetchQueue([
      jsonResponse({ jobId: "job_1" }),
      jsonResponse({ status: "processing" }),
      jsonResponse({ status: "completed" }),
    ]);
    const adapter = createCornersightAdapter({
      apiKey: "cs_test",
      pollDelayMs: 0,
      sleep: () => instantSleep(),
    });
    const { jobId } = await adapter.enrichProfile("dana-reyes");
    expect(jobId).toBe("job_1");
    const status = await adapter.waitForJob(jobId);
    expect(status.status).toBe("completed");
  });

  it("getCreditBalance returns the documented remaining field", async () => {
    mockFetchQueue([
      jsonResponse({ balance: 100, used: 20, limit: 120, remaining: 100 }),
    ]);
    const adapter = createCornersightAdapter({ apiKey: "cs_test" });
    expect(await adapter.getCreditBalance()).toBe(100);
  });

  it("testConnection reports ok on 2xx and a detail on failure", async () => {
    mockFetchQueue([jsonResponse({ remaining: 5 })]);
    const adapter = createCornersightAdapter({ apiKey: "cs_test" });
    const ok = await adapter.testConnection();
    expect(ok.ok).toBe(true);

    mockFetchQueue([jsonResponse({ error: "forbidden" }, 403)]);
    const bad = await adapter.testConnection();
    expect(bad.ok).toBe(false);
    expect(bad.detail.length).toBeGreaterThan(0);
  });

  it("throws when no API key is supplied", () => {
    expect(() => createCornersightAdapter({ apiKey: "" })).toThrow();
  });
});
