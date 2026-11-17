/**
 * Activity route wrapper test — in this test environment no
 * Supabase is configured, so the app is in Demo Mode and the route
 * must refuse before any audit read (fail closed).
 */
import { describe, it, expect } from "vitest";
import { GET } from "../route";
import { activityActionFilter } from "@/lib/muse-connector/activity-filter";

describe("GET /api/muse/activity (wrapper)", () => {
  it("refuses in Demo Mode", async () => {
    const res = await GET(new Request("http://localhost:3000/api/muse/activity"));
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toContain("Demo Mode");
  });

  it("refuses in Demo Mode with ?platform=zapier too", async () => {
    const res = await GET(
      new Request("http://localhost:3000/api/muse/activity?platform=zapier")
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toContain("Demo Mode");
  });
});

describe("activityActionFilter", () => {
  it("defaults to Muse + OAuth-server rows", () => {
    expect(activityActionFilter(null)).toBe(
      "action.ilike.muse.%,action.ilike.MUSE_OAUTH%"
    );
    expect(activityActionFilter("muse")).toBe(
      "action.ilike.muse.%,action.ilike.MUSE_OAUTH%"
    );
  });

  it("returns only zapier.* rows for platform=zapier", () => {
    expect(activityActionFilter("zapier")).toBe("action.ilike.zapier.%");
  });

  it("returns only n8n.* rows for platform=n8n", () => {
    expect(activityActionFilter("n8n")).toBe("action.ilike.n8n.%");
  });

  it("falls back to the default filter for unknown platforms", () => {
    expect(activityActionFilter("unknown")).toBe(
      "action.ilike.muse.%,action.ilike.MUSE_OAUTH%"
    );
  });
});
