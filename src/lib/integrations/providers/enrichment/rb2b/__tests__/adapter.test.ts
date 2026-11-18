/**
 * RB2B adapter tests — pure mapping, no network at all.
 * The payload below is a MOCK RB2B webhook payload shaped like
 * RB2B's documented visitor payload; it is not real RB2B data.
 */

import { describe, it, expect } from "vitest";
import {
  createRb2bAdapter,
  rb2bPayloadToLeadPatch,
  rb2bPayloadToResult,
} from "../adapter";

// MOCK — shaped like RB2B's documented webhook payload.
const MOCK_VISITOR = {
  email: "jane@acme.com",
  first_name: "Jane",
  last_name: "Doe",
  job_title: "VP Sales",
  company: "Acme",
  linkedin_url: "https://www.linkedin.com/in/jane-doe",
  city: "Austin",
  state: "TX",
  industry: "Software",
  employee_count: "51-200",
  pages_visited: ["/pricing", "/features"],
  tags: ["high-intent"],
};

describe("RB2B adapter", () => {
  it("maps a webhook visitor payload onto enrichment fields", () => {
    const result = rb2bPayloadToResult(MOCK_VISITOR);
    expect(result.matched).toBe(true);
    expect(result.fields.email?.value).toBe("jane@acme.com");
    expect(result.fields.job_title?.value).toBe("VP Sales");
    expect(result.fields.company?.value).toBe("Acme");
    expect(result.fields.location?.value).toBe("Austin, TX");
    expect(result.fields.pages_visited?.value).toEqual(["/pricing", "/features"]);
    expect(result.fields.email?.source).toBe("rb2b");
    expect(result.creditsUsed).toBe(0);
  });

  it("maps a payload onto a lead patch with direct columns + namespaced extras", () => {
    const patch = rb2bPayloadToLeadPatch(MOCK_VISITOR);
    expect(patch.email).toBe("jane@acme.com");
    expect(patch.job_title).toBe("VP Sales");
    expect(patch.company).toBe("Acme");
    const custom = patch.custom_fields as Record<string, unknown>;
    expect(custom.enrichment_rb2b).toBeDefined();
  });

  it("returns unmatched for an empty payload", () => {
    expect(rb2bPayloadToResult({}).matched).toBe(false);
  });

  it("refuses pull-based enrichment — RB2B has no query API", async () => {
    const adapter = createRb2bAdapter();
    await expect(adapter.enrichLead({ email: "jane@acme.com" })).rejects.toMatchObject({
      code: "provider_operation_unsupported",
    });
    await expect(adapter.bulkEnrich([], {
      workspaceId: "ws-1",
      syncJobStore: undefined as never,
    })).rejects.toMatchObject({ code: "provider_operation_unsupported" });
  });

  it("reports no credit balance endpoint", async () => {
    const adapter = createRb2bAdapter();
    await expect(adapter.getCreditBalance()).resolves.toBeNull();
  });
});
