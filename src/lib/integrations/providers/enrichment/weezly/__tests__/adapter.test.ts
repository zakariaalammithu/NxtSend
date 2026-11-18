/**
 * Weezly adapter tests — not implemented stub.
 * No network: every operation must refuse with
 * provider_endpoint_unverified, because no public Weezly
 * developer API could be found.
 */

import { describe, it, expect } from "vitest";
import { createWeezlyAdapter } from "../adapter";

describe("Weezly adapter (not implemented — no public API)", () => {
  it("refuses enrichment — endpoint unverified", async () => {
    const adapter = createWeezlyAdapter();
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

  it("identifies itself as weezly", () => {
    expect(createWeezlyAdapter().provider).toBe("weezly");
  });
});
