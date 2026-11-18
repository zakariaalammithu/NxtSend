/**
 * HotHawk adapter tests — MOCK TESTED ONLY.
 * All payloads below are MOCK responses shaped like HotHawk's
 * documented responses (https://hothawk.ai/developers and
 * https://api.hothawk.ai/docs/public). No real network, no real
 * credentials: the API key is a placeholder.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Lead } from "@/types";
import { createHotHawkAdapter } from "../adapter";
import {
  fetchCalls,
  firstRequestUrl,
  jsonResponse,
  mockFetchQueue,
} from "../../../test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead_1",
    workspace_id: "ws_1",
    first_name: "Jane",
    last_name: "Example",
    email: "jane@example.com",
    linkedin_url: "https://www.linkedin.com/in/jane-example",
    company: "Example Ltd",
    job_title: "VP Sales",
    status: "new",
    tags: [],
    custom_fields: {},
    created_at: "2026-11-19T00:00:00.000Z",
    ...overrides,
  };
}

// MOCK — shaped like a HotHawk LeadDto from the OpenAPI spec.
const MOCK_LEAD_DTO = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  firstName: "Jane",
  lastName: "Example",
  email: "jane@example.com",
  linkedinProfileUrl: "https://www.linkedin.com/in/jane-example",
  jobTitle: "VP Sales",
  phoneNumber: "+1-555-0100",
  workspaceId: "ws_1",
  teamId: "team_1",
  companyId: null,
  createdAt: "2026-11-19T00:00:00.000Z",
  updatedAt: "2026-11-19T00:00:00.000Z",
  campaignStatus: "not_contacted",
};

describe("createHotHawkAdapter (MOCK TESTED)", () => {
  it("testConnection GETs /v1/workspaces with a Bearer key", async () => {
    const spy = mockFetchQueue([jsonResponse({ data: [{ id: "ws_1" }] })]);
    const adapter = createHotHawkAdapter({
      credential: { apiKey: "hh_test" },
      workspaceId: "ws_1",
    });
    const result = await adapter.testConnection();
    expect(result.ok).toBe(true);
    expect(firstRequestUrl(spy)).toContain("/v1/workspaces");
    const init = fetchCalls(spy)[0][1];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer hh_test"
    );
    expect(firstRequestUrl(spy)).not.toContain("hh_test");
  });

  it("listCampaigns reads the data array and maps id/name/status", async () => {
    mockFetchQueue([
      jsonResponse({
        data: [{ id: "camp_1", name: "Q4 Outreach", status: "active" }],
      }),
    ]);
    const adapter = createHotHawkAdapter({
      credential: { apiKey: "hh_test" },
      workspaceId: "ws_1",
    });
    const campaigns = await adapter.listCampaigns();
    expect(campaigns).toEqual([{ id: "camp_1", name: "Q4 Outreach", status: "active" }]);
  });

  it("createLead posts workspaceId + email + name to /v1/crm/leads", async () => {
    const spy = mockFetchQueue([jsonResponse(MOCK_LEAD_DTO)]);
    const adapter = createHotHawkAdapter({
      credential: { apiKey: "hh_test" },
      workspaceId: "ws_1",
    });
    const lead = await adapter.createLead({
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Example",
      jobTitle: "VP Sales",
    });
    expect(firstRequestUrl(spy)).toContain("/v1/crm/leads");
    const body = JSON.parse(fetchCalls(spy)[0][1].body as string);
    expect(body.workspaceId).toBe("ws_1");
    expect(body.email).toBe("jane@example.com");
    expect(body.name).toBe("Jane Example");
    expect(lead.id).toBe(MOCK_LEAD_DTO.id);
    expect(lead.email).toBe("jane@example.com");
  });

  it("sendLeadsToEmailCampaign imports qualified leads via POST /v1/crm/leads/import", async () => {
    const spy = mockFetchQueue([jsonResponse({})]);
    const adapter = createHotHawkAdapter({
      credential: { apiKey: "hh_test" },
      workspaceId: "ws_1",
      isSuppressed: async () => false,
    });
    const result = await adapter.sendLeadsToEmailCampaign({
      campaignId: "camp_1",
      leads: [mockLead(), mockLead({ id: "lead_2", email: undefined })],
    });
    expect(firstRequestUrl(spy)).toContain("/v1/crm/leads/import");
    const body = JSON.parse(fetchCalls(spy)[0][1].body as string);
    expect(body.workspaceId).toBe("ws_1");
    // The no-email lead is skipped by qualifyLeads; only one record is sent.
    expect(body.records).toHaveLength(1);
    expect(body.records[0].email).toBe("jane@example.com");
    expect(body.records[0].linkedinProfileUrl).toContain("linkedin.com");
    expect(result.processed).toBe(2);
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("sendLeadsToEmailCampaign throws without a suppression checker (fail closed)", async () => {
    const adapter = createHotHawkAdapter({
      credential: { apiKey: "hh_test" },
      workspaceId: "ws_1",
    });
    await expect(
      adapter.sendLeadsToEmailCampaign({ campaignId: "camp_1", leads: [mockLead()] })
    ).rejects.toThrow(/suppression/i);
  });

  it("enrolLeadsIntoCampaign is config-ready and makes no call", async () => {
    const spy = mockFetchQueue([]);
    const adapter = createHotHawkAdapter({
      credential: { apiKey: "hh_test" },
      workspaceId: "ws_1",
    });
    await expect(
      adapter.enrolLeadsIntoCampaign("camp_1", ["lead_1"])
    ).rejects.toMatchObject({ code: "provider_config_ready" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("throws when no API key is supplied", () => {
    expect(() => createHotHawkAdapter({ credential: {} })).toThrow();
  });
});
