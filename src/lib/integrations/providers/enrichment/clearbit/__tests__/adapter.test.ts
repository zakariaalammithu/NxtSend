/**
 * Clearbit adapter tests — provider blocked.
 * No network: every operation must refuse with
 * provider_unavailable, because the standalone Clearbit API was
 * deprecated after HubSpot's acquisition.
 */

import { describe, it, expect } from "vitest";
import { createClearbitAdapter } from "../adapter";

describe("Clearbit adapter (provider blocked)", () => {
  it("refuses enrichment — standalone API deprecated", async () => {
    const adapter = createClearbitAdapter();
    await expect(adapter.enrichLead({ email: "jane@acme.com" })).rejects.toMatchObject({
      code: "provider_unavailable",
    });
    await expect(adapter.enrichCompany({ domain: "acme.com" })).rejects.toMatchObject({
      code: "provider_unavailable",
    });
    await expect(adapter.findEmail({ firstName: "Jane", lastName: "Doe", domain: "acme.com" })).rejects.toMatchObject({
      code: "provider_unavailable",
    });
    await expect(adapter.getCreditBalance()).rejects.toMatchObject({
      code: "provider_unavailable",
    });
  });

  it("identifies itself as clearbit", () => {
    expect(createClearbitAdapter().provider).toBe("clearbit");
  });
});
