/**
 * Persana AI adapter tests — config-ready stub.
 * No network: every operation must refuse with
 * provider_endpoint_unverified until Persana publishes a public
 * API reference.
 */

import { describe, it, expect } from "vitest";
import { createPersanaAdapter } from "../adapter";

describe("Persana adapter (config-ready stub)", () => {
  it("refuses enrichment — endpoint unverified", async () => {
    const adapter = createPersanaAdapter();
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

  it("identifies itself as persana", () => {
    expect(createPersanaAdapter().provider).toBe("persana");
  });
});
