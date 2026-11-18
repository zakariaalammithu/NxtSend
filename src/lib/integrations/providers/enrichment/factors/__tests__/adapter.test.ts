/**
 * Factors.ai adapter tests — config-ready stub.
 * No network: every operation must refuse with
 * provider_endpoint_unverified until Factors.ai's API reference
 * is supplied.
 */

import { describe, it, expect } from "vitest";
import { createFactorsAdapter } from "../adapter";

describe("Factors.ai adapter (config-ready stub)", () => {
  it("refuses enrichment — endpoint unverified", async () => {
    const adapter = createFactorsAdapter();
    await expect(adapter.enrichLead({ email: "jane@acme.com" })).rejects.toMatchObject({
      code: "provider_endpoint_unverified",
    });
    await expect(adapter.enrichCompany({ domain: "acme.com" })).rejects.toMatchObject({
      code: "provider_endpoint_unverified",
    });
    await expect(adapter.findEmail({ firstName: "Jane", lastName: "Doe", domain: "acme.com" })).rejects.toMatchObject({
      code: "provider_endpoint_unverified",
    });
    await expect(adapter.getCreditBalance()).rejects.toMatchObject({
      code: "provider_endpoint_unverified",
    });
  });

  it("identifies itself as factors", () => {
    expect(createFactorsAdapter().provider).toBe("factors");
  });
});
