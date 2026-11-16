/**
 * Session subscriptions route wrapper test — in this test
 * environment no Supabase is configured, so the app is in Demo
 * Mode and the route must refuse before any outbox read
 * (fail closed).
 */
import { describe, it, expect } from "vitest";
import { GET } from "../route";

describe("GET /api/integrations/zapier/subscriptions (wrapper)", () => {
  it("refuses in Demo Mode", async () => {
    const res = await GET();
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toContain("Demo Mode");
  });
});
