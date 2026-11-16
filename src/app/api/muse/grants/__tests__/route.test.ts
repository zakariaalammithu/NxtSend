/**
 * Grants route wrapper tests — in this test environment no Supabase
 * is configured, so the app is in Demo Mode and both verbs must
 * refuse before any store is touched (fail closed, no grant data).
 */
import { describe, it, expect } from "vitest";
import { GET, DELETE, POST } from "../route";

const URL = "http://localhost:3000/api/muse/grants";

describe("GET /api/muse/grants (wrapper)", () => {
  it("refuses in Demo Mode", async () => {
    const res = await GET();
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toContain("Demo Mode");
  });
});

describe("DELETE / POST /api/muse/grants (wrapper)", () => {
  it("DELETE refuses in Demo Mode", async () => {
    const res = await DELETE(
      new Request(`${URL}?client_id=muse-client-a`, { method: "DELETE" })
    );
    expect(res.status).toBe(503);
  });

  it("POST refuses in Demo Mode", async () => {
    const res = await POST(
      new Request(URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_id: "muse-client-a" }),
      })
    );
    expect(res.status).toBe(503);
  });
});
