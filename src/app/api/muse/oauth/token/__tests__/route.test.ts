/**
 * Token route wrapper test — in this test environment no Supabase is
 * configured, so the app is in Demo Mode and the wrapper must refuse
 * before any store is touched (fail closed, no demo token issued).
 */
import { describe, it, expect } from "vitest";
import { POST } from "../route";

describe("POST /api/muse/oauth/token (wrapper)", () => {
  it("refuses in Demo Mode", async () => {
    const req = new Request("http://localhost:3000/api/muse/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: "x" }).toString(),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("invalid_grant");
  });
});
