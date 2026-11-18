/**
 * Trigify adapter tests — provider blocked (shut down).
 * No network: every operation must refuse with
 * provider_unavailable, because Trigify ceased operations on
 * 22 October 2026.
 */

import { describe, it, expect } from "vitest";
import { createTrigifyAdapter } from "../adapter";

describe("Trigify adapter (provider blocked — shut down)", () => {
  it("refuses enrichment — provider shut down", async () => {
    const adapter = createTrigifyAdapter();
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

  it("identifies itself as trigify", () => {
    expect(createTrigifyAdapter().provider).toBe("trigify");
  });
});
